// Veloria PoS — Main-process repository: fournisseurs (Phase 6 + page Fournisseurs).
// CRUD enrichi + paiements atomiques (dette + audit = 1 tx) + relevé + suppression
// gardée (soldée, sans entrées/paiements/produits liés) + statistiques.

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import {
  auditOperationId,
  claimIdempotency,
  claimOptional,
  peekIdempotency,
  peekOptional,
  storeIdempotencyResult,
  storeOptional,
} from "./idempotency";

export type SupplierStatusFilter = "all" | "active" | "inactive";
export type SupplierPaymentFilter = "all" | "with_debt" | "settled";
export type SupplierSort =
  | "name_asc"
  | "name_desc"
  | "purchases_desc"
  | "debt_desc"
  | "recent_desc";

export interface SupplierSearchOptions {
  statusFilter?: SupplierStatusFilter;
  paymentFilter?: SupplierPaymentFilter;
  sort?: SupplierSort;
}

// Frontière main/domaine : pas d'import src/ ici (rootDir electron).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmail(email: string | null): string | null {
  const e = email?.trim() || null;
  if (e != null && !EMAIL_RE.test(e)) throw new Error("Email fournisseur invalide.");
  return e;
}

function nextSupplierCode(db: { prepare(sql: string): { get(...p: unknown[]): unknown } }): string {
  const row = db.prepare(`SELECT COALESCE(MAX(id), 0) + 1 AS n FROM suppliers`).get() as {
    n: number;
  };
  return `FOU-${String(row.n).padStart(5, "0")}`;
}

function assertCodeUnique(
  db: {
    prepare(sql: string): { get(...p: unknown[]): unknown };
  },
  code: string,
  excludeId: number | null,
): void {
  const row = db
    .prepare(`SELECT id FROM suppliers WHERE code = ? AND (? IS NULL OR id != ?)`)
    .get(code, excludeId, excludeId) as { id: number } | undefined;
  if (row) throw new Error(`Code fournisseur « ${code} » déjà utilisé.`);
}

const SEARCH_SELECT = `SELECT s.*,
  COALESCE((SELECT SUM(total_minor) FROM stock_intakes WHERE supplier_id = s.id AND status != 'cancelled'), 0) AS total_purchases_minor,
  COALESCE((SELECT SUM(amount_minor) FROM supplier_payments WHERE supplier_id = s.id), 0) AS total_paid_minor,
  (SELECT MAX(created_at) FROM stock_intakes WHERE supplier_id = s.id) AS last_intake_at,
  (SELECT COUNT(*) FROM stock_intakes WHERE supplier_id = s.id) AS intake_count
FROM suppliers s`;

export function searchSuppliers(
  query: string,
  page: number,
  pageSize: number,
  opts: SupplierSearchOptions = {},
): {
  rows: unknown[];
  total: number;
} {
  const db = getDb();
  const q = query.trim();
  const status = opts.statusFilter ?? "all";
  const payment = opts.paymentFilter ?? "all";
  const sort = opts.sort ?? "name_asc";
  const conds: string[] = [];
  const params: unknown[] = [];
  if (q) {
    conds.push(`(s.name LIKE ? ESCAPE '\\' OR s.code LIKE ? ESCAPE '\\' OR s.phone LIKE ?)`);
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    params.push(like, like, like);
  }
  if (status === "active") conds.push(`s.is_active = 1`);
  else if (status === "inactive") conds.push(`s.is_active = 0`);
  if (payment === "with_debt") conds.push(`s.outstanding_balance_minor > 0`);
  else if (payment === "settled") conds.push(`s.outstanding_balance_minor = 0`);
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
  const order =
    sort === "name_desc"
      ? `s.name COLLATE NOCASE DESC`
      : sort === "purchases_desc"
        ? `total_purchases_minor DESC, s.name COLLATE NOCASE ASC`
        : sort === "debt_desc"
          ? `s.outstanding_balance_minor DESC, s.name COLLATE NOCASE ASC`
          : sort === "recent_desc"
            ? `last_intake_at DESC, s.name COLLATE NOCASE ASC`
            : `s.name COLLATE NOCASE ASC`;
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM suppliers s ${where}`).get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(`${SEARCH_SELECT} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize);
  return { rows, total };
}

export interface SupplierUpsert {
  name: string;
  code: string | null;
  contact: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxNumber: string | null;
  commercialRegister: string | null;
  notes: string | null;
  isActive: boolean;
}

