-- Veloria PoS — Migration 0032: accès clients APK + file de synchronisation (V1 lecture seule).
-- SQLite reste le seul master ; le cloud n'est qu'un miroir jetable (ADR-050).
-- Aucune table financière touchée : 3 tables neuves + index, 0001..0031 immuables.
-- Déterministe : IF NOT EXISTS (rejouable). Pas de triggers sur les tables métier.
-- V1 = lecture seule : aucune écriture financière ne part du téléphone.

-- 1) Accès par client : un seul identifiant actif par client (QR/PIN).
-- Seuls des condensats sont stockés, jamais le PIN en clair.
CREATE TABLE IF NOT EXISTS customer_access (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  phone_hash TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  qr_secret_hash TEXT,
  revoked_at TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_access_customer ON customer_access(customer_id);

-- 2) File de sortie : chaque poussée vers le miroir porte le même operation_id
-- que l'opération d'origine (idempotence de bout en bout).
CREATE TABLE IF NOT EXISTS sync_outbox (
  id INTEGER PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('customer_snapshot','invoice_list','invoice_detail','payment_list','announcement','access_revocation')),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_outbox_status_created ON sync_outbox(status, created_at);

-- 3) Annonces du magasin : une ligne de 120 caractères max, lue par l'APK.
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY,
  text TEXT NOT NULL CHECK (length(text) >= 1 AND length(text) <= 120),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL
);
