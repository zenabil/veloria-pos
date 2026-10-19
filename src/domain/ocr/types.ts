// Veloria PoS — Domain OCR: types partagés (framework-free).
// L'OCR est un système de SUGGESTION : rien n'est écrit sans relecture humaine.

export type OcrConfidence = "high" | "medium" | "low";

export interface OcrInvoiceLine {
  /** Position 1-based dans le texte analysé (traçabilité). */
  index: number;
  /** Nom brut tel qu'imprimé (jamais réécrit en base automatiquement). */
  rawName: string;
  /** Nom nettoyé (espaces/ponctuation) proposé pour l'affichage. */
  name: string;
  /** Référence article / code détecté (non-barcode), le cas échéant. */
  ref: string | null;
  /** Candidat code-barres EAN (8–14 chiffres), le cas échéant. */
  barcode: string | null;
  quantity: number | null;
  /** Unité détectée (information indicative ; l'unité du produit prévaut). */
  unit: string;
  unitPriceMinor: number | null;
  discountPct: number | null;
  lineTotalMinor: number | null;
  confidence: OcrConfidence;
}

export interface OcrInvoice {
  number: string | null;
  /** Date normalisée AAAA-MM-JJ, null si absente ou invalide. */
  date: string | null;
  supplierName: string | null;
  supplierRef: string | null;
  totalHtMinor: number | null;
  tvaMinor: number | null;
  totalTtcMinor: number | null;
  remiseMinor: number | null;
  lines: OcrInvoiceLine[];
  /** Texte brut OCR conservé pour audit/relecture (jamais persisté en base). */
  rawText: string;
}

export type OcrMatchKind = "barcode" | "exact" | "normalized" | "fuzzy" | "none";

export interface OcrMatchCandidate {
  productId: number;
  name: string;
  sellingPriceMinor: number;
  purchasePriceMinor: number;
  quantity: number;
}

export interface OcrMatch {
  kind: OcrMatchKind;
  product: OcrMatchCandidate | null;
  /** 0–1 (1 = certitude). Informatif : ne déclenche JAMAIS d'écriture auto. */
  score: number;
  confidence: OcrConfidence;
}
