-- Veloria PoS — Migration 0038 : file miroir + accès ne disparaissent jamais en silence (RESTRICT).
-- 0032:11 (customer_access.customer_id) et 0033:8 (sync_outbox.customer_id)
-- déclaraient REFERENCES customers(id) ON DELETE CASCADE : supprimer un client
-- effaçait son accès ET sa file miroir (transactions perdues malgré un probe
-- vert, accès révoqué sans trace). En caisse, les clients s'archivent
-- (deleted_at), jamais de DELETE dur ; si un outil tente un DELETE dur avec
-- des lignes dépendantes, il DOIT échouer (fail-closed, message FR au repo).
-- SQLite n'offre pas de ALTER COLUMN : rebuild des deux tables (précédent
-- 0025), données + index + CHECKs préservés. 0001..0037 immuables.
-- Déterministe et rejouable : *_new + IF NOT EXISTS + recréation d'index.

-- 1) customer_access : RESTRICT (au lieu de CASCADE).
CREATE TABLE IF NOT EXISTS customer_access_new (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL UNIQUE REFERENCES customers(id) ON DELETE RESTRICT,
  phone_hash TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  qr_secret_hash TEXT,
  revoked_at TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO customer_access_new
  (id, customer_id, phone_hash, pin_hash, qr_secret_hash, revoked_at,
   failed_attempts, locked_until, created_at, updated_at)
  SELECT id, customer_id, phone_hash, pin_hash, qr_secret_hash, revoked_at,
   failed_attempts, locked_until, created_at, updated_at
  FROM customer_access;

DROP TABLE customer_access;

ALTER TABLE customer_access_new RENAME TO customer_access;

CREATE INDEX IF NOT EXISTS idx_customer_access_customer ON customer_access(customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_access_phone_hash_active
  ON customer_access(phone_hash)
  WHERE revoked_at IS NULL;

-- 2) sync_outbox : RESTRICT (au lieu de CASCADE).
CREATE TABLE IF NOT EXISTS sync_outbox_new (
  id INTEGER PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('customer_snapshot','invoice_list','invoice_detail','payment_list','announcement','access_revocation')),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  created_at TEXT NOT NULL,
  sent_at TEXT,
  customer_id INTEGER NULL REFERENCES customers(id) ON DELETE RESTRICT
);

INSERT INTO sync_outbox_new
  (id, operation_id, kind, payload_json, status, created_at, sent_at, customer_id)
  SELECT id, operation_id, kind, payload_json, status, created_at, sent_at, customer_id
  FROM sync_outbox;

DROP TABLE sync_outbox;

ALTER TABLE sync_outbox_new RENAME TO sync_outbox;

CREATE INDEX IF NOT EXISTS idx_sync_outbox_status_created ON sync_outbox(status, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_customer_status ON sync_outbox(customer_id, status);
