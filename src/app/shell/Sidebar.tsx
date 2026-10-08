// Veloria PoS — Navigation compacte : recherche + 17 modules en ligne.
// Le nom n'apparaît que sur le module actif (ADR-073). Mêmes props et flux.
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
    <div className="flex items-center gap-2 px-3 pb-2">
      {collapsed ? null : (
        <input
          type="search"
          value={navQuery}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Filtrer…"
          aria-label="Filtrer les modules"
          className="min-h-[44px] w-full max-w-[200px] shrink-0 rounded-lg border border-white/10 bg-[#010f1f] px-3 py-1.5 text-[12px] text-[#d4e4fa] placeholder:text-[#d3c5ac]/50 hover:border-white/25 focus:border-[#fbbf24]"
        />
      )}
      <nav
        className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto"
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
            <div key={group} role="group" aria-label={group} className="flex items-stretch gap-1">
              <ul className="flex items-stretch gap-1">
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
                          "relative flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-all duration-150 focus-visible:outline-none",
                          selected
                            ? "bg-[#fbbf24] font-bold text-[#402d00]"
                            : "font-medium text-[#d3c5ac] hover:bg-[#122131] hover:text-[#d4e4fa]",
                        )}
                      >
                        <Icon
                          size={18}
                          strokeWidth={selected ? 2.25 : 2}
                          aria-hidden="true"
                          className={cn("shrink-0", selected ? "text-[#402d00]" : "text-[#d3c5ac]")}
                        />
                        {!collapsed && selected ? (
                          <span className="whitespace-nowrap leading-snug">{m.label}</span>
                        ) : null}
                        {count != null && count > 0 ? (
                          <span
                            title={`${count} point(s) de vigilance`}
                            className={cn(
                              "rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold",
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
                        <span
                          aria-hidden="true"
                          className={cn(
                            "topnav-indicator absolute inset-x-3 -bottom-0.5 h-0.5 origin-center rounded-full bg-[#fbbf24] transition-transform duration-150",
                            selected ? "scale-x-100" : "scale-x-0",
                          )}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <span aria-hidden="true" className="mx-1 w-px self-stretch bg-white/[0.06]" />
            </div>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Développer le menu" : "Réduire le menu"}
        title={collapsed ? "Développer le menu" : "Réduire le menu"}
        className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg px-3 py-2 text-[12px] font-semibold text-slate-500 transition-colors duration-150 hover:bg-white/[0.05] hover:text-slate-200 focus-visible:outline-none"
      >
        {collapsed ? (
          <PanelLeftOpen size={18} aria-hidden="true" className="shrink-0" />
        ) : (
          <>
            <PanelLeftClose size={18} aria-hidden="true" className="shrink-0" />
            <span className="ml-2 hidden sm:inline">Réduire</span>
          </>
        )}
      </button>
    </div>
  );
}
