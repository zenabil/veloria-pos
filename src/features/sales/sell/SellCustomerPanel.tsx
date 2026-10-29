// Veloria PoS — Caisse : panneau client (extrait de SellScreen, JSX pur).
// + création express (nom + tél) sans quitter la caisse.
import { useState } from "react";
import { HandCoins, Plus, User, X } from "lucide-react";
import { formatDzdTotal } from "@domain/money/money.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { api } from "@shared/types/ipc-client.ts";
import { Badge, Button, Card, Field, TextInput } from "@shared/ui/primitives.tsx";
import type { Notify } from "@shared/ui/primitives.tsx";
import type { RefObject } from "react";
import { splitFullName } from "../../customers/types.ts";
import type { CustomerRow } from "./sell-types.ts";

function initialesClient(label: string): string {
  const initials = label
    .trim()
    .split(/\s+/)
    .filter((part) => part !== "")
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("");
  return initials === "" ? "?" : initials.toUpperCase();
}

export function SellCustomerPanel({
  customerQuery,
  onSearchCustomers,
  customerId,
  customerLabel,
  creditUnknown,
  customerCredit,
  customerBalance,
  customerCreditLimit,
  projectedMinor,
  limitExceeded,
  onOpenDetails,
  onOpenSettle,
  onSelectPassage,
  customerResults,
  customerTotal,
  onSelectCustomer,
  customerRef,
  notify,
  canDebts,
}: {
  customerQuery: string;
  onSearchCustomers: (q: string) => void;
  customerId: number | null;
  customerLabel: string;
  creditUnknown: boolean;
  customerCredit: boolean | null;
  customerBalance: number | null;
  customerCreditLimit: number | null;
  projectedMinor: number | null;
  limitExceeded: boolean;
  onOpenDetails: () => void;
  onOpenSettle: () => void;
  onSelectPassage: () => void;
  customerResults: CustomerRow[];
  customerTotal: number;
  onSelectCustomer: (c: CustomerRow) => void;
  customerRef: RefObject<HTMLInputElement | null>;
  notify: Notify;
  canDebts: boolean;
}): React.JSX.Element {
  // Création express : prénom + nom (+ tél optionnel), comptant par défaut.
  // La fiche complète (plafond, crédit) reste dans Clients.
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  // Idempotence : identifiant figé tant que la création n'a pas abouti —
  // double Entrée = un seul client (rejeu serveur), pas deux fiches.
  const [quickOpId, setQuickOpId] = useState(() => newOperationId());

  async function createQuick(): Promise<void> {
    const { firstName, lastName } = splitFullName(quickName);
    if (firstName.length < 1 || lastName.length < 1) {
      notify("Nom complet requis (prénom + nom).", "err");
      return;
    }
    if (quickPhone.trim().length > 30) {
      notify("Téléphone trop long (30 max).", "err");
      return;
    }
    setQuickBusy(true);
    try {
      const res = (await api.customerCreate({
        operationId: quickOpId,
        firstName,
        lastName,
        phone: quickPhone.trim() === "" ? null : quickPhone.trim(),
        address: null,
        creditLimitMinor: 0,
        initialBalanceMinor: 0,
        settlementDay: null,
        isBreadClient: false,
        creditAllowed: false,
        notes: null,
      })) as { id: number };
      // Succès : nouvel UUID pour la prochaine création.
      setQuickOpId(newOperationId());
      setQuickOpen(false);
      setQuickName("");
      setQuickPhone("");
      notify(`Client « ${firstName} ${lastName} » créé.`, "ok");
      onSelectCustomer({
        id: res.id,
        first_name: firstName,
        last_name: lastName,
        outstanding_balance_minor: 0,
        credit_allowed: 0,
      });
    } catch (e) {
      notify(frError(e, "Création impossible."), "err");
    } finally {
      setQuickBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <Field label="Client">
        <div className="relative">
          <User
            size={17}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <TextInput
            value={customerQuery}
            onChange={(e) => onSearchCustomers(e.target.value)}
            placeholder="Rechercher un client… (min. 2 lettres)"
            aria-label="Rechercher un client"
            title="Rechercher un client [F5]"
            ref={customerRef}
            className="min-h-[52px] pl-10 text-[15px]"
          />
        </div>
      </Field>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {customerId == null ? (
          <>
            <Badge tone="grey">{customerLabel}</Badge>
            {canDebts ? (
              <button
                type="button"
                onClick={() => setQuickOpen((o) => !o)}
                title="Créer un client sans quitter la caisse"
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-xs font-semibold text-slate-300 transition-colors hover:border-white/20 hover:text-white"
              >
                <Plus size={13} aria-hidden="true" /> Nouveau
              </button>
            ) : null}
          </>
        ) : (
          <div className="w-full rounded-xl border border-[#fbbf24]/20 bg-[#fbbf24]/[0.05] px-2.5 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#ffe1a7,#fbbf24)] text-[11px] font-extrabold text-[#402d00]"
              >
                {initialesClient(customerLabel)}
              </span>
              <button
                type="button"
                onClick={onOpenDetails}
                title="Ouvrir la fiche client (factures, aperçu, impression)"
                aria-label={`Ouvrir la fiche de ${customerLabel}`}
                className="min-w-0 truncate rounded-lg px-1 text-left text-sm font-bold text-slate-100 transition-colors hover:text-amber-200"
              >
                {customerLabel}
                <span className="ml-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-300/80">
                  Fiche
                </span>
              </button>
              {creditUnknown ? (
                <Badge tone="grey">Solde indisponible</Badge>
              ) : (
                <Badge tone={customerCredit === true ? "green" : "grey"}>
                  {customerCredit === true ? "Crédit autorisé" : "Comptant uniquement"}
                </Badge>
              )}
              {limitExceeded ? <Badge tone="red">Dépassement de plafond</Badge> : null}
              <button
                type="button"
                onClick={onSelectPassage}
                aria-label="Revenir au client de passage"
                title="Passage — aucun client attaché"
                className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={13} aria-hidden="true" /> Passage
              </button>
              {canDebts ? (
                <button
                  type="button"
                  onClick={() => setQuickOpen((o) => !o)}
                  aria-label="Créer un client"
                  title="Créer un client sans quitter la caisse"
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs font-semibold text-slate-300 transition-colors hover:border-white/20 hover:text-white"
                >
                  <Plus size={13} aria-hidden="true" /> Nouveau
                </button>
              ) : null}
            </div>
            {customerBalance != null ||
            (customerCreditLimit != null && customerCreditLimit > 0) ||
            projectedMinor != null ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/[0.06] pl-10 text-xs tabular-nums text-slate-400">
                {customerBalance != null ? (
                  <span>
                    Solde :{" "}
                    <strong className="font-bold text-slate-200">
                      {formatDzdTotal(customerBalance)}
                    </strong>
                  </span>
                ) : null}
                {customerCreditLimit != null && customerCreditLimit > 0 ? (
                  <span>
                    Plafond :{" "}
                    <strong className="font-bold text-slate-200">
                      {formatDzdTotal(customerCreditLimit)}
                    </strong>
                  </span>
                ) : null}
                {projectedMinor != null &&
                customerCreditLimit != null &&
                customerCreditLimit > 0 ? (
                  <span className="text-slate-500">Projeté : {formatDzdTotal(projectedMinor)}</span>
                ) : null}
                {canDebts && (customerBalance ?? 0) > 0 ? (
                  <button
                    type="button"
                    onClick={onOpenSettle}
                    title="Régler la dette du client"
                    className="inline-flex items-center gap-1 font-bold text-amber-200 transition-colors hover:text-amber-100"
                  >
                    <HandCoins size={13} aria-hidden="true" /> Régler
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
      {quickOpen ? (
        <form
          className="mt-2 space-y-2 rounded-xl border border-white/10 bg-black/25 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void createQuick();
          }}
        >
          <Field label="Nouveau client (express)">
            <TextInput
              value={quickName}
              onChange={(e) => setQuickName(e.target.value)}
              placeholder="Prénom Nom"
              aria-label="Nom complet du nouveau client"
            />
          </Field>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <TextInput
              value={quickPhone}
              onChange={(e) => setQuickPhone(e.target.value)}
              inputMode="tel"
              placeholder="Téléphone (optionnel)"
              aria-label="Téléphone du nouveau client"
            />
            <Button type="submit" disabled={quickBusy}>
              {quickBusy ? "…" : "Créer"}
            </Button>
          </div>
        </form>
      ) : null}
      {customerResults.length > 0 ? (
        <ul className="mt-2 max-h-32 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10 bg-[#0d1c2d]">
          {customerResults.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelectCustomer(c)}
                className="flex w-full items-center justify-between gap-2 border-l-2 border-transparent px-3 py-2 text-left text-sm transition-colors hover:border-[#fbbf24] hover:bg-amber-400/10"
              >
                <span className="truncate font-semibold">
                  {c.first_name} {c.last_name}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge tone={c.credit_allowed === 1 ? "green" : "grey"}>
                    {c.credit_allowed === 1 ? "Crédit" : "Comptant"}
                  </Badge>
                  <span className="text-xs tabular-nums text-slate-400">
                    {formatDzdTotal(c.outstanding_balance_minor)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {/* Slot à hauteur constante : l'apparition du compteur ne doit pas
          déplacer le panier sous les doigts du caissier (saisie en cours). */}
      <p className="mt-1 min-h-[1rem] text-xs font-semibold text-slate-500" role="status">
        {customerTotal > customerResults.length
          ? `+${customerTotal - customerResults.length} autre(s) — affinez la recherche.`
          : ""}
      </p>
    </Card>
  );
}
