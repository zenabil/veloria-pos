-- Veloria PoS — Migration 0065 : invariant monétaire de LIGNE (MONEY-04 / DB-03).
--
-- PROBLÈME : rien ne liait le montant facturé d'une ligne de vente
-- (`sale_items.line_total_minor`) à son prix unitaire et sa quantité
-- (`unit_price_minor` × `quantity`). L'application l'imposait (domaine +
-- `electron/ipc/money-guard.ts`), la BASE ne l'imposait pas : un écrivain
-- direct (SQL, script d'import, futur module) pouvait écrire une ligne dont
-- le total ne correspondait à rien, et les rapports (CA, marge, Z) lisaient
-- alors une valeur fausse sans jamais s'en apercevoir.
--
-- CORRECTIF : le contrat de l'application devient un contrat de la BASE.
--   Contrat applicatif (money-guard.ts / sale-rules.ts) :
--     | line_total − arrondi(unit_price × quantity) | ≤ ceil(unit_price × 0,0005) + 1
--   Ce que la base vérifie (identique, à l'exactitude près) :
--     | line_total − (unit_price × quantity) | ≤ ceil(unit_price × 0,0005) + 1 + 0,5
--
-- POURQUOI LA BANDE « + 0,5 » : SQL ne sait pas arrondir comme JavaScript.
-- `Math.round(x)` (JS) et `round(x)` (SQLite) ne coïncident pas sur les
-- demi-équivalents exacts (ex. 0,49999999999999994 : JS → 0, SQLite → 1).
-- Comparer la distance au produit BRUT plutôt qu'à un arrondi rend la règle
-- INDÉPENDANTE de la convention d'arrondi : la bande de ±0,5 centime couvre
-- exactement les deux arrondis possibles d'un demi-centime. Le refus est donc
-- le MÊME que celui de l'application, au cas d'exactitude près, et aucune
-- vente légitime n'est refusée pour un flottant.
--
-- `ceil(unit_price × 0,0005)` est calculé SANS fonction mathématique SQLite
-- (absente de certaines builds) : troncature + 1 si la partie fractionnaire
-- existe. C'est le même calcul que `Math.ceil` pour une valeur ≥ 0.
--
-- AUCUN REBUILD : SQLite ne sait pas ajouter de CHECK à une table existante
-- (pas de `ALTER TABLE ... ADD CONSTRAINT`, pas de `NOT VALID`) ; un rebuild
-- de `sale_items` sur une base de vente en production est une migration de
-- données à risque réel. On applique donc le MÊME PATTERN que la migration
-- 0064 (triggers fail-closed), qui touche zéro ligne existante.
--
-- Les lignes HISTORIQUES ne sont pas réécrites ni refusées (un trigger n'agit
-- qu'à l'écriture) : une vue de diagnostic expose la dérive éventuelle pour
-- que le gérant puisse la voir (`v_sale_items_line_total_drift`).
--
-- Forward-only (AGENTS.md règle 12) : nouvelle migration numérotée, jamais
-- d'édition en place d'une migration déjà appliquée.

-- ─── Garde d'INSERTION ──────────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS trg_sale_items_line_total_ins
BEFORE INSERT ON sale_items
FOR EACH ROW
WHEN ABS(NEW.line_total_minor - (NEW.unit_price_minor * NEW.quantity)) >
     (CAST(NEW.unit_price_minor * 0.0005 AS INTEGER)
      + CASE WHEN (NEW.unit_price_minor * 0.0005) > CAST(NEW.unit_price_minor * 0.0005 AS INTEGER)
             THEN 1 ELSE 0 END
      + 1 + 0.5)
BEGIN
  SELECT RAISE(ABORT, 'Montant de ligne incohérent avec le prix et la quantité.');
END;

-- ─── Garde de MISE À JOUR ────────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS trg_sale_items_line_total_upd
BEFORE UPDATE OF unit_price_minor, quantity, line_total_minor ON sale_items
FOR EACH ROW
WHEN ABS(NEW.line_total_minor - (NEW.unit_price_minor * NEW.quantity)) >
     (CAST(NEW.unit_price_minor * 0.0005 AS INTEGER)
      + CASE WHEN (NEW.unit_price_minor * 0.0005) > CAST(NEW.unit_price_minor * 0.0005 AS INTEGER)
             THEN 1 ELSE 0 END
      + 1 + 0.5)
BEGIN
  SELECT RAISE(ABORT, 'Montant de ligne incohérent avec le prix et la quantité.');
END;

-- ─── Vue de DIAGNOSTIC (lecture seule, jamais de blocage) ───────────────────
-- Liste les lignes dont le total facturé s'écarte du prix × quantité au-delà
-- de la tolérance. Vide sur une base saine ; non vide = dérive à examiner
-- (lignes écrites avant la 0065, ou import direct).
CREATE VIEW IF NOT EXISTS v_sale_items_line_total_drift AS
SELECT
  si.id AS sale_item_id,
  si.sale_id,
  si.product_name_snapshot,
  si.unit_price_minor,
  si.quantity,
  si.line_total_minor,
  ROUND(si.unit_price_minor * si.quantity) AS expected_line_total_minor,
  si.line_total_minor - ROUND(si.unit_price_minor * si.quantity) AS drift_minor
FROM sale_items si
WHERE ABS(si.line_total_minor - (si.unit_price_minor * si.quantity)) >
      (CAST(si.unit_price_minor * 0.0005 AS INTEGER)
       + CASE WHEN (si.unit_price_minor * 0.0005) > CAST(si.unit_price_minor * 0.0005 AS INTEGER)
              THEN 1 ELSE 0 END
       + 1 + 0.5);
