// Veloria PoS — Caisse : barre d'onglets paniers (extrait de SellScreen, JSX pur).
// Chaque panier garde ses articles et son client. F6 = nouvel onglet, F8 = fermer l'actif.
import { X } from "lucide-react";
import { formatDzdTotal } from "@domain/money/money.ts";
import { Badge, Button } from "@shared/ui/primitives.tsx";
import type { CartTab } from "../cart-store.ts";

export function SellTabsBar({
  tabs,
  activeId,
  onSwitch,
  onCloseTab,
  tabTotal,
  onNewTab,
}: {
  tabs: CartTab[];
  activeId: number;
  onSwitch: (id: number) => void;
  onCloseTab: (id: number) => void;
  tabTotal: (t: CartTab) => number | null;
  onNewTab: () => void;
}): React.JSX.Element {
  return (
    <div
      className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-white/[0.06] bg-[#0a0f1c] px-3 py-2"
      role="tablist"
      aria-label="Paniers en cours"
    >
      <span className="flex shrink-0 items-center gap-2 pr-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#d3c5ac]">
        <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[#4edea3]" />
        Paniers en attente :
      </span>
      {tabs.map((t) => {
        const selected = t.id === activeId;
        const total = tabTotal(t);
        return (
          <div
            key={t.id}
            role="tab"
            aria-selected={selected}
            aria-label={`${t.name} · ${t.lines.length} article(s)`}
            className={
              selected
                ? "flex shrink-0 items-center gap-2 rounded-xl border border-[#fbbf24]/30 bg-[linear-gradient(90deg,rgba(251,191,36,0.14),rgba(251,191,36,0.02))] py-1.5 pl-3 pr-1.5 shadow-[0_1px_0_rgba(255,255,255,0.05)_inset]"
                : "flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-1.5 pl-3 pr-1.5 transition-colors hover:border-white/20"
            }
          >
            <button
              type="button"
              onClick={() => onSwitch(t.id)}
              title={`Ouvrir ${t.name}`}
              className="flex items-center gap-2 text-sm"
            >
              <span
                className={
                  selected ? "font-extrabold text-amber-200" : "font-semibold text-slate-300"
                }
              >
                {t.name}
              </span>
              <Badge tone={selected ? "amber" : "grey"}>{t.lines.length}</Badge>
              {total != null ? (
                <span
                  className={
                    selected
                      ? "font-mono text-[11px] font-bold tabular-nums text-[#ffe1a7]"
                      : "font-mono text-[11px] font-bold tabular-nums text-slate-300"
                  }
                >
                  {formatDzdTotal(total)}
                </span>
              ) : null}
            </button>
            {tabs.length > 1 ? (
              <button
                type="button"
                onClick={() => onCloseTab(t.id)}
                aria-label={`Fermer ${t.name}`}
                title={`Fermer ${t.name} [F8 = onglet actif]`}
                className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-red-500/15 hover:text-red-300"
              >
                <X size={14} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        );
      })}
      <Button
        variant="secondary"
        onClick={onNewTab}
        title="Nouveau panier [F6]"
        className="shrink-0"
      >
        + Panier [F6]
      </Button>
    </div>
  );
}
