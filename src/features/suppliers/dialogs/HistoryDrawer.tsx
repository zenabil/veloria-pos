// Veloria PoS — Fournisseurs : tiroir détail + formulaire + paiement + historique.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useMemo, useState, Fragment } from "react";

import { formatDzd, multiplyMinorByQuantity } from "@domain/money/money.ts";

import { Badge, EmptyState, Pager, Select, TextInput, cn } from "@shared/ui/primitives.tsx";
import type { SupplierStatement } from "../SuppliersScreen.tsx";
import {
  PAYMENT_METHOD_LABELS,
  intakeNumber,
  intakeStatusLabel,
  intakeStatusTone,
  supplierCode,
  type StatementIntake,
} from "../types.ts";

import { totalPaid, totalPurchases } from "./common.ts";

// ---------------------------------------------------------------------------
// Historique des achats (onglets Achats / Paiements).
// ---------------------------------------------------------------------------

const HISTORY_PAGE_SIZE = 15;

/** Total de ligne en centimes via le domaine (gardé), jamais de float en UI. */
function formatLineTotalSafe(unitPriceMinor: unknown, qty: unknown): string {
  try {
    if (typeof unitPriceMinor !== "number" || typeof qty !== "number") return "—";
    return formatDzd(multiplyMinorByQuantity(unitPriceMinor, qty));
  } catch {
    return "—";
  }
}

