// Veloria PoS — Electron: helper d'idempotence générique (P07).
// Réserve operationId (renderer, un UUID par dialogue) DANS la transaction
// appelante : le rejouement retourne le résultat stocké au lieu de ré-appliquer.
// Doit être appelé EN PREMIER dans chaque transaction mutante.

import { getDb } from "../../database/sqlite.service";

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
