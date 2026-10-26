// Veloria PoS — Catalogue : tiroir détail + formulaire + ajustement de stock.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useEffect, useState } from "react";
import {
  Banknote,
  Boxes,
  ChevronDown,
  Layers,
  Package,
  Plus,
  Settings2,
  TriangleAlert,
  Truck,
  X,
} from "lucide-react";

import { api } from "@shared/types/ipc-client.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { formatDzd, minorToInput } from "@domain/money/money.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { normalizeUnitCode, validateProductDraft } from "@domain/product/product-rules.ts";
import { evaluateMargin } from "@domain/pricing/price-rules.ts";
import type { Packaging } from "@domain/packaging/types.ts";

import {
  Button,
  Field,
  Kbd,
  Modal,
  Select,
  Switch,
  TextInput,
  cn,
} from "@shared/ui/primitives.tsx";
import { formatDzdSigned } from "@shared/formatters/format.ts";
import { SupplierQuickCreateDialog } from "@features/suppliers/dialogs/FormDialog.tsx";
import { UNIT_OPTIONS, isArchived, unitLabel, type Category, type Product } from "../types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { parseQuantityInput } from "@domain/common/quantity.ts";
import { parseMoney } from "./common.ts";

// ---------------------------------------------------------------------------
// Formulaire produit (création + édition).
// ---------------------------------------------------------------------------

interface PackagingDraft {
  id: number | null;
  enabled: boolean;
  label: string;
  factor: string;
  selling: string;
  purchase: string;
  auto: boolean;
}

function emptyPackaging(): PackagingDraft {
  return {
    id: null,
    enabled: false,
    label: "",
    factor: "",
    selling: "",
    purchase: "",
    auto: true,
  };
}

const MARGIN_PCT_FR = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

