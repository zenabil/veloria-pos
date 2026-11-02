// Veloria PoS — Écran : Clients (fiches, dettes, règlements).
// En-tête + 4 cartes stats + barre d'outils + table enrichie (relevés) +
// pagination + tiroir détail + formulaire + règlement.
import { useEffect, useRef, useState } from "react";
import {
  Download,
  Eye,
  FileDown,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import {
  callChecked,
  enrichedCustomerSearchSchema,
  type EnrichedCustomerRow,
} from "@shared/types/ipc-contracts.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { formatDzd } from "@domain/money/money.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { todayBusinessDate } from "@domain/common/business-day.ts";
import { runBulk } from "@shared/ui/bulk-actions.ts";
import { formatDateTimeFr } from "@shared/formatters/format.ts";
import {
  ErrorState,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Pager,
  RowAction,
  SearchField,
  Select,
  StatsStrip,
  Toolbar,
  cn,
} from "@shared/ui/primitives.tsx";
import { isAnyModalOpen } from "@shared/ui/use-busy.ts";
import { downloadCsv } from "@shared/export/csv.ts";
import { parseCustomersCsv } from "@domain/import/csv-import.ts";
import { useDebouncedTimer } from "@shared/ui/use-debounced-timer.ts";
import { ClientDetailsDrawer, ClientFormDialog } from "./ClientDialogs.tsx";
import {
  customerImportCsvRows,
  debtLabel,
  debtTone,
  enrichCustomer,
  fullName,
  isArchived,
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

function initiales(nom: string): string {
  const letters = nom
    .trim()
    .split(/\s+/)
    .filter((part) => part !== "")
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("");
  return letters === "" ? "?" : letters.toUpperCase();
}

export function ClientsScreen({ notify }: { notify: Notify }): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  const [creditFilter, setCreditFilter] = useState<CreditFilter>("all");
  const [sort, setSort] = useState<CustomerSort>("name_asc");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<EnrichedCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  // A-06 : erreur de chargement PERSISTANTE (le toast dure 4,5 s).
  // Distingue « échec du chargement » de « aucune donnée ».
  const [loadError, setLoadError] = useState("");
  const [stats, setStats] = useState<Stats>({ total: 0, credit: 0, debt: 0, recent: 0 });
  const [selection, setSelection] = useState<Set<number>>(new Set());
  // A-15 : état de lot (concurrence bornée + progression affichée).
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkLabel, setBulkLabel] = useState("");
  const [exportKind, setExportKind] = useState<"report" | "data" | null>(null);
  const [drawer, setDrawer] = useState<{
    customer: EnrichedCustomer;
    sales: StatementSale[];
  } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const queryTimer = useDebouncedTimer();
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

  /** Ligne serveur → ligne enrichie (agrégats déjà calculés par le main). */ function toEnriched(
    c: EnrichedCustomerRow,
  ): EnrichedCustomer {
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
    srt: CustomerSort,
  ): Promise<void> {
    const seq = (loadSeq.current += 1);
    setLoading(true);
    setLoadError("");
    try {
      // UNE requête : recherche + filtre dette + TRI SERVEUR + agrégats
      // (factures, achats, dernière vente) calculés côté main — contrat validé,
      // jamais de N+1, ordre global à la pagination.
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
            sort: srt,
          }),
        enrichedCustomerSearchSchema,
      );
      if (seq !== loadSeq.current) return;
      // Page devenue hors bornes (ex. archivage massif sur la dernière page) :
      // repli page 1 au lieu d'un tableau vide trompeur.
      if (p > 1 && (p - 1) * PAGE_SIZE >= res.total && res.total > 0) {
        setPage(1);
        void load(q, arch, cred, 1, srt);
        return;
      }
      setRows(res.rows.map(toEnriched));
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
    void loadStats();
    void load("", "active", "all", 1, "name_asc");
  }, []);

  function onQueryChange(q: string): void {
    setQuery(q);
    setPage(1);
    queryTimer.schedule(250, () => {
      void load(q, archiveFilter, creditFilter, 1, sort);
    });
  }

  function changeArchive(a: ArchiveFilter): void {
    // Filtre/tri changé pendant le délai de frappe : la planification périmée
    // repartirait avec l'ancien état — on l'annule (recherche de page 1 recomposée).
    queryTimer.cancel();
    setArchiveFilter(a);
    setPage(1);
    setSelection(new Set());
    void load(query, a, creditFilter, 1, sort);
  }

  function changeCredit(c: CreditFilter): void {
    queryTimer.cancel();
    setCreditFilter(c);
    setPage(1);
    void load(query, archiveFilter, c, 1, sort);
  }

  function changeSort(s: CustomerSort): void {
    queryTimer.cancel();
    setSort(s);
    setPage(1);
    void load(query, archiveFilter, creditFilter, 1, s);
  }

  function changePage(p: number): void {
    setPage(p);
    void load(query, archiveFilter, creditFilter, p, sort);
  }

  function refresh(): void {
    setSelection(new Set());
    void loadStats();
    void load(query, archiveFilter, creditFilter, page, sort);
  }

  function resetFilters(): void {
    queryTimer.cancel();
    setQuery("");
    setArchiveFilter("active");
    setCreditFilter("all");
    setPage(1);
    setSelection(new Set());
    void load("", "active", "all", 1, sort);
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
    } catch (e) {
      notify(frError(e, "Relevé indisponible — fiche sans historique."), "err");
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
    setBulkBusy(true);
    // A-15 : lot à concurrence bornée (200 archives séquentielles =
    // plusieurs minutes sans retour visuel) ; un échec est isolé, le lot
    // continue.
    const res = await runBulk(
      [...selection],
      async (id) => {
        await api.customerArchive({ id, operationId: newOperationId() });
      },
      {
        onProgress: (processed, total) => setBulkLabel(`Archivage ${processed}/${total}…`),
      },
    );
    setBulkBusy(false);
    setBulkLabel("");
    // Échec partiel = erreur (avant : toast vert malgré les échecs silencieux).
    notify(
      res.failed > 0
        ? `${res.done} client(s) archivé(s), ${res.failed} échec(s).`
        : `${res.done} client(s) archivé(s).`,
      res.failed > 0 ? "err" : "ok",
    );
    // Retour page 1 : la page courante peut ne plus exister après l'archivage.
    setPage(1);
    setSelection(new Set());
    void loadStats();
    void load(query, archiveFilter, creditFilter, 1, sort);
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

  /**
   * ADR-135 : deux formats. « rapport » = registre lisible dans Excel
   * (colonnes enrichies, montants DZD) ; « données » = réimportable tel quel
   * (`prénom;nom;téléphone`).
   */
  async function exportCsv(kind: "report" | "data"): Promise<void> {
    if (total === 0) {
      notify("Rien à exporter.", "err");
      return;
    }
    if (kind === "data" && archiveFilter !== "active") {
      notify(
        "Export données impossible : revenez aux clients actifs (le format d'import ne transporte pas le statut archivé).",
        "err",
      );
      return;
    }
    setExportKind(kind);
    setBulkBusy(true);
    try {
      // Export COMPLET du filtre courant (l'en-tête annonce le total filtré :
      // n'exporter que la page affichée était une troncature silencieuse de
      // plus). Pages fetched avec une concurrence bornée (A-15) + progression.
      const all: EnrichedCustomer[] = [];
      const pageCount = Math.ceil(total / PAGE_SIZE);
      const pages: (EnrichedCustomer[] | undefined)[] = [];
      const bulk = await runBulk(
        Array.from({ length: pageCount }, (_, i) => i + 1),
        async (p) => {
          const res = await callChecked(
            (a) =>
              a.customers.search({
                query: query.trim(),
                page: p,
                pageSize: PAGE_SIZE,
                includeArchived: archiveFilter !== "active",
                archivedOnly: archiveFilter === "archived",
                debtFilter: creditFilter,
                sort,
              }),
            enrichedCustomerSearchSchema,
          );
          pages[p - 1] = res.rows.map(toEnriched);
        },
        {
          onProgress: (processed, totalPages) =>
            setBulkLabel(
              `${kind === "data" ? "Export données" : "Export"} ${processed}/${totalPages} page(s)…`,
            ),
        },
      );
      if (bulk.failed > 0) {
        console.error(
          `[Veloria] clients : export CSV interrompu (${bulk.failed}/${bulk.total} page(s)).`,
        );
        notify(
          `Export interrompu : ${bulk.failed} page(s) sur ${bulk.total} illisible(s). Réessayez.`,
          "err",
        );
        return;
      }
      for (const rows of pages) {
        if (rows) all.push(...rows);
      }
      const date = todayBusinessDate();
      if (kind === "report") {
        downloadCsv(
          `clients-${date}.csv`,
          all.map((c) => ({
            Client: fullName(c),
            Téléphone: c.phone || "",
            "Jour règlement": c.settlement_day ?? "",
            Achats: formatDzd(c.totalPurchasesMinor),
            Dette: formatDzd(c.outstanding_balance_minor),
            "Dernière vente": c.lastSaleAt ? formatDateTimeFr(c.lastSaleAt) : "",
            Statut: debtLabel(c),
          })),
        );
        notify(`${all.length} ligne(s) exportée(s).`, "ok");
      } else {
        downloadCsv(`clients-donnees-${date}.csv`, customerImportCsvRows(all), {
          protectFormulas: false,
        });
        notify(
          `${all.length} client(s) exporté(s) en format réimportable (prénom;nom;téléphone).`,
          "ok",
        );
      }
    } catch (e) {
      console.error(`[Veloria] clients : export CSV (${kind}) impossible`, e);
      notify("Export impossible.", "err");
    } finally {
      setBulkBusy(false);
      setBulkLabel("");
      setExportKind(null);
    }
  }

  const csvInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Import CSV clients (format `prenom;nom[telephone]`, en-tete optionnel).
   * Validation TOTALE cote domaine (une seule ligne invalide => rien n'est
   * ecrit), puis commit atomique dans le main (une transaction).
   */
  async function importCsvFile(file: File): Promise<void> {
    let rows: ReturnType<typeof parseCustomersCsv>;
    try {
      rows = parseCustomersCsv(await file.text());
    } catch (e) {
      notify(frError(e, "Fichier CSV invalide."), "err");
      return;
    }
    if (!(await confirmAsync(`Importer ${rows.length} client(s) depuis « ${file.name} » ?`))) {
      return;
    }
    try {
      const res = (await api.customerImport({
        operationId: newOperationId(),
        rows: rows.map((r) => ({
          firstName: r.firstName,
          lastName: r.lastName,
          phone: r.phone,
        })),
      })) as { imported: number; skipped: number };
      notify(`${res.imported} client(s) importé(s).`, "ok");
      refresh();
    } catch (e) {
      notify(frError(e, "Import impossible."), "err");
    }
  }

  const visible = rows;
  const allPageSelected = rows.length > 0 && rows.every((r) => selection.has(r.id));
  // Le compteur reflète la recherche + les filtres (pas le registre entier).
  const filtersActive = query.trim() !== "" || archiveFilter !== "active" || creditFilter !== "all";

  return (
    <div className="flex h-full flex-col gap-4">
      {/* En-tête Stitch : Gestion des Clients · Registre Fédéré DZD */}
      <PageHeader
        title="Gestion des clients"
        module="Clients · soldes et créances"
        period={`${total} fiche(s) ${filtersActive ? "affichée(s)" : "active(s)"} · ${stats.credit} compte(s) avec créance · ${formatDzd(stats.debt)} de dettes en cours`}
        actions={
          <>
            <SearchField
              value={query}
              onChange={onQueryChange}
              placeholder="Rechercher… [F3]"
              ariaLabel="Rechercher un client"
              inputRef={searchRef}
              className="w-full sm:w-64"
            />
            <Button onClick={openCreate} title="Créer un client">
              <Plus size={16} aria-hidden="true" /> Nouveau client
            </Button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              aria-label="Fichier CSV de clients à importer"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void importCsvFile(f);
              }}
            />
          </>
        }
      />

      <StatsStrip
        items={[
          { label: "Fiches actives", value: String(stats.total), sub: "Registre clients" },
          {
            label: "Clients avec dette",
            value: String(stats.credit),
            sub: "Solde > 0",
            tone: stats.credit > 0 ? "amber" : "default",
          },
          {
            label: "Solde global clients",
            value: formatDzd(stats.debt),
            sub: "Avoirs inclus",
            tone: stats.debt > 0 ? "red" : "default",
          },
          {
            label: "Encaissé 7 jours",
            value: formatDzd(stats.recent),
            sub: "Paiements récents",
            tone: stats.recent > 0 ? "green" : "default",
          },
        ]}
      />

      <Toolbar className="gap-2">
        <span className="flex h-[42px] items-center gap-2 rounded-xl bg-white/[0.03] px-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
          <SlidersHorizontal size={14} aria-hidden="true" />
          Filtres
        </span>
        <Select
          id="clients-status"
          value={archiveFilter}
          onChange={(e) => changeArchive(e.target.value as ArchiveFilter)}
          aria-label="Filtre statut"
          className="w-auto"
        >
          <option value="active">Clients actifs</option>
          <option value="all">Tous (+ archivés)</option>
          <option value="archived">Archivés</option>
        </Select>
        <Select
          id="clients-credit"
          value={creditFilter}
          onChange={(e) => changeCredit(e.target.value as CreditFilter)}
          aria-label="Filtre crédit"
          className="w-auto"
        >
          <option value="all">Tous les crédits</option>
          <option value="with_debt">Avec dette</option>
          <option value="no_debt">Sans dette</option>
          <option value="over_limit">Dépassement</option>
        </Select>
        <Select
          id="clients-sort"
          value={sort}
          onChange={(e) => changeSort(e.target.value as CustomerSort)}
          aria-label="Tri"
          className="w-auto"
        >
          <option value="name_asc">Tri : nom A → Z</option>
          <option value="name_desc">Tri : nom Z → A</option>
          <option value="debt_desc">Tri : dette décroissante</option>
          <option value="debt_asc">Tri : dette croissante</option>
          <option value="purchases_desc">Tri : achats décroissants</option>
        </Select>
        <Button variant="ghost" onClick={resetFilters} title="Réinitialiser les filtres">
          <X size={15} aria-hidden="true" /> Réinitialiser
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
          <Button
            variant="ghost"
            onClick={() => void exportCsv("report")}
            disabled={bulkBusy}
            title="Exporter tout le filtre en rapport CSV (lecture seule)"
          >
            <Download size={15} aria-hidden="true" />
            {bulkBusy && exportKind === "report" ? bulkLabel : "Rapport CSV"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => void exportCsv("data")}
            disabled={bulkBusy}
            title="Exporter tout le filtre en CSV réimportable (prénom;nom;téléphone)"
          >
            <FileDown size={15} aria-hidden="true" />
            {bulkBusy && exportKind === "data" ? bulkLabel : "Données CSV"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => csvInputRef.current?.click()}
            title="Importer un fichier CSV (prénom;nom;téléphone)"
          >
            <Upload size={15} aria-hidden="true" /> Import CSV
          </Button>
        </div>
      </Toolbar>

      {/* Sélection multiple */}
      {selection.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#fbbf24]/25 bg-[linear-gradient(90deg,rgba(251,191,36,0.10),rgba(251,191,36,0.02))] px-4 py-2.5 text-sm">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#fbbf24]/15 text-[#fbbf24] ring-1 ring-[#fbbf24]/20">
            <Trash2 size={14} aria-hidden="true" />
          </span>
          <strong className="font-bold text-slate-100">{selection.size} sélectionné(s)</strong>
          <span aria-hidden="true" className="h-4 w-px bg-white/10" />
          <Button variant="secondary" onClick={() => void archiveSelection()} disabled={bulkBusy}>
            <Trash2 size={15} aria-hidden="true" />
            {bulkBusy ? bulkLabel || "Archivage…" : "Archiver la sélection"}
          </Button>
          <button
            type="button"
            onClick={() => setSelection(new Set())}
            className="ml-auto text-xs font-semibold text-slate-400 transition-colors hover:text-white"
          >
            Tout désélectionner
          </button>
        </div>
      ) : null}

      {/* Table clients */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto">
          {loadError ? (
            <ErrorState message={loadError} />
          ) : loading && rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500" role="status">
              Chargement…
            </p>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center">
              <EmptyState
                title="Aucun client"
                hint="Modifiez la recherche ou créez votre premier client avec le bouton « Nouveau client »."
              />
              <Button onClick={openCreate} className="-mt-12 mb-10">
                <Plus size={16} aria-hidden="true" /> Créer un client
              </Button>
            </div>
          ) : (
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="sticky top-0 bg-[#122131] text-left text-[11px] uppercase tracking-[0.12em] text-slate-500 shadow-[0_1px_0_rgba(255,255,255,0.07)]">
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
                      isArchived(c) && "opacity-60",
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
                    <td className="max-w-[240px] px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.04] font-mono text-[11px] font-bold uppercase text-slate-400 ring-1 ring-white/10"
                        >
                          {initiales(fullName(c))}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{fullName(c)}</div>
                          <div className="mt-0.5 font-mono text-[10px] text-slate-500">
                            Client #{c.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-300">{c.phone || "—"}</td>
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
                    <td className="px-3 py-2 text-right">
                      <div
                        className={cn(
                          "font-bold tabular-nums",
                          c.outstanding_balance_minor > 0 ? "text-red-300" : "text-slate-500",
                        )}
                      >
                        {formatDzd(c.outstanding_balance_minor)}
                      </div>
                      {c.outstanding_balance_minor > 0 && c.totalPurchasesMinor > 0 ? (
                        <span
                          aria-hidden="true"
                          className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-black/25"
                        >
                          <span
                            className="block h-full rounded-full bg-red-400/70"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round(
                                  (c.outstanding_balance_minor / c.totalPurchasesMinor) * 100,
                                ),
                              )}%`,
                            }}
                          />
                        </span>
                      ) : null}
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
                          title="Détails de la fiche"
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
                            title="Restaurer la fiche"
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
