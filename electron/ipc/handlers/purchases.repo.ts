// Veloria PoS — Main-process repository: bons de commande fournisseurs (P3).
// Cycle draft → ordered → partially_received → received (+ cancelled).
// La réception crée des entrées de stock (receiveStockAtomic, même tx imbriquée
// savepoint) — jamais de stock sans traçabilité commande. Idempotence par
// operationId appelant (retry/double-clic rejoue, jamais de doublon).

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { formatInvoiceNumber } from "./numbers";
import { claimIdempotency, peekIdempotency, storeIdempotencyResult } from "./idempotency";
import { receiveStockAtomic } from "./inventory.repo";

export interface PurchaseLineInput {
  productId: number | null;
  productName: string;
  unitCode: string;
  quantityOrdered: number;
  unitCostMinor: number;
}

// Miroir de domain/suppliers/po-rules.ts (electron ne peut pas importer src/ :
// rootDir — même convention que validators/fifo). Toute modification ici doit
// être répercutée là-bas (test de parité : tests/unit/p3-po.test.ts).
const PO_TRANSITIONS: Record<string, string[]> = {
  draft: ["ordered", "cancelled"],
  ordered: ["partially_received", "received", "cancelled"],
  partially_received: ["received"],
  received: [],
  cancelled: [],
};

function allocatePurchaseOrderNumber(now: string): string {
  const db = getDb();
  const seq = db
    .prepare(
      `SELECT prefix, next_value FROM number_sequences WHERE sequence_key = 'purchase_order'`,
    )
    .get() as { prefix: string; next_value: number };
  const year = Number(String(now).slice(0, 4)) || new Date().getFullYear();
  const num = formatInvoiceNumber(seq.prefix || "CMD", year, seq.next_value);
  db.prepare(
    `UPDATE number_sequences SET next_value = next_value + 1, updated_at = ? WHERE sequence_key = 'purchase_order'`,
  ).run(now);
  return num;
}

function orderRow(id: number): Record<string, unknown> | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM purchase_orders WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
}

export function createPurchaseOrderAtomic(args: {
  supplierId: number;
  expectedDate: string | null;
  notes: string | null;
  lines: PurchaseLineInput[];
  operationId: string;
  now: string;
}): { id: number; number: string } {
  const db = getDb();
  const fast = peekIdempotency<{ id: number; number: string }>(args.operationId, "purchase.create");
  if (fast) return fast;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "purchase.create", args.now);
    const sup = db.prepare(`SELECT id FROM suppliers WHERE id = ?`).get(args.supplierId) as
      | { id: number }
      | undefined;
    if (!sup) throw new Error("Fournisseur introuvable.");
    if (args.lines.length === 0) throw new Error("Commande vide.");
    if (args.lines.length > 200) throw new Error("Commande trop volumineuse (max 200 lignes).");
    let subtotal = 0;
    for (const l of args.lines) {
      if (l.productName.trim().length === 0) throw new Error("Nom de produit manquant.");
      if (!(l.quantityOrdered > 0)) throw new Error("Quantité commandée invalide.");
      if (!Number.isInteger(l.unitCostMinor) || l.unitCostMinor < 0) {
        throw new Error("Coût unitaire invalide.");
      }
      subtotal += Math.round(l.unitCostMinor * l.quantityOrdered);
    }
    const number = allocatePurchaseOrderNumber(args.now);
    const r = db
      .prepare(
        `INSERT INTO purchase_orders (uuid, order_number, supplier_id, status, subtotal_minor, total_minor, expected_date, notes, operation_id, created_at, updated_at)
         VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        number,
        args.supplierId,
        subtotal,
        subtotal,
        args.expectedDate,
        args.notes?.trim() || null,
        args.operationId,
        args.now,
        args.now,
      );
    const id = Number(r.lastInsertRowid);
    for (const l of args.lines) {
      db.prepare(
        `INSERT INTO purchase_order_items (po_id, product_id, product_name_snapshot, unit_code, quantity_ordered, quantity_received, unit_cost_minor, line_total_minor)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      ).run(
        id,
        l.productId,
        l.productName.trim(),
        (l.unitCode || "PIECE").trim() || "PIECE",
        l.quantityOrdered,
        l.unitCostMinor,
        Math.round(l.unitCostMinor * l.quantityOrdered),
      );
    }
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'purchase.created', 'purchase', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(id),
      args.operationId,
      JSON.stringify({ number, total: subtotal, supplierId: args.supplierId }),
      args.now,
    );
    const out = { id, number };
    storeIdempotencyResult(args.operationId, out);
    return out;
  });
  try {
    return (tx as unknown as () => { id: number; number: string })();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ id: number; number: string }>(
        args.operationId,
        "purchase.create",
      );
      if (retry) return retry;
    }
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: purchase_orders\.order_number/i.test(err.message)
    ) {
      try {
        db.prepare(
          `UPDATE number_sequences SET next_value = next_value + 1, updated_at = ? WHERE sequence_key = 'purchase_order'`,
        ).run(args.now);
      } catch {
        /* best-effort */
      }
      return (tx as unknown as () => { id: number; number: string })();
    }
    throw err;
  }
}

