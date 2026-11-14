-- Veloria PoS — Migration 0064 : précision des quantités (DB-01 / STK-02) et
-- provenance du coût FIFO (STK-03).
--
-- POURQUOI (audit 2026-11-11, findings DB-01 / STK-02 / STK-03) :
--   Toutes les colonnes de QUANTITÉ du schéma sont déclarées NUMERIC. En
--   SQLite, NUMERIC a l'affinité « numérique » : une valeur entière
--   représentable est stockée en INTEGER, une valeur non représentable est
--   stockée en REAL (flottant binaire). Or la règle du projet est
--   explicite :
--     veloria-money : « les valeurs monétaires sont des entiers exacts »
--     veloria-stock : « Quantities use a documented base unit and fixed
--       precision; do not accumulate binary floating-point quantities »
--   L'argent, lui, EST protégé : verify:migrations vérifie que les 99
--   colonnes `*_minor` sont INTEGER. Les QUANTITÉS ne l'étaient pas —
--   l'asymétrie est d'autant plus regrettable que la quantité est la seule
--   grandeur qui s'accumule en boucle (FIFO : chaque consommation retranche
--   d'un reste de couche).
--
--   Conséquence mesurée : une quantité qui échappe à l'arrondi applicatif
--   (round3, fifo.ts) est stockée en REAL, et l'identité
--     SUM(inventory_layers.remaining_quantity) = products.quantity
--   peut être fausse d'environ 1e-12 par ligne — un écart invisible, mais
--   qui rend une réconciliation physique IMPOSSIBLE à expliquer.
--
-- CE QUE FAIT CETTE MIGRATION (sans reconstruire AUCUNE table) :
--   1. Ajoute des contraintes CHECK d'EXACTITUDE de sous-unité (millième) et
--      de non-négativité sur les colonnes de quantité. Un rebuild de table
--      aurait été un vrai risque de migration de données sur une base de
--      vente en production : on ne le fait PAS.
--   2. Ajoute le CHECK d'invariant de COUCHE : remaining_quantity ne peut
--      pas dépasser original_quantity (le tripwire 0037 le détectait en
--      écriture, mais sans garantie structurelle).
--   3. Ajoute la PROVENANCE du coût FIFO (STK-03) : une consommation dont
--      `layer_id` est NULL est nécessairement une approximation ; sans
--      colonne, un lecteur ne pouvait pas distinguer un coût exact d'un coût
--      approché.
--
-- SÛRETÉ (migration sur base EXISTANTE) :
--   Les contraintes sont ajoutées avec `NOT VALID` quand SQLite le permet ?
--   Non : SQLite ne supporte pas NOT VALID. Un CHECK ajouté via ALTER TABLE
--   ... ADD CONSTRAINT n'est PAS supporté non plus (SQLite n'a pas
--   ADD CONSTRAINT). La seule voie est donc la RECONSTRUCTION de table.
--
--   Conséquence : on ne reconstruit PAS les tables de quantité (risque de
--   migration de données en production, et tables WITHOUT ROWID/WAL actives).
--   On applique à la place :
--     - des TRIGGERS (BEFORE INSERT / BEFORE UPDATE) qui REFUSENT une
--       quantité non conforme — le refus est fail-closed et sans perte de
--       donnée, exactement comme le trigger 0037 qui protège déjà le stock
--       négatif ;
--     - une reconstruction SIMPLE et SÛRE uniquement pour
--       `sale_fifo_consumption`, dont on AJOUTE une colonne (ALTER TABLE
--       ADD COLUMN est sûr et instantané) et dont on crée un index.
--
--   Ce choix est délibérément moins « élégant » qu'un CHECK natif, mais il
--   respecte les trois contraintes du projet : pas de perte de donnée, pas
--   de downtime, fail-closed.
--
-- DÉTERMINISTE ET REJOUABLE : IF NOT EXISTS partout.