/** Bloc de formulaire : un seul niveau visuel pour lire la fiche d'un coup d'œil. */
function FormSection({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="rounded-xl border border-white/[0.08] bg-black/20 p-3.5">
      <div className="mb-3 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-400/10 text-amber-300"
        >
          {icon}
        </span>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-300">
          {title}
        </h3>
        {hint ? <span className="ml-auto text-[11px] text-slate-500">{hint}</span> : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function ProductFormDialog({
  product,
  categories,
  onCategoryCreated,
  onClose,
  onSaved,
  notify,
}: {
  /** Absent = création, présent = édition. */
  product: Product | null;
  categories: Category[];
  onCategoryCreated: () => void;
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const editing = product != null;
  const confirmAsync = useConfirm();
  const [name, setName] = useState(product?.name ?? "");
  /** Codes-barres (le premier = principal). Backend : 20 max, unicité SQL. */
  const [barcodes, setBarcodes] = useState<string[]>(
    product?.primary_barcode ? [product.primary_barcode] : [],
  );
  const [barcodeInput, setBarcodeInput] = useState("");
  /** Fournisseurs liés (jonction) ; le premier devient le principal. */
  const [supplierIds, setSupplierIds] = useState<number[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<{ id: number; name: string }[]>([]);
  const [categoryId, setCategoryId] = useState(
    product?.category_id != null ? String(product.category_id) : "",
  );
  const [purchase, setPurchase] = useState(
    product ? minorToInput(product.purchase_price_minor) : "",
  );
  const [selling, setSelling] = useState(product ? minorToInput(product.selling_price_minor) : "");
  const [qty, setQty] = useState(product ? String(product.quantity) : "");
  const [minStock, setMinStock] = useState(product ? String(product.min_stock_level) : "");
  const [maxStock, setMaxStock] = useState(
    product && product.max_stock_level > 0 ? String(product.max_stock_level) : "",
  );
  const [unit, setUnit] = useState(product?.unit_code ?? "PIECE");
  const [packaging, setPackaging] = useState<PackagingDraft>(() => emptyPackaging());
  // P3 : péremption (colonne expiration_date — fini le `null` systématique).
  const [expiration, setExpiration] = useState(product?.expiration_date ?? "");
  const [active, setActive] = useState(product ? !isArchived(product) : true);
  const [newCategory, setNewCategory] = useState("");
  const [categoryCreateOpen, setCategoryCreateOpen] = useState(false);
  const [supplierQuery, setSupplierQuery] = useState("");
  // Rendu conditionnel (pas de `hidden`) : le piège de focus de `Modal` ne
  // doit jamais cibler un champ présent dans le DOM mais invisible.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Création inline : modale par-dessus, saisie produit conservée.
  const [supplierQuickOpen, setSupplierQuickOpen] = useState(false);
  // Idempotence (migration 0022) : un UUID par dialogue de création, régénéré
  // après succès — rejouer le même UUID retrouve le produit existant.
  const [operationId, setOperationId] = useState<string>(() => newOperationId());

  // Défauts des réglages (création uniquement, champs intacts).
  useEffect(() => {
    api
      .supplierSearch({ query: "", page: 1, pageSize: 100 })
      .then((r) => {
        setSupplierOptions(
          ((r as { rows?: { id: number; name: string }[] }).rows ?? []).map((s) => ({
            id: s.id,
            name: s.name,
          })),
        );
      })
      .catch(() => undefined);
    if (product == null) return;
    api
      .productBarcodes({ id: product.id })
      .then((r) => {
        const rows = (r as { rows?: { barcode: string }[] }).rows ?? [];
        if (rows.length > 0) setBarcodes(rows.map((b) => b.barcode));
      })
      .catch(() => undefined);
    api
      .productSuppliers({ id: product.id })
      .then((r) => {
        setSupplierIds(((r as { rows?: { id: number }[] }).rows ?? []).map((s) => s.id));
      })
      .catch(() => undefined);
    api
      .productPackagingsList({ productId: product.id })
      .then((r) => {
        const active = ((r as { rows?: Record<string, unknown>[] }).rows ?? []).find(
          (row) => Number(row["is_active"]) === 1,
        );
        if (!active) return;
        const label = active["label_fr"];
        const loaded: Packaging = {
          id: Number(active["id"]),
          productId: Number(active["product_id"] ?? product.id),
          labelFr: typeof label === "string" ? label : "",
          factor: Number(active["factor"] ?? 0),
          sellingPriceMinor: Number(active["selling_price_minor"] ?? 0),
          purchasePriceMinor: Number(active["purchase_price_minor"] ?? 0),
          autoCartonPricing: Number(active["auto_carton_pricing"]) === 1,
          isActive: true,
        };
        setPackaging({
          id: loaded.id,
          enabled: true,
          label: loaded.labelFr,
          factor: String(loaded.factor),
          selling: minorToInput(loaded.sellingPriceMinor),
          purchase: minorToInput(loaded.purchasePriceMinor),
          auto: loaded.autoCartonPricing,
        });
      })
      .catch(() => undefined);
  }, []);

  // Défauts des réglages (création uniquement, champs intacts).
  useEffect(() => {
    if (product != null) return;
    api
      .settingsGet({ key: "products" })
      .then((v) => {
        const unitDefault = (v as { value: { defaultUnit: string } }).value.defaultUnit;
        if (unitDefault) setUnit((prev) => (prev === "PIECE" ? unitDefault : prev));
      })
      .catch(() => undefined);
    api
      .settingsGet({ key: "inventory" })
      .then((v) => {
        const min = (v as { value: { defaultMinStock: number } }).value.defaultMinStock;
        if (min > 0) {
          setMinStock((prev) => (prev === "" ? String(min) : prev));
        }
      })
      .catch(() => undefined);
  }, []);

  // Aperçu de marge : uniquement quand les DEUX prix sont saisis (sinon un
  // prix vide = 0 ferait clignoter une fausse « vente à perte »).
  const purchasePreview = parseMoney(purchase);
  const sellingPreview = parseMoney(selling);
  let marginPreview: ReturnType<typeof evaluateMargin> | null = null;
  if (
    purchase.trim() !== "" &&
    selling.trim() !== "" &&
    purchasePreview != null &&
    sellingPreview != null
  ) {
    try {
      marginPreview = evaluateMargin(purchasePreview, sellingPreview);
    } catch {
      marginPreview = null;
    }
  }
  const marginText =
    marginPreview == null
      ? "—"
      : marginPreview.marginPct == null
        ? formatDzdSigned(marginPreview.marginMinor)
        : `${formatDzdSigned(marginPreview.marginMinor)} · ${MARGIN_PCT_FR.format(marginPreview.marginPct)} %`;

  const supplierNeedle = supplierQuery.trim().toLocaleLowerCase("fr-FR");
  const visibleSuppliers =
    supplierNeedle === ""
      ? supplierOptions
      : supplierOptions.filter((s) => s.name.toLocaleLowerCase("fr-FR").includes(supplierNeedle));

  const advancedSummary =
    [
      supplierIds.length > 0
        ? `${supplierIds.length} fournisseur${supplierIds.length > 1 ? "s" : ""}`
        : null,
      maxStock.trim() !== "" ? "Stock max" : null,
      packaging.enabled ? "Conditionnement" : null,
      editing && !active ? "Inactif" : null,
    ]
      .filter((v): v is string => v != null)
      .join(" · ") || (editing ? "Fournisseurs, stock max, archivage" : "Fournisseurs, stock max");

  function addBarcode(): void {
    const value = barcodeInput.trim();
    if (value === "") return;
    setBarcodes((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setBarcodeInput("");
  }

  async function addCategory(): Promise<void> {
    const label = newCategory.trim();
    if (label.length < 2) {
      notify("Nom de catégorie trop court (2 lettres min.).", "err");
      return;
    }
    try {
      const res = (await api.categoryCreate({ name: label })) as { id: number };
      setNewCategory("");
      setCategoryCreateOpen(false);
      onCategoryCreated();
      setCategoryId(String(res.id));
      notify(`Catégorie « ${label} » créée.`, "ok");
    } catch (e) {
      notify(frError(e, "Création impossible."), "err");
    }
  }

  async function reloadSuppliers(selectId?: number): Promise<void> {
    try {
      const r = await api.supplierSearch({ query: "", page: 1, pageSize: 100 });
      setSupplierOptions(
        ((r as { rows?: { id: number; name: string }[] }).rows ?? []).map((s) => ({
          id: s.id,
          name: s.name,
        })) as { id: number; name: string }[],
      );
      if (selectId != null) {
        setSupplierIds((prev) => (prev.includes(selectId) ? prev : [...prev, selectId]));
      }
    } catch (e) {
      notify(frError(e, "Rechargement des fournisseurs impossible."), "err");
    }
  }

  async function save(): Promise<void> {
    if (busy) return;
    const cleanName = name.trim();
    if (cleanName.length < 2) {
      notify("Nom du produit requis (2 lettres min.).", "err");
      return;
    }
    const purchaseMinor = parseMoney(purchase);
    const sellingMinor = parseMoney(selling);
    if (purchaseMinor == null || sellingMinor == null) {
      notify("Prix invalides.", "err");
      return;
    }
    const quantity = parseQuantityInput(qty.trim() === "" ? "0" : qty, { allowZero: true });
    const minLevel = parseQuantityInput(minStock.trim() === "" ? "0" : minStock, {
      allowZero: true,
    });
    const maxLevel = parseQuantityInput(maxStock.trim() === "" ? "0" : maxStock, {
      allowZero: true,
    });
    if (quantity == null || minLevel == null || maxLevel == null) {
      notify("Stock / seuils invalides (0 – 1 000 000).", "err");
      return;
    }
    // Le code scanné mais non validé par Entrée ne doit pas être perdu au
    // clic sur « Créer » : il rejoint la liste au moment d'enregistrer.
    const pendingBarcode = barcodeInput.trim();
    const cleaned = [
      ...new Set([
        ...barcodes.map((b) => b.trim()).filter((b) => b !== ""),
        ...(pendingBarcode === "" ? [] : [pendingBarcode]),
      ]),
    ];
    if (cleaned.some((b) => b.length > 64)) {
      notify("Code-barres trop long (64 max).", "err");
      return;
    }
    if (cleaned.length > 20) {
      notify("20 codes-barres maximum.", "err");
      return;
    }
    // Conditionnement : validation AVANT toute écriture (messages FR).
    let packagingInput: {
      labelFr: string;
      factor: number;
      sellingPriceMinor: number;
      purchasePriceMinor: number;
      autoCartonPricing: boolean;
    } | null = null;
    if (packaging.enabled) {
      const label = packaging.label.trim();
      if (label.length < 2) {
        notify("Libellé du conditionnement requis (2 lettres min.).", "err");
        return;
      }
      const factor = Number(packaging.factor.trim());
      if (!Number.isInteger(factor) || factor <= 1) {
        notify("Taille du carton invalide (entier supérieur à 1).", "err");
        return;
      }
      const cartonSelling = parseMoney(packaging.selling);
      const cartonPurchase = parseMoney(
        packaging.purchase.trim() === "" ? "0" : packaging.purchase,
      );
      if (cartonSelling == null || cartonPurchase == null) {
        notify("Prix du carton invalides.", "err");
        return;
      }
      packagingInput = {
        labelFr: label,
        factor,
        sellingPriceMinor: cartonSelling,
        purchasePriceMinor: cartonPurchase,
        autoCartonPricing: packaging.auto,
      };
    }
    const payload = {
      name: cleanName,
      categoryId: categoryId === "" ? null : Number(categoryId),
      unitCode: normalizeUnitCode(unit),
      purchasePriceMinor: purchaseMinor,
      sellingPriceMinor: sellingMinor,
      quantity,
      minStockLevel: minLevel,
      maxStockLevel: maxLevel,
      expirationDate: expiration === "" ? null : expiration,
      supplierId: supplierIds[0] ?? null,
      barcodes: cleaned,
    };
    try {
      validateProductDraft(payload);
    } catch (e) {
      notify(frError(e, "Fiche invalide."), "err");
      return;
    }
    // P3 : fini la perte silencieuse — vente sous coût = confirmation explicite.
    try {
      const margin = evaluateMargin(payload.purchasePriceMinor, payload.sellingPriceMinor);
      if (margin.belowCost) {
        const ok = await confirmAsync(
          `Vente à perte : prix de vente (${formatDzd(payload.sellingPriceMinor)}) sous le coût d'achat (${formatDzd(payload.purchasePriceMinor)}). Confirmer explicitement ?`,
        );
        if (!ok) return;
      }
    } catch (e) {
      notify(frError(e, "Marge invalide."), "err");
      return;
    }
    setBusy(true);
    try {
      let savedProductId = product?.id ?? null;
      if (product == null) {
        const res = (await api.productCreate({ ...payload, operationId })) as { id: number };
        savedProductId = res.id;
        await api.productSetSuppliers({ productId: res.id, supplierIds });
      } else {
        // M-3 : pure update — pas d'operationId (contrat honnête, ignoré sinon).
        await api.productUpdate({ ...payload, id: product.id });
        await api.productSetSuppliers({ productId: product.id, supplierIds });
        // L'interrupteur Actif pilote l'archivage (update ne touche pas is_active).
        if (active && isArchived(product))
          await api.productRestore({ id: product.id, operationId: newOperationId() });
        if (!active && !isArchived(product))
          await api.productArchive({ id: product.id, operationId: newOperationId() });
      }
      if (savedProductId != null) {
        if (packagingInput != null) {
          await api.productPackagingSave({
            operationId: newOperationId(),
            productId: savedProductId,
            ...packagingInput,
          });
        } else if (packaging.id != null) {
          await api.productPackagingDelete({
            operationId: newOperationId(),
            productId: savedProductId,
          });
        }
      }
      setOperationId(newOperationId());
      notify(
        product == null ? `Produit « ${cleanName} » créé.` : `Produit « ${cleanName} » enregistré.`,
        "ok",
      );
      onSaved();
    } catch (e) {
      notify(frError(e, "Enregistrement impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal
        label={editing ? "Modifier le produit" : "Nouveau produit"}
        title={editing ? "Modifier le produit" : "Nouveau produit"}
        onClose={onClose}
        wide
      >
        <form
          className="space-y-3.5 [&_input]:scroll-mb-24 [&_select]:scroll-mb-24 [&_textarea]:scroll-mb-24"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              void save();
            }
          }}
        >
          <p className="text-[11px] leading-relaxed text-slate-500">
            Seul le <span className="font-semibold text-slate-300">nom</span> est obligatoire —
            prix, stock et options peuvent être complétés plus tard.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-3">
              <FormSection icon={<Package size={14} aria-hidden="true" />} title="Identification">
                <Field label="Nom du produit">
                  <TextInput
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex. : Lait Candia 1L"
                    aria-label="Nom du produit"
                  />
                </Field>
                <Field label="Codes-barres" hint="Entrée = ajouter · le 1er = principal">
                  <div className="space-y-2">
                    {barcodes.length > 0 ? (
                      <ul className="flex max-h-24 flex-wrap gap-1.5 overflow-auto">
                        {barcodes.map((b, i) => (
                          <li
                            key={`${b}-${i}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-black/30 py-1 pl-2 pr-1 font-mono text-[11px]"
                          >
                            <span className="max-w-[170px] truncate">{b}</span>
                            {i === 0 ? <span className="text-amber-300">principal</span> : null}
                            <button
                              type="button"
                              aria-label={`Retirer ${b}`}
                              onClick={() => setBarcodes((prev) => prev.filter((_, j) => j !== i))}
                              className="shrink-0 rounded p-0.5 text-slate-500 transition-colors hover:bg-red-500/15 hover:text-red-300"
                            >
                              <X size={12} aria-hidden="true" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="flex gap-2">
                      <TextInput
                        value={barcodeInput}
                        onChange={(e) => setBarcodeInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addBarcode();
                          }
                        }}
                        placeholder="Scannez ou saisissez…"
                        aria-label="Ajouter un code-barres"
                        className="min-w-0 flex-1 font-mono"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={addBarcode}
                        aria-label="Ajouter le code-barres"
                        title="Ajouter le code-barres (Entrée)"
                        className="px-3"
                      >
                        <Plus size={16} aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </Field>
                <Field label="Catégorie">
                  <div className="flex gap-2">
                    <Select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      aria-label="Catégorie"
                      className="min-w-0 flex-1"
                    >
                      <option value="">Sans catégorie</option>
                      {categories.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setCategoryCreateOpen((o) => !o)}
                      aria-expanded={categoryCreateOpen}
                      aria-label="Créer une catégorie"
                      title="Créer une catégorie"
                      className="px-3"
                    >
                      <Plus size={16} aria-hidden="true" />
                    </Button>
                  </div>
                </Field>
                {categoryCreateOpen ? (
                  <div className="flex gap-2">
                    <TextInput
                      autoFocus
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void addCategory();
                        }
                      }}
                      placeholder="Nom de la nouvelle catégorie"
                      aria-label="Nouvelle catégorie"
                      className="min-w-0 flex-1"
                    />
                    <Button type="button" variant="secondary" onClick={() => void addCategory()}>
                      Créer
                    </Button>
                  </div>
                ) : null}
                <Field label="Unité">
                  <Select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unité">
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>
                        {unitLabel(u)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FormSection>

              <FormSection icon={<Layers size={14} aria-hidden="true" />} title="Conditionnement">
                <label className="flex cursor-pointer items-center justify-between gap-3 text-xs font-semibold">
                  <span>
                    Activer le conditionnement
                    <span className="block text-[11px] font-normal text-slate-500">
                      Stock et FIFO restent en pièces.
                    </span>
                  </span>
                  <Switch
                    checked={packaging.enabled}
                    onChange={() => setPackaging((p) => ({ ...p, enabled: !p.enabled }))}
                    ariaLabel="Activer le conditionnement"
                  />
                </label>
                {packaging.enabled ? (
                  <>
                    <div className="grid grid-cols-2 gap-2.5">
                      <Field label="Libellé">
                        <TextInput
                          value={packaging.label}
                          onChange={(e) => setPackaging((p) => ({ ...p, label: e.target.value }))}
                          placeholder="Carton de 12"
                          aria-label="Libellé du conditionnement"
                        />
                      </Field>
                      <Field label="Pièces par carton" hint="Entier > 1.">
                        <TextInput
                          value={packaging.factor}
                          onChange={(e) => setPackaging((p) => ({ ...p, factor: e.target.value }))}
                          inputMode="numeric"
                          placeholder="12"
                          aria-label="Taille du carton"
                          className="font-mono tabular-nums"
                        />
                      </Field>
                      <Field label="Prix carton (DZD)">
                        <TextInput
                          value={packaging.selling}
                          onChange={(e) => setPackaging((p) => ({ ...p, selling: e.target.value }))}
                          inputMode="decimal"
                          placeholder="0,00"
                          aria-label="Prix du carton"
                          className="font-mono tabular-nums"
                        />
                      </Field>
                      <Field label="Achat carton (DZD)">
                        <TextInput
                          value={packaging.purchase}
                          onChange={(e) =>
                            setPackaging((p) => ({ ...p, purchase: e.target.value }))
                          }
                          inputMode="decimal"
                          placeholder="0,00"
                          aria-label="Prix d'achat du carton"
                          className="font-mono tabular-nums"
                        />
                      </Field>
                    </div>
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-xs font-semibold">
                      <span>
                        Tarif carton automatique
                        <span className="block text-[11px] font-normal text-slate-500">
                          Dès que la quantité atteint la taille du carton.
                        </span>
                      </span>
                      <Switch
                        checked={packaging.auto}
                        onChange={() => setPackaging((p) => ({ ...p, auto: !p.auto }))}
                        ariaLabel="Tarif carton automatique"
                      />
                    </label>
                  </>
                ) : null}
              </FormSection>
            </div>

            <div className="space-y-3">
              <FormSection icon={<Banknote size={14} aria-hidden="true" />} title="Prix" hint="DZD">
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="Prix d'achat">
                    <TextInput
                      value={purchase}
                      onChange={(e) => setPurchase(e.target.value)}
                      inputMode="decimal"
                      placeholder="0,00"
                      aria-label="Prix d'achat"
                      className="font-mono tabular-nums"
                    />
                  </Field>
                  <Field label="Prix de vente">
                    <TextInput
                      value={selling}
                      onChange={(e) => setSelling(e.target.value)}
                      inputMode="decimal"
                      placeholder="0,00"
                      aria-label="Prix de vente"
                      className="font-mono tabular-nums"
                    />
                  </Field>
                </div>
                <div
                  aria-live="polite"
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg border px-3 py-2",
                    marginPreview?.belowCost
                      ? "border-red-400/30 bg-red-500/[0.08]"
                      : "border-white/10 bg-black/20",
                  )}
                >
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    Marge
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1 font-mono text-xs font-bold",
                      marginPreview == null
                        ? "text-slate-500"
                        : marginPreview.belowCost
                          ? "text-red-300"
                          : "text-emerald-300",
                    )}
                  >
                    {marginPreview?.belowCost ? (
                      <TriangleAlert size={13} aria-hidden="true" />
                    ) : null}
                    {marginText}
                    {marginPreview?.belowCost ? " · vente à perte" : ""}
                  </span>
                </div>
              </FormSection>

              <FormSection icon={<Boxes size={14} aria-hidden="true" />} title="Stock & seuils">
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label={editing ? "Stock actuel" : "Stock initial"}>
                    <TextInput
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      inputMode="decimal"
                      placeholder="0"
                      aria-label="Stock"
                      className="font-mono tabular-nums"
                    />
                  </Field>
                  <Field label="Seuil minimum" hint="Alerte stock bas.">
                    <TextInput
                      value={minStock}
                      onChange={(e) => setMinStock(e.target.value)}
                      inputMode="decimal"
                      placeholder="0"
                      aria-label="Seuil minimum"
                      className="font-mono tabular-nums"
                    />
                  </Field>
                </div>
                <Field label="Péremption" hint="Vide = sans date.">
                  <TextInput
                    type="date"
                    value={expiration}
                    onChange={(e) => setExpiration(e.target.value)}
                    aria-label="Date de péremption"
                  />
                </Field>
              </FormSection>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-black/20">
            <button
              type="button"
              aria-expanded={advancedOpen}
              aria-controls="product-advanced-options"
              onClick={() => setAdvancedOpen((o) => !o)}
              className="flex min-h-[48px] w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
            >
              <span
                aria-hidden="true"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-slate-400"
              >
                <Settings2 size={14} />
              </span>
              <span className="text-sm font-bold text-slate-200">Options avancées</span>
              <span className="ml-auto hidden truncate text-[11px] text-slate-500 sm:block">
                {advancedSummary}
              </span>
              <ChevronDown
                size={16}
                aria-hidden="true"
                className={cn(
                  "shrink-0 text-slate-400 transition-transform",
                  advancedOpen && "rotate-180",
                )}
              />
            </button>
            {advancedOpen ? (
              <div
                id="product-advanced-options"
                className="space-y-3 border-t border-white/[0.08] p-3.5"
              >
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                      <Truck size={13} aria-hidden="true" /> Fournisseurs liés
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setSupplierQuickOpen(true)}
                      title="Créer un fournisseur sans quitter la fiche produit"
                      className="px-2.5 py-1.5 text-xs"
                    >
                      <Plus size={14} aria-hidden="true" /> Nouveau fournisseur
                    </Button>
                  </div>
                  {supplierOptions.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Aucun fournisseur — créez-en un sans quitter la fiche.
                    </p>
                  ) : (
                    <>
                      {supplierOptions.length > 6 ? (
                        <TextInput
                          value={supplierQuery}
                          onChange={(e) => setSupplierQuery(e.target.value)}
                          placeholder="Rechercher un fournisseur…"
                          aria-label="Rechercher un fournisseur"
                          className="mb-2"
                        />
                      ) : null}
                      <ul className="max-h-40 space-y-0.5 overflow-auto rounded-lg border border-white/10 bg-black/15 p-1.5">
                        {visibleSuppliers.map((s) => (
                          <li key={s.id}>
                            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-white/[0.06]">
                              <input
                                type="checkbox"
                                checked={supplierIds.includes(s.id)}
                                onChange={() =>
                                  setSupplierIds((prev) =>
                                    prev.includes(s.id)
                                      ? prev.filter((x) => x !== s.id)
                                      : [...prev, s.id],
                                  )
                                }
                                aria-label={`Lier ${s.name}`}
                                className="h-4 w-4 accent-amber-400"
                              />
                              <span className="min-w-0 flex-1 truncate">{s.name}</span>
                              {supplierIds[0] === s.id ? (
                                <span className="text-[11px] font-bold text-amber-300">
                                  principal
                                </span>
                              ) : null}
                            </label>
                          </li>
                        ))}
                        {visibleSuppliers.length === 0 ? (
                          <li className="px-2 py-2 text-xs text-slate-500">
                            Aucun fournisseur ne correspond.
                          </li>
                        ) : null}
                      </ul>
                    </>
                  )}
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Le 1er coché devient le fournisseur principal.
                  </p>
                </div>
                <Field label="Stock maximum" hint="Vide = aucun plafond.">
                  <TextInput
                    value={maxStock}
                    onChange={(e) => setMaxStock(e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                    aria-label="Stock maximum"
                    className="font-mono tabular-nums"
                  />
                </Field>
                {editing ? (
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-xs font-semibold">
                    <span>
                      Produit actif
                      <span className="block text-[11px] font-normal text-slate-500">
                        Inactif = archivé (restaurable).
                      </span>
                    </span>
                    <Switch
                      checked={active}
                      onChange={() => setActive((a) => !a)}
                      ariaLabel="Produit actif"
                    />
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="sticky bottom-0 z-10 -mx-6 mt-1 flex flex-col-reverse gap-3 border-t border-white/10 bg-[#122131]/95 px-6 py-3.5 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-1 text-[11px] text-slate-500">
              <Kbd>Ctrl</Kbd>
              <span>+</span>
              <Kbd>Entrée</Kbd>
              <span className="ml-1">pour enregistrer</span>
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                className="flex-1 sm:flex-none sm:min-w-[108px]"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={busy}
                className="flex-[2] sm:flex-none sm:min-w-[170px]"
              >
                {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Créer le produit"}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
      {supplierQuickOpen ? (
        <SupplierQuickCreateDialog
          onClose={() => setSupplierQuickOpen(false)}
          onCreated={(s) => {
            setSupplierQuickOpen(false);
            notify(`Fournisseur « ${s.name} » créé et sélectionné.`, "ok");
            void reloadSuppliers(s.id);
          }}
          notify={notify}
        />
      ) : null}
    </>
  );
}
