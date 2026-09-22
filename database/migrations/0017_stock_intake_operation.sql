-- Veloria PoS — Migration 0017: idempotence des réceptions fournisseurs.
-- Ajoute operation_id (clé d'idempotence générée côté renderer, UUID) sur
-- stock_intakes : rejouer la même réception (double-clic, retry IPC) retourne
-- la facture existante au lieu de dupliquer stock + dette. Aucune modification
-- des migrations précédentes (immuables). Les lignes antérieures gardent NULL
-- (UNIQUE autorise plusieurs NULL en SQLite : aucun backfill requis).
ALTER TABLE stock_intakes ADD COLUMN operation_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_intakes_operation ON stock_intakes(operation_id);
