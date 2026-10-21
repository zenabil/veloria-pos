// Veloria PoS — Catalogue : parseurs partagés des dialogues (P4).
// Source unique (détail/ajustement + formulaire) : jamais de doublon local.
// W7 (D-02) : le parseur de quantité n'est plus ici — c'est
// `parseQuantityInput` (`@domain/common/quantity.ts`), source unique.
import { parseDzdInputStrict } from "@domain/money/money.ts";

export function parseMoney(raw: string): number | null {
  if (raw.trim() === "") return 0;
  try {
    return parseDzdInputStrict(raw, "Montant");
  } catch {
    return null;
  }
}
