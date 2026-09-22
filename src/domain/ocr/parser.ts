// Veloria PoS — Domain OCR: analyseur générique de facture fournisseur.
// Aucun template par fournisseur : heuristiques de mise en page FR/DZ
// (colonnes « désignation … qté … PU … montant », totaux HT/TVA/TTC).
// Sortie = suggestion relisible. Toute valeur douteuse vaut null.

import { DomainError } from "../common/errors.ts";
import { multiplyMinorByQuantity } from "../money/money.ts";
import { parseOcrAmountToMinor, parseOcrDiscountPct, parseOcrQuantity } from "./numbers.ts";
import type { OcrConfidence, OcrInvoice, OcrInvoiceLine } from "./types.ts";

const KNOWN_UNITS = new Set([
  "PIECE",
  "PCS",
  "PC",
  "U",
  "KG",
  "G",
  "L",
  "ML",
  "CL",
  "M",
  "CARTON",
  "CTN",
  "PAQUET",
  "PAQ",
  "SAC",
  "BOITE",
  "BTL",
  "BOUTEILLE",
  "SACHET",
  "ROULEAU",
  "LOT",
  "COLIS",
  "PALETTE",
]);

const SKIP_LINE =
  /^(page\s*\d|suite\s*au\s*verso|merci|cachet|signature|arr[eê]t[eé].*somme|montant\s+en\s+lettres|total\s+en\s+lettres|bon\s+pour|lu\s+et\s+approuv[eé]|conditions?\s+(de\s+)?(vente|paiement|r[eè]glement)|paiement\s*:|mode\s+de\s+(paiement|r[eè]glement)|[.\-_]{6,}|=+|-{4,})$/i;

const ADMIN_LINE =
  /\b(NIF|N°?\s*RC|RC\s*N|NIS|N°?\s*AI\b|AI\s*N|N°?\s*ART|ART\s*N|MF\b|CB\s*:|RIB|CCP|COMPTE\s+N|TEL\b|T[EÉ]L\b|FAX|MOB|EMAIL|@|WWW\.|SITE\s*:|ADRESSE\s*:|ALGER|WILAYA|COMMUNE)\b/i;

const TOTAL_LABEL =
  /^(sous-?total|total\s*(g[eé]n[eé]ral|ht|ttc)?|montant\s*(total|ttc|ht|net)?|net\s*[aà]\s*payer|tva(\s*\(?\d{1,2}\s*%\)?)?|remise(\s+(globale|commerciale))?|escompte|timbre(\s+fiscal)?|avance|acompte|reste|verse|total\s*brut)$/i;

const HT_LABEL = /^(sous-?total|total\s*(ht|brut|hors\s*taxe)|montant\s*ht)$/i;
const TTC_LABEL =
  /^(total\s*(ttc|g[eé]n[eé]ral)?|montant\s*(total|ttc|net)|net\s*[aà]\s*payer|total)$/i;
const REMISE_LABEL = /^(remise(\s+(globale|commerciale))?|escompte)$/i;

function collapseThousands(line: string): string {
  // « 10 591.00 » → « 10591.00 » (séparateur de milliers espacé, décimales à
  // virgule ou point). Ne touche pas aux espaces ordinaires.
  return line.replace(/(\d)[ \u00a0\u202f](?=\d{3}(?:[.,]\d{1,2})?(?:\s|$))/g, "$1");
}

function isNumericToken(t: string): boolean {
  return /^[+-]?[\d.,]+%?$/.test(t);
}

function splitNameAndNumbers(line: string): { name: string; numbers: string[] } {
  const tokens = line.split(/\s+/).filter((t) => t.length > 0);
  const numbers: string[] = [];
  let cut = tokens.length;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i] ?? "";
    if (isNumericToken(t)) {
      numbers.unshift(t);
      cut = i;
    } else {
      break;
    }
  }
  return { name: tokens.slice(0, cut).join(" ").trim(), numbers };
}

