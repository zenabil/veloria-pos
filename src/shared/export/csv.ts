// Veloria PoS — Shared: export CSV (données métier explicites, jamais source).
// BOM UTF-8 pour Excel francophone ; séparateur « ; ».

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0] ?? {});
  // RX-18: anti-injection formules tableur — toute chaîne commençant par
  // = + - @ | % (après espaces) est préfixée d'une apostrophe (convention
  // OWASP CSV Injection). Les nombres/booléens ne sont jamais des formules.
  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return `""`;
    if (typeof v === "number" || typeof v === "boolean") return `"${String(v)}"`;
    const raw = typeof v === "string" ? v : String(JSON.stringify(v));
    const safe = /^[ \t]*[=+\-@|%]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return [headers.join(";"), ...rows.map((r) => headers.map((h) => esc(r[h])).join(";"))].join(
    "\n",
  );
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]): void {
  const blob = new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
