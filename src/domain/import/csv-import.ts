// Veloria PoS — Domain: import CSV validé-avant-commit (produits/clients).
// Règle : tout le fichier est validé en mémoire ; en cas d'une seule ligne
// invalide, RIEN n'est écrit (le repo main n'insère qu'après validation totale).

import { DomainError } from "../common/errors.ts";
import { parseDzdInputStrict } from "../money/money.ts";
import { assertValidQuantity } from "../common/quantity.ts";

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
  // H-1 §24: strict parse — invalid → controlled DomainError, never NaN.
  // Unified cap: same MAX_MINOR_SINGLE as IPC moneyMinor (1e9).
  try {
    return parseDzdInputStrict(raw, `Ligne ${line} : ${label}`);
  } catch {
    throw new DomainError("IMPORT_ERROR", `Ligne ${line} : ${label} invalide.`);
  }
}

/**
 * Découpe une ligne CSV en respectant les champs entre guillemets
 * (`"Nom; avec point-virgule"`, guillemet échappé `""`). Les exports de
 * l'application et d'Excel entourent les champs de guillemets : un simple
 * `split(";")` transformait alors l'en-tête en fiche et les valeurs en
 * texte entre guillemets.
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (line.charAt(i + 1) === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ";") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out.map((c) => c.trim());
}

/** En-tête détecté sur la PREMIÈRE cellule exacte (un produit nommé
 * « Nominal » ne doit jamais être avalé comme en-tête). */
function hasHeader(firstLine: string, tokens: RegExp): boolean {
  const firstCell = (splitCsvLine(firstLine)[0] ?? "").trim();
  return tokens.test(firstCell);
}

function isProductReportHeader(cells: readonly string[]): boolean {
  const normalized = cells.map((c) => c.toLowerCase());
  return (
    normalized[0] === "nom" &&
    (normalized[1] === "catégorie" ||
      normalized[1] === "categorie" ||
      normalized.includes("prix de vente"))
  );
}

function isCustomerReportHeader(cells: readonly string[]): boolean {
  const first = (cells[0] ?? "").toLowerCase();
  const second = (cells[1] ?? "").toLowerCase();
  return first === "client" && (second === "téléphone" || second === "telephone");
}

export function parseProductsCsv(text: string): ProductCsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new DomainError("IMPORT_ERROR", "Fichier vide.");
  if (isProductReportHeader(splitCsvLine(lines[0] ?? ""))) {
    throw new DomainError(
      "IMPORT_ERROR",
      "Ce fichier est un export de rapport, pas un fichier d'import. Format attendu : nom;vente;achat;quantité[;code-barres].",
    );
  }
  const start = hasHeader(lines[0] ?? "", /^(nom|name|designation)$/i) ? 1 : 0;
  const rows: ProductCsvRow[] = [];
  const seenBarcodes = new Set<string>();
  for (let i = start; i < lines.length; i++) {
    const lineNo = i + 1;
    const cols = splitCsvLine(lines[i] ?? "");
    // P1-5 : ligne courte = REJET (fini les zéros silencieux sur achat/qté).
    // Format : nom;vente;achat;quantité[;code-barres].
    if (cols.length < 4) {
      throw new DomainError(
        "IMPORT_ERROR",
        `Ligne ${lineNo} : incomplète (nom;vente;achat;quantité requis).`,
      );
    }
    const [name = "", selling = "", purchase = "", qty = "", barcode = ""] = cols;
    if (name.length < 2) throw new DomainError("IMPORT_ERROR", `Ligne ${lineNo} : nom requis.`);
    const sellingMinor = parseMinorDzd(selling, lineNo, "prix de vente");
    const purchaseMinor = parseMinorDzd(purchase || "0", lineNo, "prix d'achat");
    const quantity = Number((qty || "0").replace(",", "."));
    // M-7: unified quantity limits (MAX 1M + 3 decimals, allowZero for CSV).
    try {
      assertValidQuantity(quantity, { allowZero: true });
    } catch {
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
  if (isCustomerReportHeader(splitCsvLine(lines[0] ?? ""))) {
    throw new DomainError(
      "IMPORT_ERROR",
      "Ce fichier est un export de rapport, pas un fichier d'import. Format attendu : prénom;nom;téléphone.",
    );
  }
  const start = hasHeader(lines[0] ?? "", /^(prénom|prenom|nom|firstname)$/i) ? 1 : 0;
  const rows: CustomerCsvRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const lineNo = i + 1;
    const cols = splitCsvLine(lines[i] ?? "");
    if (cols.length < 2)
      throw new DomainError("IMPORT_ERROR", `Ligne ${lineNo} : format invalide.`);
    const [first = "", last = "", phone = ""] = cols;
    if (first.length < 1 || last.length < 1) {
      throw new DomainError("IMPORT_ERROR", `Ligne ${lineNo} : prénom et nom requis.`);
    }
    assertImportPhone(phone, lineNo);
    rows.push({ line: lineNo, firstName: first, lastName: last, phone });
  }
  if (rows.length > 5000) throw new DomainError("IMPORT_ERROR", "Maximum 5 000 lignes par import.");
  return rows;
}

/** Téléphone importé : vide accepté, sinon chiffres + séparateurs usuels et
 * au moins 6 chiffres (un texte libre comme « Jour règlement » est refusé). */
const IMPORT_PHONE_CHARS = /^[0-9 +().\-/\u00A0]+$/;

function assertImportPhone(raw: string, lineNo: number): void {
  const phone = raw.trim();
  if (phone === "") return;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6 || !IMPORT_PHONE_CHARS.test(phone)) {
    throw new DomainError("IMPORT_ERROR", `Ligne ${lineNo} : téléphone invalide.`);
  }
}
