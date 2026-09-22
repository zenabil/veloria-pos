# REPAIR_CHANGELOG — Veloria POS (racine → implémentation → preuve)

> Un bloc par modification. `Migration` = `—` si sans migration.
> Convention statuts : VERIFIED (preuve exécutive) / DOCUMENTED (décision).

## P0-01 — Retours : numéros pré-alloués (0024 + repo)

- **Issue** : `0023` (`trg_*_number_required`) ABORT tout `returns.create`
  (INSERT sans numéro, UPDATE après). `atomic-slices` 8/13.
- **Root Cause** : invariant `NOT NULL à l'INSERT` incompatible avec
  numérotation dérivée de l'`id`.
- **Old** : INSERT sans `return_number` + `UPDATE RET-C/S-<id>`.
- **New** : séquences `return_customer/return_supplier` (amorcées
  `MAX(id)+1`) + `allocateReturnNumber()` dans la tx + INSERT direct +
  retry `UNIQUE` miroir factures ; `DROP` des 2 triggers (UNIQUE = garantie).
- **Files** : `database/migrations/0024_return_number_sequences.sql` (nouveau),
  `electron/ipc/handlers/returns.repo.ts`.
- **Migration** : 0024 (0001..0023 intactes).
- **Tests** : `atomic-slices` 13/13, `fifo-layers` 13/13,
  `root-invariants` +1 (0024), `verify-migrations` 24/24.
- **Verification** : suites ci-dessus PASS. **VERIFIED.**

## P0-02 — Fixtures sans `code` (contrat 0023)

- **Issue** : 5 échecs `atomic-slices` + 3 suites intégration (`code` requis).
- **Root Cause** : fixtures SQL directes antérieures au contrat (le repo
  fournit toujours `code`).
- **Old/New** : `INSERT suppliers` + `code FOU-*` ; test 0008 exclut aussi
  0023 (schéma partiel).
- **Files** : `tests/integration/atomic-slices|fifo-layers|intake-selling-price|history.test.ts`.
- **Tests** : suites 13/13, 13/13, 8/8, 2/2. **VERIFIED.**

## P1-01 — Politique fenêtres unifiée + P3 print `will-redirect`

- **Issue** : garde webview cantonnée à `createMainWindow` ; print sans redirect.
- **Root Cause** : duplication par fenêtre au lieu d'une politique.
- **Old/New** : `hardenedWebPreferences()` + `secureWindow()` + garde globale
  au module ; appliqué main/recovery/license/print (+`webviewTag:false`).
- **Files** : `electron/main/window-manager.ts`, `electron/printing/printing.service.ts`.
- **Tests** : `typecheck:electron`, lint, E2E `window-chrome` 6/8 + 2 skips natifs. **VERIFIED.**

## P2-01 — Gates IPC (`categories.list`, `app.diagnostics`, `selectLogo`)

- **Issue** : lectures/écritures sensibles non classées.
- **Root Cause** : matrice incomplète.
- **Old/New** : `categories.list` → PAGE `products|stock|reports` (3 appelants
  exacts) ; `app.diagnostics` → PAGE `settings` (appelant unique) ;
  `selectLogo` → `requireLicensedMutation` (effet disque).
- **Files** : `electron/ipc/registry.ts`.
- **Tests** : license E2E 4/4. **VERIFIED.**

## P2-02 — Gates dette généralisées (déjà en place, vérifiées)

- `returns.create` (credit>0), `bread.create` (partiel), `bread.transfer`,
  `proformas.convert`/`bread.convert` (lecture DB) → `debt-management`
  (+`partial-payments`). E2E `credit-return` 2/2. **VERIFIED.**

## P4/P5/P6 — Chemins centraux + DB path

- **Issue** : `includes("..")`, `endsWith`, `mkdir` aveugle, double deny-list.
- **Root Cause** : validation éparse sans `realpath`.
- **Old/New** : `assertSafeUserFolder()` unique (absolu, anti-`\0`/UNC/
  racine, deny-list 6, symlink + parents) ; `openPathSafe`/`openLogsFolder`
  (`realpath`, égalité stricte logs) ; `getConfiguredDbPath` strict ;
  `persistDbPath` atomique (tmp→rename) ; `BACKUP_EXPORT_DENIED` supprimée.
