// Veloria PoS — Main-process repository: dépenses (fiche enrichie, statuts,
// suppression définitive — table feuille sans références entrantes).

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { assertOrderClause } from "./sql-guard";
import {
  auditOperationId,
  claimIdempotency,
  claimOptional,
  peekIdempotency,
  peekOptional,
  storeIdempotencyResult,
  storeOptional,
} from "./idempotency";

export type ExpenseStatusFilter = "all" | "paid" | "pending";
export type ExpenseMethodFilter = "all" | "cash" | "cheque" | "transfer";
export type ExpenseSort = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

export interface ExpenseListOptions {
  category?: string | null;
  statusFilter?: ExpenseStatusFilter;
  methodFilter?: ExpenseMethodFilter;
  from?: string | null;
  to?: string | null;
  sort?: ExpenseSort;
}

export interface ExpenseUpsert {
  description: string;
  category: string;
  amountMinor: number;
  expenseDate: string;
  supplierId: number | null;
  paymentMethod: string | null;
  status: "paid" | "pending";
  reference: string | null;
  notes: string | null;
}

function normalizeUpsert(args: ExpenseUpsert): void {
  if (args.description.trim().length < 2) throw new Error("Description de dépense requise.");
  if (args.category.trim().length < 1) throw new Error("Catégorie requise.");
  if (!Number.isInteger(args.amountMinor) || args.amountMinor <= 0) {
    throw new Error("Montant de dépense invalide.");
  }
  if (args.status === "paid" && args.paymentMethod == null) {
    throw new Error("Moyen de paiement requis pour une dépense payée.");
  }
}

export function createExpense(
  args: ExpenseUpsert & { operationId: string; now: string; staffUserId?: number | null },
): number {
  const db = getDb();
  normalizeUpsert(args);
  if (args.supplierId != null) {
    const sup = db.prepare(`SELECT id FROM suppliers WHERE id = ?`).get(args.supplierId) as
      | { id: number }
      | undefined;
    if (!sup) throw new Error("Fournisseur introuvable.");
  }
  // Idempotence (migration 0022) : même motif que sales.operation_id.
  const findExisting = (): number | undefined => {
    const existing = db
      .prepare(`SELECT id FROM expenses WHERE operation_id = ?`)
      .get(args.operationId) as { id: number } | undefined;
    return existing ? Number(existing.id) : undefined;
  };
  const fast = findExisting();
  if (fast != null) return fast;
  const tx = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO expenses (uuid, operation_id, description, category, amount_minor, expense_date, supplier_id, payment_method, status, reference, notes, staff_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        args.operationId,
        args.description.trim(),
        args.category.trim(),
        args.amountMinor,
        args.expenseDate,
        args.supplierId,
        args.paymentMethod,
        args.status,
        args.reference?.trim() || null,
        args.notes?.trim() || null,
        args.staffUserId ?? null,
        args.now,
        args.now,
      );
    const id = Number(r.lastInsertRowid);
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at, actor_user_id) VALUES (?, 'expense.created', 'expense', ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(id),
      // P20: identité de l'opération (pas de doublon d'audit au rejouement).
      args.operationId,
      JSON.stringify({ amount: args.amountMinor, category: args.category.trim() }),
      args.now,
      args.staffUserId ?? null,
    );
    return id;
  });
  try {
    return (tx as unknown as () => number)();
  } catch (err) {
    // Course rejouée : l'autre transaction a inséré le même operationId.
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: expenses\.operation_id/i.test(err.message)
    ) {
      const retry = findExisting();
      if (retry != null) return retry;
    }
    throw err;
  }
}