function cleanName(raw: string): string {
  return raw
    .replace(/^[\s\-–—•*#:;.,|/\\]+/, "")
    .replace(/[\s\-–—•*#:;.,|/\\]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractBarcode(name: string): { name: string; barcode: string | null } {
  const m = /(?:^|\s)(\d{8}|\d{12,13,14})(?:\s|$)/.exec(` ${name} `);
  if (!m) return { name, barcode: null };
  const code = m[1] ?? "";
  const rest = cleanName(name.replace(code, " "));
  if (rest.length < 2) return { name, barcode: null };
  return { name: rest, barcode: code };
}

function extractUnit(name: string): { name: string; unit: string } {
  const m = /\b([A-Za-z]{1,8}|\d+\s*[A-Za-z]{1,3})$/u.exec(name);
  if (!m) return { name, unit: "PIECE" };
  const raw = (m[1] ?? "").replace(/\s+/g, "").toUpperCase();
  if (KNOWN_UNITS.has(raw)) {
    const rest = cleanName(name.slice(0, name.length - (m[1] ?? "").length));
    if (rest.length >= 2)
      return { name: rest, unit: raw === "U" || raw === "PC" || raw === "PCS" ? "PIECE" : raw };
  }
  return { name, unit: "PIECE" };
}

/** Jours réels par mois (bissextile) : un 31 février est rejeté, pas deviné. */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function parseDateFr(raw: string): string | null {
  let day = 0;
  let mon = 0;
  let year = 0;
  let m = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(raw);
  if (m) {
    day = Number(m[1] ?? "");
    mon = Number(m[2] ?? "");
    let y = m[3] ?? "";
    // Règle année à 2 chiffres : 2000–2099 (factures DZ contemporaines).
    if (y.length === 2) y = `20${y}`;
    year = Number(y);
  } else {
    // Branche ISO : VALIDÉE comme la FR (jamais de passage aveugle).
    m = /(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (!m) return null;
    year = Number(m[1] ?? "");
    mon = Number(m[2] ?? "");
    day = Number(m[3] ?? "");
  }
  if (!Number.isInteger(day) || !Number.isInteger(mon) || !Number.isInteger(year)) return null;
  if (year < 2000 || year > 2100 || mon < 1 || mon > 12) return null;
  if (day < 1 || day > daysInMonth(year, mon)) return null;
  return `${String(year).padStart(4, "0")}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseInvoiceNumber(raw: string): string | null {
  const m =
    /(?:facture|bl|bon(?:\s+de\s+livraison)?|fact|fac|n[°o]|n°?\s*facture|pi[eè]ce)\s*(?:n[°o]?)?\s*[:–—-]?\s*([A-Z0-9][\w\-/.]{1,29})/i.exec(
      raw,
    );
  if (!m) return null;
  const num = (m[1] ?? "")
    .replace(/^[.:;\-–—/]+/, "")
    .replace(/[.:;\-–—/]+$/, "")
    .trim();
  if (num.length < 2 || /^(de|du|la|le|n|no)$/i.test(num)) return null;
  return num.slice(0, 40).toUpperCase();
}

function confidenceOf(args: {
  numbers: number;
  totalChecked: boolean;
  nameLen: number;
}): OcrConfidence {
  if (args.numbers >= 3 && args.totalChecked && args.nameLen >= 4) return "high";
  if (args.numbers >= 3 || (args.numbers === 2 && args.nameLen >= 4)) return "medium";
  return "low";
}

function tryItemLine(line: string, index: number): OcrInvoiceLine | null {
  const collapsed = collapseThousands(line);
  if (SKIP_LINE.test(collapsed.trim())) return null;
  if (ADMIN_LINE.test(collapsed) && !/\d{8,}/.test(collapsed)) return null;
  const { name: left, numbers } = splitNameAndNumbers(collapsed);
  if (numbers.length === 0 || numbers.length > 4) return null;
  const name = cleanName(left);
  if (name.length < 2 || !/[A-Za-zÀ-ÿ\u0600-\u06FF]/.test(name)) return null;
  // Une ligne de total déguisée (label seul + montant) n'est pas un article.
  if (numbers.length === 1 && TOTAL_LABEL.test(name)) return null;

  let discountPct: number | null = null;
  const nums = [...numbers];
  const lastTok = nums[nums.length - 1] ?? "";
  if (/%$/.test(lastTok)) {
    discountPct = parseOcrDiscountPct(lastTok);
    if (discountPct === null) return null;
    nums.pop();
  }
  if (nums.length === 0 || nums.length > 3) return null;

  let quantity: number | null = null;
  let unitPriceMinor: number | null = null;
  let lineTotalMinor: number | null = null;
  if (nums.length === 1) {
    unitPriceMinor = parseOcrAmountToMinor(nums[0] ?? "");
    if (unitPriceMinor === null) return null;
    quantity = 1;
  } else if (nums.length === 2) {
    // « qté PU » (cas dominant) ; si qté illisible mais PU lisible → qté=1 ?
    // Non : pas de devinette — qté illisible = ligne rejetée.
    quantity = parseOcrQuantity(nums[0] ?? "");
    unitPriceMinor = parseOcrAmountToMinor(nums[1] ?? "");
    if (quantity === null || unitPriceMinor === null) return null;
  } else {
    quantity = parseOcrQuantity(nums[0] ?? "");
    unitPriceMinor = parseOcrAmountToMinor(nums[1] ?? "");
    lineTotalMinor = parseOcrAmountToMinor(nums[2] ?? "");
    if (quantity === null || unitPriceMinor === null || lineTotalMinor === null) return null;
  }
  if (quantity <= 0 || unitPriceMinor < 0) {
    return null;
  }
  // P1-4 : arithmétique entière gardée (dépassement → ligne rejetée, pas de
  // Math.round flottant non borné qui contournerait MAX_MINOR_TOTAL).
  let expected: number;
  try {
    expected = multiplyMinorByQuantity(unitPriceMinor, quantity);
  } catch {
    return null;
  }
  if (lineTotalMinor === null) {
    lineTotalMinor = expected;
  }
  const gap = Math.abs(lineTotalMinor - expected);
  const totalChecked = gap <= Math.max(200, Math.round(expected * 0.01));

  const withBarcode = extractBarcode(name);
  const withUnit = extractUnit(withBarcode.name);
  return {
    index,
    rawName: cleanName(left),
    name: withUnit.name,
    ref: null,
    barcode: withBarcode.barcode,
    quantity,
    unit: withUnit.unit,
    unitPriceMinor,
    discountPct,
    lineTotalMinor,
    confidence: confidenceOf({
      numbers: numbers.length,
      totalChecked,
      nameLen: withUnit.name.length,
    }),
  };
}

function tryTotalLine(
  line: string,
): { kind: "ht" | "ttc" | "tva" | "remise" | null; amount: number } | null {
  const collapsed = collapseThousands(line);
  const { name, numbers } = splitNameAndNumbers(collapsed);
  if (numbers.length !== 1) return null;
  const label = cleanName(name);
  if (!TOTAL_LABEL.test(label)) return null;
  const amount = parseOcrAmountToMinor(numbers[0] ?? "");
  if (amount === null || amount < 0) return null;
  if (REMISE_LABEL.test(label)) return { kind: "remise", amount };
  if (/tva/i.test(label)) return { kind: "tva", amount };
  if (HT_LABEL.test(label)) return { kind: "ht", amount };
  if (TTC_LABEL.test(label)) return { kind: "ttc", amount };
  return null;
}

/** Analyse générique : en-tête + lignes + totaux. Ne lève que si vide. */
export function parseInvoiceText(rawText: string): OcrInvoice {
  const text = rawText.replace(/\r/g, "");
  if (text.trim().length === 0) {
    throw new DomainError("IMPORT_ERROR", "Texte OCR vide : rien à analyser.");
  }
  const rawLines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let number: string | null = null;
  let date: string | null = null;
  let supplierName: string | null = null;
  let supplierRef: string | null = null;
  let totalHtMinor: number | null = null;
  let tvaMinor: number | null = null;
  let totalTtcMinor: number | null = null;
  let remiseMinor: number | null = null;
  const lines: OcrInvoiceLine[] = [];

  for (const raw of rawLines) {
    if (number === null) {
      const n = parseInvoiceNumber(raw);
      if (n !== null) number = n;
    }
    if (date === null) {
      const d = parseDateFr(raw);
      if (d !== null) date = d;
    }
    if (supplierName === null) {
      const m = /(SARL|EURL|ETS|SPA|SNC|STE|SAS)[.\s]+(.{2,80})/i.exec(raw);
      if (m) {
        const tail = cleanName(m[2] ?? "");
        supplierName = cleanName(`${m[1]?.toUpperCase()} ${tail}`.trim()).slice(0, 100) || null;
      }
    }
    if (supplierRef === null) {
      const m = /\bNIF\s*[:-]?\s*([0-9]{10,20})/i.exec(raw);
      if (m) supplierRef = (m[1] ?? "").slice(0, 30);
    }
    const total = tryTotalLine(raw);
    if (total !== null) {
      if (total.kind === "ht" && totalHtMinor === null) totalHtMinor = total.amount;
      else if (total.kind === "tva" && tvaMinor === null) tvaMinor = total.amount;
      else if (total.kind === "ttc" && totalTtcMinor === null) totalTtcMinor = total.amount;
      else if (total.kind === "remise" && remiseMinor === null) remiseMinor = total.amount;
      continue;
    }
    const item = tryItemLine(raw, lines.length + 1);
    if (item !== null) lines.push(item);
  }

  return {
    number,
    date,
    supplierName,
    supplierRef,
    totalHtMinor,
    tvaMinor,
    totalTtcMinor,
    remiseMinor,
    lines,
    rawText: text,
  };
}
