// Veloria PoS — Domain: Money (DZD, integer minor units = centimes).
// 100 DZD === 10000 minor. Never use float for financial state.
//
// H-1 MONEY SAFETY BOUNDARY (RADICAL REPAIR):
// Single boundary for ALL financial values. Every operation is protected
// against NaN / Infinity / unsafe integer / overflow / underflow / negative
// where forbidden. Layers: IPC (moneyMinor 0..1e9) + Domain (here) + DB CHECKs.
// - Single value cap: MAX_MINOR_SINGLE = 1e9 (10M DZD, mirrors IPC validator).
// - Accumulated total cap: MAX_MINOR_TOTAL = 1e11 (100M DZD cumulé, fail-closed
//   bien avant 9e15 — ADR-028 ; couvre 200 lignes tout en restant exact).
// - OCR parser cap (1e12) stays below IPC cap so OCR suggestions that exceed
//   the main boundary are rejected with a clear FR message, never silently.

export const MINOR_PER_MAJOR = 100;

/** Single financial value cap (centimes). Mirrors IPC `moneyMinor` 0..1e9. */
export const MAX_MINOR_SINGLE = 1_000_000_000;
/** Accumulated total cap (centimes). Fail-closed well below MAX_SAFE_INTEGER. */
export const MAX_MINOR_TOTAL = 100_000_000_000;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/** Core guard: finite + safe integer + range. The single source of truth. */
export function assertSafeMinor(
  value: number,
  opts?: { min?: number; max?: number; label?: string },
): void {
  const min = opts?.min ?? 0;
  const max = opts?.max ?? MAX_MINOR_SINGLE;
  const label = opts?.label ?? "Montant invalide";
  if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} : valeur non entière sûre (${String(value)}).`);
  }
  if (value < min || value > max) {
    throw new MoneyError(`${label} : hors bornes [${min}, ${max}].`);
  }
}

/** Guard for accumulated totals (subtotal/total/remaining/COGS/profit...). */
export function assertSafeTotal(value: number, label = "Total invalide"): void {
  if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} : valeur non entière sûre (${String(value)}).`);
  }
  if (value < 0 || value > MAX_MINOR_TOTAL) {
    throw new MoneyError(`${label} : hors bornes [0, ${MAX_MINOR_TOTAL}].`);
  }
}

/**
 * Overflow-safe sum of N safe minors (invoices with 200+ lines).
 *
 * E-37 (radical) — les ADDENDAS sont des TOTAUX DE LIGNE, pas des valeurs
 * unitaires : `multiplyMinorByQuantity` les autorise jusqu'à
 * `MAX_MINOR_TOTAL` (1e11) et refusait au-delà. Valider chaque addenda avec
 * `assertSafeMinor` (plafond unitaire 1e9) créait une incohérence de contrat :
 * un line total légal de 1,5e9 centimes passait la garde de ligne puis
 * échouait ici avec « Sous-total invalide : hors bornes [0, 1000000000] » —
 * un message qui accuse à tort une ligne correcte. La borne d'un addenda est
 * donc `MAX_MINOR_TOTAL` (entier sûrs, ≥ 0) ; c'est l'ACCUMULATEUR qui reste
 * borné, et l'addition elle-même ne peut pas dépasser `MAX_MINOR_TOTAL`.
 * Pour des valeurs SIGNÉES, utiliser `sumSignedMinors`.
 */
export function sumSafeMinors(values: readonly number[], label = "Sous-total invalide"): number {
  let acc = 0;
  for (const v of values) {
    assertSafeTotal(v, label);
    acc += v;
    if (!Number.isSafeInteger(acc) || acc < 0 || acc > MAX_MINOR_TOTAL) {
      throw new MoneyError(`${label} : dépassement de capacité.`);
    }
  }
  return acc;
}

/**
 * Garde pour totaux SIGNÉS (remises : la majoration donne du négatif).
 * Bornes [−MAX_MINOR_TOTAL, +MAX_MINOR_TOTAL], entiers sûrs.
 */
export function assertSignedTotal(value: number, label = "Total invalide"): void {
  if (
    !Number.isFinite(value) ||
    !Number.isSafeInteger(value) ||
    Math.abs(value) > MAX_MINOR_TOTAL
  ) {
    throw new MoneyError(`${label} : hors bornes signé.`);
  }
}

