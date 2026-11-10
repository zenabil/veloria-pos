-- Veloria PoS — Migration 0060: journal des remboursements clients (C-03).
--
-- Constat (audit 2026-11-09, C-03) : `returns` ne portait que le CUMUL
-- (`amount_refunded_minor`) sans date de sortie de caisse. L'`updated_at`
-- est écrasé par d'autres transitions et `created_at` est le jour de
-- création du retour — aucun ne donne le jour où les espèces sont parties.
-- L'`audit_log` (`return.refunded`) porte déjà l'instant, mais on ne peut
-- pas y lire un montant métier (details_json, non requêtable en aveugle).
--
-- Réparation : une ligne par remboursement, écrite dans la même transaction
-- que `recordReturnRefundAtomic` (voir returns.repo.ts). `created_at` = instant
-- de sortie d'argent, indexé. La clôture Z et les sessions de caisse somment
-- ce journal (en millièmes de centimes, jamais de float).
--
-- Backfill déterministe et rejouable : depuis `audit_log` (montant dans
-- `details_json.amount`, méthode dans `details_json.method`). Les retours sans
-- journal après migration restent couverts par un repli applicatif (audit :
-- `updated_at`, dernier remboursement) — jamais de double comptage : le repli
-- ne vise que `NOT EXISTS (journal pour ce retour)`.
-- 0001..0059 immuables. Additif uniquement.

CREATE TABLE IF NOT EXISTS return_refund_movements (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE RESTRICT,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  method TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_return_refunds_return
  ON return_refund_movements(return_id);
CREATE INDEX IF NOT EXISTS idx_return_refunds_created_at
  ON return_refund_movements(created_at);

-- Backfill : montants déjà remboursés, un mouvement par événement d'audit.
-- `entity_id` = `customer:<id>` (les retours fournisseur sont hors clôture Z).
-- NB : `json_extract` exige JSON valide — un details_json illisible est
-- ignoré (le repli `updated_at` le couvre), jamais d'échec de migration.
INSERT INTO return_refund_movements (uuid, return_id, amount_minor, method, created_at)
SELECT
  a.event_id,
  CAST(substr(a.entity_id, length('customer:') + 1) AS INTEGER),
  CAST(json_extract(a.details_json, '$.amount') AS INTEGER),
  CAST(json_extract(a.details_json, '$.method') AS TEXT),
  a.created_at
FROM audit_log a
WHERE a.event_type = 'return.refunded'
  AND a.entity_type = 'return'
  AND substr(a.entity_id, 1, length('customer:')) = 'customer:'
  AND EXISTS (SELECT 1 FROM returns r WHERE r.id = CAST(substr(a.entity_id, length('customer:') + 1) AS INTEGER))
  AND COALESCE(CAST(json_extract(a.details_json, '$.amount') AS INTEGER), 0) > 0
  AND NOT EXISTS (SELECT 1 FROM return_refund_movements m WHERE m.uuid = a.event_id);
