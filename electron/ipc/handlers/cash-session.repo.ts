// Veloria PoS — Main-process repository : sessions de caisse (migration 0059).
// Une session = un poste ouvert (fond annoncé), compté (physique), fermé
// (attente figée). L'écart n'est JAMAIS stocké : `compté − attendu`.
// Règles 4-5 : montants en centimes entiers, UNE transaction par mutation,
// `operationId` idempotent (double-clic / retry = même effet, jamais un doublon).
// Copie jumelle de `src/domain/cash/session-rules.ts` (frontière rootDir) :
// `computeSessionExpected` ci-dessous garde la MÊME formule que le domaine, la
// parité est prouvée par `tests/unit/cash-session.test.ts`.

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { claimIdempotency, peekIdempotency, storeIdempotencyResult } from "./idempotency";
import { MONEY_MAX_SINGLE_MINOR } from "../money-guard";
import { businessDaySql } from "../../shared/business-day";

export interface CashSessionRow {
  id: number;
  uuid: string;
  post: string;
  label: string;
  staffUserId: number | null;
  status: "open" | "closed";
  openingFloatMinor: number;
  countedMinor: number | null;
  /** Figé à la fermeture ; calculé en direct pour une session ouverte. */
  expectedMinor: number;
  /** `compté − attendu` (null aussi longtemps qu'aucun comptage n'est saisi). */
  varianceMinor: number | null;
  note: string | null;
  openedAt: string;
  closedAt: string | null;
}

/**
 * Formule du domaine, en double (credits − debits, signée). Exportée pour le
 * test de parité `tests/unit/cash-session.test.ts` (toute divergence casse là).
 */
export function computeSessionExpectedMinor(args: {
  openingFloatMinor: number;
  cashSalesMinor: number;
  customerCollectionsMinor: number;
  expensesMinor: number;
  refundsMinor: number;
}): number {
  const credits = args.openingFloatMinor + args.cashSalesMinor + args.customerCollectionsMinor;
  const debits = args.expensesMinor + args.refundsMinor;
  return credits - debits;
}

/** Garde d'écriture : entier de centimes, positif, borné. */
function assertCashAmount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MONEY_MAX_SINGLE_MINOR) {
    throw new Error(`${label} invalide.`);
  }
}

/**
 * Agrégats d'encaissement/décaissement sur la FENÊTRE D'INSTANT d'une session
 * (`opened_at ≤ created_at < fin`). Le tiroir suit l'argent au moment où il
 * bouge : les colonnes d'instant sont comparées directement (indexable), pas de
 * découpage en journée ici.
 */
function sessionFlows(fromExclusive: { from: string; to: string }): {
  cashSalesMinor: number;
  customerCollectionsMinor: number;
  expensesMinor: number;
  refundsMinor: number;
} {
  const db = getDb();
  const cash = db
    .prepare(
      `SELECT COALESCE(SUM(amount_paid_minor - credit_applied_minor), 0) AS p FROM sales
       WHERE created_at >= ? AND created_at < ? AND is_cancelled = 0
         AND COALESCE(payment_method, 'cash') = 'cash'`,
    )
    .get(fromExclusive.from, fromExclusive.to) as { p: number };
  // Encaissements autonomes (dette réglée sans vente liée) : mêmes flux que le Z.
  const collections = db
    .prepare(
      `SELECT COALESCE(SUM(amount_minor), 0) AS c FROM sale_payments
       WHERE sale_id IS NULL AND created_at >= ? AND created_at < ?`,
    )
    .get(fromExclusive.from, fromExclusive.to) as { c: number };
  // Seules les dépenses DÉCAISSÉES sortent de l'argent du tiroir.
  const expenses = db
    .prepare(
      `SELECT COALESCE(SUM(amount_minor), 0) AS e FROM expenses
       WHERE status = 'paid' AND created_at >= ? AND created_at < ?`,
    )
    .get(fromExclusive.from, fromExclusive.to) as { e: number };
  // Un retour annulé ne rembourse rien.
  const refunds = db
    .prepare(
      `SELECT COALESCE(SUM(amount_refunded_minor), 0) AS r FROM returns
       WHERE status != 'cancelled' AND created_at >= ? AND created_at < ?`,
    )
    .get(fromExclusive.from, fromExclusive.to) as { r: number };
  return {
    cashSalesMinor: Number(cash.p),
    customerCollectionsMinor: Number(collections.c),
    expensesMinor: Number(expenses.e),
    refundsMinor: Number(refunds.r),
  };
}

