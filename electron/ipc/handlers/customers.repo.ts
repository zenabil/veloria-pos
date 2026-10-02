// Veloria PoS — Main-process repository: clients (recherche, CRUD, relevé, paiements).
// Recherche enrichie : chaque ligne porte déjà son relevé agrégé
// (factures, achats, dernière vente) — UNE requête, jamais de N+1 IPC.
// Paiement : sale_payments + solde client + vente = 1 tx, idempotent par
// operationId (retry/double-clic rejoue le même UUID et retrouve le paiement).

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

export type CustomerDebtFilter = "all" | "with_debt" | "no_debt" | "over_limit";

export function searchCustomers(
  query: string,
  page: number,
  pageSize: number,
  includeArchived = false,
  debtFilter: CustomerDebtFilter = "all",
  // P1-3 : filtre serveur « archivés seuls » — total réel (plus de
  // filtrage client borné à la page).
  archivedOnly = false,
): { rows: unknown[]; total: number } {
  const db = getDb();
  const q = query.trim();
  const alive = archivedOnly
    ? " AND deleted_at IS NOT NULL"
    : includeArchived
      ? ""
      : " AND deleted_at IS NULL";
  const debt =
    debtFilter === "with_debt"
      ? " AND outstanding_balance_minor > 0"
      : debtFilter === "no_debt"
        ? " AND outstanding_balance_minor <= 0"
        : debtFilter === "over_limit"
          ? " AND is_over_limit = 1"
          : "";
  const where = q
    ? `WHERE (search_name LIKE ? ESCAPE '\\' OR phone LIKE ?)${alive}${debt}`
    : `WHERE 1 = 1${alive}${debt}`;
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const params: unknown[] = q ? [like, like] : [];
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM customers ${where}`).get(...params) as { c: number }
  ).c;
  // Agrégats par client en sous-requêtes corrélées (ventes non annulées ;
  // `sales.customer_id` est indexé : ~1 ms pour une page de 20).
  const rows = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id AND s.is_cancelled = 0) AS invoice_count,
        (SELECT COALESCE(SUM(s.total_minor), 0) FROM sales s WHERE s.customer_id = c.id AND s.is_cancelled = 0) AS total_purchases_minor,
        (SELECT MAX(s.created_at) FROM sales s WHERE s.customer_id = c.id AND s.is_cancelled = 0) AS last_sale_at
       FROM customers c ${where} ORDER BY search_name LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  return { rows, total };
}

export function createCustomer(args: {
  operationId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  address: string | null;
  creditLimitMinor: number;
  initialBalanceMinor: number;
  settlementDay: number | null;
  isBreadClient: boolean;
  creditAllowed: boolean;
  notes: string | null;
  now: string;
}): number {
  const db = getDb();
  // Idempotence (migration 0022) : même motif que sales.operation_id.
  const findExisting = (): number | undefined => {
    const existing = db
      .prepare(`SELECT id FROM customers WHERE operation_id = ?`)
      .get(args.operationId) as { id: number } | undefined;
    return existing ? Number(existing.id) : undefined;
  };
  const fast = findExisting();
  if (fast != null) return fast;
  const search = `${args.firstName} ${args.lastName}`.trim().toLowerCase();
  // Solde initial ≥ 0 garanti par le validateur : stocké tel quel + statut
  // calculé (même règle que les ventes, jamais de clamp silencieux).
  // AUDIT-ROOT: création tracée comme updateCustomer (history aveugle sinon).
  const tx = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO customers (uuid, operation_id, first_name, last_name, search_name, phone, address, credit_limit_minor, initial_balance_minor, outstanding_balance_minor, debt_status, is_over_limit, settlement_day, is_bread_client, credit_allowed, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? <= 0 THEN 'none' WHEN ? > 0 AND ? > ? THEN 'over_limit' ELSE 'due' END, CASE WHEN ? > 0 AND ? > ? THEN 1 ELSE 0 END, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        args.operationId,
        args.firstName.trim(),
        args.lastName.trim(),
        search,
        args.phone,
        args.address,
        args.creditLimitMinor,
        args.initialBalanceMinor,
        args.initialBalanceMinor,
        args.initialBalanceMinor,
        args.creditLimitMinor,
        args.initialBalanceMinor,
        args.creditLimitMinor,
        args.creditLimitMinor,
        args.initialBalanceMinor,
        args.creditLimitMinor,
        args.settlementDay,
        args.isBreadClient ? 1 : 0,
        args.creditAllowed ? 1 : 0,
        args.notes?.trim() || null,
        args.now,
        args.now,
      );
    const id = Number(r.lastInsertRowid);
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'customer.created', 'customer', ?, ?, ?, ?)`,
    ).run(randomUUID(), String(id), args.operationId, JSON.stringify({}), args.now);
    return id;
  });
  try {
    return (tx as unknown as () => number)();
  } catch (err) {
    // Course rejouée : l'autre transaction a inséré le même operationId.
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: customers\.operation_id/i.test(err.message)
    ) {
      const retry = findExisting();
      if (retry != null) return retry;
    }
    throw err;
  }
}

