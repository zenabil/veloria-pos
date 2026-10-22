# ADR-135 — Export de données CSV réimportable (à côté du rapport)

## Contexte

ADR-130 décision 3 avait séparé deux formats : **export = rapport lisible**
(colonnes enrichies, montants `DZD`), **import = flux de données**
(`nom;vente;achat;quantité[;code-barres]` / `prénom;nom;téléphone`). Un export
réimporté devait échouer proprement.

Le propriétaire a fait exactement le geste naturel : exporter le catalogue,
puis réimporter le fichier. Sur l'ancienne version, le parseur avalait la
ligne d'en-tête puis lisait `Catégorie` comme `Prix de vente` ⇒
`Ligne 2 : prix de vente invalide`. Le correctif EMP-1 (`6bb3a51`) a rendu le
refus explicite, mais **le besoin réel — transférer les données — restait
entier**.

## Décision

Ajouter un **second export « Données CSV »** sur les écrans Produits et
Clients, à côté de l'export « Rapport CSV » existant.

| Export          | Format                                                    | Usage                                |
| --------------- | --------------------------------------------------------- | ------------------------------------ |
| Rapport CSV     | `Nom;Catégorie;Unité;Prix d'achat;Prix de vente;…;Statut` | lecture Excel, audit, impression     |
| **Données CSV** | `nom;vente;achat;quantité[;code-barres]`                  | **réimport direct** (ProductsScreen) |
| **Données CSV** | `prénom;nom;téléphone`                                    | **réimport direct** (ClientsScreen)  |

Règles associées :

1. **Aucun nouveau canal IPC, aucun schéma Zod, aucune migration.** L'export
   est purement renderer ; l'import existant reste l'unique chemin d'écriture
   (validation domaine + transaction atomique main).
2. **Montants non formatés** : `minorToInput` (round-trip garanti par le
   domaine), jamais `formatDzd` (groupes + `DZD`).
3. **Prénom/nom séparés** pour les clients : jamais le nom complet du rapport
   (un découpage heuristique perdrait les noms composés).
4. **Le fichier de données n'est pas un rapport Excel** : `toCsv` est appelé
   avec `protectFormulas: false` pour préserver un téléphone `+213…` ou un nom
   `-…`. Le rapport, lui, garde RX-18 (préfixe apostrophe anti-injection).
   Le libellé et l'infobulle disent explicitement « réimportable ».
5. **Archivés refusés** : le format d'import ne transporte pas le statut
   archivé. Si le filtre courant inclut des archivés, l'export données
   s'arrête avec un message FR (aucun fichier, aucune réactivation
   silencieuse). Le rapport reste disponible pour ces lignes.
6. **Création, pas fusion** : l'import crée de nouvelles fiches. Réimporter
   dans la **même** base échoue proprement sur l'unicité code-barres/téléphone
   (tout-ou-rien) ; pour restaurer une base, utiliser
   `Paramètres → Sauvegarde → Restaurer`.
7. **Champs non transportés** : catégorie, unité, stock mini et statut
   restent dans le rapport. Le format d'import documenté ne les porte pas ;
   les promettre sans les écrire serait mensonger.

## Conséquences

- L'utilisateur peut exporter un catalogue ou un registre depuis un poste et
  l'importer sur un autre poste (ou une base vierge) sans passer par Excel.
- Le rapport existant ne change pas : les habitudes et les tests ADR-130
  restent valides.
- Les deux boutons sont explicites ; l'ancien bouton « CSV » devient
  « Rapport CSV » et un bouton « Données CSV » apparaît.
- Pas de risque de double écriture : l'export ne touche pas à la base.

## Tests

- `tests/unit/csv-import-safety.test.ts` : aller-retour produits (nom avec
  `;`/guillemets, prix 12,50, quantité 12,5, code-barres) et clients
  (prénom/nom séparés, téléphone `+213…`), en-têtes exacts, rapport toujours
  protégé RX-18.
- `tests/unit/root-repair.test.ts` : `protectFormulas: false` conserve
  `+213`/`-5`, le défaut protège toujours.
- `tests/unit/import-export-ui.test.ts` : câblage statique des deux boutons,
  fonctions pures, `protectFormulas: false`, gardes archivés.
- `tests/e2e/csv-import-export.spec.ts` : les deux exports réels (rapport +
  données) sur Clients et Catalogue, toasts FR distincts.

## Rollback

`git revert <sha>` — aucun schéma, aucun canal, aucune migration : retour au
seul rapport ADR-130.