export function SupplierHistoryDrawer({
  statement,
  initialTab,
  onClose,
}: {
  statement: SupplierStatement;
  initialTab: "purchases" | "payments";
  onClose: () => void;
}): React.JSX.Element {
  const s = statement.supplier;
  const [tab, setTab] = useState<"purchases" | "payments">(initialTab);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<"all" | "committed" | "draft" | "cancelled">("all");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const itemsByIntake = useMemo(() => {
    const map = new Map<number, typeof statement.intakeItems>();
    for (const it of statement.intakeItems) {
      const list = map.get(it.stock_intake_id) ?? [];
      list.push(it);
      map.set(it.stock_intake_id, list);
    }
    return map;
  }, [statement.intakeItems]);

  const purchases = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return statement.intakes.filter((i) => {
      if (status !== "all" && i.status !== status) return false;
      const day = (i.invoice_date ?? i.created_at).slice(0, 10);
      if (from !== "" && day < from) return false;
      if (to !== "" && day > to) return false;
      if (needle !== "") {
        const hay = `${intakeNumber(i)} ${i.invoice_number ?? ""} ${i.notes ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [statement.intakes, q, from, to, status]);

  const payments = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return statement.payments.filter((p) => {
      const day = p.payment_date.slice(0, 10);
      if (from !== "" && day < from) return false;
      if (to !== "" && day > to) return false;
      if (needle !== "") {
        const hay =
          `${p.reference ?? ""} ${p.notes ?? ""} ${PAYMENT_METHOD_LABELS[p.method] ?? "—"}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [statement.payments, q, from, to]);

  function resetPage(): void {
    setPage(1);
  }

  const totalPages =
    tab === "purchases"
      ? Math.max(1, Math.ceil(purchases.length / HISTORY_PAGE_SIZE))
      : Math.max(1, Math.ceil(payments.length / HISTORY_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagePurchases = purchases.slice(
    (safePage - 1) * HISTORY_PAGE_SIZE,
    safePage * HISTORY_PAGE_SIZE,
  );
  const pagePayments = payments.slice(
    (safePage - 1) * HISTORY_PAGE_SIZE,
    safePage * HISTORY_PAGE_SIZE,
  );

  function toggleExpand(id: number): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Historique ${s.name}`}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px]"
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-0 right-0 top-0 flex w-full max-w-[640px] flex-col border-l border-white/10 bg-[#0d1c2d] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-2 border-b border-white/[0.07] p-5">
          <div className="min-w-0">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
              {supplierCode(s)}
            </div>
            <h2 className="mt-1 truncate text-xl font-extrabold tracking-tight">{s.name}</h2>
            <div className="mt-1 text-xs tabular-nums text-slate-400">
              Achats : {formatDzd(totalPurchases(statement))} · Payé :{" "}
              {formatDzd(totalPaid(statement))} · Dette : {formatDzd(s.outstanding_balance_minor)}
            </div>
          </div>
          <button
            type="button"
            aria-label="Fermer l'historique"
            title="Fermer [Échap]"
            onClick={onClose}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
            className="rounded-lg px-2.5 py-1 text-lg leading-none text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="flex gap-1 border-b border-white/[0.07] px-5 pt-3" role="tablist">
          {(
            [
              ["purchases", `Achats (${purchases.length})`],
              ["payments", `Paiements (${payments.length})`],
            ] as ["purchases" | "payments", string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id);
                resetPage();
              }}
              className={cn(
                "rounded-t-xl px-4 py-2 text-sm font-bold transition-colors",
                tab === id ? "bg-amber-400/15 text-amber-200" : "text-slate-400 hover:text-white",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 p-5 pb-0 sm:grid-cols-4">
          <TextInput
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              resetPage();
            }}
            placeholder="Rechercher…"
            aria-label="Rechercher dans l'historique"
          />
          <TextInput
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              resetPage();
            }}
            aria-label="Du"
            title="Du"
          />
          <TextInput
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              resetPage();
            }}
            aria-label="Au"
            title="Au"
          />
          {tab === "purchases" ? (
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as typeof status);
                resetPage();
              }}
              aria-label="Filtre statut"
            >
              <option value="all">Tous statuts</option>
              <option value="committed">Validées</option>
              <option value="draft">Brouillons</option>
              <option value="cancelled">Annulées</option>
            </Select>
          ) : (
            <div className="hidden sm:block" />
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {tab === "purchases" ? (
            pagePurchases.length === 0 ? (
              <EmptyState title="Aucun achat" hint="Modifiez les filtres." />
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#122131] text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">N° Bon</th>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5 text-right">Total</th>
                    <th className="px-3 py-2.5">Statut</th>
                    <th className="px-3 py-2.5 text-right">Détail</th>
                  </tr>
                </thead>
                <tbody>
                  {pagePurchases.map((i) => (
                    <Fragment key={i.id}>
                      <tr className="border-t border-white/[0.06] hover:bg-amber-400/[0.06]">
                        <td className="px-3 py-2 font-mono text-xs font-bold">{intakeNumber(i)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-400">
                          {(i.invoice_date ?? i.created_at).slice(0, 10)}
                        </td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums">
                          {formatDzd(i.total_minor)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={intakeStatusTone(i.status)}>
                            {intakeStatusLabel(i.status)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => toggleExpand(i.id)}
                            aria-expanded={expanded.has(i.id)}
                            aria-label={`Détail ${intakeNumber(i)}`}
                            className="rounded-lg px-2 py-1 text-xs font-bold text-amber-200 hover:bg-amber-400/10"
                          >
                            {expanded.has(i.id) ? "Masquer" : "Voir"}
                          </button>
                        </td>
                      </tr>
                      {expanded.has(i.id) ? (
                        <tr className="border-t border-white/[0.06]">
                          <td colSpan={5} className="bg-black/25 px-3 py-2">
                            <IntakeItemsTable intake={i} items={itemsByIntake.get(i.id) ?? []} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )
          ) : pagePayments.length === 0 ? (
            <EmptyState title="Aucun paiement" hint="Modifiez les filtres." />
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#122131] text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Moyen</th>
                  <th className="px-3 py-2.5">Référence</th>
                  <th className="px-3 py-2.5 text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {pagePayments.map((p) => (
                  <tr key={p.id} className="border-t border-white/[0.06]">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-400">
                      {p.payment_date.slice(0, 10)}
                    </td>
                    <td className="px-3 py-2">{PAYMENT_METHOD_LABELS[p.method] ?? "—"}</td>
                    <td className="max-w-[160px] truncate px-3 py-2 text-slate-300">
                      {p.reference || "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-emerald-300/90">
                      {formatDzd(p.amount_minor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="border-t border-white/[0.07] px-4 py-3">
          <Pager
            page={safePage}
            pageSize={HISTORY_PAGE_SIZE}
            total={tab === "purchases" ? purchases.length : payments.length}
            onPage={setPage}
          />
        </div>
      </aside>
    </div>
  );
}

function IntakeItemsTable({
  intake,
  items,
}: {
  intake: StatementIntake;
  items: SupplierStatement["intakeItems"];
}): React.JSX.Element {
  if (items.length === 0) {
    return <p className="py-1 text-xs text-slate-500">Aucune ligne détaillée.</p>;
  }
  return (
    <table className="w-full text-xs">
      <thead className="text-left uppercase tracking-[0.1em] text-slate-500">
        <tr>
          <th className="py-1 pr-2">Produit</th>
          <th className="py-1 pr-2 text-right">Qté</th>
          <th className="py-1 pr-2 text-right">Prix unit.</th>
          <th className="py-1 text-right">Coût total</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, idx) => (
          <tr key={`${intake.id}-${idx}`} className="border-t border-white/[0.06]">
            <td className="py-1 pr-2">{it.product_name_snapshot}</td>
            <td className="py-1 pr-2 text-right tabular-nums">
              {it.quantity_received}
              {it.quantity_damaged > 0 ? (
                <span className="text-red-300"> (−{it.quantity_damaged} abîm.)</span>
              ) : null}
            </td>
            <td className="py-1 pr-2 text-right tabular-nums">
              {formatDzd(it.purchase_price_minor)}
            </td>
            <td className="py-1 text-right font-bold tabular-nums">
              {formatLineTotalSafe(it.purchase_price_minor, it.quantity_received)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
