-- Veloria PoS — Migration 0061: état explicite des clés d'idempotence (I-07).
--
-- Constat (audit 2026-11-09, I-07) : `'{}'` signifiait « claim sans résultat »
-- (crash avant store). Chaque appelant devait donc gérer à la main le cas
-- UNIQUE (silence, retry aveugle, ou message trompeur). La sémantique était
-- implicite, fragile et divergente d'un repo à l'autre.
--
-- Réparation : colonne `status` explicite. `pending` = réservé sans résultat,
-- `done` = résultat stocké (le rejouement rejoue le résultat). `claim`
-- insère `pending`, `store` bascule `done`. Voir idempotency.ts :
-- `idempotencyStatus` / `hasPendingIdempotency`. L'ancienne valeur `'{}'`
-- reste interprétée comme `pending` (compatibilité, pas de rupture).
-- 0001..0060 immuables. Colonne ajoutée + backfill, zéro suppression.

ALTER TABLE idempotency_keys ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'done'));

UPDATE idempotency_keys
SET status = CASE WHEN result_json = '{}' THEN 'pending' ELSE 'done' END;

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_status ON idempotency_keys(status);
