// Veloria PoS — Clients : onglets Retours / Dettes / Historique de la fiche 360.
// Extrait de `ClientDialogs.tsx` (découpage sans changement de comportement).
import { formatDzd } from "@domain/money/money.ts";
import { formatDateTimeFr } from "@shared/formatters/format.ts";
import { returnNumber, returnStatusLabel, returnStatusTone } from "@features/returns/types.ts";
import { debtStatusLabel } from "@features/debts/types.ts";
import { KIND_LABELS, kindTone } from "@features/history/types.ts";
import { Badge, Button } from "@shared/ui/primitives.tsx";
import { asMinor } from "../client-matching.ts";
import type { EnrichedCustomer } from "../types.ts";
import {
  historyKindOf,
  type ClientDebtItem,
  type ClientHistoryItem,
  type ClientReturnItem,
  type ClientTabId,
  type LazyState,
} from "./types.ts";

/** Onglets Retours + Dettes-Solde + Historique (listes chargées paresseusement). */
export function ClientDrawerDebts({
  tab,
  customer,
  returnsRows,
  returnsState,
  debtsRows,
  debtsState,
  historyRows,
  historyState,
  debtsRest,
  receiptBusyId,
  slipBusyKey,
  onRetryReturns,
  onRetryDebts,
  onRetryHistory,
  onOpenSlip,
  onPreviewSale,
  onOpenReceipt,
}: {
  tab: ClientTabId;
  customer: EnrichedCustomer;
  returnsRows: ClientReturnItem[];
  returnsState: LazyState;
  debtsRows: ClientDebtItem[];
  debtsState: LazyState;
  historyRows: ClientHistoryItem[];
  historyState: LazyState;
  debtsRest: number;
  receiptBusyId: number | null;
  slipBusyKey: string | null;
  onRetryReturns: () => void;
  onRetryDebts: () => void;
  onRetryHistory: () => void;
  onOpenSlip: (kind: string, entityId: number) => void;
  onPreviewSale: (saleId: number) => void;
  onOpenReceipt: (paymentId: number) => void;
}): React.JSX.Element {
  return (
    <>
      {tab === "retours" ? (
        <div role="tabpanel" id="client-panel-retours" aria-labelledby="client-tab-retours">
          {returnsState === "loading" || returnsState === "idle" ? (
            <p className="py-4 text-center text-sm text-slate-500" role="status">
              Chargement…
            </p>
          ) : returnsState === "error" ? (
            <div className="space-y-2 py-4 text-center">
              <p className="text-sm text-slate-500">Retours indisponibles.</p>
              <Button variant="secondary" onClick={onRetryReturns}>
                Réessayer
              </Button>
            </div>
          ) : returnsRows.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">Aucun retour.</p>
          ) : (
            <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/10">
              {returnsRows.map((r) => (
                <li key={`${r.kind}:${r.entity_id}`} className="space-y-1 px-3 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-400">
                      {returnNumber(
                        r.kind === "supplier" ? "supplier" : "customer",
                        r.number,
                        r.entity_id,
                      )}
                    </span>
                    <span className="font-bold tabular-nums">
                      {formatDzd(asMinor(r.total_minor))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>{formatDateTimeFr(r.created_at)}</span>
                    <Badge tone={returnStatusTone(r.status)}>{returnStatusLabel(r.status)}</Badge>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenSlip(r.kind, r.entity_id)}
                      disabled={slipBusyKey != null}
                      className="rounded-lg border border-white/10 px-3 py-1 text-xs font-bold text-slate-300 hover:text-white disabled:opacity-50"
                      title={`Bon de retour ${r.ref || r.entity_id} (aperçu + impression)`}
                      aria-label={`Ouvrir le bon de retour ${r.ref || r.entity_id}`}
                    >
                      {slipBusyKey === `${r.kind}:${r.entity_id}` ? "Chargement…" : "Bon"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "dettes" ? (
        <div role="tabpanel" id="client-panel-dettes" aria-labelledby="client-tab-dettes">
          {debtsState === "loading" || debtsState === "idle" ? (
            <p className="py-4 text-center text-sm text-slate-500" role="status">
              Chargement…
            </p>
          ) : debtsState === "error" ? (
            <div className="space-y-2 py-4 text-center">
              <p className="text-sm text-slate-500">Dettes indisponibles.</p>
              <Button variant="secondary" onClick={onRetryDebts}>
                Réessayer
              </Button>
            </div>
          ) : (
            <>
              <dl className="mb-2 space-y-1 rounded-xl bg-black/25 p-3 text-sm">
                <div className="flex items-baseline justify-between">
                  <dt className="font-extrabold">Dette actuelle (solde)</dt>
                  <dd className="font-extrabold tabular-nums text-red-300">
                    {formatDzd(customer.outstanding_balance_minor)}
                  </dd>
                </div>
                <div className="flex justify-between text-slate-300">
                  <dt>Documents ouverts</dt>
                  <dd className="font-bold tabular-nums">{debtsRows.length}</dd>
                </div>
                <div className="flex items-baseline justify-between border-t border-white/10 pt-1.5">
                  <dt className="font-extrabold">Reste des documents</dt>
                  <dd className="font-extrabold tabular-nums text-amber-300">
                    {formatDzd(debtsRest)}
                  </dd>
                </div>
              </dl>
              {debtsRows.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-500">Aucune dette ouverte.</p>
              ) : (
                <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/10">
                  {debtsRows.map((d) => (
                    <li
                      key={`${d.debt_type}:${d.entity_id}`}
                      className="space-y-1 px-3 py-2.5 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-slate-400">{d.ref}</span>
                        <span className="font-bold tabular-nums text-amber-300">
                          {formatDzd(asMinor(d.remaining_minor))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span>{formatDateTimeFr(d.created_at)}</span>
                        <Badge tone={d.status === "overdue" ? "red" : "amber"}>
                          {debtStatusLabel(d.status)}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span>
                          Facturé {formatDzd(asMinor(d.original_minor))} · Réglé{" "}
                          {formatDzd(asMinor(d.paid_minor))}
                        </span>
                        <span>Échéance : {d.due_date ? d.due_date.slice(0, 10) : "—"}</span>
                      </div>
                      {d.debt_type === "customer" ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => onPreviewSale(d.entity_id)}
                            className="rounded-lg border border-white/10 px-3 py-1 text-xs font-bold text-slate-300 hover:text-white"
                            title={`Ouvrir la facture ${d.ref} (aperçu + réimpression)`}
                            aria-label={`Ouvrir la facture ${d.ref}`}
                          >
                            Facture
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      ) : null}

      {tab === "historique" ? (
        <div role="tabpanel" id="client-panel-historique" aria-labelledby="client-tab-historique">
          {historyState === "loading" || historyState === "idle" ? (
            <p className="py-4 text-center text-sm text-slate-500" role="status">
              Chargement…
            </p>
          ) : historyState === "error" ? (
            <div className="space-y-2 py-4 text-center">
              <p className="text-sm text-slate-500">Historique indisponible.</p>
              <Button variant="secondary" onClick={onRetryHistory}>
                Réessayer
              </Button>
            </div>
          ) : historyRows.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">Aucune opération.</p>
          ) : (
            <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/10">
              {historyRows.map((h) => {
                const known = historyKindOf(h.kind);
                return (
                  <li key={`${h.kind}:${h.entity_id}`} className="space-y-1 px-3 py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{known ? KIND_LABELS[known] : h.kind}</span>
                      <span className="font-bold tabular-nums">
                        {h.amount_minor == null ? "—" : formatDzd(asMinor(h.amount_minor))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="min-w-0 truncate">{h.label || h.ref || "—"}</span>
                      <span className="shrink-0">{formatDateTimeFr(h.created_at)}</span>
                    </div>
                    <div>
                      <Badge tone={known ? kindTone(known) : "grey"}>{h.ref || "—"}</Badge>
                    </div>
                    {h.kind === "sale" ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onPreviewSale(h.entity_id)}
                          className="rounded-lg border border-white/10 px-3 py-1 text-xs font-bold text-slate-300 hover:text-white"
                          title={`Ouvrir ${h.ref || "la vente"} (aperçu + réimpression)`}
                          aria-label={`Ouvrir ${h.ref || "la vente"}`}
                        >
                          Ouvrir
                        </button>
                      </div>
                    ) : h.kind === "payment_in" ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenReceipt(h.entity_id)}
                          disabled={receiptBusyId != null}
                          className="rounded-lg border border-white/10 px-3 py-1 text-xs font-bold text-slate-300 hover:text-white disabled:opacity-50"
                          title={`Reçu de règlement ${h.ref || "sans réf."} (soldes reconstitués)`}
                          aria-label={`Imprimer le reçu ${h.ref || h.entity_id}`}
                        >
                          {receiptBusyId === h.entity_id ? "Chargement…" : "Reçu"}
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </>
  );
}
