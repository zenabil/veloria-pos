// Veloria PoS — Formateurs fichiers (tailles humaines FR).
// Dédupliqué de `OcrImportDialog` + `SettingsSectionsB` (même rendu, ex-`formatBytes`).

/** Taille humaine FR : « 512 o », « 12,3 Ko », « 4,56 Mo ». Corrompu → « — ». */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1024 / 1024).toFixed(2)} Mo`;
}
