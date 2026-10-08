// Veloria PoS — Catalogue : tiroir détail + formulaire + ajustement de stock.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useEffect, useState } from "react";

import { api } from "@shared/types/ipc-client.ts";

import { formatDateTimeFr, movementTypeFr } from "@shared/formatters/format.ts";
import { BarChart } from "@shared/charts/BarChart.tsx";
import { Button, Card, Modal } from "@shared/ui/primitives.tsx";

// ---------------------------------------------------------------------------
// Mouvements du produit : graphe (entrées/sorties par jour) + journal.
// ---------------------------------------------------------------------------

interface MovementRow {
  created_at: string;
  movement_type: string;
  quantity_delta: number;
  quantity_after: number;
  reason: string | null;
  reference: string | null;
}

export function ProductMovementsDialog({
  productId,
  productName,
  onClose,
}: {
  productId: number;
  productName: string;
  onClose: () => void;
}): React.JSX.Element {
  const [rows, setRows] = useState<MovementRow[] | null>(null);

  useEffect(() => {
    api
      .stockLedger({ id: productId })
      .then((r) => {
        setRows(((r as { rows?: MovementRow[] }).rows ?? []).slice(0, 100));
      })
      .catch((err: unknown) => {
        console.error("[Veloria] mouvements : historique illisible", err);
        setRows([]);
      });
  }, [productId]);

  // Agrégation 14 derniers jours : entrées (+) vs sorties (−).
  const days: { day: string; in: number; out: number }[] = [];
  if (rows) {
    const byDay = new Map<string, { in: number; out: number }>();
    for (const m of rows) {
      const day = String(m.created_at).slice(0, 10);
      const cur = byDay.get(day) ?? { in: 0, out: 0 };
      const q = Number(m.quantity_delta);
      if (q >= 0) cur.in += q;
      else cur.out += -q;
      byDay.set(day, cur);
    }
    for (const [day, v] of [...byDay.entries()].sort().slice(-14)) {
      days.push({
        day,
        in: Math.round(v.in * 1000) / 1000,
        out: Math.round(v.out * 1000) / 1000,
      });
    }
  }

  return (
    <Modal
      label="Mouvements du produit"
      title={`Mouvements — ${productName}`}
      onClose={onClose}
      wide
    >
      {rows == null ? (
        <p className="py-8 text-center text-sm text-slate-500" role="status">
          Chargement…
        </p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">Aucun mouvement enregistré.</p>
      ) : (
        <div className="space-y-4">
          <Card className="p-4">
            <BarChart
              title="Flux par jour (14 derniers jours)"
              labels={days.map((d) => d.day)}
              series={[
                { label: "Entrées", values: days.map((d) => d.in), color: "#34d399" },
                { label: "Sorties", values: days.map((d) => d.out), color: "#f87171" },
              ]}
            />
          </Card>
          <div className="max-h-64 overflow-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#122131] text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2 text-right">Qté</th>
                  <th className="px-3 py-2 text-right">Après</th>
                  <th className="px-3 py-2">Référence</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m, i) => (
                  <tr key={i} className="border-t border-white/[0.06]">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-400">
                      {formatDateTimeFr(m.created_at)}
                    </td>
                    <td className="px-3 py-2">{movementTypeFr(m.movement_type)}</td>
                    <td
                      className={
                        Number(m.quantity_delta) >= 0
                          ? "px-3 py-2 text-right font-bold tabular-nums text-emerald-300"
                          : "px-3 py-2 text-right font-bold tabular-nums text-red-300"
                      }
                    >
                      {Number(m.quantity_delta) >= 0 ? "+" : ""}
                      {m.quantity_delta}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.quantity_after}</td>
                    <td className="max-w-[160px] truncate px-3 py-2 text-xs text-slate-500">
                      {m.reference || m.reason || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" onClick={onClose} className="flex-1">
          Fermer
        </Button>
      </div>
    </Modal>
  );
}
