// Veloria PoS — Electron: rétention des tables techniques (P3).
// audit_log (1 ligne/mutation) et idempotency_keys (1 ligne/op idempotente)
// croissent sans borne : purge best-effort au démarrage, JAMAIS bloquante.
// - idempotency_keys : rejouabilité garantie 90 j (au-delà, les gardes UNIQUE
//   métier — sales.operation_id, UNIQUE(operation_id) des ventes — tranchent).
// - RADICAL-FIX: les opérations SANS garde UNIQUE métier (cancel/adjust/returns/
//   updates optionnels/proformas/closings/settings/company) sont EXCLUES
//   de la purge (conservées 365 j comme l'audit) — sinon un replay >90 j
//   ré-exécuterait une annulation déjà appliquée.
// - audit_log : traçabilité 365 j (au-delà, sauvegardes .vposdb font foi).

import { getDb } from "./sqlite.service";
import { log } from "../services/logger";

export const IDEMPOTENCY_RETENTION_DAYS = 90;
export const IDEMPOTENCY_CRITICAL_RETENTION_DAYS = 365;
export const AUDIT_RETENTION_DAYS = 365;

// Types sans UNIQUE métier dédié → purge longue (365 j), jamais 90 j.
const CRITICAL_OP_PREFIXES = [
  "sales.cancel",
  "stock.adjust",
  "stock.inventory",
  "returns.",
  "proformas.",
  "closings.",
  "settings.save",
  "company.",
  "products.update",
  "customers.update",
  "suppliers.update",
  "expenses.update",
  "sales.setDueDate",
  "products.setSuppliers",
  "categories.create",
  // L4 : opérations dont la rejouabilité repose SUR LA SEULE clé
  // idempotency (aucune garde UNIQUE métier équivalente) — les purger à 90 j
  // rouvrait la porte d'un double ré-exécution (import en lot, annulation
  // d'accès, file de synchro, calcul zakat, réception de commande).
  // Préfixes : "zakat.save" couvre aussi "zakat.saveParams", "purchase." la
  // création/réception de commande, "customers.access" activation/révocation,
  // "sync." enqueue/pushNow/saveConfig (markSent retiré ADR-119 : supersédé
  // par le UPDATE inliné de pushNowAtomic).
  // Vérification faite en complément : `announcements.save` n'a AUCUNE colonne
  // operation_id (table announcements, 0032) → même classe de risque (double
  // annonce après purge à 90 j).
  "zakat.save",
  "products.import",
  "customers.import",
  "purchase.",
  "customers.access",
  "sync.",
  "announcements.save",
];

function isCriticalOpType(opType: string): boolean {
  return CRITICAL_OP_PREFIXES.some((p) => opType === p || opType.startsWith(p));
}

export function pruneTechnicalTables(nowMs = Date.now()): { idempotency: number; audit: number } {
  const out = { idempotency: 0, audit: 0 };
  try {
    const db = getDb();
    const idemCutoff = new Date(nowMs - IDEMPOTENCY_RETENTION_DAYS * 86_400_000).toISOString();
    const criticalCutoff = new Date(
      nowMs - IDEMPOTENCY_CRITICAL_RETENTION_DAYS * 86_400_000,
    ).toISOString();
    const auditCutoff = new Date(nowMs - AUDIT_RETENTION_DAYS * 86_400_000).toISOString();
    try {
      // RADICAL: purge sélective — les clés critiques survivent 365 j.
      const rows = db
        .prepare(
          `SELECT operation_id, op_type, created_at FROM idempotency_keys WHERE created_at < ?`,
        )
        .all(idemCutoff) as { operation_id: string; op_type: string; created_at: string }[];
      let deleted = 0;
      const del = db.prepare(`DELETE FROM idempotency_keys WHERE operation_id = ?`);
      const tx = db.transaction(() => {
        for (const r of rows) {
          if (isCriticalOpType(r.op_type) && r.created_at >= criticalCutoff) continue;
          del.run(r.operation_id);
          deleted += 1;
        }
      });
      (tx as unknown as () => void)();
      out.idempotency = deleted;
    } catch {
      /* table absente (vieille base) : nominal */
    }
    try {
      // EXCEPTION documentée (conseil llm-council) : purge mono-instruction,
      // donc atomique par nature dans SQLite ; volontairement hors de la
      // transaction idempotence ci-dessus pour ne pas allonger le verrou de
      // démarrage. Purge best-effort horodatée, jamais de données critiques.
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
