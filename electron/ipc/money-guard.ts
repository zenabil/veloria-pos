// Veloria PoS — Main-process: garde monétaire UNIQUE (R7 RADICAL).
// Cause racine D2 : les bornes centimes étaient recopiées en dur dans
// chaque registry/handler (registry.sales.ts, finance.repo.ts…) avec le
// commentaire « miroir sans import croisé main/renderer ». Toute évolution
// de `src/domain/money/money.ts` exigeait une synchro manuelle invisible.
// Correctif radical : UNE seule origine côté main (`money-guard.ts`,
// dans rootDir electron donc importable par tout le main) ; les valeurs
// MIROIRENT le domaine et la parité est prouvée par
// `tests/unit/money-guard-parity.test.ts` (fail-closed en cas d'écart).
// Règle : aucun fichier electron/* ne doit contenir de littéral
// 1_000_000_000 / 100_000_000_000 hors de ce module.

/** Plafond d'un MONTANT unitaire (miroir `MAX_MINOR_SINGLE`). */
export const MONEY_MAX_SINGLE_MINOR = 1_000_000_000;
/** Plafond d'un TOTAL (miroir `MAX_MINOR_TOTAL`). */
export const MONEY_MAX_TOTAL_MINOR = 100_000_000_000;
/** Quantité maximale par ligne (miroir des validateurs). */
export const QUANTITY_MAX = 1_000_000;

export function assertUnitPriceMinor(
  v: unknown,
  label = "Prix unitaire invalide.",
): asserts v is number {
  if (!Number.isSafeInteger(v) || (v as number) < 0 || (v as number) > MONEY_MAX_SINGLE_MINOR) {
    throw new Error(label);
  }
}

export function assertTotalMinor(v: unknown, label = "Montant invalide."): asserts v is number {
  if (!Number.isSafeInteger(v) || (v as number) < 0 || (v as number) > MONEY_MAX_TOTAL_MINOR) {
    throw new Error(label);
  }
}

export function assertQuantity(q: unknown, label = "Quantité invalide."): asserts q is number {
  if (typeof q !== "number" || !Number.isFinite(q) || q <= 0 || q > QUANTITY_MAX) {
    throw new Error(label);
  }
}

export interface PricedLine {
  charged: number;
  original: number;
  discount: number;
}

/**
 * Totaux entiers d'une ligne (miroir de `computeLineTotal` du domaine) :
 *Prix facturé = arrondi(prix × qté), original = arrondi(prixOrigine × qté),
 * remise = original − facturé. Lève un message FR si hors bornes.
 */
export function priceLine(args: {
  unitPriceMinor: number;
  originalUnitPriceMinor: number;
  quantity: number;
}): PricedLine {
  assertUnitPriceMinor(args.unitPriceMinor);
  assertUnitPriceMinor(args.originalUnitPriceMinor, "Prix d'origine invalide.");
  assertQuantity(args.quantity);
  const charged = Math.round(args.unitPriceMinor * args.quantity);
  const original = Math.round(args.originalUnitPriceMinor * args.quantity);
  assertTotalMinor(charged, "Montant de ligne invalide.");
  assertTotalMinor(original, "Montant de ligne invalide.");
  return { charged, original, discount: original - charged };
}

/**
 * Pourcentage entier d'un montant (miroir de `percentOfMinor` du domaine) :
 * arrondi(net × taux / 100), borné au total. Utilisé par la zakat.
 */
export function percentOfTotal(netMinor: number, ratePercent: number): number {
  assertTotalMinor(netMinor, "Assiette nette invalide.");
  if (!(ratePercent > 0) || ratePercent > 100) throw new Error("Taux invalide.");
  const out = Math.round((netMinor * ratePercent) / 100);
  assertTotalMinor(out, "Montant calculé invalide.");
  return out;
}
