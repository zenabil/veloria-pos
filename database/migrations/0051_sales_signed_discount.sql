-- Veloria PoS — Migration 0051 : remise de ligne SIGNÉE (majoration + facture au montant exact).
--
-- CONTEXTE (bugs caisse signalés par le propriétaire le 2026-10-21, §23 handoff) :
--   1) « Article libre » : la saisie du prix perdait le focus (bug focus, hors
--      migration) ⇒ le caissier corrigeait ensuite le prix DEPUIS le panier
--      (fenêtre « Modifier le prix »). Si le nouveau prix est SUPÉRIEUR au
--      prix d'origine (majoration), la remise de ligne devient NÉGATIVE.
--   2) Mode « Montant (DZD) » du dialogue « quantité vendue » (ADR-114) :
--      50,00 DZD saisis à 700,00 DZD/kg ⇒ 0,071 kg ⇒ 49,70 DZD facturés
--      (le montant saisi était perdu). Facturer le montant SAISI suppose
--      lui aussi une remise négative : le total facturé de la ligne dépasse
--      son total catalogue.
--
-- POURQUOI UNE RECONSTRUCTION DE TABLE :
--   Le schéma 0001 (IMMUTABLE) impose `discount_amount_minor >= 0` et le
--   trigger 0031 interdit la remise négative de ligne. La base REFUSE alors
--   la vente : « CHECK constraint failed: discount_amount_minor >= 0 » ⇒
--   rollback total + message générique à l'écran (« Une erreur inattendue
--   est survenue »). SQLite ne sait pas SUPPRIMER un CHECK : il faut
--   reconstruire la table `sales` (recopie + DROP + RENAME) et recréer ses
--   index + triggers + vues. Les tables enfants (sale_items, sale_payments,
--   sale_fifo_consumption, returns, proforma_invoices, bread_orders)
--   référencent `sales(id)` : les identifiants sont recopiés À L'IDENTIQUE
--   et les clauses `REFERENCES` ne sont PAS réécrites ⇒ aucune donnée n'est
--   modifiée ni réordonnée, les enfants pointent toujours vers `sales`.
--
-- CE QUI CHANGE (et rien d'autre) :
--   - `sales.discount_amount_minor` accepte une valeur NÉGATIVE (borne
--     basse symétrique : −100 000 000 000 centimes = −1 000 000 DZD, le
--     miroir de la borne de total du domaine `assertSignedTotal`).
--   - L'invariant de RECOMPOSITION est INCHANGÉ et reste vérifié par la base :
--       total_minor = subtotal_minor − discount_amount_minor + delivery_fee_minor
--     (sous-total = Σ prix d'origine × quantité ; remise = Σ (origine −
--     facturé) ; une remise négative = majoration, tracée dans l'audit).
--   - `trg_sale_items_discount_nonneg_*` (0031) sont REMPLACÉS par un
--     plancher de remise (`..._floor_*`) : une remise négative est admise
--     mais bornée ; le plafond existant (`..._bound_*` : remise ≤ origine ×
--     quantité + 1) est conservé tel quel.
--
-- PROCÉDURE (12 étapes SQLite) — le marqueur `-- veloria:foreign-keys-off`
--   demande au runner (electron/database/sqlite.service.ts) de désactiver
--   les clés étrangères AVANT la transaction : SQLite refuse de renommer ou
--   de supprimer une table référencée si les FK sont actives, et le
--   `PRAGMA foreign_keys` est un no-op DANS une transaction. `legacy_alter_table`
--   empêche la réécriture des clauses `REFERENCES` des tables enfants.
--
-- Règle AGENTS §12 : `0001..0050` sont IMMUABLES. Ce fichier est NOUVEAU.
-- Aucune donnée existante n'est modifiée, recalculée ou supprimée : la
-- table est reconstruite à l'identique (mêmes lignes, mêmes identifiants),
-- seule la CONTRAINTE de signe de la remise change.

-- veloria:foreign-keys-off

PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;

-- Les 2 vues de diagnostic (0003) et le trigger de restriction clients
-- (0040) référencent `sales` : SQLite refuse de SUPPRIMER une table
-- référencée (validation du schéma) ⇒ ils sont recréés à l'identique juste
-- après la reconstruction.
DROP VIEW IF EXISTS v_customer_balance_check;
DROP VIEW IF EXISTS v_daily_sales;
DROP TRIGGER IF EXISTS trg_customers_no_delete_with_sales;

CREATE TABLE sales_0051 (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  invoice_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  subtotal_minor INTEGER NOT NULL CHECK (subtotal_minor >= 0),
  discount_type TEXT CHECK (discount_type IS NULL OR discount_type IN ('none','percent','amount')),
  discount_value_minor INTEGER NOT NULL DEFAULT 0 CHECK (discount_value_minor >= 0),
  -- Remise SIGNÉE : négative = majoration (prix facturé > prix d'origine) ou
  -- facture au montant saisi (ADR-114). Borne basse = miroir de
  -- `assertSignedTotal` (domaine) : −100 000 000 000 centimes.
  discount_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount_minor >= -100000000000),
  delivery_fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_minor >= 0),
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  amount_paid_minor INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid_minor >= 0),
  remaining_balance_minor INTEGER NOT NULL DEFAULT 0 CHECK (remaining_balance_minor >= 0),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('paid','partial','unpaid')),
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('cash','cheque','transfer')),
  due_date TEXT,
  operation_id TEXT UNIQUE,
  is_cancelled INTEGER NOT NULL DEFAULT 0 CHECK (is_cancelled IN (0,1)),
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  credit_limit_override INTEGER NOT NULL DEFAULT 0 CHECK (credit_limit_override IN (0,1)),
  staff_user_id INTEGER NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  CHECK (amount_paid_minor <= total_minor),
  CHECK (remaining_balance_minor = total_minor - amount_paid_minor),
  CHECK (total_minor = subtotal_minor - discount_amount_minor + delivery_fee_minor)
);

