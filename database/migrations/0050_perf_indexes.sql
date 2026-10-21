-- Veloria PoS — Migration 0050 : index des chemins chauds (W8 / audit F-06).
--
-- Contexte : l'audit intégral a mesuré 6 requêtes « chaudes » sans index
-- adapté (F-06) + 4 N+1 (J-01). SQLite ne peut pas servir un `LIKE '%…%'`
-- ni un `substr(colonne, 1, 10)` : chaque ligne de la table était donc
-- parcourue (et recalculée) à chaque appel.
--
-- Ce que fait cette migration :
--   1. `customers.phone_digits` : colonne GÉNÉRÉE (les 8 séparateurs
--      retirés une fois, à l'écriture) + index. Les 8 `REPLACE()` ne sont
--      plus refaits à chaque lecture de la recherche client.
--   2. Index composites sur les filtres d debts/état (ventes ouvertes,
--      fournisseurs endettés, clients en règlement mensuel).
--   3. Index sur `created_at` des tables de l'historique (le filtre
--      historique utilisait `substr(created_at,1,10)`, non indexable).
--   4. Index `products(name COLLATE NOCASE)` : le tri du stock utilisait
--      un index BINARY (⇒ tri non conforme, tri en mémoire).
--
-- Non destructif : uniquement des index + une colonne générée VIRTUAL
-- (aucune donnée stockée, aucun recalcul, aucune ligne modifiée).
-- `0001..0049` restent IMMUABLES (AGENTS.md §12).

-- 1. Téléphone normalisé (colonne générée) -----------------------------------
ALTER TABLE customers ADD COLUMN phone_digits TEXT GENERATED ALWAYS AS (
  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    phone, ' ', ''), '-', ''), '.', ''), '/', ''), '(', ''), ')', ''), '+', ''),
    char(160), '')
) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_customers_phone_digits ON customers(phone_digits);

-- 2. Dettes : ventes ouvertes, fournisseurs endettés, règlement mensuel ------
CREATE INDEX IF NOT EXISTS idx_sales_open_debt
  ON sales(is_cancelled, remaining_balance_minor);
CREATE INDEX IF NOT EXISTS idx_suppliers_debt
  ON suppliers(outstanding_balance_minor);
CREATE INDEX IF NOT EXISTS idx_customers_settle
  ON customers(deleted_at, outstanding_balance_minor, settlement_day);
CREATE INDEX IF NOT EXISTS idx_stock_intakes_supplier_status
  ON stock_intakes(supplier_id, status);

-- 3. Historique : filtrage par date sur chaque branche de l'UNION ----------
CREATE INDEX IF NOT EXISTS idx_sale_payments_created ON sale_payments(created_at);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_created ON supplier_payments(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_intakes_created ON stock_intakes(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);

-- 4. Stock : tri par nom insensible à la casse --------------------------------
CREATE INDEX IF NOT EXISTS idx_products_name_nocase ON products(name COLLATE NOCASE);
