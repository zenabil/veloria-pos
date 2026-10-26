// Veloria PoS — Écran : Stock (valeur, seuils, ajustements, inventaire).
// En-tête + 4 cartes stats + barre d'outils + table serveur + pagination +
// tiroir détail + ajustement + historique + inventaire.
import { useEffect, useRef, useState } from "react";
import {
  ClipboardCheck,
  Eye,
  FileScan,
  History,
  PackagePlus,
  ReceiptText,
  SlidersHorizontal,
  Wrench,
  X,
} from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { formatDzd } from "@domain/money/money.ts";
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
import { uppercaseBarcodeInput } from "@shared/ui/barcode-input.ts";
import {
  InventoryDialog,
  StockAdjustmentDialog,
  StockDetailsDrawer,
  StockIntakeDialog,
  StockIntakesDrawer,
  StockMovementHistoryDrawer,
  type StockIntakeInitial,
} from "./StockDialogs.tsx";
import { OcrImportDialog } from "./OcrImportDialog.tsx";
import {
  maxStockLabel,
  stockStatusLabel,
  stockStatusTone,
  type StockMovement,
  type StockMovementFilter,
  type StockRow,
  type StockSort,
  type StockStatusFilter,
} from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { playSound } from "@shared/sound/sound.ts";

const PAGE_SIZE = 20;

interface Stats {
  value: number;
  qty: number;
  low: number;
  out: number;
}

interface Category {
  id: number;
  name: string;
}

export interface InventoryPreset {
  id: number;
  name: string;
  unit: string;
  systemQty: number;
}

