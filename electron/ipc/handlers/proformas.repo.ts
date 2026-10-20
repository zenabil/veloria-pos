// Veloria PoS — Main-process repository: proformas (Phase 7).
// Création + transitions + conversion en vente (atomique, idempotente).

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { assertOrderClause } from "./sql-guard";
import { createSaleAtomic } from "./sales.repo";
import { allocateAmountByWeights } from "./amount-allocation";
import { formatProformaNumber } from "./numbers";
import {
  auditOperationId,
  claimIdempotency,
  claimOptional,
  peekIdempotency,
  peekOptional,
  storeIdempotencyResult,
  storeOptional,
} from "./idempotency";

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
  const year = Number(String(now).slice(0, 4)) || new Date().getFullYear();
  const num = formatProformaNumber(prefix || row.prefix, year, row.next_value);
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
  terms: string | null;
  operationId: string;
  now: string;
}): { id: number; number: string } {
  const db = getDb();
  const fast = peekIdempotency<{ id: number; number: string }>(
    args.operationId,
    "proformas.create",
  );
  if (fast) return fast;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "proformas.create", args.now);
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
        `INSERT INTO proforma_invoices (uuid, proforma_number, customer_id, subtotal_minor, discount_amount_minor, delivery_fee_minor, total_minor, status, due_date, notes, terms, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
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
        args.terms?.trim() || null,
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
    const result = { id, number };
    storeIdempotencyResult(args.operationId, result);
    return result;
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
        "proformas.create",
      );
      if (retry) return retry;
    }
    // Course sur le numéro de devis : avance la séquence puis rejoue une fois.
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: proforma_invoices\.proforma_number/i.test(err.message)
    ) {
      try {
        db.prepare(
          `UPDATE number_sequences SET next_value = next_value + 1, updated_at = ? WHERE sequence_key = 'proforma'`,
        ).run(args.now);
      } catch {
        /* best-effort */
      }
      return (tx as unknown as () => { id: number; number: string })();
    }
    throw err;
  }
}

export function setProformaStatus(
  id: number,
  to: string,
  now: string,
  operationId?: string | null,
): void {
  const db = getDb();
  const fast = peekOptional<{ updated: boolean }>(operationId, "proformas.status");
  if (fast) return;
  const allowed: Record<string, string[]> = {
    draft: ["sent", "cancelled"],
    sent: ["converted", "cancelled"],
    converted: [],
    cancelled: [],
  };
  // M4 (TOCTOU) : la lecture du statut ET la mise à jour sont dans LA MÊME
  // transaction, avec garde `WHERE status = ?` — deux transitions concurrentes
  // (convert vs cancel) ne peuvent plus toutes deux passer la validation puis
  // écrire (proforma annulée dont la vente existe déjà).
  const txs = db.transaction(() => {
    const row = db.prepare(`SELECT status FROM proforma_invoices WHERE id = ?`).get(id) as
      | { status: string }
      | undefined;
    if (!row) throw new Error("Proforma introuvable.");
    if (!(allowed[row.status] ?? []).includes(to)) {
      throw new Error(`Transition interdite : ${row.status} → ${to}.`);
    }
    claimOptional(operationId, "proformas.status", now);
    const upd = db
      .prepare(
        `UPDATE proforma_invoices SET status = ?, updated_at = ? WHERE id = ? AND status = ?`,
      )
      .run(to, now, id, row.status);
    if (upd.changes !== 1) throw new Error("Transition interdite : statut modifié en parallèle.");
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'proforma.status', 'proforma', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(id),
      auditOperationId(operationId, "proforma.status", id, { from: row.status, to }),
      JSON.stringify({ from: row.status, to }),
      now,
    );
    storeOptional(operationId, { updated: true });
  });
  try {
    (txs as unknown as () => void)();
  } catch (err) {
    if (
      operationId &&
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekOptional<{ updated: boolean }>(operationId, "proformas.status");
      if (retry) return;
    }
    throw err;
  }
}

export function listProformas(
  status: string | null,
  page: number,
  pageSize: number,
  opts: {
    query?: string;
    customer?: number | null;
    from?: string | null;
    to?: string | null;
    sort?: string;
  } = {},
): {
  rows: unknown[];
  total: number;
} {
  const db = getDb();
  const conds: string[] = [];
  const params: unknown[] = [];
  if (status) {
    conds.push(`p.status = ?`);
    params.push(status);
  }
  const q = (opts.query ?? "").trim();
  if (q) {
    conds.push(`(p.proforma_number LIKE ? ESCAPE '\\' OR c.search_name LIKE ? ESCAPE '\\')`);
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    params.push(like, like);
  }
  if (opts.customer) {
    conds.push(`p.customer_id = ?`);
    params.push(opts.customer);
  }
  if (opts.from) {
    conds.push(`substr(p.created_at, 1, 10) >= ?`);
    params.push(opts.from);
  }
  if (opts.to) {
    conds.push(`substr(p.created_at, 1, 10) <= ?`);
    params.push(opts.to);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
  const sort = opts.sort ?? "date_desc";
  const order =
    sort === "date_asc"
      ? `p.id ASC`
      : sort === "amount_desc"
        ? `p.total_minor DESC, p.id DESC`
        : sort === "amount_asc"
          ? `p.total_minor ASC, p.id DESC`
          : `p.id DESC`;
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM proforma_invoices p LEFT JOIN customers c ON c.id = p.customer_id ${where}`,
      )
      .get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT p.*, c.search_name AS customer_name, c.phone AS customer_phone FROM proforma_invoices p LEFT JOIN customers c ON c.id = p.customer_id ${where} ORDER BY ${assertOrderClause(order)} LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  return { rows, total };
}

