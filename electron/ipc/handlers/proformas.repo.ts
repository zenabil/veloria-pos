// Veloria PoS — Main-process repository: proformas (Phase 7).
// Création + transitions + conversion en vente (atomique, idempotente).

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { createSaleAtomic } from "./sales.repo";

export interface ProformaLineInput {
  productId: number | null;
  productName: string;
  unitPriceMinor: number;
  quantity: number;
}

function allocateNumber(prefix: string, key: string, now: string): string {
  const db = getDb();
  const row = db
    .prepare(`SELECT prefix, next_value FROM number_sequences WHERE sequence_key = ?`)
    .get(key) as { prefix: string; next_value: number };
  const num = `${prefix || row.prefix}-${new Date().getFullYear()}-${String(row.next_value).padStart(5, "0")}`;
  db.prepare(
    `UPDATE number_sequences SET next_value = next_value + 1, updated_at = ? WHERE sequence_key = ?`,
  ).run(now, key);
  return num;
}

export function createProformaAtomic(args: {
  customerId: number | null;
  lines: ProformaLineInput[];
  discountMinor: number;
  deliveryMinor: number;
  dueDate: string | null;
  notes: string | null;
  operationId: string;
  now: string;
}): { id: number; number: string } {
  const db = getDb();
  const tx = db.transaction(() => {
    let subtotal = 0;
    const prepared: {
      pid: number | null;
      name: string;
      price: number;
      qty: number;
      total: number;
    }[] = [];
    for (const l of args.lines) {
      if (l.productName.trim().length === 0) throw new Error("Ligne sans nom.");
      if (!(l.quantity > 0)) throw new Error("Quantité de ligne invalide.");
      if (!Number.isInteger(l.unitPriceMinor) || l.unitPriceMinor < 0) {
        throw new Error("Prix de ligne invalide.");
      }
      const total = Math.round(l.unitPriceMinor * l.quantity);
      subtotal += total;
      prepared.push({
        pid: l.productId,
        name: l.productName.trim(),
        price: l.unitPriceMinor,
        qty: l.quantity,
        total,
      });
    }
    if (prepared.length === 0) throw new Error("Devis vide.");
    if (args.discountMinor > subtotal) throw new Error("La remise dépasse le sous-total.");
    const total = subtotal - args.discountMinor + args.deliveryMinor;
    const number = allocateNumber("PRO", "proforma", args.now);
    const r = db
      .prepare(
        `INSERT INTO proforma_invoices (uuid, proforma_number, customer_id, subtotal_minor, discount_amount_minor, delivery_fee_minor, total_minor, status, due_date, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        number,
        args.customerId,
        subtotal,
        args.discountMinor,
        args.deliveryMinor,
        total,
        args.dueDate,
        args.notes?.trim() || null,
        args.now,
        args.now,
      );
    const id = Number(r.lastInsertRowid);
    for (const p of prepared) {
      db.prepare(
        `INSERT INTO proforma_items (proforma_id, product_id, product_name_snapshot, unit_price_minor, quantity, line_total_minor) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, p.pid, p.name, p.price, p.qty, p.total);
    }
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'proforma.created', 'proforma', ?, ?, ?, ?)`,
    ).run(randomUUID(), String(id), args.operationId, JSON.stringify({ number, total }), args.now);
    return { id, number };
  });
  return (tx as unknown as () => { id: number; number: string })();
}

export function setProformaStatus(id: number, to: string, now: string): void {
  const db = getDb();
  const row = db.prepare(`SELECT status FROM proforma_invoices WHERE id = ?`).get(id) as
    | { status: string }
    | undefined;
  if (!row) throw new Error("Proforma introuvable.");
  const allowed: Record<string, string[]> = {
    draft: ["sent", "cancelled"],
    sent: ["converted", "cancelled"],
    converted: [],
    cancelled: [],
  };
  if (!(allowed[row.status] ?? []).includes(to)) {
    throw new Error(`Transition interdite : ${row.status} → ${to}.`);
  }
  db.prepare(`UPDATE proforma_invoices SET status = ?, updated_at = ? WHERE id = ?`).run(
    to,
    now,
    id,
  );
}

export function listProformas(
  status: string | null,
  page: number,
  pageSize: number,
): {
  rows: unknown[];
  total: number;
} {
  const db = getDb();
  const where = status ? `WHERE p.status = ?` : "";
  const params: unknown[] = status ? [status] : [];
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM proforma_invoices p ${where}`).get(...params) as {
      c: number;
    }
  ).c;
  const rows = db
    .prepare(
      `SELECT p.*, c.search_name AS customer_name FROM proforma_invoices p LEFT JOIN customers c ON c.id = p.customer_id ${where} ORDER BY p.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  return { rows, total };
}

export function convertProformaToSaleAtomic(args: {
  proformaId: number;
  amountPaidMinor: number;
  paymentMethod: string | null;
  operationId: string;
  now: string;
}): { saleId: number; invoiceNumber: string } {
  const db = getDb();
  const tx = db.transaction(() => {
    const pro = db.prepare(`SELECT * FROM proforma_invoices WHERE id = ?`).get(args.proformaId) as
      | Record<string, unknown>
      | undefined;
    if (!pro) throw new Error("Proforma introuvable.");
    if (pro["status"] === "converted") throw new Error("Proforma déjà convertie.");
    if (pro["status"] === "cancelled") throw new Error("Proforma annulée.");
    const items = db
      .prepare(`SELECT * FROM proforma_items WHERE proforma_id = ?`)
      .all(args.proformaId) as {
      product_id: number | null;
      product_name_snapshot: string;
      unit_price_minor: number;
      quantity: number;
      line_total_minor: number;
    }[];
    if (items.length === 0) throw new Error("Proforma sans lignes.");
    const subtotal = Number(pro["subtotal_minor"]);
    const discount = Number(pro["discount_amount_minor"]);
    const delivery = Number(pro["delivery_fee_minor"]);
    const total = Number(pro["total_minor"]);
    if (args.amountPaidMinor > total) throw new Error("Le montant payé dépasse le total.");
    const remaining = total - args.amountPaidMinor;
    const status = remaining === 0 ? "paid" : args.amountPaidMinor === 0 ? "unpaid" : "partial";
    const settings = { allowNegativeStock: false };
    try {
      const s = db.prepare(`SELECT value_json FROM app_settings WHERE key = 'inventory'`).get() as
        | { value_json: string }
        | undefined;
      if (s)
        settings.allowNegativeStock =
          (JSON.parse(s.value_json) as { allowNegativeStock?: boolean }).allowNegativeStock ===
          true;
    } catch {
      /* défaut */
    }
    const res = createSaleAtomic({
      operationId: args.operationId,
      uuid: randomUUID(),
      invoiceNumber: "",
      customerId: (pro["customer_id"] as number | null) ?? null,
      subtotalMinor: subtotal,
      discountType: discount > 0 ? "amount" : "none",
      discountValueMinor: discount,
      discountAmountMinor: discount,
      deliveryFeeMinor: delivery,
      totalMinor: total,
      amountPaidMinor: args.amountPaidMinor,
      remainingMinor: remaining,
      paymentStatus: status,
      paymentMethod: args.paymentMethod,
      lines: items.map((it) => ({
        productId: it.product_id,
        productName: it.product_name_snapshot,
        unitCode: "PIECE",
        unitPriceMinor: it.unit_price_minor,
        purchasePriceMinor: 0,
        quantity: Number(it.quantity),
      })),
      lineTotals: items.map((it) => it.line_total_minor),
      now: args.now,
      allowNegativeStock: settings.allowNegativeStock,
    });
    db.prepare(
      `UPDATE proforma_invoices SET status = 'converted', converted_sale_id = ?, updated_at = ? WHERE id = ?`,
    ).run(res.saleId, args.now, args.proformaId);
    return res;
  });
  return (tx as unknown as () => { saleId: number; invoiceNumber: string })();
}
