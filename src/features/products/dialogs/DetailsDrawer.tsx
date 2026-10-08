// Veloria PoS — Catalogue : tiroir détail + formulaire + ajustement de stock.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useEffect, useState } from "react";
import { parseQty } from "./common.ts";
import { Pencil, RotateCcw, Scale, Trash2 } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { formatDzd } from "@domain/money/money.ts";
import { formatDzdSigned } from "@shared/formatters/format.ts";
import { newOperationId } from "@domain/common/ids.ts";

import {
  Badge,
  Button,
  Card,
  Drawer,
  Field,
  InfoRow,
  Modal,
  TextInput,
} from "@shared/ui/primitives.tsx";
import { isArchived, stockLabel, stockTone, unitLabel, type Product } from "../types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

// ---------------------------------------------------------------------------
// Tiroir de détail produit (panneau latéral droit).
// ---------------------------------------------------------------------------

export function ProductDetailsDrawer({
  product,
  onClose,
  onEdit,
  onChanged,
  notify,
}: {
  product: Product;
  onClose: () => void;
  onEdit: (p: Product) => void;
  onChanged: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [allBarcodes, setAllBarcodes] = useState<string[] | null>(null);
  const [linkedSuppliers, setLinkedSuppliers] = useState<{ id: number; name: string }[] | null>(
    null,
  );
  const archived = isArchived(product);
  const confirmAsync = useConfirm();
  // Vente à perte autorisée (confirmée en création) : la marge peut être
  // négative or formatDzd lèverait — affichage signé explicite.
  const marginMinor = product.selling_price_minor - product.purchase_price_minor;
  const marginLabel = formatDzdSigned(marginMinor);

  useEffect(() => {
    let alive = true;
    api
      .productBarcodes({ id: product.id })
      .then((r) => {
        if (!alive) return;
        setAllBarcodes(((r as { rows?: { barcode: string }[] }).rows ?? []).map((b) => b.barcode));
      })
      .catch(() => {
        if (alive) setAllBarcodes([]);
      });
    api
      .productSuppliers({ id: product.id })
      .then((r) => {
        if (!alive) return;
        setLinkedSuppliers((r as { rows?: { id: number; name: string }[] }).rows ?? []);
      })
      .catch(() => {
        if (alive) setLinkedSuppliers([]);
      });
    return () => {
      alive = false;
    };
  }, [product.id]);

  async function remove(): Promise<void> {
    if (
      !(await confirmAsync(
        `Archiver « ${product.name} » ? Il restera consultable puis restaurable.`,
      ))
    ) {
      return;
    }
    setBusy(true);
    try {
      await api.productArchive({ id: product.id, operationId: newOperationId() });
      notify("Produit archivé.", "ok");
      onChanged();
      onClose();
    } catch (e) {
      notify(frError(e, "Archivage impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function destroy(): Promise<void> {
    // Garde-fous côté écran (le main revérifie tout) : produit archivé,
    // double confirmation explicite, opération irréversible.
    if (
      !(await confirmAsync(
        `SUPPRESSION DÉFINITIVE de « ${product.name} » ? Cette action est irréversible.`,
      ))
    ) {
      return;
    }
    if (
      !(await confirmAsync(
        `Dernière confirmation : effacer « ${product.name} » de la base (uniquement possible s'il n'apparaît dans aucun historique) ?`,
      ))
    ) {
      return;
    }
    setBusy(true);
    try {
      await api.productDelete({ id: product.id, operationId: newOperationId() });
      notify(`Produit « ${product.name} » supprimé définitivement.`, "ok");
      onChanged();
      onClose();
    } catch (e) {
      notify(frError(e, "Suppression impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function restore(): Promise<void> {
    setBusy(true);
    try {
      await api.productRestore({ id: product.id, operationId: newOperationId() });
      notify("Produit restauré.", "ok");
      onChanged();
      onClose();
    } catch (e) {
      notify(frError(e, "Restauration impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Drawer
        label={`Détail ${product.name}`}
        title={product.name}
        sub={`Produit #${product.id}`}
        below={
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={stockTone(product)}>{stockLabel(product)}</Badge>
            <Badge tone="grey">{unitLabel(product.unit_code)}</Badge>
          </div>
        }
        footer={
          <>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                disabled={busy || archived}
                onClick={() => onEdit(product)}
                title="Modifier le produit"
              >
                <Pencil size={15} aria-hidden="true" /> Modifier
              </Button>
              <Button
                variant="secondary"
                disabled={busy || archived}
                onClick={() => setAdjustOpen(true)}
                title="Ajuster le stock (avec motif)"
              >
                <Scale size={15} aria-hidden="true" /> Ajuster
              </Button>
            </div>
            {archived ? (
              <>
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => void restore()}
                  className="w-full"
                >
                  <RotateCcw size={15} aria-hidden="true" /> Restaurer le produit
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void destroy()}
                  title="Effacer définitivement de la base (irréversible, uniquement si jamais utilisé)"
                  className="w-full !text-red-300 hover:!bg-red-500/15"
                >
                  <Trash2 size={15} aria-hidden="true" /> Supprimer définitivement
                </Button>
              </>
            ) : (
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => void remove()}
                className="w-full"
              >
                <Trash2 size={15} aria-hidden="true" /> Supprimer (archiver)
              </Button>
            )}
          </>
        }
        onClose={onClose}
      >
        <Card className="space-y-2.5 p-4 text-sm">
          <InfoRow
            label="Codes-barres"
            value={
              allBarcodes == null ? "…" : allBarcodes.length > 0 ? allBarcodes.join(" · ") : "—"
            }
            mono
          />
          <InfoRow label="Catégorie" value={product.category_name ?? "Sans catégorie"} />
          <InfoRow
            label="Fournisseurs"
            value={
              linkedSuppliers == null
                ? "…"
                : linkedSuppliers.length > 0
                  ? linkedSuppliers.map((s) => s.name).join(" · ")
                  : "—"
            }
          />
          <InfoRow label="Prix d'achat" value={formatDzd(product.purchase_price_minor)} num />
          <InfoRow label="Prix de vente" value={formatDzd(product.selling_price_minor)} num />
          <InfoRow label="Marge unitaire" value={marginLabel} num />
        </Card>
        <Card className="space-y-2.5 p-4 text-sm">
          <InfoRow label="Stock actuel" value={String(product.quantity)} num strong />
          <InfoRow label="Seuil minimum" value={String(product.min_stock_level)} num />
        </Card>
      </Drawer>
      {adjustOpen ? (
        <AdjustStockModal
          product={product}
          onClose={() => setAdjustOpen(false)}
          onSaved={() => {
            setAdjustOpen(false);
            onChanged();
            onClose();
          }}
          notify={notify}
        />
      ) : null}
    </>
  );
}
// ---------------------------------------------------------------------------
// Ajustement de stock (quantité + motif, mouvement tracé côté main).
// ---------------------------------------------------------------------------

function AdjustStockModal({
  product,
  onClose,
  onSaved,
  notify,
}: {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [qty, setQty] = useState(String(product.quantity));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(): Promise<void> {
    const newQuantity = parseQty(qty.trim() === "" ? "0" : qty);
    if (newQuantity == null) {
      notify("Quantité invalide (0 – 1 000 000).", "err");
      return;
    }
    if (reason.trim().length < 2) {
      notify("Motif requis (2 lettres min.).", "err");
      return;
    }
    setBusy(true);
    try {
      await api.stockAdjust({
        operationId: newOperationId(),
        productId: product.id,
        newQuantity,
        reason: reason.trim(),
      });
      notify("Stock ajusté.", "ok");
      onSaved();
    } catch (e) {
      notify(frError(e, "Ajustement impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label="Ajuster le stock" title={`Ajuster — ${product.name}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p className="text-sm text-slate-400">
          Stock actuel : <strong className="tabular-nums text-slate-100">{product.quantity}</strong>
          {" · "}Mouvement tracé avec motif.
        </p>
        <Field label="Nouvelle quantité">
          <TextInput
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
            aria-label="Nouvelle quantité"
          />
        </Field>
        <Field label="Motif" hint="Ex. : inventaire, casse, erreur de saisie.">
          <TextInput
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motif de l'ajustement…"
            aria-label="Motif"
          />
        </Field>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button type="submit" disabled={busy} className="flex-[2]">
            {busy ? "Enregistrement…" : "Ajuster"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
