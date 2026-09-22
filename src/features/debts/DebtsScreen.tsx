// Veloria PoS — Écran : Dettes clients + fournisseurs.
// En-tête + 4 cartes stats + barre d'outils + table serveur + pagination +
// tiroir détail + paiement + échéance.
import { useEffect, useRef, useState } from "react";
import { Download, Eye, HandCoins, Pencil, Search, SlidersHorizontal, X } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { formatDzd } from "@domain/money/money.ts";
import { CASHIER_LABEL } from "@shared/formatters/format.ts";
import { downloadCsv } from "@shared/export/csv.ts";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Kpi,
  Pager,
  RowAction,
  Select,
  TextInput,
  cn,
} from "@shared/ui/primitives.tsx";
import { isAnyModalOpen } from "@shared/ui/use-busy.ts";
import { DebtDetailsDrawer, DebtDueDateDialog, DebtPaymentDialog } from "./DebtDialogs.tsx";
import {
  debtStatusLabel,
  debtStatusTone,
  debtTypeLabel,
  dueLabel,
  rowKey,
  settleBandLabel,
  settleBandTone,
  type DebtDueFilter,
  type DebtRow,
  type DebtSettleFilter,
  type DebtSort,
  type DebtStatusFilter,
  type DebtTypeFilter,
} from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

const PAGE_SIZE = 20;

interface Stats {
  debtors: number;
  customerDebtMinor: number;
  supplierDebtMinor: number;
  dueToday: number;
  settleOverdue: number;
  settleSoon: number;
}

export interface DebtDetailData {
  header: Record<string, string | number | null>;
  party: Record<string, string | number | null> | null;
  payments: {
    id: number;
    amount_minor: number;
    method: string;
    reference: string | null;
    payment_date: string;
    notes: string | null;
  }[];
}

