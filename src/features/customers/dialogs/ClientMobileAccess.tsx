// Veloria PoS — Clients : application mobile (V1 lecture seule).
// Extrait de `ClientDialogs.tsx` (découpage sans changement de comportement).
// Activation QR/PIN, révocation, mise en file des clichés vers le miroir.
// Le QR/code ne s'affiche qu'une fois pour la carte d'activation
// (condensats côté main, jamais en clair).
import { useEffect, useRef, useState } from "react";
import { Ban, RefreshCw, Smartphone } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import {
  accessActivateResultSchema,
  accessQrSvgResultSchema,
  accessStatusResultSchema,
  callChecked,
  syncEnqueueResultSchema,
} from "@shared/types/ipc-contracts.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { runBulk } from "@shared/ui/bulk-actions.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { businessMonthOf } from "@domain/common/business-day.ts";
import { selectDetailSaleIds } from "../../../application/customers/client-access.ts";
import { Badge, Button, Card, Field, TextInput } from "@shared/ui/primitives.tsx";
import { fullName, type EnrichedCustomer } from "../types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";

interface AccessStatus {
  active: boolean;
  revokedAt: string | null;
  failedAttempts: number;
  lockedUntil: string | null;
}

export function ClientMobileAccess({
  customer,
  notify,
}: {
  customer: EnrichedCustomer;
  notify: Notify;
}): React.JSX.Element {
  const [status, setStatus] = useState<AccessStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState<"activate" | "revoke" | "sync" | null>(null);
  const [card, setCard] = useState<{ phone: string; pin: string; code: string } | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const confirmAsync = useConfirm();
  const seq = useRef(0);

  const hasPhone = (customer.phone ?? "").trim().length > 0;

  async function reload(): Promise<void> {
    const my = (seq.current += 1);
    setStatusLoading(true);
    try {
      const res = await callChecked(
        (a) => a.customers.accessStatus({ id: customer.id }),
        accessStatusResultSchema,
      );
      if (seq.current !== my) return;
      setStatus(res.status);
    } catch (e) {
      if (seq.current !== my) return;
      setStatus(null);
      notify(frError(e, "État de l'application indisponible."), "err");
    } finally {
      if (seq.current === my) setStatusLoading(false);
    }
  }

  useEffect(() => {
    setCard(null);
    setQrSvg(null);
    setPin("");
    void reload();
    return () => {
      seq.current += 1;
    };
  }, [customer.id]);

  async function activate(): Promise<void> {
    if (!hasPhone) {
      notify("Ajoutez d'abord un téléphone à la fiche du client.", "err");
      return;
    }
    if (!/^[0-9]{6}$/.test(pin)) {
      notify("PIN invalide : 6 chiffres.", "err");
      return;
    }
    setBusy("activate");
    try {
      const res = await callChecked(
        (a) =>
          a.customers.accessActivate({
            operationId: newOperationId(),
            customerId: customer.id,
            phone: (customer.phone ?? "").trim(),
            pin,
          }),
        accessActivateResultSchema,
      );
      setCard({ phone: (customer.phone ?? "").trim(), pin, code: res.activationCode });
      setQrSvg(null);
      setPin("");
      notify("Application activée : recopiez la carte d'activation.", "ok");
      // QR scannable (ADR-054) : meilleur effort, la carte texte reste valide.
      try {
        const qr = await callChecked(
          (a) =>
            a.customers.accessQrSvg({
              phone: (customer.phone ?? "").trim(),
              pin,
              code: res.activationCode,
            }),
          accessQrSvgResultSchema,
        );
        setQrSvg(qr.svg !== "" ? qr.svg : null);
      } catch {
        setQrSvg(null);
      }
      await reload();
    } catch (e) {
      notify(frError(e, "Activation impossible."), "err");
    } finally {
      setBusy(null);
    }
  }

  async function revoke(): Promise<void> {
    if (!(await confirmAsync(`Couper l'accès mobile de « ${fullName(customer)} » ?`))) return;
    setBusy("revoke");
    try {
      await api.customerAccessRevoke({ id: customer.id, operationId: newOperationId() });
      setCard(null);
      notify("Accès mobile coupé.", "ok");
      await reload();
    } catch (e) {
      notify(frError(e, "Révocation impossible."), "err");
    } finally {
      setBusy(null);
    }
  }

  async function syncNow(): Promise<void> {
    setBusy("sync");
    try {
      const month = businessMonthOf(new Date());
      const kinds = ["customer_snapshot", "invoice_list", "payment_list"] as const;
      let done = 0;
      // A-15 : lot à concurrence bornée (les 3 clichés + les détails étaient
      // enchaînés un par un, sans retour visuel).
      await runBulk(
        kinds,
        async (kind) => {
          const r = await callChecked(
            (a) =>
              a.sync.enqueue({
                operationId: newOperationId(),
                customerId: customer.id,
                kind,
                monthKey: kind === "customer_snapshot" ? month : null,
              }),
            syncEnqueueResultSchema,
          );
          if (r.queued) done += 1;
        },
        { concurrency: 3 },
      );
      // Détails des factures du relevé (page détail APK). Le relevé est borné
      // à 100 ventes : on pousse TOUTES les non annulées, pas seulement les
      // plus récentes — l'ancien plafond 10 laissait les factures payées
      // hors fenêtre définitivement sans détail (404 « demandez au magasin de
      // synchroniser », que la synchro ne corrigeait jamais).
      let details = 0;
      try {
        const st = (await api.customerStatement({ id: customer.id })) as {
          sales?: { id: number; is_cancelled: number; remaining_balance_minor: number }[];
        };
        const sales = Array.isArray(st.sales) ? st.sales : [];
        const ids = selectDetailSaleIds(sales, sales.length);
        await runBulk(
          ids,
          async (saleId) => {
            const r = await callChecked(
              (a) =>
                a.sync.enqueue({
                  operationId: newOperationId(),
                  customerId: customer.id,
                  kind: "invoice_detail",
                  saleId,
                }),
              syncEnqueueResultSchema,
            );
            if (r.queued) details += 1;
          },
          // Un détail ignoré n'échoue jamais la synchro (le lot continue).
          { concurrency: 4, onError: () => undefined },
        );
      } catch {
        /* relevé illisible : les 3 clichés restent la priorité */
      }
      notify(
        `Cliché mis en file (${done}/3${details > 0 ? ` + ${details} détail(s)` : ""}). Envoi vers le miroir à l'étape suivante.`,
        "ok",
      );
    } catch (e) {
      notify(frError(e, "Mise en file impossible."), "err");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-extrabold">
          <Smartphone size={16} aria-hidden="true" /> Application mobile
        </h3>
        {statusLoading ? (
          <span className="text-xs text-slate-500" role="status">
            Chargement…
          </span>
        ) : status?.active ? (
          <Badge tone="green">Activée</Badge>
        ) : status && (status.revokedAt != null || status.failedAttempts > 0) ? (
          <Badge tone="red">Coupée</Badge>
        ) : (
          <Badge tone="grey">Non activée</Badge>
        )}
      </div>

      {status?.lockedUntil ? (
        <p className="text-xs font-semibold text-red-300">
          Verrouillée jusqu'au {status.lockedUntil.slice(0, 16).replace("T", " ")} (5 échecs).
        </p>
      ) : null}

      {card ? (
        <div className="space-y-1 rounded-xl border border-amber-400/40 bg-amber-400/[0.07] p-3 text-sm">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-200">
            Carte d'activation — à recopier une seule fois
          </p>
          <p className="tabular-nums">
            Tél : <strong>{card.phone}</strong>
          </p>
          <p className="tabular-nums">
            PIN : <strong className="font-mono text-base">{card.pin}</strong>
          </p>
          <p className="break-all font-mono text-xs text-slate-300">QR : {card.code}</p>
          {qrSvg ? (
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`}
              alt="QR d'activation à scanner"
              width={160}
              height={160}
              className="rounded-lg bg-white p-2"
            />
          ) : null}
          <p className="text-xs text-slate-400">
            QR valable 7 jours — à scanner depuis l'application. Ne pas photographier à côté.
          </p>
        </div>
      ) : null}

      {!status?.active ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void activate();
          }}
        >
          <Field label="PIN à 6 chiffres" hint="Communiqué au client avec le QR (valable 7 jours).">
            <TextInput
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="Ex. : 482916"
              aria-label="PIN à 6 chiffres"
            />
          </Field>
          <Button type="submit" disabled={busy != null || !hasPhone} className="w-full">
            {busy === "activate" ? "Activation…" : "Activer l'application"}
          </Button>
          {!hasPhone ? (
            <p className="text-xs text-slate-500">
              Téléphone manquant sur la fiche (modifiez d'abord).
            </p>
          ) : null}
        </form>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={busy != null} onClick={() => void syncNow()}>
            <RefreshCw size={15} aria-hidden="true" /> {busy === "sync" ? "File…" : "Synchroniser"}
          </Button>
          <Button variant="danger" disabled={busy != null} onClick={() => void revoke()}>
            <Ban size={15} aria-hidden="true" /> {busy === "revoke" ? "Coupe…" : "Couper l'accès"}
          </Button>
        </div>
      )}
      <p className="text-xs text-slate-500">
        V1 lecture seule : le téléphone affiche dettes et factures, ne modifie rien.
      </p>
    </Card>
  );
}
