// Veloria PoS — Clients : rapprochement 360 (pur, sans IO).
// Extrait de `ClientDialogs.tsx` (P2 : découpage sans changement de comportement).
// Rapproche les lignes (retours/dettes/historique) au client par nom normalisé
// FR ; repli = toutes les lignes quand aucun rapprochement n'est possible.
//
// W7 (D-08) : la conversion de montant a quitté ce module — c'est
// `toMinorSafe` (`@domain/money/money.ts`), source unique de la conversion
// leniente vers les centimes.

/**
 * Normalisation FR insensible aux accents/casse (rapprochement renderer).
 *
 * W7 (E-29) : MIROIR EXACT de `normCustomerSearch`
 * (`electron/ipc/handlers/customers.repo.ts`) — c'est la même règle que
 * celle de la migration 0047 (colonne `search_norm`) et donc que celle de
 * l'index de recherche. AVANT, le renderer transformait « œ » en ESPACE
 * (au lieu de « oe ») : le rapprochement du tiroir client ne retrouvait pas
 * les lignes que la recherche, elle, retrouvait.
 * Toute évolution doit changer les deux + le test de parité.
 */
export function normFr(v: string | null | undefined): string {
  return (v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/\s+/g, " ")
    .trim();
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