-- Recopie EXACTE (identifiants inclus : les tables enfants référencent
-- `sales(id)` — les identifiants ne doivent jamais bouger).
INSERT INTO sales_0051 (
  id, uuid, invoice_number, customer_id, subtotal_minor, discount_type,
  discount_value_minor, discount_amount_minor, delivery_fee_minor, total_minor,
  amount_paid_minor, remaining_balance_minor, payment_status, payment_method,
  due_date, operation_id, is_cancelled, cancelled_at, created_at, updated_at,
  credit_limit_override, staff_user_id
)
SELECT
  id, uuid, invoice_number, customer_id, subtotal_minor, discount_type,
  discount_value_minor, discount_amount_minor, delivery_fee_minor, total_minor,
  amount_paid_minor, remaining_balance_minor, payment_status, payment_method,
  due_date, operation_id, is_cancelled, cancelled_at, created_at, updated_at,
  credit_limit_override, staff_user_id
FROM sales;

DROP TABLE sales;
ALTER TABLE sales_0051 RENAME TO sales;

-- Index de `sales` (recréés : le DROP les emporte avec la table).
CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_customer_created ON sales(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_payment_status ON sales(payment_status);
CREATE INDEX IF NOT EXISTS idx_sales_operation ON sales(operation_id);
CREATE INDEX IF NOT EXISTS idx_sales_due ON sales(due_date);
CREATE INDEX IF NOT EXISTS idx_sales_staff ON sales(staff_user_id);
CREATE INDEX IF NOT EXISTS idx_sales_open_debt ON sales(is_cancelled, remaining_balance_minor);

-- Triggers de `sales` (recréés à l'identique — 0003, 0007, 0023, 0026, 0048).
CREATE TRIGGER IF NOT EXISTS trg_sales_no_negative_total
BEFORE UPDATE ON sales
WHEN NEW.total_minor < 0 OR NEW.amount_paid_minor > NEW.total_minor
BEGIN
  SELECT RAISE(ABORT, 'SALE_ARITHMETIC_VIOLATION');
END;

CREATE TRIGGER IF NOT EXISTS trg_sales_credit_allowed
BEFORE INSERT ON sales
WHEN NEW.remaining_balance_minor > 0
BEGIN
  SELECT CASE
    WHEN NEW.customer_id IS NULL THEN RAISE(ABORT, 'Vente à crédit : choisissez un client autorisé au crédit.')
    WHEN (SELECT credit_allowed FROM customers WHERE id = NEW.customer_id) IS NOT 1 THEN RAISE(ABORT, 'Vente à crédit refusée : ce client n''est pas autorisé au crédit.')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_sales_credit_allowed_update
BEFORE UPDATE OF remaining_balance_minor, customer_id ON sales
WHEN NEW.remaining_balance_minor > 0
BEGIN
  SELECT CASE
    WHEN NEW.customer_id IS NULL THEN RAISE(ABORT, 'Vente à crédit : choisissez un client autorisé au crédit.')
    WHEN (SELECT credit_allowed FROM customers WHERE id = NEW.customer_id) IS NOT 1 THEN RAISE(ABORT, 'Vente à crédit refusée : ce client n''est pas autorisé au crédit.')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_sales_no_negative_total_ins
BEFORE INSERT ON sales
WHEN NEW.total_minor < 0 OR NEW.amount_paid_minor > NEW.total_minor
BEGIN
  SELECT RAISE(ABORT, 'SALE_ARITHMETIC_VIOLATION');
END;

CREATE TRIGGER IF NOT EXISTS trg_sales_closed_day_ins
BEFORE INSERT ON sales
WHEN substr(NEW.created_at, 1, 10) <> ''
 AND EXISTS (
   SELECT 1 FROM daily_closings dc WHERE dc.business_date = substr(NEW.created_at, 1, 10)
 )
BEGIN
  SELECT RAISE(ABORT, 'Journée déjà clôturée : vente postérieure à la clôture.');
END;

CREATE TRIGGER IF NOT EXISTS trg_sales_closed_day_upd
BEFORE UPDATE OF subtotal_minor, discount_value_minor, discount_amount_minor,
                      delivery_fee_minor, total_minor, amount_paid_minor,
                      remaining_balance_minor, payment_status, payment_method
ON sales
WHEN substr(NEW.created_at, 1, 10) <> ''
 AND EXISTS (
   SELECT 1 FROM daily_closings dc WHERE dc.business_date = substr(NEW.created_at, 1, 10)
 )
BEGIN
  SELECT RAISE(ABORT, 'Journée déjà clôturée : modification impossible.');
END;

CREATE TRIGGER IF NOT EXISTS trg_sales_closed_day_del
BEFORE DELETE ON sales
WHEN substr(OLD.created_at, 1, 10) <> ''
 AND EXISTS (
   SELECT 1 FROM daily_closings dc WHERE dc.business_date = substr(OLD.created_at, 1, 10)
 )
BEGIN
  SELECT RAISE(ABORT, 'Journée déjà clôturée : suppression impossible.');
END;

-- Vues de diagnostic (0003) recréées à l'identique.
CREATE VIEW IF NOT EXISTS v_customer_balance_check AS
SELECT
  c.id AS customer_id,
  c.outstanding_balance_minor AS stored_balance_minor,
  c.initial_balance_minor
    + COALESCE((SELECT SUM(s.remaining_balance_minor) FROM sales s WHERE s.customer_id = c.id AND s.is_cancelled = 0), 0)
    - COALESCE((SELECT SUM(sp.amount_minor) FROM sale_payments sp WHERE sp.customer_id = c.id AND sp.sale_id IS NULL), 0)
    AS note_ledger_hint_minor
FROM customers c;

CREATE VIEW IF NOT EXISTS v_daily_sales AS
SELECT
  substr(s.created_at, 1, 10) AS day,
  COUNT(*) AS sales_count,
  SUM(s.total_minor) AS total_minor,
  SUM(s.amount_paid_minor) AS paid_minor,
  SUM(s.remaining_balance_minor) AS credit_minor
FROM sales s
WHERE s.is_cancelled = 0
GROUP BY substr(s.created_at, 1, 10);

-- Trigger de restriction clients (0040) recréé à l'identique.
CREATE TRIGGER IF NOT EXISTS trg_customers_no_delete_with_sales
BEFORE DELETE ON customers
WHEN EXISTS (SELECT 1 FROM sales WHERE sales.customer_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'Suppression impossible : des ventes sont liées à ce client.');
END;

-- ------------------------------------------------- lignes de vente (remise)
-- 0031 interdisait la remise NÉGATIVE (interdit la majoration et la facture
-- au montant saisi) : remplacée par un PLANCHER borné (le plafond existant
-- `..._bound_*` — remise ≤ origine × quantité + 1 — est conservé tel quel).
DROP TRIGGER IF EXISTS trg_sale_items_discount_nonneg_ins;
DROP TRIGGER IF EXISTS trg_sale_items_discount_nonneg_upd;

CREATE TRIGGER IF NOT EXISTS trg_sale_items_discount_floor_ins
BEFORE INSERT ON sale_items
FOR EACH ROW
WHEN NEW.discount_minor IS NOT NULL
 AND NEW.discount_minor < -100000000000
BEGIN
  SELECT RAISE(ABORT, 'Remise de ligne hors bornes (majoration trop elevee).');
END;

CREATE TRIGGER IF NOT EXISTS trg_sale_items_discount_floor_upd
BEFORE UPDATE OF discount_minor ON sale_items
FOR EACH ROW
WHEN NEW.discount_minor IS NOT NULL
 AND NEW.discount_minor < -100000000000
BEGIN
  SELECT RAISE(ABORT, 'Remise de ligne hors bornes (majoration trop elevee).');
END;

PRAGMA legacy_alter_table = OFF;
PRAGMA foreign_keys = ON;
