-- Veloria PoS — Migration 0005: index complémentaires Phases 6-9 + défaut inventaire.
-- Immuable après release. N'ajoute que des IF NOT EXISTS (sûr à rejouer).
-- Contexte :
--   - 0002 couvrait déjà le socle (produits, ventes, mouvements, intakes, retours...).
--   - Restent les index d'exploitation des tranches 6-9 : proformas, pain,
--     clôtures journalières, statuts de dette/stock, journal d'audit par date.
--   - Graine `app_settings('inventory')` : `allowNegativeStock=false` par défaut
--     (politique stock stricte, modifiable depuis Paramètres > Inventaire).

-- Proformas : recherche par client/date + statut (écran Proformas, conversions).
CREATE INDEX IF NOT EXISTS idx_proformas_customer_created
  ON proforma_invoices(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_proformas_status ON proforma_invoices(status);
CREATE INDEX IF NOT EXISTS idx_proforma_items_proforma ON proforma_items(proforma_id);
CREATE INDEX IF NOT EXISTS idx_proforma_items_product ON proforma_items(product_id);

-- Pain : tableau de bord par date de retrait + statut (écran Pain).
CREATE INDEX IF NOT EXISTS idx_bread_pickup_date ON bread_orders(pickup_date);
CREATE INDEX IF NOT EXISTS idx_bread_pickup_status ON bread_orders(pickup_status);
CREATE INDEX IF NOT EXISTS idx_bread_payment_status ON bread_orders(payment_status);

-- Clôtures : unicité déjà en 0001 (business_date UNIQUE), ajout lecture par date.
CREATE INDEX IF NOT EXISTS idx_closings_date ON daily_closings(business_date);

-- Dettes : tri/filtre écran Dettes (statut + solde) et relances.
CREATE INDEX IF NOT EXISTS idx_customers_debt_status ON customers(debt_status);
CREATE INDEX IF NOT EXISTS idx_sales_due ON sales(due_date);

-- Stock : statuts et fournisseurs pour l'écran Stock (KPI + alertes).
CREATE INDEX IF NOT EXISTS idx_products_stock_status ON products(stock_status);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_stock_intake_items_intake ON stock_intake_items(stock_intake_id);
CREATE INDEX IF NOT EXISTS idx_stock_intake_items_product ON stock_intake_items(product_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);

-- Audit : diagnostics par date décroissante (Paramètres > Diagnostics).
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- Dépenses : catégorie pour le rapport charges (écran Rapports).
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

-- Défaut inventaire : stock négatif interdit sauf activation explicite.
INSERT INTO app_settings (key, value_json, updated_at)
VALUES ('inventory', '{"allowNegativeStock":false}', '2026-01-01T00:00:00.000Z')
ON CONFLICT(key) DO NOTHING;
