// Veloria PoS — Domain: timbre de quittance (LF 2025, Art. 100 JO 26/12).
// Barème par tranches de 100 DA (fraction compte), espèces uniquement.
// - total ≤ 300 DA → 0 (hors champ)
// - 300 < total ≤ 30 000 DA → 1 DA / tranche
// - 30 000 < total ≤ 100 000 DA → 1,5 DA / tranche
// - total > 100 000 DA → 2 DA / tranche
// - plancher 5 DA. Tout en centimes entiers (1,5 DA = 150).
// Le timbre est une ligne DOCUMENTAIRE (imprimés), jamais un poste vente DB
// (CHECK total = subtotal − remise + livraison, migration 0001).

const MINOR_PER_TRANCHE = 10_000;
const FLOOR_MINOR = 500;
const RATE_LOW = 100;
const RATE_MID = 150;
const RATE_HIGH = 200;
const CAP_LOW_DA = 30_000;
const CAP_MID_DA = 100_000;
/** Centimes par DA — miroir de `src/domain/money/money.ts` (100, entier). */
const MINOR_PER_MAJOR = 100;

function tranches(totalMinor: number): number {
  return Math.ceil(totalMinor / MINOR_PER_TRANCHE);
}

/**
 * Timbre de quittance LF 2025 en centimes (0 = non applicable).
 * `method` : seul `cash` (espèces) est timbré — chèque/virement/électronique
 * exonérés (circulaire 14/MF/DGI/LF.2025).
 * RADICAL-FIX : seuils en CENTIMES ENTIERS (jamais `totalMinor / 100` float).
 * L'ancienne division float `totalDa = totalMinor / 100` divergeait du
 * principe « jamais de float pour la monnaie » et du Client (entier strict).
 */
export function timbreQuittanceLf2025(totalMinor: number, method: string | null): number {
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) return 0;
  if (method !== "cash") return 0;
  if (totalMinor <= 300 * MINOR_PER_MAJOR) return 0;
  const n = tranches(totalMinor);
  const rate =
    totalMinor <= CAP_LOW_DA * MINOR_PER_MAJOR
      ? RATE_LOW
      : totalMinor <= CAP_MID_DA * MINOR_PER_MAJOR
        ? RATE_MID
        : RATE_HIGH;
  return Math.max(FLOOR_MINOR, n * rate);
}
