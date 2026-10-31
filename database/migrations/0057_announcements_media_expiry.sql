-- Veloria PoS — Migration 0057: annonces médias + expiration (ADR-166).
-- Contexte : l'annonce magasin (0032) était UNE ligne de texte de 120
-- caractères, sans image ni fin. Le bandeau « hero » de l'APK affiche
-- désormais jusqu'à 4 annonces actives, en texte OU en image (lien https
-- hébergé à l'extérieur), chacune avec une échéance (compte à rebours).
--
-- 0032 est immuable : ce fichier reconstruit `announcements` (SQLite ne sait
-- pas retirer un NOT NULL ni ajouter un CHECK) en préservant toutes les
-- lignes existantes (texte legacy conservé, image/échéance NULL = sans
-- compte à rebours, actif inchangé).
--
-- Bornes DB (défense en profondeur, mêmes règles que le domaine) :
--   - texte OU image obligatoire (jamais une ligne vide) ;
--   - texte ≤ 120 caractères (borne historique 0032) ;
--   - image = URL https ≤ 500 caractères (pas de blob base64 dans SQLite) ;
--   - is_active ∈ {0,1}, sort ≥ 0.

CREATE TABLE IF NOT EXISTS announcements_v2 (
  id INTEGER PRIMARY KEY,
  text TEXT,
  image_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  ends_at TEXT,
  sort INTEGER NOT NULL DEFAULT 0 CHECK (sort >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT,
  CHECK (text IS NOT NULL OR image_url IS NOT NULL),
  CHECK (text IS NULL OR (length(text) >= 1 AND length(text) <= 120)),
  CHECK (image_url IS NULL OR (length(image_url) <= 500 AND image_url LIKE 'https://%'))
);

INSERT INTO announcements_v2 (id, text, image_url, is_active, ends_at, sort, created_at, updated_at)
  SELECT id, text, NULL, is_active, NULL, 0, created_at, created_at FROM announcements;

DROP TABLE announcements;

ALTER TABLE announcements_v2 RENAME TO announcements;

CREATE INDEX IF NOT EXISTS idx_announcements_active_sort ON announcements(is_active, sort);
