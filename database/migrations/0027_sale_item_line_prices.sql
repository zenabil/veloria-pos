-- Veloria PoS — Migration 0027: prix d'origine + remise par ligne de vente (P0-7).
-- La remise vit dans le prix unitaire : sale_items porte désormais le prix
-- d'origine catalogue (référence) et la remise calculée (original − final) × qty.
-- Non-destructive : ADD COLUMN uniquement, 0001..0026 immuables.
-- Rétro-remplissage : lignes historiques sans remise → origine = facturé, remise 0.
-- Déterministe : passe sur base fraîche/vide/legacy (rejouée une seule fois,
-- version suivie dans schema_migrations comme les précédentes).

ALTER TABLE sale_items ADD COLUMN original_unit_price_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sale_items ADD COLUMN discount_minor INTEGER NOT NULL DEFAULT 0;

UPDATE sale_items
SET original_unit_price_minor = unit_price_minor,
    discount_minor = 0
WHERE original_unit_price_minor = 0 AND discount_minor = 0;
