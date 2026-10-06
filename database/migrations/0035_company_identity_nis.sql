-- Veloria PoS — Migration 0035 : identité fiscale complète (NIS + article).
-- La facture A4 DZ réglementaire porte RC + NIF + NIS + article d'imposition
-- (C5). Colonnes NULLables (compat ascendante : fiche existante sans NIS).
ALTER TABLE company_profile ADD COLUMN nis TEXT;
ALTER TABLE company_profile ADD COLUMN article_imposition TEXT;