- **Files** : `electron/security/security.ts`, `electron/services/file-ui.ts`,
  `electron/database/database-path.service.ts`, `electron/backup/backup.service.ts`,
  `electron/ipc/registry.ts` (relocate).
- **Tests** : E2E backup/restore + installer (données conservées). **VERIFIED.**

## P7-01 — Money/quantités centrales

- **Issue** : prix sans plafond, quantités sans décimales aux frontières.
- **Old/New** : `moneyMinor` (≤1e9) sur `saleItem`/`printLine`/`productCreate` ;
  `quantity` (finie, >0, ≤1M, 3 décimales, même règle que `quantity.ts`) ;
  `stock.products` 500→200 (politique 200 max).
- **Files** : `electron/ipc/validators.ts`.
- **Tests** : `stock.test` (200/201), domaines, full suite. **VERIFIED.**

## P7-02 — `productUpdate` honnête + `expenses.delete` idempotente

- **Issue** : `operationId` exigé puis ignoré (update) ; delete non rejouable.
- **Old/New** : update sans `operationId` (idempotente par valeur, documenté) ;
  `expenseDeleteSchema{operationId?}` + claim/peek `expenses.delete` + renderer
  envoie un UUID figé.
- **Files** : `electron/ipc/validators.ts`, `registry.ts`,
  `electron/ipc/handlers/expenses.repo.ts`, `src/features/expenses/ExpensesScreen.tsx`.
- **Tests** : `expenses.test` 4/4. **VERIFIED.**

## P7-03 — Manager : renew/capabilities (+ bug legacy trouvé par test)

- **Issue** : `term` sans fin signable ; `features:[]` = wipe ; `pages:null`
  legacy rejeté (bloquait les vieilles licences — trouvé par le nouveau test).
- **Old/New** : refine fin-requise ; `featuresNonEmpty` (≥1) ;
  `pages.nullable()`.
- **Files** : `license-manager/ipc/validators.ts`.
- **Tests** : `root-repair` +2, `license-manager` 4/4, `typecheck:manager`. **VERIFIED.**

## P8 — Audit : 20+ mutations tracées + identités liées

- **Issue** : paiements/créations/transitions invisibles dans `history`.
- **Old/New** : `audit_log` ajouté (voir §8 du rapport) ; `product.created` et
  `expense.created` liés à l'`operationId` réel (P20) ; créations en tx.
- **Files** : 10 repos (`customers/sales/suppliers/products/expenses/
proformas/bread/finance/company/settings/import`).
- **Tests** : suites métier (clients, catalogue, expenses, bread, proformas,
  history UNION 2/2). **VERIFIED.**

## P9 — `verify-migrations` complet

- **Issue** : 0014/15/16/19/21 non vérifiés, 0012 dupliqué, pas de garde
  doublons/trous.
- **Old/New** : +13 assertions, dédupe, gardes noms/doublons/trous,
  `trg23` 6/8 + absence des 2 abandonnés, bloc 0024 (séquences + INSERT direct).
- **Files** : `scripts/database/verify-migrations.mjs`.
- **Tests** : `MIGRATIONS VERIFIED` (24/24 + 40 assertions). **VERIFIED.**

## P10 — Manager pipeline + intégrité

- **Issue** : manager hors scan/intégrité/smoke ; renderer non typé.
- **Old/New** : `package:manager` += scan+sign ; `sign-manager-integrity.mjs`
  (21 fichiers) ; `integrity-check.ts` + gate démarrage (fail-closed
  packagé, skip dev) ; `extraResources license` ; `smoke.js` section manager ;
  `tsconfig.manager.json` inclut le renderer ; `insertLicenseRecord` unifié ;
  `updateEnvelope/setStatus` supprimés (0 appelant).
- **Files** : 7 fichiers (voir §8 rapport).
- **Tests** : `typecheck:manager`, `license:scan` 357 fichiers, `smoke`
  13+5 lignes, `license-manager` 4/4. **VERIFIED.**

## P11 — OCR/thermique/logo/pagination

- **Issue** : aperçu 15 Mo via IPC ; PDF sans timeout ; `thermalHtml` partiel ;
  logo polyglotte ; `stock.products` 500.
- **Old/New** : vignette JPEG 800 px ; `OCR_PDF_TIMEOUT_MS` 60 s +
  `OCR_MAX_PDF_CHARS` 200 k ; `escapePreText` central ; `assertLogoMagic`
  (PNG/JPEG) lecture+stockage ; pagination 200.
