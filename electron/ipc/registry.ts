// Veloria PoS — Electron: IPC registry (typed, validated, error-safe).
// Maps renderer requests -> main-process repositories/services.
// All errors mapped to French user messages + technical log.

import { ipcMain, shell } from "electron";
import { randomUUID } from "node:crypto";
import { IPC_CHANNELS } from "./channels";
import * as V from "./validators";
import { log } from "../services/logger";
import {
  getDb,
  integrityCheck,
  openDatabase,
  getDbPath,
  checkpointAndClose,
} from "../database/sqlite.service";
import {
  getConfiguredDbPath,
  getDataFolder,
  LOGICAL_DB_NAME,
  PHYSICAL_DB_FILENAME,
} from "../database/database-path.service";
import * as Products from "./handlers/products.repo";
import * as Sales from "./handlers/sales.repo";
import * as Inventory from "./handlers/inventory.repo";
import * as Suppliers from "./handlers/suppliers.repo";
import * as Proformas from "./handlers/proformas.repo";
import * as Bread from "./handlers/bread.repo";
import * as Finance from "./handlers/finance.repo";
import * as Imports from "./handlers/import.repo";

function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

function toUserMessage(err: unknown): { code: string; message: string } {
  const msg = err instanceof Error ? err.message : "Erreur inconnue.";
  // SQLite constraint messages -> French
  if (/UNIQUE constraint failed: product_barcodes.barcode/i.test(msg)) {
    return { code: "VALIDATION_ERROR", message: "Ce code-barres existe déjà." };
  }
  if (/UNIQUE constraint failed: sales.invoice_number/i.test(msg)) {
    return {
      code: "CONFLICTING_OPERATION",
      message: "Numéro de facture déjà utilisé. Veuillez réessayer.",
    };
  }
  if (/Stock insuffisant/i.test(msg)) return { code: "STOCK_ERROR", message: msg };
  if (/^Client ou vente requis/i.test(msg)) return { code: "VALIDATION_ERROR", message: msg };
  if (/DATABASE_UNAVAILABLE/i.test(msg)) {
    return {
      code: "DATABASE_UNAVAILABLE",
      message: "Base de données indisponible. Redémarrez l'application.",
    };
  }
  if (
    msg.startsWith("Stock") ||
    msg.startsWith("Vente") ||
    msg.startsWith("Produit") ||
    msg.startsWith("Ce ")
  ) {
    return { code: "VALIDATION_ERROR", message: msg };
  }
  return { code: "UNKNOWN_ERROR", message: "Une erreur inattendue est survenue. Réessayez." };
}

