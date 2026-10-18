// Veloria PoS — Documents purs : rapports generiques (pur).

import { escapeHtml } from "./html";

// ---------------------------------------------------------------------------
// Rapports génériques : tableaux de bord validés (RP-*. schéma Zod).
// KPIs + graphiques barres SVG reconstruits côté main (déterministes).
// ---------------------------------------------------------------------------

export interface ReportKpi {
  label: string;
  value: string;
}

export interface ReportChart {
  title: string;
  labels: string[];
  values: number[];
}

export interface ReportTable {
  title: string;
  headers: string[];
  rows: string[][];
}

export interface ReportData {
  title: string;
  period: string;
  company: string;
  kpis: ReportKpi[];
  charts: ReportChart[];
  tables: ReportTable[];
  footer: string;
}

function toStrArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").slice(0, max);
}

export function toReportData(raw: unknown): ReportData {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
  const charts = Array.isArray(r["charts"]) ? r["charts"] : [];
  const tables = Array.isArray(r["tables"]) ? r["tables"] : [];
  const kpis = Array.isArray(r["kpis"]) ? r["kpis"] : [];
  return {
    title: str(r["title"], "Rapport"),
    period: str(r["period"]),
    company: str(r["company"], "Veloria"),
    kpis: kpis
      .filter((k): k is Record<string, unknown> => typeof k === "object" && k !== null)
      .slice(0, 12)
      .map((k) => ({ label: str(k["label"]), value: str(k["value"]) })),
    charts: charts
      .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
      .slice(0, 4)
      .map((c) => ({
        title: str(c["title"]),
        labels: toStrArray(c["labels"], 62),
        values: (Array.isArray(c["values"]) ? c["values"] : [])
          .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0)
          .slice(0, 62),
      })),
    tables: tables
      .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
      .slice(0, 10)
      .map((t) => ({
        title: str(t["title"]),
        headers: toStrArray(t["headers"], 8),
        rows: (Array.isArray(t["rows"]) ? t["rows"] : [])
          .slice(0, 200)
          .map((row) =>
            Array.isArray(row)
              ? row.filter((v): v is string => typeof v === "string").slice(0, 8)
              : [],
          ),
      })),
    footer: str(r["footer"]),
  };
}

function barChartSvg(title: string, labels: string[], values: number[]): string {
  if (labels.length === 0 || values.length === 0) return "";
  const w = 640;
  const h = 180;
  const pad = 28;
  const max = Math.max(1, ...values);
  const n = Math.min(labels.length, values.length);
  const slot = (w - pad * 2) / Math.max(1, n);
  const bw = Math.max(2, Math.min(28, slot * 0.55));
  let rects = "";
  for (let i = 0; i < n; i++) {
    const v = values[i] as number;
    const bh = Math.max(1, Math.round(((h - pad * 2) * v) / max));
    const x = Math.round(pad + slot * i + (slot - bw) / 2);
    const y = h - pad - bh;
    rects += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="#000"><title>${escapeHtml(labels[i] as string)} : ${v}</title></rect>`;
  }
  const step = Math.max(1, Math.ceil(n / 12));
  let ticks = "";
  for (let i = 0; i < n; i += step) {
    const x = Math.round(pad + slot * i + slot / 2);
    ticks += `<text x="${x}" y="${h - 8}" text-anchor="middle" font-size="9" fill="#000">${escapeHtml((labels[i] as string).slice(-5))}</text>`;
  }
  return `<div class="chart"><div class="ctitle">${escapeHtml(title)}</div><svg viewBox="0 0 ${w} ${h}" width="100%" role="img"><line x1="${pad}" y1="${h - pad}" x2="${w - 8}" y2="${h - pad}" stroke="#000"/>${rects}${ticks}</svg></div>`;
}

/** Rapport A4 : KPIs + graphiques + tableaux (une seule source déterministe). */
export function buildReportHtml(d: ReportData): string {
  const kpis =
    d.kpis.length > 0
      ? `<div class="kpis">${d.kpis.map((k) => `<div class="kpi"><div class="kl">${escapeHtml(k.label)}</div><div class="kv">${escapeHtml(k.value)}</div></div>`).join("")}</div>`
      : "";
  const charts = d.charts.map((c) => barChartSvg(c.title, c.labels, c.values)).join("");
  const tables = d.tables
    .map(
      (t) =>
        `<h2>${escapeHtml(t.title)}</h2><table><thead><tr>${t.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`,
    )
    .join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>${escapeHtml(d.title)}</title>
<style>@page{size:A4;margin:15mm}body{font-family:Arial,sans-serif;background:#fff;color:#000;font-size:12px}
h1{font-size:20px;margin:0}.muted{color:#000}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
.kpi{border:1px solid #000;padding:8px}.kl{font-size:11px;color:#000}.kv{font-size:15px;font-weight:bold}
h2{font-size:14px;margin:18px 0 6px}table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #000;padding:5px 7px;text-align:left}th{background:#fff}
.chart{margin:12px 0}.ctitle{font-weight:bold;margin-bottom:4px}
.foot{margin-top:24px;border-top:1px solid #000;padding-top:8px;font-size:11px;color:#000;text-align:center}</style>
</head><body>
<h1>${escapeHtml(d.title)}</h1>
<div class="muted">${escapeHtml(d.company)}${d.period ? ` · ${escapeHtml(d.period)}` : ""}</div>
${kpis}${charts}${tables}
<div class="foot">${escapeHtml(d.footer || `${d.company} · Veloria POS`)}<br>Page 1 / 1</div>
</body></html>`;
}