function normalizeUpsert(args: SupplierUpsert): Required<Omit<SupplierUpsert, "isActive">> {
  if (args.name.trim().length < 2) throw new Error("Nom de fournisseur requis.");
  const code = args.code?.trim() || null;
  if (code != null && code.length > 20) throw new Error("Code fournisseur trop long (20 max).");
  return {
    name: args.name.trim(),
    code,
    contact: args.contact?.trim() || null,
    phone: args.phone?.trim() || null,
    email: cleanEmail(args.email),
    address: args.address?.trim() || null,
    taxNumber: args.taxNumber?.trim() || null,
    commercialRegister: args.commercialRegister?.trim() || null,
    notes: args.notes?.trim() || null,
  };
}

export function createSupplier(
  args: SupplierUpsert & { operationId: string; now: string },
): number {
  const db = getDb();
  const n = normalizeUpsert(args);
  // Idempotence (migration 0022) : même motif que sales.operation_id.
  const findExisting = (): number | undefined => {
    const existing = db
      .prepare(`SELECT id FROM suppliers WHERE operation_id = ?`)
      .get(args.operationId) as { id: number } | undefined;
    return existing ? Number(existing.id) : undefined;
  };
  const fast = findExisting();
  if (fast != null) return fast;
  const userCode = n.code;
  // Anti-course : MAX(id)+1 peut collisionner en création concurrente.
  // Code saisi → erreur FR immédiate ; code auto → régénéré (max 3 essais).
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = userCode ?? nextSupplierCode(db);
    try {
      assertCodeUnique(db, code, null);
      // P8: création + audit atomiques (history voit le fournisseur).
      const tx = db.transaction(() => {
        const r = db
          .prepare(
            `INSERT INTO suppliers (uuid, operation_id, code, name, contact_person, phone, email, address, tax_number, commercial_register, notes, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            randomUUID(),
            args.operationId,
            code,
            n.name,
            n.contact,
            n.phone,
            n.email,
            n.address,
            n.taxNumber,
            n.commercialRegister,
            n.notes,
            args.isActive ? 1 : 0,
            args.now,
            args.now,
          );
        const id = Number(r.lastInsertRowid);
        db.prepare(
          `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'supplier.created', 'supplier', ?, ?, ?, ?)`,
        ).run(randomUUID(), String(id), args.operationId, JSON.stringify({ code }), args.now);
        return id;
      });
      return (tx as unknown as () => number)();
    } catch (err) {
      // Rejouement concurrent du même operationId : retrouver le gagnant.
      if (
        err instanceof Error &&
        /UNIQUE constraint failed: suppliers\.operation_id/i.test(err.message)
      ) {
        const retry = findExisting();
        if (retry != null) return retry;
      }
      if (
        userCode == null &&
        err instanceof Error &&
        /UNIQUE constraint failed: suppliers\.(code|id)/i.test(err.message)
      ) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Code fournisseur déjà utilisé.");
}

export function updateSupplier(
  args: SupplierUpsert & { id: number; now: string; operationId?: string | null },
): void {
  const db = getDb();
  const fast = peekOptional<{ updated: boolean }>(args.operationId, "suppliers.update");
  if (fast) return;
  const n = normalizeUpsert(args);
  const tx = db.transaction(() => {
    claimOptional(args.operationId, "suppliers.update", args.now);
    const existing = db.prepare(`SELECT id FROM suppliers WHERE id = ?`).get(args.id) as
      | { id: number }
      | undefined;
    if (!existing) throw new Error("Fournisseur introuvable.");
    const code = n.code ?? nextSupplierCode(db);
    assertCodeUnique(db, code, args.id);
    db.prepare(
      `UPDATE suppliers SET code = ?, name = ?, contact_person = ?, phone = ?, email = ?, address = ?, tax_number = ?, commercial_register = ?, notes = ?, is_active = ?, updated_at = ? WHERE id = ?`,
    ).run(
      code,
      n.name,
      n.contact,
      n.phone,
      n.email,
      n.address,
      n.taxNumber,
      n.commercialRegister,
      n.notes,
      args.isActive ? 1 : 0,
      args.now,
      args.id,
    );
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'supplier.updated', 'supplier', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(args.id),
      auditOperationId(args.operationId, "supplier.updated", args.id, { name: n.name }),
      JSON.stringify({ name: n.name }),
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
      const retry = peekOptional<{ updated: boolean }>(args.operationId, "suppliers.update");
      if (retry) return;
    }
    throw err;
  }
}

function assertDeletable(
  db: {
    prepare(sql: string): {
      get(...p: unknown[]): unknown;
      run(...p: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    };
  },
  id: number,
  name: string,
): void {
  const sup = db.prepare(`SELECT outstanding_balance_minor FROM suppliers WHERE id = ?`).get(id) as
    | { outstanding_balance_minor: number }
    | undefined;
  if (!sup) throw new Error("Fournisseur introuvable.");
  if (Number(sup.outstanding_balance_minor) !== 0) {
    throw new Error(`Suppression impossible : solde de « ${name} » non soldé.`);
  }
  const intakes = db
    .prepare(`SELECT COUNT(*) AS c FROM stock_intakes WHERE supplier_id = ?`)
    .get(id) as { c: number };
  if (Number(intakes.c) > 0) {
    throw new Error(`Suppression impossible : « ${name} » a des entrées d'achat liées.`);
  }
  const payments = db
    .prepare(`SELECT COUNT(*) AS c FROM supplier_payments WHERE supplier_id = ?`)
    .get(id) as { c: number };
  if (Number(payments.c) > 0) {
    throw new Error(`Suppression impossible : « ${name} » a des paiements enregistrés.`);
  }
  const products = db
    .prepare(`SELECT COUNT(*) AS c FROM products WHERE supplier_id = ?`)
    .get(id) as {
    c: number;
  };
  if (Number(products.c) > 0) {
    throw new Error(`Suppression impossible : des produits sont liés à « ${name} ».`);
  }
  const returns = db
    .prepare(`SELECT COUNT(*) AS c FROM supplier_returns WHERE supplier_id = ?`)
    .get(id) as { c: number };
  if (Number(returns.c) > 0) {
    throw new Error(`Suppression impossible : « ${name} » a des retours fournisseurs liés.`);
  }
  const expenses = db
    .prepare(`SELECT COUNT(*) AS c FROM expenses WHERE supplier_id = ?`)
    .get(id) as { c: number };
  if (Number(expenses.c) > 0) {
    throw new Error(`Suppression impossible : des dépenses sont liées à « ${name} ».`);
  }
  const linked = db
    .prepare(`SELECT COUNT(*) AS c FROM product_suppliers WHERE supplier_id = ?`)
    .get(id) as { c: number };
  if (Number(linked.c) > 0) {
    throw new Error(`Suppression impossible : des produits sont liés à « ${name} ».`);
  }
}

export function deleteSupplierAtomic(id: number, now: string, operationId: string): void {
  const db = getDb();
  // M-2 caller-owned idempotency (same pattern as proformas.delete).
  const fast = peekIdempotency<{ deleted: boolean }>(operationId, "suppliers.delete");
  if (fast) return;
  const tx = db.transaction(() => {
    claimIdempotency(operationId, "suppliers.delete", now);
    const row = db.prepare(`SELECT name FROM suppliers WHERE id = ?`).get(id) as
      | { name: string }
      | undefined;
    if (!row) throw new Error("Fournisseur introuvable.");
    assertDeletable(db, id, row.name);
    db.prepare(`DELETE FROM suppliers WHERE id = ?`).run(id);
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'supplier.deleted', 'supplier', ?, ?, ?, ?)`,
    ).run(randomUUID(), String(id), operationId, JSON.stringify({ name: row.name }), now);
    storeIdempotencyResult(operationId, { deleted: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ deleted: boolean }>(operationId, "suppliers.delete");
      if (retry) return;
    }
    throw err;
  }
}

export function deleteSuppliersAtomic(
  ids: number[],
  now: string,
  operationId: string,
): {
  deleted: number;
} {
  const unique = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
  if (unique.length === 0) throw new Error("Aucun fournisseur sélectionné.");
  if (unique.length > 100) throw new Error("Sélection trop large (100 max).");
  const db = getDb();
  // M-2 caller-owned idempotency for batch delete (retry replays count).
  const fastMany = peekIdempotency<{ deleted: number }>(operationId, "suppliers.deleteMany");
  if (fastMany) return fastMany;
  const tx = db.transaction(() => {
    claimIdempotency(operationId, "suppliers.deleteMany", now);
    const names = new Map<number, string>();
    for (const id of unique) {
      const row = db.prepare(`SELECT name FROM suppliers WHERE id = ?`).get(id) as
        | { name: string }
        | undefined;
      if (!row) throw new Error("Fournisseur introuvable.");
      names.set(id, row.name);
    }
    // Tout-ou-rien : chaque fiche doit être supprimable avant toute suppression.
    for (const id of unique) assertDeletable(db, id, names.get(id) ?? `#${id}`);
    for (const id of unique) db.prepare(`DELETE FROM suppliers WHERE id = ?`).run(id);
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'supplier.deleted_many', 'supplier', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      unique.join(","),
      operationId,
      JSON.stringify({ count: unique.length }),
      now,
    );
    storeIdempotencyResult(operationId, { deleted: unique.length });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ deleted: number }>(operationId, "suppliers.deleteMany");
      if (retry) return retry;
    }
    throw err;
  }
  return { deleted: unique.length };
}

