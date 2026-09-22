-- Veloria PoS — Migration 0026: defensive DB boundary (M-4) + credit-revocation policy (M-5).
-- Root causes:
--   M-4: `trg_sales_no_negative_total` (0003) guards UPDATE only — a direct
--        INSERT with total<0 or paid>total bypassed the DB; same gap for
--        customers/suppliers outstanding (0023 guards UPDATE OF only).
--        The application is not the only line of defense: the DB must defend
--        itself against direct SQL bypass.
--   M-5: revoking `customers.credit_allowed` 1→0 while outstanding debt exists
--        left an undefined policy state (old debt + no permission).
--        Policy (ADR-027): revocation is REFUSED while outstanding > 0 —
--        settle first. Paying existing debt is never blocked (payments don't
--        consult credit_allowed); only NEW credit requires permission.
-- Non-destructive: triggers only, no table rewrite, 0001..0025 immutable.
-- Deterministic: no data change, passes on fresh/empty/legacy DBs.

-- M-4a: sales arithmetic on INSERT (mirror of 0003 UPDATE trigger).
CREATE TRIGGER IF NOT EXISTS trg_sales_no_negative_total_ins
BEFORE INSERT ON sales
WHEN NEW.total_minor < 0 OR NEW.amount_paid_minor > NEW.total_minor
BEGIN
  SELECT RAISE(ABORT, 'SALE_ARITHMETIC_VIOLATION');
END;

-- M-4b: third-party balances never negative at INSERT (mirror of 0023 UPDATE).
CREATE TRIGGER IF NOT EXISTS trg_customers_outstanding_nonneg_ins
BEFORE INSERT ON customers
WHEN NEW.outstanding_balance_minor < 0
BEGIN
  SELECT RAISE(ABORT, 'Solde client incohérent : solde initial négatif interdit.');
END;

CREATE TRIGGER IF NOT EXISTS trg_suppliers_outstanding_nonneg_ins
BEFORE INSERT ON suppliers
WHEN NEW.outstanding_balance_minor < 0
BEGIN
  SELECT RAISE(ABORT, 'Solde fournisseur incohérent : solde initial négatif interdit.');
END;

-- M-5: credit revocation refused while debt outstanding (ADR-027).
CREATE TRIGGER IF NOT EXISTS trg_customers_credit_revoke_guard
BEFORE UPDATE OF credit_allowed ON customers
WHEN OLD.credit_allowed = 1 AND NEW.credit_allowed = 0 AND OLD.outstanding_balance_minor > 0
BEGIN
  SELECT RAISE(ABORT, 'Crédit : solde impayé — encaissez le dû avant de retirer l''autorisation.');
END;
