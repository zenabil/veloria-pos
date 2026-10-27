-- Veloria PoS — Migration 0055: imputation automatique des retours sur la dette.
-- Décision propriétaire : la valeur d'un retour client éteint d'abord la dette
-- du client ; les espèces ne couvrent que l'excédent.
--
-- 1. sales.credit_applied_minor : part non monétaire du « payé » (avoir imputé).
--    Le CHECK de 0001 (remaining = total − paid) reste respecté : l'imputation
--    augmente amount_paid_minor ET credit_applied_minor du même montant.
-- 2. customer_credit_allocations : journal des imputations (vente précise ou
--    crédit non affecté quand la vente est sur une journée close / dette
--    d'ouverture). Permet au solde client et aux documents de rester alignés.
-- 3. return_items.sale_item_id : retour adossé à la LIGNE vendue exacte
--    (prix net après remise, pas le premier prix du produit).
-- Non destructif : colonnes NULLables/default 0, trigger + index + vues.

-- ---------------------------------------------------------------- ventes
ALTER TABLE sales ADD COLUMN credit_applied_minor INTEGER NOT NULL DEFAULT 0
  CHECK (credit_applied_minor >= 0);

CREATE TRIGGER IF NOT EXISTS trg_sales_credit_applied_bounds_ins
BEFORE INSERT ON sales
WHEN NEW.credit_applied_minor < 0 OR NEW.credit_applied_minor > NEW.amount_paid_minor
BEGIN
  SELECT RAISE(ABORT, 'Crédit imputé incohérent : 0 <= crédit <= montant payé.');
END;

CREATE TRIGGER IF NOT EXISTS trg_sales_credit_applied_bounds_upd
BEFORE UPDATE OF amount_paid_minor, credit_applied_minor ON sales
WHEN NEW.credit_applied_minor < 0 OR NEW.credit_applied_minor > NEW.amount_paid_minor
BEGIN
  SELECT RAISE(ABORT, 'Crédit imputé incohérent : 0 <= crédit <= montant payé.');
END;

-- ------------------------------------------------- lignes de retour
ALTER TABLE return_items ADD COLUMN sale_item_id INTEGER REFERENCES sale_items(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_return_items_sale_item
  ON return_items(sale_item_id);

-- ------------------------------------- imputations de crédit (journal)
CREATE TABLE IF NOT EXISTS customer_credit_allocations (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE RESTRICT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  -- NULL = crédit non affecté (aucune vente ouverte à imputer : journée
  -- close, dette d'ouverture). Le solde client le porte jusqu'à utilisation.
  sale_id INTEGER REFERENCES sales(id) ON DELETE RESTRICT,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credit_alloc_customer
  ON customer_credit_allocations(customer_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_credit_alloc_return
  ON customer_credit_allocations(return_id);

CREATE TRIGGER IF NOT EXISTS trg_credit_alloc_party_ins
BEFORE INSERT ON customer_credit_allocations
WHEN NEW.customer_id IS NULL
  OR (SELECT customer_id FROM returns WHERE id = NEW.return_id) IS NOT NEW.customer_id
  OR (
    NEW.sale_id IS NOT NULL
    AND (SELECT customer_id FROM sales WHERE id = NEW.sale_id) IS NOT NEW.customer_id
  )
BEGIN
  SELECT RAISE(ABORT, 'Imputation de crédit incohérente : client ou vente non concordant.');
END;

CREATE TRIGGER IF NOT EXISTS trg_credit_alloc_total_ins
BEFORE INSERT ON customer_credit_allocations
WHEN (
  SELECT COALESCE(SUM(amount_minor), 0)
  FROM customer_credit_allocations
  WHERE return_id = NEW.return_id
) + NEW.amount_minor > (
  SELECT credit_to_customer_minor FROM returns WHERE id = NEW.return_id
)
BEGIN
  SELECT RAISE(ABORT, 'Imputation de crédit supérieure à l''avoir du retour.');
END;

-- ---------------------------- vues de diagnostic (0003/0051 recréées)
DROP VIEW IF EXISTS v_customer_balance_check;
CREATE VIEW v_customer_balance_check AS
SELECT
  c.id AS customer_id,
  c.outstanding_balance_minor AS stored_balance_minor,
  c.initial_balance_minor
    + COALESCE((SELECT SUM(s.remaining_balance_minor) FROM sales s WHERE s.customer_id = c.id AND s.is_cancelled = 0), 0)
    - COALESCE((SELECT SUM(sp.amount_minor) FROM sale_payments sp WHERE sp.customer_id = c.id AND sp.sale_id IS NULL), 0)
    - COALESCE((SELECT SUM(cca.amount_minor) FROM customer_credit_allocations cca WHERE cca.customer_id = c.id AND cca.sale_id IS NULL), 0)
    AS note_ledger_hint_minor
FROM customers c;

DROP VIEW IF EXISTS v_daily_sales;
CREATE VIEW v_daily_sales AS
SELECT
  substr(s.created_at, 1, 10) AS day,
  COUNT(*) AS sales_count,
  SUM(s.total_minor) AS total_minor,
  -- « payé » au sens trésorerie : l'avoir imputé n'est pas de l'argent reçu.
  SUM(s.amount_paid_minor - s.credit_applied_minor) AS paid_minor,
  SUM(s.remaining_balance_minor) AS credit_minor
FROM sales s
WHERE s.is_cancelled = 0
GROUP BY substr(s.created_at, 1, 10);

PRAGMA legacy_alter_table = OFF;
PRAGMA foreign_keys = ON;