export function listPurchaseOrders(args: {
  supplierId: number | null;
  status: string | null;
  page: number;
  pageSize: number;
}): { rows: unknown[]; total: number } {
  const db = getDb();
  const conds: string[] = [];
  const params: unknown[] = [];
  if (args.supplierId != null) {
    conds.push("po.supplier_id = ?");
    params.push(args.supplierId);
  }
  if (args.status != null) {
    conds.push("po.status = ?");
    params.push(args.status);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM purchase_orders po ${where}`).get(...params) as {
      c: number;
    }
  ).c;
  const rows = db
    .prepare(
      `SELECT po.*, s.name AS supplier_name FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po.supplier_id
       ${where} ORDER BY po.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, args.pageSize, (args.page - 1) * args.pageSize);
  return { rows, total };
}

export function getPurchaseOrder(id: number): { order: unknown; items: unknown[] } {
  const db = getDb();
  const order = orderRow(id);
  if (!order) throw new Error("Commande introuvable.");
  const items = db
    .prepare(`SELECT * FROM purchase_order_items WHERE po_id = ? ORDER BY id ASC`)
    .all(id);
  return { order, items };
}

function transitionPurchaseOrder(
  id: number,
  to: string,
  operationId: string,
  opType: string,
  now: string,
  eventType: string,
): void {
  const db = getDb();
  const fast = peekIdempotency<{ updated: boolean }>(operationId, opType);
  if (fast) return;
  const tx = db.transaction(() => {
    claimIdempotency(operationId, opType, now);
    const o = orderRow(id);
    if (!o) throw new Error("Commande introuvable.");
    const from = String(o["status"]);
    const allowed = PO_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new Error(`Transition commande interdite : ${from} → ${to}.`);
    }
    // A1-P0 : garde anti-perte-mise-à-jour (commande vs annulation concurrentes :
    // le perdant échoue au lieu d'écraser le statut du gagnant).
    const r = db
      .prepare(`UPDATE purchase_orders SET status = ?, updated_at = ? WHERE id = ? AND status = ?`)
      .run(to, now, id, from);
    if (Number(r.changes) !== 1) {
      throw new Error("Commande modifiée par une autre opération. Veuillez réessayer.");
    }
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, ?, 'purchase', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      eventType,
      String(id),
      operationId,
      JSON.stringify({ from: String(o["status"]), to }),
      now,
    );
    storeIdempotencyResult(operationId, { updated: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ updated: boolean }>(operationId, opType);
      if (retry) return;
    }
    throw err;
  }
}

export function orderPurchaseOrder(id: number, operationId: string, now: string): void {
  transitionPurchaseOrder(id, "ordered", operationId, "purchase.order", now, "purchase.ordered");
}

export function cancelPurchaseOrder(id: number, operationId: string, now: string): void {
  transitionPurchaseOrder(
    id,
    "cancelled",
    operationId,
    "purchase.cancel",
    now,
    "purchase.cancelled",
  );
}

