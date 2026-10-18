// Veloria PoS - Zod: retours + proformas + pain (extrait de validators.ts, deplacement pur).

import { z } from "zod";
import { moneyMinor, moneyMinorPositive } from "./validators.common";
import { businessDate, paginationSchema } from "./validators.common";
import { quantity } from "./validators.common";
import { optionalOperationId } from "./validators.common";

export const returnCreateSchema = z.object({
  operationId: z.string().uuid(),
  kind: z.enum(["customer", "supplier"]),
  saleId: z.number().int().positive().nullable().optional(),
  intakeId: z.number().int().positive().nullable().optional(),
  items: z
    .array(
      z.object({
        productId: z.number().int().nullable(),
        quantity,
        restocked: z.boolean().default(true),
        condition: z.enum(["good", "defective"]).default("good"),
      }),
    )
    .min(1)
    .max(200),
  refundMinor: moneyMinor.default(0),
  creditMinor: moneyMinor.default(0),
  refundMethod: z.enum(["cash", "cheque", "transfer"]).nullable().optional(),
  reason: z.string().min(2).max(300),
  notes: z.string().max(500).nullable().optional(),
  returnDate: businessDate.nullable().optional(),
});

export const returnListSchema = z.object({
  query: z.string().max(200).default(""),
  typeFilter: z.enum(["all", "customer", "supplier"]).default("all"),
  statusFilter: z
    .enum(["all", "validated", "partially_refunded", "refunded", "cancelled"])
    .default("all"),
  from: businessDate.nullable().optional(),
  to: businessDate.nullable().optional(),
  sort: z.enum(["date_desc", "date_asc", "amount_desc", "amount_asc"]).default("date_desc"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

export const returnTargetSchema = z.object({
  kind: z.enum(["customer", "supplier"]),
  id: z.number().int().positive(),
});

export const returnRefundSchema = returnTargetSchema.extend({
  operationId: z.string().uuid(),
  amountMinor: moneyMinorPositive,
  method: z.enum(["cash", "cheque", "transfer"]),
});

export const returnCancelSchema = returnTargetSchema.extend({
  operationId: z.string().uuid(),
});

export const proformaCreateSchema = z.object({
  operationId: z.string().uuid(),
  customerId: z.number().int().positive().nullable().optional(),
  lines: z
    .array(
      z.object({
        productId: z.number().int().positive().nullable(),
        productName: z.string().min(1).max(200),
        unitPriceMinor: moneyMinor,
        quantity,
      }),
    )
    .min(1)
    .max(200),
  discountMinor: moneyMinor.default(0),
  deliveryMinor: moneyMinor.default(0),
  dueDate: businessDate.nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  terms: z.string().max(2000).nullable().optional(),
});

export const proformaStatusSchema = z.object({
  id: z.number().int().positive(),
  to: z.enum(["sent", "converted", "cancelled"]),
  operationId: optionalOperationId,
});

export const proformaConvertSchema = z.object({
  operationId: z.string().uuid(),
  proformaId: z.number().int().positive(),
  amountPaidMinor: moneyMinor,
  paymentMethod: z.enum(["cash", "cheque", "transfer"]).nullable().optional(),
});

// Phase 8 �?" finance

export const proformaListSchema = paginationSchema.extend({
  status: z.enum(["draft", "sent", "converted", "cancelled"]).nullable().optional(),
  query: z.string().max(200).default(""),
  customerId: z.number().int().positive().nullable().optional(),
  from: businessDate.nullable().optional(),
  to: businessDate.nullable().optional(),
  sort: z.enum(["date_desc", "date_asc", "amount_desc", "amount_asc"]).default("date_desc"),
});

export const proformaUpdateSchema = z.object({
  id: z.number().int().positive(),
  operationId: optionalOperationId,
  customerId: z.number().int().positive().nullable().optional(),
  lines: z
    .array(
      z.object({
        productId: z.number().int().positive().nullable(),
        productName: z.string().min(1).max(200),
        unitPriceMinor: moneyMinor,
        quantity,
      }),
    )
    .min(1)
    .max(200),
  discountMinor: moneyMinor.default(0),
  deliveryMinor: moneyMinor.default(0),
  dueDate: businessDate.nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  terms: z.string().max(2000).nullable().optional(),
});
