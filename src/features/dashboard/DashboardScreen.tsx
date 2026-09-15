// Veloria PoS — Screen: Tableau de bord (agrégats SQL + top + récent).
import { useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { formatDzd } from "@domain/money/money.ts";
import { Kpi, Card } from "@shared/ui/primitives.tsx";

interface Dash {
  salesToday: { n: number; t: number };
  debt: { d: number };
  supplierDebt?: number;
  inventoryValue: number;
  lowStock: number;
  expensesToday: number;
  top?: { name: string; qty: number; revenue: number }[];
  recent?: {
    id: number;
    invoice_number: string;
    total_minor: number;
    payment_status: string;
    created_at: string;
    customer_name: string | null;
  }[];
}

export function DashboardScreen({
  notify,
}: {
  notify: (m: string, k?: "ok" | "err") => void;
}): React.JSX.Element {
  const [data, setData] = useState<Dash | null>(null);
  useEffect(() => {
    api
      .dashboard()
      .then((d) => setData(d as Dash))
      .catch((e: unknown) =>
        notify(e instanceof Error ? e.message : "Chargement impossible.", "err"),
      );
  }, []);
  if (!data) return <div className="p-8 text-slate-400">Chargement du tableau de bord…</div>;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Tableau de Bord</h1>
        <p className="text-sm text-slate-400">Vue opérationnelle — agrégats calculés en SQL</p>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Kpi
          label="Chiffre d'Affaires (jour)"
          value={formatDzd(data.salesToday.t)}
          sub={`${data.salesToday.n} vente(s)`}
        />
        <Kpi
          label="Dettes Clients"
          value={formatDzd(data.debt.d)}
          sub={`Fournisseurs : ${formatDzd(data.supplierDebt ?? 0)}`}
        />
        <Kpi label="Charges (jour)" value={formatDzd(data.expensesToday)} />
        <Kpi
          label="Alertes stock"
          value={String(data.lowStock)}
          sub={`Valeur stock : ${formatDzd(Math.round(data.inventoryValue))}`}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-slate-400">
            Top produits (CA)
          </h2>
          {(data.top ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">Aucune vente enregistrée.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {(data.top ?? []).map((t) => (
                  <tr key={t.name} className="border-t border-white/5">
                    <td className="py-2 font-semibold">{t.name}</td>
                    <td className="py-2 text-right tabular-nums text-slate-400">{t.qty}</td>
                    <td className="py-2 text-right tabular-nums text-emerald-300">
                      {formatDzd(t.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-slate-400">
            Activité récente
          </h2>
          {(data.recent ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">Aucune activité.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {(data.recent ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="py-2 font-mono">{r.invoice_number}</td>
                    <td className="py-2 text-slate-400">{r.customer_name ?? "Passage"}</td>
                    <td className="py-2 text-right tabular-nums">{formatDzd(r.total_minor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