/**
 * Overflow-safe sum of N SIGNED minors (remises de lignes : la majoration
 * — prix relevé — donne une remise négative). Chaque entrée et l'accumulateur
 * restent dans [−MAX_MINOR_TOTAL, +MAX_MINOR_TOTAL] en entiers sûrs.
 */
export function sumSignedMinors(values: readonly number[], label = "Remise invalide"): number {
  let acc = 0;
  for (const v of values) {
    assertSignedTotal(v, label);
    acc += v;
    assertSignedTotal(acc, `${label} : dépassement de capacité.`);
  }
  return acc;
}

export function assertMinorInteger(value: number): void {
  assertSafeMinor(value);
}

/** Create minor units from DZD major units (e.g. 12.5 DZD -> 1250). Rounds half away from zero. */
export function fromDzd(major: number): number {
  if (!Number.isFinite(major)) throw new MoneyError("Montant invalide.");
  // Overflow guard BEFORE multiplication: major * 100 must stay safe.
  if (Math.abs(major) > MAX_MINOR_SINGLE / MINOR_PER_MAJOR) {
    throw new MoneyError("Montant invalide : hors bornes.");
  }
  // E-34 : même arrondi « half away from zero » exact que
  // `parseDzdInputStrict` (10.005 → 1001, pas 1000).
  const out = decimalToMinorStrict(major);
  assertSafeMinor(out);
  return out;
}

/**
 * H-1 §24 + E-34 — Strict parser: valid input → valid Money, invalid →
 * controlled MoneyError (jamais NaN). SEUL parseur d'entrée (P1-5 : l'ancien
 * `dzdInputToMinor` NaN a été supprimé après migration des 28 appelants).
 *
 * E-36 (radical) — AUCUNE COERCION `Number()` sur la saisie brute :
 * `Number("0x10")=16`, `Number("1e3")=1000`, `Number("+7")=7` étaient ACCEPTÉS
 * (un prix de fournisseur « 1.5E3 » importé en CSV devenait 150 DA sans
 * erreur). La politique d'entrée est donc la même que `parseQuantityInput`
 * (gate regex) : décimale simple uniquement, groupement français toléré
 * (espace, U+00A0, U+202F produits par `Intl fr-FR`), virgule OU point
 * décimal, un seul séparateur. Le conversion en centimes est ensuite faite
 * SUR LA CHAÎNE (entiers uniquement), ce qui supprime aussi le double
 * arrondi `toFixed(6)` (10.0049999 → 1000, non 1001).
 */
export function parseDzdInputStrict(
  raw: string,
  label = "Montant invalide",
  maxMinor = MAX_MINOR_SINGLE,
): number {
  if (typeof raw !== "string") throw new MoneyError(`${label}.`);
  const compact = raw.replace(/[\s\u00A0\u202F\u2007\u2009]/g, "");
  if (compact.length === 0) throw new MoneyError(`${label} : saisie vide.`);
  if (compact.startsWith("-")) throw new MoneyError(`${label} : montant négatif interdit.`);
  if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(compact)) {
    throw new MoneyError(`${label} : saisie non numérique.`);
  }
  const parts = compact.replace(",", ".").split(".");
  const intPart = parts[0] ?? "";
  const fracPart = parts[1] ?? "";
  const digits = intPart.replace(/^0+/, "");
  // Garde de capacité AVANT la conversion : 13 chiffres entiers dépassent
  // tout plafond connu (1e11 centimes = 11 chiffres entiers de dinars).
  if (digits.length > 13) throw new MoneyError(`${label} : montant trop élevé.`);
  const out = decimalStringToMinor(digits, fracPart);
  assertSafeMinor(out, { label, max: maxMinor });
  return out;
}

/**
 * Saisie d'un TOTAL (paiement, règlement de dette) : même parseur strict,
 * plafond `MAX_MINOR_TOTAL` au lieu du plafond d'une valeur unitaire.
 */
export function parseDzdInputTotal(raw: string, label = "Montant invalide"): number {
  return parseDzdInputStrict(raw, label, MAX_MINOR_TOTAL);
}

/**
 * Conversion EXACTE chaîne → centimes, arrondie AU CENTIÈME SUPÉRIEUR à
 * mi-chemin (convention DZD), sans jamais multiplier un flottant.
 * `12.5` → 1250 · `10.005` → 1001 · `10.0049999` → 1000 · `2.675` → 268.
 * Le premier chiffre abandonné (3ᵉ décimale) décide seul : ≥ 5 ⇒ on arrondit
 * vers le haut (« half away from zero » sur une valeur déjà positive).
 */
