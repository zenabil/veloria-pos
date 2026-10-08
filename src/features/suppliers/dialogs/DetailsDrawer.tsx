// Veloria PoS — Fournisseurs : tiroir détail + formulaire + paiement + historique.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useState } from "react";
import { HandCoins, History, Pencil, Trash2 } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";

import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { formatDzd } from "@domain/money/money.ts";
import { newOperationId } from "@domain/common/ids.ts";

import { Badge, Button, Card, Drawer, InfoRow, cn } from "@shared/ui/primitives.tsx";
import type { SupplierStatement } from "../SuppliersScreen.tsx";
import {
  hasSupplierDebt,
  isSupplierActive,
  supplierCode,
  supplierStatusLabel,
  supplierStatusTone,
  type Supplier,
} from "../types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { SupplierProductsBlock } from "./ProductsBlock.tsx";
import { totalPurchases } from "./common.ts";

// ---------------------------------------------------------------------------
// Tiroir de détail fournisseur.
// ---------------------------------------------------------------------------

export function SupplierDetailsDrawer({
  statement,
  onClose,
  onEdit,
  onPay,
  onHistory,
  onChanged,
  notify,
}: {
  statement: SupplierStatement;
  onClose: () => void;
  onEdit: (s: Supplier) => void;
  onPay: (s: Supplier) => void;
  onHistory: (st: SupplierStatement, tab: "purchases" | "payments") => void;
  onChanged: () => void;
  notify: Notify;
}): React.JSX.Element {
  const s = statement.supplier;
  const [busy, setBusy] = useState(false);
  const confirmAsync = useConfirm();

  async function remove(): Promise<void> {
    if (
      !(await confirmAsync(
        `Supprimer « ${s.name} » ? Possible uniquement si le solde est soldé et sans historique lié.`,
      ))
    )
      return;
    setBusy(true);
    try {
      // M-2: caller-owned operation (one confirmed action = one operation).
      await api.supplierDelete({ id: s.id, operationId: newOperationId() });
      notify("Fournisseur supprimé.", "ok");
      onChanged();
      onClose();
    } catch (e) {
      notify(frError(e, "Suppression impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer label={`Détail ${s.name}`} title={s.name} sub={supplierCode(s)} onClose={onClose}>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={supplierStatusTone(s)}>{supplierStatusLabel(s)}</Badge>
        {!isSupplierActive(s) ? <Badge tone="grey">Désactivé</Badge> : null}
        {s.phone ? <Badge tone="grey">{s.phone}</Badge> : null}
      </div>

      <Card
        className={cn(
          "p-4 text-center",
          hasSupplierDebt(s) ? "border-red-400/25" : "border-emerald-400/20",
        )}
      >
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Dette actuelle
        </div>
        <div
          className={cn(
            "mt-1 text-3xl font-extrabold tabular-nums tracking-tight",
            hasSupplierDebt(s) ? "text-red-300" : "text-emerald-300",
          )}
        >
          {formatDzd(s.outstanding_balance_minor)}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          Achats : {formatDzd(totalPurchases(statement))} · {statement.intakes.length} entrée(s)
        </div>
      </Card>

      <Card className="space-y-2.5 p-4 text-sm">
        <InfoRow label="Code" value={supplierCode(s)} strong />
        <InfoRow label="Contact" value={s.contact_person || "—"} />
        <InfoRow label="Téléphone" value={s.phone || "—"} />
        <InfoRow label="E-mail" value={s.email || "—"} />
        <InfoRow label="Adresse" value={s.address || "—"} />
        <InfoRow label="NIF" value={s.tax_number || "—"} />
        <InfoRow label="Registre commerce" value={s.commercial_register || "—"} />
        <InfoRow label="Statut" value={isSupplierActive(s) ? "Actif" : "Inactif"} />
        {s.notes ? <InfoRow label="Notes" value={s.notes} /> : null}
      </Card>

      <SupplierProductsBlock supplierId={s.id} notify={notify} />

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => onHistory(statement, "purchases")}>
          <History size={15} aria-hidden="true" /> Achats
        </Button>
        <Button variant="secondary" onClick={() => onHistory(statement, "payments")}>
          <History size={15} aria-hidden="true" /> Paiements
        </Button>
      </div>
      <Button onClick={() => onPay(s)} disabled={!hasSupplierDebt(s)}>
        <HandCoins size={15} aria-hidden="true" /> Enregistrer un paiement
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => onEdit(s)}>
          <Pencil size={15} aria-hidden="true" /> Modifier
        </Button>
        <Button variant="secondary" onClick={() => void remove()} disabled={busy}>
          <Trash2 size={15} aria-hidden="true" /> {busy ? "Suppression…" : "Supprimer"}
        </Button>
      </div>
    </Drawer>
  );
}