export function DebtsScreen({ notify }: { notify: Notify }): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<DebtTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<DebtStatusFilter>("all");
  const [dueFilter, setDueFilter] = useState<DebtDueFilter>("all");
  const [settleFilter, setSettleFilter] = useState<DebtSettleFilter>("all");
  const [sort, setSort] = useState<DebtSort>("due_asc");
  const [toolbarOpen, setToolbarOpen] = useState(true);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<DebtRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [stats, setStats] = useState<Stats>({
    debtors: 0,
    customerDebtMinor: 0,
    supplierDebtMinor: 0,
    dueToday: 0,
    settleOverdue: 0,
    settleSoon: 0,
  });
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<{ type: DebtRow["debt_type"]; data: DebtDetailData } | null>(
    null,
  );
  const [payFor, setPayFor] = useState<DebtRow | null>(null);
  const [dueFor, setDueFor] = useState<DebtRow | null>(null);
  const queryTimer = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  /** Anti-course : seule la dernière page chargée est affichée. */
  const loadSeq = useRef(0);

  // F3 : focus recherche (comme en caisse).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isAnyModalOpen()) return;
      if (e.key === "F3") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    return () => {
      if (queryTimer.current != null) window.clearTimeout(queryTimer.current);
    };
  }, []);

  async function loadStats(): Promise<void> {
    try {
      const s = (await api.debtsStats()) as Partial<Stats>;
      setStats({
        debtors: s.debtors ?? 0,
        customerDebtMinor: s.customerDebtMinor ?? 0,
        supplierDebtMinor: s.supplierDebtMinor ?? 0,
        dueToday: s.dueToday ?? 0,
        settleOverdue: s.settleOverdue ?? 0,
        settleSoon: s.settleSoon ?? 0,
      });
    } catch {
      /* stats optionnelles */
    }
  }

  async function load(
    q: string,
    type: DebtTypeFilter,
    status: DebtStatusFilter,
    due: DebtDueFilter,
    settle: DebtSettleFilter,
    s: DebtSort,
    p: number,
  ): Promise<void> {
    const seq = (loadSeq.current += 1);
    setLoading(true);
    try {
      const res = (await api.debtsList({
        query: q.trim(),
        typeFilter: type,
        statusFilter: status,
        dueFilter: due,
        settleFilter: settle,
        sort: s,
        page: p,
        pageSize: PAGE_SIZE,
      })) as { rows: DebtRow[]; total: number };
      if (seq !== loadSeq.current) return;
      setRows(res.rows);
      setTotal(res.total);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      notify(frError(err, "Chargement impossible."), "err");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  // Chargement initial (surveillance des règlements mensuels clients).
  useEffect(() => {
    void loadStats();
    void load("", "all", "all", "all", "all", "due_asc", 1);
  }, []);

  function onQueryChange(q: string): void {
    setQuery(q);
    setPage(1);
    if (queryTimer.current != null) window.clearTimeout(queryTimer.current);
    queryTimer.current = window.setTimeout(() => {
      void load(q, typeFilter, statusFilter, dueFilter, settleFilter, sort, 1);
    }, 250);
  }

  function changeType(t: DebtTypeFilter): void {
    setTypeFilter(t);
    setPage(1);
    setSelection(new Set());
    void load(query, t, statusFilter, dueFilter, settleFilter, sort, 1);
  }

  function changeStatus(f: DebtStatusFilter): void {
    setStatusFilter(f);
    setPage(1);
    void load(query, typeFilter, f, dueFilter, settleFilter, sort, 1);
  }

  function changeDue(f: DebtDueFilter): void {
    setDueFilter(f);
    setPage(1);
    void load(query, typeFilter, statusFilter, f, settleFilter, sort, 1);
  }

  function changeSettle(f: DebtSettleFilter): void {
    setSettleFilter(f);
    setPage(1);
    void load(query, typeFilter, statusFilter, dueFilter, f, sort, 1);
  }

  function changeSort(s: DebtSort): void {
    setSort(s);
    setPage(1);
    void load(query, typeFilter, statusFilter, dueFilter, settleFilter, s, 1);
  }

  function changePage(p: number): void {
    setPage(p);
    void load(query, typeFilter, statusFilter, dueFilter, settleFilter, sort, p);
  }

  function refresh(): void {
    setSelection(new Set());
    void loadStats();
    void load(query, typeFilter, statusFilter, dueFilter, settleFilter, sort, page);
  }

  function resetFilters(): void {
    setQuery("");
    setTypeFilter("all");
    setStatusFilter("all");
    setDueFilter("all");
    setSettleFilter("all");
    setSort("due_asc");
    setPage(1);
    setSelection(new Set());
    void load("", "all", "all", "all", "all", "due_asc", 1);
  }

  async function openDrawer(r: DebtRow): Promise<void> {
    try {
      const data = (await api.debtDetail({
        debtType: r.debt_type,
        id: r.entity_id,
      })) as DebtDetailData;
      setDrawer({ type: r.debt_type, data });
    } catch (e) {
      notify(frError(e, "Détail indisponible."), "err");
    }
  }

  function toggleSelect(key: string): void {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectPage(): void {
    setSelection((prev) => {
      const next = new Set(prev);
      const keys = rows.map(rowKey);
      const allSelected = keys.length > 0 && keys.every((k) => next.has(k));
      if (allSelected) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  }

  function exportSelection(): void {
    if (exporting) return;
    const list = rows.filter((r) => selection.has(rowKey(r)));
    if (list.length === 0) {
      notify("Rien à exporter.", "err");
      return;
    }
    setExporting(true);
    try {
      downloadCsv(
        `dettes-${new Date().toISOString().slice(0, 10)}.csv`,
        list.map((r) => ({
          Type: debtTypeLabel(r.debt_type),
          Partie: r.party_name,
          Référence: r.ref,
          "Montant initial": formatDzd(r.original_minor),
          Payé: formatDzd(r.paid_minor),
          Reste: formatDzd(r.remaining_minor),
          Échéance: dueLabel(r.due_date),
          Statut: debtStatusLabel(r.status),
          Utilisateur: CASHIER_LABEL,
        })),
      );
      notify(`${list.length} ligne(s) exportée(s).`, "ok");
    } catch {
      notify("Export impossible.", "err");
    } finally {
      setExporting(false);
    }
  }

  const allPageSelected = rows.length > 0 && rows.every((r) => selection.has(rowKey(r)));

  return (
    <div className="flex h-full flex-col gap-4">
      {/* En-tête de page : surveillance des règlements mensuels (jour 1-31) */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold tracking-tight">Dettes</h2>
          <p className="text-xs text-slate-500">
            {total} dette(s) · {stats.settleOverdue} règlement(s) dépassé(s) · {stats.settleSoon}{" "}
            proche(s)
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <TextInput
            ref={searchRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Rechercher… [F3]"
            aria-label="Rechercher une dette"
            className="pl-9"
          />
        </div>
        {/* P4 : les selects Statut/Règlement vivent dans la barre d'outils
            (étiquetés) — fin du doublon d'en-tête. */}
        <Button
          variant="secondary"
          onClick={() => setToolbarOpen((o) => !o)}
          aria-expanded={toolbarOpen}
          title="Afficher / masquer les filtres"
        >
          <SlidersHorizontal size={16} aria-hidden="true" /> Filtres
        </Button>
      </div>

      {/* Cartes statistiques */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi
          label="Règlements dépassés"
          value={String(stats.settleOverdue)}
          sub="Jour mensuel passé"
        />
        <Kpi label="Règlements proches" value={String(stats.settleSoon)} sub="≤ 7 jours" />
        <Kpi label="Dettes clients" value={formatDzd(stats.customerDebtMinor)} sub="Créances" />
        <Kpi label="Échéances du jour" value={String(stats.dueToday)} sub="À relancer" />
      </div>

      {/* Barre d'outils */}
      {toolbarOpen ? (
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="debts-search"
            >
              Recherche
            </label>
            <TextInput
              id="debts-search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Référence, nom, téléphone…"
              aria-label="Recherche dettes"
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="debts-type"
            >
              Type
            </label>
            <Select
              id="debts-type"
              value={typeFilter}
              onChange={(e) => changeType(e.target.value as DebtTypeFilter)}
              aria-label="Filtre type"
            >
              <option value="all">Toutes</option>
              <option value="customer">Clients</option>
              <option value="supplier">Fournisseurs</option>
            </Select>
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="debts-status"
            >
              Statut
            </label>
            <Select
              id="debts-status"
              value={statusFilter}
              onChange={(e) => changeStatus(e.target.value as DebtStatusFilter)}
              aria-label="Filtre statut"
            >
              <option value="all">Tous</option>
              <option value="overdue">En retard</option>
              <option value="due">À régler</option>
            </Select>
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="debts-due"
            >
              Échéance
            </label>
            <Select
              id="debts-due"
              value={dueFilter}
              onChange={(e) => changeDue(e.target.value as DebtDueFilter)}
              aria-label="Filtre échéance"
            >
              <option value="all">Toutes</option>
              <option value="today">Aujourd'hui</option>
              <option value="overdue">Dépassées</option>
              <option value="upcoming">À venir</option>
            </Select>
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="debts-settle"
            >
              Règlement mensuel
            </label>
            <Select
              id="debts-settle"
              value={settleFilter}
              onChange={(e) => changeSettle(e.target.value as DebtSettleFilter)}
              aria-label="Filtre règlement mensuel"
            >
              <option value="all">Tous</option>
              <option value="watch">À surveiller</option>
              <option value="overdue">Dépassé</option>
              <option value="soon">Proche (≤ 7 j)</option>
            </Select>
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="debts-sort"
            >
              Tri
            </label>
            <Select
              id="debts-sort"
              value={sort}
              onChange={(e) => changeSort(e.target.value as DebtSort)}
              aria-label="Tri"
            >
              <option value="due_asc">Échéance proche</option>
              <option value="remaining_desc">Reste décroissant</option>
              <option value="date_desc">Date décroissante</option>
            </Select>
          </div>
          <Button variant="ghost" onClick={resetFilters} title="Réinitialiser les filtres">
            <X size={15} aria-hidden="true" /> Réinitialiser
          </Button>
        </Card>
      ) : null}

      {/* Sélection multiple → export */}
      {selection.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-4 py-2.5 text-sm">
          <strong>{selection.size} sélectionnée(s)</strong>
          <Button variant="secondary" onClick={exportSelection} disabled={exporting}>
            <Download size={15} aria-hidden="true" /> Exporter la sélection (CSV)
          </Button>
          <button
            type="button"
            onClick={() => setSelection(new Set())}
            className="text-xs font-semibold text-slate-400 hover:text-white"
          >
            Tout désélectionner
          </button>
        </div>
      ) : null}

      {/* Table dettes */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto">
          {loading && rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500" role="status">
              Chargement…
            </p>
          ) : rows.length === 0 ? (
            <EmptyState
              title="Aucune dette"
              hint="Ni créance client ni dette fournisseur en cours. Les ventes à crédit alimentent cette page."
            />
          ) : (
            <table className="w-full min-w-[1220px] text-sm">
              <thead className="sticky top-0 bg-[#111a2e] text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectPage}
                      aria-label="Sélectionner la page"
                      className="h-4 w-4 accent-amber-400"
                    />
                  </th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Client / Fournisseur</th>
                  <th className="px-3 py-2.5">Référence</th>
                  <th className="px-3 py-2.5 text-right">Initial</th>
                  <th className="px-3 py-2.5 text-right">Payé</th>
                  <th className="px-3 py-2.5 text-right">Reste</th>
                  <th className="px-3 py-2.5">Échéance</th>
                  <th className="px-3 py-2.5">Règlement (jour)</th>
                  <th className="px-3 py-2.5">Statut</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const key = rowKey(r);
                  return (
                    <tr
                      key={key}
                      onClick={() => void openDrawer(r)}
                      className={cn(
                        "cursor-pointer border-t border-white/[0.06] transition-colors hover:bg-amber-400/[0.06]",
                        selection.has(key) && "bg-amber-400/[0.08]",
                      )}
                    >
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selection.has(key)}
                          onChange={() => toggleSelect(key)}
                          aria-label={`Sélectionner ${r.party_name}`}
                          className="h-4 w-4 accent-amber-400"
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <Badge tone={r.debt_type === "customer" ? "blue" : "amber"}>
                          {debtTypeLabel(r.debt_type)}
                        </Badge>
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2 font-semibold">
                        {r.party_name}
                      </td>
                      <td className="max-w-[140px] truncate px-3 py-2 font-mono text-xs text-slate-300">
                        {r.ref}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                        {formatDzd(r.original_minor)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-300/90">
                        {formatDzd(r.paid_minor)}
                      </td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums text-red-300">
                        {formatDzd(r.remaining_minor)}
                      </td>
                      <td
                        className={cn(
                          "whitespace-nowrap px-3 py-2 tabular-nums",
                          r.status === "overdue" ? "font-bold text-red-300" : "text-slate-300",
                        )}
                      >
                        {dueLabel(r.due_date)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {r.debt_type === "customer" && r.settlement_day != null ? (
                          <span className="flex flex-col gap-1">
                            <span className="text-xs font-bold tabular-nums text-slate-200">
                              Chaque {r.settlement_day} · {r.next_settle ?? "—"}
                            </span>
                            <Badge tone={settleBandTone(r.settle_band)}>
                              {settleBandLabel(r.settle_band)}
                            </Badge>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={debtStatusTone(r.status)}>{debtStatusLabel(r.status)}</Badge>
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <RowAction
                            label={`Voir ${r.party_name}`}
                            title="Détails"
                            onClick={() => void openDrawer(r)}
                          >
                            <Eye size={15} aria-hidden="true" />
                          </RowAction>
                          <RowAction
                            label={`Encaisser ${r.party_name}`}
                            title="Enregistrer un paiement"
                            onClick={() => setPayFor(r)}
                          >
                            <HandCoins size={15} aria-hidden="true" />
                          </RowAction>
                          {r.debt_type === "customer" ? (
                            <RowAction
                              label={`Échéance ${r.ref}`}
                              title="Modifier l'échéance"
                              onClick={() => setDueFor(r)}
                            >
                              <Pencil size={15} aria-hidden="true" />
                            </RowAction>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] px-4 py-3">
          <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={changePage} />
          {loading ? (
            <span className="text-xs text-slate-500" role="status">
              Chargement…
            </span>
          ) : null}
        </div>
      </Card>

      {/* Tiroir détail */}
      {drawer ? (
        <DebtDetailsDrawer
          debtType={drawer.type}
          data={drawer.data}
          onClose={() => setDrawer(null)}
          onPay={(r) => {
            setDrawer(null);
            setPayFor(r);
          }}
          onDueDate={(r) => {
            setDrawer(null);
            setDueFor(r);
          }}
          notify={notify}
        />
      ) : null}

      {/* Paiement */}
      {payFor ? (
        <DebtPaymentDialog
          row={payFor}
          onClose={() => setPayFor(null)}
          onSaved={() => {
            setPayFor(null);
            refresh();
          }}
          notify={notify}
        />
      ) : null}

      {/* Échéance */}
      {dueFor ? (
        <DebtDueDateDialog
          row={dueFor}
          onClose={() => setDueFor(null)}
          onSaved={() => {
            setDueFor(null);
            refresh();
          }}
          notify={notify}
        />
      ) : null}
    </div>
  );
}
