# ADR-011 — Page Historique unifié (17 types, lecture seule)

Date : 2026-09-16. Statut : accepté.

## Contexte

Aucune traçabilité transverse : les ventes, achats, paiements, mouvements et
fiches n'étaient consultables que dans leurs écrans respectifs (dont la
plupart restaient des placeholders). Le module sidebar « Historique » était vide.

## Décision

- Lecture seule : un UNION multi-tables (ventes, entrées, paiements clients /
  fournisseurs, mouvements, audit, fiches) construit par
  `history-query.ts` **pur et testé** (même grammaire node:sqlite /
  better-sqlite3), exécuté par `history.repo.ts`. 3 canaux explicites :
  `history.list/detail/stats`. Aucun `run-sql`, aucune migration.
- Taxonomie complète (17 sortes) : créations dérivées des tables, modifications
  via 3 nouvelles écritures audit (`product/customer/supplier.updated`,
  atomiques avec l'écriture), suppressions via audit existant + `deleted_at`
  (clients archivés). Les mouvements de création produit restent sous
  « Création produit » (pas de double compte en « Entrée stock »).
- Filtre des 9 opérations + Tous (les événements fiches vivent sous « Toutes »,
  retrouvables par recherche). Tri date/montant, période, pagination serveur.
- **Utilisateur** : aucune notion d'acteur en base (mono-poste) — colonne et
  filtre affichent « Caisse (ce poste) », structure prête pour le multi-poste.
- UI : table 12 colonnes, tiroir détail normalisé (opération/entité/montant/
  stock), « Voir le document » = aperçu + impression du ticket (ventes,
  canaux d'impression existants), export CSV (filtres ou sélection, cap
  1 000 lignes signalé).

## Conséquences

- Nouveau module sidebar « Historique » (prêt). Soldes par entrée et proratas
  toujours exclus (ADR-009/010) : montants au niveau document, quantités au
  niveau mouvement.
