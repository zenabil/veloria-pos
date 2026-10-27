# ADR-148 — Refonte visuelle transversale : hiérarchie, densité et cohérence

- **Date** : 2026-10-27
- **Statut** : accepté
- **Contexte** : chaque écran de liste empilait un en-tête en carte (pastille
  « Poste Principal », tag module, période), quatre cartes KPI colorées, une
  barre d'outils repliable et un doublon de recherche (en-tête + barre
  d'outils). La coquille ajoutait une bande « Session » au-dessus d'un bandeau
  qui répétait déjà le module courant. Résultat : trois bandeaux successifs,
  six à huit boutons dans l'en-tête, beaucoup de couleur décorative et des
  actions secondaires aussi visibles que l'action principale.

## Décision 1 — Un seul en-tête de page, posé à même le fond

`PageHeader` devient un en-tête plat : sur-titre module discret, H1, période,
puis actions alignées à droite. La pastille « Poste Principal », le badge
module en pastille et le fond de carte disparaissent. L'en-tête ne contient
plus que la **recherche** (quand l'écran en a une) et l'**action principale**.
Les exports, imports et actions secondaires descendent dans la barre de
filtres. Les titres H1 et les libellés accessibles sont conservés pour les
tests et la navigation clavier.

## Décision 2 — Une seule recherche, une seule barre de filtres

Chaque écran de liste n'a plus qu'un champ de recherche : celui de l'en-tête
(raccourci `F3` conservé). Le doublon de la barre d'outils est supprimé. Les
filtres sont regroupés dans un composant `Toolbar` compact, sans libellés
au-dessus des champs : les options portent leur contexte (« Toutes
catégories », « Tri : nom A → Z »). Le bouton « Filtres » et son état replié
disparaissent : les filtres sont toujours visibles, moins de clics et moins
d'états à mémoriser.

## Décision 3 — Un bandeau de statistiques unique

Les quatre cartes KPI séparées sont remplacées par `StatsStrip` : une seule
surface, quatre (ou cinq) cellules séparées par des filets, libellé, valeur
mono et sous-texte. Les accents arc-en-ciel sont supprimés ; la couleur ne
sert plus qu'à un signal réel et conditionnel :

- vert : disponible, payé, converti, valeur retournée > 0 ;
- ambre : stock bas, en attente, échéance proche ;
- rouge : rupture, dette, dépassement — **jamais** quand la valeur est nulle.

`Kpi` reste disponible pour les écrans analytiques (tableau de bord, rapports)
mais adopte la même sobriété : valeur plus petite, pastille discrète, pas de
barre d'accent.

## Décision 4 — Coquille allégée

- La bande « Session » est fusionnée dans `TopBar` : nom, rôle et bouton
  « Changer d'utilisateur » à droite, horloge et notifications à côté.
- Le libellé du module courant disparaît du bandeau (il vit dans le H1).
- La navigation latérale garde un état actif très lisible mais plus calme :
  fond de surface + barre ambre à gauche, au lieu d'un aplat ambre plein.
- Le pied de raccourcis est plus discret.
- Les toasts passent en bas à droite pour ne plus recouvrir le bandeau et les
  informations de session.

## Décision 5 — Surfaces et thème clair

`Card`, `Button`, `Modal`, `Toolbar` et `StatsStrip` partagent la même
hiérarchie de surfaces (`#101f31` sur fond `#051424`), des rayons cohérents et
des ombres légères. Le thème clair reçoit les surcharges correspondantes :
nouvelle surface, bordures `white/10` visibles, textes `slate-50`/`white` en
encre foncée, en-têtes de tableaux sur bande crème et séparateurs du bandeau
de statistiques. Aucune nouvelle dépendance UI, aucun token métier modifié.

## Conséquences

- Aucune migration, aucun canal IPC, aucun schéma, aucune règle métier.
- Les écrans concernés : Catalogue, Clients, Stock, Dettes, Dépenses, Retours,
  Historique, Devis, Fournisseurs, Zakat, ainsi que la coquille (bandeau,
  navigation, pied de page, toasts) ; Tableau de bord, Rapports, Paramètres,
  Impression et Licence héritent du nouveau socle partagé.
- Les sélecteurs E2E sont conservés, sauf le libellé de recherche du Catalogue
  qui passe de « Recherche catalogue » à « Rechercher un produit » (test
  `barcode-uppercase` mis à jour). Les libellés `Du`/`Au`, les titres H1, les
  boutons d'action et les dialogues restent inchangés.
- Vérification : `tsc -b` 0, `typecheck:electron` 0, eslint 0, prettier 0,
  `verify:fr` 340 fichiers 0, `verify:encoding` 947 fichiers 0,
  **vitest 169 fichiers / 1 171 tests 0**, `build` et `build:electron` ✓,
  E2E ciblés `navigation-smoke`, `component-smoke`, `barcode-uppercase`,
  `catalogue-labels`, `settings-navigation` et `dashboard-ui` 6/6.
- Limite assumée : les captures de cette session sont des artefacts non
  versionnés (`test-results/ui/`) ; les captures de référence restent celles
  des E2E committés.
