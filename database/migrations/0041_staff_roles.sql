-- Veloria PoS — Migration 0041 : rôles internes gérant / utilisateur.
-- Aucune table interne avant (seul customer_access externe + licence affichage).
-- Schéma seul, aucun seed admin en clair : le bootstrap admin/admin vit au
-- premier démarrage côté main (transaction + must_change=1), jamais ici.
-- 0001..0040 immuables. Appliquée une fois via schema_migrations : tables,
-- index et triggers en IF NOT EXISTS ; l'ADD COLUMN audit_log est à passage
-- unique (jamais rejouée par le runner, qui ne réapplique pas une version).

-- 1. Utilisateurs internes (nom + code 6 chiffres, condensat PBKDF2 + sel).
CREATE TABLE IF NOT EXISTS staff_users (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager','user')),
  code_hash TEXT NOT NULL,
  code_salt TEXT NOT NULL,
  code_algo TEXT NOT NULL DEFAULT 'pbkdf2-sha256-100k'
    CHECK (code_algo IN ('pbkdf2-sha256-100k','legacy-admin')),
  must_change_code INTEGER NOT NULL DEFAULT 0 CHECK (must_change_code IN (0,1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  failed_attempts INTEGER NOT NULL DEFAULT 0
    CHECK (failed_attempts >= 0 AND failed_attempts <= 100),
  locked_until TEXT NULL,
  operation_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(username)) >= 3 AND length(username) <= 32),
  CHECK (length(trim(display_name)) >= 1 AND length(display_name) <= 64)
);

-- 2. Permissions accordées par le gérant (le gérant = tout, sans lignes).
CREATE TABLE IF NOT EXISTS staff_user_permissions (
  user_id INTEGER NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL CHECK (permission_key IN
    ('sales','stock','debts','expenses','returns','closings','settings','users','discount','cancel')),
  granted_at TEXT NOT NULL,
  PRIMARY KEY (user_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_staff_permissions_user
  ON staff_user_permissions(user_id);

-- 3. Traçabilité : qui a fait l'action (NULL = avant 0041 / système).
ALTER TABLE audit_log ADD COLUMN actor_user_id INTEGER NULL
  REFERENCES staff_users(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_user_id);

-- 4. Gardes : au moins un gérant actif restant (FR, jamais de verrou silencieux).
CREATE TRIGGER IF NOT EXISTS trg_staff_no_delete_last_manager
BEFORE DELETE ON staff_users
WHEN OLD.role = 'manager' AND OLD.is_active = 1
  AND (SELECT COUNT(*) FROM staff_users
       WHERE role = 'manager' AND is_active = 1 AND id <> OLD.id) = 0
BEGIN
  SELECT RAISE(ABORT, 'Suppression impossible : au moins un gérant actif est requis.');
END;

CREATE TRIGGER IF NOT EXISTS trg_staff_no_demise_last_manager
BEFORE UPDATE OF role, is_active ON staff_users
WHEN (OLD.role = 'manager' AND OLD.is_active = 1)
  AND (NEW.role <> 'manager' OR NEW.is_active <> 1)
  AND (SELECT COUNT(*) FROM staff_users
       WHERE role = 'manager' AND is_active = 1 AND id <> OLD.id) = 0
BEGIN
  SELECT RAISE(ABORT, 'Modification impossible : au moins un gérant actif est requis.');
END;