interface SessionRecord {
  id: number;
  uuid: string;
  post: string;
  label: string;
  staff_user_id: number | null;
  status: string;
  opening_float_minor: number;
  counted_minor: number | null;
  expected_minor: number | null;
  note: string | null;
  opened_at: string;
  closed_at: string | null;
}

function readSession(id: number): SessionRecord | null {
  return (
    (getDb()
      .prepare(
        `SELECT id, uuid, post, label, staff_user_id, status, opening_float_minor,
           counted_minor, expected_minor, note, opened_at, closed_at
         FROM cash_sessions WHERE id = ?`,
      )
      .get(id) as SessionRecord | undefined) ?? null
  );
}

/**
 * Ligne de session prête à rendre, avec attente (figée si fermée, en direct si
 * ouverte) et écart dérivé. `nowInstant` borne la fenêtre d'une session ouverte.
 */
function decorate(row: SessionRecord, nowInstant: string): CashSessionRow {
  const closed = row.status === "closed";
  const expectedMinor = closed
    ? Number(row.expected_minor ?? 0)
    : computeSessionExpectedMinor({
        openingFloatMinor: Number(row.opening_float_minor),
        ...sessionFlows({ from: row.opened_at, to: nowInstant }),
      });
  const countedMinor = row.counted_minor == null ? null : Number(row.counted_minor);
  return {
    id: Number(row.id),
    uuid: row.uuid,
    post: row.post,
    label: row.label,
    staffUserId: row.staff_user_id == null ? null : Number(row.staff_user_id),
    status: closed ? "closed" : "open",
    openingFloatMinor: Number(row.opening_float_minor),
    countedMinor,
    expectedMinor,
    varianceMinor: countedMinor == null ? null : countedMinor - expectedMinor,
    note: row.note,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  };
}

/** Ouverture d'une session de poste (refusée si ce poste a déjà une session ouverte). */
export function openCashSessionAtomic(args: {
  post: string;
  label: string;
  openingFloatMinor: number;
  note: string | null;
  actorUserId: number | null;
  operationId: string;
  now: string;
}): CashSessionRow {
  const db = getDb();
  const post = args.post.trim();
  const label = args.label.trim();
  if (post.length === 0 || post.length > 40) throw new Error("Nom de poste invalide.");
  if (label.length === 0 || label.length > 60) throw new Error("Libellé de session invalide.");
  assertCashAmount(args.openingFloatMinor, "Fond d'ouverture");
  const fast = peekIdempotency<CashSessionRow>(args.operationId, "cash.open");
  if (fast && Object.keys(fast).length > 0) return fast;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "cash.open", args.now);
    const already = db
      .prepare(`SELECT id FROM cash_sessions WHERE status = 'open' AND post = ?`)
      .get(post) as { id: number } | undefined;
    if (already) {
      throw new Error(`Une session est déjà ouverte pour le poste « ${post} ».`);
    }
    db.prepare(
      `INSERT INTO cash_sessions (uuid, post, label, staff_user_id, status, opening_float_minor,
         counted_minor, expected_minor, note, opened_at, closed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'open', ?, NULL, NULL, ?, ?, NULL, ?, ?)`,
    ).run(
      randomUUID(),
      post,
      label,
      args.actorUserId,
      args.openingFloatMinor,
      args.note,
      args.now,
      args.now,
      args.now,
    );
  });
  tx();
  const row = db
    .prepare(
      `SELECT id, uuid, post, label, staff_user_id, status, opening_float_minor,
         counted_minor, expected_minor, note, opened_at, closed_at
       FROM cash_sessions WHERE status = 'open' AND post = ? ORDER BY id DESC LIMIT 1`,
    )
    .get(post) as SessionRecord | undefined;
  if (!row) throw new Error("Session de caisse introuvable.");
  const result = decorate(row, args.now);
  storeIdempotencyResult(args.operationId, result);
  return result;
}

/** Comptage physique intermédiaire (la session reste ouverte). */
export function countCashSessionAtomic(args: {
  sessionId: number;
  countedMinor: number;
  operationId: string;
  now: string;
}): CashSessionRow {
  const db = getDb();
  assertCashAmount(args.countedMinor, "Comptage");
  const fast = peekIdempotency<CashSessionRow>(args.operationId, "cash.count");
  if (fast && Object.keys(fast).length > 0) return fast;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "cash.count", args.now);
    const row = readSession(args.sessionId);
    if (!row) throw new Error("Session de caisse introuvable.");
    if (row.status !== "open") throw new Error("Cette session de caisse est déjà fermée.");
    db.prepare(`UPDATE cash_sessions SET counted_minor = ?, updated_at = ? WHERE id = ?`).run(
      args.countedMinor,
      args.now,
      args.sessionId,
    );
  });
  tx();
  const after = readSession(args.sessionId);
  if (!after) throw new Error("Session de caisse introuvable.");
  const result = decorate(after, args.now);
  storeIdempotencyResult(args.operationId, result);
  return result;
}

