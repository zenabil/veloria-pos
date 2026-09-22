// Veloria PoS — Écran : Catalogue (gestion produits, clavier d'abord).
// En-tête + 4 cartes stats + barre d'outils + table + pagination +
// tiroir détail + formulaire (création/édition) + sélection multiple.
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Barcode,
  Eye,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { parseProductsCsv } from "@domain/import/csv-import.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { formatDzd } from "@domain/money/money.ts";
import { newOperationId } from "@domain/common/ids.ts";
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
  ProductDetailsDrawer,
  ProductFormDialog,
  ProductMovementsDialog,
  LabelsDialog,
  type LabelTarget,
} from "./ProductDialogs.tsx";
import {
  isArchived,
  sortProducts,
  stockLabel,
  stockTone,
  type Category,
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
  const [toolbarOpen, setToolbarOpen] = useState(true);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats>({ total: 0, available: 0, low: 0, out: 0 });
  const [categories, setCategories] = useState<Category[]>([]);
  const [selection, setSelection] = useState<Set<number>>(new Set());
  // Confirmation non bloquante (modale applicative).
  const confirmAsync = useConfirm();
  const [drawerProduct, setDrawerProduct] = useState<Product | null>(null);
  const [movementsFor, setMovementsFor] = useState<Product | null>(null);
  const [labelsFor, setLabelsFor] = useState<LabelTarget[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const queryTimer = useRef<number | null>(null);
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

  useEffect(() => {
    return () => {
      if (queryTimer.current != null) window.clearTimeout(queryTimer.current);
    };
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
      notify(frError(err, "Chargement impossible."), "err");
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

  function onQueryChange(q: string): void {
    setQuery(q);
    setPage(1);
    if (queryTimer.current != null) window.clearTimeout(queryTimer.current);
    queryTimer.current = window.setTimeout(() => {
      void load(q, categoryId, status, includeArchived, 1);
    }, 250);
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
    setSelection(new Set());
    void load(query, categoryId, status, next, 1);
  }

  function changePage(p: number): void {
    setPage(p);
    void load(query, categoryId, status, includeArchived, p);
  }

  function refresh(): void {
    setSelection(new Set());
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
    setSelection(new Set());
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
    let done = 0;
    for (const id of selection) {
      try {
        await api.productArchive({ id, operationId: newOperationId() });
        done += 1;
      } catch {
        /* produit déjà traité : on continue */
      }
    }
    notify(`${done} produit(s) archivé(s).`, done > 0 ? "ok" : "err");
    refresh();
  }

  function openLabelsSelection(): void {
    const items: LabelTarget[] = rows
      .filter((p) => selection.has(p.id) && p.primary_barcode)
      .map((p) => ({
        name: p.name,
        priceMinor: p.selling_price_minor,
        barcode: p.primary_barcode as string,
      }));
    if (items.length === 0) {
      notify("Aucun produit sélectionné avec code-barres.", "err");
      return;
    }
    setLabelsFor(items);
  }

  const visible = sortProducts(rows, sort);
  const allPageSelected = rows.length > 0 && rows.every((r) => selection.has(r.id));

  return (
    <div className="flex h-full flex-col gap-4">
      {/* En-tête de page */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold tracking-tight">Catalogue</h2>
          <p className="text-xs text-slate-500">
            {total} produit(s) · {stats.low} en stock bas · {stats.out} en rupture
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
            aria-label="Rechercher un produit"
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
        <Button onClick={openCreate} title="Créer un produit">
          <Plus size={16} aria-hidden="true" /> Produit
        </Button>
        <Button
          variant="secondary"
          onClick={() => csvInputRef.current?.click()}
          title="Importer un catalogue CSV (nom;vente;achat;quantité[;code-barres])"
        >
          <Upload size={16} aria-hidden="true" /> Import CSV
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
      </div>

      {/* Cartes statistiques */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Produits" value={String(stats.total)} sub="Références actives" />
        <Kpi label="Disponibles" value={String(stats.available)} sub="En stock" />
        <Kpi label="Stock bas" value={String(stats.low)} sub="Sous le seuil" />
        <Kpi label="Ruptures" value={String(stats.out)} sub="Stock à zéro" />
      </div>

      {/* Barre d'outils */}
      {toolbarOpen ? (
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="catalog-search"
            >
              Recherche
            </label>
            <TextInput
              id="catalog-search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Nom ou code-barres…"
              aria-label="Recherche catalogue"
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="catalog-category"
            >
              Catégorie
            </label>
            <Select
              id="catalog-category"
              value={categoryId}
              onChange={(e) => changeCategory(e.target.value)}
              aria-label="Filtre catégorie"
            >
              <option value="">Toutes</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="catalog-status"
            >
              Statut
            </label>
            <Select
              id="catalog-status"
              value={status}
              onChange={(e) => changeStatus(e.target.value as StockFilter)}
              aria-label="Filtre statut"
            >
              <option value="all">Tous</option>
              <option value="in_stock">En stock</option>
              <option value="low_stock">Stock bas</option>
              <option value="out_of_stock">Rupture</option>
            </Select>
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="catalog-sort"
            >
              Tri
            </label>
            <Select
              id="catalog-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as ProductSort)}
              aria-label="Tri"
            >
              <option value="name_asc">Nom A → Z</option>
              <option value="name_desc">Nom Z → A</option>
              <option value="price_asc">Prix croissant</option>
              <option value="price_desc">Prix décroissant</option>
              <option value="stock_asc">Stock croissant</option>
              <option value="stock_desc">Stock décroissant</option>
            </Select>
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm font-semibold">
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
        </Card>
      ) : null}

      {/* Sélection multiple */}
      {selection.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-4 py-2.5 text-sm">
          <strong>{selection.size} sélectionné(s)</strong>
          <Button variant="secondary" onClick={() => void archiveSelection()}>
            <Trash2 size={15} aria-hidden="true" /> Archiver la sélection
          </Button>
          <Button variant="secondary" onClick={openLabelsSelection}>
            <Barcode size={15} aria-hidden="true" /> Étiquettes
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

      {/* Table produits */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto">
          {loading && rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500" role="status">
              Chargement…
            </p>
          ) : visible.length === 0 ? (
            <EmptyState
              title="Aucun produit"
              hint="Modifiez la recherche ou créez votre premier produit avec le bouton « Produit »."
            />
          ) : (
            <table className="w-full min-w-[960px] text-sm">
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
                  <th className="px-3 py-2.5">Code</th>
                  <th className="px-3 py-2.5">Produit</th>
                  <th className="px-3 py-2.5">Code-barres</th>
                  <th className="px-3 py-2.5">Catégorie</th>
                  <th className="px-3 py-2.5 text-right">P. achat</th>
                  <th className="px-3 py-2.5 text-right">P. vente</th>
                  <th className="px-3 py-2.5 text-right">Stock</th>
                  <th className="px-3 py-2.5">Statut</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setDrawerProduct(p)}
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
                        aria-label={`Sélectionner ${p.name}`}
                        className="h-4 w-4 accent-amber-400"
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">#{p.id}</td>
                    <td className="max-w-[240px] truncate px-3 py-2 font-semibold">{p.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-400">
                      {p.primary_barcode ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-300">{p.category_name ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {formatDzd(p.purchase_price_minor)}
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">
                      {formatDzd(p.selling_price_minor)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.quantity}</td>
                    <td className="px-3 py-2">
                      <Badge tone={stockTone(p)}>{stockLabel(p)}</Badge>
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <RowAction
                          label={`Voir ${p.name}`}
                          title="Détails"
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
                            title="Restaurer"
                            onClick={() => void restoreRow(p)}
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
      {drawerProduct ? (
        <ProductDetailsDrawer
          product={drawerProduct}
          onClose={() => setDrawerProduct(null)}
          onEdit={openEdit}
          onChanged={refresh}
          notify={notify}
        />
      ) : null}

      {/* Mouvements (graphe + journal) */}
      {movementsFor ? (
        <ProductMovementsDialog
          productId={movementsFor.id}
          productName={movementsFor.name}
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
