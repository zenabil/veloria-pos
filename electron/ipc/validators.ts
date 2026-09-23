// Veloria PoS — IPC validators (Zod) at the main-process boundary.
// Every mutating command validates types, ranges, identifiers.

import { z } from "zod";

// Duplique `isRealCalendarDate` du domaine (frontière main/domaine : pas
// d'import src/ ici pour préserver rootDir) — même règle calendaire.
// P02: parité volontaire (bissextile incluse) — toute modification doit être
// répercutée dans src/domain/common/dates.ts et ici (même algorithme).
// Exporté pour le test de parité P2 (tests/unit/main-domain-parity.test.ts).
export function isRealCalendarDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = y % 400 === 0 || (y % 4 === 0 && y % 100 !== 0);
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  return day <= dim;
}

const businessDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => isRealCalendarDate(v), { message: "Date calendaire invalide." });

// DB-14: quantités centralisées — finies, > 0, ≤ 1M, 3 décimales max (kg/L).
// Même règle que domain/common/quantity (assertValidQuantity) : la frontière
// IPC rejette tôt au lieu de laisser FIFO arrondir silencieusement.
const quantity = z
  .number()
  .positive()
  .max(1_000_000)
  .refine((q) => Number.isFinite(q) && Math.abs(q * 1000 - Math.round(q * 1000)) < 1e-9, {
    message: "Quantité invalide (3 décimales maximum).",
  });

