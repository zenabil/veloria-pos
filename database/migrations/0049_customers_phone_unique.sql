-- Veloria PoS — Migration 0049 : unicité du téléphone client.
--
-- Constat (audit intégral 2026-10-19, E-28 — Medium-High, PROUVÉ) :
-- `0034_client_access_phone_unique.sql` ne porte que sur
-- `customer_access.phone_hash` (le hash d'activation APK), PAS sur
-- `customers.phone` (0001: `phone TEXT,` — NULLable, sans UNIQUE). Le
-- playbook d'audit qui annonçait « 0034 = unicité du téléphone » était donc
-- faux : deux clients peuvent partager le même numéro ⇒ recherche APK
-- ambiguë, doublons créés par le caissier.
--
-- Pourquoi un TRIGGER et pas un index UNIQUE ?
--   - un `CREATE UNIQUE INDEX` ÉCHOUE si l'historique contient déjà des
--     doublons ⇒ la migration ferait tomber l'application au démarrage sur
--     une base client réelle (donnée non détruite = migrable) ;
--   - un index UNIQUE interdit aussi de conserver un numéro « occupé » par
--     un client archivé (`deleted_at IS NOT NULL`) ;
--   - un trigger n'interdit QUE les nouvelles écritures ⇒ aucune donnée
--     existante n'est touchée, la migration est toujours applicable.
-- Le contrôle applicatif (electron/ipc/handlers/customers.repo.ts) donne en
-- plus un message FR clair AVANT l'accès à la base.
--
-- Comparaison : sur les CHIFFRES uniquement (miroir de `PHONE_DIGITS_EXPR`
-- dans customers.repo.ts) : « 0550 12 34 56 » et « 0550123456 » sont le même
-- numéro. Les lignes archivées (`deleted_at IS NOT NULL`) sont hors périmètre.
--
-- Règle AGENTS §12 : `0001..0048` sont IMMUABLES. Ce fichier est NOUVEAU.
-- Aucune donnée existante n'est modifiée, recalculée ou supprimée.

CREATE TRIGGER IF NOT EXISTS trg_customers_phone_unique_ins
BEFORE INSERT ON customers
WHEN NEW.phone IS NOT NULL
 AND TRIM(NEW.phone) <> ''
 AND EXISTS (
   SELECT 1 FROM customers c
   WHERE c.deleted_at IS NULL
     AND c.id <> NEW.id
     AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
           TRIM(c.phone), ' ', ''), '-', ''), '.', ''), '/', ''), '(', ''), ')', ''),
           '+', ''), char(160), '')
       = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
           TRIM(NEW.phone), ' ', ''), '-', ''), '.', ''), '/', ''), '(', ''), ')', ''),
           '+', ''), char(160), '')
 )
BEGIN
  SELECT RAISE(ABORT, 'Ce numéro de téléphone est déjà utilisé par un autre client.');
END;

CREATE TRIGGER IF NOT EXISTS trg_customers_phone_unique_upd
BEFORE UPDATE OF phone ON customers
WHEN NEW.phone IS NOT NULL
 AND TRIM(NEW.phone) <> ''
 AND EXISTS (
   SELECT 1 FROM customers c
   WHERE c.deleted_at IS NULL
     AND c.id <> NEW.id
     AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
           TRIM(c.phone), ' ', ''), '-', ''), '.', ''), '/', ''), '(', ''), ')', ''),
           '+', ''), char(160), '')
       = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
           TRIM(NEW.phone), ' ', ''), '-', ''), '.', ''), '/', ''), '(', ''), ')', ''),
           '+', ''), char(160), '')
 )
BEGIN
  SELECT RAISE(ABORT, 'Ce numéro de téléphone est déjà utilisé par un autre client.');
END;
