# PHASE 3 — Tranches verticales 6-9 + QA runtime + packaging Windows (2026-09-15)

Suite de PHASE_2. Toutes les phases d'implémentation restantes (6→14) sont
clôturées ci-dessous : aucun placeholder, 14/14 modules réels et branchés.

## Completed

### Phase 6 — Stock & achats (UI → use case → domaine → repo → migration → test)

- **Domaine** : `src/domain/inventory/intake-rules.ts` (valorisation
  `Σ(prix×(reçu−abîmé)) + port`, ajustements validés),
  `src/domain/suppliers/supplier-rules.ts` (solde `+= entrée`, paiement sans
  surpaiement).
- **Main** : `electron/ipc/handlers/inventory.repo.ts` (`receiveStockAtomic` :
  entrée + lignes + mouvements + quantités + solde fournisseur + audit = 1 tx ;
  `adjustStockAtomic`), `suppliers.repo.ts` (CRUD + `recordSupplierPaymentAtomic`
  + relevé).
- **UI** : `src/features/stock/StockScreen.tsx` (KPI, alertes bas/rupture,
  nouvelle entrée avec recherche produit, ajustement, fournisseurs + paiement,
  valorisation).
- **Migration 0005** : index stock/fournisseurs + graine
  `app_settings('inventory') = {"allowNegativeStock":false}` (politique stricte
  par défaut, interrupteur dans Paramètres).

### Phase 7 — Proformas (+ retours déjà réels)

- **Domaine** : `src/domain/proforma/proforma-rules.ts` (totaux, transitions
  `draft→sent→converted|cancelled`, remise ≤ sous-total).
- **Main** : `proformas.repo.ts` (création atomique + audit, statuts,
  `convertProformaToSaleAtomic` : réutilise `createSaleAtomic` — stock, solde
  client et facture réelle dans la même transaction).
- **UI** : `src/features/proformas/ProformasScreen.tsx` (devis multi-lignes,
  envoi/annulation, conversion avec montant payé → N° facture).
- Retours : écran réel conservé + historique ; Historique des ventes enrichi
  (recherche facture, **annulation** avec restock, **réimpression ticket**).

### Phase 8 — Finance : dettes, rapports, clôture Z, zakat

- **Main** : `finance.repo.ts` (`listDebts`, `getPeriodReport` : ventes,
  encaissements standalone, charges, remboursements, top 10, dettes, stock ;
  `createDailyClosingAtomic` : `clôture = ouverture + espèces + encaissements −
  dépenses − remboursements`, unicité par date ; `getZakatSources`).
- **Domaine** : `src/domain/closings/closing-rules.ts` (formule + date
  AAAA-MM-JJ) ; zakat existant réutilisé (reporting seul).
- **UI** : `DebtsScreen` (filtres toutes/dues/dépassements, total, **encaissement
  rapide** compte/vente), `ReportsScreen` (KPI période, marge, top produits,
  clôtures + **exports CSV**), `ZakatScreen` (sources SQLite, taux/nisab
  configurables et persistés, hypothèses affichées).
- Dashboard enrichi (top 5 + 8 dernières ventes, SQL borné, zéro historique brut).

### Phase 9 — Pain

- **Domaine** : `src/domain/bread/bread-rules.ts` (total/reste/statuts,
  graphe de retrait `pending→ready→delivered|cancelled`).
- **Main** : `bread.repo.ts` (création atomique + audit, paiements partiels sans
  surpaiement, retraits, **transfert du reste au compte client**).
- **UI** : `BreadScreen` (tableau par date de retrait, commande client/nom
  libre, encaissement, boutons d'état, transfert).

### Transverse (Phases 10-13)

- **IPC** : +27 canaux explicites `domaine.action` (stock, fournisseurs,
  proformas, dettes, rapports, clôtures, zakat, pain, settings, import),
  validateurs Zod, preload + `window.veloria` + client typé étendus. Zéro
  `run-sql`. Handlers manquants ajoutés (`customers.update/statement`,
  `settings.get/save` à clés explicites).
- **Import CSV validé-avant-commit** : `src/domain/import/csv-import.ts` +
  `import.repo.ts` (re-validation main + 1 tx tout-ou-rien, max 5 000 lignes) +
  `CsvImport.tsx` (produits : `nom;prix_vente;prix_achat;quantite;code-barres` ;
  clients : `prenom;nom;tel`), branché sur Catalogue et Clients.
- **Clients** : relevé complet (ventes + paiements + solde), encaissement,
  plafond de crédit à la création.
- **Paramètres** : profil entreprise (tickets/factures), base + intégrité,
  sauvegardes (créer, 5 dernières, **restaurer** avec snapshot), interrupteur
  stock négatif, imprimantes détectées, diagnostics.
- **Perf** : `scripts/quality/verify-perf.mjs` — 10 000 produits : seed 371 ms,
  recherche nom 1 ms (< 500), code-barres 0 ms (< 50), agrégat 0 ms.

### Phase 14 — Release (build + QA runtime + installateurs)

- **3 bugs bloquants trouvés par exécution réelle** (invisibles en
  typecheck/lint/tests) et corrigés — voir `docs/ADR-005-runtime-packaging-fixes.md` :
  1. `dist-electron` CommonJS sous racine ESM → tampon `{type:commonjs}` +
     garde smoke.
  2. Double `ipcMain.handle(printing.printA4)` abortait le startup avant la
     fenêtre → propriété unique par module.
  3. `better-sqlite3` absent du paquet (lock désync, `dev:true`) →
     `dependencies` + lock régénéré + `files` + `asarUnpack`.
- **Boot vérifié 3×** (dev + empaqueté) : `startup.begin → database.opened
  schemaVersion 5 → database.ready → startup.ready`, stderr vide.
- **Artefacts** (`release/`, non commités — `.gitignore`) :
  - `Veloria-PoS-Setup-2.0.0.exe` (NSIS, 87,7 Mo) — SHA-256
    `392FBA9280E245BDC2B74EBE42EEC1DD918B69031E5E00A63F3D926FC2FF012A`
  - `Veloria-PoS-Portable-2.0.0.exe` (87,4 Mo) — SHA-256
    `DE337A539A35FFF355A4B76CADE9E7F8FC525FB7910A4C519151F71177F2F68F`
- Natif : `better_sqlite3.node` pour Electron 37.2.0 (NODE_MODULE_VERSION 136),
  chargé OK dans l'app empaquetée (`database.opened`, base
  `%PROGRAMDATA%/Veloria PoS/Data/Veloria POS DB.sqlite`).

