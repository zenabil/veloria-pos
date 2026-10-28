// Veloria PoS - Zod: modeles print studio (extrait de validators.ts, deplacement pur).

import { z } from "zod";

// ---------------------------------------------------------------------------
// C6 : Print Studio — modèles d'impression (migration 0036, SQLite).
// Un modèle par (type, nom), un seul actif par type (UNIQUE partiel).
// N&B strict conservé (pas de couleurs/polices : invariant P0 testé).
// Politique opération → format : ticket pour vente/retour/livraison/reçu,
// A4 pour le devis uniquement, gabarits thermiques pour les étiquettes.
// ---------------------------------------------------------------------------

export const templateDocTypeSchema = z.enum([
  "ticket",
  "proforma",
  "bon_livraison",
  "recu",
  "avoir",
  "etiquette",
]);

export const templatePaperSchema = z.enum([
  "A4",
  "80mm",
  "58mm",
  "30x20",
  "45x20",
  "50x30",
  "58x30",
  "58x40",
]);

export const templateSettingsSchema = z.object({
  paper: templatePaperSchema.default("A4"),
  copies: z.number().int().min(1).max(5).default(1),
  marginMm: z.number().int().min(5).max(25).default(15),
  thermalFontPx: z.number().int().min(9).max(14).default(12),
  logoSize: z.enum(["S", "M", "L"]).default("M"),
  showLogo: z.boolean().default(true),
  showIdentity: z.boolean().default(true),
  showTva: z.boolean().default(true),
  showDiscountZero: z.boolean().default(true),
  showQr: z.boolean().default(true),
  showCodes: z.boolean().default(true),
  showSignatures: z.boolean().default(true),
  showWatermark: z.boolean().default(false),
  watermarkText: z.string().max(60).default(""),
  headerText: z.string().max(200).default(""),
  footerText: z.string().max(300).default(""),
  // C6-bis : capacités propres aux étiquettes et au bon de livraison.
  showProductName: z.boolean().default(false),
  showPrice: z.boolean().default(true),
});

/** Réglages fusionnés côté main (capacités du type appliquées). */
export type ParsedTemplateSettings = z.infer<typeof templateSettingsSchema>;

export const templateSaveSchema = z.object({
  operationId: z.string().uuid(),
  id: z.number().int().positive().nullable().optional(),
  docType: templateDocTypeSchema,
  name: z.string().min(2).max(100),
  settings: templateSettingsSchema,
});

export const templateActivateSchema = z.object({
  operationId: z.string().uuid(),
  id: z.number().int().positive(),
});

export const templateRemoveSchema = z.object({
  operationId: z.string().uuid(),
  id: z.number().int().positive(),
});

export const templateResetSchema = z.object({
  operationId: z.string().uuid(),
  docType: templateDocTypeSchema.nullable().optional(),
});

export const templatePreviewSchema = z.object({
  docType: templateDocTypeSchema,
  settings: templateSettingsSchema,
});

export const templateTestPrintSchema = z.object({
  operationId: z.string().uuid(),
  docType: templateDocTypeSchema,
  templateId: z.number().int().positive().nullable().optional(),
});
