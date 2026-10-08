-- Veloria PoS — Migration 0037: garde-fou défensif quantité produit (RADICAL-FIX).
-- 0001:88 déclare products.quantity NUMERIC NOT NULL DEFAULT 0 SANS CHECK
-- (contrairement aux prix et au seuil, tous bornés >= 0) : un SQL direct
-- pouvait écrire une quantité négative (stock incohérent).
-- SQLite n'offre pas de ALTER TABLE ... ADD CONSTRAINT et un rebuild de
-- products casserait les références (barcodes, fournisseurs, mouvements) :
-- la règle CHECK(products.quantity >= 0) est donc appliquée par triggers de
-- rejet BEFORE INSERT / BEFORE UPDATE OF quantity (précédent 0025/0026/0031).
-- Non-destructive : triggers uniquement, 0001..0036 immuables.
-- Déterministe : rejouable via DROP TRIGGER IF EXISTS + CREATE.

DROP TRIGGER IF EXISTS trg_products_quantity_nonneg_ins;
DROP TRIGGER IF EXISTS trg_products_quantity_nonneg_upd;

CREATE TRIGGER trg_products_quantity_nonneg_ins
BEFORE INSERT ON products
FOR EACH ROW
WHEN NEW.quantity < 0
BEGIN
  SELECT RAISE(ABORT, 'Quantité produit invalide (négative interdite).');
END;

CREATE TRIGGER trg_products_quantity_nonneg_upd
BEFORE UPDATE OF quantity ON products
FOR EACH ROW
WHEN NEW.quantity < 0
BEGIN
  SELECT RAISE(ABORT, 'Quantité produit invalide (négative interdite).');
END;
