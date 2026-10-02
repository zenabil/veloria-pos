// Veloria PoS — Stock : réception + détail + ajustement + historique + inventaire.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useEffect, useState } from "react";

import { api } from "@shared/types/ipc-client.ts";
import { formatDzd } from "@domain/money/money.ts";

import { Drawer, EmptyState, Pager } from "@shared/ui/primitives.tsx";

interface IntakeRow {
  id: number;
  invoice_number: string | null;
  invoice_date: string | null;
  supplier_name: string | null;
  subtotal_minor: number;
  shipping_cost_minor: number;
  total_minor: number;
  created_at: string;
}

export function StockIntakesDrawer({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [rows, setRows] = useState<IntakeRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  async function load(p: number): Promise<void> {
    try {
      const res = (await api.stockIntakes({ page: p, pageSize: 20 })) as {
        rows: IntakeRow[];
        total: number;
      };
      setRows(res.rows);
      setTotal(res.total);
      setPage(p);
    } catch {
      setRows([]);
      setTotal(0);
    }
  }

  useEffect(() => {
    void load(1);
  }, []);

  return (
    <Drawer
      label="Réceptions"
      title="Factures fournisseurs"
      sub={`${total} réception(s)`}
      onClose={onClose}
      wide
    >
      {rows.length === 0 ? (
        <EmptyState title="Aucune réception" hint="Validez votre première réception fournisseur." />
      ) : (
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#122131] text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Facture</th>
              <th className="px-3 py-2.5">Fournisseur</th>
              <th className="px-3 py-2.5 text-right">Sous-total</th>
              <th className="px-3 py-2.5 text-right">Livraison</th>
              <th className="px-3 py-2.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-white/[0.06]">
                <td className="px-3 py-2 font-mono text-xs">
                  {r.invoice_number ?? `#${r.id}`}
                  <span className="block text-[11px] text-slate-500">
                    {String(r.invoice_date ?? r.created_at).slice(0, 10)}
                  </span>
                </td>
                <td className="max-w-[180px] truncate px-3 py-2">{r.supplier_name ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                  {formatDzd(r.subtotal_minor)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                  {formatDzd(r.shipping_cost_minor)}
                </td>
                <td className="px-3 py-2 text-right font-bold tabular-nums text-amber-200">
                  {formatDzd(r.total_minor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pager page={page} pageSize={20} total={total} onPage={(p) => void load(p)} />
    </Drawer>
  );
}