export function updateCustomer(args: {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  address: string | null;
  creditLimitMinor: number;
  creditAllowed: boolean;
  settlementDay: number | null;
  notes: string | null;
  now: string;
  operationId?: string | null;
}): void {
  const db = getDb();
  const fast = peekOptional<{ updated: boolean }>(args.operationId, "customers.update");
  if (fast) return;
  const search = `${args.firstName} ${args.lastName}`.trim().toLowerCase();
  const tx = db.transaction(() => {
    claimOptional(args.operationId, "customers.update", args.now);
    const exists = db.prepare(`SELECT id FROM customers WHERE id = ?`).get(args.id) as
      | { id: number }
      | undefined;
    if (!exists) throw new Error("Client introuvable.");
    db.prepare(
      `UPDATE customers SET first_name = ?, last_name = ?, search_name = ?, phone = ?, address = ?, credit_limit_minor = ?, credit_allowed = ?, settlement_day = ?, notes = ?, updated_at = ? WHERE id = ?`,
    ).run(
      args.firstName.trim(),
      args.lastName.trim(),
      search,
      args.phone?.trim() || null,
      args.address?.trim() || null,
      args.creditLimitMinor,
      args.creditAllowed ? 1 : 0,
      args.settlementDay,
      args.notes?.trim() || null,
      args.now,
      args.id,
    );
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'customer.updated', 'customer', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(args.id),
      auditOperationId(args.operationId, "customer.updated", args.id, { search }),
      JSON.stringify({ name: `${args.firstName.trim()} ${args.lastName.trim()}`.trim() }),
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
      const retry = peekOptional<{ updated: boolean }>(args.operationId, "customers.update");
      if (retry) return;
    }
    throw err;
  }
}

/** Agrégats bornés pour les 4 cartes statistiques de l'écran Clients. */
export function getCustomerStats(): {
  totalClients: number;
  creditClients: number;
  totalDebtMinor: number;
  recentPaymentsMinor: number;
} {
  const db = getDb();
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN outstanding_balance_minor > 0 THEN 1 ELSE 0 END), 0) AS credit,
        COALESCE(SUM(outstanding_balance_minor), 0) AS debt
       FROM customers WHERE deleted_at IS NULL`,
    )
    .get() as { total: number; credit: number; debt: number };
  // L1 (même défaut que finance.repo) : les encaissements des 7 derniers
  // jours excluent les paiements rattachés à une vente annulée — sinon la
  // carte « encaissé » surpasse le total des ventes non annulées.
  const recent = db
    .prepare(
      `SELECT COALESCE(SUM(sp.amount_minor), 0) AS p FROM sale_payments sp
       LEFT JOIN sales sa ON sa.id = sp.sale_id
       WHERE substr(sp.payment_date, 1, 10) >= date('now', '-7 days')
         AND (sp.sale_id IS NULL OR COALESCE(sa.is_cancelled, 0) = 0)`,
    )
    .get() as { p: number };
  return {
    totalClients: totals.total,
    creditClients: totals.credit,
    totalDebtMinor: totals.debt,
    recentPaymentsMinor: recent.p,
  };
}

export function archiveCustomer(id: number, now: string, operationId: string): void {
  const db = getDb();
  // P1-6 : rejouabilité — retry après succès rejoue (pas de 2e audit).
  const fast = peekIdempotency<{ archived: boolean }>(operationId, "customers.archive");
  if (fast) return;
  const tx = db.transaction(() => {
    claimIdempotency(operationId, "customers.archive", now);
    const r = db
      .prepare(`UPDATE customers SET deleted_at = ?, updated_at = ? WHERE id = ?`)
      .run(now, now, id);
    if (r.changes === 0) throw new Error("Client introuvable.");
    // P8: archivage tracé.
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'customer.archived', 'customer', ?, ?, ?, ?)`,
    ).run(randomUUID(), String(id), operationId, JSON.stringify({}), now);
    storeIdempotencyResult(operationId, { archived: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ archived: boolean }>(operationId, "customers.archive");
      if (retry) return;
    }
    throw err;
  }
}

