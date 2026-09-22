// Veloria PoS — Domain: règles codes-barres (framework-free).
// P3 : contrôle EAN-8/EAN-13 (clé de contrôle) quand le code est numérique de
// 8/13 chiffres. Les autres formats (internes, courts, fournisseurs) passent
// sans contrôle — jamais de faux rejet, jamais de devinette.

import { DomainError } from "../common/errors.ts";

export type BarcodeKind = "ean8" | "ean13" | "other";

function eanChecksumOk(digits: string): boolean {
  let sum = 0;
  const len = digits.length;
  for (let i = 0; i < len - 1; i += 1) {
    const d = Number(digits[i] ?? "");
    if (!Number.isInteger(d)) return false;
    const posFromRight = len - i;
    sum += posFromRight % 2 === 0 ? d * 3 : d;
  }
  const key = Number(digits[len - 1] ?? "");
  return Number.isInteger(key) && (10 - (sum % 10)) % 10 === key;
}

export function barcodeKind(raw: string): BarcodeKind {
  const t = raw.trim();
  if (/^\d{8}$/.test(t)) return "ean8";
  if (/^\d{13}$/.test(t)) return "ean13";
  return "other";
}

/** Valide un code-barres (64 max, doublons gérés par l'appelant). */
export function validateBarcode(raw: string): { kind: BarcodeKind } {
  const t = raw.trim();
  if (t.length === 0) throw new DomainError("BARCODE_ERROR", "Code-barres vide.");
  if (t.length > 64) throw new DomainError("BARCODE_ERROR", "Code-barres trop long (max 64).");
  const kind = barcodeKind(t);
  if ((kind === "ean8" || kind === "ean13") && !eanChecksumOk(t)) {
    throw new DomainError("BARCODE_ERROR", "Code-barres EAN invalide (clé de contrôle).");
  }
  return { kind };
}
