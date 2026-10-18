// Veloria PoS — Écran : Proformas / Devis.
// En-tête + 4 cartes stats + barre d'outils + table serveur + pagination +
// tiroir détail + formulaire + conversion.
import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Download,
  Eye,
  FileCheck,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { newOperationId } from "@domain/common/ids.ts";
import { formatDzd } from "@domain/money/money.ts";
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
import { downloadCsv } from "@shared/export/csv.ts";
import { useLoadSeq } from "@shared/ui/use-load-seq.ts";
import {
  ProformaConversionDialog,
  ProformaDetailsDrawer,
  ProformaFormDialog,
} from "./ProformaDialogs.tsx";
import {
  isProformaEditable,
  proformaStatusLabel,
  proformaStatusTone,
  type Proforma,
  type ProformaSort,
  type ProformaStatusFilter,
} from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

const PAGE_SIZE = 20;

interface Stats {
  total: number;
  draft: number;
  pending: number;
  converted: number;
}

export interface ProformaDetailData {
  proforma: Proforma;
  items: {
    product_id: number | null;
    product_name_snapshot: string;
    unit_price_minor: number;
    quantity: number;
    line_total_minor: number;
  }[];
}

export function ProformasScreen({ notify }: { notify: Notify }): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerQ, setCustomerQ] = useState("");
  const [customerResults, setCustomerResults] = useState<{ id: number; name: string }[]>([]);
  // Total serveur : si > 8 affichés, hint « affinez » au lieu de tronquer en silence.
  const [customerTotal, setCustomerTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<ProformaStatusFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<ProformaSort>("date_desc");
  const [toolbarOpen, setToolbarOpen] = useState(true);
  const [page, setPage] = useState(1);
  // P4 : menu d'actions par ligne (une seule icône, le reste en overflow).
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [rows, setRows] = useState<Proforma[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats>({ total: 0, draft: 0, pending: 0, converted: 0 });
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Confirmation non bloquante (modale applicative).
  const confirmAsync = useConfirm();
  const [drawer, setDrawer] = useState<ProformaDetailData | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProformaDetailData | null>(null);
  const [duplicating, setDuplicating] = useState<ProformaDetailData | null>(null);
  const [converting, setConverting] = useState<ProformaDetailData | null>(null);
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
      const s = (await api.proformaStats()) as Stats;
      setStats(s);
    } catch {
      /* stats optionnelles */
    }
  }

  // P1-2 : séquence anti-course partagée par load/loadStats.
  const { next: nextSeq, isCurrent: isSeqCurrent } = useLoadSeq();

  async function load(
    q: string,
    cust: number | null,
    status: ProformaStatusFilter,
    f: string,
    t: string,
    s: ProformaSort,
    p: number,
  ): Promise<void> {
    const seq = nextSeq();
    setLoading(true);
    try {
      const res = (await api.proformasList({
        query: q.trim(),
        customerId: cust,
        status: status === "all" ? null : status,
        from: f === "" ? null : f,
        to: t === "" ? null : t,
        sort: s,
        page: p,
        pageSize: PAGE_SIZE,
      })) as { rows: Proforma[]; total: number };
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
    void load("", null, "all", "", "", "date_desc", 1);
  }, []);

  function onQueryChange(q: string): void {
    setQuery(q);
    setPage(1);
    queryTimer.schedule(250, () => {
      void load(q, customerId, statusFilter, from, to, sort, 1);
    });
  }

  function changeStatus(f: ProformaStatusFilter): void {
    setStatusFilter(f);
    setPage(1);
    void load(query, customerId, f, from, to, sort, 1);
  }

  function changeRange(f: string, t: string): void {
    setFrom(f);
    setTo(t);
    setPage(1);
    void load(query, customerId, statusFilter, f, t, sort, 1);
  }

  function changeSort(s: ProformaSort): void {
    setSort(s);
    setPage(1);
    void load(query, customerId, statusFilter, from, to, s, 1);
  }

  function changePage(p: number): void {
    setPage(p);
    void load(query, customerId, statusFilter, from, to, sort, p);
  }

  function refresh(): void {
    setSelection(new Set());
    void loadStats();
    void load(query, customerId, statusFilter, from, to, sort, page);
  }

  function resetFilters(): void {
    setQuery("");
    setCustomerId(null);
    setCustomerName("");
    setCustomerQ("");
    setCustomerResults([]);
    setCustomerTotal(0);
    setStatusFilter("all");
    setFrom("");
    setTo("");
    setSort("date_desc");
    setPage(1);
    setSelection(new Set());
    void load("", null, "all", "", "", "date_desc", 1);
  }

  async function searchCustomers(): Promise<void> {
    if (customerQ.trim().length < 2) return;
    try {
      const res = (await api.customerSearch({
        query: customerQ.trim(),
        page: 1,
        pageSize: 8,
      })) as { rows: { id: number; first_name: string; last_name: string }[]; total: number };
      setCustomerResults(
        res.rows.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() })),
      );
      setCustomerTotal(typeof res.total === "number" ? res.total : res.rows.length);
    } catch (e) {
      // Journal seul (recherche d'arrière-plan, anti-spam de toasts).
      console.error("[Veloria] proformas : clients illisibles pour la recherche", e);
      setCustomerResults([]);
      setCustomerTotal(0);
    }
  }

  function pickCustomer(id: number | null, name: string): void {
    setCustomerId(id);
    setCustomerName(name);
    setCustomerResults([]);
    setCustomerTotal(0);
    setCustomerQ("");
    setPage(1);
    void load(query, id, statusFilter, from, to, sort, 1);
  }

  async function openDrawer(p: Proforma): Promise<void> {
    try {
      const data = (await api.proformaDetail({ id: p.id })) as ProformaDetailData;
      setDrawer(data);
    } catch (e) {
      notify(frError(e, "Détail indisponible."), "err");
    }
  }

  async function removeRow(p: Proforma): Promise<void> {
    if (!(await confirmAsync(`Supprimer le devis ${p.proforma_number} ?`))) return;
    try {
      // M-2: caller-owned operation (one confirmed action = one operation).
      await api.proformaDelete({ id: p.id, operationId: newOperationId() });
      notify("Devis supprimé.", "ok");
      refresh();
    } catch (e) {
      notify(frError(e, "Suppression impossible."), "err");
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
    if (!(await confirmAsync(`Supprimer ${selection.size} devis ? Convertis exclus (refusés).`)))
      return;
    setBulkBusy(true);
    let done = 0;
    for (const id of selection) {
      try {
        await api.proformaDelete({ id, operationId: newOperationId() });
        done += 1;
      } catch {
        /* convertis refusés : on continue */
      }
    }
    notify(`${done}/${selection.size} devis supprimé(s).`, done > 0 ? "ok" : "err");
    setBulkBusy(false);
    refresh();
  }

  function exportCsv(): void {
    if (rows.length === 0) {
      notify("Rien à exporter.", "err");
      return;
    }
    try {
      downloadCsv(
        `devis-${new Date().toISOString().slice(0, 10)}.csv`,
        rows.map((p) => ({
          Numéro: p.proforma_number,
          Date: p.created_at.slice(0, 10),
          Validité: p.due_date ? p.due_date.slice(0, 10) : "",
          Client: p.customer_name || "",
          Total: formatDzd(p.total_minor),
          Statut: proformaStatusLabel(p.status),
        })),
      );
      notify(`${rows.length} ligne(s) exportée(s).`, "ok");
    } catch {
      notify("Export impossible.", "err");
    }
  }

  const allPageSelected = rows.length > 0 && rows.every((r) => selection.has(r.id));

  return (
    <div className="flex h-full flex-col gap-4">
      {/* En-tête Stitch : Factures Proforma & Devis · Mode Émission Ouvert */}
      <PageHeader
        title="Devis (proformas)"
        module="Mode Émission Ouvert"
        period={`${total} devis · ${stats.pending} en attente/négociation · ${stats.converted} converti(s) en vente`}
        actions={
          <>
            <SearchField
              value={query}
              onChange={onQueryChange}
              placeholder="N° Devis PRF-… [F3]"
              ariaLabel="Rechercher un devis"
              inputRef={searchRef}
              className="w-full max-w-xs"
            />
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
                setDuplicating(null);
                setFormOpen(true);
              }}
              title="Nouveau devis"
            >
              <Plus size={16} aria-hidden="true" /> Nouvelle Proforma
            </Button>
            <Button variant="secondary" onClick={exportCsv} title="Exporter la liste (CSV)">
              <Download size={16} aria-hidden="true" /> CSV
            </Button>
          </>
        }
      />

      {/* Cartes statistiques Stitch */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Proformas du Mois"
          value={String(stats.total)}
          sub="Devis émis"
          accent="#fbbf24"
        />
        <Kpi
          label="En Attente / Négociation"
          value={String(stats.pending)}
          sub="Relances requises"
          accent="#8ed0ff"
        />
        <Kpi
          label="Converties en Vente"
          value={String(stats.converted)}
          sub="Devenues factures"
          accent="#4edea3"
        />
        <Kpi label="Brouillons" value={String(stats.draft)} sub="Modifiables" accent="#cde8ff" />
      </div>

      {/* Barre d'outils */}
      {toolbarOpen ? (
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="proformas-search"
            >
              Recherche
            </label>
            <TextInput
              id="proformas-search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Numéro ou client…"
              aria-label="Recherche devis"
            />
          </div>
          <div className="min-w-[200px]">
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="proformas-customer"
            >
              Client
            </label>
            {customerId != null ? (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-black/25 px-3 py-2.5 text-sm">
                <span className="truncate font-semibold">{customerName}</span>
                <button
                  type="button"
                  onClick={() => pickCustomer(null, "")}
                  className="shrink-0 text-slate-400 hover:text-white"
                  aria-label="Retirer le filtre client"
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <TextInput
                  id="proformas-customer"
                  value={customerQ}
                  onChange={(e) => setCustomerQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void searchCustomers();
                    }
                  }}
                  placeholder="Nom…"
                  aria-label="Filtrer par client"
                />
                <Button type="button" variant="secondary" onClick={() => void searchCustomers()}>
                  <Search size={15} aria-hidden="true" />
                </Button>
              </div>
            )}
            {customerResults.length > 0 ? (
              <ul className="mt-2 max-h-28 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10">
                {customerResults.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => pickCustomer(c.id, c.name)}
                      className="w-full px-3 py-1.5 text-left text-sm hover:bg-amber-400/10"
                    >
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {/* Slot à hauteur constante (pas de saut de mise en page). */}
            <p className="mt-1 min-h-[1rem] text-xs font-semibold text-slate-500" role="status">
              {customerTotal > customerResults.length
                ? `+${customerTotal - customerResults.length} autre(s) — affinez la recherche.`
                : ""}
            </p>
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="proformas-status"
            >
              Statut
            </label>
            <Select
              id="proformas-status"
              value={statusFilter}
              onChange={(e) => changeStatus(e.target.value as ProformaStatusFilter)}
              aria-label="Filtre statut"
            >
              <option value="all">Tous</option>
              <option value="draft">Brouillons</option>
              <option value="sent">Envoyés</option>
              <option value="converted">Convertis</option>
              <option value="cancelled">Annulés</option>
            </Select>
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="proformas-from"
            >
              Du
            </label>
            <TextInput
              id="proformas-from"
              type="date"
              value={from}
              onChange={(e) => changeRange(e.target.value, to)}
              aria-label="Du"
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="proformas-to"
            >
              Au
            </label>
            <TextInput
              id="proformas-to"
              type="date"
              value={to}
              onChange={(e) => changeRange(from, e.target.value)}
              aria-label="Au"
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="proformas-sort"
            >
              Tri
            </label>
            <Select
              id="proformas-sort"
              value={sort}
              onChange={(e) => changeSort(e.target.value as ProformaSort)}
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
          <strong>{selection.size} sélectionné(s)</strong>
          <Button variant="secondary" onClick={() => void deleteSelection()} disabled={bulkBusy}>
            <Trash2 size={15} aria-hidden="true" />{" "}
            {bulkBusy ? "Suppression…" : "Supprimer la sélection"}
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

      {/* Table devis */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto">
          {loading && rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500" role="status">
              Chargement…
            </p>
          ) : rows.length === 0 ? (
            <EmptyState
              title="Aucun devis"
              hint="Créez votre premier devis avec le bouton « Devis » (ou F4 en caisse)."
            />
          ) : (
            <table className="w-full min-w-[980px] text-sm">
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
                  <th className="px-3 py-2.5">Validité</th>
                  <th className="px-3 py-2.5">Client</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                  <th className="px-3 py-2.5">Statut</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => void openDrawer(p)}
                    className={cn(
                      "cursor-pointer border-t border-white/[0.06] transition-colors hover:bg-amber-400/[0.06]",
                      selection.has(p.id) && "bg-amber-400/[0.08]",
                    )}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selection.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        aria-label={`Sélectionner ${p.proforma_number}`}
                        className="h-4 w-4 accent-amber-400"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-bold text-amber-200/90">
                      {p.proforma_number}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-300">
                      {p.created_at.slice(0, 10)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-400">
                      {p.due_date ? p.due_date.slice(0, 10) : "—"}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2">{p.customer_name || "—"}</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">
                      {formatDzd(p.total_minor)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={proformaStatusTone(p.status)}>
                        {proformaStatusLabel(p.status)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <RowAction
                          label={`Voir ${p.proforma_number}`}
                          title="Détails de la fiche"
                          onClick={() => void openDrawer(p)}
                        >
                          <Eye size={15} aria-hidden="true" />
                        </RowAction>
                        {/* P4 : actions secondaires dans un menu (une seule icône par ligne). */}
                        <div className="relative">
                          <RowAction
                            label={`Actions ${p.proforma_number}`}
                            title="Plus d'actions"
                            onClick={() => setMenuFor((v) => (v === p.id ? null : p.id))}
                          >
                            <MoreHorizontal size={15} aria-hidden="true" />
                          </RowAction>
                          {menuFor === p.id ? (
                            <>
                              <button
                                type="button"
                                aria-label="Fermer le menu"
                                className="fixed inset-0 z-10 cursor-default"
                                onClick={() => setMenuFor(null)}
                              />
                              <div
                                role="menu"
                                className="absolute right-0 z-20 mt-1 w-52 space-y-1 rounded-xl border border-white/10 bg-[#122131] p-2 shadow-xl"
                              >
                                {isProformaEditable(p.status) ? (
                                  <RowAction
                                    label={`Modifier ${p.proforma_number}`}
                                    title="Modifier"
                                    onClick={() => {
                                      setMenuFor(null);
                                      void openEdit(p);
                                    }}
                                  >
                                    <Pencil size={15} aria-hidden="true" /> Modifier
                                  </RowAction>
                                ) : null}
                                {p.status === "draft" || p.status === "sent" ? (
                                  <RowAction
                                    label={`Convertir ${p.proforma_number}`}
                                    title="Convertir en facture"
                                    onClick={() => {
                                      setMenuFor(null);
                                      void openConvert(p);
                                    }}
                                  >
                                    <FileCheck size={15} aria-hidden="true" /> Convertir
                                  </RowAction>
                                ) : null}
                                {p.status !== "converted" ? (
                                  <RowAction
                                    label={`Dupliquer ${p.proforma_number}`}
                                    title="Dupliquer"
                                    onClick={() => {
                                      setMenuFor(null);
                                      void openDuplicate(p);
                                    }}
                                  >
                                    <Copy size={15} aria-hidden="true" /> Dupliquer
                                  </RowAction>
                                ) : null}
                                {p.status !== "converted" ? (
                                  <RowAction
                                    label={`Supprimer ${p.proforma_number}`}
                                    title="Supprimer"
                                    onClick={() => {
                                      setMenuFor(null);
                                      void removeRow(p);
                                    }}
                                  >
                                    <Trash2 size={15} aria-hidden="true" /> Supprimer
                                  </RowAction>
                                ) : null}
                              </div>
                            </>
                          ) : null}
                        </div>
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
        <ProformaDetailsDrawer
          data={drawer}
          onClose={() => setDrawer(null)}
          onEdit={(d) => {
            setDrawer(null);
            setEditing(d);
            setDuplicating(null);
            setFormOpen(true);
          }}
          onConvert={(d) => {
            setDrawer(null);
            setConverting(d);
          }}
          onDuplicate={(d) => {
            setDrawer(null);
            setEditing(null);
            setDuplicating(d);
            setFormOpen(true);
          }}
          onChanged={refresh}
          notify={notify}
        />
      ) : null}

      {/* Formulaire création / édition / duplication */}
      {formOpen ? (
        <ProformaFormDialog
          editing={editing}
          duplicating={duplicating}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
            setDuplicating(null);
          }}
          onSaved={() => {
            setFormOpen(false);
            setEditing(null);
            setDuplicating(null);
            refresh();
          }}
          notify={notify}
        />
      ) : null}

      {/* Conversion en facture */}
      {converting ? (
        <ProformaConversionDialog
          data={converting}
          onClose={() => setConverting(null)}
          onSaved={() => {
            setConverting(null);
            refresh();
          }}
          notify={notify}
        />
      ) : null}
    </div>
  );

  async function openEdit(p: Proforma): Promise<void> {
    try {
      const data = (await api.proformaDetail({ id: p.id })) as ProformaDetailData;
      setEditing(data);
      setDuplicating(null);
      setFormOpen(true);
    } catch (e) {
      notify(frError(e, "Détail indisponible."), "err");
    }
  }

  async function openConvert(p: Proforma): Promise<void> {
    try {
      const data = (await api.proformaDetail({ id: p.id })) as ProformaDetailData;
      setConverting(data);
    } catch (e) {
      notify(frError(e, "Détail indisponible."), "err");
    }
  }

  async function openDuplicate(p: Proforma): Promise<void> {
    try {
      const data = (await api.proformaDetail({ id: p.id })) as ProformaDetailData;
      setEditing(null);
      setDuplicating(data);
      setFormOpen(true);
    } catch (e) {
      notify(frError(e, "Détail indisponible."), "err");
    }
  }
}
