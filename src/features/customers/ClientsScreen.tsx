// Veloria PoS — Écran : Clients (fiches, dettes, règlements).
// En-tête + 4 cartes stats + barre d'outils + table enrichie (relevés) +
// pagination + tiroir détail + formulaire + règlement.
import { useEffect, useRef, useState } from "react";
import { Eye, Pencil, Plus, RotateCcw, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import {
  callChecked,
  enrichedCustomerSearchSchema,
  type EnrichedCustomerRow,
} from "@shared/types/ipc-contracts.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { formatDzd } from "@domain/money/money.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { formatDateTimeFr } from "@shared/formatters/format.ts";
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
import { ClientDetailsDrawer, ClientFormDialog } from "./ClientDialogs.tsx";
import {
  debtLabel,
  debtTone,
  enrichCustomer,
  fullName,
  isArchived,
  sortCustomers,
  type ArchiveFilter,
  type CreditFilter,
  type Customer,
  type CustomerSort,
  type CustomerStatement,
  type EnrichedCustomer,
  type StatementSale,
} from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

const PAGE_SIZE = 20;

interface Stats {
  total: number;
  credit: number;
  debt: number;
  recent: number;
}

type Statement = CustomerStatement;

function enrich(c: Customer, st: Statement | null): EnrichedCustomer {
  return enrichCustomer(c, st);
}

export function ClientsScreen({ notify }: { notify: Notify }): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  const [creditFilter, setCreditFilter] = useState<CreditFilter>("all");
  const [sort, setSort] = useState<CustomerSort>("name_asc");
  const [toolbarOpen, setToolbarOpen] = useState(true);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<EnrichedCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats>({ total: 0, credit: 0, debt: 0, recent: 0 });
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [drawer, setDrawer] = useState<{
    customer: EnrichedCustomer;
    sales: StatementSale[];
  } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const queryTimer = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Confirmation non bloquante (modale applicative).
  const confirmAsync = useConfirm();
  // Anti-course : seul le dernier `load` met à jour l'état (recherche rapide,
  // pagination) ; les chargements périmés sont ignorés sans setState.
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

  /** Ligne serveur → ligne enrichie (agrégats déjà calculés par le main). */
  function toEnriched(c: EnrichedCustomerRow): EnrichedCustomer {
    const { invoice_count, total_purchases_minor, last_sale_at, ...base } = c;
    return {
      ...(base as unknown as Customer),
      invoiceCount: invoice_count,
      totalPurchasesMinor: total_purchases_minor,
      lastSaleAt: last_sale_at,
    };
  }

  async function loadStats(): Promise<void> {
    try {
      const s = (await api.customerStats()) as {
        totalClients: number;
        creditClients: number;
        totalDebtMinor: number;
        recentPaymentsMinor: number;
      };
      setStats({
        total: s.totalClients,
        credit: s.creditClients,
        debt: s.totalDebtMinor,
        recent: s.recentPaymentsMinor,
      });
    } catch {
      /* stats optionnelles */
    }
  }

  async function load(
    q: string,
    arch: ArchiveFilter,
    cred: CreditFilter,
    p: number,
  ): Promise<void> {
    const seq = (loadSeq.current += 1);
    setLoading(true);
    try {
      // UNE requête : recherche + filtre dette + agrégats (factures, achats,
      // dernière vente) calculés côté main — contrat validé, jamais de N+1.
      const res = await callChecked(
        (a) =>
          a.customers.search({
            query: q.trim(),
            page: p,
            pageSize: PAGE_SIZE,
            includeArchived: arch !== "active",
            // P1-3 : le serveur filtre + compte (total réel, plus de filtre client).
            archivedOnly: arch === "archived",
            debtFilter: cred,
          }),
        enrichedCustomerSearchSchema,
      );
      if (seq !== loadSeq.current) return;
      setRows(res.rows.map(toEnriched));
      setTotal(res.total);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      notify(frError(err, "Chargement impossible."), "err");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  // Chargement initial.
  useEffect(() => {
    void loadStats();
    void load("", "active", "all", 1);
  }, []);

  function onQueryChange(q: string): void {
    setQuery(q);
    setPage(1);
    if (queryTimer.current != null) window.clearTimeout(queryTimer.current);
    queryTimer.current = window.setTimeout(() => {
      void load(q, archiveFilter, creditFilter, 1);
    }, 250);
  }

  function changeArchive(a: ArchiveFilter): void {
    setArchiveFilter(a);
    setPage(1);
    setSelection(new Set());
    void load(query, a, creditFilter, 1);
  }

  function changeCredit(c: CreditFilter): void {
    setCreditFilter(c);
    setPage(1);
    void load(query, archiveFilter, c, 1);
  }

  function changePage(p: number): void {
    setPage(p);
    void load(query, archiveFilter, creditFilter, p);
  }

  function refresh(): void {
    setSelection(new Set());
    void loadStats();
    void load(query, archiveFilter, creditFilter, page);
  }

  function resetFilters(): void {
    setQuery("");
    setArchiveFilter("active");
    setCreditFilter("all");
    setPage(1);
    setSelection(new Set());
    void load("", "active", "all", 1);
  }

  function openCreate(): void {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(c: EnrichedCustomer | Customer): void {
    setDrawer(null);
    setEditing(c);
    setFormOpen(true);
  }

  async function openDrawer(c: EnrichedCustomer): Promise<void> {
    try {
      const st = (await api.customerStatement({ id: c.id })) as Statement;
      setDrawer({ customer: enrich(c, st), sales: st.sales });
    } catch {
      setDrawer({ customer: c, sales: [] });
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

  async function archiveSelection(): Promise<void> {
    if (selection.size === 0) return;
    if (!(await confirmAsync(`Archiver ${selection.size} client(s) ?`))) return;
    let done = 0;
    for (const id of selection) {
      try {
        await api.customerArchive({ id, operationId: newOperationId() });
        done += 1;
      } catch {
        /* on continue */
      }
    }
    notify(`${done} client(s) archivé(s).`, done > 0 ? "ok" : "err");
    refresh();
  }

  async function restoreRow(c: EnrichedCustomer): Promise<void> {
    try {
      await api.customerRestore({ id: c.id, operationId: newOperationId() });
      notify(`Client « ${fullName(c)} » restauré.`, "ok");
      refresh();
    } catch (e) {
      notify(frError(e, "Restauration impossible."), "err");
    }
  }

  const visible = sortCustomers(rows, sort);
  const allPageSelected = rows.length > 0 && rows.every((r) => selection.has(r.id));

  return (
    <div className="flex h-full flex-col gap-4">
      {/* En-tête de page */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold tracking-tight">Clients</h2>
          <p className="text-xs text-slate-500">
            {total} client(s) · {stats.credit} endetté(s) · {formatDzd(stats.debt)} de dettes
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
            aria-label="Rechercher un client"
            className="pl-9"
          />
        </div>
        <Button
          variant="secondary"
          onClick={() => setToolbarOpen((o) => !o)}
          aria-expanded={toolbarOpen}
          title="Afficher / masquer les filtres"
        >
          <SlidersHorizontal size={16} aria-hidden="true" /> Filtres
        </Button>
        <Button onClick={openCreate} title="Créer un client">
          <Plus size={16} aria-hidden="true" /> Client
        </Button>
      </div>

      {/* Cartes statistiques */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Clients" value={String(stats.total)} sub="Fiches actives" />
        <Kpi label="Endettés" value={String(stats.credit)} sub="Solde > 0" />
        <Kpi label="Dette totale" value={formatDzd(stats.debt)} sub="Tous clients" />
        <Kpi label="Encaissé (7 j)" value={formatDzd(stats.recent)} sub="Paiements récents" />
      </div>

      {/* Barre d'outils */}
      {toolbarOpen ? (
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="clients-search"
            >
              Recherche
            </label>
            <TextInput
              id="clients-search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Nom ou téléphone…"
              aria-label="Recherche clients"
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="clients-status"
            >
              Statut
            </label>
            <Select
              id="clients-status"
              value={archiveFilter}
              onChange={(e) => changeArchive(e.target.value as ArchiveFilter)}
              aria-label="Filtre statut"
            >
              <option value="active">Actifs</option>
              <option value="all">Tous (+ archivés)</option>
              <option value="archived">Archivés</option>
            </Select>
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="clients-credit"
            >
              Crédit
            </label>
            <Select
              id="clients-credit"
              value={creditFilter}
              onChange={(e) => changeCredit(e.target.value as CreditFilter)}
              aria-label="Filtre crédit"
            >
              <option value="all">Tous</option>
              <option value="with_debt">Avec dette</option>
              <option value="no_debt">Sans dette</option>
              <option value="over_limit">Dépassement</option>
            </Select>
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="clients-sort"
            >
              Tri
            </label>
            <Select
              id="clients-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as CustomerSort)}
              aria-label="Tri"
            >
              <option value="name_asc">Nom A → Z</option>
              <option value="name_desc">Nom Z → A</option>
              <option value="debt_desc">Dette décroissante</option>
              <option value="debt_asc">Dette croissante</option>
              <option value="purchases_desc">Achats décroissants</option>
            </Select>
          </div>
          <Button variant="ghost" onClick={resetFilters} title="Réinitialiser les filtres">
            <X size={15} aria-hidden="true" /> Réinitialiser
          </Button>
        </Card>
      ) : null}

      {/* Sélection multiple */}
      {selection.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-4 py-2.5 text-sm">
          <strong>{selection.size} sélectionné(s)</strong>
          <Button variant="secondary" onClick={() => void archiveSelection()}>
            <Trash2 size={15} aria-hidden="true" /> Archiver la sélection
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

      {/* Table clients */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto">
          {loading && rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500" role="status">
              Chargement…
            </p>
          ) : visible.length === 0 ? (
            <EmptyState
              title="Aucun client"
              hint="Modifiez la recherche ou créez votre premier client avec le bouton « Client »."
            />
          ) : (
            <table className="w-full min-w-[1080px] text-sm">
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
                  <th className="px-3 py-2.5">Client</th>
                  <th className="px-3 py-2.5">Téléphone</th>
                  <th className="px-3 py-2.5">Règlement (jour)</th>
                  <th className="px-3 py-2.5 text-right">Achats</th>
                  <th className="px-3 py-2.5 text-right">Dette</th>
                  <th className="px-3 py-2.5">Dernière vente</th>
                  <th className="px-3 py-2.5">Statut</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => void openDrawer(c)}
                    className={cn(
                      "cursor-pointer border-t border-white/[0.06] transition-colors hover:bg-amber-400/[0.06]",
                      selection.has(c.id) && "bg-amber-400/[0.08]",
                    )}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selection.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        aria-label={`Sélectionner ${fullName(c)}`}
                        className="h-4 w-4 accent-amber-400"
                      />
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2 font-semibold">
                      {fullName(c)}
                    </td>
                    <td className="px-3 py-2 text-slate-300">{c.phone || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-200">
                      {c.settlement_day != null ? (
                        <span className="font-bold">Chaque {c.settlement_day}</span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                      {formatDzd(c.totalPurchasesMinor)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right font-bold tabular-nums",
                        c.outstanding_balance_minor > 0 ? "text-red-300" : "text-slate-500",
                      )}
                    >
                      {formatDzd(c.outstanding_balance_minor)}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {c.lastSaleAt ? formatDateTimeFr(c.lastSaleAt) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={debtTone(c)}>{debtLabel(c)}</Badge>
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <RowAction
                          label={`Voir ${fullName(c)}`}
                          title="Détails"
                          onClick={() => void openDrawer(c)}
                        >
                          <Eye size={15} aria-hidden="true" />
                        </RowAction>
                        {!isArchived(c) ? (
                          <RowAction
                            label={`Modifier ${fullName(c)}`}
                            title="Modifier"
                            onClick={() => openEdit(c)}
                          >
                            <Pencil size={15} aria-hidden="true" />
                          </RowAction>
                        ) : (
                          <RowAction
                            label={`Restaurer ${fullName(c)}`}
                            title="Restaurer"
                            onClick={() => void restoreRow(c)}
                          >
                            <RotateCcw size={15} aria-hidden="true" />
                          </RowAction>
                        )}
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
        <ClientDetailsDrawer
          customer={drawer.customer}
          sales={drawer.sales}
          onClose={() => setDrawer(null)}
          onEdit={openEdit}
          onChanged={refresh}
          notify={notify}
        />
      ) : null}

      {/* Formulaire création / édition */}
      {formOpen ? (
        <ClientFormDialog
          customer={editing}
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
