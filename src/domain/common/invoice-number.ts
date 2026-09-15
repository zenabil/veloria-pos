// Veloria PoS — Domain: invoice / sequence numbering.
// Invoice numbers are allocated inside the sale transaction (see repository).

export function buildInvoiceNumber(prefix: string, nextValue: number): string {
  const clean = prefix.trim() || "FAC";
  const year = String(new Date().getFullYear());
  return `${clean}-${year}-${String(nextValue).padStart(5, "0")}`;
}

export function buildProformaNumber(prefix: string, nextValue: number): string {
  const clean = prefix.trim() || "PRO";
  const year = String(new Date().getFullYear());
  return `${clean}-${year}-${String(nextValue).padStart(5, "0")}`;
}

export function buildBreadOrderNumber(nextValue: number): string {
  const year = String(new Date().getFullYear());
  return `PAIN-${year}-${String(nextValue).padStart(5, "0")}`;
}
