// Veloria PoS — Barre latérale verticale : marque + recherche + modules en
// colonne. Repliable (icônes seules) avec préférence persistée (App.tsx).
// Un seul <nav> « Navigation principale » : le nom accessible des boutons
// vient du `title` (« Label — hint »), identique dans les deux modes pour
// le clavier et les tests (helpers e2e : gotoModule, correspondance nom).
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { SearchField, cn } from "@shared/ui/primitives.tsx";
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
  const matchesQuery = (m: ModuleDef): boolean =>
    navQuery.trim() === "" ||
    `${m.label} ${m.hint}`.toLowerCase().includes(navQuery.trim().toLowerCase());
  function renderRow(m: ModuleDef): React.JSX.Element {
    const selected = m.id === active;
    const Icon = m.icon;
    const count = vigilanceCount(m.id);
    return (
      <li key={m.id} className="flex items-stretch">
        <button
          type="button"
          aria-current={selected ? "page" : undefined}
          title={`${m.label} — ${m.hint}`}
          data-path={m.id}
          onClick={() => onSelect(m.id)}
          className={cn(
            "group relative flex min-h-[44px] w-full min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-2.5 py-1.5 text-left text-[13px] transition-colors duration-150 focus-visible:outline-none",
            collapsed && "justify-center border-transparent px-0",
            selected
              ? "border-[#fbbf24]/20 bg-[linear-gradient(90deg,rgba(251,191,36,0.14),rgba(251,191,36,0.02))] font-semibold text-slate-50 shadow-[0_1px_0_rgba(255,255,255,0.05)_inset]"
              : collapsed
                ? "border-transparent font-medium text-[#c6bba6] hover:bg-[#122131] hover:text-[#e8eef8]"
                : "border-transparent font-medium text-[#c6bba6] hover:border-white/[0.06] hover:bg-[#122131] hover:text-[#e8eef8]",
          )}
        >
          {selected ? (
            <span
              aria-hidden="true"
              className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-[#fbbf24] shadow-[0_0_12px_rgba(251,191,36,0.45)]"
            />
          ) : null}
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
              selected
                ? "bg-[#fbbf24]/15 text-[#fbbf24] ring-1 ring-[#fbbf24]/20"
                : "text-[#a99f8c] group-hover:text-[#e8eef8]",
            )}
          >
            <Icon size={17} strokeWidth={selected ? 2.2 : 1.9} aria-hidden="true" />
          </span>
          {collapsed ? null : (
            <span className="min-w-0 flex-1 truncate whitespace-nowrap leading-snug">
              {m.label}
            </span>
          )}
          {count != null && count > 0 ? (
            <span
              title={`${count} point(s) de vigilance`}
              className={cn(
                "rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums",
                collapsed && "absolute right-1 top-1",
                selected ? "bg-[#fbbf24]/15 text-[#ffe1a7]" : "bg-red-500/20 text-red-200",
              )}
            >
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
          {!collapsed && selected && m.kbd ? (
            <span className="rounded-md border border-[#fbbf24]/20 bg-[#fbbf24]/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#ffe1a7]">
              {m.kbd}
            </span>
          ) : null}
        </button>
      </li>
    );
  }
  return (
    <div
      className={cn(
        "relative flex min-h-0 shrink-0 flex-col self-stretch border-r border-white/[0.06] bg-[#0a0f1c] transition-[width] duration-200",
        collapsed ? "w-[68px]" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex h-[60px] shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-3",
          collapsed && "justify-center px-0",
        )}
      >
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#122131] ring-1 ring-white/10">
          <img
            src="./icons/icon-192x192.png"
            alt="Logo Veloria"
            className="h-9 w-9 object-cover"
            draggable={false}
          />
        </span>
        {collapsed ? null : (
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold leading-tight tracking-tight text-slate-50">
              Veloria <span className="text-[#fbbf24]">PoS</span>
            </p>
            <p className="mt-0.5 truncate font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Caisse · DZ
            </p>
          </div>
        )}
      </div>
      {collapsed ? null : (
        <div className="shrink-0 px-3 pb-1 pt-3">
          <SearchField
            value={navQuery}
            onChange={onQueryChange}
            placeholder="Filtrer…"
            ariaLabel="Filtrer les modules"
            inputClassName="min-h-[40px] pl-9 text-[12px]"
          />
        </div>
      )}
      <nav
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2"
        aria-label="Navigation principale"
      >
        {MODULE_GROUPS.map((group) => {
          const items = visibleModules.filter((m) => m.group === group && matchesQuery(m));
          if (items.length === 0) return null;
          return (
            <div key={group} role="group" aria-label={group} className="flex flex-col gap-0.5">
              {collapsed ? (
                <span aria-hidden="true" className="mx-2 my-1.5 h-px bg-white/[0.06]" />
              ) : (
                <p className="flex items-center gap-2 px-2.5 pb-1 pt-2.5">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#d3c5ac]/60">
                    {group}
                  </span>
                  <span aria-hidden="true" className="h-px flex-1 bg-white/[0.06]" />
                </p>
              )}
              <ul className="flex flex-col gap-0.5">{items.map(renderRow)}</ul>
            </div>
          );
        })}
      </nav>
      <div
        aria-hidden="true"
        className="veloria-nav-fade pointer-events-none absolute inset-x-0 bottom-[56px] h-8"
      />
      <div className="shrink-0 border-t border-white/[0.06] p-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Développer le menu" : "Réduire le menu"}
          title={collapsed ? "Développer le menu" : "Réduire le menu"}
          className={cn(
            "flex min-h-[40px] w-full items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold text-slate-500 transition-colors duration-150 hover:bg-white/[0.05] hover:text-slate-200 focus-visible:outline-none",
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
