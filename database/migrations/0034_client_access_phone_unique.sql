-- Veloria PoS - Migration 0034: un seul accès ACTIF par numéro de téléphone.
-- Contexte (F33) : 0032 créait customer_access SANS contrainte UNIQUE sur
-- phone_hash. La fonction Edge client-sync cherche par CONDENSAT : deux
-- clients actifs partageant un numéro lui renvoient 2 lignes -> échec fermé
-- des deux connexions (voir client-access.repo.ts, bloc activation : la
-- source est désormais bloquée dans la transaction, AVANT l'insert).
--
-- Ici, deux rôles :
--   1) Réparation déterministe de l'existant — parmi les lignes ACTIVES d'un
--      même numéro, seule la plus récente (id max) reste active ; les autres
--      passent revoked_at (AUCUNE suppression : l'historique reste, et
--      l'ambiguïté qui bloquait tout le monde est levée — le plus récent
--      reflète la dernière volonté du commerçant).
--   2) Index UNIQUE PARTIEL sur les seules lignes actives : garde schéma
--      contre toute autre voie d'écriture que le bloc activation.
-- Une ligne révoquée conserve son phone_hash (traçabilité) mais ne bloque
-- plus personne : le schéma n'exige l'unicité que parmi les actives.
--
-- Rejouable : UPDATE idempotent (plus de doublon actif = rien à faire) +
-- CREATE UNIQUE INDEX IF NOT EXISTS. 0001..0033 immuables.

UPDATE customer_access
SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE revoked_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM customer_access AS newer
    WHERE newer.phone_hash = customer_access.phone_hash
      AND newer.revoked_at IS NULL
      AND newer.id > customer_access.id
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_access_phone_hash_active
  ON customer_access(phone_hash)
  WHERE revoked_at IS NULL;
