-- Veloria PoS — Migration 0044: frais de livraison par brouillon de panier.
-- La vente accepte déjà delivery_fee (use-case + IPC + CHECK total) mais la
-- caisse ne le saisissait ni ne le persistait : colonne manquante ici.
-- Non-destructive : ADD COLUMN avec défaut (anciennes bases = 0, rejouable).
-- 0001..0043 immuables.

ALTER TABLE cart_drafts ADD COLUMN delivery_fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_minor >= 0);
