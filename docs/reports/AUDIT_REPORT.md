# AUDIT — Inspection ligne par ligne + corrections (2026-09-15)

> **Addendum — réparations radicales (2026-09-18) :** schéma **v20**
> (`0001..0020`, `verify-migrations` vert : 0019 index de recherche,
> 0020 `operation_id` idempotent sur `sale_payments`/`supplier_payments`).
> Canaux morts supprimés (`bread.pickup`, `reports.dashboard` + code associé),
> `sales.cancel` et `closings.*` câblés à l'UI, N+1 clients/OCR éliminés
> (recherche enrichie + `products.matchBatch`), contrats IPC validés côté
> renderer, confirmation non bloquante, noms d'onglets stables, filtres
> historique 18/18. Suite : voir rapport de nettoyage (tests verts).
>
> **Addendum précédent — état au 2026-09-17 :** schéma **v16**
> (16 migrations `0001..0016`, `verify-migrations` vert). Les mentions
> « v5 », « VERIFIED (5) », « 33/33 » et « 46/46 » ci-dessous datent de
> l'audit initial (2026-09-15/16) et sont conservées comme historique.
> Suite actuelle : 158/158 tests verts (27 fichiers).

Audit demandé : composants manquants, code mort/incomplet, imports/dependances,
doublons, comparaison build↔MD, nettoyage profond. **Aucun build applicatif
exécuté** (ni `vite build`, ni `build:electron`, ni `electron-builder`) —
`dist/` et `release/` sont donc **antérieurs à cet audit** et devront être
reconstruits avant toute distribution.

## Méthode

- Lecture intégrale : ~60 fichiers `src/` + `electron/` + configs + tests +
  scripts (dont relecture complète de `registry.ts`, tous les repos, tous les
  écrans).
- `grep` systématiques : usages de chaque export (mort = 0 appelant src +
  tests + scripts + electron), parité canaux IPC (script : **63/63 canaux**
  avec handler + entrée preload, 0 orphelin), chaînes anglaises UI, `void x`,
  `require()` inline, `todayFr`/`Math.round(Number` dupliqués.
- Vérifié sans build : `tsc --noEmit` (renderer + electron), `eslint`
  `--max-warnings 0`, `prettier --check`, `vitest run`, `verify-migrations`,
  `verify-domain`, `verify-perf`, `integrity.js` (base réelle), `smoke.js`.
  Tout vert (voir § Vérifications).

## A. Code mort supprimé (0 appelant vérifié par grep)

