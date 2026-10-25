// Veloria PoS — Catalogue : tiroir détail + formulaire + ajustement de stock.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useEffect, useState } from "react";

import { api } from "@shared/types/ipc-client.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { formatDzd, minorToInput } from "@domain/money/money.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { normalizeUnitCode, validateProductDraft } from "@domain/product/product-rules.ts";
import { evaluateMargin } from "@domain/pricing/price-rules.ts";
import type { Packaging } from "@domain/packaging/types.ts";

import { Button, Field, Modal, Select, Switch, TextInput } from "@shared/ui/primitives.tsx";
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

  async function addCategory(): Promise<void> {
    const label = newCategory.trim();
    if (label.length < 2) {
      notify("Nom de catégorie trop court (2 lettres min.).", "err");
      return;
    }
    try {
      const res = (await api.categoryCreate({ name: label })) as { id: number };
      setNewCategory("");
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
    const cleaned = [...new Set(barcodes.map((b) => b.trim()).filter((b) => b !== ""))];
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
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label="Nom du produit">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. : Lait Candia 1L"
              aria-label="Nom du produit"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Codes-barres"
              hint="Plusieurs possibles (le 1er = principal). Entrée = ajouter."
            >
              <div className="space-y-2">
                {barcodes.length > 0 ? (
                  <ul className="space-y-1">
                    {barcodes.map((b, i) => (
                      <li
                        key={`${b}-${i}`}
                        className="flex items-center justify-between gap-2 rounded-lg bg-black/25 px-3 py-1.5 font-mono text-xs"
                      >
                        <span className="min-w-0 truncate">
                          {b} {i === 0 ? <span className="text-amber-300">(principal)</span> : null}
                        </span>
                        <button
                          type="button"
                          aria-label={`Retirer ${b}`}
                          onClick={() => setBarcodes((prev) => prev.filter((_, j) => j !== i))}
                          className="shrink-0 rounded-lg px-2 py-0.5 text-slate-500 transition-colors hover:bg-red-500/15 hover:text-red-300"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <TextInput
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const v = barcodeInput.trim();
                      if (v !== "" && !barcodes.includes(v)) setBarcodes((prev) => [...prev, v]);
                      setBarcodeInput("");
                    }
                  }}
                  placeholder="Scannez ou saisissez… (Entrée)"
                  aria-label="Ajouter un code-barres"
                  className="font-mono"
                />
              </div>
            </Field>
            <Field label="Unité">
              <Select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unité">
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {unitLabel(u)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Péremption" hint="Vide = sans date.">
              <TextInput
                type="date"
                value={expiration}
                onChange={(e) => setExpiration(e.target.value)}
                aria-label="Date de péremption"
              />
            </Field>
          </div>
          <Field label="Fournisseurs liés" hint="Le 1er coché = principal.">
            <div className="mb-2 flex justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSupplierQuickOpen(true)}
                title="Créer un fournisseur sans quitter la fiche produit"
              >
                + Nouveau fournisseur
              </Button>
            </div>
            {supplierOptions.length === 0 ? (
              <p className="text-xs text-slate-500">Aucun fournisseur (créez-en un d'abord).</p>
            ) : (
              <ul className="max-h-32 space-y-1 overflow-auto rounded-xl border border-white/10 p-2">
                {supplierOptions.map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-white/[0.06]">
                      <input
                        type="checkbox"
                        checked={supplierIds.includes(s.id)}
                        onChange={() =>
                          setSupplierIds((prev) =>
                            prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                          )
                        }
                        aria-label={`Lier ${s.name}`}
                        className="h-4 w-4 accent-amber-400"
                      />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      {supplierIds[0] === s.id ? (
                        <span className="text-[11px] font-bold text-amber-300">(principal)</span>
                      ) : null}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </Field>
          <Field label="Catégorie">
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label="Catégorie"
            >
              <option value="">Sans catégorie</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex gap-2">
            <div className="flex-1">
              <TextInput
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Nouvelle catégorie…"
                aria-label="Nouvelle catégorie"
              />
            </div>
            <Button type="button" variant="secondary" onClick={() => void addCategory()}>
              + Catégorie
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prix d'achat (DZD)">
              <TextInput
                value={purchase}
                onChange={(e) => setPurchase(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                aria-label="Prix d'achat"
              />
            </Field>
            <Field label="Prix de vente (DZD)">
              <TextInput
                value={selling}
                onChange={(e) => setSelling(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                aria-label="Prix de vente"
              />
            </Field>
            <Field label={editing ? "Stock actuel" : "Stock initial"}>
              <TextInput
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                aria-label="Stock"
              />
            </Field>
            <Field label="Seuil minimum" hint="Alerte stock bas en dessous.">
              <TextInput
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                aria-label="Seuil minimum"
              />
            </Field>
            <Field label="Stock maximum" hint="Vide = aucun plafond.">
              <TextInput
                value={maxStock}
                onChange={(e) => setMaxStock(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                aria-label="Stock maximum"
              />
            </Field>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold">
              <span>
                Conditionnement
                <span className="block text-xs font-normal text-slate-500">
                  Vente à la pièce avec tarif carton automatique. Stock et FIFO restent en pièces.
                </span>
              </span>
              <Switch
                checked={packaging.enabled}
                onChange={() => setPackaging((p) => ({ ...p, enabled: !p.enabled }))}
                ariaLabel="Activer le conditionnement"
              />
            </label>
            {packaging.enabled ? (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Libellé">
                    <TextInput
                      value={packaging.label}
                      onChange={(e) => setPackaging((p) => ({ ...p, label: e.target.value }))}
                      placeholder="Carton de 12"
                      aria-label="Libellé du conditionnement"
                    />
                  </Field>
                  <Field label="Taille du carton" hint="Nombre de pièces (entier > 1).">
                    <TextInput
                      value={packaging.factor}
                      onChange={(e) => setPackaging((p) => ({ ...p, factor: e.target.value }))}
                      inputMode="numeric"
                      placeholder="12"
                      aria-label="Taille du carton"
                    />
                  </Field>
                  <Field label="Prix du carton (DZD)">
                    <TextInput
                      value={packaging.selling}
                      onChange={(e) => setPackaging((p) => ({ ...p, selling: e.target.value }))}
                      inputMode="decimal"
                      placeholder="0,00"
                      aria-label="Prix du carton"
                    />
                  </Field>
                  <Field label="Prix d'achat du carton (DZD)">
                    <TextInput
                      value={packaging.purchase}
                      onChange={(e) => setPackaging((p) => ({ ...p, purchase: e.target.value }))}
                      inputMode="decimal"
                      placeholder="0,00"
                      aria-label="Prix d'achat du carton"
                    />
                  </Field>
                </div>
                <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold">
                  <span>
                    Appliquer automatiquement le tarif carton
                    <span className="block text-xs font-normal text-slate-500">
                      Dès que la quantité atteint la taille du carton (prix manuel = règle
                      désactivée).
                    </span>
                  </span>
                  <Switch
                    checked={packaging.auto}
                    onChange={() => setPackaging((p) => ({ ...p, auto: !p.auto }))}
                    ariaLabel="Tarif carton automatique"
                  />
                </label>
              </div>
            ) : null}
          </div>
          {editing ? (
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold">
              <span>
                Produit actif
                <span className="block text-xs font-normal text-slate-500">
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
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Annuler
            </Button>
            <Button type="submit" disabled={busy} className="flex-[2]">
              {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Créer le produit"}
            </Button>
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