- **Files** : `ocr-files.ts`, `ocr-pdf.ts`, `receipt-documents.ts`,
  `printing.service.ts`, `logo.ts`, `validators.ts`.
- **Tests** : `ocr-*` 14/14, `documents` 21/21, `root-repair` (CSV/magie),
  `logo` 5/5 (+polyglotte), `stock` 10/10. **VERIFIED** (concurrence OCR :
  code + revue, pas de charge réelle mesurée — voir risques).

## P12 — Nettoyage documenté

- **Issue** : alias `printing.testPage`, dossiers vides, `BarChart` NaN,
  flash Dashboard, helpers morts.
- **Old/New** : alias retiré (canal intact, 0 appelant) ; `routes`/`providers`
  supprimés ; `BarChart` neutralise non-finis ; `Dashboard` chargement≠vide ;
  `licenses.ts` morts supprimés ; `bindings` conservé (transitif, documenté).
- **Tests** : typechecks + full suite. **VERIFIED.**

## BL-03 — Manifeste incompris en packagé (trouvé par l'E2E installeur)

- **Issue** : `TAMPER` au boot installé (`migrations` illisible sous
  `app.asar/...`).
- **Root Cause** : mon extension du manifeste (migrations/icons/ocr) sans
  étendre le résolveur (qui ne connaissait que `resources/`).
- **Old/New** : `resolvePackagedAbs()` (dist→asar, `resources/`→resources,
  `database/`→resources, `public/icons/`→resources/icons) + test unitaire.
- **Files** : `electron/licensing/integrity.ts`, `tests/unit/root-repair.test.ts`.
- **Tests** : `root-repair` 15/15, `package:win` + `installer.spec` 1/1. **VERIFIED.**

## E2E — Fixtures et spec

- **Issue** : licence E2E sans capabilities (preview/crédit/retours/backup
  refusés par conception) ; phase réinstall attendait l'activation malgré
  l'état conservé.
- **Old/New** : features complétées (10, documentées) ; phase 5 →
  `launchIsolatedApp`.
- **Files** : `tests/e2e/helpers.ts`, `tests/e2e/installer.spec.ts`.
- **Tests** : 21 PASS + 2 SKIP natifs. **VERIFIED.**

## Contrat changé légitimement (tests alignés, pas masqués)

- `history.test` (1000→200), `stock.test` (500→200), `logo.test` (fixtures à
  magie réelle + test polyglotte), `atomic-slices`/`fifo`/`intake`/`history`
  fixtures (`code` requis), test 0008 (exclut 0023 : schéma partiel).
  Chaque alignement correspond à un contrat réellement durci. **VERIFIED.**

---

# PHASE RADICAL REPAIR (2026-09-19) — P0 → P1 → P2, zéro-régression, fail-closed

> Chaque bloc : Issue / Root Cause / Old / New / Files / Migration / Tests /
> Verification. Convention : VERIFIED (preuve exécutive) / DOCUMENTED.

## RR-H-1 - Frontière monétaire unique (SafeInteger + plafonds)

- **Issue** : `isInteger` seul, pas de `isSafeInteger`, cumuls non gardés —
  facture volumineuse > MAX_SAFE_INTEGER = précision perdue silencieuse ;
  `dzdInputToMinor` rendait NaN comme valeur « valide ».
- **Root Cause** : pas de frontière centrale, contrôles partiels par module,
  accumulation non gardée ; Zod bornait l'entrée mais pas le cumul domaine.
- **Old/New** : `assertSafeMinor/assertSafeTotal/addSafeMinor/sumSafeMinors`
  - `MAX_MINOR_SINGLE=1e9` (miroir IPC) + `MAX_MINOR_TOTAL=1e11` +
    `parseDzdInputStrict` (jamais NaN) ; 13 modules migrés (sales, bread,
    proforma, intake, returns, product, fifo, closings, suppliers, debts,
    csv-import strict, OCR MAX 1e9 + négatif→null, zakat chemin vivant
    `features/zakat/types.ts:computeZakatLocal` + try/catch affichage).
    Constat d'audit : `domain/finance/zakat.ts` n'existe pas dans l'arbre
    (doublon fantôme) — QA `verify-domain` corrigé vers la frontière.
