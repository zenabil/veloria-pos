-- Veloria PoS — Migration 0024: numéros de retour pré-alloués (correctif racine P0).
-- Cause racine : 0023 exigeait return_number NOT NULL à l'INSERT
-- (trg_returns_number_required / trg_supplier_returns_number_required),
-- mais la numérotation historique dérive de l'id (RET-C/S-<id> attribué
-- APRÈS l'INSERT) : tout returns.create échouait par ABORT sur base migrée.
-- Correctif architectural (option A) : comme les factures (sale_invoice),
-- les numéros sont désormais alloués AVANT l'INSERT depuis number_sequences
-- (clés return_customer/RET-C et return_supplier/RET-S), amorcées après le
-- MAX(id) existant pour ne jamais réutiliser un numéro historique.
-- Les triggers BEFORE INSERT impossibles sont abandonnés (l'UNIQUE index
-- idx_returns_number / la contrainte return_number UNIQUE restent la garantie,
-- avec réessai anti-course côté repo comme les factures).
-- Non-destructif : ajouts + DROP de 2 triggers 0023, 0001..0023 immuables.

-- Amorçage après l'historique (jamais de réutilisation).
INSERT INTO number_sequences (sequence_key, prefix, next_value, updated_at)
SELECT 'return_customer', 'RET-C',
  COALESCE((SELECT MAX(id) FROM returns), 0) + 1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM number_sequences WHERE sequence_key = 'return_customer');

INSERT INTO number_sequences (sequence_key, prefix, next_value, updated_at)
SELECT 'return_supplier', 'RET-S',
  COALESCE((SELECT MAX(id) FROM supplier_returns), 0) + 1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM number_sequences WHERE sequence_key = 'return_supplier');

-- Abandon des triggers BEFORE INSERT impossibles (voir en-tête).
DROP TRIGGER IF EXISTS trg_returns_number_required;
DROP TRIGGER IF EXISTS trg_supplier_returns_number_required;
