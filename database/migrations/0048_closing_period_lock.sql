-- Veloria PoS — Migration 0048 : verrou de PÉRIODE CLÔTURÉE (rapport Z).
--
-- Constat (audit intégral 2026-10-19, E-21 — High, PROUVÉ) :
-- `daily_closings` n'était qu'un ENREGISTREMENT. Aucun trigger, aucune garde
-- dans un quelconque handler d'écriture n'empêchait d'écrire une vente, un
-- encaissement, une dépense, un retour ou un paiement fournisseur daté d'une
-- journée DÉJÀ CLÔTURÉE : le rapport Z devenait silencieusement faux après
-- coup (le tiroir Physique et le rapport divergeaient sans trace).
--
-- Ce que fait cette migration (100 % triggers, non destructif) :
--   1. toute INSERTION de document dont la date d'activité tombe sur une
--      journée close est REFUSÉE (message FR, fail-closed) ;
--   2. toute MODIFICATION des montants d'un tel document est REFUSÉE ;
--   3. toute SUPPRESSION d'un document d'une journée close est REFUSÉE
--      (une suppression déplace l'argent sans laisser de trace) ;
--   4. la réouverture d'une journée close reste possible, mais uniquement
--      par le chemin EXPLICITE et tracé `closings.reopen` (gérant) : la
--      ligne de clôture est supprimée, l'événement est journalisé dans
--      `audit_log` avec les montants d'origine, puis la journée peut être
--      corrigée et re-clôturée.
--
-- Ce qui n'est PAS bloqué (décisions explicites) :
--   - l'INSERT dans `daily_closings` lui-même (c'est la clôture) ;
--   - les écritures dont la date d'activité est une AUTRE journée ;
--   - les tables hors périmètre du rapport Z (stock, catalogue, paramètres) :
--     elles ne figurent pas dans les colonnes de la clôture.
--
-- Règle AGENTS §12 : `0001..0047` sont IMMUABLES. Ce fichier est NOUVEAU.
-- Aucune donnée existante n'est modifiée, recalculée ou supprimée.

-- ------------------------------------------------------------------ ventes
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

-- ---------------------------------------------------------- encaissements
CREATE TRIGGER IF NOT EXISTS trg_sale_payments_closed_day_ins
BEFORE INSERT ON sale_payments
WHEN substr(NEW.payment_date, 1, 10) <> ''
 AND EXISTS (
   SELECT 1 FROM daily_closings dc WHERE dc.business_date = substr(NEW.payment_date, 1, 10)
 )
BEGIN
  SELECT RAISE(ABORT, 'Journée déjà clôturée : encaissement postérieur à la clôture.');
END;

CREATE TRIGGER IF NOT EXISTS trg_sale_payments_closed_day_upd
BEFORE UPDATE OF amount_minor, method, payment_date ON sale_payments
WHEN substr(NEW.payment_date, 1, 10) <> ''
 AND EXISTS (
   SELECT 1 FROM daily_closings dc WHERE dc.business_date = substr(NEW.payment_date, 1, 10)
 )
BEGIN
  SELECT RAISE(ABORT, 'Journée déjà clôturée : encaissement modifié.');
END;

CREATE TRIGGER IF NOT EXISTS trg_sale_payments_closed_day_del
BEFORE DELETE ON sale_payments
WHEN substr(OLD.payment_date, 1, 10) <> ''
 AND EXISTS (
   SELECT 1 FROM daily_closings dc WHERE dc.business_date = substr(OLD.payment_date, 1, 10)
 )
BEGIN
  SELECT RAISE(ABORT, 'Journée déjà clôturée : suppression impossible.');
END;

-- --------------------------------------------------------------- dépenses
CREATE TRIGGER IF NOT EXISTS trg_expenses_closed_day_ins
BEFORE INSERT ON expenses
WHEN substr(NEW.expense_date, 1, 10) <> ''
 AND EXISTS (
   SELECT 1 FROM daily_closings dc WHERE dc.business_date = substr(NEW.expense_date, 1, 10)
 )
BEGIN
  SELECT RAISE(ABORT, 'Journée déjà clôturée : dépense postérieure à la clôture.');
