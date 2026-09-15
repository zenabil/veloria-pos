// Veloria PoS — Main-process: sale creation transaction (atomic).
// Boundary: sale + items + payment + stock movements + product qty + customer balance + audit = 1 tx.

import { getDb } from "../../database/sqlite.service";

export interface SaleLineInput {
  productId: number | null;
  productName: string;
  unitCode: string;
  unitPriceMinor: number;
  purchasePriceMinor: number;
  quantity: number;
}

export interface CreateSaleInput {
  operationId: string;
  uuid: string;
  invoiceNumber: string;
  customerId: number | null;
  subtotalMinor: number;
  discountType: string;
  discountValueMinor: number;
  discountAmountMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  remainingMinor: number;
  paymentStatus: string;
  paymentMethod: string | null;
  lines: SaleLineInput[];
  lineTotals: number[];
  now: string;
  allowNegativeStock: boolean;
}

export function allocateInvoiceNumber(prefix: string, now: string): string {
  const db = getDb();
  // Called inside transaction by createSale; standalone fallback also works.
  const row = db
    .prepare(`SELECT prefix, next_value FROM number_sequences WHERE sequence_key = 'sale_invoice'`)
    .get() as {
    prefix: string;
    next_value: number;
  };
  const p = prefix || row.prefix || "FAC";
  const year = new Date().getFullYear();
  const num = `${p}-${year}-${String(row.next_value).padStart(5, "0")}`;
  db.prepare(
    `UPDATE number_sequences SET next_value = next_value + 1, updated_at = ? WHERE sequence_key = 'sale_invoice'`,
  ).run(now);
  return num;
}

export function createSaleAtomic(input: CreateSaleInput): {
  saleId: number;
  invoiceNumber: string;
} {
  const db = getDb();
  // Idempotency: retry with same operationId returns existing sale.
  const existing = db
    .prepare(`SELECT id, invoice_number FROM sales WHERE operation_id = ?`)
    .get(input.operationId) as
    | {
        id: number;
        invoice_number: string;
      }
    | undefined;
  if (existing) return { saleId: existing.id, invoiceNumber: existing.invoice_number };

  const tx = db.transaction(() => {
    // 1. stock availability check (unless explicitly allowed)
    for (const line of input.lines) {
      if (line.productId != null) {
        const p = db.prepare(`SELECT quantity FROM products WHERE id = ?`).get(line.productId) as
          | {
              quantity: number;
            }
          | undefined;
        if (!p) throw new Error("Produit introuvable.");
        if (!input.allowNegativeStock && line.quantity > Number(p.quantity)) {
          throw new Error(`Stock insuffisant pour « ${line.productName} ».`);
        }
      }
    }
    // 2. invoice number: allocate if not provided
    let invoice = input.invoiceNumber;
    if (!invoice) {
      const row = db
        .prepare(
          `SELECT prefix, next_value FROM number_sequences WHERE sequence_key = 'sale_invoice'`,
        )
        .get() as {
        prefix: string;
        next_value: number;
      };
      const year = new Date().getFullYear();
      invoice = `${row.prefix}-${year}-${String(row.next_value).padStart(5, "0")}`;
      db.prepare(
        `UPDATE number_sequences SET next_value = next_value + 1, updated_at = ? WHERE sequence_key = 'sale_invoice'`,
      ).run(input.now);
    }
    // 3. insert sale
    const r = db
      .prepare(
        `INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, discount_type, discount_value_minor, discount_amount_minor, delivery_fee_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, payment_method, operation_id, is_cancelled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        input.uuid,
        invoice,
        input.customerId,
        input.subtotalMinor,
        input.discountType,
        Math.round(input.discountValueMinor),
        input.discountAmountMinor,
        input.deliveryFeeMinor,
        input.totalMinor,
        input.amountPaidMinor,
        input.remainingMinor,
        input.paymentStatus,
        input.paymentMethod,
        input.operationId,
        input.now,
        input.now,
      );
    const saleId = Number(r.lastInsertRowid);
    // 4. items + stock movements + product qty
    input.lines.forEach((line, i) => {
      db.prepare(
        `INSERT INTO sale_items (sale_id, product_id, product_name_snapshot, unit_code, unit_price_minor, purchase_price_minor, quantity, line_total_minor)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        saleId,
        line.productId,
        line.productName,
        line.unitCode,
        line.unitPriceMinor,
        line.purchasePriceMinor,
        line.quantity,
        input.lineTotals[i] ?? 0,
      );
      if (line.productId != null) {
        const p = db.prepare(`SELECT quantity FROM products WHERE id = ?`).get(line.productId) as {
          quantity: number;
        };
        const after = Number(p.quantity) - line.quantity;
        db.prepare(
          `UPDATE products SET quantity = ?, stock_status = CASE WHEN ? <= 0 THEN 'out_of_stock' WHEN ? <= min_stock_level THEN 'low_stock' ELSE 'in_stock' END, updated_at = ? WHERE id = ?`,
        ).run(after, after, after, input.now, line.productId);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { randomUUID } = require("node:crypto") as typeof import("node:crypto");
        db.prepare(
          `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, unit_cost_minor, related_entity_type, related_entity_id, reason, created_at)
           VALUES (?, ?, 'sale_out', ?, ?, ?, 'sale', ?, 'Vente', ?)`,
        ).run(
          randomUUID(),
          line.productId,
          -line.quantity,
          after,
          line.purchasePriceMinor,
          String(saleId),
          input.now,
        );
      }
    });
    // 5. payment row (if paid > 0)
    if (input.amountPaidMinor > 0) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { randomUUID } = require("node:crypto") as typeof import("node:crypto");
      db.prepare(
        `INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method, payment_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        randomUUID(),
        saleId,
        input.customerId,
        input.amountPaidMinor,
        input.paymentMethod ?? "cash",
        input.now,
        input.now,
      );
    }
    // 6. customer balance (materialized, atomic)
    if (input.customerId != null && input.remainingMinor !== 0) {
      db.prepare(
        `UPDATE customers SET outstanding_balance_minor = outstanding_balance_minor + ?, debt_status = CASE WHEN outstanding_balance_minor + ? <= 0 THEN 'none' WHEN credit_limit_minor > 0 AND outstanding_balance_minor + ? > credit_limit_minor THEN 'over_limit' ELSE 'due' END, is_over_limit = CASE WHEN credit_limit_minor > 0 AND outstanding_balance_minor + ? > credit_limit_minor THEN 1 ELSE 0 END, updated_at = ? WHERE id = ?`,
      ).run(
        input.remainingMinor,
        input.remainingMinor,
        input.remainingMinor,
        input.remainingMinor,
        input.now,
        input.customerId,
      );
    }
    // 7. audit
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { randomUUID: uuid2 } = require("node:crypto") as typeof import("node:crypto");
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'sale.created', 'sale', ?, ?, ?, ?)`,
    ).run(
      uuid2(),
      String(saleId),
      input.operationId,
      JSON.stringify({ invoice, total: input.totalMinor, paid: input.amountPaidMinor }),
      input.now,
    );
    return { saleId, invoiceNumber: invoice };
  });
  return (tx as unknown as () => { saleId: number; invoiceNumber: string })();
}

