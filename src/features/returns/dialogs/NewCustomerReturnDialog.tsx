// Veloria PoS — Retours : tiroir détail + création (client/fournisseur) + remboursement.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";

import { formatDzd, minorToInput } from "@domain/money/money.ts";
import { formatDzdSafe } from "@shared/formatters/format.ts";
import { strictOrNeg } from "@shared/money/parse.ts";
import { useOperationId } from "@shared/ui/use-operation-id.ts";

import {
  RETURN_REASONS,
  netReturnLineValueSafe,
  previewReturnSettlement,
} from "@domain/returns/return-rules.ts";
import { todayUtcDate } from "@shared/dates/dates.ts";
import {
  Button,
  EmptyState,
  Field,
  Select,
  Switch,
  TextInput,
  cn,
} from "@shared/ui/primitives.tsx";
import { type ItemCondition } from "../types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { playSound } from "@shared/sound/sound.ts";

/**
 * Valeur NETTE retournée d'une ligne (après remise), au prorata de la quantité :
 * la RÈGLE DU DOMAINE, au même endroit que le calcul du serveur (A20, audit
 * 2026-10-27). L'ancienne copie locale retombait sur « prix catalogue × qté »
 * quand la donnée lui semblait illisible — une valeur que le main refuse, donc
 * un aperçu mensonger. Illisible ⇒ 0 (échec sûr au rendu, doctrine A-01).
 */
function netLineReturnMinor(line: SaleLine, wanted: number): number {
  return netReturnLineValueSafe({
    soldLineTotalMinor: Number(line.line_total_minor),
    soldQuantity: Number(line.quantity),
    returnedQuantity: wanted,
  });
}

// ---------------------------------------------------------------------------
// Retour client (depuis une facture).
// ---------------------------------------------------------------------------

interface SaleLine {
  id: number;
  product_id: number | null;
  product_name_snapshot: string;
  unit_price_minor: number;
  /** Total facturé NET de la ligne (après remise) — base du retour. */
  line_total_minor: number;
  quantity: number;
  already_returned: number;
  eligible: number;
  unit_code?: string | null;
  unit_factor?: number | null;
  product_primary_barcode?: string | null;
  product_barcodes?: string[] | null;
  product_barcode?: string | null;
  barcode?: string | null;
  primary_barcode?: string | null;
  barcodes?: string[] | null;
}

