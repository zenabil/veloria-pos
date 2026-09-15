// Veloria PoS — Domain: import CSV validé-avant-commit (produits/clients).
// Règle : tout le fichier est validé en mémoire ; en cas d'une seule ligne
// invalide, RIEN n'est écrit (le repo main n'insère qu'après validation totale).

import { DomainError } from "../common/errors.ts";

export interface ProductCsvRow {
  line: number;
  name: string;
  sellingPriceMinor: number;
  purchasePriceMinor: number;
  quantity: number;
  barcode: string;
}

export interface CustomerCsvRow {
  line: number;
  firstName: string;
  lastName: string;
  phone: string;
}

function parseMinorDzd(raw: string, line: number, label: string): number {
  const n = Number(raw.replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0) {
    throw new DomainError("IMPORT_ERROR", `Ligne ${line} : ${label} invalide.`);
  }
  return Math.round(n * 100);
}

export function parseProductsCsv(text: string): ProductCsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new DomainError("IMPORT_ERROR", "Fichier vide.");
  const start = /nom|name/i.test(lines[0] ?? "") ? 1 : 0;
  const rows: ProductCsvRow[] = [];
  const seenBarcodes = new Set<string>();
  for (let i = start; i < lines.length; i++) {
    const lineNo = i + 1;
    const cols = (lines[i] ?? "").split(";").map((c) => c.trim());
    if (cols.length < 2)
      throw new DomainError("IMPORT_ERROR", `Ligne ${lineNo} : format invalide.`);
    const [name = "", selling = "0", purchase = "0", qty = "0", barcode = ""] = cols;
    if (name.length < 2) throw new DomainError("IMPORT_ERROR", `Ligne ${lineNo} : nom requis.`);
    const sellingMinor = parseMinorDzd(selling, lineNo, "prix de vente");
    const purchaseMinor = parseMinorDzd(purchase || "0", lineNo, "prix d'achat");
    const quantity = Number((qty || "0").replace(",", "."));
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new DomainError("IMPORT_ERROR", `Ligne ${lineNo} : quantité invalide.`);
    }
    if (barcode) {
      if (seenBarcodes.has(barcode)) {
        throw new DomainError("IMPORT_ERROR", `Ligne ${lineNo} : code-barres dupliqué.`);
      }
      seenBarcodes.add(barcode);
    }
    rows.push({
      line: lineNo,
      name,
      sellingPriceMinor: sellingMinor,
      purchasePriceMinor: purchaseMinor,
      quantity,
      barcode,
    });
  }
  if (rows.length > 5000) throw new DomainError("IMPORT_ERROR", "Maximum 5 000 lignes par import.");
  return rows;
}

export function parseCustomersCsv(text: string): CustomerCsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new DomainError("IMPORT_ERROR", "Fichier vide.");
  const start = /prénom|prenom|nom/i.test(lines[0] ?? "") ? 1 : 0;
  const rows: CustomerCsvRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const lineNo = i + 1;
    const cols = (lines[i] ?? "").split(";").map((c) => c.trim());
    if (cols.length < 2)
      throw new DomainError("IMPORT_ERROR", `Ligne ${lineNo} : format invalide.`);
    const [first = "", last = "", phone = ""] = cols;
    if (first.length < 1 || last.length < 1) {
      throw new DomainError("IMPORT_ERROR", `Ligne ${lineNo} : prénom et nom requis.`);
    }
    rows.push({ line: lineNo, firstName: first, lastName: last, phone });
  }
  if (rows.length > 5000) throw new DomainError("IMPORT_ERROR", "Maximum 5 000 lignes par import.");
  return rows;
}
