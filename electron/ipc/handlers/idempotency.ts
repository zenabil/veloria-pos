// Veloria PoS — Electron: helper d'idempotence générique (P07).
// Réserve operationId (renderer, un UUID par dialogue) DANS la transaction
// appelante : le rejouement retourne le résultat stocké au lieu de ré-appliquer.
// Doit être appelé EN PREMIER dans chaque transaction mutante.

import { getDb } from "../../database/sqlite.service";
import { createHash } from "node:crypto";

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T est le contrat typé des 20+ appelants (chaque opération relit son résultat) ; sans générique, chaque site devrait caster unknown (pire).
export function peekIdempotency<T>(operationId: string, expectedOpType?: string): T | undefined {
  const db = getDb();
  try {
    const row = db
      .prepare(`SELECT result_json, op_type FROM idempotency_keys WHERE operation_id = ?`)
      .get(operationId) as { result_json: string; op_type: string } | undefined;
    if (!row) return undefined;
    // DB-03: même UUID + opération différente ≠ même opération (pas de
    // réutilisation inter-workflows).
    if (expectedOpType != null && row.op_type !== expectedOpType) return undefined;
    // '{}' = claim sans résultat stocké (crash avant store) : pas un résultat
    // valide — le réappel réclame (UNIQUE) puis rejoue proprement.
    if (row.result_json === "{}") return undefined;
    try {
      return JSON.parse(row.result_json) as T;
    } catch {
      return undefined;
    }
  } catch {
    return undefined;
  }
}

export function claimIdempotency(operationId: string, opType: string, now: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO idempotency_keys (operation_id, op_type, result_json, created_at) VALUES (?, ?, '{}', ?)`,
  ).run(operationId, opType, now);
}

export function storeIdempotencyResult(operationId: string, result: unknown): void {
  const db = getDb();
  db.prepare(`UPDATE idempotency_keys SET result_json = ? WHERE operation_id = ?`).run(
    JSON.stringify(result ?? {}),
    operationId,
  );
}

/**
 * RADICAL-FIX: audit déterministe pour les updates sans operationId caller.
 * Avant : `randomUUID()` neuf à chaque retry → audit gonflé + incorrélable.
 * Après : `sha256(entity|id|payload)` stable — même payload rejoué = même
 * operation_id d'audit (corrélable, dédupliquable en analyse). Quand le caller
 * fournit operationId, on l'utilise tel quel (traçabilité retry exacte).
 */
export function auditOperationId(
  provided: string | null | undefined,
  entity: string,
  id: string | number,
  payload: unknown,
): string {
  if (typeof provided === "string" && provided.trim().length > 0) return provided;
  try {
    const h = createHash("sha256");
    h.update(`${entity}|${String(id)}|${JSON.stringify(payload ?? {})}`);
    return `det-${h.digest("hex").slice(0, 32)}`;
  } catch {
    return `det-${entity}-${String(id)}`;
  }
}

/**
 * RADICAL-FIX: garde optionnelle pour les updates last-write-wins.
 * - Sans operationId : exécute directement (compat legacy).
 * - Avec operationId : peek/claim/store via idempotency_keys (retry = no-op,
 *   pas de 2e audit, pas de double couche FIFO).
 * Retourne le résultat stocké si rejouement déjà appliqué.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- miroir de peekIdempotency : T est le contrat typé des 20+ appelants ; sans générique, chaque update casterait unknown (pire).
export function peekOptional<T>(
  operationId: string | null | undefined,
  opType: string,
): T | undefined {
  if (typeof operationId !== "string" || operationId.trim().length === 0) return undefined;
  return peekIdempotency<T>(operationId, opType);
}

export function claimOptional(
  operationId: string | null | undefined,
  opType: string,
  now: string,
): void {
  if (typeof operationId !== "string" || operationId.trim().length === 0) return;
  claimIdempotency(operationId, opType, now);
}

export function storeOptional(operationId: string | null | undefined, result: unknown): void {
  if (typeof operationId !== "string" || operationId.trim().length === 0) return;
  storeIdempotencyResult(operationId, result);
}
