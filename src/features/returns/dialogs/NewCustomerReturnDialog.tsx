// Veloria PoS — Retours : tiroir détail + création (client/fournisseur) + remboursement.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useState } from "react";
import { Search } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";

import { formatDzd } from "@domain/money/money.ts";
import { formatDzdSafe } from "@shared/formatters/format.ts";
import { strictOrNeg } from "@shared/money/parse.ts";
import { newOperationId } from "@domain/common/ids.ts";

import { RETURN_REASONS } from "@domain/returns/return-rules.ts";
import { todayUtcDate } from "@shared/dates/dates.ts";
import { Button, EmptyState, Field, Select, TextInput, cn } from "@shared/ui/primitives.tsx";
import { type ItemCondition } from "../types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { playSound } from "@shared/sound/sound.ts";

// ---------------------------------------------------------------------------
// Retour client (depuis une facture).
// ---------------------------------------------------------------------------

interface SaleLine {
  product_id: number | null;
  product_name_snapshot: string;
  unit_price_minor: number;
  quantity: number;
  already_returned: number;
  eligible: number;
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
  const [lines, setLines] = useState<(SaleLine & { qty: string; condition: ItemCondition })[]>([]);
  const [restockAll, setRestockAll] = useState(true);
  const [refundText, setRefundText] = useState("");
  const [creditText, setCreditText] = useState("");
  const [method, setMethod] = useState<"cash" | "cheque" | "transfer">("cash");
  const [reason, setReason] = useState<string>(RETURN_REASONS[0] as string);
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(todayUtcDate());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

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
        items: SaleLine[];
      };
      setSale(det.sale);
      setCustomerName(det.customerName);
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
    return {
      ...l,
      wanted: Number.isFinite(q) && q > 0 ? Math.min(q, l.eligible) : 0,
      over: Number.isFinite(q) && q > l.eligible,
    };
  });
  const chosen = parsed.filter((l) => l.wanted > 0);
  const total = chosen.reduce((a, l) => a + Math.round(l.unit_price_minor * l.wanted), 0);
  // P1-5 : strict (bornes H-1, jamais NaN) ; invalide → -1 = refusé par les gardes.
  const refund = strictOrNeg(refundText, "Remboursement");
  const credit = strictOrNeg(creditText, "Avoir");

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
    if (!Number.isInteger(refund) || refund < 0 || !Number.isInteger(credit) || credit < 0) {
      notify("Montants invalides.", "err");
      return;
    }
    if (refund + credit > total) {
      notify("Remboursement + avoir supérieurs au retour.", "err");
      return;
    }
    setBusy(true);
    try {
      const res = (await api.returnCreate({
        operationId: newOperationId(),
        kind: "customer",
        saleId: Number(sale["id"]),
        items: chosen.map((l) => ({
          productId: l.product_id,
          quantity: l.wanted,
          restocked: restockAll && l.condition === "good",
          condition: l.condition,
        })),
        refundMinor: refund,
        creditMinor: credit,
        refundMethod: refund > 0 ? method : null,
        reason,
        notes: notes.trim() === "" ? null : notes.trim(),
        returnDate: date,
      })) as { number: string };
      notify(`Retour ${res.number} enregistré.`, "ok");
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
          <Search size={15} aria-hidden="true" /> {loading ? "…" : "Chercher"}
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
          </dl>

          <div className="max-h-56 overflow-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#111a2e] text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-3 py-2">Produit</th>
                  <th className="px-3 py-2 text-right">Acheté</th>
                  <th className="px-3 py-2 text-right">Qté retour</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2">État</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((l, i) => (
                  <tr key={i} className="border-t border-white/[0.06]">
                    <td className="max-w-[180px] truncate px-3 py-2">{l.product_name_snapshot}</td>
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
                      {formatDzd(Math.round(l.unit_price_minor * l.wanted))}
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
            <button
              type="button"
              role="switch"
              aria-checked={restockAll}
              aria-label="Remettre en stock"
              onClick={() => setRestockAll((a) => !a)}
              className={cn(
                "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                restockAll ? "bg-amber-400" : "bg-white/15",
              )}
            >
              <span
                className={cn(
                  "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
                  restockAll ? "left-6" : "left-1",
                )}
              />
            </button>
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
            <Field label="Remboursé (DZD)" hint="Espèces rendues.">
              <TextInput
                value={refundText}
                onChange={(e) => setRefundText(e.target.value)}
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
          <Field label="Avoir client (DZD)" hint="Réduit la dette du client.">
            <TextInput
              value={creditText}
              onChange={(e) => setCreditText(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              aria-label="Avoir client"
            />
          </Field>
          <Field label="Notes" hint="Optionnel.">
            <TextInput
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Détail libre…"
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