function decimalStringToMinor(intDigits: string, fracDigits: string): number {
  const cents = fracDigits.slice(0, 2).padEnd(2, "0");
  const roundUp = Number(fracDigits[2] ?? "0") >= 5;
  const majorMinor = Number(intDigits.length === 0 ? "0" : intDigits) * MINOR_PER_MAJOR;
  if (!Number.isSafeInteger(majorMinor)) throw new MoneyError("Montant invalide : hors bornes.");
  return majorMinor + Number(cents) + (roundUp ? 1 : 0);
}

/**
 * Conversion d'un FLOTTANT (déjà hors de la saisie utilisateur) en centimes,
 * même règle d'arrondi. Forme canonique via `toString()` (représentation
 * aller-retour la plus courte) ; `toFixed(6)` en repli pour les exponentielles.
 */
function decimalToMinorStrict(value: number): number {
  const canonical: string = String(value);
  const m = /^(-?)(\d+)(?:\.(\d*))?$/.exec(canonical.includes("e") ? value.toFixed(6) : canonical);
  if (!m) return Math.round(value * MINOR_PER_MAJOR);
  const sign = m[1] === "-" ? -1 : 1;
  return sign * decimalStringToMinor((m[2] ?? "0").replace(/^0+(?=\d)/, ""), m[3] ?? "");
}

/** Format minor units for French UI: "1 250,00 DZD" — SANS FLOAT.
 * Arithmétique entière uniquement (même règle que l'APK `formatMinor`) :
 * `minor / 100` en float perdrait le centime au-delà de 2^53 et diverge du
 * Client. Ici : partie entière groupée via Intl (entier seul, exact) +
 * centimes `abs % 100`.
 *
 * A-01 (P1) — RENDU : ce formatteur ne LÈVE JAMAIS. Une valeur corrompue
 * (NaN, fractionnaire, négative, hors bornes) affichée pendant un render
 * React faisait tomber l'`ErrorBoundary` ⇒ **écran mort devant le caissier**
 * (268 sites d'appel, une seule valeur fausse suffisait). Valeur invalide
 * ⇒ « — ». Pour un chemin qui EXIGE la correction d'une valeur (logique
 * transactionnelle, écriture), utiliser `formatDzdStrict` (qui lève). */
export function formatDzd(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0 || minor > MAX_MINOR_SINGLE) return "—";
  const major = Math.trunc(minor / MINOR_PER_MAJOR);
  const cents = minor % MINOR_PER_MAJOR;
  const grouped = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(major);
  return `${grouped},${String(cents).padStart(2, "0")} DZD`;
}

/**
 * Variante pour les TOTAUX de période (CA, dettes, stock...). Le plafond
 * `MAX_MINOR_SINGLE` protège une valeur unitaire ; un agrégat peut atteindre
 * `MAX_MINOR_TOTAL`. Utiliser `formatDzd` sur un total > 10M DZD afficherait
 * « — » alors que le montant est valide.
 */
export function formatDzdTotal(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0 || minor > MAX_MINOR_TOTAL) return "—";
  const major = Math.trunc(minor / MINOR_PER_MAJOR);
  const cents = minor % MINOR_PER_MAJOR;
  const grouped = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(major);
  return `${grouped},${String(cents).padStart(2, "0")} DZD`;
}

/** Total signé (marge, trésorerie, résultat net) : jamais de « — » pour un négatif valide. */
export function formatDzdTotalSigned(minor: number): string {
  if (!Number.isSafeInteger(minor)) return "—";
  if (minor >= 0) return formatDzdTotal(minor);
  const positive = formatDzdTotal(-minor);
  return positive === "—" ? "—" : `-${positive}`;
}

/**
 * A-01 (P1) : variante STRICTE de `formatDzd` — elle LÈVE (`MoneyError`)
 * sur une valeur invalide. Réservée aux chemins transactionnels / écriture
 * (vérification de saisie, calculs envoyés au main) où une valeur corrompue
 * doit être signalée et non masquée.
 */
export function formatDzdStrict(minor: number): string {
  assertMinorInteger(minor);
  const major = Math.trunc(minor / MINOR_PER_MAJOR);
  const cents = minor % MINOR_PER_MAJOR;
  const grouped = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(major);
  return `${grouped},${String(cents).padStart(2, "0")} DZD`;
}

