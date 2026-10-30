// Veloria PoS — Main-process repository: clients (recherche, CRUD, relevé, paiements).
// Recherche enrichie : chaque ligne porte déjà son relevé agrégé
// (factures, achats, dernière vente) — UNE requête, jamais de N+1 IPC.
// Paiement : sale_payments + solde client + vente = 1 tx, idempotent par
// operationId (retry/double-clic rejoue le même UUID et retrouve le paiement).

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { debtStatusSql, liveDebtStatus, overdueSalesSql } from "./debt-status";
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

/** Tri serveur (miroir du `CustomerSort` renderer `src/features/customers/types.ts`). */
export type CustomerSort = "name_asc" | "name_desc" | "debt_desc" | "debt_asc" | "purchases_desc";

/**
 * Normalisation de recherche FR (MIROIR de la migration 0047) : minuscules,
 * accents stripped (NFD), ligatures non décomposées (œ/æ → oe/ae, ø → o),
 * espaces repliés. Ordre : minuscules d'abord (NFD n'abaisse pas la casse),
 * décomposition + retrait des diacritiques, puis ligatures. Toute évolution
 * doit changer aussi le backfill 0047 (sinon les lignes historiques
 * deviennent introuvables).
 */
export function normCustomerSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/\s+/g, " ")
    .trim();
}

/** Téléphone comparé sans séparateurs (tout caractère non chiffre). */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

// Séparateurs téléphone courants retirés de la colonne (côté requête :
// digitsOnly) : espaces, tirets, points, slash, parenthèses, indicatif +.
// W8 (F-06) : la normalisation est désormais une COLONNE GÉNÉRÉE
// (`customers.phone_digits`, migration 0050) + index ⇒ les 8 `REPLACE()`
// ne sont plus refaits à chaque lecture (et la recherche par téléphone
// devient une recherche indexée au lieu d'un parcours de table).
const PHONE_DIGITS_EXPR = `phone_digits`;

/**
 * E-28 : normalisation du téléphone PARFAITEMENT PARELLELE à
 * `PHONE_DIGITS_EXPR` (migration 0049) — on retire exactement les 8
 * séparateurs normalisés (espace, tiret, point, slash, parenthèses, `+`,
 * insécable), rien d'autre. Toute évolution doit changer la migration 0049
 * ET cette fonction dans le même commit (parité base ↔ application).
 */
export function phoneDigitsParity(phone: string): string {
  return phone.replace(/[ \-.()/+\u00A0]/g, "");
}

/**
 * E-28 : unicité du téléphone client.
 * La base (migration 0049) est l'autorité FINALE (trigger, fail-closed) ;
 * ce contrôle applicatif donne un message FR clair AVANT l'écriture et
 * évite un rollback pour un doublon saisissable.
 * Les clients ARCHIVÉS (`deleted_at IS NOT NULL`) sont hors périmètre : un
 * numéro « occupé » par un client archivé ne bloque pas un nouveau client.
 * Exporté : l'import CSV clients appelle le MÊME contrôle (une seule règle
 * d'unicité, pas deux implémentations qui divergent).
 */
export function assertPhoneAvailable(phone: string | null, excludeCustomerId: number | null): void {
  if (phone == null || phone.trim() === "") return;
  const db = getDb();
  const digits = phoneDigitsParity(phone);
  const row = db
    .prepare(
      `SELECT id FROM customers WHERE deleted_at IS NULL AND id <> ? AND ${PHONE_DIGITS_EXPR} = ? LIMIT 1`,
    )
    .get(excludeCustomerId ?? -1, digits);
  if (row) {
    throw new Error("Ce numéro de téléphone est déjà utilisé par un autre client.");
  }
}

