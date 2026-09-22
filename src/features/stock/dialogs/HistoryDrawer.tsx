// Veloria PoS — Stock : réception + détail + ajustement + historique + inventaire.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useEffect, useState } from "react";

import { api } from "@shared/types/ipc-client.ts";

import { formatDateTimeFr, movementTypeFr } from "@shared/formatters/format.ts";
import { Badge, Drawer, EmptyState, Pager, Select, TextInput, cn } from "@shared/ui/primitives.tsx";

import { type StockMovement, type StockRow } from "../types.ts";

// ---------------------------------------------------------------------------
// Historique des mouvements d'un produit.
// ---------------------------------------------------------------------------

const HISTORY_PAGE_SIZE = 20;

export function StockMovementHistoryDrawer({
  product,
  onClose,
}: {
  product: StockRow;
  onClose: () => void;
}): React.JSX.Element {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<StockMovement[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  async function load(f: string, t: string, ty: string, p: number): Promise<void> {
    setLoading(true);
    try {
      const res = (await api.stockMovements({
        productId: product.id,
        from: f === "" ? null : f,
        to: t === "" ? null : t,
        types: ty === "all" ? [] : [ty],
        page: p,
        pageSize: HISTORY_PAGE_SIZE,
      })) as { rows: StockMovement[]; total: number };
      setRows(res.rows);
      setTotal(res.total);
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load("", "", "all", 1);
  }, []);

  function refilter(nf: string, nt: string, nty: string): void {
    setPage(1);
    void load(nf, nt, nty, 1);
  }

  return (
    <Drawer
      label={`Historique ${product.name}`}
      title={product.name}
      sub={`Stock : ${product.quantity} ${product.unit_code}`}
      onClose={onClose}
      wide
    >
      <div className="grid grid-cols-3 gap-2">
        <TextInput
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            refilter(e.target.value, to, type);
          }}
          aria-label="Du"
          title="Du"
        />
        <TextInput
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            refilter(from, e.target.value, type);
          }}
          aria-label="Au"
          title="Au"
        />
        <Select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            refilter(from, to, e.target.value);
          }}
          aria-label="Filtre type"
        >
          <option value="all">Tous types</option>
          <option value="sale_out">Ventes</option>
          <option value="sale_cancel_in">Annulations</option>
          <option value="intake_in">Entrées</option>
          <option value="adjust_in">Ajustements +</option>
          <option value="adjust_out">Ajustements −</option>
          <option value="return_in">Retours</option>
          <option value="damage_out">Casse</option>
        </Select>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {loading && rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500" role="status">
            Chargement…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState title="Aucun mouvement" hint="Modifiez les filtres." />
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#111a2e] text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5 text-right">Qté</th>
                <th className="px-3 py-2.5 text-right">Avant</th>
                <th className="px-3 py-2.5 text-right">Après</th>
                <th className="px-3 py-2.5">Motif</th>
                <th className="px-3 py-2.5">Réf.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-t border-white/[0.06]">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-400">
                    {formatDateTimeFr(m.created_at)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={m.quantity_delta >= 0 ? "green" : "red"}>
                      {movementTypeFr(m.movement_type)}
                    </Badge>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-bold tabular-nums",
                      m.quantity_delta >= 0 ? "text-emerald-300" : "text-red-300",
                    )}
                  >
                    {m.quantity_delta >= 0 ? "+" : ""}
                    {m.quantity_delta}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                    {m.quantity_before}
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">
                    {m.quantity_after}
                  </td>
                  <td
                    className="max-w-[160px] truncate px-3 py-2 text-slate-300"
                    title={m.reason ?? ""}
                  >
                    {m.reason || "—"}
                  </td>
                  <td
                    className="max-w-[100px] truncate px-3 py-2 font-mono text-xs text-slate-400"
                    title={m.reference ?? ""}
                  >
                    {m.reference || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pager
        page={page}
        pageSize={HISTORY_PAGE_SIZE}
        total={total}
        onPage={(p) => {
          setPage(p);
          void load(from, to, type, p);
        }}
      />
    </Drawer>
  );
}