export function getSupplierStats(): {
  totalSuppliers: number;
  activeSuppliers: number;
  totalPurchasesMinor: number;
  totalDebtMinor: number;
} {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END), 0) AS active,
        COALESCE(SUM(outstanding_balance_minor), 0) AS debt
       FROM suppliers`,
    )
    .get() as { total: number; active: number; debt: number };
  const purchases = db
    .prepare(
      `SELECT COALESCE(SUM(total_minor), 0) AS p FROM stock_intakes WHERE status != 'cancelled'`,
    )
    .get() as { p: number };
  return {
    totalSuppliers: row.total,
    activeSuppliers: row.active,
    totalPurchasesMinor: purchases.p,
    totalDebtMinor: row.debt,
  };
}

export function recordSupplierPaymentAtomic(args: {
  operationId: string;
  supplierId: number;
  amountMinor: number;
  method: string;
  reference: string | null;
  notes: string | null;
  paymentDate: string;
  now: string;
}): { paymentId: number } {
  const db = getDb();
  // Idempotence par operationId (même motif que les paiements clients) :
  // retry/double-clic rejoue l'UUID et retrouve le paiement existant.
  const findExisting = (): { paymentId: number } | undefined => {
    const row = db
      .prepare(`SELECT id FROM supplier_payments WHERE operation_id = ?`)
      .get(args.operationId) as { id: number } | undefined;
    return row ? { paymentId: row.id } : undefined;
  };
  const fast = findExisting();
  if (fast) return fast;
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
      `INSERT INTO supplier_payments (uuid, supplier_id, amount_minor, method, reference, payment_date, notes, operation_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      args.supplierId,
      args.amountMinor,
      args.method,
      args.reference?.trim() || null,
      args.paymentDate,
      args.notes?.trim() || null,
      args.operationId,
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
    const inserted = db
      .prepare(`SELECT id FROM supplier_payments WHERE operation_id = ?`)
      .get(args.operationId) as { id: number };
    return { paymentId: inserted.id };
  });
  try {
    return (tx as unknown as () => { paymentId: number })();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: supplier_payments\.operation_id/i.test(err.message)
    ) {
      const retry = findExisting();
      if (retry) return retry;
    }
    throw err;
  }
}