END;

CREATE TRIGGER IF NOT EXISTS trg_expenses_closed_day_upd
BEFORE UPDATE OF amount_minor, status, expense_date, payment_method ON expenses
WHEN substr(NEW.expense_date, 1, 10) <> ''
 AND EXISTS (
   SELECT 1 FROM daily_closings dc WHERE dc.business_date = substr(NEW.expense_date, 1, 10)
 )
BEGIN
  SELECT RAISE(ABORT, 'Journée déjà clôturée : dépense modifiée.');
END;

CREATE TRIGGER IF NOT EXISTS trg_expenses_closed_day_del
BEFORE DELETE ON expenses
WHEN substr(OLD.expense_date, 1, 10) <> ''
 AND EXISTS (
   SELECT 1 FROM daily_closings dc WHERE dc.business_date = substr(OLD.expense_date, 1, 10)
 )
BEGIN
  SELECT RAISE(ABORT, 'Journée déjà clôturée : suppression impossible.');
END;

-- ----------------------------------------------------------------- retours
CREATE TRIGGER IF NOT EXISTS trg_returns_closed_day_ins
BEFORE INSERT ON returns
WHEN substr(NEW.created_at, 1, 10) <> ''
 AND EXISTS (
   SELECT 1 FROM daily_closings dc WHERE dc.business_date = substr(NEW.created_at, 1, 10)
 )
BEGIN
  SELECT RAISE(ABORT, 'Journée déjà clôturée : retour postérieur à la clôture.');
END;

CREATE TRIGGER IF NOT EXISTS trg_returns_closed_day_upd
BEFORE UPDATE OF amount_refunded_minor, credit_to_customer_minor,
                      total_return_value_minor, status
ON returns
WHEN substr(NEW.created_at, 1, 10) <> ''
 AND EXISTS (
   SELECT 1 FROM daily_closings dc WHERE dc.business_date = substr(NEW.created_at, 1, 10)
 )
BEGIN
  SELECT RAISE(ABORT, 'Journée déjà clôturée : retour modifié.');
END;

CREATE TRIGGER IF NOT EXISTS trg_returns_closed_day_del
BEFORE DELETE ON returns
WHEN substr(OLD.created_at, 1, 10) <> ''
 AND EXISTS (
   SELECT 1 FROM daily_closings dc WHERE dc.business_date = substr(OLD.created_at, 1, 10)
 )
BEGIN
  SELECT RAISE(ABORT, 'Journée déjà clôturée : suppression impossible.');
END;

-- --------------------------------------------------- paiements fournisseurs
CREATE TRIGGER IF NOT EXISTS trg_supplier_payments_closed_day_ins
BEFORE INSERT ON supplier_payments
WHEN substr(NEW.payment_date, 1, 10) <> ''
 AND EXISTS (
   SELECT 1 FROM daily_closings dc WHERE dc.business_date = substr(NEW.payment_date, 1, 10)
 )
BEGIN
  SELECT RAISE(ABORT, 'Journée déjà clôturée : paiement postérieur à la clôture.');
END;

CREATE TRIGGER IF NOT EXISTS trg_supplier_payments_closed_day_upd
BEFORE UPDATE OF amount_minor, method, payment_date ON supplier_payments
WHEN substr(NEW.payment_date, 1, 10) <> ''
 AND EXISTS (
   SELECT 1 FROM daily_closings dc WHERE dc.business_date = substr(NEW.payment_date, 1, 10)
 )
BEGIN
  SELECT RAISE(ABORT, 'Journée déjà clôturée : paiement modifié.');
END;

CREATE TRIGGER IF NOT EXISTS trg_supplier_payments_closed_day_del
BEFORE DELETE ON supplier_payments
WHEN substr(OLD.payment_date, 1, 10) <> ''
 AND EXISTS (
   SELECT 1 FROM daily_closings dc WHERE dc.business_date = substr(OLD.payment_date, 1, 10)
 )
BEGIN
  SELECT RAISE(ABORT, 'Journée déjà clôturée : suppression impossible.');
END;
