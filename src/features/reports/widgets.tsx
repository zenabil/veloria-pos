// Veloria PoS — Reports : cartes de section (présentation pure).
// Extraites de `ReportsScreen.tsx` (P2 : découpage sans changement de comportement).

import { Card, cn } from "@shared/ui/primitives.tsx";

export function ReportSectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Card className="overflow-hidden">
      <h3 className="flex items-center gap-2 border-b border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[15px] font-semibold tracking-tight text-slate-100">
        <span aria-hidden="true" className="h-3.5 w-[3px] rounded-full bg-[#fbbf24]" />
        {title}
      </h3>
      <div className="space-y-3 py-3">{children}</div>
    </Card>
  );
}

export function MiniTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: string[][];
  empty: string;
}): React.JSX.Element {
  if (rows.length === 0) {
    return <p className="px-4 pb-1 text-xs text-slate-500">{empty}</p>;
  }
  return (
    <div className="overflow-auto px-4">
      <table className="w-full text-sm">
        <thead className="text-left text-[10px] uppercase tracking-[0.12em] text-slate-500">
          <tr className="border-b border-white/[0.07]">
            {/* A-27 : clés STABLES (le contenu de l'en-tête ne bouge pas) —
                `key={i}` était un index de position. */}
            {headers.map((h, i) => (
              <th key={`th-${h}`} className={cn("py-2 pr-3 font-bold", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`row-${i}`} className="border-b border-white/[0.05] last:border-0">
              {r.map((c, j) => (
                <td
                  key={`cell-${j}`}
                  className={cn(
                    "py-2 pr-3",
                    j === 0
                      ? "max-w-[280px] truncate font-medium text-slate-200"
                      : "text-right tabular-nums",
                  )}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
