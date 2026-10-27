# ADR-145 — Paramètres : composants unifiés et sections regroupées

- **Date** : 2026-10-26
- **Statut** : accepté
- **Contexte** : la première passe (ADR-143) a reconstruit la coquille de la
  page Paramètres, mais les sections restaient des formulaires empilés avec
  des composants hétérogènes : boutons d'action déguisés en « Enregistrer »,
  cartes d'une seule ligne, listes de champs sans repère, et trois réglages
  dispersés (sons, stock, fournisseurs). Le propriétaire demande d'aller plus
  loin dans la simplification des sections et de leurs composants.

## Décision 1 — Un composant de carte unique

`Section` porte désormais :

- une **icône** à gauche et un **badge d'état** (crédit actif, comptant,
  nombre de copies, schéma SQLite, version…) ;
- un en-tête avec titre, description et **repli** optionnel ;
- un contenu espacé de façon homogène et un **pied d'enregistrement** unifié
  (`SaveBar`) aligné à droite.

La structure DOM garde le `h3` à deux niveaux de la carte (les tests E2E
existants qui remontent au conteneur restent valides) ; pour les cartes
repliables, le bouton et l'icône sont positionnés en absolu.

`SettingsGroup` structure les sous-parties d'une même carte (Caisse, Crédit,
Sons…). `Segmented` remplace les menus déroulants à 2-3 options (moyen de
paiement) pour un choix en un clic. `SwitchRow` est plus compact et conserve
les libellés/`aria-label`.

## Décision 2 — Moins de cartes, plus de cohérence

Trois regroupements suppriment les cartes d'une seule ligne :

| Avant                  | Après                                     |
| ---------------------- | ----------------------------------------- |
| Vente + Sons           | **Vente** (Caisse, Crédit, Sons)          |
| Produits + Stock       | **Produits** (Catalogue, Stock)           |
| Clients + Fournisseurs | **Clients** (Crédit client, Fournisseurs) |

La page Commerce passe de 5 à 3 cartes ; Catalogue de 2 à 1. L'index de
recherche (`SETTINGS_CARDS`) est mis à jour : « sons », « fournisseur » et
« stock » conduisent aux cartes fusionnées. Les identifiants d'ancre
`sound`/`stock`/`suppliers` disparaissent, les titres E2E « Vente » et
« Produits » sont conservés.

## Décision 3 — Séparer « enregistrer » et « agir »

`SaveBar` ne sert plus qu'à persister un formulaire. Les actions immédiates
utilisent des `Button` explicites :

- Sauvegarde : « Sauvegarder maintenant », « Ouvrir le dossier », « Exporter
  la dernière » (l'auto-sauvegarde s'applique immédiatement) ;
- Base : « Vérifier », « Optimiser », « Déplacer… », « Réinitialiser… » ;
- Miroir : « Pousser maintenant » à côté du bouton « Enregistrer » ;
- À propos : « Dossier données », « Journaux ».

Cela supprime la confusion entre un bouton d'enregistrement de réglages et
une action ponctuelle.

## Décision 4 — Divulgation progressive

Les informations fiscales restent repliées, le contenu/les textes de
facturation sont repliables, et les cartes « Miroir Android » et « À propos »
peuvent être repliées avec un résumé. Les réglages essentiels restent ouverts
par défaut.

## Conséquences

- Aucune migration, aucun canal IPC, aucun schéma Zod.
- Tous les libellés, `aria-label` et boutons utilisés par les E2E sont
  conservés ; seul le locator du Miroir a été stabilisé sur
  `[data-settings-card="sync"]` (le titre est désormais dans un en-tête
  enrichi).
- Tests : `settings-search` (6 cas, dont les cartes fusionnées),
  `settings-navigation` 1/1, `stock-backup` 4/4, `full-loop-client` 1/1
  (mirage poussé : 7 clichés, 1 accès), `component-smoke` et
  `navigation-smoke` restent la référence de non-régression.
