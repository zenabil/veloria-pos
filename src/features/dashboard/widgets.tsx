// Veloria PoS — Dashboard : widgets récents (présentation pure).
// Extraits de `DashboardScreen.tsx` (P2 : découpage sans changement de comportement).

import { Card } from "@shared/ui/primitives.tsx";

export function RecentCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Card className="space-y-1 p-4">
      <div className="flex items-center gap-2">
        {icon ? <span className="shrink-0 text-amber-300">{icon}</span> : null}
        <h3 className="text-sm font-extrabold">{title}</h3>
      </div>
      {children}
    </Card>
  );
}

export function RecentRow({
  left,
  mid,
  right,
  sub,
}: {
  left: string;
  mid: string;
  right: string;
  sub: string;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-2 border-t border-white/[0.06] py-1.5 text-sm">
      <span className="min-w-0">
        <span className="block truncate font-semibold">{left}</span>
        <span className="block truncate text-xs text-slate-500">
          {mid} · {sub}
        </span>
      </span>
      <span className="shrink-0 font-bold tabular-nums">{right}</span>
    </div>
  );
}

export function EmptyMini(): React.JSX.Element {
  return <p className="text-xs text-slate-500">Aucune activité.</p>;
}
