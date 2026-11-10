-- Veloria PoS — Migration 0062: historique des accès clients (R-03).
--
-- Constat (audit 2026-11-09, R-03) : `customer_access.customer_id` était
-- UNIQUE (0032/0038). Réactiver un client faisait donc `DELETE` de l'ancien
-- accès, effaçant toute trace de révocation — alors que 0034 affirme qu'une
-- ligne révoquée « conserve son condensat pour traçage ». Contradiction
-- structurelle : on ne peut pas avoir l'historique sous UNIQUE.
--
-- Réparation : suppression de l'UNIQUE sur `customer_id`, remplacement par un
-- index UNIQUE PARTIEL « un seul accès ACTIF par client » (même patron que
-- `idx_customer_access_phone_hash_active`, 0034). La réactivation devient
-- `UPDATE ... SET revoked_at` sur l'ancienne ligne (historique conservé) +
-- `INSERT` de la nouvelle — l'alarme « un seul actif » reste en base.
--
-- Rebuild (SQLite n'a pas ALTER COLUMN) : recréation stricte des colonnes
-- (y compris `pin_salt`/`pin_algo` de 0039, valeurs et CHECKs), des index de
-- 0038/0034, et des triggers `pin_algo` de 0043. 0001..0061 immuables.
-- Déterministe et rejouable : *_new + IF NOT EXISTS.

DROP TRIGGER IF EXISTS trg_customer_access_pin_algo_ins;
DROP TRIGGER IF EXISTS trg_customer_access_pin_algo_upd;

CREATE TABLE IF NOT EXISTS customer_access_new (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  phone_hash TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NULL,
  pin_algo TEXT NOT NULL DEFAULT 'sha256',
  qr_secret_hash TEXT,
  revoked_at TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO customer_access_new
  (id, customer_id, phone_hash, pin_hash, pin_salt, pin_algo, qr_secret_hash, revoked_at,
   failed_attempts, locked_until, created_at, updated_at)
SELECT id, customer_id, phone_hash, pin_hash, pin_salt, pin_algo, qr_secret_hash, revoked_at,
       failed_attempts, locked_until, created_at, updated_at
FROM customer_access;

DROP TABLE customer_access;

ALTER TABLE customer_access_new RENAME TO customer_access;

CREATE INDEX IF NOT EXISTS idx_customer_access_customer ON customer_access(customer_id);

-- Un seul ACTIVE par client, un seul ACTIVE par numéro (0034 conservée).
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_access_customer_active
  ON customer_access(customer_id)
  WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_access_phone_hash_active
  ON customer_access(phone_hash)
  WHERE revoked_at IS NULL;

-- Gardes 0043 recréées (DROP TABLE les avait supprimées).
CREATE TRIGGER IF NOT EXISTS trg_customer_access_pin_algo_ins
BEFORE INSERT ON customer_access
WHEN NEW.pin_algo NOT IN ('sha256', 'pbkdf2-sha256-100k')
BEGIN
  SELECT RAISE(ABORT, 'PIN invalide : algorithme non pris en charge.');
END;

CREATE TRIGGER IF NOT EXISTS trg_customer_access_pin_algo_upd
BEFORE UPDATE OF pin_algo ON customer_access
WHEN NEW.pin_algo NOT IN ('sha256', 'pbkdf2-sha256-100k')
BEGIN
  SELECT RAISE(ABORT, 'PIN invalide : algorithme non pris en charge.');
END;
