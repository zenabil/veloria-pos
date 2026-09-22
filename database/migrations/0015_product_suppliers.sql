-- Veloria PoS - Migration 0015: liaison produits ↔ fournisseurs (plusieurs ↔ plusieurs).
-- Contexte : `products.supplier_id` ne porte qu'un fournisseur principal.
-- La table de jonction porte les liaisons d'achat (réassort : chez qui
-- commander ce produit). Reprise : chaque `supplier_id` existant devient
-- une liaison. `products.supplier_id` est conservé comme principal
-- (premier lié) pour compatibilité (garde suppression, affichages).
CREATE TABLE IF NOT EXISTS product_suppliers (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (product_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_product_suppliers_supplier ON product_suppliers(supplier_id);

INSERT OR IGNORE INTO product_suppliers (product_id, supplier_id, created_at)
  SELECT id, supplier_id, datetime('now') FROM products WHERE supplier_id IS NOT NULL;