- **Files** : `src/domain/money/money.ts` + 13 modules + `features/zakat/*`
  (3 fichiers) + `scripts/quality/verify-domain.ts`.
- **Migration** : `-`. **ADR** : ADR-028.
- **Tests** : `tests/unit/money-safety.test.ts` (10, nouveau) ; full suite
  50/332 PASS ; `verify-domain` + `verify-perf` PASS. **VERIFIED.**

## RR-H-2 - return_number NOT NULL (0025)

- **Issue** : après 0024, `UNIQUE` seul — SQLite autorise NULL multiples.
- **Root Cause** : garantie UNIQUE ≠ NOT NULL ; triggers BEFORE impossibles.
- **Old/New** : backfill déterministe `RET-C/S-%05d(id)` + rebuild
  `returns`/`supplier_returns` avec `NOT NULL` (données/FK/CHECK/UNIQUE/
  index préservés, vérifié FK=0) + 4 triggers garde INSERT/UPDATE FR.
- **Files** : `database/migrations/0025_return_numbers_not_null.sql` (nouveau),
  `scripts/database/verify-migrations.mjs` (+5 assertions).
- **Migration** : 0025 (0001..0024 intactes).
- **Tests** : `verify-migrations` 26/26 ; `repair-hardening` (bypass NULL
  INSERT+UPDATE+duplicata). **VERIFIED.**

## RR-H-3 - État licence tamper-evident (ancre + monotonie)

- **Issue** : suppression `license-state.dat` → retour UNACTIVATED, puis
  rejeu vieille licence + rollback horloge ; `lastSeen` maj en mutation
  seule (gel par lecture).
- **Root Cause** : preuve unique, sans monotonie, sans second magasin.
- **Old/New** : état v2 (`firstSeenUtc/monotonicSeq/integrityTag` sha256,
  v1 migrée) + ancre indépendante SQLite `app_settings.license_anchor` +
  `suppression → TAMPER_DETECTED` (fail closed) + rejet copie ancienne
  (seq) / remplacement (licenseId) + touch throttled 60s AUSSI en lecture +
  `firstSeen` préservé au renouvellement + legacy `pages==null` refusé après
  cutoff 2026-09-01 (grand-père avant) + `NOT_YET_VALID` documenté conservé
  (contrat 12 états).
- **Files** : `electron/licensing/secure-state.ts`, `license-anchor.ts`
  (nouveau), `license-service.ts`, `protocol.ts`, `prod-deps.ts`,
  `tests/e2e/helpers.ts` (licence E2E à pages explicites — contrat actuel).
- **Migration** : `-` (état auto-migré).
- **Tests** : `tests/unit/license-tamper.test.ts` (10, nouveau : suppression,
  remplacement, rollback, tag, rejeu, horloge, lecture-touch, legacy ±cutoff)
  ; 46 tests licence PASS ; E2E `license-activation` 4/4. **VERIFIED.**

## RR-M-1 - Idempotence proforma (renderer)

- **Issue** : `newOperationId()` à chaque appel → retry = doublon potentiel
  (main déjà idempotent via `idempotency_keys`, mais jamais la même clé).
- **Root Cause** : identité d'opération non figée côté dialogue.
- **Old/New** : `proformaOperationKey(customerId, lines)` pure + testable
  (`src/features/sales/proforma-op.ts`) ; `SellScreen` fige l'UUID par
  contenu, le rejoue au retry, le réinitialise au succès.
- **Files** : `proforma-op.ts` (nouveau), `SellScreen.tsx`.
- **Tests** : `repair-p1.test.ts` (stabilité clé). **VERIFIED.**

## RR-M-2 - operationId caller-owned généralisé

- **Issue** : `randomUUID()` dans les handlers (delete/imports) masquait
  l'identité retry.
- **Root Cause** : opération métier ≠ requête IPC, mais un seul UUID interne.
- **Old/New** : `suppliers.delete/deleteMany`, `proformas.delete`,
  `products/customers.import` exigent l'UUID du caller (schémas) + repos
  `peek/claim/store` (retry rejoue le stocké) + audit `operationId` réel +
  6 call-sites UI. Purs updates (bread/proforma/status, setDueDate,
  company, zakat, categories+UNIQUE) classés PURE/SAFE-BY-CONSTRAINT :
  sans UUID, documenté. `registry handle()` : `operationId` log → renommé
  `requestId` (anti-confusion).
