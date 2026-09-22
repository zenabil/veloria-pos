-- Veloria PoS — Migration 0030: brouillons de paniers caisse (P4).
-- Les onglets paniers survivent au redémarrage (SQLite = seule source de
-- vérité, jamais de LocalStorage pour des données métier). Une ligne par
-- onglet, remplacée en bloc à chaque sauvegarde (1 transaction).
-- Non-destructive : tables + index, 0001..0029 immuables.
-- Déterministe : IF NOT EXISTS (rejouable).

CREATE TABLE IF NOT EXISTS cart_drafts (
  tab_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  lines_json TEXT NOT NULL DEFAULT '[]',
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_label TEXT NOT NULL DEFAULT 'Client de passage',
  amount_paid_minor INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid_minor >= 0),
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('cash', 'cheque', 'transfer')),
  updated_at TEXT NOT NULL
);