| Supprimé                                                         | Preuve / motif                                                                                                                                                                                                             |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/ui/ModulePlaceholder.tsx`                            | plus importé depuis Phase 3 (tous modules réels)                                                                                                                                                                           |
| `src/ports/` (contracts + 4 dossiers vides)                      | `ProductRepository`/`SaleRepository`/`TransactionPort` jamais implémentés ni importés ; architecture réelle = bridge IPC typé                                                                                              |
| `src/shared/types/outcome.ts`                                    | `Paged/Outcome/ok/fail` inutilisés (`ipc-client` a ses propres types)                                                                                                                                                      |
| `src/domain/common/invoice-number.ts`                            | `build*Number` jamais appelés (repos numérotent en SQL) ; import main→domaine impossible sans casser `rootDir` (documenté)                                                                                                 |
| `normalizeBarcode`, `assertUuid` (`ids.ts`)                      | 0 appelant (le charset barcode reste validé par Zod côté main)                                                                                                                                                             |
| `MONEY_SCALE`, `toDzd`, `addMinor`, `subtractMinor` (`money.ts`) | 0 appelant (ni src ni tests)                                                                                                                                                                                               |
| `StockStatus`, `computeStockStatus` (`product-rules.ts`)         | 0 appelant (statuts calculés en SQL main)                                                                                                                                                                                  |
| `landingCostPerUnit` (`intake-rules.ts`)                         | 0 appelant externe                                                                                                                                                                                                         |
| `electron/filesystem/filesystem.service.ts`                      | `pickFolder/ensureDir/openPathSafe/userDataDir` 100 % morts → remplacé par `electron/services/file-ui.ts` (seules fonctions câblées + `openLogsFolder`)                                                                    |
| `public/branding/icon-512x512.png`                               | hash SHA-256 identique à `public/icons/icon-512x512.png`                                                                                                                                                                   |
| `tests/e2e`, `tests/electron`, `tests/fixtures`                  | dossiers vides (aucun test E2E n'existait)                                                                                                                                                                                 |
| Scripts `db:migrate` (+ `migrate.js` inexistant)                 | la migration est automatique au boot (`openDatabase`) ; un CLI dupliquerait le runner. `db:integrity` implémenté pour de vrai (`scripts/database/integrity.js`, lecture seule, testé sur la base réelle : v5, 0 violation) |
| Canal `reports.period` (+ preload)                               | non validé, redondant avec `reports.full`, **0 appelant**                                                                                                                                                                  |
| `void totals` / `void db` / `void getDbPath`                     | statements anti-`noUnusedLocals`, logiques nettoyées                                                                                                                                                                       |

## B. Duplications éliminées

- `todayFr()` copié ×4 (Stock/Dettes/Pain/Dépenses) → `todayUtcDate()` partagé
  (`dates.ts` réduit à cette fonction ; UTC imposé car les requêtes comparent
  `substr(created_at,1,10)` UTC — cf. commentaire).
- `Math.round(Number(x||"0")*100)` ×15 → `dzdInputToMinor()` (`money.ts`,
  **supporte la virgule FR**, couverte par tests + `verify-domain`).
- `new Date(...).toLocaleString("fr-FR")` ×3 → `formatDateTimeFr()` ;
  `format.ts` : ré-export `formatDzd` redondant supprimé.
- `parseMinorDzd` (csv-import) réutilise `dzdInputToMinor`.
- Numérotation facture inline ×2 dans `sales.repo.ts` → `allocateInvoiceNumber()`
  unique (appelée dans la transaction ; lit aussi `invoice_prefix` entreprise).
- `require("node:crypto")` ×5 + `require("electron")` ×3 → imports top-level.
- `toUserMessage` : refactor — Zod→FR, denylist d'erreurs SQLite internes,
  **pass-through des messages métier FR** (avant : `UNKNOWN_ERROR` générique
  qui avalait les messages `Fournisseur/Paiement/Clôture/…`).
- Allow-list navigation dupliquée (`window-manager` vs `security.ts`) →
  `isExternalNavigationAllowed()` unique.
- `createSaleUseCase`/`validateSupplierDraft` morts → **câblés** (validation
  client-side Produits/Fournisseurs) au lieu d'être supprimés.
- Config : alias `@app/@ports/@infra` (inexistants/inutilisés) retirés des 3
  configs en sync ; tokens `@theme` inutilisés retirés ; `extraResources` YAML
  dupliqué fusionné.

## C. Composants manquants ajoutés (écart vs spec 21)

| Écran      | Manquait (spec)                                                                     | Ajouté                                                                                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vente      | client, remise, livraison, état crédit, aperçu/impression                           | sélecteur client + remise %/DZD + livraison + reste-à-payer + **dialogue aperçu 80mm/A4 + impression** ; payé passé en **DZD** (était en centimes — bug UX)                        |
| Catalogue  | edit/archive/filtre catégorie (canaux existaient, UI non)                           | dialogue modification (via use-cases validés), archivage, **catégories** (canaux `categories.*` + filtre + création)                                                               |
| Clients    | edit/archive                                                                        | fiche éditable + archivage (canal `customers.archive`, recherche exclut `deleted_at`)                                                                                              |
| Retours    | choix restock (`/returns/new`)                                                      | checkbox par ligne (était forcé `true`)                                                                                                                                            |
| Dépenses   | edit/filtres                                                                        | modification (canal `expenses.update`) + filtres catégorie/mois                                                                                                                    |
| Stock      | journal, relevé fournisseur (`stock.ledger`, `suppliers.statement` exposés, UI non) | modales journal des mouvements + relevé fournisseur                                                                                                                                |
| Pain       | heure de retrait (colonne existante, jamais saisie)                                 | champ `time`                                                                                                                                                                       |
| Proformas  | remise/livraison (forcés 0)                                                         | champs remise + livraison                                                                                                                                                          |
| Paramètres | logo, déplacement base, journaux, restart                                           | champ `logo_path`, **déplacement réel** (canal `database.relocate` implémenté : checkpoint→copie→vérif→swap→reopen), bouton journaux (`system.openLogsFolder`), bouton redémarrage |
| Sauvegarde | `restore` ne remplaçait rien (validait seulement)                                   | **swap réel + rollback snapshot + contrôle post-restauration**                                                                                                                     |
| Impression | `printA4` stub `{queued:true}`                                                      | **rendu A4 réel + impression** (`buildA4Html`, validateur `printPayloadSchema` sur les 3 canaux)                                                                                   |

Demandes directes : **navigation 14 icônes Lucide** (nom affiché uniquement sur
la page active, `aria-label`+infobulle sinon), **logo** en en-tête
(`icons/icon-192x192.png`, vérifié visuellement) + **icône fenêtre robuste**
(`extraResources/icons`, repli dev — l'ancien chemin `public/` n'existe pas
dans l'asar), **sélecteur 80mm/A4 dans la barre haute** (persisté en
`localStorage`, préférence UI documentée — pas une donnée métier).

## D. Dépendances : 12 paquets inutilisés supprimés (−112 paquets, lock resync)

`@hookform/resolvers`, 6× `@radix-ui`, `class-variance-authority`,
`react-hook-form`, `recharts`, `@playwright/test`, `concurrently`, `wait-on`
(0 import/requête dans tout le repo, `npm install` + prune vérifiés,
`npm ls --omit=dev` propre : 9 deps toutes importées).

## E. Build vs MD (comparaison)

- `dist/` + `release/` datent d'avant cet audit : ~25 fichiers sources modifiés
  - 5 repos + 1 service créés depuis → **rebuild obligatoire** avant usage.
- Couverture spec re-vérifiée : 21 écrans/21 (profil fusionné dans Paramètres,
  assumé), matrice 20/20 (impression ticket physique non testée sur matériel),
  use-cases 08 tous câblés sauf `GetProductHistory` (couvert via journal
  stock) et étiquettes code-barres (reporté — voir Restes).
- `package.json`/`package-lock.json` intacts et synchronisés post-`npm install`
  (garde : `better-sqlite3`+`bindings` en `dependencies`, vérifié dans le lock).

## Vérifications (sans build applicatif)

- `tsc -p tsconfig.json --noEmit` + `tsc -p tsconfig.electron.json --noEmit` → 0.
- `eslint . --max-warnings 0` → 0. `prettier --check` (code) → OK.
- `vitest run` → **6 fichiers, 33/33** (+2 tests : `dzdInputToMinor`, fiche fournisseur).
- `verify-migrations` → VERIFIED (5). `verify-domain` → VERIFIED (19 assertions).
  `verify-perf` → VERIFIED. `integrity.js` (base `%PROGRAMDATA%`) → VERIFIED (v5).
  `smoke.js` → 6/6.

## Addendum 4 — Inspection ×20 vs specs MD 00→26 + correctifs (2026-09-16)

Relecture intégrale des 28 documents MD, comparés point par point. Trouvailles
et corrections radicales (re-vérifiées : tsc×2, eslint, prettier, **46/46**,
5 scripts, parité 71/71) :

- **Dates impossibles acceptées** (mois 13) : `isRealCalendarDate` canonique
  (domaine) + `businessDate` Zod sur 5 schémas mutants + tests (dont cas Nominal).
- **Seconde instance** bootait avant `quit()` → restructuré ; `main.ts`
  découpé (`app-lifecycle`, `crash-recovery`, spec 05).
- **Paiements clampés / retours non bornés / statuts dérivants / ventes
  annulées payables** → gardes + recalcul + rejets (spec 07/08).
- **Restore/relocate** : compat schéma, refus écrasement/downgrade (message
  spec 22 verbatim), purge WAL, snapshot pré-migration, rollback relocation
  avec restauration du chemin.
- **Manquants spec ajoutés** : détails vente, unités, péremption,
  multi-barcodes, solde initial, flag pain, édition fournisseur, Qté abîmée,
  restauration produits/clients, Qté pain + **conversion en vente** (garde
  anti-double-comptage), exports CSV ×5, backup auto+déport+statut+sidecar
  schéma, imprimante configurée+test, soldes tickets, client A4, Enter=scanner,
  pager+chargement 9 listes, debounce, focus-trap, diagnostics spec-23,
  durées démarrage, `SHA256SUMS.txt` + notes, `DATABASE_CORRUPTED`,
  strictness `noUncheckedIndexedAccess` unifiée,
  `disableSourceOfProjectReferenceRedirect` (tests ↔ modules purs).
- **Testabilité** : `receipt-documents` + `numbers` purs (+tests),
  `bridge-shape`, test 0005, clôture/dépenses, perf étendu.
- Faux positifs écartés : `updateProduct` déjà transactionnel.
- Assumé/documenté (`ADR-007`) : E2E Playwright, graphiques, OCR, drawer/balance
  physiques, rétention `audit_log`, échéances dues, signature.

## Addendum — Pont preload cassé en sandbox (bloquant, 2026-09-16)

Écran « Pont applicatif indisponible » **dans Electron lui-même** : sonde CDP
dans l'app empaquetée (`--remote-debugging-port` + `Runtime.evaluate`) :
`Unable to load preload script ... module not found: ../ipc/channels` —
le `preloadRequire` sandboxé refuse les require relatifs, donc
`exposeInMainWorld` ne s'exécutait jamais (le pont n'a jamais fonctionné ;
les tests de boot ne couvraient que le main-process).
Correctif (ADR-006) : preload **bundlé esbuild en un fichier** (canaux
inlinés, seul `require("electron")`), garde-fou `smoke.js`, `sandbox`
conservé, `autoHideMenuBar: true`. Vérification runtime CDP à refaire après
le prochain build + packaging (construction interdite pendant cet audit).

## Addendum 2 — Inspection profonde ×5 + corrections radicales (2026-09-16)

Cinq passes d'inspection (structure/imports, invariants domaine, frontière
IPC/sécurité, logique UI, intégrité runtime), corrections, puis 3 passes de
re-vérification (tsc×2, eslint, prettier, vitest **34/34**, 5 scripts, parité
63/63). Résultat : tout vert, zéro référence restante au code supprimé.

### Faux positif écarté (re-vérifié au lieu de « corriger »)

- `updateProduct` : soupçonné hors-transaction — relu ligne par ligne :
  déjà wrappé en `db.transaction` (UPDATE + DELETE + INSERTs). Aucune touche.

### Code mort supprimé (0 appelant, grep src+tests+electron)

- `electron/hardware/hardware.ports.ts` entier (adapters jamais câblés) ;
  `validationError()` ; `MovementType` ; `assertSaleDecrement` ;
  `stockStatusFor` (statuts calculés en SQL).

### Bugs financiers corrigés à la racine

- **Paiements client clampés silencieusement** (`MAX(0,…)`, `MIN(…)`) :
  garde-fous explicites (lié-vente ≤ reste / standalone ≤ solde), soustraction
  exacte (négatif = avoir explicite), **recalcul `debt_status`/`is_over_limit`**
  (dérive de statut éliminée), **ventes annulées rejetées** (exigence spec 07
  jusqu'ici violée).
- **Retour : remboursement + avoir non bornés** → `assertRefundSplit`
  (domaine + test) + garde repo.
- **Double-clic** : hook `useBusy()` + 24 boutons mutants verrouillés
  (seuls `saveInventory` toggle et `save` zakat, idempotents, exclus).

### Intégrité runtime

- **Seconde instance** : `main.ts` restructuré — sans lock, `quit()` immédiat
  avant tout accès DB/fenêtre (avant : boot complet → contention SQLite).
- **Relocation** : refus `..`, refus écrasement, garde base-manquante,
  purge WAL résiduel (`removeWalCompanions`, corruption silencieuse évitée).
- **Restauration** : mêmes gardes + purge compagnons.
- **Impression** : fenêtres cachées détruites en `finally` (fuite comblée).

### UI

- Badge **dépassement de plafond** dans l'infobar (politique crédit :
  autorisé + signalé, inchangée) ; export CSV vide → message au lieu de
  fichier vide ; raccourcis suspendus quand une modale est ouverte
  (anti-empilement F7/F8 + garde F3–F10/+/− existante).

### Non corrigé (assumé, documenté)

- `audit_log` sans rétention ; étiquettes code-barres ; échéances
  due-soon/overdue ; `saveInventory`/`save` zakat sans busy (idempotents).

## Restes connus (non-bloquants, assumés)

1. Étiquettes code-barres produits (spec `/products`) : pas de template — reporté.
2. Alertes `due soon/overdue` : pas d'échéances (`due_date` jamais saisi) —
   l'écran Dettes couvre dû/dépassements.
3. `window.confirm` natifs (annulation vente, restauration, restart) : fonctionnels.
4. Pas de signature de code (métadonnées rcedit uniquement).
5. `dist/`/`release/` à reconstruire sur demande (bloqué par consigne).
