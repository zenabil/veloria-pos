-- Veloria PoS — Migration 0043 : garde pin_algo (liste blanche PBKDF2 / historique).
-- 0039 a ajouté pin_algo TEXT NOT NULL DEFAULT 'sha256' SANS CHECK : toute
-- chaîne était acceptée au niveau SQL. Valeurs canoniques :
-- src/domain/customer/client-access.ts:157 (PIN_KDF_ALGO='pbkdf2-sha256-100k')
-- + historique 'sha256' (chemin transitoire Edge, jamais réactivé).
-- 0001..0042 immuables. ADD TRIGGER uniquement, rejouable via IF NOT EXISTS.
-- Écritures neuves : electron/ipc/handlers/client-access.repo.ts:273-280
-- (PIN_KDF_ALGO uniquement).

-- Normalisation défensive : aucune ligne existante ne doit porter une valeur
-- hors liste avant d'armer les gardes (base saine : 'sha256' par défaut).
UPDATE customer_access SET pin_algo = 'sha256'
  WHERE pin_algo IS NULL OR trim(pin_algo) = '';

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
