// Veloria PoS — Écran : Dépenses (charges d'exploitation).
// En-tête + 4 cartes stats + barre d'outils + table serveur + pagination +
// tiroir détail + formulaire.
import { useEffect, useRef, useState } from "react";
import { Eye, Download, Pencil, Plus, SlidersHorizontal, Trash2, X } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { formatDzd } from "@domain/money/money.ts";
import { downloadCsv } from "@shared/export/csv.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { runBulk } from "@shared/ui/bulk-actions.ts";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Kpi,
  PageHeader,
  Pager,
  RowAction,
  SearchField,
  Select,
  TextInput,
  cn,
} from "@shared/ui/primitives.tsx";
import { isAnyModalOpen } from "@shared/ui/use-busy.ts";
import { useDebouncedTimer } from "@shared/ui/use-debounced-timer.ts";
import { useLoadSeq } from "@shared/ui/use-load-seq.ts";
import { ExpenseDetailsDrawer, ExpenseFormDialog } from "./ExpenseDialogs.tsx";
import {
  expenseNumber,
  expenseStatusLabel,
  expenseStatusTone,
  paymentMethodLabel,
  type Expense,
  type ExpenseMethodFilter,
  type ExpenseSort,
  type ExpenseStatusFilter,
} from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

const PAGE_SIZE = 20;
const EXPORT_MAX = 1000;

interface Stats {
  totalMinor: number;
  monthlyMinor: number;
  paidMinor: number;
  pendingMinor: number;
  categories: string[];
}