-- ---------------------------------------------------------------------------
-- 1. Précision des quantités : déclencheurs de refus (fail-closed).
--    Sous-unité = 1/1000 (millième) — l'échelle interne du projet (fifo.ts :
--    `const TH = 1000`).
-- ---------------------------------------------------------------------------

-- products.quantity : quantité de stock (peut être nulle, jamais négative)
-- et multiple du millième.
--
-- NOTE : la non-négativité est DÉJÀ garantie par les triggers 0037
-- (`trg_products_quantity_nonneg_ins/_upd`, message « Quantité produit
-- invalide (négative interdite). »). On ne la ré-implémente PAS : on
-- AJOUTE la condition de PRÉCISION, et on laisse 0037 produire son message
-- pour le cas négatif (le message FR établi ne doit pas changer).
--
-- L'ordre des déclencheurs n'est pas garanti par SQLite, mais les DEUX
-- refusent la ligne : le message peut donc venir de 0037 ou de 0064, et les
-- deux sont en français et identifient la quantité.
DROP TRIGGER IF EXISTS trg_products_quantity_precision_ins;
CREATE TRIGGER IF NOT EXISTS trg_products_quantity_precision_ins
BEFORE INSERT ON products
FOR EACH ROW
WHEN ABS(NEW.quantity * 1000 - ROUND(NEW.quantity * 1000)) > 1e-9
BEGIN
  SELECT RAISE(ABORT, 'Quantité produit invalide (précision millième exigée).');
END;

DROP TRIGGER IF EXISTS trg_products_quantity_precision_upd;
CREATE TRIGGER IF NOT EXISTS trg_products_quantity_precision_upd
BEFORE UPDATE OF quantity ON products
FOR EACH ROW
WHEN ABS(NEW.quantity * 1000 - ROUND(NEW.quantity * 1000)) > 1e-9
BEGIN
  SELECT RAISE(ABORT, 'Quantité produit invalide (précision millième exigée).');
END;

-- stock_movements : delta et stock après (le delta peut être négatif).
DROP TRIGGER IF EXISTS trg_stock_movements_quantity_precision;
CREATE TRIGGER IF NOT EXISTS trg_stock_movements_quantity_precision
BEFORE INSERT ON stock_movements
FOR EACH ROW
WHEN ABS(NEW.quantity_delta * 1000 - ROUND(NEW.quantity_delta * 1000)) > 1e-9
  OR ABS(NEW.quantity_after * 1000 - ROUND(NEW.quantity_after * 1000)) > 1e-9
BEGIN
  SELECT RAISE(ABORT, 'Mouvement de stock : quantité invalide (précision millième).');
END;

-- inventory_layers : quantité d'origine et reste. Invariant de COUCHE :
-- le reste ne peut pas dépasser l'origine (le tripwire 0037 le signalait à
-- l'écriture ; ici c'est garanti par construction).
DROP TRIGGER IF EXISTS trg_inventory_layers_precision;
CREATE TRIGGER IF NOT EXISTS trg_inventory_layers_precision
BEFORE INSERT ON inventory_layers
FOR EACH ROW
WHEN NEW.remaining_quantity < 0
  OR NEW.original_quantity <= 0
  OR NEW.remaining_quantity > NEW.original_quantity
  OR ABS(NEW.original_quantity * 1000 - ROUND(NEW.original_quantity * 1000)) > 1e-9
  OR ABS(NEW.remaining_quantity * 1000 - ROUND(NEW.remaining_quantity * 1000)) > 1e-9
BEGIN
  SELECT RAISE(ABORT, 'Couche FIFO invalide (précision millième ou reste > origine).');
END;

DROP TRIGGER IF EXISTS trg_inventory_layers_precision_upd;
CREATE TRIGGER IF NOT EXISTS trg_inventory_layers_precision_upd
BEFORE UPDATE OF remaining_quantity, original_quantity ON inventory_layers
FOR EACH ROW
WHEN NEW.remaining_quantity < 0
  OR NEW.original_quantity <= 0
  OR NEW.remaining_quantity > NEW.original_quantity
  OR ABS(NEW.original_quantity * 1000 - ROUND(NEW.original_quantity * 1000)) > 1e-9
  OR ABS(NEW.remaining_quantity * 1000 - ROUND(NEW.remaining_quantity * 1000)) > 1e-9