- **Files** : `validators.ts`, `registry.ts`, `suppliers/proformas/import.repo`,
  4 écrans/dialogues, `tests/e2e` inchangé (E2E PASS).
- **Tests** : `update-operationid.test.ts` (réécrit, 7), `repair-hardening`
  (replay trick). **VERIFIED.**

## RR-M-3 - Contrats honnêtes (update sans operationId)

- **Issue** : `supplierUpdate/expenseUpdate` exigeaient un UUID ignoré par
  les repos (faux contrat).
- **Old/New** : `.omit({ operationId })` comme `productUpdateSchema` (P18) ;
  Zod strip = vieux renderers compatibles ; call-sites UI nettoyés.
- **Files** : `validators.ts`, `SupplierDialogs.tsx`, `ExpenseDialogs.tsx`.
- **Tests** : contrat verrouillé (sans UUID accepté, résiduel ignoré). **VERIFIED.**

## RR-M-4/M-5 - DB défensive + révocation crédit (0026, ADR-027)

- **Issue** : trigger ventes UPDATE-only (bypass INSERT) ; outstanding
  UPDATE OF-only ; révocation crédit avec dette = état indéfini.
- **Old/New** : 0026 = `trg_sales_no_negative_total_ins` +
  2× outstanding INSERT + `trg_customers_credit_revoke_guard`
  (révocation refusée si dû > 0, FR ; règlement jamais bloqué).
- **Files** : `0026_defensive_invariants.sql` (nouveau), `docs/ADR-027-*`,
  `verify-migrations.mjs` (+4 assertions).
- **Migration** : 0026. **Tests** : `verify-migrations` + `repair-hardening`
  (bypass + révocation soldée/non-soldée). **VERIFIED.**

## RR-M-6/M-7/M-8 - Stock, limites, overdue

- **M-6** : `applyStockDelta` fail-closed par défaut (`{allowNegative}` opt-in
  explicite) ; vérifié : seule porte le négatif = `sales.create`
  (`allowNegativeStock` unique, repo:185 + `consumeLayers(oversell)`) ;
  adjust = set absolu ≥ 0. `stock-rules.ts`. **VERIFIED** (`repair-p1`).
- **M-7** : limites unifiées (quantité 1M/3dec + money) : bread, proforma,
  intake (damaged), product (quantités + barcode 64), csv-import (strict +
  quantités), FIFO (coûts gardés). **VERIFIED** (suite 332).
- **M-8** : `overdue` implémenté (`due_date < businessDate && dû > 0`,
  rétro-compatible sans dates) — `debt-rules.ts`. **VERIFIED.**

## RR-M-9/M-10 - Backup streaming + noms + rotation horloge-sûre

- **Issue** : `sha256File` charge tout en RAM ; noms timestamp-only
  (collision même-ms) ; rotation sur mtime (rollback horloge = prune faux).
- **Old/New** : hash streaming 64K (`backup.service` + miroir `integrity.ts`) ;
  suffixe aléatoire 6-hex ; `listBackups` ordonné sur sidecar `createdAt`
  (mtime = repli si sidecar absent/corrompu, jamais caché).
- **Files** : `electron/backup/backup.service.ts`, `electron/licensing/integrity.ts`.
- **Tests** : E2E `stock-backup` 3/3 (backup/restore réels) + `verify-perf`
  (VACUUM 551ms). **VERIFIED.**

## RR-Print/OCR - Fail-closed impression + erreurs FR

- **Print §20** : `assertConfiguredPrinterAvailable` — imprimante CONFIGURÉE
  introuvable → refus FR explicite (plus de repli silencieux) ; défaut
  système inchangé si rien configuré. 5 handlers print. **VERIFIED** (E2E
  aperçu sans imprimante PASS).
- **Labels §21** : plafond 200 AU TOTAL vérifié AVANT expansion (déjà
  BL-24 ; commenté + verrouillé). **DOCUMENTED.**
- **OCR §22/23** : `failed()` ne fuit plus `err.message` brut (FR mappés +
  fallback) ; `MAX_MINOR` 1e12 → 1e9 (aligné IPC) ; négatif → null ;
  `ocr.service` sans écriture DB vérifié (grep). **VERIFIED.**

