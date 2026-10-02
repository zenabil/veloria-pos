-- Veloria PoS — Migration 0031: garde-fous défensifs remises lignes de vente (RADICAL-FIX).
-- 0027 a ajouté original_unit_price_minor + discount_minor SANS CHECK/TRIGGER :
-- un SQL direct pouvait écrire discount négatif ou supérieur au prix d'origine.
-- Non-destructive : triggers + index uniquement, 0001..0030 immuables.
-- Déterministe : IF NOT EXISTS implicite via DROP TRIGGER IF EXISTS + CREATE.

-- Nettoyage idempotent (rejouable) des triggers de cette migration.
DROP TRIGGER IF EXISTS trg_sale_items_discount_nonneg_ins;
DROP TRIGGER IF EXISTS trg_sale_items_discount_nonneg_upd;
DROP TRIGGER IF EXISTS trg_sale_items_discount_bound_ins;
DROP TRIGGER IF EXISTS trg_sale_items_discount_bound_upd;
DROP TRIGGER IF EXISTS trg_sale_items_original_nonneg_ins;
DROP TRIGGER IF EXISTS trg_sale_items_original_nonneg_upd;

-- Remise >= 0 (INSERT + UPDATE).
CREATE TRIGGER trg_sale_items_discount_nonneg_ins
BEFORE INSERT ON sale_items
FOR EACH ROW
WHEN NEW.discount_minor IS NOT NULL AND NEW.discount_minor < 0
BEGIN
  SELECT RAISE(ABORT, 'Remise de ligne invalide (negative).');
END;

CREATE TRIGGER trg_sale_items_discount_nonneg_upd
BEFORE UPDATE OF discount_minor ON sale_items
FOR EACH ROW
WHEN NEW.discount_minor IS NOT NULL AND NEW.discount_minor < 0
BEGIN
  SELECT RAISE(ABORT, 'Remise de ligne invalide (negative).');
END;

-- Prix d'origine >= 0 (INSERT + UPDATE).
CREATE TRIGGER trg_sale_items_original_nonneg_ins
BEFORE INSERT ON sale_items
FOR EACH ROW
WHEN NEW.original_unit_price_minor IS NOT NULL AND NEW.original_unit_price_minor < 0
BEGIN
  SELECT RAISE(ABORT, 'Prix origine de ligne invalide (negatif).');
END;

CREATE TRIGGER trg_sale_items_original_nonneg_upd
BEFORE UPDATE OF original_unit_price_minor ON sale_items
FOR EACH ROW
WHEN NEW.original_unit_price_minor IS NOT NULL AND NEW.original_unit_price_minor < 0
BEGIN
  SELECT RAISE(ABORT, 'Prix origine de ligne invalide (negatif).');
END;

-- Remise <= origine × quantité (INSERT + UPDATE).
-- Quantité NUMERIC (3 décimales) : borne avec tolérance d'arrondi +1 centime.
CREATE TRIGGER trg_sale_items_discount_bound_ins
BEFORE INSERT ON sale_items
FOR EACH ROW
WHEN NEW.discount_minor IS NOT NULL
  AND NEW.original_unit_price_minor IS NOT NULL
  AND NEW.quantity IS NOT NULL
  AND NEW.discount_minor > (NEW.original_unit_price_minor * NEW.quantity + 1)
BEGIN
  SELECT RAISE(ABORT, 'Remise superieure au sous-total origine.');
END;

CREATE TRIGGER trg_sale_items_discount_bound_upd
BEFORE UPDATE OF discount_minor, original_unit_price_minor, quantity ON sale_items
FOR EACH ROW
WHEN NEW.discount_minor IS NOT NULL
  AND NEW.original_unit_price_minor IS NOT NULL
  AND NEW.quantity IS NOT NULL
  AND NEW.discount_minor > (NEW.original_unit_price_minor * NEW.quantity + 1)
BEGIN
  SELECT RAISE(ABORT, 'Remise superieure au sous-total origine.');
END;
