-- Veloria PoS — Migration 0021: clés d'idempotence génériques.
-- P07: sales.create/stock.intake/paiements portent déjà operationId + UNIQUE,
-- mais sales.cancel/stock.adjust/stock.inventory/returns.*/proformas.*/bread.*/
-- closings régénéraient un UUID côté main à chaque appel (double-clic = double
-- effet). Cette table permet à chaque mutation de réserver son operationId
-- (généré côté renderer, un UUID par dialogue) DANS la même transaction :
-- rejouer le même UUID retourne le résultat stocké au lieu de ré-appliquer.
-- Non-destructif : création seule, migrations précédentes immuables.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  operation_id TEXT PRIMARY KEY,
  op_type TEXT NOT NULL,
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_type ON idempotency_keys(op_type);