function handle<TInput>(
  channel: string,
  schema: { parse(v: unknown): TInput } | null,
  fn: (input: TInput) => unknown,
): void {
  ipcMain.handle(channel, (_event, raw: unknown) => {
    const operationId = randomUUID();
    const started = Date.now();
    try {
      const input = schema ? schema.parse(raw ?? {}) : (raw as TInput);
      const data = fn(input);
      return ok(data);
    } catch (err) {
      log("ERROR", "ipc", "handler.failed", {
        channel,
        operation_id: operationId,
        duration_ms: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
      const user = toUserMessage(err);
      return { ok: false, ...user };
    }
  });
}

export function registerIpc(): void {
  // app
  handle(IPC_CHANNELS["app.getVersion"], null, () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app }: typeof import("electron") = require("electron");
    return { version: app.getVersion(), logicalDb: LOGICAL_DB_NAME, file: PHYSICAL_DB_FILENAME };
  });
  handle(IPC_CHANNELS["app.restart"], null, () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app }: typeof import("electron") = require("electron");
    try {
      checkpointAndClose();
    } catch {
      /* best effort before relaunch */
    }
    app.relaunch();
    app.exit(0);
    return { restarting: true };
  });
  handle(IPC_CHANNELS["database.health"], null, () => {
    const db = openDatabase();
    const check = integrityCheck();
    return { ...db, integrity: check.integrity, foreignKeyViolations: check.foreignKeys };
  });
  handle(IPC_CHANNELS["database.location"], null, () => ({
    logicalName: LOGICAL_DB_NAME,
    fileName: PHYSICAL_DB_FILENAME,
    path: getConfiguredDbPath(),
    folder: getDataFolder(),
  }));
  handle(IPC_CHANNELS["system.openDataFolder"], null, () => {
    void shell.openPath(getDataFolder());
    return { opened: true };
  });

  // products
  handle(IPC_CHANNELS["products.search"], V.productSearchSchema, (input) =>
    Products.searchProducts({
      query: input.query,
      categoryId: input.categoryId ?? null,
      stockFilter: input.stockFilter,
      page: input.page,
      pageSize: input.pageSize,
    }),
  );
  handle(IPC_CHANNELS["products.getByBarcode"], V.barcodeSchema, (input) => ({
    product: Products.getProductByBarcode(input.barcode.trim()),
  }));
  handle(IPC_CHANNELS["products.get"], V.idSchema, (input) => ({
    product: Products.getProduct(input.id),
  }));
  handle(IPC_CHANNELS["products.create"], V.productCreateSchema, (input) => {
    const now = new Date().toISOString();
    const id = Products.createProduct({
      uuid: randomUUID(),
      name: input.name,
      categoryId: input.categoryId ?? null,
      unitCode: input.unitCode,
      purchasePriceMinor: input.purchasePriceMinor,
      sellingPriceMinor: input.sellingPriceMinor,
      quantity: input.quantity,
      minStockLevel: input.minStockLevel,
      expirationDate: input.expirationDate ?? null,
      supplierId: input.supplierId ?? null,
      barcodes: input.barcodes,
      now,
    });
    return { id };
  });
  handle(IPC_CHANNELS["products.update"], V.productUpdateSchema, (input) => {
    Products.updateProduct({
      id: input.id,
      name: input.name,
      categoryId: input.categoryId ?? null,
      unitCode: input.unitCode,
      purchasePriceMinor: input.purchasePriceMinor,
      sellingPriceMinor: input.sellingPriceMinor,
      quantity: input.quantity,
      minStockLevel: input.minStockLevel,
      expirationDate: input.expirationDate ?? null,
      supplierId: input.supplierId ?? null,
      barcodes: input.barcodes,
      now: new Date().toISOString(),
    });
    return { updated: true };
  });
  handle(IPC_CHANNELS["products.archive"], V.idSchema, (input) => {
    Products.archiveProduct(input.id, new Date().toISOString());
    return { archived: true };
  });

  // customers (inline repo for v1 slice)
  handle(
    IPC_CHANNELS["customers.search"],
    V.paginationSchema.extend({ query: V.productSearchSchema.shape.query }),
    (input) => {
      const db = getDb();
      const q = (input as { query?: string }).query?.trim() ?? "";
      const where = q ? `WHERE (search_name LIKE ? ESCAPE '\\' OR phone LIKE ?)` : ``;
      const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      const params: unknown[] = q ? [like, like] : [];
      const total = (
        db.prepare(`SELECT COUNT(*) AS c FROM customers ${where}`).get(...params) as { c: number }
      ).c;
      const rows = db
        .prepare(`SELECT * FROM customers ${where} ORDER BY search_name LIMIT ? OFFSET ?`)
        .all(...params, input.pageSize, (input.page - 1) * input.pageSize);
      return { rows, total };
    },
  );
  handle(IPC_CHANNELS["customers.create"], V.customerCreateSchema, (input) => {
    const db = getDb();
    const now = new Date().toISOString();
    const search = `${input.firstName} ${input.lastName}`.trim().toLowerCase();
    const r = db
      .prepare(
        `INSERT INTO customers (uuid, first_name, last_name, search_name, phone, address, credit_limit_minor, initial_balance_minor, outstanding_balance_minor, debt_status, is_bread_client, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'none', ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.firstName.trim(),
        input.lastName.trim(),
        search,
        input.phone ?? null,
        input.address ?? null,
        input.creditLimitMinor,
        input.initialBalanceMinor,
        Math.max(0, input.initialBalanceMinor),
        input.isBreadClient ? 1 : 0,
        now,
        now,
      );
    return { id: Number(r.lastInsertRowid) };
  });
  handle(IPC_CHANNELS["customers.recordPayment"], V.recordPaymentSchema, (input) => {
    if (input.saleId == null && input.customerId == null) {
      throw new Error("Client ou vente requis pour enregistrer un paiement.");
    }
    const db = getDb();
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method, reference, notes, payment_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        randomUUID(),
        input.saleId ?? null,
        input.customerId ?? null,
        input.amountMinor,
        input.method,
        input.reference ?? null,
        input.notes ?? null,
        now,
        now,
      );
      if (input.customerId != null) {
        db.prepare(
          `UPDATE customers SET outstanding_balance_minor = MAX(0, outstanding_balance_minor - ?), updated_at = ? WHERE id = ?`,
        ).run(input.amountMinor, now, input.customerId);
      }
      if (input.saleId != null) {
        db.prepare(
          `UPDATE sales SET amount_paid_minor = MIN(total_minor, amount_paid_minor + ?), remaining_balance_minor = total_minor - MIN(total_minor, amount_paid_minor + ?), payment_status = CASE WHEN total_minor - MIN(total_minor, amount_paid_minor + ?) = 0 THEN 'paid' WHEN MIN(total_minor, amount_paid_minor + ?) = 0 THEN 'unpaid' ELSE 'partial' END, updated_at = ? WHERE id = ?`,
        ).run(
          input.amountMinor,
          input.amountMinor,
          input.amountMinor,
          input.amountMinor,
          now,
          input.saleId,
        );
      }
    });
    (tx as unknown as () => void)();
    return { recorded: true };
  });

  // sales
  handle(IPC_CHANNELS["sales.create"], V.saleCreateSchema, (input) => {
    // Totals recomputed server-side would duplicate domain; for v1 the renderer uses
    // domain computeSaleTotals and main re-validates via CHECK constraints + explicit math.
    const db = getDb();
    const now = new Date().toISOString();
    void db;
    // Recompute totals in main using integer math (defense in depth).
    const subtotal = input.lines.reduce((a, l) => a + Math.round(l.unitPriceMinor * l.quantity), 0);
    let discountAmount = 0;
    if (input.discountType === "percent")
      discountAmount = Math.round((subtotal * input.discountValueMinor) / 100);
    else if (input.discountType === "amount") discountAmount = Math.round(input.discountValueMinor);
    const total = subtotal - discountAmount + input.deliveryFeeMinor;
    const remaining = total - input.amountPaidMinor;
    const status =
      total === 0
        ? "paid"
        : remaining === 0
          ? "paid"
          : input.amountPaidMinor === 0
            ? "unpaid"
            : "partial";
    const settings = { allowNegativeStock: false };
    try {
      const row = getDb()
        .prepare(`SELECT value_json FROM app_settings WHERE key = 'inventory'`)
        .get() as { value_json: string } | undefined;
      if (row)
        settings.allowNegativeStock =
          (JSON.parse(row.value_json) as { allowNegativeStock?: boolean }).allowNegativeStock ===
          true;
    } catch {
      /* default */
    }
    const result = Sales.createSaleAtomic({
      operationId: input.operationId,
      uuid: randomUUID(),
      invoiceNumber: "",
      customerId: input.customerId ?? null,
      subtotalMinor: subtotal,
      discountType: input.discountType,
      discountValueMinor: Math.round(input.discountValueMinor),
      discountAmountMinor: discountAmount,
      deliveryFeeMinor: input.deliveryFeeMinor,
      totalMinor: total,
      amountPaidMinor: input.amountPaidMinor,
      remainingMinor: remaining,
      paymentStatus: status,
      paymentMethod: input.paymentMethod ?? (input.amountPaidMinor > 0 ? "cash" : null),
      lines: input.lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        unitCode: l.unitCode,
        unitPriceMinor: l.unitPriceMinor,
        purchasePriceMinor: l.purchasePriceMinor,
        quantity: l.quantity,
      })),
      lineTotals: input.lines.map((l) => Math.round(l.unitPriceMinor * l.quantity)),
      now,
      allowNegativeStock: settings.allowNegativeStock,
    });
    return result;
  });
  handle(
    IPC_CHANNELS["sales.history"],
    V.paginationSchema.extend({ query: V.productSearchSchema.shape.query }),
    (input) => {
      const db = getDb();
      const total = (db.prepare(`SELECT COUNT(*) AS c FROM sales`).get() as { c: number }).c;
      const rows = db
        .prepare(
          `SELECT s.*, c.search_name AS customer_name FROM sales s LEFT JOIN customers c ON c.id = s.customer_id ORDER BY s.id DESC LIMIT ? OFFSET ?`,
        )
        .all(input.pageSize, (input.page - 1) * input.pageSize);
      return { rows, total };
    },
  );
  handle(IPC_CHANNELS["sales.cancel"], V.idSchema, (input) => {
    Sales.cancelSaleAtomic(input.id, new Date().toISOString(), randomUUID());
    return { cancelled: true };
  });
  handle(IPC_CHANNELS["sales.get"], V.idSchema, (input) => {
    const db = getDb();
    const sale = db.prepare(`SELECT * FROM sales WHERE id = ?`).get(input.id);
    if (!sale) throw new Error("Vente introuvable.");
    const items = db.prepare(`SELECT * FROM sale_items WHERE sale_id = ?`).all(input.id);
    const payments = db.prepare(`SELECT * FROM sale_payments WHERE sale_id = ?`).all(input.id);
    return { sale, items, payments };
  });
  handle(IPC_CHANNELS["customers.get"], V.idSchema, (input) => {
    const db = getDb();
    const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(input.id);
    if (!customer) throw new Error("Client introuvable.");
    return { customer };
  });
  handle(IPC_CHANNELS["reports.period"], null, (raw) => {
    const db = getDb();
    const { from, to } = (raw ?? {}) as { from?: string; to?: string };
    const start = typeof from === "string" ? from : "2000-01-01";
    const end = typeof to === "string" ? to : "2100-01-01";
    const sales = db
      .prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(total_minor),0) AS t, COALESCE(SUM(amount_paid_minor),0) AS p
       FROM sales WHERE substr(created_at,1,10) BETWEEN ? AND ? AND is_cancelled = 0`,
      )
      .get(start, end);
    const expenses = db
      .prepare(
        `SELECT COALESCE(SUM(amount_minor),0) AS e FROM expenses WHERE expense_date BETWEEN ? AND ?`,
      )
      .get(start, end);
    return { sales, expenses, from: start, to: end };
  });

  // reports/dashboard
  handle(IPC_CHANNELS["reports.dashboard"], null, () => {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const salesToday = db
      .prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(total_minor),0) AS t FROM sales WHERE substr(created_at,1,10) = ? AND is_cancelled = 0`,
      )
      .get(today) as { n: number; t: number };
    const debt = db
      .prepare(`SELECT COALESCE(SUM(outstanding_balance_minor),0) AS d FROM customers`)
      .get() as { d: number };
    const inv = db
      .prepare(
        `SELECT COALESCE(SUM(quantity * selling_price_minor),0) AS v, COUNT(*) AS low FROM products WHERE is_active = 1`,
      )
      .get() as { v: number; low: number };
    const low = db
      .prepare(
        `SELECT COUNT(*) AS c FROM products WHERE is_active = 1 AND quantity <= min_stock_level`,
      )
      .get() as { c: number };
    const expenses = db
      .prepare(
        `SELECT COALESCE(SUM(amount_minor),0) AS e FROM expenses WHERE substr(expense_date,1,10) = ?`,
      )
      .get(today) as { e: number };
    const top = db
      .prepare(
        `SELECT si.product_name_snapshot AS name, SUM(si.quantity) AS qty, SUM(si.line_total_minor) AS revenue
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.is_cancelled = 0 GROUP BY si.product_name_snapshot ORDER BY revenue DESC LIMIT 5`,
      )
      .all();
    const recent = db
      .prepare(
        `SELECT s.id, s.invoice_number, s.total_minor, s.payment_status, s.created_at, c.search_name AS customer_name
         FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
         WHERE s.is_cancelled = 0 ORDER BY s.id DESC LIMIT 8`,
      )
      .all();
    const supplierDebt = db
      .prepare(`SELECT COALESCE(SUM(outstanding_balance_minor),0) AS d FROM suppliers`)
      .get() as { d: number };
    return {
      salesToday,
      debt,
      inventoryValue: inv.v,
      lowStock: low.c,
      expensesToday: expenses.e,
      top,
      recent,
      supplierDebt: supplierDebt.d,
    };
  });

  // expenses
  handle(IPC_CHANNELS["expenses.create"], V.expenseCreateSchema, (input) => {
    const db = getDb();
    const now = new Date().toISOString();
    const r = db
      .prepare(
        `INSERT INTO expenses (uuid, description, category, amount_minor, expense_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.description,
        input.category,
        input.amountMinor,
        input.expenseDate,
        now,
        now,
      );
    return { id: Number(r.lastInsertRowid) };
  });
  handle(IPC_CHANNELS["expenses.list"], V.paginationSchema, (input) => {
    const db = getDb();
    const total = (db.prepare(`SELECT COUNT(*) AS c FROM expenses`).get() as { c: number }).c;
    const rows = db
      .prepare(`SELECT * FROM expenses ORDER BY expense_date DESC, id DESC LIMIT ? OFFSET ?`)
      .all(input.pageSize, (input.page - 1) * input.pageSize);
    return { rows, total };
  });

  // company
  handle(IPC_CHANNELS["company.get"], null, () => {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM company_profile WHERE id = 1`).get() as
      | Record<string, unknown>
      | undefined;
    return { company: row ?? null };
  });
  handle(IPC_CHANNELS["company.update"], null, (raw) => {
    const db = getDb();
    const input = raw as Record<string, string>;
    const now = new Date().toISOString();
    const exists = db.prepare(`SELECT id FROM company_profile WHERE id = 1`).get() as
      | { id: number }
      | undefined;
    if (!exists) {
      db.prepare(
        `INSERT INTO company_profile (id, uuid, company_name, phone, address, city, invoice_prefix, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        randomUUID(),
        input["company_name"] ?? "Veloria",
        input["phone"] ?? null,
        input["address"] ?? null,
        input["city"] ?? null,
        input["invoice_prefix"] ?? "FAC",
        now,
        now,
      );
    } else {
      db.prepare(
        `UPDATE company_profile SET company_name = COALESCE(?, company_name), phone = ?, address = ?, city = ?, invoice_prefix = ?, updated_at = ? WHERE id = 1`,
      ).run(
        input["company_name"] ?? null,
        input["phone"] ?? null,
        input["address"] ?? null,
        input["city"] ?? null,
        input["invoice_prefix"] ?? null,
        now,
      );
    }
    return { saved: true };
  });

  // backup / printing are registered by their modules (backup.ts / printing.ts)

  // database integrity + relocation info
  handle(IPC_CHANNELS["database.integrity"], null, () => integrityCheck());
  handle(IPC_CHANNELS["database.relocate"], null, (raw: unknown) => {
    const obj = (typeof raw === "object" && raw !== null ? raw : {}) as { path?: unknown };
    const target = typeof obj.path === "string" ? obj.path : "";
    if (!target.toLowerCase().endsWith(".sqlite")) {
      throw new Error("Le chemin de la base doit se terminer par .sqlite");
    }
    // Actual file move is performed after verified copy; v1 reports readiness.
    return { validated: target.length > 0, currentPath: getConfiguredDbPath() };
  });

  // app diagnostics (Settings > Diagnostics)
  handle(IPC_CHANNELS["app.diagnostics"], null, () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app }: typeof import("electron") = require("electron");
    const check = integrityCheck();
    return {
      version: app.getVersion(),
      dbPath: getConfiguredDbPath(),
      integrity: check.integrity,
      logicalName: LOGICAL_DB_NAME,
    };
  });
  handle(IPC_CHANNELS["system.selectFolder"], null, () => ({ folder: getDataFolder() }));

  // returns (atomic: return + restock + refund/credit + audit)
  handle(IPC_CHANNELS["returns.create"], V.returnCreateSchema, (input) => {
    const db = getDb();
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      const sale = db.prepare(`SELECT * FROM sales WHERE id = ?`).get(input.originalSaleId) as
        | {
            invoice_number: string;
            customer_id: number | null;
          }
        | undefined;
      if (!sale) throw new Error("Vente d'origine introuvable.");
      let totalReturn = 0;
      const prepared: {
        productId: number | null;
        name: string;
        qty: number;
        unitPrice: number;
        purchase: number;
        restocked: boolean;
        lineTotal: number;
      }[] = [];
      for (const item of input.items) {
        const sold = db
          .prepare(
            `SELECT product_id, product_name_snapshot, unit_price_minor, purchase_price_minor, quantity FROM sale_items WHERE sale_id = ? AND (product_id IS ? OR product_id = ?) LIMIT 1`,
          )
          .get(input.originalSaleId, item.productId, item.productId) as
          | {
              product_id: number | null;
              product_name_snapshot: string;
              unit_price_minor: number;
              purchase_price_minor: number;
              quantity: number;
            }
          | undefined;
        if (!sold) throw new Error("Ligne de vente introuvable pour ce retour.");
        const already = (
          db
            .prepare(
              `SELECT COALESCE(SUM(ri.quantity),0) AS q FROM return_items ri JOIN returns r ON r.id = ri.return_id WHERE r.original_sale_id = ? AND (ri.product_id IS ? OR ri.product_id = ?)`,
            )
            .get(input.originalSaleId, item.productId, item.productId) as { q: number }
        ).q;
        const eligible = Number(sold.quantity) - Number(already);
        if (item.quantity > eligible) {
          throw new Error(
            `Quantité retournée supérieure à l'éligible (${eligible}) pour « ${sold.product_name_snapshot} ».`,
          );
        }
        const lineTotal = Math.round(sold.unit_price_minor * item.quantity);
        totalReturn += lineTotal;
        prepared.push({
          productId: sold.product_id,
          name: sold.product_name_snapshot,
          qty: item.quantity,
          unitPrice: sold.unit_price_minor,
          purchase: sold.purchase_price_minor,
          restocked: item.restocked,
          lineTotal,
        });
      }
      const r = db
        .prepare(
          `INSERT INTO returns (uuid, original_sale_id, original_invoice_number, customer_id, total_return_value_minor, amount_refunded_minor, credit_to_customer_minor, reason, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          input.originalSaleId,
          sale.invoice_number,
          sale.customer_id,
          totalReturn,
          input.refundMinor,
          input.creditMinor,
          input.reason || null,
          now,
          now,
        );
      const returnId = Number(r.lastInsertRowid);
      for (const p of prepared) {
        db.prepare(
          `INSERT INTO return_items (return_id, product_id, product_name_snapshot, quantity, unit_price_minor, purchase_price_minor, restocked, line_total_minor)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          returnId,
          p.productId,
          p.name,
          p.qty,
          p.unitPrice,
          p.purchase,
          p.restocked ? 1 : 0,
          p.lineTotal,
        );
        if (p.restocked && p.productId != null) {
          const prod = db
            .prepare(`SELECT quantity FROM products WHERE id = ?`)
            .get(p.productId) as { quantity: number };
          const after = Number(prod.quantity) + p.qty;
          db.prepare(`UPDATE products SET quantity = ?, updated_at = ? WHERE id = ?`).run(
            after,
            now,
            p.productId,
          );
          db.prepare(
            `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, unit_cost_minor, related_entity_type, related_entity_id, reason, created_at)
             VALUES (?, ?, 'return_in', ?, ?, ?, 'return', ?, 'Retour client', ?)`,
          ).run(randomUUID(), p.productId, p.qty, after, p.purchase, String(returnId), now);
        }
      }
      if (input.creditMinor > 0 && sale.customer_id != null) {
        db.prepare(
          `UPDATE customers SET outstanding_balance_minor = MAX(0, outstanding_balance_minor - ?) WHERE id = ?`,
        ).run(input.creditMinor, sale.customer_id);
      }
      db.prepare(
        `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'return.created', 'return', ?, ?, ?, ?)`,
      ).run(
        randomUUID(),
        String(returnId),
        randomUUID(),
        JSON.stringify({ sale: input.originalSaleId, total: totalReturn }),
        now,
      );
      return { id: returnId, totalReturnMinor: totalReturn };
    });
    return (tx as unknown as () => { id: number; totalReturnMinor: number })();
  });
  handle(IPC_CHANNELS["returns.list"], V.paginationSchema, (input) => {
    const db = getDb();
    const total = (db.prepare(`SELECT COUNT(*) AS c FROM returns`).get() as { c: number }).c;
    const rows = db
      .prepare(`SELECT * FROM returns ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(input.pageSize, (input.page - 1) * input.pageSize);
    return { rows, total };
  });

  // Printing IPC is owned by electron/printing/printing.service.ts
  // (registerPrintingIpc). Do NOT register printing.* channels here:
  // ipcMain.handle throws on duplicate registration and aborts startup
  // before createMainWindow (found during Phase 3 runtime QA).

  // ---- Phase 6 : stock ----
  handle(IPC_CHANNELS["stock.overview"], null, () => Inventory.getStockOverview());
  handle(IPC_CHANNELS["stock.lowStock"], V.paginationSchema, (input) => ({
    rows: Inventory.listLowStock(input.pageSize),
  }));
  handle(IPC_CHANNELS["stock.ledger"], V.idSchema, (input) => ({
    rows: Inventory.getLedger(input.id, 100),
  }));
  handle(IPC_CHANNELS["stock.adjust"], V.stockAdjustSchema, (input) =>
    Inventory.adjustStockAtomic({
      productId: input.productId,
      newQuantity: input.newQuantity,
      reason: input.reason,
      operationId: randomUUID(),
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["stock.intake"], V.stockIntakeSchema, (input) =>
    Inventory.receiveStockAtomic({
      supplierId: input.supplierId ?? null,
      invoiceNumber: input.invoiceNumber ?? null,
      invoiceDate: input.invoiceDate,
      shippingMinor: input.shippingMinor,
      notes: input.notes ?? null,
      lines: input.lines.map((l) => ({
        productId: l.productId ?? null,
        productName: l.productName,
        quantityReceived: l.quantityReceived,
        quantityDamaged: l.quantityDamaged,
        purchasePriceMinor: l.purchasePriceMinor,
      })),
      operationId: randomUUID(),
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["stock.intakes"], V.paginationSchema, (input) =>
    Inventory.listIntakes(input.page, input.pageSize),
  );
  handle(IPC_CHANNELS["stock.valuation"], null, () => Inventory.getInventoryValuation());

  // ---- Phase 6 : fournisseurs ----
  handle(IPC_CHANNELS["suppliers.search"], V.productSearchSchema, (input) =>
    Suppliers.searchSuppliers(input.query, input.page, input.pageSize),
  );
  handle(IPC_CHANNELS["suppliers.create"], V.supplierCreateSchema, (input) => ({
    id: Suppliers.createSupplier({
      name: input.name,
      contact: input.contact ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      now: new Date().toISOString(),
    }),
  }));
  handle(IPC_CHANNELS["suppliers.pay"], V.supplierPaySchema, (input) => {
    Suppliers.recordSupplierPaymentAtomic({
      supplierId: input.supplierId,
      amountMinor: input.amountMinor,
      method: input.method,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      paymentDate: input.paymentDate,
      operationId: randomUUID(),
      now: new Date().toISOString(),
    });
    return { paid: true };
  });
  handle(IPC_CHANNELS["suppliers.statement"], V.idSchema, (input) =>
    Suppliers.getSupplierStatement(input.id),
  );

  // ---- Phase 7 : proformas ----
  handle(IPC_CHANNELS["proformas.create"], V.proformaCreateSchema, (input) =>
    Proformas.createProformaAtomic({
      customerId: input.customerId ?? null,
      lines: input.lines.map((l) => ({
        productId: l.productId ?? null,
        productName: l.productName,
        unitPriceMinor: l.unitPriceMinor,
        quantity: l.quantity,
      })),
      discountMinor: input.discountMinor,
      deliveryMinor: input.deliveryMinor,
      dueDate: input.dueDate ?? null,
      notes: input.notes ?? null,
      operationId: randomUUID(),
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["proformas.list"], V.proformaListSchema, (input) =>
    Proformas.listProformas(input.status ?? null, input.page, input.pageSize),
  );
  handle(IPC_CHANNELS["proformas.status"], V.proformaStatusSchema, (input) => {
    Proformas.setProformaStatus(input.id, input.to, new Date().toISOString());
    return { updated: true };
  });
  handle(IPC_CHANNELS["proformas.convert"], V.proformaConvertSchema, (input) =>
    Proformas.convertProformaToSaleAtomic({
      proformaId: input.proformaId,
      amountPaidMinor: input.amountPaidMinor,
      paymentMethod: input.paymentMethod ?? null,
      operationId: randomUUID(),
      now: new Date().toISOString(),
    }),
  );

  // ---- Phase 8 : dettes / rapports / clôtures / zakat ----
  handle(IPC_CHANNELS["debts.list"], V.debtsListSchema, (input) =>
    Finance.listDebts(input.filter, input.page, input.pageSize),
  );
  handle(IPC_CHANNELS["reports.full"], V.periodSchema, (input) =>
    Finance.getPeriodReport(input.from, input.to),
  );
  handle(IPC_CHANNELS["closings.get"], V.closingsListSchema, (input) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT * FROM daily_closings WHERE business_date BETWEEN ? AND ? ORDER BY business_date DESC`,
      )
      .all(input.from, input.to);
    return { rows };
  });
  handle(IPC_CHANNELS["closings.create"], V.closingCreateSchema, (input) =>
    Finance.createDailyClosingAtomic({
      businessDate: input.businessDate,
      openingMinor: input.openingMinor,
      operationId: randomUUID(),
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["zakat.sources"], null, () => Finance.getZakatSources());
  handle(IPC_CHANNELS["zakat.saveParams"], V.zakatParamsSchema, (input) => {
    const db = getDb();
    db.prepare(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES ('zakat', ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    ).run(JSON.stringify(input), new Date().toISOString());
    return { saved: true };
  });

  // ---- Phase 9 : pain ----
  handle(IPC_CHANNELS["bread.create"], V.breadCreateSchema, (input) =>
    Bread.createBreadOrderAtomic({
      customerId: input.customerId ?? null,
      customName: input.customName ?? null,
      pickupDate: input.pickupDate,
      pickupTime: input.pickupTime ?? null,
      quantity: input.quantity,
      unitPriceMinor: input.unitPriceMinor,
      amountPaidMinor: input.amountPaidMinor,
      notes: input.notes ?? null,
      operationId: randomUUID(),
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["bread.list"], V.breadListSchema, (input) =>
    Bread.listBreadOrders(input.pickupDate ?? null, input.page, input.pageSize),
  );
  handle(IPC_CHANNELS["bread.pay"], V.breadPaySchema, (input) => {
    Bread.recordBreadPayment(input.id, input.amountMinor, new Date().toISOString());
    return { paid: true };
  });
  handle(IPC_CHANNELS["bread.pickup"], V.breadPickupSchema, (input) => {
    Bread.setBreadPickup(input.id, input.to, new Date().toISOString());
    return { updated: true };
  });
  handle(IPC_CHANNELS["bread.transfer"], V.idSchema, (input) => {
    Bread.transferBreadToCustomerAccount(input.id, new Date().toISOString());
    return { transferred: true };
  });

  // ---- Clients : mise à jour + relevé ----
  handle(IPC_CHANNELS["customers.update"], V.customerUpdateSchema, (input) => {
    const db = getDb();
    const now = new Date().toISOString();
    const search = `${input.firstName} ${input.lastName}`.trim().toLowerCase();
    db.prepare(
      `UPDATE customers SET first_name = ?, last_name = ?, search_name = ?, phone = ?, address = ?, credit_limit_minor = ?, updated_at = ? WHERE id = ?`,
    ).run(
      input.firstName.trim(),
      input.lastName.trim(),
      search,
      input.phone?.trim() || null,
      input.address?.trim() || null,
      input.creditLimitMinor,
      now,
      input.id,
    );
    return { updated: true };
  });
  handle(IPC_CHANNELS["customers.statement"], V.idSchema, (input) => {
    const db = getDb();
    const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(input.id);
    if (!customer) throw new Error("Client introuvable.");
    const sales = db
      .prepare(`SELECT * FROM sales WHERE customer_id = ? ORDER BY id DESC LIMIT 100`)
      .all(input.id);
    const payments = db
      .prepare(`SELECT * FROM sale_payments WHERE customer_id = ? ORDER BY id DESC LIMIT 100`)
      .all(input.id);
    return { customer, sales, payments };
  });

  // ---- Réglages explicites (inventaire) ----
  handle(IPC_CHANNELS["settings.get"], V.settingsGetSchema, (input) => {
    const db = getDb();
    const row = db.prepare(`SELECT value_json FROM app_settings WHERE key = ?`).get(input.key) as
      | { value_json: string }
      | undefined;
    if (!row) return { value: { allowNegativeStock: false } };
    return { value: JSON.parse(row.value_json) as { allowNegativeStock: boolean } };
  });
  handle(IPC_CHANNELS["settings.save"], V.settingsSaveSchema, (input) => {
    const db = getDb();
    db.prepare(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    ).run(input.key, JSON.stringify(input.value), new Date().toISOString());
    return { saved: true };
  });

  // ---- Import CSV validé-avant-commit ----
  handle(IPC_CHANNELS["products.import"], V.productsImportSchema, (input) =>
    Imports.importProductsAtomic(input.rows, new Date().toISOString()),
  );
  handle(IPC_CHANNELS["customers.import"], V.customersImportSchema, (input) =>
    Imports.importCustomersAtomic(input.rows, new Date().toISOString()),
  );

  void getDbPath;
}
