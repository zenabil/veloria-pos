// Veloria PoS — Electron : capacités des modèles d'impression (miroir main).
// MIROIR de `src/domain/print/template-capabilities.ts` (le main n'importe pas
// src/) : toute modification ici doit être répercutée là-bas — parité testée
// (tests/unit/printing/split-parity.test.ts).
//
// Une seule question : quels réglages ont un sens par type de document ?
//   — TVA : absente d'un reçu de règlement, d'un bon de livraison, d'une
//     étiquette ;
//   — articles/remise : absents d'un reçu de règlement ;
//   — nom du produit / prix : réglages d'étiquette (prix aussi livraison) ;
//   — identité légale et logo : jamais sur une étiquette.
// Un réglage hors sujet retombe sur sa valeur neutre (jamais de résidu).

import type { ParsedTemplateSettings } from "../ipc/validators.templates";

export const TEMPLATE_SETTING_KEYS = [
  "paper",
  "copies",
  "marginMm",
  "thermalFontPx",
  "logoSize",
  "showLogo",
  "showIdentity",
  "headerText",
  "showTva",
  "showPrice",
  "showDiscountZero",
  "showQr",
  "showCodes",
  "showProductName",
  "showSignatures",
  "showWatermark",
  "watermarkText",
  "footerText",
] as const;

export type TemplateSettingKey = (typeof TEMPLATE_SETTING_KEYS)[number];

const COMMON: readonly TemplateSettingKey[] = ["paper", "copies", "showQr"];
const THERMAL: readonly TemplateSettingKey[] = [...COMMON, "thermalFontPx"];
const HEAD: readonly TemplateSettingKey[] = [
  "logoSize",
  "showLogo",
  "showIdentity",
  "headerText",
  "footerText",
];
const COLOPHON: readonly TemplateSettingKey[] = [
  "showSignatures",
  "showWatermark",
  "watermarkText",
];

const MATRIX: Record<string, readonly TemplateSettingKey[]> = {
  ticket: [...THERMAL, ...HEAD, "showTva", "showCodes", ...COLOPHON],
  proforma: [
    ...COMMON,
    "marginMm",
    ...HEAD,
    "showTva",
    "showDiscountZero",
    "showCodes",
    ...COLOPHON,
  ],
  bon_livraison: [...THERMAL, ...HEAD, "showPrice", "showCodes", ...COLOPHON],
  recu: [...THERMAL, ...HEAD, "showCodes", ...COLOPHON],
  avoir: [...THERMAL, ...HEAD, "showTva", "showCodes", ...COLOPHON],
  etiquette: [...COMMON, "showPrice", "showProductName"],
};

export function templateSettingsApplicable(docType: string, key: TemplateSettingKey): boolean {
  const caps = MATRIX[docType];
  return caps !== undefined && caps.includes(key);
}

/** Valeur neutre d'un réglage hors sujet (miroir domaine, « off »). */
const NEUTRAL: Readonly<Partial<Record<TemplateSettingKey, unknown>>> = {
  marginMm: 15,
  thermalFontPx: 12,
  logoSize: "M",
  showLogo: false,
  showIdentity: false,
  headerText: "",
  showTva: false,
  showPrice: true,
  showDiscountZero: true,
  showCodes: true,
  showProductName: false,
  showSignatures: false,
  showWatermark: false,
  watermarkText: "",
  footerText: "",
};

/**
 * Applique la matrice : tout réglage non applicable du type reçoit sa valeur
 * neutre. `paper` reste au repli calculé par l'appelant (papiers par type).
 */
export function neutralizeForDocType(
  docType: string,
  settings: ParsedTemplateSettings,
): ParsedTemplateSettings {
  const out: Record<string, unknown> = { ...settings };
  for (const key of TEMPLATE_SETTING_KEYS) {
    if (templateSettingsApplicable(docType, key)) continue;
    const neutral = NEUTRAL[key];
    if (neutral !== undefined) out[key] = neutral;
  }
  return out as ParsedTemplateSettings;
}

/**
 * Défauts d'usine par type — MIROIR de `factorySettings` (domaine) : Zod ne
 * connaît pas le type, donc la fusion main doit poser les mêmes écarts quand
 * la clé est absente du JSON. Les capacités rendues par C6-bis sur les
 * documents thermiques (logo, identité là où elle n'était pas imprimée,
 * signatures) démarrent éteintes : un modèle existant garde son rendu.
 */
export function factorySettingsMirror(docType: string): Partial<ParsedTemplateSettings> {
  switch (docType) {
    case "etiquette":
      return { showQr: false, showProductName: false };
    // Vente : identité déjà imprimée ; seuls logo/signatures sont opt-in.
    case "ticket":
      return { showLogo: false, showSignatures: false };
    case "recu":
    case "avoir":
    case "bon_livraison":
      return { showLogo: false, showIdentity: false, showSignatures: false };
    default:
      return {};
  }
}
