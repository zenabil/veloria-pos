// Veloria PoS — Barre latérale verticale : recherche + 17 modules en colonne.
// Repliable (icônes seules) avec préférence persistée (voir App.tsx).
// Un seul <nav> « Navigation principale » : le nom accessible des boutons
// vient du `title` (« Label — hint »), identique dans les deux modes pour
// le clavier et les tests (helpers e2e : gotoModule, correspondance nom).
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@shared/ui/primitives.tsx";
import type { ModuleDef } from "./modules.ts";
import { MODULE_GROUPS } from "./modules.ts";
import type { ModuleId } from "./shell-types.ts";

export interface SidebarProps {
  active: ModuleId;
  collapsed: boolean;
  navQuery: string;
  visibleModules: ModuleDef[];
  vigilanceCount: (id: ModuleId) => number | null;
  onSelect: (id: ModuleId) => void;
  onQueryChange: (query: string) => void;
  onToggle: () => void;
}

export function Sidebar({
  active,
  collapsed,
  navQuery,
  visibleModules,
  vigilanceCount,
  onSelect,
  onQueryChange,
  onToggle,
}: SidebarProps): React.JSX.Element {
  return (
    <div
      className={cn(
        "flex min-h-0 shrink-0 flex-col self-stretch border-r border-white/[0.06] bg-[#0a0f1c] transition-[width] duration-200",
        collapsed ? "w-[68px]" : "w-60",
      )}
    >
      {collapsed ? null : (
        <div className="shrink-0 px-3 pt-3">
          <input
            type="search"
            value={navQuery}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Filtrer…"
            aria-label="Filtrer les modules"
            className="min-h-[44px] w-full rounded-lg border border-white/10 bg-[#010f1f] px-3 py-1.5 text-[12px] text-[#d4e4fa] placeholder:text-[#d3c5ac]/50 hover:border-white/25 focus:border-[#fbbf24]"
          />
        </div>
      )}
      <nav
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2"
        aria-label="Navigation principale"
      >
        {MODULE_GROUPS.map((group) => {
          const items = visibleModules.filter(
            (m) =>
              m.group === group &&
              (navQuery.trim() === "" ||
                `${m.label} ${m.hint}`.toLowerCase().includes(navQuery.trim().toLowerCase())),
          );
          if (items.length === 0) return null;
          return (
            <div key={group} role="group" aria-label={group} className="flex flex-col gap-0.5">
              {collapsed ? (
                <span aria-hidden="true" className="mx-2 my-1.5 h-px bg-white/[0.06]" />
              ) : (
                <p className="px-3 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#d3c5ac]/60">
                  {group}
                </p>
              )}
              <ul className="flex flex-col gap-0.5">
                {items.map((m) => {
                  const selected = m.id === active;
                  const Icon = m.icon;
                  const count = vigilanceCount(m.id);
                  return (
                    <li key={m.id} className="flex">
                      <button
                        type="button"
                        aria-current={selected ? "page" : undefined}
                        title={`${m.label} — ${m.hint}`}
                        data-path={m.id}
                        onClick={() => onSelect(m.id)}
                        className={cn(
                          "relative flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors duration-150 focus-visible:outline-none",
                          collapsed && "justify-center px-0",
                          selected
                            ? "bg-[#fbbf24] font-bold text-[#402d00]"
                            : "font-medium text-[#d3c5ac] hover:bg-[#122131] hover:text-[#d4e4fa]",
                        )}
                      >
                        <Icon
                          size={19}
                          strokeWidth={selected ? 2.25 : 2}
                          aria-hidden="true"
                          className={cn("shrink-0", selected ? "text-[#402d00]" : "text-[#d3c5ac]")}
                        />
                        {collapsed ? null : (
                          <span className="min-w-0 flex-1 truncate whitespace-nowrap leading-snug">
                            {m.label}
                          </span>
                        )}
                        {count != null && count > 0 ? (
                          <span
                            title={`${count} point(s) de vigilance`}
                            className={cn(
                              "rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold",
                              collapsed && "absolute right-1 top-1",
                              selected
                                ? "bg-[#402d00]/15 text-[#402d00]"
                                : "bg-red-500/20 text-red-200",
                            )}
                          >
                            {count > 99 ? "99+" : count}
                          </span>
                        ) : null}
                        {!collapsed && selected && m.kbd ? (
                          <span className="rounded bg-[#402d00]/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold">
                            {m.kbd}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="shrink-0 border-t border-white/[0.06] p-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Développer le menu" : "Réduire le menu"}
          title={collapsed ? "Développer le menu" : "Réduire le menu"}
          className={cn(
            "flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold text-slate-500 transition-colors duration-150 hover:bg-white/[0.05] hover:text-slate-200 focus-visible:outline-none",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen size={18} aria-hidden="true" className="shrink-0" />
          ) : (
            <>
              <PanelLeftClose size={18} aria-hidden="true" className="shrink-0" />
              <span>Réduire</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