export function getProformaDetail(id: number): { proforma: unknown; items: unknown[] } {
  const db = getDb();
  const proforma = db
    .prepare(
      `SELECT p.*, c.search_name AS customer_name, c.phone AS customer_phone, c.address AS customer_address FROM proforma_invoices p LEFT JOIN customers c ON c.id = p.customer_id WHERE p.id = ?`,
    )
    .get(id);
  if (!proforma) throw new Error("Proforma introuvable.");
  const items = db
    .prepare(`SELECT * FROM proforma_items WHERE proforma_id = ? ORDER BY id`)
    .all(id);
  return { proforma, items };
}

export function getProformaStats(): {
  total: number;
  draft: number;
  pending: number;
  converted: number;
} {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0) AS draft,
        COALESCE(SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END), 0) AS converted
       FROM proforma_invoices`,
    )
    .get() as { total: number; draft: number; pending: number; converted: number };
  return { total: row.total, draft: row.draft, pending: row.pending, converted: row.converted };
}

export function updateProformaAtomic(args: {
  id: number;
  customerId: number | null;
  lines: ProformaLineInput[];
  discountMinor: number;
  deliveryMinor: number;
  dueDate: string | null;
  notes: string | null;
  terms: string | null;
  now: string;
  operationId?: string | null;
}): void {
  const db = getDb();
  const fast = peekOptional<{ updated: boolean }>(args.operationId, "proformas.update");
  if (fast) return;
  const tx = db.transaction(() => {
    claimOptional(args.operationId, "proformas.update", args.now);
    const row = db.prepare(`SELECT status FROM proforma_invoices WHERE id = ?`).get(args.id) as
      | { status: string }
      | undefined;
    if (!row) throw new Error("Proforma introuvable.");
    if (row.status !== "draft") throw new Error("Seul un brouillon est modifiable.");
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
    db.prepare(
      `UPDATE proforma_invoices SET customer_id = ?, subtotal_minor = ?, discount_amount_minor = ?, delivery_fee_minor = ?, total_minor = ?, due_date = ?, notes = ?, terms = ?, updated_at = ? WHERE id = ?`,
    ).run(
      args.customerId,
      subtotal,
      args.discountMinor,
      args.deliveryMinor,
      total,
      args.dueDate,
      args.notes?.trim() || null,
      args.terms?.trim() || null,
      args.now,
      args.id,
    );
    db.prepare(`DELETE FROM proforma_items WHERE proforma_id = ?`).run(args.id);
    for (const p of prepared) {
      db.prepare(
        `INSERT INTO proforma_items (proforma_id, product_id, product_name_snapshot, unit_price_minor, quantity, line_total_minor) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(args.id, p.pid, p.name, p.price, p.qty, p.total);
    }
    // P8: modification tracée — audit déterministe.
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'proforma.updated', 'proforma', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(args.id),
      auditOperationId(args.operationId, "proforma.updated", args.id, { total }),
      JSON.stringify({ total }),
      args.now,
    );
    storeOptional(args.operationId, { updated: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      args.operationId &&
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekOptional<{ updated: boolean }>(args.operationId, "proformas.update");
      if (retry) return;
    }
    throw err;
  }
}

