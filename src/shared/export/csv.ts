// Veloria PoS — Shared: export CSV (données métier explicites, jamais source).
// BOM UTF-8 pour Excel francophone ; séparateur « ; ».

export interface CsvOptions {
  /**
   * RX-18 : préfixe anti-injection Excel (`= + - @ | %`) avec une apostrophe.
   * Défaut `true` (rapports ouverts dans un tableur). `false` est réservé aux
   * exports de DONNÉES destinés à `parseProductsCsv` / `parseCustomersCsv` :
   * le préfixe corromprait un téléphone `+213…` ou un nom `-…` à la
   * réimportation. Le fichier de données n'est pas un rapport Excel.
   */
  protectFormulas?: boolean;
}

export function toCsv(rows: Record<string, unknown>[], options: CsvOptions = {}): string {
  if (rows.length === 0) return "";
  const protectFormulas = options.protectFormulas !== false;
  const headers = Object.keys(rows[0] ?? {});
  // RX-18: anti-injection formules tableur — toute chaîne commençant par
  // = + - @ | % (après espaces) est préfixée d'une apostrophe (convention
  // OWASP CSV Injection). Les nombres/booléens ne sont jamais des formules.
  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return `""`;
    if (typeof v === "number" || typeof v === "boolean") return `"${String(v)}"`;
    const raw = typeof v === "string" ? v : String(JSON.stringify(v));
    const safe = protectFormulas && /^[ \t]*[=+\-@|%]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return [headers.join(";"), ...rows.map((r) => headers.map((h) => esc(r[h])).join(";"))].join(
    "\n",
  );
}

export function downloadCsv(
  filename: string,
  rows: Record<string, unknown>[],
  options: CsvOptions = {},
): void {
  const blob = new Blob(["\uFEFF" + toCsv(rows, options)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
