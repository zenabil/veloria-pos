-- Veloria PoS — Migration 0058 : verrou de journée clôturée sur le JOUR MÉTIER (E-35).
--
-- Constat (audit intégral 2026-10-19, E-35 ; décision propriétaire Q17 = « le
-- jour métier est Africa/Algiers », jamais revisitée depuis) : les journées
-- métier sont des dates `AAAA-MM-JJ` (`daily_closings.business_date`,
-- `expenses.expense_date`, `sale_payments.payment_date`, `sales.due_date`), mais
-- les horodatages d'activité (`sales.created_at`, `returns.created_at`) sont des
-- INSTANTS UTC ISO (`…Z`). Les triggers de `0048` (et leur recréation de `0051`)
-- découpaient ces instants par `substr(created_at, 1, 10)` : la journée était
-- donc coupée à 01:00 heure d'Alger au lieu de minuit. Une vente saisie à
-- 00:30 (heure du magasin) le 3 septembre tombait sur la journée clôturée du
-- 2 — refusée, ou, pire, comptée dans la clôture du 2 déjà signée.
--
-- Ce que fait cette migration (100 % triggers, non destructif) :
--   1. `DROP` + `CREATE` des SIX triggers qui testent une colonne d'INSTANT
--      (`trg_sales_closed_day_{ins,upd,del}` et `trg_returns_closed_day_{ins,upd,del}`) :
--      le seau de comparaison devient `date(created_at, '+1 hour')`, c'est-à-dire
--      le jour civil d'Africa/Algiers (UTC+1 FIXE — l'Algérie n'applique pas
--      d'heure d'été, donc aucun cas ambigü : +1h est le décalage, toujours) ;
--   2. les NEUF autres triggers de `0048` ne bougent PAS : ils comparent déjà
--      des colonnes DATE-SEULE (`payment_date`, `expense_date`), qui portent une
--      date métier et ne se décalent jamais.
--
-- Aucune donnée existante n'est modifiée, recalculée ni supprimée ; le verrou
-- protège toujours les mêmes écritures, avec une frontière d'une heure plus
-- juste. Les triggers ne peuvent pas être rendus indexables : la garde
-- applicative (`finance.repo.ts` createDailyClosingAtomic, history-query.ts)
-- calcule les bornes de journée avec `businessDayRangeUtc`, même convention.
--
-- Règle AGENTS §12 : `0001..0057` sont IMMUABLES. Ce fichier est NOUVEAU.

-- ------------------------------------------------------------------ ventes
DROP TRIGGER IF EXISTS trg_sales_closed_day_ins;
CREATE TRIGGER trg_sales_closed_day_ins
BEFORE INSERT ON sales
WHEN date(NEW.created_at, '+1 hour') <> ''
 AND EXISTS (
   SELECT 1 FROM daily_closings dc WHERE dc.business_date = date(NEW.created_at, '+1 hour')
 )
BEGIN
  SELECT RAISE(ABORT, 'Journée déjà clôturée : vente postérieure à la clôture.');
END;

DROP TRIGGER IF EXISTS trg_sales_closed_day_upd;
CREATE TRIGGER trg_sales_closed_day_upd
BEFORE UPDATE OF subtotal_minor, discount_value_minor, discount_amount_minor,
                      delivery_fee_minor, total_minor, amount_paid_minor,
                      remaining_balance_minor, payment_status, payment_method
ON sales
WHEN date(NEW.created_at, '+1 hour') <> ''
 AND EXISTS (
   SELECT 1 FROM daily_closings dc WHERE dc.business_date = date(NEW.created_at, '+1 hour')
 )
BEGIN
  SELECT RAISE(ABORT, 'Journée déjà clôturée : modification impossible.');
END;

DROP TRIGGER IF EXISTS trg_sales_closed_day_del;
CREATE TRIGGER trg_sales_closed_day_del
BEFORE DELETE ON sales
WHEN date(OLD.created_at, '+1 hour') <> ''
 AND EXISTS (
   SELECT 1 FROM daily_closings dc WHERE dc.business_date = date(OLD.created_at, '+1 hour')
 )
BEGIN
  SELECT RAISE(ABORT, 'Journée déjà clôturée : suppression impossible.');
END;

-- ----------------------------------------------------------------- retours
DROP TRIGGER IF EXISTS trg_returns_closed_day_ins;
CREATE TRIGGER trg_returns_closed_day_ins
BEFORE INSERT ON returns
WHEN date(NEW.created_at, '+1 hour') <> ''
 AND EXISTS (
   SELECT 1 FROM daily_closings dc WHERE dc.business_date = date(NEW.created_at, '+1 hour')
 )
BEGIN
  SELECT RAISE(ABORT, 'Journée déjà clôturée : retour postérieur à la clôture.');
END;

DROP TRIGGER IF EXISTS trg_returns_closed_day_upd;
CREATE TRIGGER trg_returns_closed_day_upd
BEFORE UPDATE OF amount_refunded_minor, credit_to_customer_minor,
                      total_return_value_minor, status
ON returns
WHEN date(NEW.created_at, '+1 hour') <> ''
 AND EXISTS (
   SELECT 1 FROM daily_closings dc WHERE dc.business_date = date(NEW.created_at, '+1 hour')
 )
BEGIN
  SELECT RAISE(ABORT, 'Journée déjà clôturée : retour modifié.');
END;

DROP TRIGGER IF EXISTS trg_returns_closed_day_del;
CREATE TRIGGER trg_returns_closed_day_del
BEFORE DELETE ON returns
WHEN date(OLD.created_at, '+1 hour') <> ''
 AND EXISTS (
   SELECT 1 FROM daily_closings dc WHERE dc.business_date = date(OLD.created_at, '+1 hour')
 )
BEGIN
  SELECT RAISE(ABORT, 'Journée déjà clôturée : suppression impossible.');
END;