export function receivePurchaseOrderAtomic(args: {
  id: number;
  lines: { itemId: number; quantityReceived: number }[];
  operationId: string;
  now: string;
  /** Auteur de la réception (session main, 0046). */
  staffUserId?: number | null;
}): { intakeId: number } {
  const db = getDb();
  const fast = peekIdempotency<{ intakeId: number }>(args.operationId, "purchase.receive");
  if (fast) return fast;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "purchase.receive", args.now);
    const o = orderRow(args.id);
    if (!o) throw new Error("Commande introuvable.");
    const status = String(o["status"]);
    if (status !== "ordered" && status !== "partially_received") {
      throw new Error(`Commande non réceptionnable (statut : ${status}).`);
    }
    if (args.lines.length === 0) throw new Error("Aucune ligne à réceptionner.");
    // M3 : doublon rejeté aussi en tx (défense en profondeur — le contrôle
    // snapshotté ci-dessous ne verrait jamais la 2e occurrence du même itemId).
    const seenItems = new Set<number>();
    for (const l of args.lines) {
      if (seenItems.has(l.itemId)) throw new Error("Ligne de commande en double.");
      seenItems.add(l.itemId);
    }
    const items = db
      .prepare(`SELECT * FROM purchase_order_items WHERE po_id = ?`)
      .all(args.id) as Record<string, unknown>[];
    const byId = new Map<number, Record<string, unknown>>();
    for (const it of items) byId.set(Number(it["id"]), it);
    const intakeLines: {
      productId: number | null;
      productName: string;
      quantityReceived: number;
      quantityDamaged: number;
      purchasePriceMinor: number;
      sellingPriceMinor: null;
    }[] = [];
    for (const l of args.lines) {
      const it = byId.get(l.itemId);
      if (!it) throw new Error("Ligne de commande introuvable.");
      if (!(l.quantityReceived > 0)) throw new Error("Quantité reçue invalide.");
      const ordered = Number(it["quantity_ordered"]);
      const already = Number(it["quantity_received"]);
      if (l.quantityReceived + already > ordered + 1e-9) {
        throw new Error("Quantité reçue supérieure à la commandée.");
      }
      db.prepare(
        `UPDATE purchase_order_items SET quantity_received = quantity_received + ? WHERE id = ?`,
      ).run(l.quantityReceived, l.itemId);
      intakeLines.push({
        productId: it["product_id"] == null ? null : Number(it["product_id"]),
        productName: String(it["product_name_snapshot"]),
        quantityReceived: l.quantityReceived,
        quantityDamaged: 0,
        purchasePriceMinor: Number(it["unit_cost_minor"]),
        sellingPriceMinor: null,
      });
    }
    // Entrée de stock traçée (même tx imbriquée, operationId dérivé stable).
    const intake = receiveStockAtomic({
      supplierId: Number(o["supplier_id"]),
      invoiceNumber: String(o["order_number"]),
      invoiceDate: args.now.slice(0, 10),
      shippingMinor: 0,
      notes: `Réception commande ${String(o["order_number"])}`,
      lines: intakeLines,
      operationId: `${args.operationId}:intake`,
      now: args.now,
      staffUserId: args.staffUserId ?? null,
    });
    const remaining = (
      db
        .prepare(
          `SELECT COALESCE(SUM(quantity_ordered - quantity_received), 0) AS r FROM purchase_order_items WHERE po_id = ?`,
        )
        .get(args.id) as { r: number }
    ).r;
    const nextStatus = remaining > 1e-9 ? "partially_received" : "received";
    db.prepare(`UPDATE purchase_orders SET status = ?, updated_at = ? WHERE id = ?`).run(
      nextStatus,
      args.now,
      args.id,
    );
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'purchase.received', 'purchase', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(args.id),
      args.operationId,
      JSON.stringify({ intakeId: intake.intakeId, status: nextStatus }),
      args.now,
    );
    const out = { intakeId: intake.intakeId };
    storeIdempotencyResult(args.operationId, out);
    return out;
  });
  try {
    return (tx as unknown as () => { intakeId: number })();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ intakeId: number }>(args.operationId, "purchase.receive");
      if (retry) return retry;
    }
    throw err;
  }
}
