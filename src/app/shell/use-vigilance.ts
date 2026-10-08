// Veloria PoS — Vigilance sidebar : compteurs réels (null = inconnu, aucun badge).
// Ruptures stock, règlements dépassés, commandes pain en cours.
import { useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import type { ModuleId } from "./shell-types.ts";

export interface VigilanceState {
  stockOut: number | null;
  debtsOverdue: number | null;
  breadPending: number | null;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;

export function useVigilance(): {
  vigilanceCount: (id: ModuleId) => number | null;
} {
  const [vigilance, setVigilance] = useState<VigilanceState>({
    stockOut: null,
    debtsOverdue: null,
    breadPending: null,
  });

  function vigilanceCount(id: ModuleId): number | null {
    if (id === "stock") return vigilance.stockOut;
    if (id === "debts") return vigilance.debtsOverdue;
    if (id === "bread") return vigilance.breadPending;
    return null;
  }

  useEffect(() => {
    const fetchVigilance = (): void => {
      api
        .stockOverview()
        .then((s) => {
          setVigilance((v) => ({
            ...v,
            stockOut: num((s as { outOfStock?: unknown }).outOfStock),
          }));
        })
        .catch((err: unknown) => {
          console.error("[Veloria] vigilance : stock illisible", err);
        });
      api
        .debtsStats()
        .then((s) => {
          setVigilance((v) => ({
            ...v,
            debtsOverdue: num((s as { settleOverdue?: unknown }).settleOverdue),
          }));
        })
        .catch((err: unknown) => {
          console.error("[Veloria] vigilance : dettes illisibles", err);
        });
      api
        .breadStats()
        .then((s) => {
          const b = s as { pending?: unknown; ready?: unknown };
          const p = num(b.pending) ?? 0;
          const r = num(b.ready) ?? 0;
          setVigilance((v) => ({ ...v, breadPending: p + r }));
        })
        .catch((err: unknown) => {
          console.error("[Veloria] vigilance : pain illisible", err);
        });
    };
    fetchVigilance();
    const timer = window.setInterval(fetchVigilance, 120000);
    return () => window.clearInterval(timer);
  }, []);

  return { vigilanceCount };
}
