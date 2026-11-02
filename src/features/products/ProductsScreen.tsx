// Veloria PoS — Écran : Catalogue (gestion produits, clavier d'abord).
// En-tête + 4 cartes stats + barre d'outils + table + pagination +
// tiroir détail + formulaire (création/édition) + sélection multiple.
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Archive,
  Barcode,
  Download,
  Eye,
  FileDown,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { parseProductsCsv } from "@domain/import/csv-import.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { formatDzd } from "@domain/money/money.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { todayBusinessDate } from "@domain/common/business-day.ts";
import { runBulk } from "@shared/ui/bulk-actions.ts";
import { uppercaseBarcodeInput } from "@shared/ui/barcode-input.ts";
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
import { useDebouncedTimer } from "@shared/ui/use-debounced-timer.ts";
import { ProductDetailsDrawer, ProductFormDialog, LabelsDialog } from "./ProductDialogs.tsx";
import { StockMovementHistoryDrawer } from "@features/stock/dialogs/HistoryDrawer.tsx";
import {
  isArchived,
  sortProducts,
  productCsvRows,
  productImportCsvRows,
  labelTargets,
  stockLabel,
  stockTone,
  type Category,
  type LabelTarget,
  type Product,
  type ProductSort,
  type StockFilter,
} from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

const PAGE_SIZE = 20;

interface Stats {
  total: number;
  available: number;
  low: number;
  out: number;
}

