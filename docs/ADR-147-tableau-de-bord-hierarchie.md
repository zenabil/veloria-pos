# ADR-147 — Tableau de bord : hiérarchie et détails par onglets

- **Date** : 2026-10-27
- **Statut** : accepté
- **Contexte** : la page Tableau de bord empilait 8 cartes KPI de même poids,
  un en-tête surchargé (dates + trois exports), un long défilement de tableaux
  et deux conteneurs de défilement imbriqués. Les chiffres importants se
  noyaient dans le bruit et les onglets de détail n'existaient pas.

## Décision 1 — Une barre de période dédiée

Les dates, les presets (Aujourd'hui / Hier / 7 jours / Ce mois), Actualiser
et l'export quittent l'en-tête pour une **carte de période** unique :

- preset actif surligné et détecté depuis les dates (`presetRange`) ;
- dates visibles et résumé « Net des avoirs et retours caisse » ;
- menu **Exporter** compact (PDF, Excel CSV, CSV brut) ;
- raccourcis `F4` (dates), `F5` (actualiser), `F8` (CSV) conservés.

## Décision 2 — Quatre KPI principaux, quatre métriques secondaires

- **Ventes nettes**, **Marge brute** (avec %), **Trésorerie globale** et
  **Créances clients** deviennent les quatre cartes principales, avec icônes et
  accents.
- Achats nets, dépenses, dettes fournisseurs et valeur du stock passent dans
  une **bande compacte** à quatre cellules.
- La bande « Aujourd'hui » (ventes du jour, échéances dépassées, ruptures)
  reste visible, avec les libellés au-dessus des valeurs.

## Décision 3 — Analytique en deux colonnes

- Ventes par jour + comparaison à la période précédente.
- Encaissements nets par moyen de paiement, avec total net.
- Ventes et marge par catégorie avec filtre et ligne de total.

## Décision 4 — Détails par onglets

Le reste ne s'empile plus indéfiniment : une carte **Détails** propose
`Finances`, `Stock & dettes`, `Activité récente`.

- Finances : revenus/dépenses/marge + bénéfice net + top rotations.
- Stock & dettes : stock bas/ruptures + dettes + échéances.
- Activité récente : ventes, paiements, achats, retours, dépenses.

Le badge de l'onglet Stock indique le nombre d'alertes. Les icônes des cartes
d'activité sont ajoutées via `RecentCard`.

## Décision 5 — Vigilance progressive

Une carte d'alerte n'apparaît que si la sauvegarde ou l'intégrité manque ; si
tout est sain, une ligne discrète en pied indique la dernière sauvegarde et la
vérification d'intégrité. Les mêmes informations restent accessibles, sans
occuper une carte permanente.

## Décision 6 — Défilement

Le tableau de bord ne crée plus son propre conteneur `h-full overflow-auto`
(qui provoquait des zones cliquables interceptées et un double défilement) :
la page grandit dans le `main` existant, qui gère le scroll.

## Conséquences

- Aucune migration, aucun canal IPC, aucun schéma.
- Toutes les fonctions d'export PDF/Excel/CSV et le modal d'aperçu sont
  conservés.
- Tests : E2E `dashboard-ui.spec.ts` (vente réelle, presets, onglets, export),
  `dashboard.test.ts` reste vert, capture `test-results/dashboard.png`.
- Limite existante hors périmètre UI : le jour métier reste en UTC (E-35) ;
  autour de minuit, une vente et son paiement peuvent tomber dans deux jours
  différents.