export function getSupplierStatement(supplierId: number): {
  supplier: unknown;
  intakes: unknown[];
  intakeItems: unknown[];
  payments: unknown[];
} {
  const db = getDb();
  const supplier = db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(supplierId);
  if (!supplier) throw new Error("Fournisseur introuvable.");
  const intakes = db
    .prepare(`SELECT * FROM stock_intakes WHERE supplier_id = ? ORDER BY id DESC LIMIT 100`)
    .all(supplierId) as { id: number }[];
  const ids = intakes.map((i) => i.id);
  const intakeItems =
    ids.length > 0
      ? db
          .prepare(
            `SELECT * FROM stock_intake_items WHERE stock_intake_id IN (${ids.map(() => "?").join(",")}) ORDER BY stock_intake_id DESC LIMIT 500`,
          )
          .all(...ids)
      : [];
  const payments = db
    .prepare(`SELECT * FROM supplier_payments WHERE supplier_id = ? ORDER BY id DESC LIMIT 100`)
    .all(supplierId);
  return { supplier, intakes, intakeItems, payments };
}

/** Produits liés au fournisseur (jonction 0015) avec stock courant. */
export function getSupplierProducts(supplierId: number): { rows: unknown[] } {
  const db = getDb();
  const sup = db.prepare(`SELECT id FROM suppliers WHERE id = ?`).get(supplierId) as
    | { id: number }
    | undefined;
  if (!sup) throw new Error("Fournisseur introuvable.");
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.unit_code, p.purchase_price_minor, p.selling_price_minor, p.quantity
       FROM product_suppliers ps JOIN products p ON p.id = ps.product_id
       WHERE ps.supplier_id = ? ORDER BY p.name COLLATE NOCASE`,
    )
    .all(supplierId);
  return { rows };
}