export function deleteProformaAtomic(id: number, now: string, operationId: string): void {
  const db = getDb();
  // M-2 caller-owned idempotency: retry replays stored result (no "not found"
  // failure on an already-deleted row for the SAME user operation).
  const fast = peekIdempotency<{ deleted: boolean }>(operationId, "proformas.delete");
  if (fast) return;
  const tx = db.transaction(() => {
    claimIdempotency(operationId, "proformas.delete", now);
    const row = db
      .prepare(`SELECT proforma_number, status FROM proforma_invoices WHERE id = ?`)
      .get(id) as { proforma_number: string; status: string } | undefined;
    if (!row) throw new Error("Proforma introuvable.");
    if (row.status === "converted") throw new Error("Proforma convertie : suppression impossible.");
    db.prepare(`DELETE FROM proforma_items WHERE proforma_id = ?`).run(id);
    db.prepare(`DELETE FROM proforma_invoices WHERE id = ?`).run(id);
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'proforma.deleted', 'proforma', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(id),
      operationId,
      JSON.stringify({ number: row.proforma_number }),
      now,
    );
    storeIdempotencyResult(operationId, { deleted: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ deleted: boolean }>(operationId, "proformas.delete");
      if (retry) return;
    }
    throw err;
  }
}

export function convertProformaToSaleAtomic(args: {
  proformaId: number;
  amountPaidMinor: number;
  paymentMethod: string | null;
  operationId: string;
  now: string;
}): { saleId: number; invoiceNumber: string } {
  const db = getDb();
  const fastConv = peekIdempotency<{ saleId: number; invoiceNumber: string }>(
    args.operationId,
    "proformas.convert",
  );
  if (fastConv) return fastConv;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "proformas.convert", args.now);
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
      limitOverrideApproved: false,
      subtotalMinor: subtotal,
      // P0-7 : la remise d'un devis est GLOBALE — elle est RÉPARTIE sur les
      // lignes (lineDiscounts) pour que Σ lignes = discount_amount_minor
      // (CHECK 0001:153). Le prix unitaire affiché reste celui du devis et le
      // ticket affiche une ligne « Remise » (forme (b) du validateur).
      discountType: "none",
      discountValueMinor: 0,
      discountAmountMinor: discount,
      deliveryFeeMinor: delivery,
      totalMinor: total,
      amountPaidMinor: args.amountPaidMinor,
      remainingMinor: remaining,
      paymentStatus: status,
      paymentMethod: args.paymentMethod,
      dueDate: typeof pro["due_date"] === "string" ? pro["due_date"] : null,
      lineDiscounts: allocateAmountByWeights(
        items.map((it) => Number(it.line_total_minor)),
        discount,
      ),
      lines: items.map((it) => ({
        productId: it.product_id,
        productName: it.product_name_snapshot,
        unitCode: "PIECE",
        // Pas de remise à la conversion : origine = facturé (devis).
        originalUnitPriceMinor: it.unit_price_minor,
        unitPriceMinor: it.unit_price_minor,
        // Coût réel au jour de la conversion (marges rapports) ; 0 si
        // article libre ou produit supprimé depuis le devis.
        purchasePriceMinor:
          it.product_id == null
            ? 0
            : Number(
                (
                  db
                    .prepare(`SELECT purchase_price_minor FROM products WHERE id = ?`)
                    .get(it.product_id) as { purchase_price_minor: number } | undefined
                )?.purchase_price_minor ?? 0,
              ),
        quantity: Number(it.quantity),
      })),
      lineTotals: items.map((it) => it.line_total_minor),
      now: args.now,
      allowNegativeStock: settings.allowNegativeStock,
    });
    // Garde WHERE : la conversion n'écrit que l'état non-final vu en tx.
    const updConv = db
      .prepare(
        `UPDATE proforma_invoices SET status = 'converted', converted_sale_id = ?, updated_at = ? WHERE id = ? AND status NOT IN ('converted','cancelled')`,
      )
      .run(res.saleId, args.now, args.proformaId);
    if (updConv.changes !== 1) throw new Error("Proforma déjà convertie ou annulée.");
    // P8: conversion tracée (reliée à la vente créée, même operationId).
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'proforma.converted', 'proforma', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(args.proformaId),
      args.operationId,
      JSON.stringify({ saleId: res.saleId, invoice: res.invoiceNumber }),
      args.now,
    );
    storeIdempotencyResult(args.operationId, res);
    return res;
  });
  try {
    return (tx as unknown as () => { saleId: number; invoiceNumber: string })();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ saleId: number; invoiceNumber: string }>(
        args.operationId,
        "proformas.convert",
      );
      if (retry) return retry;
    }
    throw err;
  }
}