## RR-PERF - Fingerprint mémoïsé + cache intégrité (cause racine E2E)

- **Issue** : `getHardwareFingerprint()` = 7 fils (reg+wmic×3+powershell) =
  **4207 ms par IPC gardé** mesuré (wmic lent Win11) → search 3.7s, create
  7.4s → E2E timeouts.
- **Root Cause** : identité immuable recalculée à chaque garde.
- **Old/New** : mémoïsation processus (`clearFingerprintCache` tests) +
  cache verdict `ok` 60s (clé = clé+racine+mtime manifeste ; `tampered`/
  `missing` jamais cachés) + streaming `integrity:sha256File`.
- **Files** : `fingerprint.ts`, `integrity.ts`.
- **Tests** : E2E `sale-flow` 4/4 (1.7m vs 4 échecs/6.9m) ; full E2E 21+2skip ;
  `verify-perf` seuils OK. **VERIFIED.**

## RR-P2 - Nettoyage + durcissement résiduel

- **Supprimé** : `normalizeUserPath`, `realPathBestEffort` (inlinés morts).
- **Conservé documenté (réservé/vivant, vérifié multi-dimensions)** :
  `validateReturnLines/*` (porte `verify-domain`), `parse*Csv` (tests +
  canaux import vivants), 14 wrappers IPC (canaux enregistrés = API
  réservée), `bindings` (transitif better-sqlite3 ; retrait = regen lock +
  rebuild natif, effet nul), `[data-theme=light]` (réservé explicite),
  `categories.create` sans UUID (UNIQUE(name) fail-closed),
  `deviceBinding=false`/`maxDevices` (choix vendor explicite, loggé),
  `NOT_YET_VALID` (contrat 12 états conservé).
- **Contrat changé légitimement** : `update-operationid`, `suppliers`,
  `atomic-slices` (exclusions 0025/0026 : chaîne partielle), E2E helpers
  (pages explicites). Assertions jamais affaiblies. **VERIFIED.**

## RR-Config - `npm run lint` VERT (était rouge/timeout)

- **Issue** : 2 `.cjs` hors project-service + cap 8 fichiers + 1 config
  manquante + erreurs préexistantes (protocol/public-key/execCommand/
  forward-compat) + mes 15 nouvelles.
- **Old/New** : bloc `**/*.cjs` dédié (require/return-type off, globals
  node), `maximumDefaultProjectFileMatchCount=20`, `vite.license-manager`
  ajouté, 4 disables justifiés (données adverses/forward-compat/clipboard),
  `public-key`/`SettingsSectionsB` restructurés sans changement, return
  types tests, `no-empty` → gardes explicites.
- **Tests** : `npm run lint` EXIT 0 (première fois mesurée). **VERIFIED.**

## RR-Build/Packaged - Runtime réel vérifié

