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
      <h3 className="border-b border-white/[0.07] px-4 py-3 text-sm font-extrabold">{title}</h3>
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
    return <p className="px-4 text-xs text-slate-500">{empty}</p>;
  }
  return (
    <div className="overflow-auto px-4">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[#122131] text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className={cn("py-1.5 pr-3", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-white/[0.06]">
              {r.map((c, j) => (
                <td key={j} className={cn("py-1.5 pr-3", j === 0 ? "" : "text-right tabular-nums")}>
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
