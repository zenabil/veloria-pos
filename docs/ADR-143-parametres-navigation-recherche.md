# ADR-143 — Paramètres : navigation groupée, recherche et sous-navigation

- **Date** : 2026-10-26
- **Statut** : accepté
- **Contexte** : l'écran Paramètres empilait jusqu'à cinq cartes dans une même
  rubrique, sans recherche ni repère de navigation. Le propriétaire demandait
  une simplification et une reconstruction complète, sans supprimer de réglage.

## Décision

### 1. Rubriques groupées et lisibles

Le menu latéral conserve les **7 rubriques** et leurs identifiants, mais les
présente en trois groupes :

- Configuration : Entreprise, Commerce, Catalogue ;
- Documents & données : Documents, Données ;
- Poste & accès : Équipe, Système.

Chaque entrée porte une icône, un libellé court et une description. Le libellé
historique complet reste le **nom accessible** (`aria-label`) pour ne pas casser
les tests et les repères existants.

### 2. Recherche globale indexée

`src/features/settings/types.ts` expose un index pur (`SETTINGS_CARDS`) et
`searchSettings()` : recherche accent-insensible sur les rubriques, les cartes
et leurs mots-clés (NIF, sauvegarde, crédit, imprimante…). Les résultats
conduisent directement à la rubrique et à la carte concernée. `Ctrl+K` place le
focus dans la recherche.

### 3. Sous-navigation interne

Chaque rubrique affiche des puces vers ses cartes (`Vente`, `Sons`, `Clients`…).
Cliquer une puce fait défiler jusqu'à l'ancre stable `settings-card-<id>` et
met la carte en évidence. Un bandeau collant rappelle la rubrique active.

### 4. Divulgation progressive

Les informations fiscales de l'entreprise (NIF, registre, NIS, article) sont
repliées par défaut et s'ouvrent automatiquement si au moins un champ est déjà
renseigné. Les champs métier restent tous présents et enregistrés par la même
action.

## Conséquences

- Aucune migration, aucun canal IPC : uniquement la présentation et un index
  de recherche pur.
- Tous les composants de section, boutons d'enregistrement et libellés
  (`aria-label` compris) sont conservés.
- Tests : `tests/unit/settings-search.test.ts` et E2E
  `settings-navigation.spec.ts` (rubriques, recherche, sous-navigation).
- `component-smoke` et `navigation-smoke` restent verts.