export function updateExpense(
  args: ExpenseUpsert & { id: number; now: string; operationId?: string | null },
): void {
  const db = getDb();
  const fast = peekOptional<{ updated: boolean }>(args.operationId, "expenses.update");
  if (fast) return;
  normalizeUpsert(args);
  if (args.supplierId != null) {
    const sup = db.prepare(`SELECT id FROM suppliers WHERE id = ?`).get(args.supplierId) as
      | { id: number }
      | undefined;
    if (!sup) throw new Error("Fournisseur introuvable.");
  }
  const tx = db.transaction(() => {
    claimOptional(args.operationId, "expenses.update", args.now);
    const r = db
      .prepare(
        `UPDATE expenses SET description = ?, category = ?, amount_minor = ?, expense_date = ?, supplier_id = ?, payment_method = ?, status = ?, reference = ?, notes = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        args.description.trim(),
        args.category.trim(),
        args.amountMinor,
        args.expenseDate,
        args.supplierId,
        args.paymentMethod,
        args.status,
        args.reference?.trim() || null,
        args.notes?.trim() || null,
        args.now,
        args.id,
      );
    if (r.changes === 0) throw new Error("Dépense introuvable.");
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'expense.updated', 'expense', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(args.id),
      auditOperationId(args.operationId, "expense.updated", args.id, {
        amount: args.amountMinor,
      }),
      JSON.stringify({ amount: args.amountMinor }),
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
      const retry = peekOptional<{ updated: boolean }>(args.operationId, "expenses.update");
      if (retry) return;
    }
    throw err;
  }
}

export function deleteExpenseAtomic(id: number, now: string, operationId: string | null): void {
  const db = getDb();
  // P18: idempotence portée par le client quand il fournit operationId
  // (double-clic = rejouement → succès). Sans operationId (compatibilité),
  // comportement historique : 2e appel → « introuvable ».
  if (operationId != null) {
    const fast = peekIdempotency<{ deleted: boolean }>(operationId, "expenses.delete");
    if (fast) return;
  }
  const tx = db.transaction(() => {
    if (operationId != null) claimIdempotency(operationId, "expenses.delete", now);
    const row = db.prepare(`SELECT description FROM expenses WHERE id = ?`).get(id) as
      | { description: string }
      | undefined;
    if (!row) throw new Error("Dépense introuvable.");
    db.prepare(`DELETE FROM expenses WHERE id = ?`).run(id);
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'expense.deleted', 'expense', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(id),
      operationId ?? randomUUID(),
      JSON.stringify({ description: row.description }),
      now,
    );
    if (operationId != null) storeIdempotencyResult(operationId, { deleted: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      operationId != null &&
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ deleted: boolean }>(operationId, "expenses.delete");
      if (retry) return;
    }
    throw err;
  }
}

const EXPENSE_SELECT = `SELECT e.*,
  s.name AS supplier_name
FROM expenses e LEFT JOIN suppliers s ON s.id = e.supplier_id`;

export function listExpensesUnified(
  query: string,
  page: number,
  pageSize: number,
  opts: ExpenseListOptions = {},
): { rows: unknown[]; total: number } {
  const db = getDb();
  const q = query.trim();
  const conds: string[] = [];
  const params: unknown[] = [];
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const numMatch = /^DEP-?0*(\d{1,9})$/i.exec(q);
    if (numMatch) {
      conds.push(
        `(e.description LIKE ? ESCAPE '\\' OR e.category LIKE ? ESCAPE '\\' OR s.name LIKE ? ESCAPE '\\' OR e.reference LIKE ? ESCAPE '\\' OR e.id = ?)`,
      );
      params.push(like, like, like, like, Number(numMatch[1]));
    } else {
      conds.push(
        `(e.description LIKE ? ESCAPE '\\' OR e.category LIKE ? ESCAPE '\\' OR s.name LIKE ? ESCAPE '\\' OR e.reference LIKE ? ESCAPE '\\')`,
      );
      params.push(like, like, like, like);
    }
  }
  if (opts.category) {
    conds.push(`e.category = ?`);
    params.push(opts.category);
  }
  const status = opts.statusFilter ?? "all";
  if (status !== "all") {
    conds.push(`e.status = ?`);
    params.push(status);
  }
  const method = opts.methodFilter ?? "all";
  if (method !== "all") {
    conds.push(`e.payment_method = ?`);
    params.push(method);
  }
  if (opts.from) {
    conds.push(`substr(e.expense_date, 1, 10) >= ?`);
    params.push(opts.from);
  }
  if (opts.to) {
    conds.push(`substr(e.expense_date, 1, 10) <= ?`);
    params.push(opts.to);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
  const sort = opts.sort ?? "date_desc";
  const order =
    sort === "date_asc"
      ? `e.expense_date ASC, e.id ASC`
      : sort === "amount_desc"
        ? `e.amount_minor DESC, e.expense_date DESC`
        : sort === "amount_asc"
          ? `e.amount_minor ASC, e.expense_date DESC`
          : `e.expense_date DESC, e.id DESC`;
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM expenses e LEFT JOIN suppliers s ON s.id = e.supplier_id ${where}`,
      )
      .get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(`${EXPENSE_SELECT} ${where} ORDER BY ${assertOrderClause(order)} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize);
  return { rows, total };
}

export function getExpenseStats(): {
  totalMinor: number;
  monthlyMinor: number;
  paidMinor: number;
  pendingMinor: number;
  categories: string[];
} {
  const db = getDb();
  const sums = db
    .prepare(
      `SELECT COALESCE(SUM(amount_minor), 0) AS total,
        COALESCE(SUM(CASE WHEN substr(expense_date, 1, 7) = substr(date('now'), 1, 7) THEN amount_minor ELSE 0 END), 0) AS monthly,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_minor ELSE 0 END), 0) AS paid,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_minor ELSE 0 END), 0) AS pending
       FROM expenses`,
    )
    .get() as { total: number; monthly: number; paid: number; pending: number };
  const cats = db
    .prepare(`SELECT DISTINCT category FROM expenses ORDER BY category COLLATE NOCASE`)
    .all() as { category: string }[];
  return {
    totalMinor: sums.total,
    monthlyMinor: sums.monthly,
    paidMinor: sums.paid,
    pendingMinor: sums.pending,
    categories: cats.map((c) => c.category),
  };
}