// MONEY-ROOT: montants en centimes bornés (anti-overflow Number.MAX_SAFE_INTEGER
// sur prix×qté : 1e9 centimes = 10M DZD, largement au-delà du commerce de détail).
const moneyMinor = z.number().int().min(0).max(1_000_000_000);

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export const productSearchSchema = z.object({
  query: z.string().max(200).default(""),
  categoryId: z.number().int().nullable().optional(),
  stockFilter: z.enum(["all", "in_stock", "low_stock", "out_of_stock"]).default("all"),
  includeArchived: z.boolean().default(false),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

export const barcodeSchema = z.object({ barcode: z.string().min(1).max(64) });

export const productCreateSchema = z.object({
  operationId: z.string().uuid(),
  name: z.string().min(2).max(200),
  categoryId: z.number().int().nullable().optional(),
  unitCode: z.string().max(20).default("PIECE"),
  // P7: même plafond moneyMinor que les lignes de vente (anti-overflow).
  purchasePriceMinor: moneyMinor,
  sellingPriceMinor: moneyMinor,
  quantity: z.number().min(0).max(1_000_000),
  minStockLevel: z.number().min(0).max(1_000_000).default(0),
  maxStockLevel: z.number().min(0).max(1_000_000).default(0),
  expirationDate: z.string().nullable().optional(),
  supplierId: z.number().int().nullable().optional(),
  barcodes: z.array(z.string().min(1).max(64)).max(20).default([]),
});

// P18: la mise à jour est idempotente par valeur (rejouer le même SET donne
// le même état) — exiger un operationId que le repo ignore serait un contrat
// mensonger. Seule la CRÉATION porte l'idempotence (UNIQUE operation_id).
export const productUpdateSchema = productCreateSchema.omit({ operationId: true }).extend({
  id: z.number().int().positive(),
});

export const customerCreateSchema = z.object({
  operationId: z.string().uuid(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(30).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  creditLimitMinor: z.number().int().min(0).default(0),
  initialBalanceMinor: z.number().int().min(0).default(0),
  settlementDay: z.number().int().min(1).max(31).nullable().optional(),
  isBreadClient: z.boolean().default(false),
  creditAllowed: z.boolean().default(false),
  notes: z.string().max(500).nullable().optional(),
});

export const saleItemSchema = z.object({
  productId: z.number().int().nullable(),
  productName: z.string().min(1).max(200),
  unitCode: z.string().max(20).default("PIECE"),
  // P0-7 : prix d'origine (référence remise) + prix facturé. original ≥ 0,
  // final ≥ 0 ; la remise = (original − final) × qty, calculée côté main.
  originalUnitPriceMinor: moneyMinor,
  unitPriceMinor: moneyMinor,
  purchasePriceMinor: moneyMinor.default(0),
  quantity,
});

export const saleCreateSchema = z.object({
  operationId: z.string().uuid(),
  customerId: z.number().int().nullable().optional(),
  lines: z.array(saleItemSchema).min(1).max(200),
  // P0-7 : AUCUN discountType/discountValue au niveau vente (supprimés) — la
  // remise vit dans les prix unitaires de lignes. Zod ignore les clés
  // inconnues : les anciens appelants restent compatibles.
  deliveryFeeMinor: z.number().int().min(0).default(0),
  amountPaidMinor: z.number().int().min(0),
  paymentMethod: z.enum(["cash", "cheque", "transfer"]).nullable().optional(),
  dueDate: businessDate.nullable().optional(),
});

export const idSchema = z.object({ id: z.number().int().positive() });

export const recordPaymentSchema = z.object({
  operationId: z.string().uuid(),
  customerId: z.number().int().positive().nullable().optional(),
  saleId: z.number().int().positive().nullable().optional(),
  amountMinor: z.number().int().positive(),
  method: z.enum(["cash", "cheque", "transfer"]),
  reference: z.string().max(100).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  paymentDate: businessDate.nullable().optional(),
});

export const idempotentIdSchema = z.object({
  id: z.number().int().positive(),
  operationId: z.string().uuid(),
});

// P1-6 : couche centrale anti-sans-operationId. Tout schéma ZodObject dont le
// champ `operationId` est REQUIS (ZodString nu — ni optional, ni nullable, ni
// défaut) impose un UUID d'appelant ; `handle()` refuse sans (jamais de
// génération silencieuse côté main). Les schémas optionnels/compat (ex.
// expenses.delete nullable) restent hors périmètre volontairement.
export function schemaRequiresOperationId(schema: unknown): boolean {
  if (schema !== null && typeof schema === "object" && "shape" in schema) {
    const shape = (schema as { shape: Record<string, unknown> }).shape;
    return shape.operationId instanceof z.ZodString;
  }
  return false;
}

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
  refundMinor: z.number().int().min(0).default(0),
  creditMinor: z.number().int().min(0).default(0),
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
  amountMinor: z.number().int().positive(),
  method: z.enum(["cash", "cheque", "transfer"]),
});

export const returnCancelSchema = returnTargetSchema.extend({
  operationId: z.string().uuid(),
});

export const expenseCreateSchema = z.object({
  operationId: z.string().uuid(),
  description: z.string().min(2).max(300),
  category: z.string().min(1).max(100),
  amountMinor: z.number().int().positive(),
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

// Phase 6 — stock / fournisseurs
export const stockAdjustSchema = z.object({
  operationId: z.string().uuid(),
  productId: z.number().int().positive(),
  newQuantity: z.number().min(0).max(1_000_000),
  reason: z.string().min(2).max(300),
  reference: z.string().max(100).nullable().optional(),
});

export const stockProductsSchema = z.object({
  query: z.string().max(200).default(""),
  categoryId: z.number().int().nullable().optional(),
  stockStatus: z.enum(["all", "in_stock", "low_stock", "out_of_stock"]).default("all"),
  movementType: z
    .enum([
      "all",
      "sale_out",
      "sale_cancel_in",
      "intake_in",
      "adjust_in",
      "adjust_out",
      "return_in",
      "damage_out",
    ])
    .default("all"),
  sort: z
    .enum(["name_asc", "name_desc", "qty_asc", "qty_desc", "value_desc", "recent_desc"])
    .default("name_asc"),
  page: z.number().int().min(1).default(1),
  // P30: pagination unifiée (200 max partout — l'UI demande 20 ; 500
  // permettait un scrape mémoire via IPC forgé).
  pageSize: z.number().int().min(1).max(200).default(50),
});

export const stockMovementsSchema = z.object({
  productId: z.number().int().positive(),
  from: businessDate.nullable().optional(),
  to: businessDate.nullable().optional(),
  types: z
    .array(
      z.enum([
        "sale_out",
        "sale_cancel_in",
        "intake_in",
        "adjust_in",
        "adjust_out",
        "return_in",
        "damage_out",
      ]),
    )
    .max(7)
    .default([]),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export const inventoryApplySchema = z.object({
  operationId: z.string().uuid(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        actualQty: z.number().min(0).max(1_000_000),
      }),
    )
    .min(1)
    .max(500),
  reason: z.string().min(2).max(300),
  reference: z.string().max(100).nullable().optional(),
});

// Historique unifié (lecture seule).
// P06: pageSize aligné sur les autres listes (200 max) — 1000 contournait le Pager.
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

export const stockIntakeSchema = z.object({
  operationId: z.string().uuid(),
  supplierId: z.number().int().positive().nullable().optional(),
  invoiceNumber: z.string().max(100).nullable().optional(),
  invoiceDate: businessDate,
  shippingMinor: z.number().int().min(0).default(0),
  notes: z.string().max(500).nullable().optional(),
  lines: z
    .array(
      z.object({
        productId: z.number().int().positive().nullable(),
        productName: z.string().min(1).max(200),
        quantityReceived: quantity,
        quantityDamaged: z.number().min(0).max(1_000_000).default(0),
        purchasePriceMinor: z.number().int().min(0),
        // Prix de vente par ligne (optionnel) : null/omitted = conserver le prix
        // actuel du produit ; number (dont 0 explicite) = nouveau prix de vente.
        sellingPriceMinor: z.number().int().min(0).nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
});

export const supplierSearchSchema = z.object({
  query: z.string().max(200).default(""),
  statusFilter: z.enum(["all", "active", "inactive"]).default("all"),
  paymentFilter: z.enum(["all", "with_debt", "settled"]).default("all"),
  sort: z
    .enum(["name_asc", "name_desc", "purchases_desc", "debt_desc", "recent_desc"])
    .default("name_asc"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

export const supplierCreateSchema = z.object({
  operationId: z.string().uuid(),
  name: z.string().min(2).max(200),
  code: z.string().max(20).nullable().optional(),
  contact: z.string().max(100).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().max(100).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  taxNumber: z.string().max(50).nullable().optional(),
  commercialRegister: z.string().max(50).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  isActive: z.boolean().default(true),
});

export const supplierUpdateSchema = supplierCreateSchema
  // M-3 CONTRACT INTEGRITY: update is idempotent by value (replaying the same
  // SET yields the same row) — like productUpdateSchema (P18), it carries NO
  // operationId. Demanding one the repo ignores would be a fake contract.
  // (Zod strips unknown keys: old callers still sending operationId keep working.)
  .omit({ operationId: true })
  .extend({
    id: z.number().int().positive(),
  });

export const supplierDeleteManySchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100),
  // M-2 caller-owned operation: retry of the same user action replays the
  // stored result instead of failing on already-deleted rows.
  operationId: z.string().uuid(),
});

export const supplierPaySchema = z.object({
  operationId: z.string().uuid(),
  supplierId: z.number().int().positive(),
  amountMinor: z.number().int().positive(),
  method: z.enum(["cash", "cheque", "transfer"]),
  reference: z.string().max(100).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  paymentDate: businessDate,
});

// Phase 7 — proformas
export const proformaCreateSchema = z.object({
  operationId: z.string().uuid(),
  customerId: z.number().int().positive().nullable().optional(),
  lines: z
    .array(
      z.object({
        productId: z.number().int().positive().nullable(),
        productName: z.string().min(1).max(200),
        unitPriceMinor: z.number().int().min(0),
        quantity,
      }),
    )
    .min(1)
    .max(200),
  discountMinor: z.number().int().min(0).default(0),
  deliveryMinor: z.number().int().min(0).default(0),
  dueDate: businessDate.nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  terms: z.string().max(2000).nullable().optional(),
});

export const proformaStatusSchema = z.object({
  id: z.number().int().positive(),
  to: z.enum(["sent", "converted", "cancelled"]),
});

export const proformaConvertSchema = z.object({
  operationId: z.string().uuid(),
  proformaId: z.number().int().positive(),
  amountPaidMinor: z.number().int().min(0),
  paymentMethod: z.enum(["cash", "cheque", "transfer"]).nullable().optional(),
});

// Phase 8 — finance
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
});

export const periodSchema = z.object({
  from: businessDate,
  to: businessDate,
});

export const closingCreateSchema = z.object({
  operationId: z.string().uuid(),
  businessDate,
  openingMinor: z.number().int().min(0).default(0),
});

export const zakatParamsSchema = z.object({
  ratePercent: z.number().min(0.1).max(100).default(2.5),
  nisabMinor: z.number().int().min(0).default(0),
  hawlDate: businessDate.nullable().optional(),
  nisabMethod: z.enum(["gold", "silver", "other"]).default("gold"),
});

export const zakatCalculationSchema = z.object({
  operationId: z.string().uuid(),
  hijriYear: z.string().min(4).max(10),
  calcDate: businessDate,
  cashMinor: z.number().int().min(0).default(0),
  bankMinor: z.number().int().min(0).default(0),
  stockMinor: z.number().int().min(0).default(0),
  receivablesMinor: z.number().int().min(0).default(0),
  otherMinor: z.number().int().min(0).default(0),
  liabilitiesMinor: z.number().int().min(0).default(0),
  nisabMinor: z.number().int().min(0).default(0),
  ratePercent: z.number().min(0.1).max(100).default(2.5),
  notes: z.string().max(500).nullable().optional(),
});

// P3 : bons de commande fournisseurs (cycle draft → ordered → … → received).
export const purchaseLineSchema = z.object({
  productId: z.number().int().nullable(),
  productName: z.string().min(1).max(200),
  unitCode: z.string().max(20).default("PIECE"),
  quantityOrdered: quantity,
  unitCostMinor: moneyMinor,
});

export const purchaseCreateSchema = z.object({
  operationId: z.string().uuid(),
  supplierId: z.number().int().positive(),
  expectedDate: businessDate.nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  lines: z.array(purchaseLineSchema).min(1).max(200),
});

export const purchaseListSchema = paginationSchema.extend({
  supplierId: z.number().int().positive().nullable().optional(),
  status: z
    .enum(["draft", "ordered", "partially_received", "received", "cancelled"])
    .nullable()
    .optional(),
});

export const purchaseReceiveSchema = z.object({
  operationId: z.string().uuid(),
  id: z.number().int().positive(),
  lines: z
    .array(
      z.object({
        itemId: z.number().int().positive(),
        quantityReceived: quantity,
      }),
    )
    .min(1)
    .max(200),
});
// P4 : brouillons paniers (persistance onglets, SQLite — jamais de LocalStorage).
export const cartLineSchema = z.object({
  key: z.string().min(1).max(64),
  productId: z.number().int().nullable(),
  productName: z.string().min(1).max(200),
  unitCode: z.string().max(20).default("PIECE"),
  originalUnitPriceMinor: moneyMinor,
  unitPriceMinor: moneyMinor,
  purchasePriceMinor: moneyMinor.default(0),
  quantity: z.number().positive().max(1_000_000),
});

export const cartsSaveSchema = z.object({
  tabs: z
    .array(
      z.object({
        tabId: z.number().int().positive(),
        name: z.string().min(1).max(40),
        lines: z.array(cartLineSchema).max(500),
        customerId: z.number().int().positive().nullable().optional(),
        customerLabel: z.string().max(100).default("Client de passage"),
        amountPaidMinor: z.number().int().min(0).default(0),
        paymentMethod: z.enum(["cash", "cheque", "transfer"]).nullable().optional(),
      }),
    )
    .max(20),
});
// Phase 9 — pain (simplifié : nom commande + client + quantité, récurrence quotidienne).
export const breadCreateSchema = z.object({
  operationId: z.string().uuid(),
  customerId: z.number().int().positive().nullable().optional(),
  customName: z.string().max(200).nullable().optional(),
  customPhone: z.string().max(30).nullable().optional(),
  breadType: z.string().min(2).max(100).default("Pain"),
  orderName: z.string().max(200).nullable().optional(),
  isRecurring: z.boolean().default(false),
  pickupDate: businessDate,
  pickupTime: z.string().max(10).nullable().optional(),
  quantity,
  unitPriceMinor: z.number().int().min(0),
  amountPaidMinor: z.number().int().min(0).default(0),
  paymentMethod: z.enum(["cash", "cheque", "transfer"]).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const breadPaySchema = z.object({
  operationId: z.string().uuid(),
  id: z.number().int().positive(),
  amountMinor: z.number().int().positive(),
  method: z.enum(["cash", "cheque", "transfer"]).nullable().optional(),
});

export const breadUpdateQtySchema = z.object({
  operationId: z.string().uuid(),
  id: z.number().int().positive(),
  quantity,
});

export const breadUpdateSchema = z.object({
  operationId: z.string().uuid(),
  id: z.number().int().positive(),
  customerId: z.number().int().positive().nullable().optional(),
  customName: z.string().max(200).nullable().optional(),
  customPhone: z.string().max(30).nullable().optional(),
  breadType: z.string().min(2).max(100),
  orderName: z.string().max(200).nullable().optional(),
  isRecurring: z.boolean().default(false),
  pickupDate: businessDate,
  pickupTime: z.string().max(10).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const breadStatusSchema = z.object({
  operationId: z.string().uuid(),
  id: z.number().int().positive(),
  to: z.enum(["new", "confirmed", "preparing", "ready", "delivered", "cancelled"]),
});

export const breadTransferSchema = z.object({
  operationId: z.string().uuid(),
  id: z.number().int().positive(),
});

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
  customerId: z.number().int().positive().nullable().optional(),
  lines: z
    .array(
      z.object({
        productId: z.number().int().positive().nullable(),
        productName: z.string().min(1).max(200),
        unitPriceMinor: z.number().int().min(0),
        quantity,
      }),
    )
    .min(1)
    .max(200),
  discountMinor: z.number().int().min(0).default(0),
  deliveryMinor: z.number().int().min(0).default(0),
  dueDate: businessDate.nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  terms: z.string().max(2000).nullable().optional(),
});

export const breadListSchema = paginationSchema.extend({
  pickupDate: businessDate.nullable().optional(),
  query: z.string().max(200).default(""),
  status: z
    .enum(["new", "confirmed", "preparing", "ready", "delivered", "cancelled"])
    .nullable()
    .optional(),
  customer: z.string().max(200).default(""),
  recurring: z.enum(["all", "recurring", "once"]).default("all"),
  orderFrom: businessDate.nullable().optional(),
  orderTo: businessDate.nullable().optional(),
  pickupFrom: businessDate.nullable().optional(),
  pickupTo: businessDate.nullable().optional(),
  sort: z.enum(["pickup_asc", "pickup_desc", "date_desc", "amount_desc"]).default("pickup_asc"),
});

export const closingsListSchema = periodSchema;

// Import CSV (lignes déjà validées côté renderer, re-validées côté main)
export const productsImportSchema = z.object({
  // M-2 caller-owned batch operation: same file retried replays stored result.
  operationId: z.string().uuid(),
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
  creditAllowed: z.boolean().default(false),
  settlementDay: z.number().int().min(1).max(31).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const customerDebtFilterSchema = z.enum(["all", "with_debt", "no_debt", "over_limit"]);

// P1-3 : filtre serveur « archivés seuls » (total réel côté main).
export const archivedOnlySchema = z.boolean().default(false);

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
  defaultMinStock: z.number().min(0).max(1_000_000).default(0),
});

export const salesSettingsSchema = z.object({
  defaultPaymentMethod: z.enum(["cash", "cheque", "transfer"]).default("cash"),
  allowCreditSales: z.boolean().default(true),
  autoPrintInvoice: z.boolean().default(false),
});

export const invoiceSettingsSchema = z.object({
  showLogo: z.boolean().default(true),
  showCustomerBalance: z.boolean().default(true),
  showPreviousBalance: z.boolean().default(true),
  footerText: z.string().max(300).default(""),
  thankYouMessage: z.string().max(200).default(""),
});

export const printingSettingsSchema = z.object({
  silent: z.boolean().default(true),
});

export const productsSettingsSchema = z.object({
  defaultUnit: z.string().max(20).default("PIECE"),
});

export const customersSettingsSchema = z.object({
  defaultCreditLimitMinor: z.number().int().min(0).default(0),
});

export const suppliersSettingsSchema = z.object({
  defaultPaymentMethod: z.enum(["cash", "cheque", "transfer"]).default("cash"),
});

// P5 : sons d'interface (WebAudio, aucun asset).
export const soundSettingsSchema = z.object({
  enabled: z.boolean().default(true),
});

export const settingsSaveSchema = z.discriminatedUnion("key", [
  z.object({ key: z.literal("inventory"), value: inventorySettingsSchema }),
  z.object({ key: z.literal("sales"), value: salesSettingsSchema }),
  z.object({ key: z.literal("invoice"), value: invoiceSettingsSchema }),
  z.object({ key: z.literal("printing"), value: printingSettingsSchema }),
  z.object({ key: z.literal("products"), value: productsSettingsSchema }),
  z.object({ key: z.literal("customers"), value: customersSettingsSchema }),
  z.object({ key: z.literal("suppliers"), value: suppliersSettingsSchema }),
  z.object({ key: z.literal("sound"), value: soundSettingsSchema }),
]);

export const relocateSchema = z.object({
  folder: z.string().min(1).max(500),
});

// Réinitialisation d'usine (zone dangereuse) : preuve de confirmation
// LITTÉRALE tapée par l'opérateur + operationId d'appelant (rejouabilité
// sûre : un second appel retrouve la base déjà vide sans tout casser).
// L'UI exige en plus une confirmation tapée identique côté renderer.
export const databaseResetSchema = z.object({
  confirmation: z.literal("REINITIALISER"),
  operationId: z.string().uuid(),
});

export const companyUpdateSchema = z.object({
  company_name: z.string().min(1).max(200).nullable().optional(),
  commercial_name: z.string().max(200).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().max(100).nullable().optional(),
  website: z.string().max(100).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  tax_number: z.string().max(50).nullable().optional(),
  commercial_register: z.string().max(50).nullable().optional(),
  invoice_prefix: z.string().max(10).nullable().optional(),
  logo_path: z.string().max(500).nullable().optional(),
});

export const printLineSchema = z.object({
  name: z.string().min(1).max(200),
  qty: quantity,
  unit: z.string().max(20).default(""),
  unitPriceMinor: moneyMinor,
  lineTotalMinor: moneyMinor,
  ref: z.string().max(20).default(""),
});

export const printerSaveSchema = z.object({
  name: z.string().max(200).nullable(),
});

export const backupAutoSchema = z.object({
  enabled: z.boolean().default(true),
  intervalDays: z.number().int().min(1).max(30).default(1),
});

export const backupExportSchema = z.object({
  folder: z.string().min(1).max(500),
});

// Restauration : fichier candidat explicite (suffixe + existence + santé
// vérifiés côté service avant tout swap, avec snapshot + rollback).
export const backupRestoreSchema = z.object({
  file: z.string().min(1).max(2000),
});

// Récupération au démarrage (base non prête) : actions sans charge utile,
// validées explicitement comme tous les autres canaux (pas de run-sql).
export const recoveryActionSchema = z.object({});

// Licence hors-ligne : import via dialogue fichier côté main (aucune charge
// utile depuis le renderer — jamais de contenu .vlic via IPC).
export const licenseActionSchema = z.object({});

// Chrome frameless : actions fenêtre sans charge utile (pas de remote).
export const windowActionSchema = z.object({});

export const printPayloadSchema = z
  .object({
    company: z.string().max(200).default("Veloria"),
    customerName: z.string().max(200).default(""),
    customerPhone: z.string().max(30).default(""),
    customerAddress: z.string().max(300).default(""),
    customerCode: z.string().max(20).default(""),
    companyPhone: z.string().max(30).default(""),
    companyAddress: z.string().max(300).default(""),
    companyCity: z.string().max(100).default(""),
    companyEmail: z.string().max(100).default(""),
    companyRc: z.string().max(50).default(""),
    companyNif: z.string().max(50).default(""),
    companyLogo: z.string().max(600_000).default(""),
    paymentMethod: z.enum(["cash", "cheque", "transfer"]).nullable().optional(),
    dueDate: z.string().max(50).default(""),
    notes: z.string().max(1000).default(""),
    invoice: z.string().max(50).default(""),
    date: z.string().max(50).default(""),
    lines: z.array(printLineSchema).min(1).max(200),
    subtotalMinor: z.number().int().min(0).default(0),
    discountMinor: z.number().int().min(0).default(0),
    deliveryMinor: z.number().int().min(0).default(0),
    totalMinor: z.number().int().min(0).default(0),
    paidMinor: z.number().int().min(0).default(0),
    prevBalanceMinor: z.number().int().min(0).nullable().optional(),
    currentBalanceMinor: z.number().int().min(0).nullable().optional(),
  })
  // P04: cohérence arithmétique du ticket — un payload incohérent (total ≠
  // subtotal-remise+livraison, sous-total ≠ Σ lignes, ligne ≠ prix×qté) est
  // rejeté au lieu d'imprimer des montants faux (renderer compromis).
  .superRefine((v, ctx) => {
    for (let i = 0; i < v.lines.length; i++) {
      const l = v.lines[i];
      if (!l) continue;
      const expected = Math.round(l.unitPriceMinor * l.qty);
      if (l.lineTotalMinor !== expected) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Ligne ${i + 1} incohérente.`,
          path: ["lines", i, "lineTotalMinor"],
        });
        break;
      }
    }
    const sum = v.lines.reduce((a, l) => a + l.lineTotalMinor, 0);
    // P04-fix: deux sémantiques de remise coexistent dans le domaine —
    // (a) VENTES : sous-total = Σ prix d'ORIGINE, remise portée par les lignes
    //     (prix facturés) → c'est (sous-total − remise) qui égale Σ lignes ;
    // (b) DEVIS : sous-total = Σ lignes (prix pleins), remise GLOBALE en sus
    //     → c'est le sous-total seul qui égale Σ lignes.
    // L'ancienne forme (a seule) rejetait les devis remisés, et avant elle la
    // forme (b seule) rejetait les ventes remisées (« Document d'impression
    // invalide. » sur l'aperçu). Les deux formes cohérentes sont acceptées ;
    // tout le reste (somme fausse, remise > sous-total, total faux) est rejeté.
    const chargedSum = v.subtotalMinor - v.discountMinor;
    if (sum !== v.subtotalMinor && sum !== chargedSum) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sous-total/remise incohérents avec les lignes.",
        path: ["subtotalMinor"],
      });
    }
    if (v.discountMinor > v.subtotalMinor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Remise supérieure au sous-total.",
        path: ["discountMinor"],
      });
    }
    const expectedTotal = v.subtotalMinor - v.discountMinor + v.deliveryMinor;
    if (v.totalMinor !== expectedTotal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Total incohérent.",
        path: ["totalMinor"],
      });
    }
    // P05: paidMinor affiché peut dépasser le total (espèces rendues) — la
    // règle paid ≤ total reste côté vente (sale-rules), le ticket affiche
    // Monnaie rendue via buildReceiptText:311 sans la stocker.
  });

// Export PDF (ticket/facture) : `filePath` optionnel validé séparément
// (printPayloadSchema porte déjà un superRefine : ZodEffects non extensible).
// Sans `filePath` : dialogue natif d'enregistrement côté main — jamais
// d'écriture silencieuse arbitraire. Avec : absolu, extension .pdf, dossier
// parent validé via assertSafeUserFolder (pas de traversal, pas de système).
export const pdfFilePathSchema = z.object({
  filePath: z.string().max(2000).nullable().optional(),
});

// Reçu de règlement de dette (ticket تسديد الدين) : aperçu + impression
// 80mm/A4 après encaissement (client / fournisseur / pain). Cohérence
// arithmétique exigée : nouveau solde = ancien − montant (jamais négatif).
export const paymentTicketSchema = z
  .object({
    company: z.string().max(200).default("Veloria"),
    companyPhone: z.string().max(30).default(""),
    companyAddress: z.string().max(300).default(""),
    companyCity: z.string().max(100).default(""),
    companyEmail: z.string().max(100).default(""),
    companyRc: z.string().max(50).default(""),
    companyNif: z.string().max(50).default(""),
    companyLogo: z.string().max(600_000).default(""),
    partyLabel: z.string().min(1).max(200),
    kind: z.enum(["customer", "supplier", "bread"]),
    reference: z.string().max(50).default(""),
    date: z.string().max(50).default(""),
    amountMinor: z.number().int().min(1).max(1_000_000_000),
    paymentMethod: z.enum(["cash", "cheque", "transfer"]).nullable().optional(),
    prevBalanceMinor: moneyMinor,
    newBalanceMinor: moneyMinor,
    notes: z.string().max(500).default(""),
    footerText: z.string().max(500).default(""),
    thankYouMessage: z.string().max(500).default(""),
  })
  .superRefine((v, ctx) => {
    if (v.newBalanceMinor !== v.prevBalanceMinor - v.amountMinor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Soldes incohérents (nouveau = ancien − montant).",
        path: ["newBalanceMinor"],
      });
    }
  });

export const categoryCreateSchema = z.object({
  name: z.string().min(2).max(100),
});

export const expenseUpdateSchema = expenseCreateSchema
  // M-3 CONTRACT INTEGRITY: same rule as supplierUpdate/productUpdate (P18) —
  // pure update carries no operationId the repo would ignore.
  .omit({ operationId: true })
  .extend({
    id: z.number().int().positive(),
  });

// P18: suppression idempotente quand le client fournit operationId
// (double-clic/retry) ; sans operationId, comportement historique.
export const expenseDeleteSchema = z.object({
  id: z.number().int().positive(),
  operationId: z.string().uuid().nullable().optional(),
});

export const customersImportSchema = z.object({
  // M-2 caller-owned batch operation (same rule as productsImportSchema).
  operationId: z.string().uuid(),
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

// Liaison produits ↔ fournisseurs (jonction 0015).
export const productSuppliersSchema = z.object({
  productId: z.number().int().positive(),
  supplierIds: z.array(z.number().int().positive()).max(100).default([]),
});

// Appariement OCR par lot : UNE traversée IPC pour ≤ 150 lignes (au lieu de
// ~300 allers-retours barcode + recherche). Le main boucle en local, le
// renderer applique la logique floue sur les candidats retournés.
export const productsMatchBatchSchema = z.object({
  items: z
    .array(
      z.object({
        barcode: z.string().max(64).nullable().optional(),
        name: z.string().max(200).default(""),
      }),
    )
    .min(1)
    .max(150),
});

// Étiquettes code-barres (planche A4, rendu main déterministe).
export const labelItemSchema = z.object({
  name: z.string().min(1).max(200),
  priceMinor: z.number().int().min(0),
  barcode: z.string().min(1).max(64),
  copies: z.number().int().min(1).max(100).default(1),
});

export const labelsPayloadSchema = z.object({
  items: z.array(labelItemSchema).min(1).max(50),
});

// OCR local (aucune écriture : sélection + analyse + annulation + nettoyage).
// L'import passe ensuite par `stock.intake` après relecture humaine.
export const ocrSelectFileSchema = z.object({});

export const ocrAnalyzeSchema = z.object({
  fileId: z.string().uuid(),
  languages: z
    .array(z.enum(["fra", "eng", "ara"]))
    .min(1)
    .max(3)
    .default(["fra", "eng"]),
});

export const ocrCancelSchema = z.object({ fileId: z.string().uuid() });

export const ocrDisposeSchema = z.object({ fileId: z.string().uuid() });
