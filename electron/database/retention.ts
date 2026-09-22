// Veloria PoS — Electron: rétention des tables techniques (P3).
// audit_log (1 ligne/mutation) et idempotency_keys (1 ligne/op idempotente)
// croissent sans borne : purge best-effort au démarrage, JAMAIS bloquante.
// - idempotency_keys : rejouabilité garantie 90 j (au-delà, les gardes UNIQUE
//   métier — sales.operation_id, UNIQUE(operation_id) des ventes — tranchent).
// - audit_log : traçabilité 365 j (au-delà, sauvegardes .vposdb font foi).

import { getDb } from "./sqlite.service";
import { log } from "../services/logger";

export const IDEMPOTENCY_RETENTION_DAYS = 90;
export const AUDIT_RETENTION_DAYS = 365;

export function pruneTechnicalTables(nowMs = Date.now()): { idempotency: number; audit: number } {
  const out = { idempotency: 0, audit: 0 };
  try {
    const db = getDb();
    const idemCutoff = new Date(nowMs - IDEMPOTENCY_RETENTION_DAYS * 86_400_000).toISOString();
    const auditCutoff = new Date(nowMs - AUDIT_RETENTION_DAYS * 86_400_000).toISOString();
    try {
      const r = db.prepare(`DELETE FROM idempotency_keys WHERE created_at < ?`).run(idemCutoff);
      out.idempotency = Number(r.changes);
    } catch {
      /* table absente (vieille base) : nominal */
    }
    try {
      const r = db.prepare(`DELETE FROM audit_log WHERE created_at < ?`).run(auditCutoff);
      out.audit = Number(r.changes);
    } catch {
      /* nominal */
    }
  } catch (err) {
    log("WARN", "database", "retention.skipped", { error: String(err) });
    return out;
  }
  if (out.idempotency > 0 || out.audit > 0) {
    log("INFO", "database", "retention.pruned", { ...out });
  }
  return out;
}
