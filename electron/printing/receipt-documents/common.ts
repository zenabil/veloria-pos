// Veloria PoS — Documents purs : types, codes, echappement (zero import).

// Veloria PoS — Documents d'impression purs (zéro import : testables en vitest).
// Source unique du ticket 80mm, de la facture A4 et du proforma (déterministes,
// français). Les handlers Electron (printing.service) ne font que valider +
// injecter le logo + imprimer. Maquettes : wireframes A4 / 80mm / proforma.

export interface ReceiptLine {
  name: string;
  qty: number;
  unit: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
  /** Référence imprimée (code-barres ou identifiant paddé, « — » sinon). */
  ref?: string | undefined;
}

export interface ReceiptData {
  company: string;
  companyPhone: string;
  companyAddress: string;
  companyCity: string;
  companyEmail: string;
  companyRc: string;
  companyNif: string;
  /** C5 : NIS + article d'imposition (migration 0035, facture DZ). */
  companyNis?: string | undefined;
  companyArticle?: string | undefined;
  /** Logo en data URL (injecté côté main), absent = aucun bloc logo. */
  companyLogo: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCode: string;
  /** Vendeur / caissier (vide = ligne masquée). */
  seller?: string | undefined;
  /** Taux TVA en % (0 = pas de TVA, rendu historique conservé). */
  tvaRatePercent?: number | undefined;
  /** Ventilation HT/TVA en centimes (0 quand taux = 0). */
  htMinor?: number | undefined;
  tvaMinor?: number | undefined;
  /**
   * C5 : timbre de quittance LF 2025 en centimes (espèces uniquement, 0 sinon).
   * Ligne DOCUMENTAIRE : le total vente DB reste subtotal − remise + livraison
   * (CHECK 0001) ; le net à payer documentaire vaut total + timbre.
   */
  stampMinor?: number | undefined;
  /** Charge QR déterministe (vide = calculée depuis N°/total/date/RC/NIF/NIS). */
  qrPayload?: string | undefined;
  /** SVG QR réel injecté côté main (vide = aucun bloc QR). */
  qrSvg?: string | undefined;
  paymentMethod: string;
  dueDate: string;
  notes: string;
  invoice: string;
  date: string;
  lines: ReceiptLine[];
  subtotalMinor: number;
  discountMinor: number;
  deliveryMinor: number;
  totalMinor: number;
  paidMinor: number;
  prevBalanceMinor?: number | undefined;
  currentBalanceMinor?: number | undefined;
  /** Pied de page / remerciement personnalisés (paramètres) ; vide = défaut. */
  footerText: string;
  thankYouMessage: string;
  /**
   * C6 : options Studio (posées par le main, jamais par le renderer) —
   * taille logo, masquages, filigrane, note d'en-tête.
   */
  logoSize?: string | undefined;
  hideSigns?: boolean | undefined;
  qrOff?: boolean | undefined;
  codesOff?: boolean | undefined;
  hideZeroRows?: boolean | undefined;
  watermark?: string | undefined;
  headerNote?: string | undefined;
}

/** « CL-00125 » (dérivé de l'id : aucun code stocké en base). */
export function formatCustomerCode(id: number): string {
  if (!Number.isInteger(id) || id <= 0) return "—";
  return `CL-${String(id).padStart(5, "0")}`;
}

/** Référence ligne : identifiant paddé, « — » pour les lignes libres. */
export function formatProductRef(productId: number | null | undefined): string {
  if (!Number.isInteger(productId) || (productId as number) <= 0) return "—";
  return String(productId).padStart(5, "0");
}

/** Libellé mode de paiement côté ticket (vide → "" pour masquer la ligne).
 * P03: miroir de shared/formatters (vide → "—" en UI) — mappings identiques. */
export function paymentMethodLabel(method: string): string {
  if (method === "cash") return "Espèces";
  if (method === "cheque") return "Chèque";
  if (method === "transfer") return "Virement";
  return "";
}

// ---------------------------------------------------------------------------
// Code-barres Code 39 (SVG pur, sans dépendance) : numéros de facture/devis
// scannables vers la recherche. Alphabet : 0-9 A-Z et `- . $ / + % espace`.
// Chaque caractère = 9 modules (barre/espace alternés) dont exactement 3 larges.
// ---------------------------------------------------------------------------

/** Motifs Code 39 : 9 largeurs (n = étroit, w = large), positions paires = barres.
 * Vérifiés contre JsBarcode (MIT) + équations ISO 16388 (2 barres larges +
 * 1 espace large par caractère) ; testés exhaustivement (structure + A/P/0). */
export const CODE39_PATTERNS: Record<string, string> = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnnwwn",
  S: "nnwnnnwwn",
  T: "nnnnwnwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  $: "nwnwnwnnn",
  "/": "nwnwnnnwn",
  "+": "nwnnnwnwn",
  "%": "nnnwnwnwn",
  "*": "nwnnwnwnn",
};

/** Normalise pour Code 39 (majuscules, alphabet supporté) ; « » si vide. */
export function sanitizeCode39(raw: string): string {
  return raw
    .toUpperCase()
    .split("")
    .filter((c) => Object.prototype.hasOwnProperty.call(CODE39_PATTERNS, c))
    .join("");
}

/** SVG Code 39 (début/fin `*`, texte lisible) ; « » si rien d'encodable. */
export function code39Svg(raw: string, height = 46): string {
  const text = sanitizeCode39(raw);
  if (!text) return "";
  const narrow = 2;
  const wide = narrow * 2 + 1;
  const gap = narrow;
  let x = 0;
  let rects = "";
  const full = `*${text}*`;
  for (const ch of full) {
    const pattern = CODE39_PATTERNS[ch] as string;
    for (let i = 0; i < 9; i++) {
      const w = pattern[i] === "w" ? wide : narrow;
      if (i % 2 === 0) {
        rects += `<rect x="${x}" y="0" width="${w}" height="${height}" fill="#000"/>`;
      }
      x += w;
    }
    x += gap;
  }
  const width = x - gap;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + 16}" width="${width}" height="${height + 16}" role="img" aria-label="Code-barres ${escapeHtml(text)}">${rects}<text x="${width / 2}" y="${height + 13}" text-anchor="middle" font-family="monospace" font-size="12" fill="#000">${escapeHtml(text)}</text></svg>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Échappement texte brut pour conteneur HTML (ticket thermique <pre>) :
 * source centrale unique (P28) — buildReceiptText étant du texte non échappé,
 * thermalHtml passe par ici au lieu d'un replace partiel.
 */
export function escapePreText(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

/** Largeur thermique supportée (58/80mm, sans coupe). */
export type ThermalWidth = "58mm" | "80mm";