export function StockScreen({ notify }: { notify: Notify }): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [statusFilter, setStatusFilter] = useState<StockStatusFilter>("all");
  const [movementFilter, setMovementFilter] = useState<StockMovementFilter>("all");
  const [sort, setSort] = useState<StockSort>("name_asc");
  const [toolbarOpen, setToolbarOpen] = useState(true);
  // P4 : menu "Actions stock" (Factures/Correction/OCR regroupés).
  const [actionsOpen, setActionsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  // A-06 : erreur de chargement PERSISTANTE (le toast dure 4,5 s).
  // Distingue « échec du chargement » de « aucune donnée ».
  const [loadError, setLoadError] = useState("");
  const [stats, setStats] = useState<Stats>({ value: 0, qty: 0, low: 0, out: 0 });
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [drawer, setDrawer] = useState<{ row: StockRow; last: StockMovement | null } | null>(null);
  const [adjustFor, setAdjustFor] = useState<StockRow | null | undefined>(undefined);
  const [historyFor, setHistoryFor] = useState<StockRow | null>(null);
  const [inventoryFor, setInventoryFor] = useState<InventoryPreset[] | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  // ADR-139 : correction d'une facture annulée = formulaire prérempli.
  const [intakeInitial, setIntakeInitial] = useState<StockIntakeInitial | null>(null);
  const [intakesOpen, setIntakesOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const queryTimer = useDebouncedTimer();
  const searchRef = useRef<HTMLInputElement>(null);
  const loadSeq = useRef(0);
  // P5 : drapeau de session (l'alerte rupture ne sonne qu'une fois).
  const stockWarned = useRef(false);

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
        inventoryValueMinor: number;
        totalQty: number;
        lowStock: number;
        outOfStock: number;
      };
      setStats({
        value: s.inventoryValueMinor,
        qty: s.totalQty,
        low: s.lowStock,
        out: s.outOfStock,
      });
      // P5 : ruptures → alerte unique par session (pas à chaque visite).
      if (s.outOfStock > 0 && !stockWarned.current) {
        stockWarned.current = true;
        playSound("warning");
        notify(`${s.outOfStock} produit(s) en rupture de stock.`, "err");
      }
    } catch {
      /* stats optionnelles */
    }
  }

  async function loadCategories(): Promise<void> {
    try {
      const res = (await api.categoriesList()) as { rows: Category[] };
      setCategories(res.rows);
    } catch {
      /* filtre catégorie optionnel */
    }
  }

  async function load(
    q: string,
    cat: number | null,
    status: StockStatusFilter,
    movement: StockMovementFilter,
    s: StockSort,
    p: number,
  ): Promise<void> {
    const seq = (loadSeq.current += 1);
    setLoading(true);
    setLoadError("");
    try {
      const res = (await api.stockProducts({
        query: q.trim(),
        categoryId: cat,
        stockStatus: status,
        movementType: movement,
        sort: s,
        page: p,
        pageSize: PAGE_SIZE,
      })) as { rows: StockRow[]; total: number };
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
    void loadStats();
    void loadCategories();
    void load("", null, "all", "all", "name_asc", 1);
  }, []);

  function reload(p = page): void {
    void load(query, categoryId, statusFilter, movementFilter, sort, p);
  }

  function onQueryChange(raw: string): void {
    const q = uppercaseBarcodeInput(raw);
    setQuery(q);
    setPage(1);
    queryTimer.schedule(250, () => {
      void load(q, categoryId, statusFilter, movementFilter, sort, 1);
    });
  }

  function changeCategory(v: string): void {
    const cat = v === "" ? null : Number(v);
    setCategoryId(cat);
    setPage(1);
    void load(query, cat, statusFilter, movementFilter, sort, 1);
  }

  function changeStatus(f: StockStatusFilter): void {
    setStatusFilter(f);
    setPage(1);
    void load(query, categoryId, f, movementFilter, sort, 1);
  }

  function changeMovement(f: StockMovementFilter): void {
    setMovementFilter(f);
    setPage(1);
    void load(query, categoryId, statusFilter, f, sort, 1);
  }

  function changeSort(s: StockSort): void {
    setSort(s);
    setPage(1);
    void load(query, categoryId, statusFilter, movementFilter, s, 1);
  }

  function changePage(p: number): void {
    setPage(p);
    void load(query, categoryId, statusFilter, movementFilter, sort, p);
  }

  function refresh(): void {
    setSelection(new Set());
    void loadStats();
    reload();
  }

  function resetFilters(): void {
    setQuery("");
    setCategoryId(null);
    setStatusFilter("all");
    setMovementFilter("all");
    setSort("name_asc");
    setPage(1);
    setSelection(new Set());
    void load("", null, "all", "all", "name_asc", 1);
  }

  async function openDrawer(r: StockRow): Promise<void> {
    try {
      const res = (await api.stockMovements({ productId: r.id, page: 1, pageSize: 1 })) as {
        rows: StockMovement[];
      };
      setDrawer({ row: r, last: res.rows[0] ?? null });
    } catch {
      setDrawer({ row: r, last: null });
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

  function openInventoryForSelection(): void {
    const preset: InventoryPreset[] = rows
      .filter((r) => selection.has(r.id))
      .map((r) => ({ id: r.id, name: r.name, unit: r.unit_code, systemQty: r.quantity }));
    if (preset.length === 0) return;
    setInventoryFor(preset);
  }

  const allPageSelected = rows.length > 0 && rows.every((r) => selection.has(r.id));

  return (
    <div className="flex h-full flex-col gap-4">
      {/* En-tête Stitch : Gestion des Stocks & Réceptions · Dépôt Central */}
      <PageHeader
        title="Gestion des stocks et réceptions"
        module="Dépôt central"
        period={`${total} référence(s) tracée(s) · Valeur globale ${formatDzd(stats.value)} · ${stats.low} sous seuil critique`}
        actions={
          <>
            <SearchField
              value={query}
              onChange={onQueryChange}
              placeholder="Rechercher… [F3]"
              ariaLabel="Rechercher un produit en stock"
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
            {/* P4 : actions secondaires regroupées (la Réception reste directe). */}
            <div className="relative">
              <Button
                variant="secondary"
                onClick={() => setActionsOpen((o) => !o)}
                aria-expanded={actionsOpen}
                aria-haspopup="menu"
                title="Actions stock"
              >
                Actions stock
              </Button>
              {actionsOpen ? (
                <>
                  <button
                    type="button"
                    aria-label="Fermer le menu"
                    className="fixed inset-0 z-10 cursor-default"
                    onClick={() => setActionsOpen(false)}
                  />
                  <div
                    role="menu"
                    className="absolute right-0 z-20 mt-1 w-56 space-y-1 rounded-xl border border-white/10 bg-[#122131] p-2 shadow-xl"
                  >
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setActionsOpen(false);
                        setIntakesOpen(true);
                      }}
                      title="Factures fournisseurs"
                      className="w-full justify-start"
                    >
                      <ReceiptText size={16} aria-hidden="true" /> Factures
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setActionsOpen(false);
                        setAdjustFor(null);
                      }}
                      title="Corriger le stock (avec motif)"
                      className="w-full justify-start"
                    >
                      <Wrench size={16} aria-hidden="true" /> Correction
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setActionsOpen(false);
                        setOcrOpen(true);
                      }}
                      title="Importer depuis facture (OCR 100 % local, hors-ligne)"
                      className="w-full justify-start"
                    >
                      <FileScan size={16} aria-hidden="true" /> Facture OCR
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
            <Button
              onClick={() => {
                setIntakeInitial(null);
                setIntakeOpen(true);
              }}
              title="Réception fournisseur (facture + livraison)"
            >
              <PackagePlus size={16} aria-hidden="true" /> Nouveau Bon Réception
            </Button>
            {/* OCR accessible via « Actions stock → Facture OCR » (pas de doublon). */}
          </>
        }
      />

      {/* Cartes statistiques Stitch */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Valeur du Stock (FIFO)"
          value={formatDzd(stats.value)}
          sub="Valeur globale (achat)"
          accent="#fbbf24"
        />
        <Kpi
          label="Quantité totale"
          value={String(stats.qty)}
          sub="Toutes unités"
          accent="#4edea3"
        />
        <Kpi label="Stock Bas" value={String(stats.low)} sub="Sous le seuil" accent="#8ed0ff" />
        <Kpi label="Ruptures" value={String(stats.out)} sub="Quantité ≤ 0" accent="#ffb4ab" />
      </div>

      {/* Barre d'outils */}
      {toolbarOpen ? (
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="stock-search"
            >
              Recherche
            </label>
            <TextInput
              id="stock-search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Nom ou code-barres…"
              aria-label="Recherche stock"
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="stock-category"
            >
              Catégorie
            </label>
            <Select
              id="stock-category"
              value={categoryId == null ? "" : String(categoryId)}
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
              htmlFor="stock-status"
            >
              Statut
            </label>
            <Select
              id="stock-status"
              value={statusFilter}
              onChange={(e) => changeStatus(e.target.value as StockStatusFilter)}
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
              htmlFor="stock-movement"
            >
              Mouvement
            </label>
            <Select
              id="stock-movement"
              value={movementFilter}
              onChange={(e) => changeMovement(e.target.value as StockMovementFilter)}
              aria-label="Filtre mouvement"
            >
              <option value="all">Tous</option>
              <option value="sale_out">Ventes</option>
              <option value="intake_in">Entrées</option>
              <option value="adjust_in">Ajustements +</option>
              <option value="adjust_out">Ajustements −</option>
              <option value="return_in">Retours</option>
              <option value="damage_out">Casse</option>
              <option value="sale_cancel_in">Annulations</option>
            </Select>
          </div>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
              htmlFor="stock-sort"
            >
              Tri
            </label>
            <Select
              id="stock-sort"
              value={sort}
              onChange={(e) => changeSort(e.target.value as StockSort)}
              aria-label="Tri"
            >
              <option value="name_asc">Nom A → Z</option>
              <option value="name_desc">Nom Z → A</option>
              <option value="qty_asc">Quantité croissante</option>
              <option value="qty_desc">Quantité décroissante</option>
              <option value="value_desc">Valeur décroissante</option>
              <option value="recent_desc">Mouvements récents</option>
            </Select>
          </div>
          <Button variant="ghost" onClick={resetFilters} title="Réinitialiser les filtres">
            <X size={15} aria-hidden="true" /> Réinitialiser
          </Button>
        </Card>
      ) : null}

      {/* Sélection multiple → inventaire */}
      {selection.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-4 py-2.5 text-sm">
          <strong>{selection.size} sélectionné(s)</strong>
          <Button variant="secondary" onClick={openInventoryForSelection}>
            <ClipboardCheck size={15} aria-hidden="true" /> Inventaire de la sélection
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

      {/* Table stock */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto">
          {loadError ? (
            <ErrorState message={loadError} />
          ) : loading && rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500" role="status">
              Chargement…
            </p>
          ) : rows.length === 0 ? (
            <EmptyState
              title="Aucun produit"
              hint="Modifiez la recherche ou créez des produits dans le Catalogue."
            />
          ) : (
            <table className="w-full min-w-[1180px] text-sm">
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
                  <th className="px-3 py-2.5">Code</th>
                  <th className="px-3 py-2.5">Produit</th>
                  <th className="px-3 py-2.5">Catégorie</th>
                  <th className="px-3 py-2.5 text-right">Stock</th>
                  <th className="px-3 py-2.5 text-right">Min</th>
                  <th className="px-3 py-2.5 text-right">Max</th>
                  <th className="px-3 py-2.5 text-right">Prix achat</th>
                  <th className="px-3 py-2.5 text-right">Valeur</th>
                  <th className="px-3 py-2.5">Statut</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => void openDrawer(r)}
                    className={cn(
                      "cursor-pointer border-t border-white/[0.06] transition-colors hover:bg-amber-400/[0.06]",
                      selection.has(r.id) && "bg-amber-400/[0.08]",
                    )}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selection.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        aria-label={`Sélectionner ${r.name}`}
                        className="h-4 w-4 accent-amber-400"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-400">
                      {r.primary_barcode || "—"}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2 font-semibold">{r.name}</td>
                    <td className="max-w-[140px] truncate px-3 py-2 text-slate-300">
                      {r.category_name || "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">
                      {r.quantity}{" "}
                      <span className="text-xs font-normal text-slate-500">{r.unit_code}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {r.min_stock_level}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {maxStockLabel(r.max_stock_level)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                      {formatDzd(r.purchase_price_minor)}
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-amber-200/90">
                      {formatDzd(r.stock_value_minor)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={stockStatusTone(r.stock_status)}>
                        {stockStatusLabel(r.stock_status)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <RowAction
                          label={`Voir ${r.name}`}
                          title="Détails de la fiche"
                          onClick={() => void openDrawer(r)}
                        >
                          <Eye size={15} aria-hidden="true" />
                        </RowAction>
                        <RowAction
                          label={`Ajuster ${r.name}`}
                          title="Ajuster le stock"
                          onClick={() => setAdjustFor(r)}
                        >
                          <Wrench size={15} aria-hidden="true" />
                        </RowAction>
                        <RowAction
                          label={`Historique ${r.name}`}
                          title="Historique"
                          onClick={() => setHistoryFor(r)}
                        >
                          <History size={15} aria-hidden="true" />
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
        <StockDetailsDrawer
          row={drawer.row}
          last={drawer.last}
          onClose={() => setDrawer(null)}
          onAdjust={(r) => {
            setDrawer(null);
            setAdjustFor(r);
          }}
          onHistory={(r) => {
            setDrawer(null);
            setHistoryFor(r);
          }}
        />
      ) : null}

      {/* Ajustement (produit imposé ou sélecteur) */}
      {adjustFor !== undefined ? (
        <StockAdjustmentDialog
          product={adjustFor}
          onClose={() => setAdjustFor(undefined)}
          onSaved={() => {
            setAdjustFor(undefined);
            refresh();
          }}
          notify={notify}
        />
      ) : null}

      {/* Historique des mouvements */}
      {historyFor ? (
        <StockMovementHistoryDrawer product={historyFor} onClose={() => setHistoryFor(null)} />
      ) : null}

      {/* Inventaire */}
      {inventoryFor ? (
        <InventoryDialog
          initial={inventoryFor}
          onClose={() => setInventoryFor(null)}
          onSaved={() => {
            setInventoryFor(null);
            refresh();
          }}
          notify={notify}
        />
      ) : null}

      {/* Réception fournisseur (facture + livraison + coût unitaire) */}
      {intakeOpen ? (
        <StockIntakeDialog
          onClose={() => {
            setIntakeOpen(false);
            setIntakeInitial(null);
          }}
          onSaved={() => {
            setIntakeOpen(false);
            setIntakeInitial(null);
            refresh();
          }}
          notify={notify}
          {...(intakeInitial == null ? null : { initial: intakeInitial })}
        />
      ) : null}

      {/* Factures fournisseurs : détail + annulation/correction (ADR-139) */}
      {intakesOpen ? (
        <StockIntakesDrawer
          onClose={() => setIntakesOpen(false)}
          notify={notify}
          onCorrect={(initial) => {
            setIntakesOpen(false);
            setIntakeInitial(initial);
            setIntakeOpen(true);
          }}
        />
      ) : null}

      {/* Import OCR local (relecture obligatoire avant stock.intake) */}
      {ocrOpen ? (
        <OcrImportDialog
          onClose={() => setOcrOpen(false)}
          onSaved={() => {
            setOcrOpen(false);
            refresh();
          }}
          notify={notify}
        />
      ) : null}
    </div>
  );
}