export function restoreCustomer(id: number, now: string, operationId: string): void {
  const db = getDb();
  const fast = peekIdempotency<{ restored: boolean }>(operationId, "customers.restore");
  if (fast) return;
  const tx = db.transaction(() => {
    claimIdempotency(operationId, "customers.restore", now);
    const r = db
      .prepare(`UPDATE customers SET deleted_at = NULL, updated_at = ? WHERE id = ?`)
      .run(now, id);
    if (r.changes === 0) throw new Error("Client introuvable.");
    // P8: restauration tracée.
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'customer.restored', 'customer', ?, ?, ?, ?)`,
    ).run(randomUUID(), String(id), operationId, JSON.stringify({}), now);
    storeIdempotencyResult(operationId, { restored: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ restored: boolean }>(operationId, "customers.restore");
      if (retry) return;
    }
    throw err;
  }
}

export function getCustomerStatement(id: number): {
  customer: unknown;
  sales: unknown[];
  payments: unknown[];
} {
  const db = getDb();
  const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id);
  if (!customer) throw new Error("Client introuvable.");
  const sales = db
    .prepare(`SELECT * FROM sales WHERE customer_id = ? ORDER BY id DESC LIMIT 100`)
    .all(id);
  const payments = db
    .prepare(`SELECT * FROM sale_payments WHERE customer_id = ? ORDER BY id DESC LIMIT 100`)
    .all(id);
  return { customer, sales, payments };
}

/**
 * Reçu d'un paiement historique : soldes avant/après reconstitués depuis le
 * grand-livre (lecture seule, aucune écriture, aucun centime inventé).
 * Le calcul pur vit dans `src/domain/customer/payment-receipt.ts`.
 */
export function getCustomerPaymentReceipt(paymentId: number): {
  payment: Record<string, unknown>;
  customer: Record<string, unknown>;
  prevBalanceMinor: number;
  newBalanceMinor: number;
} {
  const db = getDb();
  const payment = db.prepare(`SELECT * FROM sale_payments WHERE id = ?`).get(paymentId) as
    | Record<string, unknown>
    | undefined;
  if (!payment) throw new Error("Paiement introuvable.");
  const customerId =
    typeof payment["customer_id"] === "number"
      ? payment["customer_id"]
      : typeof payment["sale_id"] === "number"
        ? (
            db.prepare(`SELECT customer_id FROM sales WHERE id = ?`).get(payment["sale_id"]) as
              | { customer_id: number | null }
              | undefined
          )?.customer_id
        : null;
  if (customerId == null) throw new Error("Paiement sans client : reçu indisponible.");
  const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(customerId) as
    | Record<string, unknown>
    | undefined;
  if (!customer) throw new Error("Client introuvable.");
  const sales = db
    .prepare(
      `SELECT id, total_minor, created_at, is_cancelled FROM sales WHERE customer_id = ? ORDER BY id ASC LIMIT 500`,
    )
    .all(customerId) as {
    id: number;
    total_minor: number;
    created_at: string;
    is_cancelled: number;
  }[];
  const payments = db
    .prepare(
      `SELECT id, amount_minor, created_at FROM sale_payments WHERE customer_id = ? ORDER BY id ASC LIMIT 500`,
    )
    .all(customerId) as { id: number; amount_minor: number; created_at: string }[];
  const initial =
    typeof customer["initial_balance_minor"] === "number" ? customer["initial_balance_minor"] : 0;
  // Import local (pas d'import src/ côté main — parité volontaire, même appel).
  const balances = computeReceiptBalancesInline(
    initial,
    sales.map((s) => ({
      id: s.id,
      totalMinor: s.total_minor,
      createdAt: s.created_at,
      cancelled: s.is_cancelled === 1,
    })),
    payments.map((p) => ({ id: p.id, amountMinor: p.amount_minor, createdAt: p.created_at })),
    paymentId,
  );
  if (!balances) throw new Error("Reçu indisponible : soldes incohérents.");
  if (balances.newMinor < 0) throw new Error("Reçu indisponible : soldes incohérents.");
  return {
    payment,
    customer,
    prevBalanceMinor: balances.prevMinor,
    newBalanceMinor: balances.newMinor,
  };
}

/** Miroir local de `src/domain/customer/payment-receipt.ts` (frontière main/domaine). */
function computeReceiptBalancesInline(
  initialMinor: number,
  sales: { id: number; totalMinor: number; createdAt: string; cancelled: boolean }[],
  payments: { id: number; amountMinor: number; createdAt: string }[],
  targetPaymentId: number,
): { prevMinor: number; newMinor: number } | null {
  if (!Number.isInteger(initialMinor) || initialMinor < 0) return null;
  type Evt =
    | { at: string; tie: number; seq: number; kind: "sale"; amount: number }
    | { at: string; tie: number; seq: number; kind: "pay"; id: number; amount: number };
  const evts: Evt[] = [];
  for (const s of sales) {
    if (s.cancelled) continue;
    if (!Number.isInteger(s.id) || s.id <= 0) return null;
    if (!Number.isInteger(s.totalMinor) || s.totalMinor < 0) return null;
    if (typeof s.createdAt !== "string" || s.createdAt === "") return null;
    evts.push({ at: s.createdAt, tie: 0, seq: s.id, kind: "sale", amount: s.totalMinor });
  }
  let found = false;
  for (const p of payments) {
    if (!Number.isInteger(p.id) || p.id <= 0) return null;
    if (!Number.isInteger(p.amountMinor) || p.amountMinor <= 0) return null;
    if (typeof p.createdAt !== "string" || p.createdAt === "") return null;
    if (p.id === targetPaymentId) found = true;
    evts.push({ at: p.createdAt, tie: 1, seq: p.id, kind: "pay", id: p.id, amount: p.amountMinor });
  }
  if (!found) return null;
  evts.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.tie - b.tie || a.seq - b.seq));
  let balance = initialMinor;
  for (const e of evts) {
    if (e.kind === "sale") balance += e.amount;
    else if (e.id === targetPaymentId) return { prevMinor: balance, newMinor: balance - e.amount };
    else balance -= e.amount;
  }
  return null;
}

export function recordCustomerPaymentAtomic(args: {
  operationId: string;
  customerId: number | null;
  saleId: number | null;
  amountMinor: number;
  method: string;
  reference: string | null;
  notes: string | null;
  paymentDate: string;
  now: string;
}): { paymentId: number } {
  if (args.saleId == null && args.customerId == null) {
    throw new Error("Client ou vente requis pour enregistrer un paiement.");
  }
  const db = getDb();
  // Idempotence : rejouer le même operationId (retry IPC, double-clic avant
  // le verrou UI) retrouve le paiement existant. Garde anti-course : l'UNIQUE
  // tranche les insertions concurrentes (voir catch ci-dessous).
  const findExisting = (): { paymentId: number } | undefined => {
    const row = db
      .prepare(`SELECT id FROM sale_payments WHERE operation_id = ?`)
      .get(args.operationId) as { id: number } | undefined;
    return row ? { paymentId: row.id } : undefined;
  };
  const fast = findExisting();
  if (fast) return fast;
  const tx = db.transaction(() => {
    // Garde-fous explicites (aucun clamp silencieux : aucun centime perdu).
    // - Paiement lié à une vente : borné par le reste dû de LA VENTE (le solde
    //   client peut être inférieur via un avoir/solde initial créditeur).
    // - Encaissement standalone (sans vente) : borné par le solde client.
    if (args.saleId != null) {
      const s = db
        .prepare(
          `SELECT remaining_balance_minor, is_cancelled, customer_id FROM sales WHERE id = ?`,
        )
        .get(args.saleId) as
        | { remaining_balance_minor: number; is_cancelled: number; customer_id: number | null }
        | undefined;
      if (!s) throw new Error("Vente introuvable.");
      if (s.is_cancelled === 1) throw new Error("Vente annulée : paiement impossible.");
      // DB-07: propriété de la dette — jamais de paiement croisé A→B.
      // Vérifié DANS la transaction (main/application = source de vérité).
      if (args.customerId != null && s.customer_id !== args.customerId) {
        throw new Error("Ce paiement appartient à un autre client.");
      }
      if (args.amountMinor > s.remaining_balance_minor) {
        throw new Error("Le paiement dépasse le reste dû de la vente.");
      }
      // P12: aligné sur le domaine applyPaymentToBalance — un paiement lié ne
      // doit pas rendre le solde client négatif (incohérence vente/solde).
      if (args.customerId != null) {
        const c2 = db
          .prepare(`SELECT outstanding_balance_minor FROM customers WHERE id = ?`)
          .get(args.customerId) as { outstanding_balance_minor: number } | undefined;
        if (!c2) throw new Error("Client introuvable.");
        if (args.amountMinor > c2.outstanding_balance_minor) {
          throw new Error("Le paiement dépasse le solde dû du client.");
        }
      }
    } else {
      const c = db
        .prepare(`SELECT outstanding_balance_minor FROM customers WHERE id = ?`)
        .get(args.customerId) as { outstanding_balance_minor: number } | undefined;
      if (!c) throw new Error("Client introuvable.");
      if (args.amountMinor > c.outstanding_balance_minor) {
        throw new Error("Le paiement dépasse le solde dû du client.");
      }
    }
    db.prepare(
      `INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method, reference, notes, payment_date, operation_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      args.saleId,
      args.customerId,
      args.amountMinor,
      args.method,
      args.reference,
      args.notes,
      args.paymentDate,
      args.operationId,
      args.now,
    );
    if (args.customerId != null) {
      // Soustraction exacte (un solde négatif = avoir explicite, jamais masqué)
      // + recalcul du statut (même règle que la création de vente).
      db.prepare(
        `UPDATE customers SET outstanding_balance_minor = outstanding_balance_minor - ?,
          debt_status = CASE WHEN outstanding_balance_minor - ? <= 0 THEN 'none' WHEN credit_limit_minor > 0 AND outstanding_balance_minor - ? > credit_limit_minor THEN 'over_limit' ELSE 'due' END,
          is_over_limit = CASE WHEN credit_limit_minor > 0 AND outstanding_balance_minor - ? > credit_limit_minor THEN 1 ELSE 0 END,
          updated_at = ? WHERE id = ?`,
      ).run(
        args.amountMinor,
        args.amountMinor,
        args.amountMinor,
        args.amountMinor,
        args.now,
        args.customerId,
      );
    }
    if (args.saleId != null) {
      db.prepare(
        `UPDATE sales SET amount_paid_minor = amount_paid_minor + ?, remaining_balance_minor = total_minor - (amount_paid_minor + ?), payment_status = CASE WHEN total_minor - (amount_paid_minor + ?) = 0 THEN 'paid' WHEN (amount_paid_minor + ?) = 0 THEN 'unpaid' ELSE 'partial' END, updated_at = ? WHERE id = ?`,
      ).run(
        args.amountMinor,
        args.amountMinor,
        args.amountMinor,
        args.amountMinor,
        args.now,
        args.saleId,
      );
    }
    const inserted = db
      .prepare(`SELECT id FROM sale_payments WHERE operation_id = ?`)
      .get(args.operationId) as { id: number };
    // P8: paiement client = mutation financière tracée (history).
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'customer.payment', 'customer', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(args.customerId ?? args.saleId ?? inserted.id),
      args.operationId,
      JSON.stringify({ amount: args.amountMinor, saleId: args.saleId ?? null }),
      args.now,
    );
    return { paymentId: inserted.id };
  });
  try {
    return (tx as unknown as () => { paymentId: number })();
  } catch (err) {
    // Insertion concurrente du même operationId : retrouver le gagnant.
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: sale_payments\.operation_id/i.test(err.message)
    ) {
      const retry = findExisting();
      if (retry) return retry;
    }
    throw err;
  }
}
