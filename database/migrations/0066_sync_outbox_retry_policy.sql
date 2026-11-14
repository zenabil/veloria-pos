-- Veloria PoS — Migration 0066 : compteur de tentative, backoff et quarantaine
-- de la file de sortie miroir (SYNC-02).
--
-- PROBLÈME : `sync_outbox` ne portait que `status` ('pending' | 'sent' |
-- 'failed'). Une ligne rejetée par le miroir, ou simplement rencontrée pendant
-- une panne réseau, était rejouée à CHAQUE tick (toutes les 60 s) sans
-- compteur de tentative, sans délai croissant et sans plafond : une panne
-- réseau transitoire était indiscernable d'une erreur de configuration, et une
-- ligne définitivement refusée monopolisait une place de la file sans jamais
-- s'arrêter.
--
-- CORRECTIF : la ligne porte son propre état de rejeu :
--   - `attempts`        : nombre de tentatives déjà effectuées ;
--   - `last_error`      : dernière erreur (message FR, jamais de secret) ;
--   - `next_attempt_at` : instant de la prochaine tentative (backoff
--                         exponentiel + jitter, calculé par
--                         `electron/sync/retry-policy.ts`) ;
--   - `quarantined_at`  : instant de la mise en quarantaine (budget de
--                         tentatives épuisé, ou rejet définitif de la ligne).
--
-- AUCUN REBUILD : la contrainte `status IN ('pending','sent','failed')` reste
-- telle quelle — la quarantaine est portée par `quarantined_at` (une ligne
-- quarantaine a `status='failed'`), ce qui évite de reconstruire la table
-- `sync_outbox` sur une base de production (règle 12, même choix que 0064 et
-- 0065). Une ligne quarantaine n'est de toute façon plus sélectionnée par la
-- file (`status = 'pending'`), elle n'encombre donc pas les autres.
--
-- Forward-only : nouvelle migration numérotée, jamais d'édition en place.

ALTER TABLE sync_outbox ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_outbox ADD COLUMN last_error TEXT;
ALTER TABLE sync_outbox ADD COLUMN next_attempt_at TEXT;
ALTER TABLE sync_outbox ADD COLUMN quarantined_at TEXT;

-- ─── Garde : le compteur de tentative est un entier non négatif ──────────────
CREATE TRIGGER IF NOT EXISTS trg_sync_outbox_attempts_nonneg_ins
BEFORE INSERT ON sync_outbox
FOR EACH ROW
WHEN NEW.attempts IS NOT NULL AND NEW.attempts < 0
BEGIN
  SELECT RAISE(ABORT, 'Compteur de tentative invalide (negatif).');
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_outbox_attempts_nonneg_upd
BEFORE UPDATE OF attempts ON sync_outbox
FOR EACH ROW
WHEN NEW.attempts IS NOT NULL AND NEW.attempts < 0
BEGIN
  SELECT RAISE(ABORT, 'Compteur de tentative invalide (negatif).');
END;

-- ─── Garde : une ligne QUARANTAINE n'est plus `pending` ────────────────────
-- (une ligne en quarantaine est un état d'audit terminal : elle ne doit plus
-- repartir, sinon la quarantaine ne serait qu'un délai de plus).
CREATE TRIGGER IF NOT EXISTS trg_sync_outbox_quarantine_not_pending_ins
BEFORE INSERT ON sync_outbox
FOR EACH ROW
WHEN NEW.quarantined_at IS NOT NULL AND NEW.status = 'pending'
BEGIN
  SELECT RAISE(ABORT, 'Ligne en quarantaine ne peut pas rester en attente.');
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_outbox_quarantine_not_pending_upd
BEFORE UPDATE OF quarantined_at, status ON sync_outbox
FOR EACH ROW
WHEN NEW.quarantined_at IS NOT NULL AND NEW.status = 'pending'
BEGIN
  SELECT RAISE(ABORT, 'Ligne en quarantaine ne peut pas rester en attente.');
END;

-- ─── Garde : `next_attempt_at` est un instant ISO (ou absent) ───────────────
CREATE TRIGGER IF NOT EXISTS trg_sync_outbox_next_attempt_iso_ins
BEFORE INSERT ON sync_outbox
FOR EACH ROW
WHEN NEW.next_attempt_at IS NOT NULL
  AND NOT (NEW.next_attempt_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*')
BEGIN
  SELECT RAISE(ABORT, 'Prochaine tentative invalide (instant ISO attendu).');
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_outbox_next_attempt_iso_upd
BEFORE UPDATE OF next_attempt_at ON sync_outbox
FOR EACH ROW
WHEN NEW.next_attempt_at IS NOT NULL
  AND NOT (NEW.next_attempt_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*')
BEGIN
  SELECT RAISE(ABORT, 'Prochaine tentative invalide (instant ISO attendu).');
END;
