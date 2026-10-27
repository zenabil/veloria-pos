-- Veloria PoS — Migration 0056 : conditionnement carton dans les devis et
-- répartition stock/abîmées des retours fournisseur.
--
-- 1. proforma_items mémorise le conditionnement vendu (packaging_id), le
--    facteur et le libellé d'unité figés au moment du devis. Le devis est un
--    document commercial : il doit rester lisible et convertible même si le
--    conditionnement change ensuite. Le facteur est une SNAPSHOT (comme
--    sale_items.unit_factor) : la conversion déduit le stock en unités de base.
--
-- 2. supplier_return_items distingue la quantité RETOURNÉE (valeur reprise par
--    le fournisseur, abîmées incluses) de la quantité réellement SORTIE DU
--    STOCK. Les pièces abîmées à la réception n'ont jamais été stockées : les
--    retourner ne doit pas rendre le stock négatif. Backfill : tout l'historique
--    était déduit du stock (quantity_stock = quantity, quantity_damaged = 0).
--
-- 0001..0055 restent IMMUABLES (AGENTS.md §12).

-- ------------------------------------------------------------- devis
ALTER TABLE proforma_items ADD COLUMN packaging_id INTEGER REFERENCES product_packagings(id);
ALTER TABLE proforma_items ADD COLUMN unit_factor INTEGER NOT NULL DEFAULT 1 CHECK (unit_factor > 0);
ALTER TABLE proforma_items ADD COLUMN unit_code TEXT NOT NULL DEFAULT 'PIECE';

-- Historique : reprendre l'unité de base du produit (PIECE par défaut).
UPDATE proforma_items
SET unit_code = COALESCE((SELECT p.unit_code FROM products p WHERE p.id = product_id), 'PIECE')
WHERE unit_code = 'PIECE';

CREATE INDEX IF NOT EXISTS idx_proforma_items_packaging
  ON proforma_items(packaging_id);

-- ------------------------------------- retours fournisseur (stock/abîmées)
-- NUMERIC : les unités de base peuvent être fractionnaires (poids/volume).
ALTER TABLE supplier_return_items ADD COLUMN quantity_stock NUMERIC NOT NULL DEFAULT 0
  CHECK (quantity_stock >= 0);
ALTER TABLE supplier_return_items ADD COLUMN quantity_damaged NUMERIC NOT NULL DEFAULT 0
  CHECK (quantity_damaged >= 0);

UPDATE supplier_return_items SET quantity_stock = quantity, quantity_damaged = 0;

-- Index de lecture par facture d'achat : l'éligibilité des retours fournisseur
-- se calcule désormais sur les couches FIFO restantes de la réception.
CREATE INDEX IF NOT EXISTS idx_layers_intake_product_remaining
  ON inventory_layers(stock_intake_id, product_id, remaining_quantity);
