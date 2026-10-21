// Veloria PoS — Shared: diagramme en barres SVG (déterministe, sans dépendance).
// Séries groupées + légende + axe gradué en dates (5 derniers caractères).

interface BarSeries {
  label: string;
  values: number[];
  color: string;
}

export function BarChart({
  title,
  labels,
  series,
}: {
  title: string;
  labels: string[];
  series: BarSeries[];
}): React.JSX.Element {
  const w = 640;
  const h = 170;
  const pad = 26;
  // P12: valeurs corrompues (NaN/Infinity/négatif) neutralisées en 0 —
  // un résumé corrompu n'écrase jamais le rendu (rect NaN avant).
  const clean = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
  const flat = series.flatMap((s) => s.values.map(clean));
  const max = Math.max(1, ...flat);
  const n = labels.length;
  if (n === 0) return <p className="text-xs text-slate-500">Aucune donnée.</p>;
  const slot = (w - pad * 2) / n;
  const bw = Math.max(2, Math.min(10, (slot / Math.max(1, series.length)) * 0.7));
  const step = Math.max(1, Math.ceil(n / 12));
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-3 px-1 text-xs font-bold">
        <span>{title}</span>
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1 font-normal text-slate-400">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={title}>
        <line x1={pad} y1={h - pad} x2={w - 8} y2={h - pad} stroke="#334155" />
        {series.map((s, si) =>
          s.values.map((raw, i) => {
            const v = clean(raw);
            const bh = Math.max(1, Math.round(((h - pad * 2) * v) / max));
            const x = Math.round(pad + slot * i + (slot - bw * series.length) / 2 + si * bw);
            return (
              <rect
                key={`${si}-${i}`}
                x={x}
                y={h - pad - bh}
                width={bw}
                height={bh}
                fill={s.color}
              />
            );
          }),
        )}
        {labels.map((l, i) =>
          i % step === 0 ? (
            <text
              // A-27 : clé stable (le libellé de l'axe ne bouge pas).
              key={`lbl-${l}-${i}`}
              x={Math.round(pad + slot * i + slot / 2)}
              y={h - 8}
              textAnchor="middle"
              fontSize="9"
              fill="#64748b"
            >
              {l.slice(-5)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