## Files Created/Changed (≈40)

- Domaine : `inventory/intake-rules.ts`, `suppliers/supplier-rules.ts`,
  `proforma/proforma-rules.ts`, `bread/bread-rules.ts`,
  `closings/closing-rules.ts`, `import/csv-import.ts`, + `errors.ts` (codes).
- Main : `handlers/{inventory,suppliers,proformas,bread,finance,import}.repo.ts`,
  `channels.ts`, `validators.ts`, `registry.ts`, `preload.ts`.
- UI : `stock/StockScreen.tsx`, `debts/DebtsScreen.tsx`,
  `reports/ReportsScreen.tsx`, `zakat/ZakatScreen.tsx`, `bread/BreadScreen.tsx`,
  `proformas/ProformasScreen.tsx`, `shared/ui/CsvImport.tsx`, `shell/App.tsx`
  (14/14 réels), dashboard/historique/clients/produits/paramètres étendus,
  `shared/types/ipc-client.ts`, `vite-env.d.ts`.
- Base : `0005_phase6_9_indexes.sql` (0001-0004 immuables).
- Qualité : `tests/unit/phase6-9-rules.test.ts` (12),
  `tests/integration/atomic-slices.test.ts` (4),
  `verify-domain.ts` (17 assertions), `verify-perf.mjs`,
  `verify-migrations.mjs` (0005), `smoke.js` (tampon CJS),
  `stamp-electron-pkg.js`.
- Config : `package.json` (better-sqlite3/bindings en `dependencies`,
  `build:electron` avec tampon), `package-lock.json` régénéré et synchronisé,
  `electron-builder.yml` (`legalTrademarks`, natif inclus), `eslint.config.mjs`.
- Docs : `docs/ADR-004-phases-6-9-slices.md`, `docs/ADR-005-runtime-packaging-fixes.md`.

## Tests (tout vert, 2026-09-15)

- `prettier --check` (code) → OK ; `tsc -b` + `tsc -p tsconfig.electron` → 0 erreur.
- `eslint . --max-warnings 0` → 0 erreur.
- `vitest run` → **6 fichiers, 31/31 OK** (12 nouvelles règles + 4 atomicités).
- `verify-migrations.mjs` → **MIGRATIONS VERIFIED** (5 migrations, CHECK/UNIQUE/FK, 0005).
- `verify-domain.ts` → **DOMAIN VERIFIED** (17 assertions).
- `verify-perf.mjs` → **PERF VERIFIED** (1 ms / 0 ms / 0 ms).
- `vite build` (60 modules) + `build:electron` + `smoke.js` (6/6) → OK.
- Electron réel : `NATIVE OK (electron 37.2.0 / node 22.17.0)` ; app dev +
  app empaquetée → `startup.ready`, stderr vide.
- `electron-builder --win` → Setup + Portable générés, natif inclus
  (`app.asar` + `app.asar.unpacked/.../better_sqlite3.node`).

## Problems (résolus — détails en ADR-005)

1. Boot Electron impossible (CJS vs ESM) — jamais testé avant (binaire manquant).
2. Double handler IPC tuant le startup silencieusement.
3. Natif exclu du paquet (lock désynchronisé + limite `files`/`node_modules`).
4. Outils winCodeSign exigent des symlinks (non-admin) — contourné via cache
   pré-extrait (machine locale) ; rcedit appliqué (métadonnées + icône).
5. Incident fichiers : `package.json` + `package-lock.json` retrouvés tronqués
   à un moment (cause non identifiée — possiblement synchronisation externe) ;
   `package.json` restauré à l'octet près (contenu connu + 1 ligne documentée),
   lock régénéré proprement puis vérifié. Leçon : commiter tôt (fait ci-dessous).

## Decisions

- Voir ADR-004 (tranches) et ADR-005 (runtime/packaging).
- `better-sqlite3`+`bindings` en `dependencies` : règle — tout module requis par
  `dist-electron` au runtime est une dépendance de production.
- Pas de signature de code (aucun certificat) : `signtool` = métadonnées
  uniquement ; à prévoir avant distribution publique.
- Specs `VELORIA_POS_FROM_SCRATCH_MARKDOWN/` et rapports exclus du formatage
  (inchangé depuis Phase 2).

## Remaining Work (hors machine — distribution & terrain)

1. Tester le Setup sur une machine Windows propre : install → vente → crédit →
   retour → backup → restart (persistance) → uninstall (**sans perte**,
   `deleteAppDataOnUninstall:false`) — checklist `15_BUILD_RELEASE_INSTALLER.md`.
2. Impression réelle 80mm + tiroir/balance (adapters prêts, non testés sur
   matériel).
3. Certificat de signature Windows + `publish` (actuellement `[]`).
4. CI (Node 22 + rebuild natif + chaîne qualité du §8) — pipeline à créer.
5. Seed de démonstration optionnel (hors scope : jamais de données d'exemple
   dans le paquet — spec 15).
