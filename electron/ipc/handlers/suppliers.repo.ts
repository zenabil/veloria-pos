// Veloria PoS — Main-process repository: fournisseurs (Phase 6).
// CRUD + paiements atomiques (dette + audit = 1 tx) + relevé.

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";

export function searchSuppliers(
  query: string,
  page: number,
  pageSize: number,
): {
  rows: unknown[];
  total: number;
} {
  const db = getDb();
  const q = query.trim();
  const where = q ? `WHERE name LIKE ? ESCAPE '\\' OR phone LIKE ?` : "";
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const params: unknown[] = q ? [like, like] : [];
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM suppliers ${where}`).get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(`SELECT * FROM suppliers ${where} ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize);
  return { rows, total };
}

export function createSupplier(args: {
  name: string;
  contact: string | null;
  phone: string | null;
  address: string | null;
  now: string;
}): number {
  const db = getDb();
  if (args.name.trim().length < 2) throw new Error("Nom de fournisseur requis.");
  const r = db
    .prepare(
      `INSERT INTO suppliers (uuid, name, contact_person, phone, address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      args.name.trim(),
      args.contact?.trim() || null,
      args.phone?.trim() || null,
      args.address?.trim() || null,
      args.now,
      args.now,
    );
  return Number(r.lastInsertRowid);
}

export function recordSupplierPaymentAtomic(args: {
  supplierId: number;
  amountMinor: number;
  method: string;
  reference: string | null;
  notes: string | null;
  paymentDate: string;
  operationId: string;
  now: string;
}): void {
  const db = getDb();
  const tx = db.transaction(() => {
    const sup = db
      .prepare(`SELECT outstanding_balance_minor FROM suppliers WHERE id = ?`)
      .get(args.supplierId) as { outstanding_balance_minor: number } | undefined;
    if (!sup) throw new Error("Fournisseur introuvable.");
    if (!Number.isInteger(args.amountMinor) || args.amountMinor <= 0) {
      throw new Error("Montant de paiement invalide.");
    }
    if (args.amountMinor > sup.outstanding_balance_minor) {
      throw new Error("Le paiement dépasse la dette fournisseur.");
    }
    db.prepare(
      `INSERT INTO supplier_payments (uuid, supplier_id, amount_minor, method, reference, payment_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      args.supplierId,
      args.amountMinor,
      args.method,
      args.reference?.trim() || null,
      args.paymentDate,
      args.notes?.trim() || null,
      args.now,
    );
    db.prepare(
      `UPDATE suppliers SET outstanding_balance_minor = outstanding_balance_minor - ?, updated_at = ? WHERE id = ?`,
    ).run(args.amountMinor, args.now, args.supplierId);
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'supplier.payment', 'supplier', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(args.supplierId),
      args.operationId,
      JSON.stringify({ amount: args.amountMinor, method: args.method }),
      args.now,
    );
  });
  (tx as unknown as () => void)();
}

export function getSupplierStatement(supplierId: number): {
  supplier: unknown;
  intakes: unknown[];
  payments: unknown[];
} {
  const db = getDb();
  const supplier = db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(supplierId);
  if (!supplier) throw new Error("Fournisseur introuvable.");
  const intakes = db
    .prepare(`SELECT * FROM stock_intakes WHERE supplier_id = ? ORDER BY id DESC LIMIT 100`)
    .all(supplierId);
  const payments = db
    .prepare(`SELECT * FROM supplier_payments WHERE supplier_id = ? ORDER BY id DESC LIMIT 100`)
    .all(supplierId);
  return { supplier, intakes, payments };
}
