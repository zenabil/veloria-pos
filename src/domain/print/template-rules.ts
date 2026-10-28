// Veloria PoS — Domain: modèles d'impression (Print Studio, C6).
// Pur, framework-free. Les réglages vivent en SQLite (migration 0036) ;
// ce module porte les défauts, la fusion et les règles de cohérence.
// Volontairement SANS couleurs ni polices : le N&B strict est un invariant
// P0 testé (imprimantes thermiques + lisibilité fiscale).

// Politique stricte opération → format (règle métier) :
//   vente / règlement / retour / livraison / bon de commande → ticket 80 ou 58 ;
//   devis (proforma) → A4 uniquement ;
//   étiquettes → gabarits thermiques, jamais A4.
// Quels réglages ont un sens par type : voir `template-capabilities.ts`
// (matrice unique, appliquée ici à la fusion).

import { applicableSettingValue } from "./template-capabilities.ts";
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
  /** Étiquettes : nom du produit (opt-in, petits gabarits). */
  showProductName: boolean;
  /** Étiquettes + bon de livraison : prix affiché (false = quantités seules). */
  showPrice: boolean;
}

/** Valeur d'un réglage (union de tous les types de réglages). */
export type TemplateSettingValue = TemplateSettings[keyof TemplateSettings];

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
  showProductName: false,
  showPrice: true,
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

/**
 * Réglages d'usine d'un type (fusionnés sur les défauts de base).
 * Les capacités nouvellement rendues sur les documents thermiques (logo,
 * signatures) démarrent ÉTEINTES : un modèle existant garde exactement le
 * rendu d'avant l'ouverture du réglage — l'opérateur l'active à la demande.
 */
export function factorySettings(docType: TemplateDocType): TemplateSettings {
  const base = { ...BASE_DEFAULTS, paper: defaultPaperFor(docType) };
  switch (docType) {
    // Étiquettes : QR opt-in, nom du produit opt-in (petits gabarits).
    case "etiquette":
      return { ...base, showQr: false, showProductName: false };
    // Vente : l'identité légale est déjà imprimée — seuls le logo et les
    // signatures sont nouveaux → opt-in.
    case "ticket":
      return { ...base, showLogo: false, showSignatures: false };
    // Règlement / retour / livraison : identité, logo et signatures ne
    // sortaient pas sur ces documents → tout est opt-in (rendu préservé).
    case "recu":
    case "avoir":
    case "bon_livraison":
      return { ...base, showLogo: false, showIdentity: false, showSignatures: false };
    // Devis A4 : rendu historique (logo + signatures déjà imprimés).
    case "proforma":
      return base;
  }
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
 * bornes + cohérence + capacités du type (un réglage hors sujet retombe sur
 * sa valeur neutre), jamais de throw (les rejets durs vivent en Zod côté main).
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
  const keep = applicableSettingValue;
  return {
    paper,
    copies: clampInt(partial.copies, 1, 5, base.copies),
    marginMm: keep(docType, "marginMm", clampInt(partial.marginMm, 5, 25, base.marginMm)),
    thermalFontPx: keep(
      docType,
      "thermalFontPx",
      clampInt(partial.thermalFontPx, 9, 14, base.thermalFontPx),
    ),
    logoSize: keep(
      docType,
      "logoSize",
      partial.logoSize === "S" || partial.logoSize === "M" || partial.logoSize === "L"
        ? partial.logoSize
        : base.logoSize,
    ),
    showLogo: keep(docType, "showLogo", bool(partial.showLogo, base.showLogo)),
    showIdentity: keep(docType, "showIdentity", bool(partial.showIdentity, base.showIdentity)),
    showTva: keep(docType, "showTva", bool(partial.showTva, base.showTva)),
    showDiscountZero: keep(
      docType,
      "showDiscountZero",
      bool(partial.showDiscountZero, base.showDiscountZero),
    ),
    showQr: bool(partial.showQr, base.showQr),
    showCodes: keep(docType, "showCodes", bool(partial.showCodes, base.showCodes)),
    showSignatures: keep(
      docType,
      "showSignatures",
      bool(partial.showSignatures, base.showSignatures),
    ),
    showWatermark: keep(docType, "showWatermark", bool(partial.showWatermark, base.showWatermark)),
    watermarkText: keep(docType, "watermarkText", text(partial.watermarkText, 60)),
    headerText: keep(docType, "headerText", text(partial.headerText, 200)),
    footerText: keep(docType, "footerText", text(partial.footerText, 300)),
    showProductName: keep(
      docType,
      "showProductName",
      bool(partial.showProductName, base.showProductName),
    ),
    showPrice: keep(docType, "showPrice", bool(partial.showPrice, base.showPrice)),
  };
}
