// Veloria PoS - Zod: depenses + societe + rapports + dettes + clotures + zakat (extrait de validators.ts, deplacement pur).

import { z } from "zod";
import { moneyMinor, moneyMinorPositive } from "./validators.common";
import { businessDate } from "./validators.common";
import { optionalOperationId } from "./validators.common";

export const recordPaymentSchema = z
  .object({
    operationId: z.string().uuid(),
    customerId: z.number().int().positive().nullable().optional(),
    saleId: z.number().int().positive().nullable().optional(),
    amountMinor: moneyMinorPositive,
    method: z.enum(["cash", "cheque", "transfer"]),
    reference: z.string().max(100).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    paymentDate: businessDate.nullable().optional(),
  })
  // A1-P0 : paiement orphelin (ni client ni vente) refusé à la frontière.
  .superRefine((v, ctx) => {
    if (v.customerId == null && v.saleId == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Client ou vente requis pour le paiement.",
        path: ["customerId"],
      });
    }
  });

export const expenseCreateSchema = z.object({
  operationId: z.string().uuid(),
  description: z.string().min(2).max(300),
  category: z.string().min(1).max(100),
  amountMinor: moneyMinorPositive,
  expenseDate: businessDate,
  supplierId: z.number().int().positive().nullable().optional(),
  paymentMethod: z.enum(["cash", "cheque", "transfer"]).nullable().optional(),
  status: z.enum(["paid", "pending"]).default("paid"),
  reference: z.string().max(100).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const expenseListSchema = z.object({
  query: z.string().max(200).default(""),
  category: z.string().max(100).nullable().optional(),
  statusFilter: z.enum(["all", "paid", "pending"]).default("all"),
  methodFilter: z.enum(["all", "cash", "cheque", "transfer"]).default("all"),
  from: businessDate.nullable().optional(),
  to: businessDate.nullable().optional(),
  sort: z.enum(["date_desc", "date_asc", "amount_desc", "amount_asc"]).default("date_desc"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

// Phase 6 �?" stock / fournisseurs

export const historyListSchema = z.object({
  query: z.string().max(200).default(""),
  op: z
    .enum([
      "all",
      "sale",
      "purchase",
      "payment_in",
      "payment_out",
      "stock_in",
      "stock_out",
      "stock_correct",
      "stock_inventory",
      "product_create",
      "product_update",
      "product_delete",
      "customer_create",
      "customer_update",
      "customer_delete",
      "supplier_create",
      "supplier_update",
      "supplier_delete",
    ])
    .default("all"),
  user: z.enum(["all", "caisse"]).default("all"),
  from: businessDate.nullable().optional(),
  to: businessDate.nullable().optional(),
  sort: z.enum(["date_desc", "date_asc", "amount_desc", "amount_asc"]).default("date_desc"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export const historyDetailSchema = z.object({
  kind: z.enum([
    "sale",
    "purchase",
    "payment_in",
    "payment_out",
    "stock_in",
    "stock_out",
    "stock_correct",
    "stock_inventory",
    "product_create",
    "product_update",
    "product_delete",
    "customer_create",
    "customer_update",
    "customer_delete",
    "supplier_create",
    "supplier_update",
    "supplier_delete",
  ]),
  id: z.number().int().positive(),
});

export const historyStatsSchema = z.object({
  from: businessDate.nullable().optional(),
  to: businessDate.nullable().optional(),
});

// Rapports (agrégats + impression générique).
export const reportSummarySchema = z.object({
  from: businessDate,
  to: businessDate,
  customerId: z.number().int().positive().nullable().optional(),
  supplierId: z.number().int().positive().nullable().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
});

export const dashboardSummarySchema = z.object({
  from: businessDate,
  to: businessDate,
});

export const reportPayloadSchema = z.object({
  title: z.string().min(2).max(120),
  period: z.string().max(100).default(""),
  company: z.string().max(200).default("Veloria"),
  kpis: z
    .array(z.object({ label: z.string().max(80), value: z.string().max(80) }))
    .max(12)
    .default([]),
  charts: z
    .array(
      z.object({
        title: z.string().max(80),
        labels: z.array(z.string().max(20)).max(62),
        values: z.array(z.number().min(0).max(1_000_000_000_000)).max(62),
      }),
    )
    .max(4)
    .default([]),
  tables: z
    .array(
      z.object({
        title: z.string().max(80),
        headers: z.array(z.string().max(40)).min(1).max(8),
        rows: z.array(z.array(z.string().max(120)).max(8)).max(200),
      }),
    )
    .max(10)
    .default([]),
  footer: z.string().max(300).default(""),
});

export const debtsListSchema = z.object({
  query: z.string().max(200).default(""),
  typeFilter: z.enum(["all", "customer", "supplier"]).default("all"),
  statusFilter: z.enum(["all", "overdue", "due"]).default("all"),
  dueFilter: z.enum(["all", "today", "overdue", "upcoming"]).default("all"),
  settleFilter: z.enum(["all", "watch", "overdue", "soon"]).default("all"),
  sort: z.enum(["due_asc", "remaining_desc", "date_desc"]).default("due_asc"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

export const debtTargetSchema = z.object({
  debtType: z.enum(["customer", "supplier"]),
  id: z.number().int().positive(),
});

export const saleDueDateSchema = z.object({
  id: z.number().int().positive(),
  dueDate: businessDate.nullable().optional(),
  operationId: optionalOperationId,
});

export const periodSchema = z.object({
  from: businessDate,
  to: businessDate,
});

export const closingCreateSchema = z.object({
  operationId: z.string().uuid(),
  businessDate,
  openingMinor: moneyMinor.default(0),
});

export const zakatParamsSchema = z.object({
  ratePercent: z.number().min(0.1).max(100).default(2.5),
  nisabMinor: moneyMinor.default(0),
  hawlDate: businessDate.nullable().optional(),
  nisabMethod: z.enum(["gold", "silver", "other"]).default("gold"),
  operationId: optionalOperationId,
});

export const zakatCalculationSchema = z.object({
  operationId: z.string().uuid(),
  hijriYear: z.string().min(4).max(10),
  calcDate: businessDate,
  cashMinor: moneyMinor.default(0),
  bankMinor: moneyMinor.default(0),
  stockMinor: moneyMinor.default(0),
  receivablesMinor: moneyMinor.default(0),
  otherMinor: moneyMinor.default(0),
  liabilitiesMinor: moneyMinor.default(0),
  nisabMinor: moneyMinor.default(0),
  ratePercent: z.number().min(0.1).max(100).default(2.5),
  notes: z.string().max(500).nullable().optional(),
});

// P3 : bons de commande fournisseurs (cycle draft �?' ordered �?' �?� �?' received).

export const closingsListSchema = periodSchema;

// Import CSV (lignes déjà validées côté renderer, re-validées côté main)

export const companyUpdateSchema = z.object({
  operationId: optionalOperationId,
  company_name: z.string().min(1).max(200).nullable().optional(),
  commercial_name: z.string().max(200).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().max(100).nullable().optional(),
  website: z.string().max(100).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  tax_number: z.string().max(50).nullable().optional(),
  commercial_register: z.string().max(50).nullable().optional(),
  /** C5 : NIS + article d'imposition (migration 0035, facture DZ). */
  nis: z.string().max(50).nullable().optional(),
  article_imposition: z.string().max(50).nullable().optional(),
  invoice_prefix: z.string().max(10).nullable().optional(),
  logo_path: z.string().max(500).nullable().optional(),
});

export const expenseUpdateSchema = expenseCreateSchema
  // M-3 RADICAL: operationId optionnel honoré (voir productUpdate).
  .omit({ operationId: true })
  .extend({
    id: z.number().int().positive(),
    operationId: optionalOperationId,
  });

// P18: suppression idempotente quand le client fournit operationId
// (double-clic/retry) ; sans operationId, comportement historique.
export const expenseDeleteSchema = z.object({
  id: z.number().int().positive(),
  operationId: z.string().uuid().nullable().optional(),
});