export function ExpensesScreen({ notify }: { notify: Notify }): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ExpenseStatusFilter>("all");
  const [methodFilter, setMethodFilter] = useState<ExpenseMethodFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<ExpenseSort>("date_desc");
  const [toolbarOpen, setToolbarOpen] = useState(true);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats>({
    totalMinor: 0,
    monthlyMinor: 0,
    paidMinor: 0,
    pendingMinor: 0,
    categories: [],
  });
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // A-15 : progression du lot (suppressions en série).
  const [bulkLabel, setBulkLabel] = useState("");
  // Confirmation non bloquante (modale applicative).
  const confirmAsync = useConfirm();
  const [drawer, setDrawer] = useState<Expense | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const queryTimer = useDebouncedTimer();
  const searchRef = useRef<HTMLInputElement>(null);

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

  async function loadStats(): Promise<void> {
    try {
      const s = (await api.expenseStats()) as Stats;
      setStats(s);
    } catch {
      /* stats optionnelles */
    }
  }

  // P1-2 : séquence anti-course partagée par load/loadStats.
  const { next: nextSeq, isCurrent: isSeqCurrent } = useLoadSeq();

  async function load(
    q: string,
    cat: string | null,
    status: ExpenseStatusFilter,
    method: ExpenseMethodFilter,
    f: string,
    t: string,
    s: ExpenseSort,
    p: number,
  ): Promise<void> {
    // P1-2 : garde anti-course — un filtre/page changé vite ne peint jamais
    // une page périmée (les IPC n'ont pas d'annulation : on ignore par séquence).
    const seq = nextSeq();
    setLoading(true);
    try {
      const res = (await api.expensesList({
        query: q.trim(),
        category: cat,
        statusFilter: status,
        methodFilter: method,
        from: f === "" ? null : f,
        to: t === "" ? null : t,
        sort: s,
        page: p,
        pageSize: PAGE_SIZE,
      })) as { rows: Expense[]; total: number };
      if (!isSeqCurrent(seq)) return;
      setRows(res.rows);
      setTotal(res.total);
    } catch (err) {
      if (!isSeqCurrent(seq)) return;
      notify(frError(err, "Chargement impossible."), "err");
    } finally {
      if (isSeqCurrent(seq)) setLoading(false);
    }
  }

  // Chargement initial.
  useEffect(() => {
    void loadStats();
    void load("", null, "all", "all", "", "", "date_desc", 1);
  }, []);

  function onQueryChange(q: string): void {
    setQuery(q);
    setPage(1);
    queryTimer.schedule(250, () => {
      void load(q, category, statusFilter, methodFilter, from, to, sort, 1);
    });
  }

  function changeCategory(c: string | null): void {
    setCategory(c);
    setPage(1);
    void load(query, c, statusFilter, methodFilter, from, to, sort, 1);
  }

  function changeStatus(f: ExpenseStatusFilter): void {
    setStatusFilter(f);
    setPage(1);
    void load(query, category, f, methodFilter, from, to, sort, 1);
  }

  function changeMethod(f: ExpenseMethodFilter): void {
    setMethodFilter(f);
    setPage(1);
    void load(query, category, statusFilter, f, from, to, sort, 1);
  }

  function changeRange(f: string, t: string): void {
    setFrom(f);
    setTo(t);
    setPage(1);
    void load(query, category, statusFilter, methodFilter, f, t, sort, 1);
  }

  function changeSort(s: ExpenseSort): void {
    setSort(s);
    setPage(1);
    void load(query, category, statusFilter, methodFilter, from, to, s, 1);
  }

  function changePage(p: number): void {
    setPage(p);
    void load(query, category, statusFilter, methodFilter, from, to, sort, p);
  }

  function refresh(): void {
    setSelection(new Set());
    void loadStats();
    void load(query, category, statusFilter, methodFilter, from, to, sort, page);
  }

  function resetFilters(): void {
    setQuery("");
    setCategory(null);
    setStatusFilter("all");
    setMethodFilter("all");
    setFrom("");
    setTo("");
    setSort("date_desc");
    setPage(1);
    setSelection(new Set());
    void load("", null, "all", "all", "", "", "date_desc", 1);
  }

  function openCreate(): void {
    setEditing(null);
    setFormOpen(true);
  }

  // Raccourci réel Stitch : F8 exporter (dépendances stables via ref).
  const exportAllRef = useRef(exportAll);
  exportAllRef.current = exportAll;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isAnyModalOpen()) return;
      if (e.key === "F8") {
        e.preventDefault();
        void exportAllRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Export CSV [F8] : journal des décaissements (filtres courants, max 1000). */
  async function exportAll(): Promise<void> {
    try {
      const res = (await api.expensesList({
        query: query.trim(),
        category,
        statusFilter,
        methodFilter,
        from: from === "" ? null : from,
        to: to === "" ? null : to,
        sort,
        page: 1,
        pageSize: EXPORT_MAX,
      })) as { rows: Expense[]; total: number };
      if (res.rows.length === 0) {
        notify("Rien à exporter.", "err");
        return;
      }
      if (res.total > EXPORT_MAX) {
        notify(`Export limité aux ${EXPORT_MAX} premières lignes (${res.total} au total).`, "err");
      }
      downloadCsv(
        `depenses-${new Date().toISOString().slice(0, 10)}.csv`,
        res.rows.map((e) => ({
          Numero: expenseNumber(e.id),
          Date: e.created_at.slice(0, 10),
          Description: e.description,
          Categorie: e.category,
          Montant: formatDzd(e.amount_minor),
          Paiement: paymentMethodLabel(e.payment_method),
          Statut: expenseStatusLabel(e.status),
          Reference: e.reference ?? "",
        })),
      );
      notify(`${res.rows.length} ligne(s) exportée(s).`, "ok");
    } catch (e) {
      notify(frError(e, "Export impossible."), "err");
    }
  }

  function openEdit(e: Expense): void {
    setDrawer(null);
    setEditing(e);
    setFormOpen(true);
  }

  async function removeRow(e: Expense): Promise<void> {
    if (
      !(await confirmAsync(
        `Supprimer la dépense « ${e.description} » (${formatDzd(e.amount_minor)}) ?`,
      ))
    )
      return;
    try {
      // P18: UUID figé par dialogue de suppression (retry/double-clic idempotent).
      await api.expenseDelete({ id: e.id, operationId: newOperationId() });
      notify("Dépense supprimée.", "ok");
      refresh();
    } catch (err) {
      notify(frError(err, "Suppression impossible."), "err");
    }
  }

  function toggleSelect(id: number): void {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectPage(): void {
    setSelection((prev) => {
      const next = new Set(prev);
      const allSelected = rows.length > 0 && rows.every((r) => next.has(r.id));
      if (allSelected) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });
  }

  async function deleteSelection(): Promise<void> {
    if (selection.size === 0 || bulkBusy) return;
    if (!(await confirmAsync(`Supprimer ${selection.size} dépense(s) ? Irréversible.`))) return;
    setBulkBusy(true);
    // A-15 : lot à concurrence bornée + progression (les suppressions
    // s'enchaînaient une par une, sans retour visuel).
    const failed: string[] = [];
    const res = await runBulk(
      [...selection],
      async (id) => {
        // P18: UUID frais par suppression (caller-owned : une confirmation
        // = une opération). Chaque ligne est une entité distincte.
        await api.expenseDelete({ id, operationId: newOperationId() });
      },
      {
        onProgress: (processed, total) => setBulkLabel(`Suppression ${processed}/${total}…`),
        // Règle 6 : pas de catch silencieux — les échecs sont listés à l'utilisateur.
        onError: (id, e) => {
          const row = rows.find((r2) => r2.id === id);
          failed.push(`${row ? row.description : `DEP-${id}`} — ${frError(e, "échec")}`);
        },
      },
    );
    if (failed.length === 0) {
      notify(`${res.done}/${selection.size} dépense(s) supprimée(s).`, "ok");
    } else {
      notify(
        `${res.done}/${selection.size} supprimée(s) · échec(s) : ${failed.slice(0, 3).join(" ; ")}`,
        "err",
      );
    }
    setBulkBusy(false);
    setBulkLabel("");
    refresh();
  }

  const allPageSelected = rows.length > 0 && rows.every((r) => selection.has(r.id));

  return (
    <div className="flex h-full flex-col gap-4">
      {/* En-tête Stitch : Dépenses & Charges d'Exploitation · JOURNAL */}
      <PageHeader
        title="Dépenses et charges d'exploitation"
        module="Module 10 · Journal des décaissements"
        period={`${total} dépense(s) · ${formatDzd(stats.totalMinor)} au total · Suivi budgétaire et décaissements · Exercice ${new Date().getFullYear()}`}
        actions={
          <>
            <SearchField
              value={query}
              onChange={onQueryChange}
              placeholder="Rechercher… [F3]"
              ariaLabel="Rechercher une dépense"
              inputRef={searchRef}
              className="w-full max-w-xs"
            />
            {/* P4 : les dates Du/Au vivent dans la barre d'outils (étiquetées) —
                fin du doublon d'en-tête. */}
            <Button
              variant="secondary"
              onClick={() => setToolbarOpen((o) => !o)}
              aria-expanded={toolbarOpen}
              title="Afficher / masquer les filtres"
            >
              <SlidersHorizontal size={16} aria-hidden="true" /> Filtres
            </Button>
            <Button
              variant="secondary"
              onClick={() => void exportAll()}
              title="Exporter en CSV [F8]"
            >
              <Download size={16} aria-hidden="true" /> Exporter
            </Button>
            <Button onClick={openCreate} title="Nouvelle dépense">
              <Plus size={16} aria-hidden="true" /> Nouvelle dépense
            </Button>
          </>
        }
      />

      {/* Cartes statistiques Stitch */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Total mois en cours"
          value={formatDzd(stats.monthlyMinor)}
          sub="Mois en cours"
          accent="#fbbf24"
        />
        <Kpi
          label="Total payé"
          value={formatDzd(stats.paidMinor)}
          sub="Toutes périodes"
          accent="#4edea3"
        />
        <Kpi
          label="Charges fixes en attente"
          value={formatDzd(stats.pendingMinor)}
          sub="À régler"
          accent="#ffb4ab"
        />
        <Kpi
          label="Total période filtrée"
          value={formatDzd(stats.totalMinor)}
          sub="Toutes périodes"
          accent="#cde8ff"
        />
      </div>

      {/* Barre d'outils */}
      {toolbarOpen ? (
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="expenses-search"
            >
              Recherche
            </label>
            <TextInput
              id="expenses-search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Description, N° (DEP-…), référence…"
              aria-label="Recherche dépenses"
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="expenses-category"
            >
              Catégorie
            </label>
            <Select
              id="expenses-category"
              value={category ?? ""}
              onChange={(e) => changeCategory(e.target.value === "" ? null : e.target.value)}
              aria-label="Filtre catégorie"
            >
              <option value="">Toutes</option>
              {stats.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="expenses-status"
            >
              Statut
            </label>
            <Select
              id="expenses-status"
              value={statusFilter}
              onChange={(e) => changeStatus(e.target.value as ExpenseStatusFilter)}
              aria-label="Filtre statut"
            >
              <option value="all">Tous</option>
              <option value="paid">Payées</option>
              <option value="pending">En attente</option>
            </Select>
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="expenses-method"
            >
              Paiement
            </label>
            <Select
              id="expenses-method"
              value={methodFilter}
              onChange={(e) => changeMethod(e.target.value as ExpenseMethodFilter)}
              aria-label="Filtre paiement"
            >
              <option value="all">Tous</option>
              <option value="cash">Espèces</option>
              <option value="cheque">Chèque</option>
              <option value="transfer">Virement</option>
            </Select>
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="expenses-from"
            >
              Du
            </label>
            <TextInput
              id="expenses-from"
              type="date"
              value={from}
              onChange={(e) => changeRange(e.target.value, to)}
              aria-label="Du"
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="expenses-to"
            >
              Au
            </label>
            <TextInput
              id="expenses-to"
              type="date"
              value={to}
              onChange={(e) => changeRange(from, e.target.value)}
              aria-label="Au"
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="expenses-sort"
            >
              Tri
            </label>
            <Select
              id="expenses-sort"
              value={sort}
              onChange={(e) => changeSort(e.target.value as ExpenseSort)}
              aria-label="Tri"
            >
              <option value="date_desc">Date décroissante</option>
              <option value="date_asc">Date croissante</option>
              <option value="amount_desc">Montant décroissant</option>
              <option value="amount_asc">Montant croissant</option>
            </Select>
          </div>
          <Button variant="ghost" onClick={resetFilters} title="Réinitialiser les filtres">
            <X size={15} aria-hidden="true" /> Réinitialiser
          </Button>
        </Card>
      ) : null}

      {/* Sélection multiple → suppression */}
      {selection.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-4 py-2.5 text-sm">
          <strong>{selection.size} sélectionnée(s)</strong>
          <Button variant="secondary" onClick={() => void deleteSelection()} disabled={bulkBusy}>
            <Trash2 size={15} aria-hidden="true" />{" "}
            {bulkBusy ? bulkLabel || "Suppression…" : "Supprimer la sélection"}
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

      {/* Table dépenses */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto">
          {loading && rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500" role="status">
              Chargement…
            </p>
          ) : rows.length === 0 ? (
            <EmptyState
              title="Aucune dépense"
              hint="Enregistrez votre première charge avec le bouton « Dépense »."
            />
          ) : (
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="sticky top-0 bg-[#122131] text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
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
                  <th className="px-3 py-2.5">Numéro</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Catégorie</th>
                  <th className="px-3 py-2.5">Description</th>
                  <th className="px-3 py-2.5">Fournisseur</th>
                  <th className="px-3 py-2.5 text-right">Montant</th>
                  <th className="px-3 py-2.5">Paiement</th>
                  <th className="px-3 py-2.5">Statut</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => setDrawer(e)}
                    className={cn(
                      "cursor-pointer border-t border-white/[0.06] transition-colors hover:bg-amber-400/[0.06]",
                      selection.has(e.id) && "bg-amber-400/[0.08]",
                    )}
                  >
                    <td className="px-3 py-2" onClick={(ev) => ev.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selection.has(e.id)}
                        onChange={() => toggleSelect(e.id)}
                        aria-label={`Sélectionner ${e.description}`}
                        className="h-4 w-4 accent-amber-400"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-bold text-amber-200/90">
                      {expenseNumber(e.id)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-300">
                      {e.expense_date.slice(0, 10)}
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2 text-slate-300">
                      {e.category}
                    </td>
                    <td
                      className="max-w-[220px] truncate px-3 py-2 font-semibold"
                      title={e.description}
                    >
                      {e.description}
                    </td>
                    <td className="max-w-[150px] truncate px-3 py-2 text-slate-300">
                      {e.supplier_name || "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">
                      {formatDzd(e.amount_minor)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-400">
                      {paymentMethodLabel(e.payment_method)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={expenseStatusTone(e.status)}>
                        {expenseStatusLabel(e.status)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2" onClick={(ev) => ev.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <RowAction
                          label={`Voir ${e.description}`}
                          title="Détails de la fiche"
                          onClick={() => setDrawer(e)}
                        >
                          <Eye size={15} aria-hidden="true" />
                        </RowAction>
                        <RowAction
                          label={`Modifier ${e.description}`}
                          title="Modifier"
                          onClick={() => openEdit(e)}
                        >
                          <Pencil size={15} aria-hidden="true" />
                        </RowAction>
                        <RowAction
                          label={`Supprimer ${e.description}`}
                          title="Supprimer"
                          onClick={() => void removeRow(e)}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </RowAction>
                      </div>
                    </td>
                  </tr>
                ))}
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
        <ExpenseDetailsDrawer
          expense={drawer}
          onClose={() => setDrawer(null)}
          onEdit={openEdit}
          onDeleted={refresh}
          notify={notify}
        />
      ) : null}

      {/* Formulaire création / édition */}
      {formOpen ? (
        <ExpenseFormDialog
          expense={editing}
          categories={stats.categories}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={() => {
            setFormOpen(false);
            setEditing(null);
            refresh();
          }}
          notify={notify}
        />
      ) : null}
    </div>
  );
}