/**
 * RADICAL-FIX: valeur initiale des CHAMPS de saisie (sans suffixe/groupement).
 * Sortie STRICTEMENT identique à l'ancien motif dispersé
 * `(minor / 100).toString().replace(".", ",")` ("12,5"), centralisé + gardé —
 * mais SANS FLOAT (arithmétique entière : major + centimes) :
 * corrompu/NaN → MoneyError (jamais de textesilencieux dans le champ).
 * Round-trip garanti : `parseDzdInputStrict(minorToInput(m)) === m`.
 * Réservé aux inputs — l'affichage utilise `formatDzd` (groupement + "DZD").
 */
export function minorToInput(minor: number, maxMinor = MAX_MINOR_SINGLE): string {
  assertSafeMinor(minor, { max: maxMinor });
  const major = Math.trunc(minor / MINOR_PER_MAJOR);
  const cents = minor % MINOR_PER_MAJOR;
  if (cents === 0) return String(major);
  if (cents % 10 === 0) return `${major},${cents / 10}`;
  return `${major},${String(cents).padStart(2, "0")}`;
}

/** Saisie d'un TOTAL (paiement) : plafond `MAX_MINOR_TOTAL`. */
export function minorToInputTotal(minor: number): string {
  return minorToInput(minor, MAX_MINOR_TOTAL);
}

/** Multiply minor by a quantity (quantity may be decimal, e.g. kg). Rounds to nearest minor. */
export function multiplyMinorByQuantity(unitPriceMinor: number, quantity: number): number {
  assertSafeMinor(unitPriceMinor, { label: "Prix unitaire invalide" });
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new MoneyError("Quantité invalide pour le calcul du montant.");
  }
  if (quantity > 1_000_000) throw new MoneyError("Quantité invalide pour le calcul du montant.");
  // Overflow guard BEFORE multiplication (price*qty must stay within total cap).
  if (unitPriceMinor !== 0 && Math.abs(quantity) > MAX_MINOR_TOTAL / Math.abs(unitPriceMinor)) {
    throw new MoneyError("Montant de ligne : dépassement de capacité.");
  }
  const out = Math.round(unitPriceMinor * quantity);
  assertSafeTotal(out, "Montant de ligne invalide");
  return out;
}

/**
 * W7 (D-05) — multiplication SÛRE pour le RENDU (variante qui ne lève
 * jamais).
 * Même règle que `multiplyMinorByQuantity` (arrondi au centime + garde de
 * capacité + bornes), mais une valeur invalide ⇒ 0 au lieu d'une exception.
 * Rappel A-01 : une exception levée pendant un rendu React fait tomber
 * l'`ErrorBoundary` ⇒ **écran mort devant le caissier**. Les sites
 * renderer qui multiplient un prix unitaire par une quantité utilisent donc
 * cette variante (la base reste l'autorité : elle recalcule et refuse).
 */
export function multiplyMinorByQuantitySafe(unitPriceMinor: number, quantity: number): number {
  try {
    return multiplyMinorByQuantity(unitPriceMinor, quantity);
  } catch {
    return 0;
  }
}

/** Percentage discount on a minor amount. Percent in [0,100]. */
export function percentOfMinor(amountMinor: number, percent: number): number {
  assertSafeTotal(amountMinor, "Montant de remise invalide");
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new MoneyError("Pourcentage de remise invalide.");
  }
  const out = Math.round((amountMinor * percent) / 100);
  assertSafeTotal(out, "Montant de remise invalide");
  return out;
}

/**
 * W7 (D-08) — SOURCE UNIQUE de la conversion LENIENTE d'une valeur serveur
 * (JSON : `number | string | null | undefined`) vers des centimes.
 * Auparavant dupliquée dans `features/customers/client-matching.ts`
 * (`asMinor`) et dispersée dans les dialogues clients.
 * Contrat : jamais d'exception, jamais de NaN (une valeur illisible ⇒ 0),
 * troncature vers l'entier. C'est l'outil du RENDU (affichage) ; pour un
 * chemin d'écriture, utiliser `parseDzdInputStrict` / `assertSafeMinor`.
 */
export function toMinorSafe(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  const t = Math.trunc(n);
  return Number.isSafeInteger(t) ? t : 0;
}
