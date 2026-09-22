-- Veloria PoS — Migration 0006 : notes libres sur les fiches clients.
-- Additive uniquement (aucune table existante modifiée hors ajout nullable).
ALTER TABLE customers ADD COLUMN notes TEXT;
