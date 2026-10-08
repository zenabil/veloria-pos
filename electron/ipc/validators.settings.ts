// Veloria PoS - Zod: reglages + base (extrait de validators.ts, deplacement pur).

import { z } from "zod";
import { moneyMinor, quantityNonNegative } from "./validators.common";
import { optionalOperationId } from "./validators.common";

export const settingsGetSchema = z.object({
  key: z.enum([
    "inventory",
    "sales",
    "invoice",
    "printing",
    "products",
    "customers",
    "suppliers",
    "sound",
  ]),
});

export const inventorySettingsSchema = z.object({
  allowNegativeStock: z.boolean(),
  defaultMinStock: quantityNonNegative.default(0),
});

export const salesSettingsSchema = z.object({
  defaultPaymentMethod: z.enum(["cash", "cheque", "transfer"]).default("cash"),
  allowCreditSales: z.boolean().default(true),
  autoPrintInvoice: z.boolean().default(false),
});

export const invoiceSettingsSchema = z
  .object({
    showLogo: z.boolean().default(true),
    showCustomerBalance: z.boolean().default(true),
    showPreviousBalance: z.boolean().default(true),
    footerText: z.string().max(300).default(""),
    thankYouMessage: z.string().max(200).default(""),
    tvaRatePercent: z.number().min(0).max(100).default(0),
    sellerDefault: z.string().max(100).default(""),
    // Aliases historiques renderer (vatRate/defaultSeller) �?" normalisés côté
    // repo/service vers les clés canoniques ci-dessus (compat anciennes bases).
    vatRate: z.number().min(0).max(100).nullable().optional(),
    defaultSeller: z.string().max(100).nullable().optional(),
  })
  .transform((v) => ({
    showLogo: v.showLogo,
    showCustomerBalance: v.showCustomerBalance,
    showPreviousBalance: v.showPreviousBalance,
    footerText: v.footerText,
    thankYouMessage: v.thankYouMessage,
    tvaRatePercent:
      typeof v.tvaRatePercent === "number" && v.tvaRatePercent !== 0
        ? v.tvaRatePercent
        : typeof v.vatRate === "number"
          ? v.vatRate
          : 0,
    sellerDefault: v.sellerDefault !== "" ? v.sellerDefault : (v.defaultSeller ?? ""),
  }));

export const printingSettingsSchema = z.object({
  silent: z.boolean().default(true),
  thermalWidth: z.enum(["58mm", "80mm"]).default("80mm"),
});

export const productsSettingsSchema = z.object({
  defaultUnit: z.string().max(20).default("PIECE"),
});

export const customersSettingsSchema = z.object({
  defaultCreditLimitMinor: moneyMinor.default(0),
});

export const suppliersSettingsSchema = z.object({
  defaultPaymentMethod: z.enum(["cash", "cheque", "transfer"]).default("cash"),
});

// P5 : sons d'interface (WebAudio, aucun asset).
export const soundSettingsSchema = z.object({
  enabled: z.boolean().default(true),
});

export const settingsSaveSchema = z.discriminatedUnion("key", [
  z.object({
    key: z.literal("inventory"),
    value: inventorySettingsSchema,
    operationId: optionalOperationId,
  }),
  z.object({
    key: z.literal("sales"),
    value: salesSettingsSchema,
    operationId: optionalOperationId,
  }),
  z.object({
    key: z.literal("invoice"),
    value: invoiceSettingsSchema,
    operationId: optionalOperationId,
  }),
  z.object({
    key: z.literal("printing"),
    value: printingSettingsSchema,
    operationId: optionalOperationId,
  }),
  z.object({
    key: z.literal("products"),
    value: productsSettingsSchema,
    operationId: optionalOperationId,
  }),
  z.object({
    key: z.literal("customers"),
    value: customersSettingsSchema,
    operationId: optionalOperationId,
  }),
  z.object({
    key: z.literal("suppliers"),
    value: suppliersSettingsSchema,
    operationId: optionalOperationId,
  }),
  z.object({
    key: z.literal("sound"),
    value: soundSettingsSchema,
    operationId: optionalOperationId,
  }),
]);

export const relocateSchema = z.object({
  folder: z.string().min(1).max(500),
  operationId: optionalOperationId,
});

// Réinitialisation d'usine (zone dangereuse) : preuve de confirmation
// LITT�?RALE tapée par l'opérateur + operationId d'appelant (rejouabilité
// sûre : un second appel retrouve la base déjà vide sans tout casser).
// L'UI exige en plus une confirmation tapée identique côté renderer.
export const databaseResetSchema = z.object({
  confirmation: z.literal("REINITIALISER"),
  operationId: z.string().uuid(),
});
