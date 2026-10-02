// Veloria PoS — Écran : Retours clients + fournisseurs.
// En-tête + 4 cartes stats + barre d'outils + table unifiée (serveur) +
// pagination + tiroir détail + création + remboursement.
import { useEffect, useRef, useState } from "react";
import { Download, Eye, HandCoins, Plus, Search, SlidersHorizontal, Undo2, X } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { newOperationId } from "@domain/common/ids.ts";
import { formatDzd } from "@domain/money/money.ts";
import { downloadCsv } from "@shared/export/csv.ts";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Kbd,
  Kpi,
  PageHeader,
  Pager,
  RowAction,
  Select,
  TextInput,
  cn,
} from "@shared/ui/primitives.tsx";
import { isAnyModalOpen } from "@shared/ui/use-busy.ts";
import { useLoadSeq } from "@shared/ui/use-load-seq.ts";
import { useDebouncedTimer } from "@shared/ui/use-debounced-timer.ts";
import { NewReturnDialog, ReturnDetailsDrawer, ReturnRefundDialog } from "./ReturnDialogs.tsx";
import {
  returnKindLabel,
  returnNumber,
  returnStatusLabel,
  returnStatusTone,
  rowKey,
  type ReturnDetailData,
  type ReturnKind,
  type ReturnRow,
  type ReturnSort,
  type ReturnStatusFilter,
  type ReturnTypeFilter,
} from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

const PAGE_SIZE = 20;

interface Stats {
  totalReturns: number;
  customerReturns: number;
  supplierReturns: number;
  totalAmountMinor: number;
}