- `npm run build` + `build:electron` + `package:win` (Setup+Portable signés)
  - `SHA256SUMS` + `smoke` + `installer.spec` 1/1 sur installeur FRAIS
    (l'ancien échouait — obsolète, pas une régression) + full E2E 21 PASS +
    2 SKIP. **VERIFIED.**

---

## RR-ICONS - Nouvelles icônes POS + License Manager (2026-09-19)

- **Demande** : appliquer les 2 visuels `resources/brand-sources/` (ex-`nv icons/`, POS = panier+ticket,
  Manager = panier+clé) aux deux applications + rebuilds d installation
  sans problèmes.
- **Root Cause (séparation manquante)** : les deux apps partageaient le même
  `public/icons/icon.ico` (POS + Manager) ; BMP NSIS d ancienne marque.
- **Old/New** :
  - `public/icons/icon.ico` régénéré depuis `veloria pos.jpg`
    (7 entrées PNG 16→256, vérifiées structure magique + tailles).
  - `public/icons/manager-icon.ico` (nouveau, même gabarit) depuis
    `veloria license manager.jpg` ; `electron-builder.license-manager.yml`
    (icon/installerIcon/uninstallerIcon) pointe dessus — yml POS inchangé.
  - `icon-192/512/1024.png` régénérés (favicon + WindowChrome + sidebar,
    servis via `dist/icons`).
  - `installer-sidebar.bmp` (164x314 24bpp, logo entier letterboxé, texte
    intact) + `installer-header.bmp` (150x57, bande emblème) régénérés —
    aperçu visuel validé (header parfait, sidebar corrigée après rognage
    "ELOR" constaté visuellement).
  - Générateur/vérificateur : script PowerShell/.NET (hors repo, temp) ;
    sauvegardes préalables des 6 anciens fichiers (restaurables).
- **Files** : `public/icons/*` (7), `electron-builder.license-manager.yml`.
  Sources conservées dans `resources/brand-sources/` (ex-`nv icons/`, non empaquetées — `files` en allowlist).
- **Migration** : `-`.
- **Tests** : structure ICO/PNG/BMP + visuel ; `secret-scan` OK ;
  `smoke` OK ; manifest resigné 98 fichiers ; `package:win` +
  `package:manager` (Setup+Portable signés) + `SHA256SUMS` ;
  icônes EXTRAITES des 2 Setup vérifiées visuellement (POS ≠ Manager) ;
  E2E `installer` 1/1 + `sale-flow` 4/4 sur builds FRAIS. **VERIFIED.**

---

## RR-MGR-INTEGRITY - Manager packagé : « fichier manquant resources/license/public.key » (2026-09-19)

- **Issue** : au lancement du License Manager INSTALLÉ/PORTABLE, boîte
  `Intégrité compromise (...) fichier manquant resources/license/public.key`
  puis sortie — outil vendor inutilisable en packagé (dev OK).
- **Root Cause** : divergence de disposition : le builder place
  `resources/license/**` en extraResources HORS asar
  (`<resources>/license/`), mais `checkManagerIntegrity()` résolvait toutes
  les entrées du manifeste jointes à la racine asar
  (`<asar>/resources/license/public.key` inexistant). Le POS n est pas
  affecté (`resolvePackagedAbs` route déjà `resources/` → resourcesPath,
  prouvé par E2E activation).
- **Old/New** : `resolveFileAbs()` dans `integrity-check.ts` — préfixe
  `resources/license/` → `process.resourcesPath/license/` (miroir POS),
  autres entrées jointes à la base asar comme avant.
- **Files** : `license-manager/main/integrity-check.ts`.
- **Migration** : `-`.
- **Tests** : `typecheck:manager` + lint OK ; `package:manager` (Setup+
  Portable signés) ; lancement RÉEL du portable : fenêtre principale
  `Veloria License Manager` sans boîte d erreur (échec = sortie, donc
  fenêtre = intégrité OK) ; `SHA256SUMS` régénéré ; `smoke` OK. **VERIFIED.**

---

## RR-INSTALLDIR - Dossier d install : C:\Program Files, modifiable (2026-09-19)

- **Demande** : défaut `C:\Program Files` + page dossier modifiable.
- **Old/New** : `perMachine: true` dans `electron-builder.yml` (POS) +
  `electron-builder.license-manager.yml` (Manager). Chaîne prouvée du
  template : `INSTALL_MODE_PER_ALL_USERS_REQUIRED` + défaut
  `$PROGRAMFILES64\Veloria\Veloria PoS` (constante shell, robuste hors-C:) +
  `UAC_RunElevated` si non-admin + page dossier (oneClick:false +
  allowToChangeInstallationDirectory) + réutilisation HKLM InstallLocation
  (GUID stable via appId inchangé). Raccourcis : menu partagé + bureau
  public ; données PROGRAMDATA/APPDATA intactes (vérifié test).
- **Files** : les 2 yml + `tests/e2e/installer.spec.ts` (chemins tous-
  utilisateurs) + `tests/e2e/helpers.ts` (`isElevated`, skip documenté
  sans élévation — pas d invite UAC bloquante).
- **Migration** : `-` (config install uniquement).
- **Tests** : typecheck + lint OK ; `package:win` + `package:manager` +
  `SHA256SUMS` + `smoke` OK ; E2E `installer` SKIP propre non-élevé
  (à rejouer élevé : install/réinstall/désinstall + données) ;
  `sale-flow` 4/4 sur build frais. **VERIFIED (sauf phase élevée, à
  jouer sur poste admin).**
- **NOTE migration utilisateurs** : anciennes installs per-user (HKCU)
  coexistent au registre — désinstaller l ancien d abord (données
  conservées : base/sauvegardes/réglages hors dossier d install).
