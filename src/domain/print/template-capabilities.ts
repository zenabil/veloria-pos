// Veloria PoS — Domain : capacités des modèles d'impression (Print Studio).
// Pur, framework-free. Une seule question ici : QUELS réglages ont un sens
// pour un type de document ?
//   — la TVA n'existe pas sur un reçu de règlement ni sur une étiquette ;
//   — les articles/prix n'existent pas sur un reçu de règlement ;
//   — le nom du produit et le prix sont des réglages d'étiquette ;
//   — l'identité légale (RC/NIF/NIS) n'a pas sa place sur une étiquette.
// La matrice est LA source de vérité : l'UI n'affiche que l'applicable et la
// fusion neutralise le reste (un modèle legacy ne peut pas ressusciter un
// réglage hors sujet ni changer un rendu par surprise).

import type { TemplateDocType, TemplateSettings, TemplateSettingValue } from "./template-rules.ts";

/** Clés de réglage d'un modèle — ordre = ordre d'affichage du Studio. */
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

/** Socle commun : papier (par type), exemplaires, QR. */
const COMMON: readonly TemplateSettingKey[] = ["paper", "copies", "showQr"];
/** Thermique rouleau : la police se règle, les marges A4 n'existent pas. */
const THERMAL: readonly TemplateSettingKey[] = [...COMMON, "thermalFontPx"];
/** En-tête de document : logo, identité légale, note, pied de page. */
const HEAD: readonly TemplateSettingKey[] = [
  "logoSize",
  "showLogo",
  "showIdentity",
  "headerText",
  "footerText",
];
/** Mentions de fin : signatures + filigrane (jamais sur étiquette). */
const COLOPHON: readonly TemplateSettingKey[] = [
  "showSignatures",
  "showWatermark",
  "watermarkText",
];

const MATRIX: Record<TemplateDocType, readonly TemplateSettingKey[]> = {
  // Vente : articles, montants, TVA, codes, signatures.
  ticket: [...THERMAL, ...HEAD, "showTva", "showCodes", ...COLOPHON],
  // Devis : seul A4 — marges, remise nulle masquable, filigrane, signatures.
  proforma: [
    ...COMMON,
    "marginMm",
    ...HEAD,
    "showTva",
    "showDiscountZero",
    "showCodes",
    ...COLOPHON,
  ],
  // Bon de livraison : quantités (prix masquables) — jamais de TVA.
  bon_livraison: [...THERMAL, ...HEAD, "showPrice", "showCodes", ...COLOPHON],
  // Reçu de règlement : montant + soldes — ni articles, ni TVA, ni remise.
  recu: [...THERMAL, ...HEAD, "showCodes", ...COLOPHON],
  // Bon de retour : remboursement — TVA applicable, filigrane, signatures.
  avoir: [...THERMAL, ...HEAD, "showTva", "showCodes", ...COLOPHON],
  // Étiquettes : nom/prix/QR — ni logo, ni identité, ni signatures.
  etiquette: [...COMMON, "showPrice", "showProductName"],
};

/** Réglages qui ont un sens pour ce type (ordre d'affichage inclus). */
export function applicableSettings(docType: TemplateDocType): readonly TemplateSettingKey[] {
  return MATRIX[docType];
}

/** Ce réglage est-il applicable à ce type de document ? */
export function isTemplateSettingApplicable(
  docType: TemplateDocType,
  key: TemplateSettingKey,
): boolean {
  return MATRIX[docType].includes(key);
}

/**
 * Valeur neutre d'un réglage hors sujet : « éteint » pour une capacité
 * additive (logo, identité, en-tête, pied, filigrane, signatures, nom de
 * produit) ; défaut de mise en page pour un réglage de forme. La fusion y
 * retombe toujours — jamais de résidu d'un autre type dans un document.
 */
export const NEUTRAL_SETTING_VALUES: Readonly<
  Partial<Record<TemplateSettingKey, TemplateSettingValue>>
> = {
  marginMm: 15,
  thermalFontPx: 12,
  logoSize: "M",
  showLogo: false,
  showIdentity: false,
  headerText: "",
  showTva: false,
  // Prix et remise nulle : masquages « off » (défauts du rendu historique).
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
 * Réglage effectif : la valeur demandée si applicable, la valeur neutre sinon.
 * Point unique utilisé par la fusion domaine (le miroir main applique la même
 * règle — parité testée).
 */
export function applicableSettingValue<K extends TemplateSettingKey>(
  docType: TemplateDocType,
  key: K,
  value: TemplateSettings[K],
): TemplateSettings[K] {
  if (isTemplateSettingApplicable(docType, key)) return value;
  const neutral = NEUTRAL_SETTING_VALUES[key] as TemplateSettings[K] | undefined;
  return neutral ?? value;
}
