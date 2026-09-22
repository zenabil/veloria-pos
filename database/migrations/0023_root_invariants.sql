-- Veloria PoS — Migration 0023: invariants racine (correctifs profonds, non-destructifs).
-- Contexte: audit profond (DB-05/DB-06/DB-13 + EL triggers).
-- 1. Crédit sur UPDATE (pas seulement INSERT 0007) : toute vente dont le reste
--    devient > 0 exige un client credit_allowed = 1.
-- 2. Couches FIFO bornées : 0 <= remaining <= original (sur-restauration interdite).
-- 3. Soldes tiers jamais négatifs : customers/suppliers outstanding >= 0
--    (toute écriture applicative soustrayant au-delà est rejetée en dernier ressort).
-- 4. Numéros futurs obligatoires : returns/supplier_returns.return_number et
--    suppliers.code NOT NULL à l'INSERT (NULL historiques tolérés).
-- Non-destructif : triggers + index seuls, aucune réécriture de table,
-- migrations précédentes immuables.

-- 1. Crédit sur UPDATE (miroir du trigger INSERT 0007).
CREATE TRIGGER IF NOT EXISTS trg_sales_credit_allowed_update
BEFORE UPDATE OF remaining_balance_minor, customer_id ON sales
WHEN NEW.remaining_balance_minor > 0
BEGIN
  SELECT CASE
    WHEN NEW.customer_id IS NULL THEN RAISE(ABORT, 'Vente à crédit : choisissez un client autorisé au crédit.')
    WHEN (SELECT credit_allowed FROM customers WHERE id = NEW.customer_id) IS NOT 1 THEN RAISE(ABORT, 'Vente à crédit refusée : ce client n''est pas autorisé au crédit.')
  END;
END;

-- 2. Couches FIFO bornées des deux côtés.
CREATE TRIGGER IF NOT EXISTS trg_layers_remaining_insert
BEFORE INSERT ON inventory_layers
WHEN NEW.remaining_quantity < 0 OR NEW.remaining_quantity > NEW.original_quantity
BEGIN
  SELECT RAISE(ABORT, 'Couche FIFO incohérente : 0 <= remaining <= original.');
END;

CREATE TRIGGER IF NOT EXISTS trg_layers_remaining_update
BEFORE UPDATE OF remaining_quantity ON inventory_layers
WHEN NEW.remaining_quantity < 0 OR NEW.remaining_quantity > NEW.original_quantity
BEGIN
  SELECT RAISE(ABORT, 'Couche FIFO incohérente : 0 <= remaining <= original.');
END;

-- 3. Soldes tiers jamais négatifs (dernier ressort ; l'applicatif borne avant).
CREATE TRIGGER IF NOT EXISTS trg_customers_outstanding_nonneg
BEFORE UPDATE OF outstanding_balance_minor ON customers
WHEN NEW.outstanding_balance_minor < 0
BEGIN
  SELECT RAISE(ABORT, 'Solde client incohérent : règlement supérieur à la dette.');
END;

CREATE TRIGGER IF NOT EXISTS trg_suppliers_outstanding_nonneg
BEFORE UPDATE OF outstanding_balance_minor ON suppliers
WHEN NEW.outstanding_balance_minor < 0
BEGIN
  SELECT RAISE(ABORT, 'Solde fournisseur incohérent : règlement supérieur à la dette.');
END;

-- 4. Numéros futurs obligatoires (historiques NULL préservés).
CREATE TRIGGER IF NOT EXISTS trg_returns_number_required
BEFORE INSERT ON returns
WHEN NEW.return_number IS NULL
BEGIN
  SELECT RAISE(ABORT, 'Numéro de retour requis.');
END;

CREATE TRIGGER IF NOT EXISTS trg_supplier_returns_number_required
BEFORE INSERT ON supplier_returns
WHEN NEW.return_number IS NULL
BEGIN
  SELECT RAISE(ABORT, 'Numéro de retour fournisseur requis.');
END;

CREATE TRIGGER IF NOT EXISTS trg_suppliers_code_required
BEFORE INSERT ON suppliers
WHEN NEW.code IS NULL
BEGIN
  SELECT RAISE(ABORT, 'Code fournisseur requis.');
END;

-- 5. Traçabilité exacte des déductions (DB-09) : couches débitées par un
-- retour fournisseur, pour annulation miroir déterministe (plus de ASC vs
-- DESC approximatif). JSON [{productId, deductions:[{layerId, quantity}]}].
ALTER TABLE supplier_returns ADD COLUMN layers_json TEXT;