export function cancelSaleAtomic(saleId: number, now: string, operationId: string): void {
  const db = getDb();
  const tx = db.transaction(() => {
    const sale = db.prepare(`SELECT * FROM sales WHERE id = ?`).get(saleId) as
      | Record<string, unknown>
      | undefined;
    if (!sale) throw new Error("Vente introuvable.");
    if (sale["is_cancelled"] === 1) throw new Error("Vente déjà annulée.");
    const items = db.prepare(`SELECT * FROM sale_items WHERE sale_id = ?`).all(saleId) as {
      product_id: number | null;
      quantity: number;
      purchase_price_minor: number;
    }[];
    // restore stock
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { randomUUID } = require("node:crypto") as typeof import("node:crypto");
    for (const it of items) {
      if (it.product_id != null) {
        const p = db.prepare(`SELECT quantity FROM products WHERE id = ?`).get(it.product_id) as {
          quantity: number;
        };
        const after = Number(p.quantity) + Number(it.quantity);
        db.prepare(
          `UPDATE products SET quantity = ?, stock_status = CASE WHEN ? <= 0 THEN 'out_of_stock' WHEN ? <= min_stock_level THEN 'low_stock' ELSE 'in_stock' END, updated_at = ? WHERE id = ?`,
        ).run(after, after, after, now, it.product_id);
        db.prepare(
          `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, unit_cost_minor, related_entity_type, related_entity_id, reason, created_at)
           VALUES (?, ?, 'sale_cancel_in', ?, ?, ?, 'sale', ?, 'Annulation vente', ?)`,
        ).run(
          randomUUID(),
          it.product_id,
          it.quantity,
          after,
          it.purchase_price_minor,
          String(saleId),
          now,
        );
      }
    }
    // reverse customer balance by remaining (unpaid part)
    const remaining = Number(sale["remaining_balance_minor"] ?? 0);
    const customerId = sale["customer_id"] as number | null;
    if (customerId != null && remaining !== 0) {
      db.prepare(
        `UPDATE customers SET outstanding_balance_minor = outstanding_balance_minor - ?, updated_at = ? WHERE id = ?`,
      ).run(remaining, now, customerId);
    }
    db.prepare(
      `UPDATE sales SET is_cancelled = 1, cancelled_at = ?, updated_at = ? WHERE id = ?`,
    ).run(now, now, saleId);
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'sale.cancelled', 'sale', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(saleId),
      operationId,
      JSON.stringify({ invoice: sale["invoice_number"] }),
      now,
    );
  });
  (tx as unknown as () => void)();
}
