// Veloria PoS — Electron: pure document-number formatting (zero imports).
// Testable sans Electron (vitest) ; utilisée par les repos d'allocation
// (ventes, proformas, pain) pour UN format unique : PRÉFIXE-ANNÉE-00001.
// L'incrémentation du compteur reste DANS la transaction d'allocation.

export function padSequence(nextValue: number): string {
  if (!Number.isInteger(nextValue) || nextValue <= 0) {
    throw new Error("Compteur de séquence invalide.");
  }
  return String(nextValue).padStart(5, "0");
}

export function formatInvoiceNumber(prefix: string, year: number, nextValue: number): string {
  const clean = prefix.trim() || "FAC";
  return `${clean}-${year}-${padSequence(nextValue)}`;
}

export function formatProformaNumber(prefix: string, year: number, nextValue: number): string {
  const clean = prefix.trim() || "PRO";
  return `${clean}-${year}-${padSequence(nextValue)}`;
}

export function formatBreadOrderNumber(year: number, nextValue: number): string {
  return `PAIN-${year}-${padSequence(nextValue)}`;
}
