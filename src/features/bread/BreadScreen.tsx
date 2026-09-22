// Veloria PoS — Écran : Commandes de pain.
// En-tête + 4 cartes stats + barre d'outils + table serveur + pagination +
// tiroir détail + formulaire + statut + encaissement.
import { useEffect, useRef, useState } from "react";
import { Eye, HandCoins, Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
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
import {
  BreadDetailsDrawer,
  BreadFormDialog,
  BreadPayDialog,
  BreadStatusDialog,
} from "./BreadDialogs.tsx";
import {
  isRecurringOrder,
  orderCustomerName,
  orderDisplayName,
  orderStatusLabel,
  orderStatusTone,
  type BreadOrder,
  type BreadRecurringFilter,
  type BreadSort,
  type BreadStatusFilter,
} from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

const PAGE_SIZE = 20;

interface Stats {
  total: number;
  pending: number;
  ready: number;
  delivered: number;
  recurring: number;
}

export interface BreadDetailData {
  order: BreadOrder;
  customer: Record<string, string | number | null> | null;
}

export function BreadScreen({ notify }: { notify: Notify }): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<BreadStatusFilter>("all");
  const [recurringFilter, setRecurringFilter] = useState<BreadRecurringFilter>("all");
  const [customer, setCustomer] = useState("");
  const [orderFrom, setOrderFrom] = useState("");
  const [orderTo, setOrderTo] = useState("");
  const [pickupFrom, setPickupFrom] = useState("");
  // P4 : groupe "Période" repliable (4 filtres de dates).
  const [periodOpen, setPeriodOpen] = useState(false);
  const [pickupTo, setPickupTo] = useState("");
  const [sort, setSort] = useState<BreadSort>("pickup_asc");
  const [toolbarOpen, setToolbarOpen] = useState(true);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<BreadOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    pending: 0,
    ready: 0,
    delivered: 0,
    recurring: 0,
  });
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Confirmation non bloquante (modale applicative).
  const confirmAsync = useConfirm();
  const [drawer, setDrawer] = useState<BreadDetailData | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BreadDetailData | null>(null);
  const [statusFor, setStatusFor] = useState<BreadDetailData | null>(null);
  const [payFor, setPayFor] = useState<BreadDetailData | null>(null);
  const queryTimer = useRef<number | null>(null);
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

  useEffect(() => {
    return () => {
      if (queryTimer.current != null) window.clearTimeout(queryTimer.current);
    };
  }, []);

  interface Filters {
    q: string;
    status: BreadStatusFilter;
    rec: BreadRecurringFilter;
    cust: string;
    of: string;
    ot: string;
    pf: string;
    pt: string;
    s: BreadSort;
  }

  function current(): Filters {
    return {
      q: query,
      status: statusFilter,
      rec: recurringFilter,
      cust: customer,
      of: orderFrom,
      ot: orderTo,
      pf: pickupFrom,
      pt: pickupTo,
      s: sort,
    };
  }

  async function load(f: Filters, p: number): Promise<void> {
    setLoading(true);
    try {
      const res = (await api.breadList({
        query: f.q.trim(),
        status: f.status === "all" ? null : f.status,
        customer: f.cust.trim(),
        recurring: f.rec,
        orderFrom: f.of === "" ? null : f.of,
        orderTo: f.ot === "" ? null : f.ot,
        pickupFrom: f.pf === "" ? null : f.pf,
        pickupTo: f.pt === "" ? null : f.pt,
        sort: f.s,
        page: p,
        pageSize: PAGE_SIZE,
      })) as { rows: BreadOrder[]; total: number };
      setRows(res.rows);
      setTotal(res.total);
    } catch (err) {
      notify(frError(err, "Chargement impossible."), "err");
    } finally {
      setLoading(false);
    }
  }

  async function loadStats(): Promise<void> {
    try {
      const s = (await api.breadStats()) as {
        total: number;
        pending: number;
        ready: number;
        delivered: number;
        recurring?: number;
      };
      setStats({
        total: s.total,
        pending: s.pending,
        ready: s.ready,
        delivered: s.delivered,
        recurring: s.recurring ?? 0,
      });
    } catch {
      /* stats optionnelles */
    }
  }

  // Chargement initial.
  useEffect(() => {
    void loadStats();
    void load(
      {
        q: "",
        status: "all",
        rec: "all",
        cust: "",
        of: "",
        ot: "",
        pf: "",
        pt: "",
        s: "pickup_asc",
      },
      1,
    );
  }, []);

  function onQueryChange(q: string): void {
    setQuery(q);
    setPage(1);
    if (queryTimer.current != null) window.clearTimeout(queryTimer.current);
    queryTimer.current = window.setTimeout(() => {
      void load({ ...current(), q }, 1);
    }, 250);
  }

  function changePage(p: number): void {
    setPage(p);
    void load(current(), p);
  }

  function refresh(): void {
    setSelection(new Set());
    void loadStats();
    void load(current(), page);
  }

  function resetFilters(): void {
    setQuery("");
    setStatusFilter("all");
    setRecurringFilter("all");
    setCustomer("");
    setOrderFrom("");
    setOrderTo("");
    setPickupFrom("");
    setPickupTo("");
    setSort("pickup_asc");
    setPage(1);
    setSelection(new Set());
    void load(
      {
        q: "",
        status: "all",
        rec: "all",
        cust: "",
        of: "",
        ot: "",
        pf: "",
        pt: "",
        s: "pickup_asc",
      },
      1,
    );
  }

  async function openDrawer(o: BreadOrder): Promise<void> {
    try {
      const data = (await api.breadDetail({ id: o.id })) as BreadDetailData;
      setDrawer(data);
    } catch (e) {
      notify(frError(e, "Détail indisponible."), "err");
    }
  }

  async function cancelSelection(): Promise<void> {
    if (selection.size === 0 || bulkBusy) return;
    if (!(await confirmAsync(`Annuler ${selection.size} commande(s) ? Transitions gardées.`)))
      return;
    setBulkBusy(true);
    let done = 0;
    for (const id of selection) {
      try {
        await api.breadStatus({ id, to: "cancelled", operationId: newOperationId() });
        done += 1;
      } catch {
        /* transitions interdites : on continue */
      }
    }
    notify(`${done}/${selection.size} commande(s) annulée(s).`, done > 0 ? "ok" : "err");
    setBulkBusy(false);
    refresh();
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

  const allPageSelected = rows.length > 0 && rows.every((r) => selection.has(r.id));

  return (
    <div className="flex h-full flex-col gap-4">
      {/* En-tête de page (simplifié : nom / client / quantité) */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold tracking-tight">Pain</h2>
          <p className="text-xs text-slate-500">
            {total} commande(s) · {stats.pending} en cours · {stats.recurring} quotidienne(s)
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
            placeholder="Nom, client… [F3]"
            aria-label="Rechercher une commande"
            className="pl-9"
          />
        </div>
        <Select
          value={recurringFilter}
          onChange={(e) => {
            const f = e.target.value as BreadRecurringFilter;
            setRecurringFilter(f);
            setPage(1);
            void load({ ...current(), rec: f }, 1);
          }}
          aria-label="Filtre récurrence"
          title="Récurrence"
        >
          <option value="all">Toutes</option>
          <option value="recurring">Quotidiennes</option>
          <option value="once">Ponctuelles</option>
        </Select>
        <Button
          variant="secondary"
          onClick={() => setToolbarOpen((o) => !o)}
          aria-expanded={toolbarOpen}
          title="Afficher / masquer les filtres"
        >
          <SlidersHorizontal size={16} aria-hidden="true" /> Filtres
        </Button>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          title="Nouvelle commande"
        >
          <Plus size={16} aria-hidden="true" /> Commande
        </Button>
      </div>

      {/* Cartes statistiques */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Commandes" value={String(stats.total)} sub="Toutes" />
        <Kpi label="En cours" value={String(stats.pending)} sub="Nouvelles à prêtes" />
        <Kpi label="Quotidiennes" value={String(stats.recurring)} sub="Récurrentes" />
        <Kpi label="Livrées" value={String(stats.delivered)} sub="Terminées" />
      </div>

      {/* Barre d'outils */}
      {toolbarOpen ? (
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="bread-search"
            >
              Recherche
            </label>
            <TextInput
              id="bread-search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Numéro ou client…"
              aria-label="Recherche commandes"
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="bread-status"
            >
              Statut
            </label>
            <Select
              id="bread-status"
              value={statusFilter}
              onChange={(e) => {
                const f = e.target.value as BreadStatusFilter;
                setStatusFilter(f);
                setPage(1);
                void load({ ...current(), status: f }, 1);
              }}
              aria-label="Filtre statut"
            >
              <option value="all">Tous</option>
              <option value="new">Nouvelles</option>
              <option value="confirmed">Confirmées</option>
              <option value="preparing">En préparation</option>
              <option value="ready">Prêtes</option>
              <option value="delivered">Livrées</option>
              <option value="cancelled">Annulées</option>
            </Select>
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="bread-customer"
            >
              Client
            </label>
            <TextInput
              id="bread-customer"
              value={customer}
              onChange={(e) => {
                setCustomer(e.target.value);
                setPage(1);
                void load({ ...current(), cust: e.target.value }, 1);
              }}
              placeholder="Nom…"
              aria-label="Filtre client"
            />
          </div>
          {/* P4 : les 4 filtres de dates regroupés (repliables). */}
          <fieldset className="rounded-xl border border-white/10 px-3 pb-3">
            <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
              <button
                type="button"
                onClick={() => setPeriodOpen((o) => !o)}
                aria-expanded={periodOpen}
                className="hover:text-slate-200"
              >
                Période {periodOpen ? "▾" : "▸"}
              </button>
            </legend>
            {periodOpen ? (
              <div className="flex flex-wrap gap-3">
                <div>
                  <label
                    className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
                    htmlFor="bread-of"
                  >
                    Commande du
                  </label>
                  <TextInput
                    id="bread-of"
                    type="date"
                    value={orderFrom}
                    onChange={(e) => {
                      setOrderFrom(e.target.value);
                      setPage(1);
                      void load({ ...current(), of: e.target.value }, 1);
                    }}
                    aria-label="Commande du"
                  />
                </div>
                <div>
                  <label
                    className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
                    htmlFor="bread-ot"
                  >
                    Commande au
                  </label>
                  <TextInput
                    id="bread-ot"
                    type="date"
                    value={orderTo}
                    onChange={(e) => {
                      setOrderTo(e.target.value);
                      setPage(1);
                      void load({ ...current(), ot: e.target.value }, 1);
                    }}
                    aria-label="Commande au"
                  />
                </div>
                <div>
                  <label
                    className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
                    htmlFor="bread-pf"
                  >
                    Retrait du
                  </label>
                  <TextInput
                    id="bread-pf"
                    type="date"
                    value={pickupFrom}
                    onChange={(e) => {
                      setPickupFrom(e.target.value);
                      setPage(1);
                      void load({ ...current(), pf: e.target.value }, 1);
                    }}
                    aria-label="Retrait du"
                  />
                </div>
                <div>
                  <label
                    className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
                    htmlFor="bread-pt"
                  >
                    Retrait au
                  </label>
                  <TextInput
                    id="bread-pt"
                    type="date"
                    value={pickupTo}
                    onChange={(e) => {
                      setPickupTo(e.target.value);
                      setPage(1);
                      void load({ ...current(), pt: e.target.value }, 1);
                    }}
                    aria-label="Retrait au"
                  />
                </div>
              </div>
            ) : null}
          </fieldset>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="bread-sort"
            >
              Tri
            </label>
            <Select
              id="bread-sort"
              value={sort}
              onChange={(e) => {
                const s = e.target.value as BreadSort;
                setSort(s);
                setPage(1);
                void load({ ...current(), s }, 1);
              }}
              aria-label="Tri"
            >
              <option value="pickup_asc">Retrait proche</option>
              <option value="pickup_desc">Retrait lointain</option>
              <option value="date_desc">Commande récente</option>
              <option value="amount_desc">Montant décroissant</option>
            </Select>
          </div>
          <Button variant="ghost" onClick={resetFilters} title="Réinitialiser les filtres">
            <X size={15} aria-hidden="true" /> Réinitialiser
          </Button>
        </Card>
      ) : null}

      {/* Sélection multiple → annulation */}
      {selection.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-4 py-2.5 text-sm">
          <strong>{selection.size} sélectionnée(s)</strong>
          <Button variant="secondary" onClick={() => void cancelSelection()} disabled={bulkBusy}>
            <Trash2 size={15} aria-hidden="true" />{" "}
            {bulkBusy ? "Annulation…" : "Annuler la sélection"}
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

      {/* Table commandes */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto">
          {loading && rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500" role="status">
              Chargement…
            </p>
          ) : rows.length === 0 ? (
            <EmptyState
              title="Aucune commande"
              hint="Créez votre première commande avec le bouton « Commande »."
            />
          ) : (
            <table className="w-full min-w-[980px] text-sm">
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
                  <th className="px-3 py-2.5">Commande</th>
                  <th className="px-3 py-2.5">Client</th>
                  <th className="px-3 py-2.5 text-right">Qté</th>
                  <th className="px-3 py-2.5">Récurrence</th>
                  <th className="px-3 py-2.5">Retrait</th>
                  <th className="px-3 py-2.5">Statut</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => void openDrawer(o)}
                    className={cn(
                      "cursor-pointer border-t border-white/[0.06] transition-colors hover:bg-amber-400/[0.06]",
                      selection.has(o.id) && "bg-amber-400/[0.08]",
                    )}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selection.has(o.id)}
                        onChange={() => toggleSelect(o.id)}
                        aria-label={`Sélectionner ${o.order_number}`}
                        className="h-4 w-4 accent-amber-400"
                      />
                    </td>
                    <td className="max-w-[220px] px-3 py-2">
                      <div className="truncate font-bold">{orderDisplayName(o)}</div>
                      <div className="font-mono text-[11px] text-slate-500">{o.order_number}</div>
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2">{orderCustomerName(o)}</td>
                    <td className="px-3 py-2 text-right text-lg font-extrabold tabular-nums">
                      {o.quantity}
                    </td>
                    <td className="px-3 py-2">
                      {isRecurringOrder(o) ? (
                        <Badge tone="amber">Quotidienne</Badge>
                      ) : (
                        <span className="text-xs text-slate-500">Ponctuelle</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-300">
                      {o.pickup_date.slice(0, 10)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={orderStatusTone(o.order_status)}>
                        {orderStatusLabel(o.order_status)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <RowAction
                          label={`Voir ${o.order_number}`}
                          title="Détails"
                          onClick={() => void openDrawer(o)}
                        >
                          <Eye size={15} aria-hidden="true" />
                        </RowAction>
                        {o.remaining_amount_minor > 0 ? (
                          <RowAction
                            label={`Encaisser ${o.order_number}`}
                            title="Encaisser"
                            onClick={() => setPayFor({ order: o, customer: null })}
                          >
                            <HandCoins size={15} aria-hidden="true" />
                          </RowAction>
                        ) : null}
                        {o.order_status !== "delivered" && o.order_status !== "cancelled" ? (
                          <RowAction
                            label={`Modifier ${o.order_number}`}
                            title="Modifier"
                            onClick={() => void openEdit(o)}
                          >
                            <Pencil size={15} aria-hidden="true" />
                          </RowAction>
                        ) : null}
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
        <BreadDetailsDrawer
          data={drawer}
          onClose={() => setDrawer(null)}
          onEdit={(d) => {
            setDrawer(null);
            setEditing(d);
            setFormOpen(true);
          }}
          onStatus={(d) => {
            setDrawer(null);
            setStatusFor(d);
          }}
          onPay={(d) => {
            setDrawer(null);
            setPayFor(d);
          }}
          onChanged={refresh}
          notify={notify}
        />
      ) : null}

      {/* Formulaire création / édition */}
      {formOpen ? (
        <BreadFormDialog
          editing={editing}
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

      {/* Statut */}
      {statusFor ? (
        <BreadStatusDialog
          data={statusFor}
          onClose={() => setStatusFor(null)}
          onSaved={() => {
            setStatusFor(null);
            refresh();
          }}
          notify={notify}
        />
      ) : null}

      {/* Encaissement */}
      {payFor ? (
        <BreadPayDialog
          data={payFor}
          onClose={() => setPayFor(null)}
          onSaved={() => {
            setPayFor(null);
            refresh();
          }}
          notify={notify}
        />
      ) : null}
    </div>
  );

  async function openEdit(o: BreadOrder): Promise<void> {
    try {
      const data = (await api.breadDetail({ id: o.id })) as BreadDetailData;
      setEditing(data);
      setFormOpen(true);
    } catch (e) {
      notify(frError(e, "Détail indisponible."), "err");
    }
  }
}