export function ProductsScreen({ notify }: { notify: Notify }): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState<StockFilter>("all");
  const [sort, setSort] = useState<ProductSort>("name_asc");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  // A-06 : erreur de chargement PERSISTANTE (le toast dure 4,5 s).
  // Distingue « échec du chargement » de « aucune donnée ».
  const [loadError, setLoadError] = useState("");
  const [stats, setStats] = useState<Stats>({ total: 0, available: 0, low: 0, out: 0 });
  const [categories, setCategories] = useState<Category[]>([]);
  // La sélection porte la fiche complète : elle survit aux changements de
  // page, et les étiquettes couvrent TOUTES les pages sélectionnées.
  const [selection, setSelection] = useState<Map<number, Product>>(new Map());
  // A-15 : état de lot (concurrence bornée + progression affichée).
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkLabel, setBulkLabel] = useState("");
  const [exportKind, setExportKind] = useState<"report" | "data" | null>(null);
  // Confirmation non bloquante (modale applicative).
  const confirmAsync = useConfirm();
  const [drawerProduct, setDrawerProduct] = useState<Product | null>(null);
  const [movementsFor, setMovementsFor] = useState<Product | null>(null);
  const [labelsFor, setLabelsFor] = useState<LabelTarget[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const queryTimer = useDebouncedTimer();
  const searchRef = useRef<HTMLInputElement>(null);
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

  async function loadStats(): Promise<void> {
    try {
      const s = (await api.stockOverview()) as {
        skuActive: number;
        lowStock: number;
        outOfStock: number;
      };
      setStats({
        total: s.skuActive,
        available: s.skuActive - s.outOfStock,
        low: s.lowStock,
        out: s.outOfStock,
      });
    } catch {
      /* stats optionnelles : la table reste utilisable */
    }
  }

  async function loadCategories(): Promise<void> {
    try {
      const res = (await api.categoriesList()) as { rows: Category[] };
      setCategories(res.rows);
    } catch {
      setCategories([]);
    }
  }

  async function load(
    q: string,
    cat: string,
    st: StockFilter,
    archived: boolean,
    p: number,
  ): Promise<void> {
    const seq = (loadSeq.current += 1);
    setLoading(true);
    setLoadError("");
    try {
      const res = (await api.productSearch({
        query: q.trim(),
        categoryId: cat === "" ? null : Number(cat),
        stockFilter: st,
        includeArchived: archived,
        page: p,
        pageSize: PAGE_SIZE,
      })) as { rows: Product[]; total: number };
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

  // Chargement initial (stats + catégories + première page).
  useEffect(() => {
    void loadStats();
    void loadCategories();
    void load("", "", "all", false, 1);
  }, []);

  function onQueryChange(raw: string): void {
    const q = uppercaseBarcodeInput(raw);
    setQuery(q);
    setPage(1);
    queryTimer.schedule(250, () => {
      void load(q, categoryId, status, includeArchived, 1);
    });
  }

  function changeCategory(cat: string): void {
    setCategoryId(cat);
    setPage(1);
    void load(query, cat, status, includeArchived, 1);
  }

  function changeStatus(st: StockFilter): void {
    setStatus(st);
    setPage(1);
    void load(query, categoryId, st, includeArchived, 1);
  }

  function toggleArchived(): void {
    const next = !includeArchived;
    setIncludeArchived(next);
    setPage(1);
    setSelection(new Map());
    void load(query, categoryId, status, next, 1);
  }

  function changePage(p: number): void {
    setPage(p);
    void load(query, categoryId, status, includeArchived, p);
  }

  function refresh(): void {
    setSelection(new Map());
    void loadStats();
    void loadCategories();
    void load(query, categoryId, status, includeArchived, page);
  }

  function resetFilters(): void {
    setQuery("");
    setCategoryId("");
    setStatus("all");
    setIncludeArchived(false);
    setPage(1);
    setSelection(new Map());
    void load("", "", "all", false, 1);
  }

  function openCreate(): void {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(p: Product): void {
    setDrawerProduct(null);
    setEditing(p);
    setFormOpen(true);
  }

  function toggleSelect(p: Product): void {
    setSelection((prev) => {
      const next = new Map(prev);
      if (next.has(p.id)) next.delete(p.id);
      else next.set(p.id, p);
      return next;
    });
  }

  function toggleSelectPage(): void {
    setSelection((prev) => {
      const next = new Map(prev);
      const allSelected = rows.length > 0 && rows.every((r) => next.has(r.id));
      if (allSelected) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.set(r.id, r));
      return next;
    });
  }

  const csvInputRef = useRef<HTMLInputElement | null>(null);

  /** P3 : import CSV catalogue (parse domaine FR + commit atomique main). */
  async function importCsvFile(file: File): Promise<void> {
    let rows: ReturnType<typeof parseProductsCsv>;
    try {
      rows = parseProductsCsv(await file.text());
    } catch (e) {
      notify(frError(e, "Fichier CSV invalide."), "err");
      return;
    }
    if (!(await confirmAsync(`Importer ${rows.length} produit(s) depuis « ${file.name} » ?`))) {
      return;
    }
    try {
      const res = (await api.productsImport({
        operationId: newOperationId(),
        rows: rows.map((r) => ({
          name: r.name,
          sellingPriceMinor: r.sellingPriceMinor,
          purchasePriceMinor: r.purchasePriceMinor,
          quantity: r.quantity,
          barcode: r.barcode,
        })),
      })) as { imported: number; skipped: number };
      notify(`${res.imported} produit(s) importé(s).`, "ok");
      refresh();
    } catch (e) {
      notify(frError(e, "Import impossible."), "err");
    }
  }

  async function archiveSelection(): Promise<void> {
    if (selection.size === 0) return;
    if (!(await confirmAsync(`Archiver ${selection.size} produit(s) ?`))) return;
    setBulkLabel(`Archivage 0/${selection.size}…`);
    setBulkBusy(true);
    // A-15 : lot à concurrence bornée + progression (200 archives
    // séquentielles = plusieurs minutes sans aucun retour visuel).
    const res = await runBulk(
      [...selection.keys()],
      async (id) => {
        await api.productArchive({ id, operationId: newOperationId() });
      },
      {
        onProgress: (processed, total) => setBulkLabel(`Archivage ${processed}/${total}…`),
      },
    );
    setBulkBusy(false);
    setBulkLabel("");
    notify(
      res.failed > 0
        ? `${res.done} produit(s) archivé(s), ${res.failed} échec(s).`
        : `${res.done} produit(s) archivé(s).`,
      res.failed > 0 ? "err" : "ok",
    );
    refresh();
  }

  function openLabelsSelection(): void {
    // Toutes les pages confondues : la sélection porte les fiches, pas
    // seulement les lignes de la page affichée.
    const items: LabelTarget[] = labelTargets(selection.values());
    if (items.length === 0) {
      notify("Aucun produit sélectionné avec code-barres.", "err");
      return;
    }
    setLabelsFor(items);
  }

  /**
   * Export CSV du catalogue filtré (TOUTES les pages du filtre courant :
   * n'exporter que la page affichée serait une troncature silencieuse).
   * Concurrence bornée + progression (A-15), comme l'export clients.
   *
   * ADR-135 : deux formats. « rapport » = lisible dans Excel (colonnes
   * enrichies, montants DZD) ; « données » = réimportable tel quel
   * (`nom;vente;achat;quantité[;code-barres]`).
   */
  async function exportCsv(kind: "report" | "data"): Promise<void> {
    if (total === 0) {
      notify("Rien à exporter.", "err");
      return;
    }
    if (kind === "data" && includeArchived) {
      notify(
        "Export données impossible : décochez « Afficher les archivés » (le format d'import ne transporte pas le statut).",
        "err",
      );
      return;
    }
    setExportKind(kind);
    setBulkBusy(true);
    try {
      const all: Product[] = [];
      const pageCount = Math.ceil(total / PAGE_SIZE);
      const pages: (Product[] | undefined)[] = [];
      const bulk = await runBulk(
        Array.from({ length: pageCount }, (_, i) => i + 1),
        async (p) => {
          const res = (await api.productSearch({
            query: query.trim(),
            categoryId: categoryId === "" ? null : Number(categoryId),
            stockFilter: status,
            includeArchived,
            page: p,
            pageSize: PAGE_SIZE,
          })) as { rows: Product[]; total: number };
          pages[p - 1] = res.rows;
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
          `[Veloria] catalogue : export CSV interrompu (${bulk.failed}/${bulk.total} page(s)).`,
        );
        notify(
          `Export interrompu : ${bulk.failed} page(s) sur ${bulk.total} illisible(s). Réessayez.`,
          "err",
        );
        return;
      }
      for (const r of pages) {
        if (r) all.push(...r);
      }
      const date = todayBusinessDate();
      if (kind === "report") {
        downloadCsv(`catalogue-${date}.csv`, productCsvRows(all));
        notify(`${all.length} produit(s) exporté(s).`, "ok");
      } else {
        downloadCsv(`catalogue-donnees-${date}.csv`, productImportCsvRows(all), {
          protectFormulas: false,
        });
        notify(
          `${all.length} produit(s) exporté(s) en format réimportable (nom;vente;achat;quantité[;code-barres]).`,
          "ok",
        );
      }
    } catch (e) {
      console.error(`[Veloria] catalogue : export CSV (${kind}) impossible`, e);
      notify("Export impossible.", "err");
    } finally {
      setBulkBusy(false);
      setBulkLabel("");
      setExportKind(null);
    }
  }

  const visible = sortProducts(rows, sort);
  const allPageSelected = rows.length > 0 && rows.every((r) => selection.has(r.id));

  return (
    <div className="flex h-full flex-col gap-4">
      {/* En-tête Stitch : Catalogue des Produits · INDEX v2.4 */}
      <PageHeader
        title="Catalogue des produits"
        module="Catalogue · références et prix"
        period={`${total} référence(s) active(s) · ${stats.low} en stock bas · ${stats.out} en rupture de stock`}
        actions={
          <>
            <SearchField
              value={query}
              onChange={onQueryChange}
              placeholder="Rechercher… [F3]"
              ariaLabel="Rechercher un produit"
              inputRef={searchRef}
              className="w-full sm:w-64"
            />
            <Button onClick={openCreate} title="Créer un produit">
              <Plus size={16} aria-hidden="true" /> Nouveau produit
            </Button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              aria-label="Fichier CSV à importer"
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
          { label: "Références actives", value: String(stats.total), sub: "Catalogue indexé" },
          {
            label: "Disponibles",
            value: String(stats.available),
            sub: "En stock",
            tone: stats.available > 0 ? "green" : "default",
          },
          {
            label: "Stock bas",
            value: String(stats.low),
            sub: "Sous le seuil",
            tone: stats.low > 0 ? "amber" : "default",
          },
          {
            label: "Ruptures",
            value: String(stats.out),
            sub: "Stock à zéro",
            tone: stats.out > 0 ? "red" : "default",
          },
        ]}
      />

      <Toolbar className="gap-2">
        <span className="flex h-[42px] items-center gap-2 rounded-xl bg-white/[0.03] px-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
          <SlidersHorizontal size={14} aria-hidden="true" />
          Filtres
        </span>
        <Select
          id="catalog-category"
          value={categoryId}
          onChange={(e) => changeCategory(e.target.value)}
          aria-label="Filtre catégorie"
          className="w-auto min-w-[150px]"
        >
          <option value="">Toutes catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          id="catalog-status"
          value={status}
          onChange={(e) => changeStatus(e.target.value as StockFilter)}
          aria-label="Filtre statut"
          className="w-auto"
        >
          <option value="all">Tous les statuts</option>
          <option value="in_stock">En stock</option>
          <option value="low_stock">Stock bas</option>
          <option value="out_of_stock">Rupture</option>
        </Select>
        <Select
          id="catalog-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as ProductSort)}
          aria-label="Tri"
          className="w-auto"
        >
          <option value="name_asc">Tri : nom A → Z</option>
          <option value="name_desc">Tri : nom Z → A</option>
          <option value="price_asc">Tri : prix croissant</option>
          <option value="price_desc">Tri : prix décroissant</option>
          <option value="stock_asc">Tri : stock croissant</option>
          <option value="stock_desc">Tri : stock décroissant</option>
        </Select>
        <label
          className={cn(
            "flex h-[42px] cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors",
            includeArchived
              ? "border-[#fbbf24]/30 bg-[#fbbf24]/10 text-amber-200"
              : "border-white/10 bg-black/25 text-slate-300 hover:border-white/20",
          )}
        >
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={toggleArchived}
            aria-label="Afficher les archivés"
            className="h-4 w-4 accent-amber-400"
          />
          Archivés
        </label>
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
            title="Exporter tout le filtre en CSV réimportable (nom;vente;achat;quantité[;code-barres])"
          >
            <FileDown size={15} aria-hidden="true" />
            {bulkBusy && exportKind === "data" ? bulkLabel : "Données CSV"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => csvInputRef.current?.click()}
            title="Importer un catalogue CSV (nom;vente;achat;quantité[;code-barres])"
          >
            <Upload size={15} aria-hidden="true" /> Import CSV
          </Button>
        </div>
      </Toolbar>

      {/* Sélection multiple */}
      {selection.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#fbbf24]/25 bg-[linear-gradient(90deg,rgba(251,191,36,0.10),rgba(251,191,36,0.02))] px-4 py-2.5 text-sm">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#fbbf24]/15 text-[#fbbf24] ring-1 ring-[#fbbf24]/20">
            <Archive size={14} aria-hidden="true" />
          </span>
          <strong className="font-bold text-slate-100">{selection.size} sélectionné(s)</strong>
          <span aria-hidden="true" className="h-4 w-px bg-white/10" />
          <Button variant="secondary" onClick={() => void archiveSelection()} disabled={bulkBusy}>
            <Archive size={15} aria-hidden="true" />
            {bulkBusy ? bulkLabel || "Archivage…" : "Archiver la sélection"}
          </Button>
          <Button variant="secondary" onClick={openLabelsSelection}>
            <Barcode size={15} aria-hidden="true" /> Étiquettes
          </Button>
          <button
            type="button"
            onClick={() => setSelection(new Map())}
            className="ml-auto text-xs font-semibold text-slate-400 transition-colors hover:text-white"
          >
            Tout désélectionner
          </button>
        </div>
      ) : null}

      {/* Table produits */}
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
                title="Aucun produit"
                hint="Modifiez la recherche ou créez votre premier produit avec le bouton « Nouveau produit »."
              />
              <Button onClick={openCreate} className="-mt-12 mb-10">
                <Plus size={16} aria-hidden="true" /> Créer un produit
              </Button>
            </div>
          ) : (
            <table className="w-full min-w-[960px] text-sm">
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
                  <th className="px-3 py-2.5">Code</th>
                  <th className="px-3 py-2.5">Produit</th>
                  <th className="px-3 py-2.5">Code-barres</th>
                  <th className="px-3 py-2.5">Catégorie</th>
                  <th className="px-3 py-2.5 text-right">Coût</th>
                  <th className="px-3 py-2.5 text-right">P. vente</th>
                  <th className="px-3 py-2.5 text-right">Stock</th>
                  <th className="px-3 py-2.5">Statut</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const marginPct =
                    p.purchase_price_minor > 0 && p.selling_price_minor > 0
                      ? Math.round(
                          ((p.selling_price_minor - p.purchase_price_minor) /
                            p.selling_price_minor) *
                            100,
                        )
                      : null;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setDrawerProduct(p)}
                      className={cn(
                        "cursor-pointer border-t border-white/[0.06] transition-colors hover:bg-amber-400/[0.06]",
                        selection.has(p.id) && "bg-amber-400/[0.08]",
                        isArchived(p) && "opacity-60",
                      )}
                    >
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selection.has(p.id)}
                          onChange={() => toggleSelect(p)}
                          aria-label={`Sélectionner ${p.name}`}
                          className="h-4 w-4 accent-amber-400"
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">#{p.id}</td>
                      <td className="max-w-[280px] px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          <span
                            aria-hidden="true"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] font-mono text-[12px] font-bold uppercase text-slate-400 ring-1 ring-white/10"
                          >
                            {p.name.trim().charAt(0) || "?"}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{p.name}</div>
                            <div className="mt-0.5 truncate font-mono text-[10px] text-slate-500">
                              {p.unit_code}
                              {p.min_stock_level > 0 ? ` · min ${p.min_stock_level}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-400">
                        {p.primary_barcode ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-300">{p.category_name ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                        {formatDzd(p.purchase_price_minor)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="font-bold tabular-nums">
                          {formatDzd(p.selling_price_minor)}
                        </div>
                        {marginPct != null ? (
                          <div
                            className={cn(
                              "text-[10px] tabular-nums",
                              marginPct < 0 ? "text-red-300" : "text-emerald-300/80",
                            )}
                          >
                            {marginPct > 0 ? "+" : ""}
                            {marginPct} %
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div
                          className={cn(
                            "font-bold tabular-nums",
                            p.quantity <= 0 ? "text-red-300" : "text-slate-100",
                          )}
                        >
                          {p.quantity}
                        </div>
                        <div className="text-[10px] text-slate-500">{p.unit_code}</div>
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={stockTone(p)}>{stockLabel(p)}</Badge>
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <RowAction
                            label={`Voir ${p.name}`}
                            title="Détails de la fiche"
                            onClick={() => setDrawerProduct(p)}
                          >
                            <Eye size={15} aria-hidden="true" />
                          </RowAction>
                          <RowAction
                            label={`Mouvements ${p.name}`}
                            title="Mouvements (graphe + journal)"
                            onClick={() => setMovementsFor(p)}
                          >
                            <Activity size={15} aria-hidden="true" />
                          </RowAction>
                          <RowAction
                            label={`Étiquettes ${p.name}`}
                            title="Étiquettes code-barres"
                            onClick={() =>
                              p.primary_barcode
                                ? setLabelsFor([
                                    {
                                      name: p.name,
                                      priceMinor: p.selling_price_minor,
                                      barcode: p.primary_barcode,
                                    },
                                  ])
                                : notify("Produit sans code-barres.", "err")
                            }
                          >
                            <Barcode size={15} aria-hidden="true" />
                          </RowAction>
                          {!isArchived(p) ? (
                            <RowAction
                              label={`Modifier ${p.name}`}
                              title="Modifier"
                              onClick={() => openEdit(p)}
                            >
                              <Pencil size={15} aria-hidden="true" />
                            </RowAction>
                          ) : (
                            <RowAction
                              label={`Restaurer ${p.name}`}
                              title="Restaurer la fiche"
                              onClick={() => void restoreRow(p)}
                            >
                              <RotateCcw size={15} aria-hidden="true" />
                            </RowAction>
                          )}
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
      {drawerProduct ? (
        <ProductDetailsDrawer
          product={drawerProduct}
          onClose={() => setDrawerProduct(null)}
          onEdit={openEdit}
          onChanged={refresh}
          notify={notify}
        />
      ) : null}

      {/* Mouvements : tiroir Stock unique (journal + filtres, source unique)
          — l'ancien MovementsDialog Catalogue (doublon faible, audit) est
          supprimé avec son graphe agrégé incomplet (100 dernières lignes). */}
      {movementsFor ? (
        <StockMovementHistoryDrawer
          product={{ ...movementsFor, stock_value_minor: 0, last_movement_at: null }}
          onClose={() => setMovementsFor(null)}
        />
      ) : null}

      {/* Étiquettes code-barres */}
      {labelsFor ? (
        <LabelsDialog items={labelsFor} onClose={() => setLabelsFor(null)} notify={notify} />
      ) : null}

      {/* Formulaire création / édition */}
      {formOpen ? (
        <ProductFormDialog
          product={editing}
          categories={categories}
          onCategoryCreated={() => void loadCategories()}
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

  async function restoreRow(p: Product): Promise<void> {
    try {
      await api.productRestore({ id: p.id, operationId: newOperationId() });
      notify(`Produit « ${p.name} » restauré.`, "ok");
      refresh();
    } catch (e) {
      notify(frError(e, "Restauration impossible."), "err");
    }
  }
}
