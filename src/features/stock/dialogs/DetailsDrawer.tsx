// Veloria PoS — Stock : réception + détail + ajustement + historique + inventaire.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).

import { History, Wrench } from "lucide-react";

import { formatDzd } from "@domain/money/money.ts";

import { formatDateTimeFr, movementTypeFr } from "@shared/formatters/format.ts";
import { Badge, Button, Card, Drawer, InfoRow, cn } from "@shared/ui/primitives.tsx";

import {
  maxStockLabel,
  stockStatusLabel,
  stockStatusTone,
  type StockMovement,
  type StockRow,
} from "../types.ts";

// ---------------------------------------------------------------------------
// Tiroir de détail produit (stock).
// ---------------------------------------------------------------------------

export function StockDetailsDrawer({
  row,
  last,
  onClose,
  onAdjust,
  onHistory,
}: {
  row: StockRow;
  last: StockMovement | null;
  onClose: () => void;
  onAdjust: (r: StockRow) => void;
  onHistory: (r: StockRow) => void;
}): React.JSX.Element {
  return (
    <Drawer
      label={`Détail stock ${row.name}`}
      title={row.name}
      sub={row.primary_barcode || `#${row.id}`}
      onClose={onClose}
    >
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={stockStatusTone(row.stock_status)}>{stockStatusLabel(row.stock_status)}</Badge>
        {row.category_name ? <Badge tone="grey">{row.category_name}</Badge> : null}
      </div>

      <Card className="space-y-2.5 p-4 text-sm">
        <InfoRow label="Stock actuel" value={`${row.quantity} ${row.unit_code}`} num strong />
        <InfoRow
          label="Valeur du stock"
          value={formatDzd(Math.round(row.stock_value_minor))}
          num
          strong
        />
        <InfoRow label="Prix d'achat" value={formatDzd(row.purchase_price_minor)} num />
        <InfoRow label="Seuil minimum" value={String(row.min_stock_level)} num />
        <InfoRow label="Stock maximum" value={maxStockLabel(row.max_stock_level)} num />
        <InfoRow label="Statut" value={stockStatusLabel(row.stock_status)} />
      </Card>

      <Card className="space-y-2.5 p-4 text-sm">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Dernier mouvement
        </div>
        {last ? (
          <p className="text-slate-200">
            <strong>{movementTypeFr(last.movement_type)}</strong>{" "}
            <span
              className={cn(
                "font-bold tabular-nums",
                last.quantity_delta >= 0 ? "text-emerald-300" : "text-red-300",
              )}
            >
              {last.quantity_delta >= 0 ? "+" : ""}
              {last.quantity_delta}
            </span>{" "}
            → <span className="tabular-nums">{last.quantity_after}</span>
            <span className="block text-xs text-slate-500">
              {formatDateTimeFr(last.created_at)}
            </span>
          </p>
        ) : (
          <p className="text-slate-500">Aucun mouvement enregistré.</p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => onHistory(row)}>
          <History size={15} aria-hidden="true" /> Historique
        </Button>
        <Button onClick={() => onAdjust(row)}>
          <Wrench size={15} aria-hidden="true" /> Ajuster
        </Button>
      </div>
    </Drawer>
  );
}
