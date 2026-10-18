-- Veloria PoS — Migration 0047 : recherche client insensible aux accents.
-- Cause : `customers.search_name` est comparé avec LIKE binaire brut
-- (electron/ipc/handlers/customers.repo.ts). Sans ICU, « Bélaïd » ne répond
-- pas à « belaid » : le client existe mais reste introuvable dans Clients
-- comme en caisse — perçu comme supprimé. Même famille : téléphone stocké
-- avec séparateurs, espaces insécables ou espaces multiples.
-- Contenu : colonne `search_norm` NULLABLE (écritures neuves via le repo,
-- backfill historique ici) + index + backfill déterministe et rejouable.
-- Miroir de `normCustomerSearch` (repo) : minuscules, accents français
-- stripped (NFD), ligatures non décomposées (œ/æ → oe/ae, ø → o), espaces
-- repliés (insécables/tabulations inclus). Les caractères hors latin courant
-- restent best-effort pour l'historique (liste finie côté SQL, NFD complet
-- côté JS) — voir docs/ADR-112.
-- 0001..0046 immuables.

ALTER TABLE customers ADD COLUMN search_norm TEXT;
CREATE INDEX IF NOT EXISTS idx_customers_search_norm ON customers(search_norm);

-- 1. Point de départ : copie brute (lignes historiques seulement).
UPDATE customers SET search_norm = search_name WHERE search_norm IS NULL;

-- 2. Ligatures et lettres non décomposables par NFD (parité repo).
UPDATE customers SET search_norm = REPLACE(REPLACE(REPLACE(REPLACE(search_norm, 'œ', 'oe'), 'æ', 'ae'), 'Œ', 'oe'), 'Æ', 'ae');
UPDATE customers SET search_norm = REPLACE(REPLACE(REPLACE(REPLACE(search_norm, 'Ǽ', 'ae'), 'ǽ', 'ae'), 'Ǿ', 'o'), 'ǿ', 'o');
UPDATE customers SET search_norm = REPLACE(REPLACE(REPLACE(REPLACE(search_norm, 'ø', 'o'), 'Ø', 'o'), 'đ', 'd'), 'Đ', 'd');

-- 3. Casse latin-1 restante (lower() SQLite est ASCII seulement).
UPDATE customers SET search_norm = REPLACE(REPLACE(search_norm, 'Ð', 'ð'), 'Þ', 'þ');

-- 4. Voyelles accentuées (minuscules + majuscules).
UPDATE customers SET search_norm = REPLACE(REPLACE(REPLACE(search_norm, 'à', 'a'), 'â', 'a'), 'ä', 'a');
UPDATE customers SET search_norm = REPLACE(REPLACE(REPLACE(search_norm, 'á', 'a'), 'ã', 'a'), 'å', 'a');
UPDATE customers SET search_norm = REPLACE(REPLACE(REPLACE(search_norm, 'À', 'a'), 'Â', 'a'), 'Ä', 'a');
UPDATE customers SET search_norm = REPLACE(REPLACE(REPLACE(search_norm, 'Á', 'a'), 'Ã', 'a'), 'Å', 'a');
UPDATE customers SET search_norm = REPLACE(REPLACE(REPLACE(REPLACE(search_norm, 'è', 'e'), 'é', 'e'), 'ê', 'e'), 'ë', 'e');
UPDATE customers SET search_norm = REPLACE(REPLACE(REPLACE(REPLACE(search_norm, 'È', 'e'), 'É', 'e'), 'Ê', 'e'), 'Ë', 'e');
UPDATE customers SET search_norm = REPLACE(REPLACE(REPLACE(REPLACE(search_norm, 'ì', 'i'), 'í', 'i'), 'î', 'i'), 'ï', 'i');
UPDATE customers SET search_norm = REPLACE(REPLACE(REPLACE(REPLACE(search_norm, 'Ì', 'i'), 'Í', 'i'), 'Î', 'i'), 'Ï', 'i');
UPDATE customers SET search_norm = REPLACE(REPLACE(REPLACE(search_norm, 'ò', 'o'), 'ó', 'o'), 'ô', 'o');
UPDATE customers SET search_norm = REPLACE(REPLACE(search_norm, 'ö', 'o'), 'õ', 'o');
UPDATE customers SET search_norm = REPLACE(REPLACE(REPLACE(search_norm, 'Ò', 'o'), 'Ó', 'o'), 'Ô', 'o');
UPDATE customers SET search_norm = REPLACE(REPLACE(search_norm, 'Ö', 'o'), 'Õ', 'o');
UPDATE customers SET search_norm = REPLACE(REPLACE(REPLACE(REPLACE(search_norm, 'ù', 'u'), 'ú', 'u'), 'û', 'u'), 'ü', 'u');
UPDATE customers SET search_norm = REPLACE(REPLACE(REPLACE(REPLACE(search_norm, 'Ù', 'u'), 'Ú', 'u'), 'Û', 'u'), 'Ü', 'u');
UPDATE customers SET search_norm = REPLACE(REPLACE(search_norm, 'ÿ', 'y'), 'ý', 'y');
UPDATE customers SET search_norm = REPLACE(REPLACE(search_norm, 'Ÿ', 'y'), 'Ý', 'y');

-- 5. Consonnes.
UPDATE customers SET search_norm = REPLACE(search_norm, 'ç', 'c');
UPDATE customers SET search_norm = REPLACE(search_norm, 'Ç', 'c');
UPDATE customers SET search_norm = REPLACE(search_norm, 'ñ', 'n');
UPDATE customers SET search_norm = REPLACE(search_norm, 'Ñ', 'n');

-- 6. Espaces : insécable/tabulation/retours → espace simple, doubles repliés
-- (5 passes = jusqu'à 32 espaces consécutifs), bords retirés — parité avec le
-- collapse + trim du repo.
UPDATE customers SET search_norm = REPLACE(REPLACE(REPLACE(REPLACE(search_norm, char(160), ' '), char(9), ' '), char(10), ' '), char(13), ' ');
UPDATE customers SET search_norm = REPLACE(search_norm, '  ', ' ');
UPDATE customers SET search_norm = REPLACE(search_norm, '  ', ' ');
UPDATE customers SET search_norm = REPLACE(search_norm, '  ', ' ');
UPDATE customers SET search_norm = REPLACE(search_norm, '  ', ' ');
UPDATE customers SET search_norm = REPLACE(search_norm, '  ', ' ');
UPDATE customers SET search_norm = TRIM(search_norm);

-- 7. Minuscules ASCII (lower() natif : ASCII uniquement, les accents sont
-- déjà traités ci-dessus).
UPDATE customers SET search_norm = lower(search_norm);
