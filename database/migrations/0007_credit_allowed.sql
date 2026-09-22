-- Veloria PoS — Migration 0007: credit sales restricted to authorized customers.
-- Context: previously any customer (or a walk-in sale with no customer) could
-- leave an unpaid balance. New domain rule: remaining_balance_minor > 0
-- requires a customer row with credit_allowed = 1 (opt-in, default 0).
-- Enforcement is defense in depth: createSaleAtomic rejects first with French
-- errors, and the trigger below is the last-resort guarantee for any writer.
ALTER TABLE customers ADD COLUMN credit_allowed INTEGER NOT NULL DEFAULT 0 CHECK (credit_allowed IN (0,1));

CREATE TRIGGER IF NOT EXISTS trg_sales_credit_allowed
BEFORE INSERT ON sales
WHEN NEW.remaining_balance_minor > 0
BEGIN
  SELECT CASE
    WHEN NEW.customer_id IS NULL THEN RAISE(ABORT, 'Vente à crédit : choisissez un client autorisé au crédit.')
    WHEN (SELECT credit_allowed FROM customers WHERE id = NEW.customer_id) IS NOT 1 THEN RAISE(ABORT, 'Vente à crédit refusée : ce client n''est pas autorisé au crédit.')
  END;
END;
