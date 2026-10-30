-- Veloria PoS — Miroir client V1 (Supabase Postgres, lecture seule).
-- SQLite du POS = seul master (ADR-053). Ce schéma est JETABLE : toute ligne
-- peut être reconstruite depuis `sync_outbox` du POS. Aucune finance calculée
-- ici : les clichés arrivent prêts (centimes) depuis le POS.
-- Conventions miroirs du domaine : QR 7 jours, session 90 jours, 5 échecs →
-- verrou 5 minutes (voir src/domain/customer/client-access.ts).

-- 1) Identités d'accès (condensats hex, jamais en clair).
-- pin_hash : lignes neuves = PBKDF2-HMAC-SHA256 (100 000 itérations, sel
-- par client pin_salt, voir pin_algo) ; lignes historiques = SHA-256 nu
-- (pin_salt NULL, chemin transitoire côté Edge — jamais de réactivation
-- forcée). phone_hash reste déterministe (clé de recherche).
CREATE TABLE IF NOT EXISTS client_access (
  customer_id INTEGER PRIMARY KEY,
  phone_hash TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NULL,
  pin_algo TEXT NOT NULL DEFAULT 'sha256',
  qr_secret_hash TEXT,
  revoked_at TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_client_access_phone ON client_access(phone_hash);

-- 2) Clichés poussés par le POS (un par operationId, rejouables).
CREATE TABLE IF NOT EXISTS client_payloads (
  id SERIAL PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES client_access(customer_id) ON DELETE CASCADE,
  -- Union EXACTE du CHECK `sync_outbox.kind` du POS — SOURCE AUTORITAIRE :
  -- database/migrations/0032_client_access_sync.sql (immuable). Miroiée par
  -- `syncEnqueueSchema` (electron/ipc/validators.ts) et `SYNC_KINDS`
  -- (electron/ipc/handlers/client-access.repo.ts) : un kind que le POS peut
  -- écrire doit être accepté ici, sinon la poussée entière échoue au CHECK.
  kind TEXT NOT NULL CHECK (kind IN ('customer_snapshot', 'invoice_list', 'payment_list', 'invoice_detail', 'announcement', 'access_revocation')),
  payload JSONB NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_client_payloads_customer_kind
  ON client_payloads(customer_id, kind, id DESC);

-- Détail facture à la demande : recherche directe par vente
-- (`payload->sale->>id`), sans fenêtre de balayage. Index d'expression partiel
-- pour rester O(log n) quand un client accumule des milliers de clichés.
CREATE INDEX IF NOT EXISTS idx_client_payloads_customer_sale
  ON client_payloads (customer_id, ((payload->'sale'->>'id')))
  WHERE kind = 'invoice_detail';

-- 3) Lecture du dernier cliché par (client, kind) pour la synchro APK.
CREATE OR REPLACE VIEW latest_client_payloads AS
SELECT DISTINCT ON (customer_id, kind)
  customer_id, kind, payload, created_at
FROM client_payloads
ORDER BY customer_id, kind, id DESC;

-- ===========================================================================
-- VERROUILLAGE RADICAL (2026-10-25) : aucune lecture directe avec la clé
-- anon/authenticated. La clé anon est publique (APK + QR) ; sans RLS, elle
-- permettrait de lire tous les condensats et toutes les factures via PostgREST.
-- Seule l'Edge Function `client-sync` (service_role, côté serveur) lit ces
-- tables. La vue est `security_invoker` : même si une policy est ajoutée plus
-- tard, elle ne contourne pas les RLS des tables sous-jacentes.
-- ===========================================================================
ALTER TABLE client_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_payloads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE client_access FROM anon, authenticated;
REVOKE ALL ON TABLE client_payloads FROM anon, authenticated;
REVOKE ALL ON TABLE latest_client_payloads FROM anon, authenticated;
REVOKE ALL ON SEQUENCE client_payloads_id_seq FROM anon, authenticated;

ALTER VIEW latest_client_payloads SET (security_invoker = true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE client_access TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE client_payloads TO service_role;
GRANT SELECT ON TABLE latest_client_payloads TO service_role;
GRANT USAGE, SELECT ON SEQUENCE client_payloads_id_seq TO service_role;
