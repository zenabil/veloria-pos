// Veloria PoS — Main-process: sale creation transaction (atomic).
// Boundary: sale + items + payment + stock movements + product qty + customer balance + audit = 1 tx.

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { formatInvoiceNumber } from "./numbers";
import {
  auditOperationId,
  claimIdempotency,
  claimOptional,
  peekIdempotency,
  peekOptional,
  storeIdempotencyResult,
  storeOptional,
} from "./idempotency";
import {
  consumeLayers,
  consumptionsOfSale,
  createLayer,
  latestUnitCost,
  restoreToLayers,
} from "./fifo";

export function listSalesHistory(
  page: number,
  pageSize: number,
  query = "",
): { rows: unknown[]; total: number } {
  const db = getDb();
  const q = query.trim();
  const where = q ? `WHERE s.invoice_number LIKE ? ESCAPE '\\'` : "";
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const params: unknown[] = q ? [like] : [];
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM sales s ${where}`).get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT s.*, c.search_name AS customer_name FROM sales s LEFT JOIN customers c ON c.id = s.customer_id ${where} ORDER BY s.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  return { rows, total };
}

export function getSaleDetail(id: number): {
  sale: unknown;
  items: unknown[];
  payments: unknown[];
} {
  const db = getDb();
  const sale = db.prepare(`SELECT * FROM sales WHERE id = ?`).get(id);
  if (!sale) throw new Error("Vente introuvable.");
  const items = db.prepare(`SELECT * FROM sale_items WHERE sale_id = ?`).all(id);
  const payments = db.prepare(`SELECT * FROM sale_payments WHERE sale_id = ?`).all(id);
  return { sale, items, payments };
}

/** Report d'échéance d'une créance (vente non annulée). */
export function updateSaleDueDate(
  id: number,
  dueDate: string | null,
  now: string,
  operationId?: string | null,
): void {
  const db = getDb();
  const fast = peekOptional<{ updated: boolean }>(operationId, "sales.setDueDate");
  if (fast) return;
  const sale = db.prepare(`SELECT is_cancelled FROM sales WHERE id = ?`).get(id) as
    | { is_cancelled: number }
    | undefined;
  if (!sale) throw new Error("Vente introuvable.");
  if (sale.is_cancelled === 1) throw new Error("Vente annulée : échéance non modifiable.");
  const tx = db.transaction(() => {
    claimOptional(operationId, "sales.setDueDate", now);
    db.prepare(`UPDATE sales SET due_date = ?, updated_at = ? WHERE id = ?`).run(dueDate, now, id);
    // P8: échéance tracée (pilotage des créances) — audit déterministe.
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'sale.due_date', 'sale', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(id),
      auditOperationId(operationId, "sale.due_date", id, { dueDate }),
      JSON.stringify({ dueDate }),
      now,
    );
    storeOptional(operationId, { updated: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      operationId &&
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekOptional<{ updated: boolean }>(operationId, "sales.setDueDate");
      if (retry) return;
    }
    throw err;
  }
}

export interface SaleLineInput {
  productId: number | null;
  productName: string;
  unitCode: string;
  /** Prix d'origine catalogue (référence remise P0-7). */
  originalUnitPriceMinor: number;
  /** Prix facturé (après changement éventuel via le dialogue prix). */
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
  dueDate: string | null;
  lines: SaleLineInput[];
  lineTotals: number[];
  now: string;
  allowNegativeStock: boolean;
}

export function allocateInvoiceNumber(prefix: string, now: string): string {
  const db = getDb();
  // Appelée DANS la transaction createSale (même connexion) : pas de
  // sous-transaction, juste SELECT + UPDATE atomiques avec le reste.
  const row = db
    .prepare(`SELECT prefix, next_value FROM number_sequences WHERE sequence_key = 'sale_invoice'`)
    .get() as {
    prefix: string;
    next_value: number;
  };
  const p = prefix.trim() || row.prefix || "FAC";
  // P15: année issue de la date métier `now` (ISO) plutôt que de l'horloge
  // système brute — déterministe et testable.
  const year = Number(String(now).slice(0, 4)) || new Date().getFullYear();
  const num = formatInvoiceNumber(p, year, row.next_value);
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
  // Fast path hors transaction + garde anti-course : si deux appels concurrents
  // passent le SELECT, l'UNIQUE(operation_id) tranche et le perdant relit
  // la vente existante au lieu de lever une erreur technique.
  const findExisting = (): { saleId: number; invoiceNumber: string } | undefined => {
    const existing = db
      .prepare(`SELECT id, invoice_number FROM sales WHERE operation_id = ?`)
      .get(input.operationId) as
      | {
          id: number;
          invoice_number: string;
        }
      | undefined;
    if (existing) return { saleId: existing.id, invoiceNumber: existing.invoice_number };
    return undefined;
  };
  const fast = findExisting();
  if (fast) return fast;

  // Vente à crédit réservée aux clients autorisés (règle métier, dans la
  // transaction : le trigger SQL `trg_sales_credit_allowed` tranche en dernier ressort).
  if (input.remainingMinor > 0) {
    const salesCfg = db.prepare(`SELECT value_json FROM app_settings WHERE key = 'sales'`).get() as
      | { value_json: string }
      | undefined;
    let creditOpen = true;
    try {
      if (salesCfg) {
        creditOpen =
          (JSON.parse(salesCfg.value_json) as { allowCreditSales?: boolean }).allowCreditSales !==
          false;
      }
    } catch {
      /* défaut : crédit autorisé (drapeau client tranche) */
    }
    if (!creditOpen) {
      throw new Error("Ventes à crédit désactivées dans les paramètres.");
    }
    if (input.customerId == null) {
      throw new Error("Vente à crédit : choisissez un client autorisé au crédit.");
    }
    const c = db
      .prepare(`SELECT credit_allowed FROM customers WHERE id = ?`)
      .get(input.customerId) as { credit_allowed: number } | undefined;
    if (!c) throw new Error("Client introuvable.");
    if (Number(c.credit_allowed) !== 1) {
      throw new Error("Vente à crédit refusée : ce client n'est pas autorisé au crédit.");
    }
  }

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
    // 2. invoice number: allocate if not provided (même transaction)
    let invoice = input.invoiceNumber;
    if (!invoice) {
      const company = db
        .prepare(`SELECT invoice_prefix FROM company_profile WHERE id = 1`)
        .get() as { invoice_prefix: string | null } | undefined;
      invoice = allocateInvoiceNumber(company?.invoice_prefix ?? "", input.now);
    }
    // 3. insert sale
    const r = db
      .prepare(
        `INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, discount_type, discount_value_minor, discount_amount_minor, delivery_fee_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, payment_method, due_date, operation_id, is_cancelled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        input.uuid,
        invoice,
        input.customerId,
        input.subtotalMinor,
        input.discountType,
        // DB-10: percent conservé flottant (2.5% ≠ 3%), amount entier.
        input.discountType === "percent"
          ? input.discountValueMinor
          : Math.round(input.discountValueMinor),
        input.discountAmountMinor,
        input.deliveryFeeMinor,
        input.totalMinor,
        input.amountPaidMinor,
        input.remainingMinor,
        input.paymentStatus,
        input.paymentMethod,
        input.dueDate,
        input.operationId,
        input.now,
        input.now,
      );
    const saleId = Number(r.lastInsertRowid);
    // 4. items + FIFO consumption + stock movements + product qty
    // FIFO : chaque ligne consomme les couches les plus anciennes ; le coût
    // figé (cogs_minor) ne bougera plus jamais, même si les achats futurs
    // changent les coûts. Le prix de vente reste indépendant (unit_price_minor).
    // P0-7 : remise recalculée ici (original − final) × qty — jamais de valeur
    // remise venue du renderer ; vente sous coût d'achat → audit explicite.
    const belowCostLines: {
      productId: number | null;
      name: string;
      final: number;
      purchase: number;
    }[] = [];
    input.lines.forEach((line, i) => {
      if (!Number.isInteger(line.originalUnitPriceMinor) || line.originalUnitPriceMinor < 0) {
        throw new Error(`Prix d'origine invalide pour « ${line.productName} ».`);
      }
      const charged = input.lineTotals[i] ?? 0;
      const originalTotal = Math.round(line.originalUnitPriceMinor * line.quantity);
      const lineDiscount = originalTotal - charged;
      if (line.purchasePriceMinor > 0 && line.unitPriceMinor < line.purchasePriceMinor) {
        belowCostLines.push({
          productId: line.productId,
          name: line.productName,
          final: line.unitPriceMinor,
          purchase: line.purchasePriceMinor,
        });
      }
      const itemIns = db
        .prepare(
          `INSERT INTO sale_items (sale_id, product_id, product_name_snapshot, unit_code, original_unit_price_minor, unit_price_minor, purchase_price_minor, quantity, line_total_minor, discount_minor)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          saleId,
          line.productId,
          line.productName,
          line.unitCode,
          line.originalUnitPriceMinor,
          line.unitPriceMinor,
          line.purchasePriceMinor,
          line.quantity,
          charged,
          lineDiscount,
        );
      const saleItemId = Number(itemIns.lastInsertRowid);
      if (line.productId != null) {
        // Survente autorisée : la part sans couche utilise le dernier coût connu
        // (dernière couche, sinon snapshot produit) — coût explicite, jamais vide.
        const fallback =
          latestUnitCost(line.productId) ?? Math.max(0, Math.round(line.purchasePriceMinor));
        const { cogsMinor } = consumeLayers({
          productId: line.productId,
          qty: line.quantity,
          now: input.now,
          oversell: input.allowNegativeStock,
          fallbackUnitCostMinor: fallback,
          record: { saleId, saleItemId },
        });
        db.prepare(`UPDATE sale_items SET cogs_minor = ? WHERE id = ?`).run(cogsMinor, saleItemId);
        const avgUnit = line.quantity > 0 ? Math.round(cogsMinor / line.quantity) : 0;
        const p = db.prepare(`SELECT quantity FROM products WHERE id = ?`).get(line.productId) as {
          quantity: number;
        };
        const after = Number(p.quantity) - line.quantity;
        db.prepare(
          `UPDATE products SET quantity = ?, stock_status = CASE WHEN ? <= 0 THEN 'out_of_stock' WHEN ? <= min_stock_level THEN 'low_stock' ELSE 'in_stock' END, updated_at = ? WHERE id = ?`,
        ).run(after, after, after, input.now, line.productId);
        db.prepare(
          `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, unit_cost_minor, related_entity_type, related_entity_id, reason, created_at)
           VALUES (?, ?, 'sale_out', ?, ?, ?, 'sale', ?, 'Vente', ?)`,
        ).run(
          randomUUID(),
          line.productId,
          -line.quantity,
          after,
          avgUnit,
          String(saleId),
          input.now,
        );
      }
    });
    // 5. payment row (if paid > 0)
    if (input.amountPaidMinor > 0) {
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
    // 7. audit (avec lignes sous coût éventuelles — confirmation explicite caisse).
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'sale.created', 'sale', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(saleId),
      input.operationId,
      JSON.stringify({
        invoice,
        total: input.totalMinor,
        paid: input.amountPaidMinor,
        discount: input.discountAmountMinor,
        belowCostLines,
      }),
      input.now,
    );
    return { saleId, invoiceNumber: invoice };
  });
  try {
    return (tx as unknown as () => { saleId: number; invoiceNumber: string })();
  } catch (err) {
    // Course rejouée : l'autre transaction a inséré le même operationId.
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: sales\.operation_id/i.test(err.message)
    ) {
      const retry = findExisting();
      if (retry) return retry;
    }
    // Course sur le numéro de facture (deux ventes concurrentes) : la séquence
    // a été annulée avec la transaction, on l'avance une fois en autocommit
    // puis on rejoue une seule fois (évite l'erreur visible « déjà utilisé »).
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: sales\.invoice_number/i.test(err.message)
    ) {
      try {
        db.prepare(
          `UPDATE number_sequences SET next_value = next_value + 1, updated_at = ? WHERE sequence_key = 'sale_invoice'`,
        ).run(input.now);
      } catch {
        /* avancement best-effort */
      }
      try {
        return (tx as unknown as () => { saleId: number; invoiceNumber: string })();
      } catch (retryErr) {
        if (
          retryErr instanceof Error &&
          /UNIQUE constraint failed: sales\.operation_id/i.test(retryErr.message)
        ) {
          const retry = findExisting();
          if (retry) return retry;
        }
        throw retryErr;
      }
    }
    throw err;
  }
}

export function cancelSaleAtomic(saleId: number, now: string, operationId: string): void {
  const db = getDb();
  const fast = peekIdempotency<{ cancelled: boolean }>(operationId, "sales.cancel");
  if (fast) return;
  const tx = db.transaction(() => {
    claimIdempotency(operationId, "sales.cancel", now);
    const sale = db.prepare(`SELECT * FROM sales WHERE id = ?`).get(saleId) as
      | Record<string, unknown>
      | undefined;
    if (!sale) throw new Error("Vente introuvable.");
    if (sale["is_cancelled"] === 1) throw new Error("Vente déjà annulée.");
    const items = db.prepare(`SELECT * FROM sale_items WHERE sale_id = ?`).all(saleId) as {
      id: number;
      product_id: number | null;
      quantity: number;
      purchase_price_minor: number;
    }[];
    // Annulation : le stock physique revient ET les couches consommées sont
    // restaurées à l'identique (l'historique des autres ventes reste intact).
    // Ventes antérieures à FIFO (sans traçabilité) ou part survendue : une
    // couche 'legacy' au coût snapshot préserve l'invariant couches = stock.
    const consumed = consumptionsOfSale(saleId);
    // restore stock
    for (const it of items) {
      if (it.product_id != null) {
        const p = db.prepare(`SELECT quantity FROM products WHERE id = ?`).get(it.product_id) as {
          quantity: number;
        };
        const after = Number(p.quantity) + Number(it.quantity);
        db.prepare(
          `UPDATE products SET quantity = ?, stock_status = CASE WHEN ? <= 0 THEN 'out_of_stock' WHEN ? <= min_stock_level THEN 'low_stock' ELSE 'in_stock' END, updated_at = ? WHERE id = ?`,
        ).run(after, after, after, now, it.product_id);
        const slices = consumed.filter(
          (c) => c.productId === it.product_id && c.saleItemId === it.id,
        );
        const restoredQty = slices
          .filter((c) => c.layerId != null)
          .reduce((a, c) => a + Number(c.quantity), 0);
        restoreToLayers(
          slices
            .filter((c) => c.layerId != null)
            .map((c) => ({ layerId: c.layerId as number, quantity: Number(c.quantity) })),
        );
        const missing = Number(it.quantity) - restoredQty;
        if (missing > 0) {
          createLayer({
            productId: it.product_id,
            qty: missing,
            unitCostMinor: Math.max(0, Math.round(Number(it.purchase_price_minor))),
            reason: "legacy",
            now,
          });
        }
        const restoredCost = slices.reduce(
          (a, c) => a + Math.round(Number(c.unitCostMinor) * Number(c.quantity)),
          0,
        );
        const avgUnit =
          Number(it.quantity) > 0
            ? Math.round(
                (restoredCost +
                  Math.round(Number(it.purchase_price_minor) * Math.max(0, missing))) /
                  Number(it.quantity),
              )
            : 0;
        db.prepare(
          `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, unit_cost_minor, related_entity_type, related_entity_id, reason, created_at)
           VALUES (?, ?, 'sale_cancel_in', ?, ?, ?, 'sale', ?, 'Annulation vente', ?)`,
        ).run(randomUUID(), it.product_id, it.quantity, after, avgUnit, String(saleId), now);
      }
    }
    // reverse customer balance by remaining (unpaid part) + recalcul du statut
    // (même règle que la création : un solde retombé à 0 redevient 'none').
    const remaining = Number(sale["remaining_balance_minor"] ?? 0);
    const customerId = sale["customer_id"] as number | null;
    if (customerId != null && remaining !== 0) {
      db.prepare(
        `UPDATE customers SET outstanding_balance_minor = outstanding_balance_minor - ?,
          debt_status = CASE WHEN outstanding_balance_minor - ? <= 0 THEN 'none' WHEN credit_limit_minor > 0 AND outstanding_balance_minor - ? > credit_limit_minor THEN 'over_limit' ELSE 'due' END,
          is_over_limit = CASE WHEN credit_limit_minor > 0 AND outstanding_balance_minor - ? > credit_limit_minor THEN 1 ELSE 0 END,
          updated_at = ? WHERE id = ?`,
      ).run(remaining, remaining, remaining, remaining, now, customerId);
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
    storeIdempotencyResult(operationId, { cancelled: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      return;
    }
    throw err;
  }
}
