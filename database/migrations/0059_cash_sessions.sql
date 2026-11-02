-- Veloria PoS — Migration 0059 : sessions de caisse (poste, comptage, écart).
--
-- Constat (demande opérateur 2026-11-02, préparation de la liasse propriétaire
-- ADR-162/163) : le bloc `money.audit` + `money.activeSession` + `money.sessions`
-- de l'application Owner n'avait AUCUN source de données côté POS. La base ne
-- connaissait qu'une clôture de journée (`daily_closings`, une ligne par
-- `business_date`) : pas de poste, pas d'opérateur de caisse, pas de comptage
-- physique, donc pas d'écart ni de conformité. `cash_session`, `counted_minor`
-- et `variance_minor` n'existaient nulle part (grep main = 0).
--
-- Ce que porte cette table (une LIGNE = une session d'un poste) :
--   - `post` : nom du poste de caisse (une seule session OUVERTE par poste —
--     index partiel UNIQUE, la base décide, pas l'UI) ;
--   - `label` : libellé affiché (ex. « Caisse 1 — 02/11 matin ») ;
--   - `staff_user_id` : caissier responsable (NULL toléré : session ouverte sans
--     session opérateur, la ligne reste licite et l'auteur n'est pas inventé) ;
--   - `opening_float_minor` : fond de caisse annoncé à l'ouverture ;
--   - `counted_minor` : comptage physique (modifiable tant que la session est
--     OUVERTE = comptages intermédiaires ; OBLIGATOIRE à la fermeture) ;
--   - `expected_minor` : fonds attendu, FIGÉ à la fermeture (les sessions
--     ouvertes le calculent en direct — aucune valeur périmée en base) ;
--   - `variance` : JAMAIS stockée, toujours `counted − expected` (un écart
--     recopié serait une seconde source de vérité).
--
-- Garde-fous en base (défense en profondeur, mêmes règles que le domaine) :
--   - montants = centimes entiers DZD, `*_minor` INTEGER, float et comptage ≥ 0 ;
--   - `status` ∈ {open, closed} ; une session ouverte n'a ni `closed_at` ni
--     `expected_minor` ; une session fermée a les deux + un comptage ;
--   - `opened_at`/`closed_at`/`created_at` : instants ISO UTC (`…Z`), comme tout
--     l'arbre (le découpage en journée métier vient des migrations 0058 et des
--     helpers `business-day`, jamais d'un format local stocké).
--
-- Règle AGENTS §12 : `0001..0058` sont IMMUABLES. Ce fichier est NOUVEAU,
-- purement additif : aucune ligne existante n'est modifiée ni recopiée.

CREATE TABLE IF NOT EXISTS cash_sessions (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  post TEXT NOT NULL CHECK (length(post) >= 1 AND length(post) <= 40),
  label TEXT NOT NULL CHECK (length(label) >= 1 AND length(label) <= 60),
  staff_user_id INTEGER NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opening_float_minor INTEGER NOT NULL DEFAULT 0 CHECK (opening_float_minor >= 0),
  counted_minor INTEGER NULL CHECK (counted_minor IS NULL OR counted_minor >= 0),
  expected_minor INTEGER NULL,
  note TEXT NULL CHECK (note IS NULL OR length(note) <= 500),
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  CHECK (
    (status = 'open' AND closed_at IS NULL AND expected_minor IS NULL)
    OR (
      status = 'closed'
      AND closed_at IS NOT NULL
      AND expected_minor IS NOT NULL
      AND counted_minor IS NOT NULL
    )
  )
);

-- Une seule session ouverte par poste (le poste est librement nommé).
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_sessions_open_post
  ON cash_sessions (post)
  WHERE status = 'open';

-- Fenêtres de calcul (attente en direct, historique par période).
CREATE INDEX IF NOT EXISTS idx_cash_sessions_opened_at
  ON cash_sessions (opened_at, closed_at);
