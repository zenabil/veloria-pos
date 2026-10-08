// Veloria PoS - Zod: modeles print studio (extrait de validators.ts, deplacement pur).

import { z } from "zod";
import { printFormatSchema } from "./validators.print";

export const paymentTicketFormatSchema = printFormatSchema;

// ---------------------------------------------------------------------------
// C6 : Print Studio �?" modèles d'impression (migration 0036, SQLite).
// Un modèle par (type, nom), un seul actif par type (UNIQUE partiel).
// N&B strict conservé (pas de couleurs/polices : invariant P0 testé).
// ---------------------------------------------------------------------------

export const templateDocTypeSchema = z.enum([
  "facture",
  "ticket",
  "proforma",
  "bon_livraison",
  "recu",
  "avoir",
  "etiquette",
]);

export const templatePaperSchema = z.enum(["A4", "A5", "80mm", "58mm"]);

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
});

export const templateGetSchema = z.object({
  docType: templateDocTypeSchema,
});

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
  format: printFormatSchema,
});

export const templateTestPrintSchema = z.object({
  operationId: z.string().uuid(),
  docType: templateDocTypeSchema,
  templateId: z.number().int().positive().nullable().optional(),
});
