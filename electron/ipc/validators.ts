// Veloria PoS — IPC validators (Zod) at the main-process boundary.
// Every mutating command validates types, ranges, identifiers.

import { z } from "zod";

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export const productSearchSchema = z.object({
  query: z.string().max(200).default(""),
  categoryId: z.number().int().nullable().optional(),
  stockFilter: z.enum(["all", "in_stock", "low_stock", "out_of_stock"]).default("all"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

export const barcodeSchema = z.object({ barcode: z.string().min(1).max(64) });

export const productCreateSchema = z.object({
  name: z.string().min(2).max(200),
  categoryId: z.number().int().nullable().optional(),
  unitCode: z.string().max(20).default("PIECE"),
  purchasePriceMinor: z.number().int().min(0),
  sellingPriceMinor: z.number().int().min(0),
  quantity: z.number().min(0).max(1_000_000),
  minStockLevel: z.number().min(0).max(1_000_000).default(0),
  expirationDate: z.string().nullable().optional(),
  supplierId: z.number().int().nullable().optional(),
  barcodes: z.array(z.string().min(1).max(64)).max(20).default([]),
});

export const productUpdateSchema = productCreateSchema.extend({
  id: z.number().int().positive(),
});

export const customerCreateSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(30).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  creditLimitMinor: z.number().int().min(0).default(0),
  initialBalanceMinor: z.number().int().default(0),
  isBreadClient: z.boolean().default(false),
});

export const saleItemSchema = z.object({
  productId: z.number().int().nullable(),
  productName: z.string().min(1).max(200),
  unitCode: z.string().max(20).default("PIECE"),
  unitPriceMinor: z.number().int().min(0),
  purchasePriceMinor: z.number().int().min(0).default(0),
  quantity: z.number().positive().max(1_000_000),
});

export const saleCreateSchema = z.object({
  operationId: z.string().uuid(),
  customerId: z.number().int().nullable().optional(),
  lines: z.array(saleItemSchema).min(1).max(200),
  discountType: z.enum(["none", "percent", "amount"]).default("none"),
  discountValueMinor: z.number().min(0).default(0),
  deliveryFeeMinor: z.number().int().min(0).default(0),
  amountPaidMinor: z.number().int().min(0),
  paymentMethod: z.enum(["cash", "cheque", "transfer"]).nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

export const idSchema = z.object({ id: z.number().int().positive() });

export const recordPaymentSchema = z.object({
  customerId: z.number().int().positive().nullable().optional(),
  saleId: z.number().int().positive().nullable().optional(),
  amountMinor: z.number().int().positive(),
  method: z.enum(["cash", "cheque", "transfer"]),
  reference: z.string().max(100).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const returnCreateSchema = z.object({
  originalSaleId: z.number().int().positive(),
  items: z
    .array(
      z.object({
        productId: z.number().int().nullable(),
        quantity: z.number().positive(),
        restocked: z.boolean().default(true),
      }),
    )
    .min(1),
  refundMinor: z.number().int().min(0).default(0),
  creditMinor: z.number().int().min(0).default(0),
  reason: z.string().max(500).default(""),
});

export const expenseCreateSchema = z.object({
  description: z.string().min(2).max(300),
  category: z.string().min(1).max(100),
  amountMinor: z.number().int().positive(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Phase 6 — stock / fournisseurs
export const stockAdjustSchema = z.object({
  productId: z.number().int().positive(),
  newQuantity: z.number().min(0).max(1_000_000),
  reason: z.string().min(2).max(300),
});

export const stockIntakeSchema = z.object({
  supplierId: z.number().int().positive().nullable().optional(),
  invoiceNumber: z.string().max(100).nullable().optional(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shippingMinor: z.number().int().min(0).default(0),
  notes: z.string().max(500).nullable().optional(),
  lines: z
    .array(
      z.object({
        productId: z.number().int().positive().nullable(),
        productName: z.string().min(1).max(200),
        quantityReceived: z.number().positive().max(1_000_000),
        quantityDamaged: z.number().min(0).max(1_000_000).default(0),
        purchasePriceMinor: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(200),
});

export const supplierCreateSchema = z.object({
  name: z.string().min(2).max(200),
  contact: z.string().max(100).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
});

export const supplierPaySchema = z.object({
  supplierId: z.number().int().positive(),
  amountMinor: z.number().int().positive(),
  method: z.enum(["cash", "cheque", "transfer"]),
  reference: z.string().max(100).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Phase 7 — proformas
export const proformaCreateSchema = z.object({
  customerId: z.number().int().positive().nullable().optional(),
  lines: z
    .array(
      z.object({
        productId: z.number().int().positive().nullable(),
        productName: z.string().min(1).max(200),
        unitPriceMinor: z.number().int().min(0),
        quantity: z.number().positive().max(1_000_000),
      }),
    )
    .min(1)
    .max(200),
  discountMinor: z.number().int().min(0).default(0),
  deliveryMinor: z.number().int().min(0).default(0),
  dueDate: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const proformaStatusSchema = z.object({
  id: z.number().int().positive(),
  to: z.enum(["sent", "converted", "cancelled"]),
});

export const proformaConvertSchema = z.object({
  proformaId: z.number().int().positive(),
  amountPaidMinor: z.number().int().min(0),
  paymentMethod: z.enum(["cash", "cheque", "transfer"]).nullable().optional(),
});

// Phase 8 — finance
export const debtsListSchema = paginationSchema.extend({
  filter: z.enum(["all", "due", "over_limit"]).default("all"),
});

export const periodSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const closingCreateSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  openingMinor: z.number().int().min(0).default(0),
});

export const zakatParamsSchema = z.object({
  ratePercent: z.number().min(0.1).max(100).default(2.5),
  nisabMinor: z.number().int().min(0).default(0),
});

// Phase 9 — pain
export const breadCreateSchema = z.object({
  customerId: z.number().int().positive().nullable().optional(),
  customName: z.string().max(200).nullable().optional(),
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pickupTime: z.string().max(10).nullable().optional(),
  quantity: z.number().positive().max(1_000_000),
  unitPriceMinor: z.number().int().min(0),
  amountPaidMinor: z.number().int().min(0).default(0),
  notes: z.string().max(500).nullable().optional(),
});

export const breadPaySchema = z.object({
  id: z.number().int().positive(),
  amountMinor: z.number().int().positive(),
});

export const breadPickupSchema = z.object({
  id: z.number().int().positive(),
  to: z.enum(["ready", "delivered", "cancelled"]),
});

export const proformaListSchema = paginationSchema.extend({
  status: z.enum(["draft", "sent", "converted", "cancelled"]).nullable().optional(),
});

export const breadListSchema = paginationSchema.extend({
  pickupDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export const closingsListSchema = periodSchema;

// Import CSV (lignes déjà validées côté renderer, re-validées côté main)
export const productsImportSchema = z.object({
  rows: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        sellingPriceMinor: z.number().int().min(0),
        purchasePriceMinor: z.number().int().min(0).default(0),
        quantity: z.number().min(0).max(1_000_000).default(0),
        barcode: z.string().max(64).default(""),
      }),
    )
    .min(1)
    .max(5000),
});

export const customerUpdateSchema = z.object({
  id: z.number().int().positive(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(30).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  creditLimitMinor: z.number().int().min(0).default(0),
});

export const settingsGetSchema = z.object({
  key: z.enum(["inventory"]),
});

export const settingsSaveSchema = z.object({
  key: z.enum(["inventory"]),
  value: z.object({ allowNegativeStock: z.boolean() }),
});

export const customersImportSchema = z.object({
  rows: z
    .array(
      z.object({
        firstName: z.string().min(1).max(100),
        lastName: z.string().min(1).max(100),
        phone: z.string().max(30).default(""),
      }),
    )
    .min(1)
    .max(5000),
});
