// Veloria PoS — Écran : Historique unifié (ventes, achats, paiements, stock, fiches).
// En-tête (recherche, période, export) + 4 cartes stats + barre d'outils +
// table serveur + pagination + tiroir détail + export CSV.
import { useEffect, useRef, useState } from "react";
import { Download, Eye, SlidersHorizontal, X } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { formatDzd } from "@domain/money/money.ts";
import { downloadCsv } from "@shared/export/csv.ts";
import { formatDateFr, paymentMethodLabel } from "@shared/formatters/format.ts";
import {
  ErrorState,
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
import { HistoryDetailsDrawer } from "./HistoryDialogs.tsx";
import {
  KIND_LABELS,
  OP_FILTERS,
  kindTone,
  rowKey,
  splitDateTime,
  type HistoryDetail,
  type HistoryOpFilter,
  type HistoryRow,
  type HistorySort,
} from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

const PAGE_SIZE = 20;
const EXPORT_MAX = 1000;

interface Stats {
  totalOperations: number;
  salesCount: number;
  salesAmountMinor: number;
  purchasesCount: number;
  purchasesAmountMinor: number;
  paymentsAmountMinor: number;
}

export function HistoryScreen({
  notify,
  onNavigate,
}: {
  notify: Notify;
  onNavigate?: (module: "sell") => void;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [op, setOp] = useState<HistoryOpFilter>("all");
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<HistorySort>("date_desc");
  const [toolbarOpen, setToolbarOpen] = useState(true);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  // A-06 : erreur de chargement PERSISTANTE (le toast dure 4,5 s).
  // Distingue « échec du chargement » de « aucune donnée ».
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [stats, setStats] = useState<Stats>({
    totalOperations: 0,
    salesCount: 0,
    salesAmountMinor: 0,
    purchasesCount: 0,
    purchasesAmountMinor: 0,
    paymentsAmountMinor: 0,
  });
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<HistoryDetail | null>(null);
  const queryTimer = useDebouncedTimer();
  const searchRef = useRef<HTMLInputElement>(null);
  const loadSeq = useRef(0);

  // F3 : focus recherche (comme en caisse). F6 : réimprimer le dernier
  // ticket (tri antéchronologique uniquement, voir reprintLast).
  // Ref stable : le handler lit l'état courant via rowsRef (pas de ré-abonnement).
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const sortRef = useRef(sort);
  sortRef.current = sort;
  const reprintLastRef = useRef<() => Promise<void>>(() => Promise.resolve());
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isAnyModalOpen()) return;
      if (e.key === "F3") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F6") {
        e.preventDefault();
        void reprintLastRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function loadStats(f: string, t: string): Promise<void> {
    try {
      const s = (await api.historyStats({
        from: f === "" ? null : f,
        to: t === "" ? null : t,
      })) as Stats;
      setStats(s);
    } catch (e) {
      notify(frError(e, "Statistiques indisponibles."), "err");
    }
  }

  async function load(
    q: string,
    o: HistoryOpFilter,
    f: string,
    t: string,
    s: HistorySort,
    p: number,
  ): Promise<void> {
    const seq = (loadSeq.current += 1);
    setLoading(true);
    setLoadError("");
    try {
      const res = (await api.historyList({
        query: q.trim(),
        op: o,
        from: f === "" ? null : f,
        to: t === "" ? null : t,
        sort: s,
        page: p,
        pageSize: PAGE_SIZE,
      })) as { rows: HistoryRow[]; total: number };
      if (seq !== loadSeq.current) return;
      setRows(res.rows);
      setTotal(res.total);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      const loadErrorMessage = frError(err, "Chargement impossible.");
      setLoadError(loadErrorMessage);
      notify(loadErrorMessage, "err");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  // Chargement initial.
  useEffect(() => {
    void loadStats("", "");
    void load("", "all", "", "", "date_desc", 1);
  }, []);

  function onQueryChange(q: string): void {
    setQuery(q);
    setPage(1);
    queryTimer.schedule(250, () => {
      void load(q, op, from, to, sort, 1);
    });
  }

  function changeOp(o: HistoryOpFilter): void {
    setOp(o);
    setPage(1);
    setSelection(new Set());
    void load(query, o, from, to, sort, 1);
  }

  function changeRange(f: string, t: string): void {
    setFrom(f);
    setTo(t);
    setPage(1);
    void loadStats(f, t);
    void load(query, op, f, t, sort, 1);
  }

  function changePage(p: number): void {
    setPage(p);
    void load(query, op, from, to, sort, p);
  }

  function resetFilters(): void {
    setQuery("");
    setOp("all");
    setFrom("");
    setTo("");
    setSort("date_desc");
    setPage(1);
    setSelection(new Set());
    void loadStats("", "");
    void load("", "all", "", "", "date_desc", 1);
  }

  async function openDrawer(r: HistoryRow): Promise<void> {
    try {
      const d = (await api.historyDetail({ kind: r.kind, id: r.entity_id })) as HistoryDetail;
      setDrawer(d);
    } catch (e) {
      notify(frError(e, "Détail indisponible."), "err");
    }
  }

  /** Stitch [F6] : rouvre le ticket le plus récent (tri antéchronologique). */
  async function reprintLast(): Promise<void> {
    if (sortRef.current !== "date_desc") {
      notify("Basculez le tri sur « Date ↓ » pour réimprimer le dernier ticket.", "err");
      return;
    }
    const latest = rowsRef.current[0];
    if (!latest) {
      notify("Aucun ticket à réimprimer.", "err");
      return;
    }
    await openDrawer(latest);
  }
  reprintLastRef.current = reprintLast;

  function refresh(): void {
    void loadStats(from, to);
    void load(query, op, from, to, sort, page);
  }

  async function searchAndOpen(raw: string): Promise<void> {
    const code = raw.trim().replace(/\s+/g, "").toUpperCase();
    if (code.length < 2) return;
    setQuery(code);
    setPage(1);
    try {
      const res = (await api.historyList({
        query: code,
        op,
        from: from === "" ? null : from,
        to: to === "" ? null : to,
        sort,
        page: 1,
        pageSize: PAGE_SIZE,
      })) as { rows: HistoryRow[]; total: number };
      setRows(res.rows);
      setTotal(res.total);
      const norm = (v: string): string => v.trim().replace(/\s+/g, "").toUpperCase();
      const exact = res.rows.find((r) => norm(String(r.ref)) === code);
      if (exact) {
        await openDrawer(exact);
      } else if (res.rows.length === 1 && res.rows[0]) {
        await openDrawer(res.rows[0]);
      }
    } catch (err) {
      notify(frError(err, "Chargement impossible."), "err");
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

  function toCsvRows(list: HistoryRow[]): Record<string, unknown>[] {
    return list.map((r) => {
      const { time } = splitDateTime(r.created_at);
      const date = formatDateFr(r.created_at);
      return {
        Date: date,
        Heure: time,
        Type: KIND_LABELS[r.kind],
        Référence: r.ref,
        Description: r.label,
        Entité: r.entity_name ?? "—",
        Montant: r.amount_minor == null ? "" : formatDzd(r.amount_minor),
        Paiement: r.method == null || r.method === "" ? "" : paymentMethodLabel(r.method),
        Statut: r.status,
      };
    });
  }

  function exportCsv(list: HistoryRow[], name: string): void {
    if (exporting) return;
    if (list.length === 0) {
      notify("Rien à exporter.", "err");
      return;
    }
    setExporting(true);
    try {
      downloadCsv(name, toCsvRows(list));
      notify(`${list.length} ligne(s) exportée(s).`, "ok");
    } catch (e) {
      notify(frError(e, "Export impossible."), "err");
    } finally {
      setExporting(false);
    }
  }

  async function exportAll(): Promise<void> {
    try {
      const res = (await api.historyList({
        query: query.trim(),
        op,
        from: from === "" ? null : from,
        to: to === "" ? null : to,
        sort,
        page: 1,
        pageSize: EXPORT_MAX,
      })) as { rows: HistoryRow[]; total: number };
      if (res.total > EXPORT_MAX) {
        notify(`Export limité aux ${EXPORT_MAX} premières lignes (${res.total} au total).`, "err");
      }
      const stamp = new Date().toISOString().slice(0, 10);
      exportCsv(res.rows, `historique-${stamp}.csv`);
    } catch (e) {
      notify(frError(e, "Export impossible."), "err");
    }
  }

  function exportSelection(): void {
    const list = rows.filter((r) => selection.has(rowKey(r)));
    const stamp = new Date().toISOString().slice(0, 10);
    exportCsv(list, `historique-selection-${stamp}.csv`);
  }

  const allPageSelected = rows.length > 0 && rows.every((r) => selection.has(rowKey(r)));

  return (
    <div className="flex h-full flex-col gap-4">
      {/* En-tête Stitch : Historique des Ventes & Transactions · JOURNAL FIGÉ */}
      <PageHeader
        title="Historique des ventes et transactions"
        module="Journal des opérations · en temps réel"
        period={`${total} opération(s) · toutes les activités de la caisse · session active`}
        actions={
          <>
            <SearchField
              value={query}
              onChange={onQueryChange}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void searchAndOpen(e.currentTarget.value);
                }
              }}
              placeholder="N° Ticket, Client, Réf, Code-barre… [F3]"
              ariaLabel="Rechercher dans l'historique (ticket, client, référence ou code-barres)"
              inputRef={searchRef}
              className="w-full max-w-xs"
              inputClassName="pl-9 font-mono"
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
              onClick={() => void reprintLast()}
              disabled={rows.length === 0}
              title="Réimprimer le dernier ticket [F6]"
            >
              Réimprimer le dernier ticket
            </Button>
            <Button onClick={() => void exportAll()} disabled={exporting} title="Exporter en CSV">
              <Download size={16} aria-hidden="true" />{" "}
              {exporting ? "Export en cours…" : "Exporter tout (CSV)"}
            </Button>
          </>
        }
      />

      {/* Cartes statistiques Stitch */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Total des ventes (brut)"
          value={formatDzd(stats.salesAmountMinor)}
          sub={`${stats.salesCount} ticket(s)`}
          accent="#fbbf24"
        />
        <Kpi
          label="Opérations"
          value={String(stats.totalOperations)}
          sub="Toutes activités"
          accent="#cde8ff"
        />
        <Kpi
          label="Achats"
          value={formatDzd(stats.purchasesAmountMinor)}
          sub={`${stats.purchasesCount} entrée(s)`}
          accent="#8ed0ff"
        />
        <Kpi
          label="Répartition des paiements"
          value={formatDzd(stats.paymentsAmountMinor)}
          sub="Encaissé + payé"
          accent="#4edea3"
        />
      </div>

      {/* Barre d'outils : un SEUL champ de recherche (en-tête, F3) — fin du
          doublon name/toolbar sur le même état `query`. */}
      {toolbarOpen ? (
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="history-op"
            >
              Type d'opération
            </label>
            <Select
              id="history-op"
              value={op}
              onChange={(e) => changeOp(e.target.value as HistoryOpFilter)}
              aria-label="Filtre type"
            >
              {OP_FILTERS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="history-from"
            >
              Du
            </label>
            <TextInput
              id="history-from"
              type="date"
              value={from}
              onChange={(e) => changeRange(e.target.value, to)}
              aria-label="Du"
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="history-to"
            >
              Au
            </label>
            <TextInput
              id="history-to"
              type="date"
              value={to}
              onChange={(e) => changeRange(from, e.target.value)}
              aria-label="Au"
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="history-sort"
            >
              Tri
            </label>
            <Select
              id="history-sort"
              value={sort}
              onChange={(e) => {
                const s = e.target.value as HistorySort;
                setSort(s);
                setPage(1);
                void load(query, op, from, to, s, 1);
              }}
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

      {/* Table historique */}
      {/* min-h : à basse résolution (720p) le contenu fixe ci-dessus mange
          tout l'espace et flex-1 seul écrase la zone à quelques px (lignes
          invisibles/incliquables) — hauteur plancher + scroll de page,
          voir ADR-077. */}
      <Card className="flex min-h-[320px] min-w-0 flex-1 flex-col overflow-hidden">
        {/* scroll-padding : thead sticky (top-0) — tout défilement
            programmatique (scrollIntoView, focus clavier) laisse la place
            à l'en-tête au lieu de glisser la ligne dessous (voir ADR-077). */}
        <div className="min-h-0 flex-1 scroll-pt-14 overflow-auto">
          {loadError ? (
            <ErrorState message={loadError} />
          ) : loading && rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500" role="status">
              Chargement…
            </p>
          ) : rows.length === 0 ? (
            <EmptyState
              title="Aucune opération"
              hint="Modifiez la recherche ou la période. L'historique se remplit à chaque vente, achat, paiement et ajustement."
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
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Heure</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Référence</th>
                  <th className="px-3 py-2.5">Description</th>
                  <th className="px-3 py-2.5">Entité</th>
                  <th className="px-3 py-2.5 text-right">Montant</th>
                  <th className="px-3 py-2.5">Paiement</th>
                  <th className="px-3 py-2.5">Statut</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const { time } = splitDateTime(r.created_at);
                  const date = formatDateFr(r.created_at);
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
                          aria-label={`Sélectionner ${r.label}`}
                          className="h-4 w-4 accent-amber-400"
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-300">
                        {date}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-500">
                        {time}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <Badge tone={kindTone(r.kind)}>{KIND_LABELS[r.kind]}</Badge>
                      </td>
                      <td className="max-w-[140px] truncate px-3 py-2 font-mono text-xs text-slate-300">
                        {r.ref}
                      </td>
                      <td className="max-w-[260px] truncate px-3 py-2" title={r.label}>
                        {r.label}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2 text-slate-300">
                        {r.entity_name ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums">
                        {r.amount_minor == null ? (
                          <span className="font-normal text-slate-600">—</span>
                        ) : (
                          formatDzd(r.amount_minor)
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-400">
                        {paymentMethodLabel(r.method)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-300">
                        {r.status}
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <RowAction
                            label={`Voir ${r.label}`}
                            title="Détails de la fiche"
                            onClick={() => void openDrawer(r)}
                          >
                            <Eye size={15} aria-hidden="true" />
                          </RowAction>
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
        <HistoryDetailsDrawer
          detail={drawer}
          onClose={() => setDrawer(null)}
          onChanged={refresh}
          notify={notify}
          {...(onNavigate == null ? null : { onNavigate })}
        />
      ) : null}
    </div>
  );
}
