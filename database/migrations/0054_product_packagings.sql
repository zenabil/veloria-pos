-- Veloria PoS — Migration 0054 : conditionnements produit (carton).
-- Un produit garde son unité de base (stock/FIFO/rapports en pièces) et peut
-- porter UN conditionnement actif (carton de N) avec un tarif carton propre.
-- Les lignes de vente/achat/retour mémorisent le facteur appliqué pour que
-- l'historique reste relisible même si le conditionnement change ensuite.
--
-- 0001..0053 restent IMMUABLES (AGENTS.md §12).

CREATE TABLE IF NOT EXISTS product_packagings (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  label_fr TEXT NOT NULL,
  factor INTEGER NOT NULL CHECK (factor > 1),
  selling_price_minor INTEGER NOT NULL CHECK (selling_price_minor >= 0),
  purchase_price_minor INTEGER NOT NULL DEFAULT 0 CHECK (purchase_price_minor >= 0),
  auto_carton_pricing INTEGER NOT NULL DEFAULT 1 CHECK (auto_carton_pricing IN (0,1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Un seul conditionnement actif par produit ; les versions désactivées
-- restent en base pour ne pas casser les références historiques.
CREATE UNIQUE INDEX IF NOT EXISTS ux_packaging_active
  ON product_packagings(product_id) WHERE is_active = 1;

CREATE INDEX IF NOT EXISTS idx_packagings_product
  ON product_packagings(product_id, is_active);

ALTER TABLE sale_items ADD COLUMN packaging_id INTEGER REFERENCES product_packagings(id);
ALTER TABLE sale_items ADD COLUMN unit_factor INTEGER NOT NULL DEFAULT 1 CHECK (unit_factor > 0);

ALTER TABLE stock_intake_items ADD COLUMN packaging_id INTEGER REFERENCES product_packagings(id);
ALTER TABLE stock_intake_items ADD COLUMN unit_factor INTEGER NOT NULL DEFAULT 1 CHECK (unit_factor > 0);
ALTER TABLE stock_intake_items ADD COLUMN line_total_minor INTEGER NOT NULL DEFAULT 0;

ALTER TABLE return_items ADD COLUMN unit_factor INTEGER NOT NULL DEFAULT 1 CHECK (unit_factor > 0);

-- Phase 3 (code-barres carton) : la colonne existe, aucun flux ne l'alimente
-- encore en Phase 1.
ALTER TABLE product_barcodes ADD COLUMN packaging_id INTEGER REFERENCES product_packagings(id);

-- Backfill HISTORIQUE uniquement : les lignes existantes sont en unités de
-- base (facteur 1). Les ventes passées ne sont jamais recalculées.
UPDATE sale_items SET unit_factor = 1 WHERE unit_factor IS NULL OR unit_factor <= 0;
UPDATE stock_intake_items SET unit_factor = 1 WHERE unit_factor IS NULL OR unit_factor <= 0;
UPDATE return_items SET unit_factor = 1 WHERE unit_factor IS NULL OR unit_factor <= 0;

-- line_total_minor historique : total rendu payé (coût d'achat + fret).
-- landing_cost_minor est déjà le coût rendu unitaire ; à défaut (0), le coût
-- d'achat unitaire. Aucun recalcul des ventes.
UPDATE stock_intake_items
SET line_total_minor = CAST(
  ROUND(
    quantity_received * CASE
      WHEN landing_cost_minor > 0 THEN landing_cost_minor
      ELSE purchase_price_minor
    END
  ) AS INTEGER
)
WHERE line_total_minor = 0;

CREATE INDEX IF NOT EXISTS idx_sale_items_packaging
  ON sale_items(packaging_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_stock_intake_items_packaging
  ON stock_intake_items(packaging_id, stock_intake_id);