export function ReturnsScreen({ notify }: { notify: Notify }): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ReturnTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<ReturnStatusFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<ReturnSort>("date_desc");
  const [toolbarOpen, setToolbarOpen] = useState(true);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats>({
    totalReturns: 0,
    customerReturns: 0,
    supplierReturns: 0,
    totalAmountMinor: 0,
  });
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Confirmation non bloquante (modale applicative).
  const confirmAsync = useConfirm();
  const [drawer, setDrawer] = useState<{ kind: ReturnKind; data: ReturnDetailData } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [refundFor, setRefundFor] = useState<ReturnRow | null>(null);
  const queryTimer = useDebouncedTimer();
  const searchRef = useRef<HTMLInputElement>(null);

  // F3 : focus recherche (comme en caisse). F2 : nouveau retour. F8 : exporter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isAnyModalOpen()) return;
      if (e.key === "F3") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F2") {
        e.preventDefault();
        setCreateOpen(true);
      } else if (e.key === "F8") {
        e.preventDefault();
        void exportAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function loadStats(): Promise<void> {
    try {
      const s = (await api.returnStats()) as Stats;
      setStats(s);
    } catch {
      /* stats optionnelles */
    }
  }

  // P1-2 : séquence anti-course partagée par load/loadStats.
  const { next: nextSeq, isCurrent: isSeqCurrent } = useLoadSeq();

  async function load(
    q: string,
    type: ReturnTypeFilter,
    status: ReturnStatusFilter,
    f: string,
    t: string,
    s: ReturnSort,
    p: number,
  ): Promise<void> {
    const seq = nextSeq();
    setLoading(true);
    try {
      const res = (await api.returnsList({
        query: q.trim(),
        typeFilter: type,
        statusFilter: status,
        from: f === "" ? null : f,
        to: t === "" ? null : t,
        sort: s,
        page: p,
        pageSize: PAGE_SIZE,
      })) as { rows: ReturnRow[]; total: number };
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
    void load("", "all", "all", "", "", "date_desc", 1);
  }, []);

  function onQueryChange(q: string): void {
    setQuery(q);
    setPage(1);
    queryTimer.schedule(250, () => {
      void load(q, typeFilter, statusFilter, from, to, sort, 1);
    });
  }

  function changeType(t: ReturnTypeFilter): void {
    setTypeFilter(t);
    setPage(1);
    setSelection(new Set());
    void load(query, t, statusFilter, from, to, sort, 1);
  }

  function changeStatus(s: ReturnStatusFilter): void {
    setStatusFilter(s);
    setPage(1);
    void load(query, typeFilter, s, from, to, sort, 1);
  }

  function changeRange(f: string, t: string): void {
    setFrom(f);
    setTo(t);
    setPage(1);
    void load(query, typeFilter, statusFilter, f, t, sort, 1);
  }

  function changeSort(s: ReturnSort): void {
    setSort(s);
    setPage(1);
    void load(query, typeFilter, statusFilter, from, to, s, 1);
  }

  function changePage(p: number): void {
    setPage(p);
    void load(query, typeFilter, statusFilter, from, to, sort, p);
  }

  function refresh(): void {
    setSelection(new Set());
    void loadStats();
    void load(query, typeFilter, statusFilter, from, to, sort, page);
  }

  /** Export CSV [F8] : journal des retours & avoirs (filtres courants, max 1000). */
  async function exportAll(): Promise<void> {
    try {
      const res = (await api.returnsList({
        query: query.trim(),
        typeFilter,
        statusFilter,
        from: from === "" ? null : from,
        to: to === "" ? null : to,
        sort,
        page: 1,
        pageSize: 1000,
      })) as { rows: ReturnRow[]; total: number };
      if (res.rows.length === 0) {
        notify("Rien à exporter.", "err");
        return;
      }
      if (res.total > 1000) {
        notify(`Export limité aux 1000 premières lignes (${res.total} au total).`, "err");
      }
      downloadCsv(
        `retours-${new Date().toISOString().slice(0, 10)}.csv`,
        res.rows.map((r) => ({
          Numero: returnNumber(r.kind, r.number, r.entity_id),
          Date: r.created_at.slice(0, 10),
          Type: returnKindLabel(r.kind),
          Total: formatDzd(r.total_minor),
          Regle: formatDzd(r.settled_minor),
          Statut: returnStatusLabel(r.status),
        })),
      );
      notify(`${res.rows.length} ligne(s) exportée(s).`, "ok");
    } catch (e) {
      notify(frError(e, "Export impossible."), "err");
    }
  }

  function resetFilters(): void {
    setQuery("");
    setTypeFilter("all");
    setStatusFilter("all");
    setFrom("");
    setTo("");
    setSort("date_desc");
    setPage(1);
    setSelection(new Set());
    void load("", "all", "all", "", "", "date_desc", 1);
  }

  async function openDrawer(r: ReturnRow): Promise<void> {
    try {
      const data = (await api.returnDetail({ kind: r.kind, id: r.entity_id })) as ReturnDetailData;
      setDrawer({ kind: r.kind, data });
    } catch (e) {
      notify(frError(e, "Détail indisponible."), "err");
    }
  }

  async function cancelRow(r: ReturnRow): Promise<void> {
    if (
      !(await confirmAsync(
        `Annuler le retour ${returnNumber(r.kind, r.number, r.entity_id)} ? Stock et soldes restaurés (retour vierge uniquement).`,
      ))
    )
      return;
    try {
      await api.returnCancel({ kind: r.kind, id: r.entity_id, operationId: newOperationId() });
      notify("Retour annulé.", "ok");
      refresh();
    } catch (e) {
      notify(frError(e, "Annulation impossible."), "err");
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

  async function cancelSelection(): Promise<void> {
    if (selection.size === 0 || bulkBusy) return;
    if (
      !(await confirmAsync(
        `Annuler ${selection.size} retour(s) ? Chacun doit être vierge (aucun remboursement).`,
      ))
    )
      return;
    setBulkBusy(true);
    let done = 0;
    for (const r of rows.filter((x) => selection.has(rowKey(x)))) {
      try {
        await api.returnCancel({ kind: r.kind, id: r.entity_id, operationId: newOperationId() });
        done += 1;
      } catch {
        /* on continue : le garde-fou explique au cas par cas dans le tiroir */
      }
    }
    notify(`${done}/${selection.size} retour(s) annulé(s).`, done > 0 ? "ok" : "err");
    setBulkBusy(false);
    refresh();
  }

  const fullySettled = (r: ReturnRow): boolean => r.settled_minor >= r.total_minor;
  const allPageSelected = rows.length > 0 && rows.every((r) => selection.has(rowKey(r)));

  return (
    <div className="flex h-full flex-col gap-4">
      {/* En-tête Stitch : Retours & Avoirs Clients · MODULE 09 · FISCAL V3.2 */}
      <PageHeader
        title="Retours & Avoirs Clients"
        module="MODULE 09 · FISCAL V3.2"
        period={`${total} retour(s) · ${formatDzd(stats.totalAmountMinor)} de marchandises retournées · REGISTRE DES RETOURS ACTIF · POSTE 04`}
        actions={
          <>
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
                placeholder="N° retour / facture / scan… [F3]"
                aria-label="Rechercher un retour (numéro, facture ou scan code-barres)"
                className="pl-9 font-mono"
              />
            </div>
            <TextInput
              type="date"
              value={from}
              onChange={(e) => changeRange(e.target.value, to)}
              aria-label="Du"
              title="Du"
            />
            <TextInput
              type="date"
              value={to}
              onChange={(e) => changeRange(from, e.target.value)}
              aria-label="Au"
              title="Au"
            />
            <Button
              variant="secondary"
              onClick={() => setToolbarOpen((o) => !o)}
              aria-expanded={toolbarOpen}
              title="Afficher / masquer les filtres"
            >
              <SlidersHorizontal size={16} aria-hidden="true" /> Filtres
            </Button>
            <Button onClick={() => setCreateOpen(true)} title="Nouveau retour [F2]">
              <Plus size={16} aria-hidden="true" /> Nouveau Retour <Kbd>F2</Kbd>
            </Button>
            <Button
              variant="secondary"
              onClick={() => void exportAll()}
              title="Exporter en CSV [F8]"
            >
              <Download size={16} aria-hidden="true" /> Exporter
            </Button>
          </>
        }
      />

      {/* Cartes statistiques Stitch */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Retours du Jour"
          value={String(stats.totalReturns)}
          sub="Dossiers traités"
          accent="#fbbf24"
        />
        <Kpi
          label="Retours Clients"
          value={String(stats.customerReturns)}
          sub="Bons d'avoir émis"
          accent="#cde8ff"
        />
        <Kpi
          label="Retours Fournisseurs"
          value={String(stats.supplierReturns)}
          sub="Articles réintégrés"
          accent="#8ed0ff"
        />
        <Kpi
          label="Remboursements Espèces"
          value={formatDzd(stats.totalAmountMinor)}
          sub="Décaissements directs"
          accent="#4edea3"
        />
      </div>

      {/* Barre d'outils */}
      {toolbarOpen ? (
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="returns-search"
            >
              Recherche
            </label>
            <TextInput
              id="returns-search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Numéro, N° facture, scan code-barres, client…"
              aria-label="Recherche retours"
              className="font-mono"
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="returns-type"
            >
              Type
            </label>
            <Select
              id="returns-type"
              value={typeFilter}
              onChange={(e) => changeType(e.target.value as ReturnTypeFilter)}
              aria-label="Filtre type"
            >
              <option value="all">Toutes</option>
              <option value="customer">Retour client</option>
              <option value="supplier">Retour fournisseur</option>
            </Select>
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="returns-status"
            >
              Statut
            </label>
            <Select
              id="returns-status"
              value={statusFilter}
              onChange={(e) => changeStatus(e.target.value as ReturnStatusFilter)}
              aria-label="Filtre statut"
            >
              <option value="all">Tous</option>
              <option value="validated">Validé</option>
              <option value="partially_refunded">Partiellement remboursé</option>
              <option value="refunded">Remboursé</option>
              <option value="cancelled">Annulé</option>
            </Select>
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="returns-from"
            >
              Du
            </label>
            <TextInput
              id="returns-from"
              type="date"
              value={from}
              onChange={(e) => changeRange(e.target.value, to)}
              aria-label="Du"
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="returns-to"
            >
              Au
            </label>
            <TextInput
              id="returns-to"
              type="date"
              value={to}
              onChange={(e) => changeRange(from, e.target.value)}
              aria-label="Au"
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="returns-sort"
            >
              Tri
            </label>
            <Select
              id="returns-sort"
              value={sort}
              onChange={(e) => changeSort(e.target.value as ReturnSort)}
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

      {/* Sélection multiple → annulation */}
      {selection.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-4 py-2.5 text-sm">
          <strong>{selection.size} sélectionné(s)</strong>
          <Button variant="secondary" onClick={() => void cancelSelection()} disabled={bulkBusy}>
            <Undo2 size={15} aria-hidden="true" />{" "}
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

      {/* Table retours */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto">
          {loading && rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500" role="status">
              Chargement…
            </p>
          ) : rows.length === 0 ? (
            <EmptyState
              title="Aucun retour"
              hint="Créez votre premier retour avec le bouton « Nouveau Retour »."
            />
          ) : (
            <table className="w-full min-w-[1240px] text-sm">
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
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Référence</th>
                  <th className="px-3 py-2.5">Client / Fournisseur</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                  <th className="px-3 py-2.5 text-right">Remboursé</th>
                  <th className="px-3 py-2.5 text-right">Stock</th>
                  <th className="px-3 py-2.5">Statut</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const key = rowKey(r);
                  const cancelled = r.status === "cancelled";
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
                          aria-label={`Sélectionner ${returnNumber(r.kind, r.number, r.entity_id)}`}
                          className="h-4 w-4 accent-amber-400"
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-bold text-amber-200/90">
                        {returnNumber(r.kind, r.number, r.entity_id)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-300">
                        {r.created_at.slice(0, 10)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <Badge tone={r.kind === "customer" ? "blue" : "amber"}>
                          {returnKindLabel(r.kind)}
                        </Badge>
                      </td>
                      <td className="max-w-[140px] truncate px-3 py-2 font-mono text-xs text-slate-300">
                        {r.ref}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2">{r.party_name}</td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums">
                        {formatDzd(r.total_minor)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-300/90">
                        {formatDzd(r.settled_minor)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-bold tabular-nums",
                          r.stock_qty !== 0
                            ? r.kind === "customer"
                              ? "text-emerald-300"
                              : "text-red-300"
                            : "text-slate-600",
                        )}
                      >
                        {r.stock_qty !== 0
                          ? `${r.kind === "customer" ? "+" : "−"}${r.stock_qty}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={returnStatusTone(r.status)}>
                          {returnStatusLabel(r.status)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <RowAction
                            label={`Voir ${returnNumber(r.kind, r.number, r.entity_id)}`}
                            title="Détails"
                            onClick={() => void openDrawer(r)}
                          >
                            <Eye size={15} aria-hidden="true" />
                          </RowAction>
                          {!cancelled && !fullySettled(r) ? (
                            <RowAction
                              label={`Rembourser ${returnNumber(r.kind, r.number, r.entity_id)}`}
                              title="Rembourser"
                              onClick={() => setRefundFor(r)}
                            >
                              <HandCoins size={15} aria-hidden="true" />
                            </RowAction>
                          ) : null}
                          {!cancelled && r.settled_minor === 0 ? (
                            <RowAction
                              label={`Annuler ${returnNumber(r.kind, r.number, r.entity_id)}`}
                              title="Annuler"
                              onClick={() => void cancelRow(r)}
                            >
                              <Undo2 size={15} aria-hidden="true" />
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
        <ReturnDetailsDrawer
          kind={drawer.kind}
          data={drawer.data}
          onClose={() => setDrawer(null)}
          onRefund={(r) => {
            setDrawer(null);
            setRefundFor(r);
          }}
          onChanged={refresh}
          notify={notify}
        />
      ) : null}

      {/* Création */}
      {createOpen ? (
        <NewReturnDialog
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            refresh();
          }}
          notify={notify}
        />
      ) : null}

      {/* Remboursement complémentaire */}
      {refundFor ? (
        <ReturnRefundDialog
          row={refundFor}
          onClose={() => setRefundFor(null)}
          onSaved={() => {
            setRefundFor(null);
            refresh();
          }}
          notify={notify}
        />
      ) : null}
    </div>
  );
}