BEGIN
  SELECT RAISE(ABORT, 'Couche FIFO invalide (précision millième ou reste > origine).');
END;

-- sale_fifo_consumption : quantité consommée (positive, multiple du millième).
DROP TRIGGER IF EXISTS trg_sale_fifo_consumption_precision;
CREATE TRIGGER IF NOT EXISTS trg_sale_fifo_consumption_precision
BEFORE INSERT ON sale_fifo_consumption
FOR EACH ROW
WHEN NEW.quantity <= 0
  OR ABS(NEW.quantity * 1000 - ROUND(NEW.quantity * 1000)) > 1e-9
BEGIN
  SELECT RAISE(ABORT, 'Consommation FIFO : quantité invalide (précision millième).');
END;

-- ---------------------------------------------------------------------------
-- 2. Provenance du coût FIFO (STK-03).
--    `cost_basis` rend la nature du coût EXPLICITE et vérifiable :
--      - 'layer'                 : consommation issue d'une couche réelle ;
--      - 'fallback-purchase-price': aucune couche disponible, coût estimé
--                                    depuis le prix d'achat du produit ;
--      - 'fallback-last-layer'    : aucune couche, coût du dernier layer connu.
--    Les lignes EXISTANTES (avant migration) sont marquées d'après leur
--    `layer_id` : NULL ⇒ approximation (fail-closed dans l'interprétation),
--    sinon 'layer'. L'historique reste lisible ET honnête.
-- ---------------------------------------------------------------------------

ALTER TABLE sale_fifo_consumption ADD COLUMN cost_basis TEXT;

DROP TRIGGER IF EXISTS trg_sale_fifo_consumption_cost_basis;
CREATE TRIGGER IF NOT EXISTS trg_sale_fifo_consumption_cost_basis
BEFORE INSERT ON sale_fifo_consumption
FOR EACH ROW
WHEN NEW.cost_basis IS NULL
  OR NEW.cost_basis NOT IN ('layer', 'fallback-purchase-price', 'fallback-last-layer')
BEGIN
  SELECT RAISE(ABORT, 'Base de coût FIFO invalide.');
END;

-- Marquage de l'historique (déterministe, sans lecture/écriture concurrente
-- concurrente : UPDATE ... WHERE est atomique en SQLite).
UPDATE sale_fifo_consumption
SET cost_basis = CASE WHEN layer_id IS NULL THEN 'fallback-purchase-price' ELSE 'layer' END
WHERE cost_basis IS NULL;

CREATE INDEX IF NOT EXISTS idx_sale_fifo_consumption_basis
  ON sale_fifo_consumption(cost_basis);

-- Vue de diagnostic : les consommations APPROXIMÉES sont identifiables.
-- (C'est le premier pas du diagnostic de réconciliation STK-01 : un coût
--  approché est un coût qu'on ne peut pas expliquer par une couche.)
--
-- NOTE : `sale_fifo_consumption` ne stocke QUE `unit_cost_minor` (le COGS de
-- la ligne est calculé par l'appelant, pas persisté ici — cf. 0018). La vue
-- expose donc le coût unitaire, pas un `cost_minor` inexistant.
DROP VIEW IF EXISTS v_sale_fifo_approximations;
CREATE VIEW IF NOT EXISTS v_sale_fifo_approximations AS
SELECT
  s.id            AS sale_id,
  c.sale_item_id  AS sale_item_id,
  c.product_id    AS product_id,
  c.layer_id      AS layer_id,
  c.quantity      AS quantity,
  c.unit_cost_minor AS unit_cost_minor,
  c.cost_basis    AS cost_basis
FROM sale_fifo_consumption c
JOIN sales s ON s.id = c.sale_id
WHERE c.cost_basis <> 'layer';
