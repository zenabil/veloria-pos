// Veloria PoS — Domain: modèles d'impression (Print Studio, C6).
// Pur, framework-free. Les réglages vivent en SQLite (migration 0036) ;
// ce module porte les défauts, la fusion et les règles de cohérence.
// Volontairement SANS couleurs ni polices : le N&B strict est un invariant
// P0 testé (imprimantes thermiques + lisibilité fiscale).

// Politique stricte opération → format (règle métier) :
//   vente / règlement / retour / livraison / bon de commande → ticket 80 ou 58 ;
//   devis (proforma) → A4 uniquement ;
//   étiquettes → gabarits thermiques, jamais A4.
export const TEMPLATE_DOC_TYPES = [
  "ticket",
  "proforma",
  "bon_livraison",
  "recu",
  "avoir",
  "etiquette",
] as const;

export type TemplateDocType = (typeof TEMPLATE_DOC_TYPES)[number];

/** Gabarits d'étiquettes thermiques (mm) — l'A4 est banni pour les étiquettes. */
export const LABEL_PAPERS = ["30x20", "45x20", "50x30", "58x30", "58x40"] as const;
export type LabelPaper = (typeof LABEL_PAPERS)[number];

export type TemplatePaper = "A4" | "80mm" | "58mm" | LabelPaper;
export type TemplateLogoSize = "S" | "M" | "L";

export interface TemplateSettings {
  paper: TemplatePaper;
  copies: number;
  marginMm: number;
  thermalFontPx: number;
  logoSize: TemplateLogoSize;
  showLogo: boolean;
  showIdentity: boolean;
  showTva: boolean;
  showDiscountZero: boolean;
  showQr: boolean;
  showCodes: boolean;
  showSignatures: boolean;
  showWatermark: boolean;
  watermarkText: string;
  headerText: string;
  footerText: string;
}

const BASE_DEFAULTS: TemplateSettings = {
  paper: "A4",
  copies: 1,
  marginMm: 15,
  thermalFontPx: 12,
  logoSize: "M",
  showLogo: true,
  showIdentity: true,
  showTva: true,
  showDiscountZero: true,
  showQr: true,
  showCodes: true,
  showSignatures: true,
  showWatermark: false,
  watermarkText: "",
  headerText: "",
  footerText: "",
};

/** Papier par défaut par type de document. */
export function defaultPaperFor(docType: TemplateDocType): TemplatePaper {
  switch (docType) {
    case "ticket":
    case "recu":
    case "avoir":
    case "bon_livraison":
      return "80mm";
    case "etiquette":
      return "58x30";
    default:
      // proforma : A4 uniquement (jamais de ticket pour un devis).
      return "A4";
  }
}

/** Réglages d'usine d'un type (fusionnés sur les défauts de base). */
export function factorySettings(docType: TemplateDocType): TemplateSettings {
  const base = { ...BASE_DEFAULTS, paper: defaultPaperFor(docType) };
  // Étiquettes : QR opt-in (pas de changement de rendu par défaut).
  if (docType === "etiquette") return { ...base, showQr: false };
  return base;
}

/** Papiers autorisés par type (politique stricte opération → format). */
export function allowedPapers(docType: TemplateDocType): readonly TemplatePaper[] {
  switch (docType) {
    case "ticket":
    case "recu":
    case "avoir":
    case "bon_livraison":
      return ["80mm", "58mm"];
    case "proforma":
      return ["A4"];
    case "etiquette":
      return LABEL_PAPERS;
  }
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === "number" && Number.isInteger(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

/**
 * Fusionne un partiel (import JSON, brouillon UI) sur les défauts d'usine :
 * bornes + cohérence, jamais de throw (les rejets durs vivent en Zod côté main).
 */
export function mergeTemplateSettings(
  docType: TemplateDocType,
  partial: Partial<TemplateSettings>,
): TemplateSettings {
  const base = factorySettings(docType);
  const candidate = partial.paper;
  const paper: TemplatePaper =
    candidate != null && allowedPapers(docType).includes(candidate) ? candidate : base.paper;
  const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
  const text = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
  return {
    paper,
    copies: clampInt(partial.copies, 1, 5, base.copies),
    marginMm: clampInt(partial.marginMm, 5, 25, base.marginMm),
    thermalFontPx: clampInt(partial.thermalFontPx, 9, 14, base.thermalFontPx),
    logoSize:
      partial.logoSize === "S" || partial.logoSize === "M" || partial.logoSize === "L"
        ? partial.logoSize
        : base.logoSize,
    showLogo: bool(partial.showLogo, base.showLogo),
    showIdentity: bool(partial.showIdentity, base.showIdentity),
    showTva: bool(partial.showTva, base.showTva),
    showDiscountZero: bool(partial.showDiscountZero, base.showDiscountZero),
    showQr: bool(partial.showQr, base.showQr),
    showCodes: bool(partial.showCodes, base.showCodes),
    showSignatures: bool(partial.showSignatures, base.showSignatures),
    showWatermark: bool(partial.showWatermark, base.showWatermark),
    watermarkText: text(partial.watermarkText, 60),
    headerText: text(partial.headerText, 200),
    footerText: text(partial.footerText, 300),
  };
}

/** Version suivante (compteur monotone, jamais de retour en arrière). */
export function nextTemplateVersion(current: number): number {
  return Number.isSafeInteger(current) && current >= 1 ? current + 1 : 1;
}
