// Veloria PoS — Clients : rapprochement 360 (pur, sans IO).
// Extrait de `ClientDialogs.tsx` (P2 : découpage sans changement de comportement).
// Rapproche les lignes (retours/dettes/historique) au client par nom normalisé
// FR ; repli = toutes les lignes quand aucun rapprochement n'est possible.

/** Normalisation FR insensible aux accents/casse (rapprochement renderer). */
export function normFr(v: string | null | undefined): string {
  return (v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Montant serveur → entier sûr (jamais NaN propagé à l'affichage). */
export function asMinor(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** Champ date serveur → chaîne sûre (jamais "[object Object]" à l'affichage). */
export function asCreatedAt(row: Record<string, unknown>): string {
  const v = row["created_at"];
  return typeof v === "string" ? v : "";
}

export function matchClient(nameNorm: string, candidates: (string | null | undefined)[]): boolean {
  const hay = normFr(candidates.filter((c) => c != null && c !== "").join(" "));
  if (nameNorm === "") return true;
  if (hay === "") return false;
  if (hay.includes(nameNorm)) return true;
  return nameNorm.split(" ").some((w) => w.length > 2 && hay.includes(w));
}

/** Rapproche les lignes au client ; repli = toutes (champ indisponible). */
export function keepClient<T>(
  rows: T[],
  pick: (r: T) => (string | null | undefined)[],
  nameNorm: string,
): T[] {
  const kept = rows.filter((r) => matchClient(nameNorm, pick(r)));
  return kept.length > 0 ? kept : rows;
}
