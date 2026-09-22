// Veloria PoS — Shared: parse strict pour champs calculés au rendu.
// P1-5 : les montants affichés/validés pendant le rendu ne peuvent pas lever
// (pas de try/catch dans le corps du composant) : invalide → -1 sentinelle,
// rejetée par tous les gardes existants (`>= 0`, `> 0`, `<= dette`). Jamais NaN.
// Les sauvegardes (handlers) utilisent `parseDzdInputStrict` + try/catch + frError.
import { parseDzdInputStrict } from "@domain/money/money.ts";

export function strictOrNeg(raw: string, label = "Montant"): number {
  if (raw.trim() === "") return 0;
  try {
    return parseDzdInputStrict(raw, label);
  } catch {
    return -1;
  }
}
