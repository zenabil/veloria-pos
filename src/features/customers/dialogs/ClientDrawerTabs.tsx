// Veloria PoS — Clients : onglets Factures / Paiements de la fiche 360.
// Extrait de `ClientDialogs.tsx` (découpage sans changement de comportement).
import { formatDzd } from "@domain/money/money.ts";
import { PAYMENT_METHOD_LABELS, formatDateTimeFr } from "@shared/formatters/format.ts";
import { Badge } from "@shared/ui/primitives.tsx";
import type { StatementSale } from "../types.ts";
import type { ClientTabId, StatementPayment } from "./types.ts";

/** Onglets Factures + Paiements (relevé rechargé à l'ouverture du tiroir). */
export function ClientDrawerTabs({
  tab,
  sales,
  activeSales,
  salesTotal,
  salesRest,
  payments,
  payTotal,
  statementLoading,
  printId,
  receiptBusyId,
  onPreviewSale,
  onPrintDirect,
  onOpenReceipt,
}: {
  tab: ClientTabId;
  sales: StatementSale[];
  activeSales: StatementSale[];
  salesTotal: number;
  salesRest: number;
  payments: StatementPayment[];
  payTotal: number;
  statementLoading: boolean;
  printId: number | null;
  receiptBusyId: number | null;
  onPreviewSale: (saleId: number | null) => void;
  onPrintDirect: (saleId: number) => void;
  onOpenReceipt: (paymentId: number) => void;
}): React.JSX.Element {
  return (
    <>
      {tab === "factures" ? (
        <div role="tabpanel" id="client-panel-factures" aria-labelledby="client-tab-factures">
          {statementLoading ? (
            <p className="py-4 text-center text-sm text-slate-500" role="status">
              Chargement…
            </p>
          ) : sales.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">Aucune facture.</p>
          ) : (
            <>
              <dl className="mb-2 space-y-1 rounded-xl bg-black/25 p-3 text-sm">
                <div className="flex justify-between text-slate-300">
                  <dt>Factures (hors annulées)</dt>
                  <dd className="font-bold tabular-nums">{activeSales.length}</dd>
                </div>
                <div className="flex justify-between text-slate-300">
                  <dt>Total facturé</dt>
                  <dd className="font-bold tabular-nums">{formatDzd(salesTotal)}</dd>
                </div>
                <div className="flex items-baseline justify-between border-t border-white/10 pt-1.5">
                  <dt className="font-extrabold">Reste dû</dt>
                  <dd className="font-extrabold tabular-nums text-amber-300">
                    {formatDzd(salesRest)}
                  </dd>
                </div>
              </dl>
              <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/10">
                {sales.map((s) => (
                  <li key={s.id} className="space-y-1 px-3 py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-slate-400">{s.invoice_number}</span>
                      <span className="font-bold tabular-nums">{formatDzd(s.total_minor)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>{formatDateTimeFr(s.created_at)}</span>
                      {s.is_cancelled === 1 ? (
                        <Badge tone="grey">Annulée</Badge>
                      ) : s.remaining_balance_minor > 0 ? (
                        <span className="font-semibold tabular-nums text-amber-300">
                          Reste {formatDzd(s.remaining_balance_minor)}
                        </span>
                      ) : (
                        <Badge tone="green">Payée</Badge>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => onPreviewSale(s.id)}
                        title={`Ouvrir le détail ${s.invoice_number} (aperçu + réimpression)`}
                        aria-label={`Ouvrir la facture ${s.invoice_number}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs font-semibold text-slate-300 transition-colors hover:border-amber-400/40 hover:text-amber-200"
                      >
                        Ouvrir
                      </button>
                      <button
                        type="button"
                        onClick={() => onPrintDirect(s.id)}
                        disabled={printId != null || s.is_cancelled === 1}
                        title={`Imprimer directement ${s.invoice_number} (ticket 80mm)`}
                        aria-label={`Imprimer la facture ${s.invoice_number}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs font-semibold text-slate-300 transition-colors hover:border-amber-400/40 hover:text-amber-200 disabled:opacity-50"
                      >
                        {printId === s.id ? "Impression…" : "Imprimer"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}

      {tab === "paiements" ? (
        <div role="tabpanel" id="client-panel-paiements" aria-labelledby="client-tab-paiements">
          {statementLoading ? (
            <p className="py-4 text-center text-sm text-slate-500" role="status">
              Chargement…
            </p>
          ) : payments.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">Aucun paiement.</p>
          ) : (
            <>
              <dl className="mb-2 flex items-baseline justify-between rounded-xl bg-black/25 p-3 text-sm">
                <dt className="font-extrabold">Total encaissé</dt>
                <dd className="font-extrabold tabular-nums text-emerald-300">
                  {formatDzd(payTotal)}
                </dd>
              </dl>
              <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/10">
                {payments.map((p) => (
                  <li key={p.id} className="space-y-1 px-3 py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-300">
                        {PAYMENT_METHOD_LABELS[p.method] ?? (p.method === "" ? "—" : p.method)}
                      </span>
                      <span className="font-bold tabular-nums text-emerald-300">
                        {formatDzd(p.amount_minor)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>{formatDateTimeFr(p.payment_date || p.created_at)}</span>
                      <span className="font-mono">{p.reference || "—"}</span>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      {p.sale_id != null ? (
                        <button
                          type="button"
                          onClick={() => onPreviewSale(p.sale_id)}
                          className="rounded-lg border border-white/10 px-3 py-1 text-xs font-bold text-slate-300 hover:text-white"
                          title={`Ouvrir la facture liée (${p.reference || "sans réf."})`}
                          aria-label={`Ouvrir la facture du paiement ${p.reference || p.id}`}
                        >
                          Facture
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onOpenReceipt(p.id)}
                        disabled={receiptBusyId != null}
                        className="rounded-lg border border-white/10 px-3 py-1 text-xs font-bold text-slate-300 hover:text-white disabled:opacity-50"
                        title={`Reçu de règlement ${p.reference || "sans réf."} (soldes reconstitués)`}
                        aria-label={`Imprimer le reçu du paiement ${p.reference || p.id}`}
                      >
                        {receiptBusyId === p.id ? "Chargement…" : "Reçu"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
