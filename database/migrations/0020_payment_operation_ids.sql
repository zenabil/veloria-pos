-- Veloria PoS — Migration 0020: idempotence des paiements (operation_id).
-- Même motif que 0017 (stock_intakes) et sales.operation_id : l'UI génère un
-- UUID par dialogue de règlement et le rejoue en cas de retry/double-clic ;
-- l'UNIQUE tranche les courses (le perdant relit le paiement existant).
-- Lignes historiques NULL tolérées (UNIQUE SQLite accepte plusieurs NULL).
-- Non-destructif : ajouts seuls, migrations précédentes immuables.

ALTER TABLE sale_payments ADD COLUMN operation_id TEXT;
ALTER TABLE supplier_payments ADD COLUMN operation_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sale_payments_operation ON sale_payments(operation_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_payments_operation ON supplier_payments(operation_id);
