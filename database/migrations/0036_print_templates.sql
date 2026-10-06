-- Veloria PoS — Migration 0036 : modèles d'impression (Print Studio, C6).
-- Un modèle par (type, nom) ; un seul ACTIF par type (index partiel).
-- Personnalisation sans code : papier, copies, marges, logo, mentions,
-- TVA/remise/QR/codes/signatures/filigrane — N&B strict conservé.
CREATE TABLE print_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_type TEXT NOT NULL CHECK (
    doc_type IN (
      'facture', 'ticket', 'proforma', 'bon_livraison', 'recu', 'avoir', 'etiquette'
    )
  ),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 100),
  settings_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  is_factory INTEGER NOT NULL DEFAULT 0 CHECK (is_factory IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (doc_type, name)
);
CREATE UNIQUE INDEX uq_templates_active ON print_templates (doc_type) WHERE is_active = 1;

-- Jeux d'usine (un actif par type, paramètres = rendu actuel).
INSERT INTO print_templates
  (doc_type, name, settings_json, version, is_factory, is_active, created_at, updated_at)
VALUES
  ('facture', 'Défaut', '{}', 1, 1, 1, '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z'),
  ('ticket', 'Défaut', '{}', 1, 1, 1, '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z'),
  ('proforma', 'Défaut', '{}', 1, 1, 1, '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z'),
  (
    'bon_livraison', 'Défaut', '{}', 1, 1, 1, '2026-10-03T00:00:00.000Z',
    '2026-10-03T00:00:00.000Z'
  ),
  ('recu', 'Défaut', '{}', 1, 1, 1, '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z'),
  ('avoir', 'Défaut', '{}', 1, 1, 1, '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z'),
  ('etiquette', 'Défaut', '{}', 1, 1, 1, '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z');
