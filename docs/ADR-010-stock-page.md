# ADR-010 — Page Stock (valeur, seuils, ajustements, inventaire)

Date : 2026-09-16. Statut : accepté.

## Contexte

Le stock n'était visible que par ricochet (catalogue, caisse) : pas de valeur
globale, pas d'historique des mouvements, ajustement rudimentaire sans
référence, aucun inventaire (comptage). Le module sidebar « Stock » était un
placeholder.

## Décision

- Migration **0009** (schéma antérieur immuable) : `products.max_stock_level`
  (0 = aucun plafond, éditable dans la fiche catalogue), `stock_movements.reference`
  (traçabilité ajustements/inventaires), 2 index mouvements.
- Nouveaux canaux explicites : `stock.products` (table serveur : recherche,
  catégorie, statut, type de mouvement, 6 tris, pagination, valeur calculée),
  `stock.movements` (historique paginé + filtres dates/types, stock avant
  calculé), `stock.inventory` (écarts comptés → ajustements, 1 transaction +
  audit, lignes conformes ignorées, « aucun écart » refusé).
- `stock.adjust` étendu (référence optionnelle) ; `stock.overview` enrichi
  (quantité totale) — rétrocompatibles.
- Types d'ajustement UI (Entrée/Sortie/Correction/Inventaire) mappés sur les
  types SQL existants (`adjust_in`/`adjust_out`, préfixe de motif) : aucun
  élargissement du CHECK, aucun prorata fabriqué.
- UI : `StockScreen` (en-tête, 4 KPIs, barre d'outils, table 11 colonnes,
  sélection → inventaire) + 4 dialogues (détail, ajustement avec sélecteur
  produit, historique, inventaire). Soldes par entrée non stockés : le payé /
  restant restent au niveau fournisseur (ADR-009).

## Conséquences

- Nouveau module sidebar « Stock » (prêt). Champ « Stock maximum » ajouté à la
  fiche produit (cohérence min/max validée domaine + Zod).
- Tests : domaine + helpers + schémas (`stock.test.ts`), tranche SQL 0009,
  `verify-migrations` et `verify-domain` étendus.
