-- Veloria PoS — Migration 0046 : attribution des opérations à l'utilisateur interne.
-- Contexte : 0041 a introduit les rôles (gérant / utilisateur) + actor_user_id
-- sur audit_log uniquement. Les tables métier (ventes, paiements, dépenses,
-- retours, achats, mouvements) ne portent aucun auteur : impossible de filtrer
-- « mes opérations » pour un utilisateur non-gérant (tableau de bord,
-- historique, rapports). Cette migration ajoute staff_user_id NULLABLE sur les
-- tables d'opérations, sans backfill (lignes historiques NULL = visibles par le
-- gérant uniquement, jamais par un utilisateur ; les nouvelles lignes portent
-- toujours l'auteur de la session main). Référence staff_users en SET NULL :
-- la suppression d'un utilisateur ne doit jamais effacer l'historique métier
-- (contrairement à audit_log.actor_user_id qui est en RESTRICT).
-- 0001..0045 immuables.

-- 1. Ventes (+ paiements clients liés à la vente ou autonomes).
ALTER TABLE sales ADD COLUMN staff_user_id INTEGER NULL
  REFERENCES staff_users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sales_staff ON sales(staff_user_id);

ALTER TABLE sale_payments ADD COLUMN staff_user_id INTEGER NULL
  REFERENCES staff_users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sale_payments_staff ON sale_payments(staff_user_id);

-- 2. Paiements fournisseurs.
ALTER TABLE supplier_payments ADD COLUMN staff_user_id INTEGER NULL
  REFERENCES staff_users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_payments_staff ON supplier_payments(staff_user_id);

-- 3. Dépenses.
ALTER TABLE expenses ADD COLUMN staff_user_id INTEGER NULL
  REFERENCES staff_users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_staff ON expenses(staff_user_id);

-- 4. Retours clients.
ALTER TABLE returns ADD COLUMN staff_user_id INTEGER NULL
  REFERENCES staff_users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_returns_staff ON returns(staff_user_id);

-- 5. Achats (entrées stock) + mouvements stock.
ALTER TABLE stock_intakes ADD COLUMN staff_user_id INTEGER NULL
  REFERENCES staff_users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stock_intakes_staff ON stock_intakes(staff_user_id);

ALTER TABLE stock_movements ADD COLUMN staff_user_id INTEGER NULL
  REFERENCES staff_users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_staff ON stock_movements(staff_user_id);