/**
 * Fermeture : le comptage devient obligatoire et l'attente est FIGÉE sur la
 * fenêtre de la session. Rejouer le même `operationId` rend le même résultat.
 */
export function closeCashSessionAtomic(args: {
  sessionId: number;
  countedMinor: number;
  note: string | null;
  operationId: string;
  now: string;
}): CashSessionRow {
  const db = getDb();
  assertCashAmount(args.countedMinor, "Comptage");
  const fast = peekIdempotency<CashSessionRow>(args.operationId, "cash.close");
  if (fast && Object.keys(fast).length > 0) return fast;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "cash.close", args.now);
    const row = readSession(args.sessionId);
    if (!row) throw new Error("Session de caisse introuvable.");
    if (row.status !== "open") throw new Error("Cette session de caisse est déjà fermée.");
    if (args.now < row.opened_at) throw new Error("Clôture antérieure à l'ouverture.");
    const expected = computeSessionExpectedMinor({
      openingFloatMinor: Number(row.opening_float_minor),
      ...sessionFlows({ from: row.opened_at, to: args.now }),
    });
    db.prepare(
      `UPDATE cash_sessions
       SET status = 'closed', closed_at = ?, expected_minor = ?, counted_minor = ?,
           note = COALESCE(?, note), updated_at = ?
       WHERE id = ? AND status = 'open'`,
    ).run(args.now, expected, args.countedMinor, args.note, args.now, args.sessionId);
  });
  tx();
  const after = readSession(args.sessionId);
  if (!after) throw new Error("Session de caisse introuvable.");
  const result = decorate(after, args.now);
  storeIdempotencyResult(args.operationId, result);
  return result;
}

/** Sessions dont l'ouverture tombe sur une période de JOURS MÉTIER bornée. */
export function listCashSessions(args: { from: string; to: string; now: string }): {
  rows: CashSessionRow[];
} {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, uuid, post, label, staff_user_id, status, opening_float_minor,
         counted_minor, expected_minor, note, opened_at, closed_at
       FROM cash_sessions
       WHERE ${businessDaySql("opened_at")} >= ? AND ${businessDaySql("opened_at")} <= ?
       ORDER BY opened_at DESC, id DESC`,
    )
    .all(args.from, args.to) as SessionRecord[];
  return { rows: rows.map((row) => decorate(row, args.now)) };
}

/** Session ouverte la plus récente (contrat Owner `activeSession`), ou null. */
export function getActiveCashSession(now: string): CashSessionRow | null {
  const row =
    (getDb()
      .prepare(
        `SELECT id, uuid, post, label, staff_user_id, status, opening_float_minor,
           counted_minor, expected_minor, note, opened_at, closed_at
         FROM cash_sessions WHERE status = 'open'
         ORDER BY opened_at DESC, id DESC LIMIT 1`,
      )
      .get() as SessionRecord | undefined) ?? null;
  return row ? decorate(row, now) : null;
}

/**
 * Bloc `money.audit` de la liasse propriétaire : fonds des sessions ouvertes,
 * écart net des sessions fermées, conformité et nombre de postes ouverts.
 */
export function getCashAuditSummary(args: { from: string; to: string; now: string }): {
  fundsMinor: number;
  varianceNetMinor: number;
  conformityPercent: number;
  activeRegisters: number;
  sessions: CashSessionRow[];
  activeSession: CashSessionRow | null;
} {
  const { rows } = listCashSessions(args);
  const closed = rows.filter((r) => r.status === "closed");
  const open = rows.filter((r) => r.status === "open");
  const fundsMinor = open.reduce((sum, r) => sum + r.expectedMinor, 0);
  const varianceNetMinor = closed.reduce((sum, r) => sum + (r.varianceMinor ?? 0), 0);
  const clean = closed.filter((r) => r.varianceMinor === 0).length;
  const firstOpen = open.length > 0 ? (open[0] ?? null) : null;
  return {
    fundsMinor,
    varianceNetMinor,
    conformityPercent: closed.length === 0 ? 100 : Math.round((clean * 100) / closed.length),
    activeRegisters: open.length,
    sessions: rows,
    activeSession: firstOpen,
  };
}
