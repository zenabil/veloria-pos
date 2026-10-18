-- Veloria PoS — Migration 0042 : code de secours gérant (récupération offline).
-- Un seul code de secours par poste (8 chiffres, condensat PBKDF2 + sel) :
-- créé au bootstrap avec le premier gérant, affiché UNE fois, vérifié par
-- staff.recover (sans session). 0041 immuable. ADD TABLE uniquement, rejouable
-- via IF NOT EXISTS (aucun ALTER ici).

CREATE TABLE IF NOT EXISTS staff_recovery (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  code_hash TEXT NOT NULL,
  code_salt TEXT NOT NULL,
  code_algo TEXT NOT NULL DEFAULT 'pbkdf2-sha256-100k'
    CHECK (code_algo IN ('pbkdf2-sha256-100k')),
  failed_attempts INTEGER NOT NULL DEFAULT 0
    CHECK (failed_attempts >= 0 AND failed_attempts <= 100),
  locked_until TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