export function searchCustomers(
  query: string,
  page: number,
  pageSize: number,
  includeArchived = false,
  debtFilter: CustomerDebtFilter = "all",
  // P1-3 : filtre serveur « archivés seuls » — total réel (plus de
  // filtrage client borné à la page).
  archivedOnly = false,
  // Tri serveur : le renderer ne réordonne plus la page seule (les débiteurs
  // hors page 1 semblaient « disparus »).
  sort: CustomerSort = "name_asc",
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
  const escapeLike = (s: string): string => s.replace(/[%_\\]/g, (c) => `\\${c}`);
  const norm = normCustomerSearch(q);
  const digits = digitsOnly(q);
  // Téléphone saisi sans espaces (« 0550123456 ») vs stocké avec (« 0550 12… ») :
  // branche chiffres seuls, activée à ≥ 2 chiffres (même seuil que la caisse).
  const useDigits = digits.length >= 2;
  const where = q
    ? `WHERE (search_name LIKE ? ESCAPE '\\' OR COALESCE(search_norm, '') LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\'${useDigits ? ` OR ${PHONE_DIGITS_EXPR} LIKE ? ESCAPE '\\'` : ""})${alive}${debt}`
    : `WHERE 1 = 1${alive}${debt}`;
  const like = `%${escapeLike(q)}%`;
  // Repli si la normalisation vide la requête (diacritiques combinants seuls) :
  // LIKE '%%' renverrait tout le registre — on retombe sur la forme brute.
  const normLike = `%${escapeLike(norm !== "" ? norm : q)}%`;
  const params: unknown[] = q
    ? useDigits
      ? [like, normLike, like, `%${digits}%`]
      : [like, normLike, like]
    : [];
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM customers ${where}`).get(...params) as { c: number }
  ).c;
  // Tri serveur (whitelist fermée, jamais d'interpolation brute) : l'ordre est
  // global à la pagination, plus de réordonnancement d'une page seule côté UI.
  // Note : `assertOrderClause` des autres repos ne s'applique pas ici — sa
  // regex refuse `COALESCE(...)` ; l'ordre est construit uniquement depuis les
  // branches littérales ci-dessous (aucune entrée utilisateur interpolée).
  const nameKey = `COALESCE(c.search_norm, c.search_name)`;
  const order =
    sort === "name_desc"
      ? `${nameKey} DESC, c.id ASC`
      : sort === "debt_desc"
        ? `c.outstanding_balance_minor DESC, ${nameKey} ASC, c.id ASC`
        : sort === "debt_asc"
          ? `c.outstanding_balance_minor ASC, ${nameKey} ASC, c.id ASC`
          : sort === "purchases_desc"
            ? `total_purchases_minor DESC, ${nameKey} ASC, c.id ASC`
            : `${nameKey} ASC, c.id ASC`;
  // Agrégats par client en sous-requêtes corrélées (ventes non annulées ;
  // `sales.customer_id` est indexé : ~1 ms pour une page de 20).
  // E-30 : `has_overdue_sale` = le client a-t-il une vente ouverte échue ?
  // (le statut stocké ne peut pas suivre le temps : l'échéance peut
  // expirer sans qu'aucun mouvement ne passe par la base).
  const rows = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id AND s.is_cancelled = 0) AS invoice_count,
        (SELECT COALESCE(SUM(s.total_minor), 0) FROM sales s WHERE s.customer_id = c.id AND s.is_cancelled = 0) AS total_purchases_minor,
        (SELECT MAX(s.created_at) FROM sales s WHERE s.customer_id = c.id AND s.is_cancelled = 0) AS last_sale_at,
        (CASE WHEN c.outstanding_balance_minor > 0 AND ${overdueSalesSql("c.id")} THEN 1 ELSE 0 END) AS has_overdue_sale
       FROM customers c ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize) as Record<string, unknown>[];
  // Statut affiché = statut stocké, promotions 'due' → 'overdue' si une
  // vente ouverte a dépassé son échéance (E-30).
  return {
    rows: rows.map((row) => {
      const { has_overdue_sale, ...rest } = row;
      return {
        ...rest,
        debt_status: liveDebtStatus(row["debt_status"], has_overdue_sale === 1),
      };
    }),
    total,
  };
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
  // search_norm (migration 0047) : maintenu à chaque écriture, jamais NULL
  // sur les lignes neuves (le backfill couvre l'historique).
  const searchNorm = normCustomerSearch(search);
  // Solde initial ≥ 0 garanti par le validateur : stocké tel quel + statut
  // calculé (même règle que les ventes, jamais de clamp silencieux).
  // AUDIT-ROOT: création tracée comme updateCustomer (history aveugle sinon).
  const tx = db.transaction(() => {
    // E-28 : unicité du téléphone (message FR avant l'écriture ; la base
    // reste l'autorité finale).
    assertPhoneAvailable(args.phone, null);
    const r = db
      .prepare(
        `INSERT INTO customers (uuid, operation_id, first_name, last_name, search_name, search_norm, phone, address, credit_limit_minor, initial_balance_minor, outstanding_balance_minor, debt_status, is_over_limit, settlement_day, is_bread_client, credit_allowed, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? <= 0 THEN 'none' WHEN ? > 0 AND ? > ? THEN 'over_limit' ELSE 'due' END, CASE WHEN ? > 0 AND ? > ? THEN 1 ELSE 0 END, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        args.operationId,
        args.firstName.trim(),
        args.lastName.trim(),
        search,
        searchNorm,
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
    return tx();
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
  // search_norm (migration 0047) : maintenu à chaque écriture, jamais NULL
  // sur les lignes neuves (le backfill couvre l'historique).
  const searchNorm = normCustomerSearch(search);
  const tx = db.transaction(() => {
    claimOptional(args.operationId, "customers.update", args.now);
    const exists = db.prepare(`SELECT id FROM customers WHERE id = ?`).get(args.id) as
      { id: number } | undefined;
    if (!exists) throw new Error("Client introuvable.");
    // E-28 : unicité du téléphone (le client lui-même est exclu).
    assertPhoneAvailable(args.phone, args.id);
    db.prepare(
      // Plafond modifié → statut recalculé (même règle qu'à la création :
      // 'none' si solde ≤ 0, 'over_limit' si plafond > 0 dépassé, sinon 'due').
      `UPDATE customers SET first_name = ?, last_name = ?, search_name = ?, search_norm = ?, phone = ?, address = ?, credit_limit_minor = ?, credit_allowed = ?, settlement_day = ?, notes = ?, debt_status = ${debtStatusSql("outstanding_balance_minor", "id", "?")}, is_over_limit = CASE WHEN ? > 0 AND outstanding_balance_minor > ? THEN 1 ELSE 0 END, updated_at = ? WHERE id = ?`,
    ).run(
      args.firstName.trim(),
      args.lastName.trim(),
      search,
      searchNorm,
      args.phone?.trim() || null,
      args.address?.trim() || null,
      args.creditLimitMinor,
      args.creditAllowed ? 1 : 0,
      args.settlementDay,
      args.notes?.trim() || null,
      args.creditLimitMinor,
      args.creditLimitMinor,
      args.creditLimitMinor,
      args.creditLimitMinor,
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
    tx();
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
    tx();
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
    tx();
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
 * Règle exécutée ici même (`computeReceiptBalancesInline`) : la copie domaine,
 * jamais branchée, a été retirée (ADR-153, lot B).
 */
export function getCustomerPaymentReceipt(paymentId: number): {
  payment: Record<string, unknown>;
  customer: Record<string, unknown>;
  prevBalanceMinor: number;
  newBalanceMinor: number;
} {
  const db = getDb();
  const payment = db.prepare(`SELECT * FROM sale_payments WHERE id = ?`).get(paymentId) as
    Record<string, unknown> | undefined;
  if (!payment) throw new Error("Paiement introuvable.");
  const customerId =
    typeof payment["customer_id"] === "number"
      ? payment["customer_id"]
      : typeof payment["sale_id"] === "number"
        ? (
            db.prepare(`SELECT customer_id FROM sales WHERE id = ?`).get(payment["sale_id"]) as
              { customer_id: number | null } | undefined
          )?.customer_id
        : null;
  if (customerId == null) throw new Error("Paiement sans client : reçu indisponible.");
  const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(customerId) as
    Record<string, unknown> | undefined;
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

/** Reconstitution des soldes du grand-livre — source unique (ADR-153). */
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
  /** Auteur de l'encaissement (session main, 0046). */
  staffUserId?: number | null;
}): { paymentId: number; allocatedSaleIds: number[] } {
  if (args.saleId == null && args.customerId == null) {
    throw new Error("Client ou vente requis pour enregistrer un paiement.");
  }
  const db = getDb();
  // Idempotence : rejouer le même operationId (retry IPC, double-clic avant
  // le verrou UI) retrouve le paiement existant. Garde anti-course : l'UNIQUE
  // tranche les insertions concurrentes (voir catch ci-dessous).
  // Un encaissement standalone ventilé écrit une ligne par facture sous
  // `${operationId}:${saleId}` (plus une ligne résiduelle à l'operationId
  // exact s'il reste un solde sans facture) : la recherche couvre les deux.
  const findExisting = (): { paymentId: number } | undefined => {
    const exact = db
      .prepare(`SELECT id FROM sale_payments WHERE operation_id = ?`)
      .get(args.operationId) as { id: number } | undefined;
    if (exact) return { paymentId: exact.id };
    const prefix = `${args.operationId.replace(/[%_\\]/g, (c) => `\\${c}`)}:%`;
    const branch = db
      .prepare(
        `SELECT id FROM sale_payments WHERE operation_id LIKE ? ESCAPE '\\' ORDER BY id ASC LIMIT 1`,
      )
      .get(prefix) as { id: number } | undefined;
    return branch ? { paymentId: branch.id } : undefined;
  };
  const fast = findExisting();
  if (fast) return { ...fast, allocatedSaleIds: [] };
  const insertPayment = db.prepare(
    `INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method, reference, notes, payment_date, operation_id, staff_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertPaymentRow = (
    operationId: string,
    saleId: number | null,
    customerId: number | null,
    amountMinor: number,
  ): void => {
    insertPayment.run(
      randomUUID(),
      saleId,
      customerId,
      amountMinor,
      args.method,
      args.reference,
      args.notes,
      args.paymentDate,
      operationId,
      args.staffUserId ?? null,
      args.now,
    );
  };
  const applyToSale = db.prepare(
    `UPDATE sales SET amount_paid_minor = amount_paid_minor + ?, remaining_balance_minor = total_minor - (amount_paid_minor + ?), payment_status = CASE WHEN total_minor - (amount_paid_minor + ?) = 0 THEN 'paid' WHEN (amount_paid_minor + ?) = 0 THEN 'unpaid' ELSE 'partial' END, updated_at = ? WHERE id = ?`,
  );
  const tx = db.transaction(() => {
    const allocations: { saleId: number; amountMinor: number }[] = [];
    // Garde-fous explicites (aucun clamp silencieux : aucun centime perdu).
    // - Paiement lié à une vente : borné par le reste dû de LA VENTE (le solde
    //   client peut être inférieur via un avoir/solde initial créditeur).
    // - Encaissement standalone (sans vente) : borné par le solde client, puis
    //   ventilé FIFO sur ses factures ouvertes (la plus ancienne d'abord) pour
    //   que le reste dû par facture et le solde client restent alignés.
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
      insertPaymentRow(args.operationId, args.saleId, args.customerId, args.amountMinor);
      applyToSale.run(
        args.amountMinor,
        args.amountMinor,
        args.amountMinor,
        args.amountMinor,
        args.now,
        args.saleId,
      );
    } else {
      const customerId = args.customerId;
      if (customerId == null) {
        throw new Error("Client ou vente requis pour enregistrer un paiement.");
      }
      const c = db
        .prepare(`SELECT outstanding_balance_minor FROM customers WHERE id = ?`)
        .get(customerId) as { outstanding_balance_minor: number } | undefined;
      if (!c) throw new Error("Client introuvable.");
      if (args.amountMinor > c.outstanding_balance_minor) {
        throw new Error("Le paiement dépasse le solde dû du client.");
      }
      // FIFO : factures ouvertes de la plus ancienne à la plus récente.
      const open = db
        .prepare(
          `SELECT id, remaining_balance_minor FROM sales WHERE customer_id = ? AND is_cancelled = 0 AND remaining_balance_minor > 0 ORDER BY created_at ASC, id ASC`,
        )
        .all(customerId) as { id: number; remaining_balance_minor: number }[];
      let rest = args.amountMinor;
      for (const s of open) {
        if (rest <= 0) break;
        const take = Math.min(rest, s.remaining_balance_minor);
        insertPaymentRow(`${args.operationId}:${s.id}`, s.id, customerId, take);
        applyToSale.run(take, take, take, take, args.now, s.id);
        allocations.push({ saleId: s.id, amountMinor: take });
        rest -= take;
      }
      if (rest > 0) {
        // Solde sans facture ouverte (ex. solde initial) : ligne résiduelle.
        insertPaymentRow(args.operationId, null, customerId, rest);
      }
    }
    // E-30 : le statut du client est recalculé APRÈS le mouvement de la
    // vente (le statut « en retard » dépend du reste dû de la vente : il
    // doit être lu dans l'état FINAL de la transaction, sinon un paiement
    // qui solde une vente échue laisserait le client « en retard »).
    if (args.customerId != null) {
      // Soustraction exacte (un solde négatif = avoir explicite, jamais masqué)
      // + recalcul du statut (même règle que la création de vente).
      db.prepare(
        `UPDATE customers SET outstanding_balance_minor = outstanding_balance_minor - ?,
          debt_status = ${debtStatusSql("outstanding_balance_minor - ?", "id")},
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
    const inserted = findExisting();
    if (!inserted) throw new Error("Paiement introuvable après insertion.");
    // P8: paiement client = mutation financière tracée (history).
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'customer.payment', 'customer', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(args.customerId ?? args.saleId ?? inserted.paymentId),
      args.operationId,
      JSON.stringify(
        args.saleId != null
          ? { amount: args.amountMinor, saleId: args.saleId }
          : { amount: args.amountMinor, saleId: null, allocations },
      ),
      args.now,
    );
    return {
      paymentId: inserted.paymentId,
      // Factures soldées par la ventilation FIFO : le miroir APK en repousse
      // le détail (montant payé/reste à jour), pas seulement les listes.
      allocatedSaleIds: allocations.map((a) => a.saleId),
    };
  });
  try {
    return tx();
  } catch (err) {
    // Insertion concurrente du même operationId : retrouver le gagnant.
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: sale_payments\.operation_id/i.test(err.message)
    ) {
      const retry = findExisting();
      if (retry) return { ...retry, allocatedSaleIds: [] };
    }
    throw err;
  }
}
