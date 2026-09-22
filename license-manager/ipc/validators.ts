// Veloria License Manager — Validateurs Zod (frontière renderer Mutual).
import { z } from "zod";

const fingerprint = z
  .string()
  .regex(/^[a-f0-9]{64}$/i, "Empreinte matérielle invalide (64 hex attendus).");

const edition = z.enum(["basic", "standard", "professional", "pro", "enterprise", "custom"]);

const plan = z.enum(["BASIC", "STANDARD", "PRO", "ENTERPRISE", "CUSTOM"]);

const FEATURE_IDS = [
  "receipt-80mm",
  "invoice-a4",
  "automatic-backup",
  "restore-backup",
  "barcode-scanner",
  "ocr",
  "excel-export",
  "pdf-export",
  "debt-management",
  "partial-payments",
  "returns",
  "proformas",
  "advanced-reports",
  "multi-printer",
] as const;

const features = z.array(z.enum(FEATURE_IDS)).max(32).default([]);

// P7: ré-émission exige ≥1 feature (jamais de wipe accidentel).
const featuresNonEmpty = z
  .array(z.enum(FEATURE_IDS))
  .min(1, "Au moins une fonction requise.")
  .max(32);

const PAGE_IDS = [
  "dashboard",
  "sales",
  "products",
  "stock",
  "customers",
  "suppliers",
  "debts",
  "expenses",
  "returns",
  "history",
  "reports",
  "pain",
  "breadOrders",
  "proformas",
  "invoices",
  "zakat",
  "settings",
] as const;

const pages = z.record(z.enum(PAGE_IDS), z.boolean()).optional();

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date AAAA-MM-JJ attendue.");

export const licenseCreateSchema = z
  .object({
    customerRef: z.string().min(2).max(120),
    clientId: z.string().max(80).nullable().optional(),
    clientName: z.string().max(120).nullable().optional(),
    storeName: z.string().max(120).nullable().optional(),
    edition,
    plan: plan.nullable().optional(),
    licenseType: z.enum(["term", "lifetime"]),
    licenseStatus: z.enum(["active", "suspended", "revoked"]).nullable().optional(),
    deviceBinding: z.boolean().default(true),
    maxDevices: z.number().int().min(1).max(99).nullable().optional(),
    durationMonths: z.number().int().min(1).max(120).nullable().optional(),
    startsAt: dateStr.nullable().optional(),
    expiresAt: dateStr.nullable().optional(),
    hardwareFingerprint: fingerprint,
    features,
    pages,
    notes: z.string().max(1000).nullable().optional(),
  })
  .refine(
    (v) =>
      v.licenseType === "lifetime" ||
      v.durationMonths != null ||
      (v.startsAt != null && v.expiresAt != null),
    { message: "Durée, période personnalisée ou type lifetime requis." },
  );

export const licenseIdSchema = z.object({ id: z.number().int().positive() });

export const licenseRenewSchema = z
  .object({
    id: z.number().int().positive(),
    licenseType: z.enum(["term", "lifetime"]),
    durationMonths: z.number().int().min(1).max(120).nullable().optional(),
    expiresAt: dateStr.nullable().optional(),
  })
  // P7: un renouvellement `term` exige une fin explicite (durée OU date),
  // sinon le manager émettrait un term sans expiresAt (rejeté comme
  // CORRUPTED côté POS après signature).
  .refine((v) => v.licenseType === "lifetime" || v.durationMonths != null || v.expiresAt != null, {
    message: "Renouvellement term : durée ou date de fin requise.",
  });

export const licenseTransferSchema = z.object({
  id: z.number().int().positive(),
  newFingerprint: fingerprint,
  reason: z.string().max(500).default(""),
});

export const licenseCapabilitiesSchema = z.object({
  id: z.number().int().positive(),
  // P7: `features: []` effacerait toutes les capabilities par accident
  // (ré-émission signée). Au moins 1 feature requise explicitement.
  features: featuresNonEmpty,
  // Licences legacy sans pages (pages_json NULL) : null accepté (conservé).
  pages: pages.nullable().optional(),
});

export const licenseStatusSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["active", "suspended", "revoked"]),
});
