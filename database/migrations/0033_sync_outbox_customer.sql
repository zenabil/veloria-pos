-- Veloria PoS — Migration 0033: rattachement client de la file miroir (P0).
-- Contexte : `sync_outbox` (0032) ne portait pas `customer_id` alors que
-- `sync.service` (push) et `sync.protocol` (buildMirrorRequests) l'exigent :
-- la poussée miroir levait `no such column: customer_id` à chaque poussée.
-- Ajout nullable (file historique sans client = NULL, jamais bloquant) + index.
-- Déterministe et rejouable : le runner suit les versions appliquées.

ALTER TABLE sync_outbox ADD COLUMN customer_id INTEGER NULL REFERENCES customers(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sync_outbox_customer_status ON sync_outbox(customer_id, status);
