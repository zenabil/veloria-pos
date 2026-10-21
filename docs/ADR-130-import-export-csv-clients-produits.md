# ADR-130 — Import & export CSV sur les écrans Clients et Produits

## Contexte

Les deux écrans de catalogue étaient **asymétriques** :

| Écran        | Import CSV           | Export CSV                     |
| ------------ | -------------------- | ------------------------------ |
| **Produits** | ✔ (existant, W3/P3) | **✘ manquant**                 |
| **Clients**  | **✘ manquant**       | ✔ (existant, rapport enrichi) |

Un commerçant ne pouvait donc pas **charger** sa liste de clients ni
**sortir** son catalogue (pour un autre logiciel, un audit, une sauvegarde
lisible). La demande propriétaire : « أضف الخاصية والاستيراد والتصدير في
صفحتي العملاء والمنتجات ».

## Décision 1 — l'import clients est une slice verticale complète

Le parseur de domaine existait déjà (`parseCustomersCsv`,
`src/domain/import/csv-import.ts` — format `prénom;nom[téléphone]`,
en-tête optionnel) mais **personne ne l'utilisait** : il manquait tout le
chemin d'écriture.

| Couche      | Ajout                                                               |
| ----------- | ------------------------------------------------------------------- |
| Domaine     | (existant) `parseCustomersCsv` — validation TOTALE avant commit     |
| Repo (main) | `importCustomersAtomic` (`electron/ipc/handlers/import.repo.ts`)    |
| IPC         | canal `customers.import` + `customersImportSchema` (Zod)            |
| Pont        | `preload` (`customers.import`) + `api.customerImport` (renderer)    |
| Portes      | staff-gate `debts` (comme `customers.create`) + licence `customers` |
| UI          | bouton « Import CSV » + champ fichier masqué + confirmation FR      |

**Garanties de l'import** (le main re-valide : la base reste l'autorité) :

- **tout-ou-rien** — une seule ligne invalide ⇒ **aucune** fiche écrite
  (validation complète _avant_ la première insertion, puis UNE transaction) ;
- **unicité du téléphone (E-28)** — le contrôle applicatif
  `assertPhoneAvailable` (exporté de `customers.repo.ts`, **une seule règle**
  pour la création et l'import) donne un message FR clair **avant** l'écriture,
  au lieu du rollback du trigger 0049 ; un téléphone en double **dans le même
  fichier** est refusé de la même façon (sinon le trigger avorterait avec un
  message technique brut) ;
- **idempotence de lot** — `operationId` REQUIS : le même fichier rejoué
  rejoue le compte stocké, aucune fiche en double ;
- **`search_norm` recalculé** (migration 0047) ⇒ le client importé est
  trouvable par la recherche ;
- **aucun crédit créé** — l'import ne fait que des fiches : ni solde, ni
  plafond, ni jour de règlement (l'import n'est pas un flux d'encoursement).

## Décision 2 — l'export produits exporte TOUTES les pages du filtre

Comme l'export clients (existant) : exporter la seule page affichée serait
une **troncature silencieuse**. Le parcours des pages est borné en
concurrence (`runBulk`) avec progression affichée (A-15), et le filtre
courant (recherche, catégorie, stock, archivés) est respecté.

Contenu : nom, catégorie, unité, prix d'achat, prix de vente (formatés DZD),
quantité, stock mini, code-barres, statut.

## Décision 3 — deux formats, deux rôles (explicite)

- **l'export est un RAPPORT** (lisible dans Excel, lisible par un humain) ;
- **l'import est un flux de DONNÉES** (format documenté dans l'infobulle du
  bouton : `prénom;nom;téléphone` pour les clients,
  `nom;vente;achat;quantité[;code-barres]` pour les produits) ;
- un export ré-importé n'est **pas** un aller-retour : il échoue proprement
  (format ou téléphone déjà utilisé ⇒ message FR, **rien n'est écrit**)
  plutôt que de créer des doublons.

## Décision 4 — les contrats gelés bougent (et sont documentés)

| Contrat                       | Avant | Après   | Pourquoi                         |
| ----------------------------- | ----- | ------- | -------------------------------- |
| canaux IPC                    | 177   | **178** | `customers.import`               |
| `FROZEN_SCHEMA_COUNT`         | 121   | **122** | `customersImportSchema`          |
| `FROZEN_EXPORT_COUNT`         | 127   | **128** | idem                             |
| `FROZEN_SCHEMA_TOTAL` (op-id) | 121   | **122** | idem                             |
| `operationId` REQUIRED        | 43    | **44**  | l'import est une mutation de lot |

Snapshot `ipc-channels.json` mis à jour dans le **même** commit (la garde
`ipc-channel-inventory` compare l'ensemble traité au snapshot, octet pour
octet).

## Tests

- `tests/integration/customers-import.test.ts` (**nouveau**, 6 cas) : import
  nominal (fiches + `search_norm` + recherche + audit + aucune dette),
  tout-ou-rien, téléphone en double dans le fichier, téléphone déjà en base
  (E-28), idempotence de lot, fichier vide / lot hors bornes ;
- `tests/unit/import-export-ui.test.ts` (**nouveau**, 5 cas) : garde
  statique du câblage renderer (bouton, parseur, appel IPC, export,
  parcours des pages) + interdiction d'importer SQLite/Node dans l'UI ;
- `parseCustomersCsv` était déjà couvert (`phase6-9-rules`,
  `domain-rules-coverage`).

## Portes

`format:check` 0 · `tsc -b` 0 · `typecheck:electron` 0 · `eslint
--max-warnings 0` 0 · `knip` 0 · `vitest` 0 · `test:db` 0 ·
`verify:migrations/domain/perf` VERIFIED · `verify:fr` 0 · `license:scan` 0 ·
`test:coverage` EXIT 0 · `build` + `build:electron` ✓.

## Rollback

`git revert <sha>` — le canal et le schéma sont additive (aucun canal
retiré, aucune migration) : le revert est un simple retour de code.