export function CustomerReturnDialog({
  onClose,
  onSaved,
  notify,
}: {
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [invoice, setInvoice] = useState("");
  const [sale, setSale] = useState<Record<string, string | number | null> | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [customerOutstandingMinor, setCustomerOutstandingMinor] = useState<number | null>(null);
  const [lines, setLines] = useState<(SaleLine & { qty: string; condition: ItemCondition })[]>([]);
  const [itemQuery, setItemQuery] = useState("");
  const [restockAll, setRestockAll] = useState(true);
  const [refundText, setRefundText] = useState("");
  const [refundTouched, setRefundTouched] = useState(false);
  const [method, setMethod] = useState<"cash" | "cheque" | "transfer">("cash");
  const [reason, setReason] = useState<string>(RETURN_REASONS[0] as string);
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(todayUtcDate());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  // R8 : UUID figé à l'ouverture (retry = rejouement no-op, jamais 2 retours).
  const { operationId } = useOperationId();

  async function search(): Promise<void> {
    const q = invoice.trim().toUpperCase().replace(/\s+/g, "");
    if (q.length < 2) {
      notify("Numéro de facture requis (ou scannez le code-barres du ticket).", "err");
      return;
    }
    if (q !== invoice.trim()) setInvoice(q);
    setLoading(true);
    try {
      const res = (await api.salesHistory({ query: q, page: 1, pageSize: 5 })) as {
        rows: Record<string, string | number | null>[];
      };
      const found = res.rows.find(
        (s) => String(s["invoice_number"] ?? "").toLowerCase() === q.toLowerCase(),
      );
      if (!found) {
        notify("Facture introuvable.", "err");
        return;
      }
      const det = (await api.returnSaleItems({ id: Number(found["id"]) })) as {
        sale: Record<string, string | number | null>;
        customerName: string | null;
        customerOutstandingMinor?: number | null;
        items: SaleLine[];
      };
      setSale(det.sale);
      setCustomerName(det.customerName);
      setCustomerOutstandingMinor(det.customerOutstandingMinor ?? null);
      setRefundText("");
      setRefundTouched(false);
      setLines(det.items.map((l) => ({ ...l, qty: "", condition: "good" as ItemCondition })));
    } catch (e) {
      notify(frError(e, "Recherche impossible."), "err");
    } finally {
      setLoading(false);
    }
  }

  function setLineQty(idx: number, v: string): void {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, qty: v } : l)));
  }

  function setLineCondition(idx: number, v: ItemCondition): void {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, condition: v } : l)));
  }

  const parsed = lines.map((l) => {
    const n = Number(l.qty.replace(",", ".").trim());
    const q = l.qty.trim() === "" ? 0 : Math.round(n * 1000) / 1000;
    const factor = l.unit_factor ?? 1;
    return {
      ...l,
      wanted: Number.isFinite(q) && q > 0 ? Math.min(q, l.eligible) : 0,
      over: Number.isFinite(q) && q > l.eligible,
      // Un carton se retourne entier : le serveur refuse aussi, mais l'UI
      // doit le dire avant l'envoi.
      partialCarton: factor > 1 && Number.isFinite(q) && q > 0 && !Number.isInteger(q),
    };
  });
  const qItem = itemQuery.trim().toLowerCase();
  const visibleLines = parsed
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => {
      if (qItem === "") return true;
      const name = String(l.product_name_snapshot).toLowerCase();
      const codes = [
        l.product_primary_barcode,
        l.product_barcode,
        l.barcode,
        l.primary_barcode,
        ...(Array.isArray(l.product_barcodes) ? l.product_barcodes : []),
        ...(Array.isArray(l.barcodes) ? l.barcodes : []),
      ]
        .filter((x): x is string => typeof x === "string" && x.trim() !== "")
        .map((x) => x.toLowerCase());
      return name.includes(qItem) || codes.some((c) => c.includes(qItem));
    });
  const chosen = parsed.filter((l) => l.wanted > 0);
  // Valeur NETTE (après remise), identique au calcul serveur.
  const total = chosen.reduce((a, l) => a + netLineReturnMinor(l, l.wanted), 0);
  // Politique propriétaire : la dette d'abord, puis les espèces pour l'excédent.
  // A14 (audit 2026-10-27) : l'aperçu passe par la règle du domaine (la même que
  // celle du main) au lieu de la recopier — un écart promettait au caissier un
  // plafond d'espèces que le serveur refusait.
  const outstanding = Math.max(0, customerOutstandingMinor ?? 0);
  const settlement = previewReturnSettlement({
    totalReturnMinor: total,
    outstandingMinor: customerOutstandingMinor ?? 0,
    requestedRefundMinor: 0,
  });
  const autoCredit = settlement.creditAppliedMinor;
  const maxRefund = settlement.maxCashRefundMinor;
  const outstandingAfter = customerOutstandingMinor == null ? null : outstanding - autoCredit;
  // P1-5 : strict (bornes H-1, jamais NaN) ; invalide → -1 = refusé par les gardes.
  const refund = strictOrNeg(refundText, "Remboursement");
  useEffect(() => {
    // Téléphone l'excédent tant que l'opérateur n'a pas modifié le champ.
    if (refundTouched) return;
    setRefundText(maxRefund > 0 ? minorToInput(maxRefund) : "");
  }, [maxRefund, refundTouched]);

  async function save(): Promise<void> {
    if (!sale) {
      notify("Recherchez d'abord la facture.", "err");
      return;
    }
    if (chosen.length === 0) {
      notify("Saisissez au moins une quantité.", "err");
      return;
    }
    if (parsed.some((l) => l.over)) {
      notify("Quantité supérieure à l'éligible.", "err");
      return;
    }
    if (parsed.some((l) => l.partialCarton)) {
      notify("Retour partiel d'un carton impossible : saisissez des cartons entiers.", "err");
      return;
    }
    if (!Number.isInteger(refund) || refund < 0) {
      notify("Montants invalides.", "err");
      return;
    }
    if (refund > maxRefund) {
      notify(
        `Remboursement en espèces limité à ${formatDzdSafe(maxRefund)} : la part restante couvre la dette du client.`,
        "err",
      );
      return;
    }
    setBusy(true);
    try {
      const res = (await api.returnCreate({
        operationId,
        kind: "customer",
        saleId: Number(sale["id"]),
        items: chosen.map((l) => ({
          saleItemId: l.id,
          productId: l.product_id,
          quantity: l.wanted,
          restocked: restockAll && l.condition === "good",
          condition: l.condition,
          unitFactor: l.unit_factor ?? 1,
        })),
        refundMinor: refund,
        refundMethod: refund > 0 ? method : null,
        reason,
        notes: notes.trim() === "" ? null : notes.trim(),
        returnDate: date,
      })) as {
        number: string;
        creditAppliedMinor?: number;
        cashRefundMinor?: number;
      };
      const applied = Number(res.creditAppliedMinor ?? 0);
      const cash = Number(res.cashRefundMinor ?? 0);
      const parts = [`Retour ${res.number} enregistré.`];
      if (applied > 0) parts.push(`${formatDzd(applied)} imputé à la dette.`);
      if (cash > 0) parts.push(`${formatDzd(cash)} remboursé.`);
      notify(parts.join(" "), "ok");
      // P5 : retour créé = succès.
      playSound("success");
      onSaved();
    } catch (e) {
      notify(frError(e, "Création impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1">
          <TextInput
            value={invoice}
            onChange={(e) => setInvoice(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void search();
              }
            }}
            placeholder="N° facture ou scan code-barres (ex. FAC-2026-00001)"
            aria-label="Rechercher une facture par numéro ou scan code-barres"
            className="font-mono"
            autoFocus
          />
        </div>
        <Button variant="secondary" onClick={() => void search()} disabled={loading}>
          <Search size={15} aria-hidden="true" /> {loading ? "…" : "Rechercher"}
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        Astuce : scannez le code-barres imprimé sur le ticket / la facture A4 — le N° se remplit
        seul, puis Entrée.
      </p>

      {sale ? (
        <>
          <dl className="rounded-xl bg-black/25 p-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Facture</dt>
              <dd className="font-mono font-bold">{String(sale["invoice_number"] ?? "")}</dd>
            </div>
            <div className="mt-1 flex justify-between">
              <dt className="text-slate-500">Client</dt>
              <dd className="font-semibold">{customerName ?? "Passage"}</dd>
            </div>
            <div className="mt-1 flex justify-between">
              <dt className="text-slate-500">Total facture</dt>
              <dd className="font-bold tabular-nums">{formatDzdSafe(sale["total_minor"] ?? 0)}</dd>
            </div>
            <div className="mt-1 flex justify-between border-t border-white/10 pt-1">
              <dt className="text-slate-500">Dette actuelle</dt>
              <dd className="font-bold tabular-nums text-amber-300">
                {customerOutstandingMinor == null
                  ? "Passage"
                  : formatDzdSafe(customerOutstandingMinor)}
              </dd>
            </div>
          </dl>

          <TextInput
            value={itemQuery}
            onChange={(e) => setItemQuery(e.target.value)}
            placeholder="Rechercher un produit (nom ou code-barres)…"
            aria-label="Rechercher un produit dans la facture"
            className="mb-2"
          />

          <div className="max-h-56 overflow-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#122131] text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-3 py-2">Produit</th>
                  <th className="px-3 py-2 text-right">Acheté</th>
                  <th className="px-3 py-2 text-right">Qté retour</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2">État</th>
                </tr>
              </thead>
              <tbody>
                {visibleLines.map(({ l, i }) => (
                  <tr key={l.id} className="border-t border-white/[0.06]">
                    <td className="max-w-[180px] px-3 py-2">
                      <span className="block truncate">{l.product_name_snapshot}</span>
                      {l.unit_code && l.unit_code.toUpperCase() !== "PIECE" ? (
                        <span className="text-[11px] font-semibold text-amber-300/80">
                          {l.unit_code}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {l.quantity} <span className="text-[11px]">(restant {l.eligible})</span>
                    </td>
                    <td className="w-24 px-3 py-2">
                      <TextInput
                        value={l.qty}
                        onChange={(e) => setLineQty(i, e.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                        aria-label={`Quantité ${l.product_name_snapshot}`}
                        className={cn("py-1.5 text-right", l.over && "border-red-400/60")}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">
                      {formatDzd(netLineReturnMinor(l, l.wanted))}
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={l.condition}
                        onChange={(e) => setLineCondition(i, e.target.value as ItemCondition)}
                        aria-label={`État ${l.product_name_snapshot}`}
                        className="py-1.5 text-xs"
                      >
                        <option value="good">Bon état</option>
                        <option value="defective">Défectueux</option>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold">
            <span>Remettre en stock</span>
            <Switch
              checked={restockAll}
              onChange={() => setRestockAll((a) => !a)}
              ariaLabel="Remettre en stock"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Motif">
              <Select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motif">
                {RETURN_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date de retour">
              <TextInput
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Date de retour"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Remboursé (DZD)"
              hint={
                autoCredit > 0
                  ? `Max ${formatDzdSafe(maxRefund)} · ${formatDzdSafe(autoCredit)} imputé à la dette.`
                  : `Max ${formatDzdSafe(maxRefund)} (aucune dette à imputer).`
              }
            >
              <TextInput
                value={refundText}
                onChange={(e) => {
                  setRefundTouched(true);
                  setRefundText(e.target.value);
                }}
                disabled={maxRefund <= 0}
                inputMode="decimal"
                placeholder="0,00"
                aria-label="Montant remboursé"
              />
            </Field>
            <Field label="Moyen">
              <Select
                value={method}
                onChange={(e) => setMethod(e.target.value as "cash" | "cheque" | "transfer")}
                aria-label="Moyen de remboursement"
              >
                <option value="cash">Espèces</option>
                <option value="cheque">Chèque</option>
                <option value="transfer">Virement</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
              <p className="text-xs text-slate-500">Imputé automatiquement à la dette</p>
              <p className="text-lg font-extrabold tabular-nums text-amber-300">
                {formatDzdSafe(autoCredit)}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
              <p className="text-xs text-slate-500">Dette après retour</p>
              <p className="text-lg font-extrabold tabular-nums text-emerald-300">
                {outstandingAfter == null
                  ? "Passage"
                  : formatDzdSafe(Math.max(0, outstandingAfter))}
              </p>
            </div>
          </div>
          <Field label="Notes" hint="Optionnel.">
            <TextInput
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Précisez le motif…"
              aria-label="Notes"
            />
          </Field>

          <dl className="flex items-baseline justify-between rounded-xl bg-black/25 px-4 py-3">
            <dt className="font-extrabold">Total retour</dt>
            <dd className="text-xl font-extrabold tabular-nums text-amber-300">
              {formatDzd(total)}
            </dd>
          </dl>
        </>
      ) : (
        <EmptyState title="Aucune facture" hint="Recherchez la facture d'origine ci-dessus." />
      )}

      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
          Annuler
        </Button>
        <Button onClick={() => void save()} disabled={busy || !sale} className="flex-[2]">
          {busy ? "Enregistrement…" : `Valider le retour · ${formatDzd(total)}`}
        </Button>
      </div>
    </div>
  );
}
