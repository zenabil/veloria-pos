// Veloria PoS — Catalogue : parseurs partagés des dialogues (P4).
// Source unique (détail/ajustement + formulaire) : jamais de doublon local.
import { parseDzdInputStrict } from "@domain/money/money.ts";

export function parseQty(raw: string): number | null {
  const n = Number(raw.replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  return Math.round(n * 1000) / 1000;
}

export function parseMoney(raw: string): number | null {
  if (raw.trim() === "") return 0;
  try {
    return parseDzdInputStrict(raw, "Montant");
  } catch {
    return null;
  }
}
