# Matrice de couverture E2E — Veloria PoS

Date : 2026-10-23.

## Écrans (16 + caisse)

| Écran                  | Spec principal                                          | Smoke nav | Smoke composants | Statut      |
| ---------------------- | ------------------------------------------------------- | --------- | ---------------- | ----------- |
| Caisse (sell)          | `sale-flow.spec.ts`, `cashier-amount-mode.spec.ts`      | oui       | oui              | couvert     |
| Tableau de bord        | `window-chrome.spec.ts` (nav)                           | oui       | oui              | partiel     |
| Catalogue (products)   | `csv-import-export.spec.ts`                             | oui       | oui              | partiel     |
| Clients                | `customer-invoice.spec.ts`, `csv-import-export.spec.ts` | oui       | oui              | couvert     |
| Fournisseurs           | `scan-flow.spec.ts`                                     | oui       | oui              | partiel     |
| Stock                  | `stock-backup.spec.ts`, `factory-reset.spec.ts`         | oui       | oui              | couvert     |
| Historique             | —                                                       | oui       | oui              | à renforcer |
| Retours                | `credit-return.spec.ts`                                 | oui       | oui              | couvert     |
| Dépenses               | —                                                       | oui       | oui              | à renforcer |
| Dettes                 | —                                                       | oui       | oui              | à renforcer |
| Rapports               | `pdf-export.spec.ts`                                    | oui       | oui              | partiel     |
| Devis (proformas)      | —                                                       | oui       | oui              | à renforcer |
| Impression (templates) | `pdf-export.spec.ts`                                    | oui       | oui              | partiel     |
| Zakat                  | —                                                       | oui       | oui              | à renforcer |
| Paramètres             | `stock-backup.spec.ts`                                  | oui       | oui              | partiel     |
| Licence                | `license-activation.spec.ts`                            | oui       | oui              | couvert     |

## Dialogues

- Produits (création/édition) : ouverture/fermeture smoke.
- Clients (création/édition) : ouverture/fermeture smoke.
- Retours (client/fournisseur) : `credit-return.spec.ts`.
- Stock (mouvements/import) : `stock-backup.spec.ts`.
- Fournisseurs (commande) : `scan-flow.spec.ts`.

## IPC critiques

Couverts indirectement par les flux E2E ci-dessus ; canaux individuels couverts par `verify:domain` et tests unitaires DB.

## Suites smoke

- `navigation-smoke.spec.ts` : clic sur chaque entrée sidebar, attente rendu, assertion absence de crash.
- `component-smoke.spec.ts` : rendu par écran + clic boutons d'ajout + fermeture dialogue + absence console errors.

## Isolation données

Helpers `makeIsolatedDirs` + `PROGRAMDATA`/`userData` temporaires. Aucune base production touchée.

## Dernière exécution

2026-10-23 — **45 tests : 42 réussis, 3 ignorés, 0 échec** (relais miroir `:8100` lancé pour `full-loop-client`). Les 3 ignorés sont l'installateur NSIS (UAC hors session Playwright) et deux tests de chrome de fenêtre (drag/redimensionnement non supportés par l'environnement).
