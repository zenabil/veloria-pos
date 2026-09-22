-- Veloria PoS — Migration 0022: idempotence des créations (operation_id).
-- Même motif que 0017 (stock_intakes), 0020 (paiements) et sales.operation_id :
-- l'UI génère un UUID par dialogue de création et le rejoue en cas de
-- retry/double-clic ; l'UNIQUE tranche les courses (le perdant relit l'entité
-- existante au lieu de la dupliquer).
-- Tables : catalogue (products), tiers (customers, suppliers) et financier
-- (expenses) — F-02 du FULL_PROJECT_QA_AUDIT (AGENTS.md règle 4).
-- Lignes historiques NULL tolérées (UNIQUE SQLite accepte plusieurs NULL).
-- Non-destructif : ajouts seuls, migrations précédentes immuables.

ALTER TABLE products ADD COLUMN operation_id TEXT;
ALTER TABLE customers ADD COLUMN operation_id TEXT;
ALTER TABLE suppliers ADD COLUMN operation_id TEXT;
ALTER TABLE expenses ADD COLUMN operation_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_operation ON products(operation_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_operation ON customers(operation_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_operation ON suppliers(operation_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_operation ON expenses(operation_id);
