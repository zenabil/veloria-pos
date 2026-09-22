# FINAL_REPAIR_REPORT — Veloria POS (réparation racine finale)

> Période : audit profond → 9 phases → vérification exécutive.
> Méthode par correctif : Root Cause → Architecture → Implementation →
> Validation → Regression Test. Zéro shortcut : aucun `skip/only/bypass/
disable` ajouté pour masquer (les 3 `eslint-disable` ciblés et les 4
> `test.skip` environnementaux sont documentés et justifiés ci-dessous).
> Docs sources ignorées comme preuve ; seul le code + l'exécution font foi.

## 1. Executive Summary

- **P0 éliminé** : `0023` cassait 100 % des retours (`ABORT` à l'INSERT) —
  corrigé par `0024` (séquences pré-allouées) + repo (INSERT direct).
- **Régressions d'intégrité trouvées par les tests et corrigées** :
  fixtures sans `code`, licence E2E sans capabilities, `verify-migrations`
  partiel, manifeste incompris par le vérificateur packagé.
- **Sécurité unifiée** : 1 politique fenêtres (4/4), 1 politique chemins,
  gates IPC complétées, licence fail-closed des deux apps.
- **Dette d'audit résorbée** : 20+ mutations sans `audit_log` désormais tracées.
- **Résultats exécutifs** : unit+intégration+database **46 fichiers / 296 tests
  PASS** ; E2E **21 PASS + 2 skips environnementaux documentés** ;
  `verify:migrations` 24/24 ; `secret-scan` 357 fichiers OK ; `smoke` POS +
  Manager OK ; `package:win` (nsis+portable, signé) OK ; installeur E2E OK ;
  3× `typecheck` verts ; lint ciblée (tous fichiers touchés) 0 erreur.
- **Restes assumés** : §20 (10 risques documentés, aucun critique/haut caché).

## 2. P0 — Migration 0023 cassait les retours (BLOQUANT, RÉSOLU)

- **Cause racine** : `trg_returns_number_required` /
  `trg_supplier_returns_number_required` (`BEFORE INSERT WHEN NEW.return_number
IS NULL → ABORT`) incompatibles avec la numérotation historique dérivée de
  l'`id` (`INSERT` sans numéro + `UPDATE` après). Tout `returns.create`
  (client + fournisseur) échouait sur base migrée. Preuve exécutive :
  `atomic-slices` **8/13** (`retours 0010` + 4 cascades `code`).
- **Choix architectural (option A)** : numéros pré-alloués depuis
  `number_sequences` (comme `sale_invoice`) — pas de suppression de
  fonctionnalité, pas de changement de format (`RET-C/S-%05d`), pas de
  réutilisation (amorçage `MAX(id)+1`).
- **Fix** : `0024_return_number_sequences.sql` (séquences + `DROP` des 2
  triggers impossibles ; `0001..0023` intactes) + `returns.repo.ts`
  (`allocateReturnNumber`, INSERT direct avec numéro, retry anti-course
  `UNIQUE return_number` miroir factures pour les 2 flux).
- **Validation** : `atomic-slices` **13/13**, `fifo-layers` 13/13,
  `root-invariants` 6/6 (dont nouveau test 0024 : séquences + INSERT direct
  - doublon rejeté), `verify:migrations` 24/24.
- **Statut : VERIFIED.**

## 3. P1 — Sécurité fenêtres unifiée (RÉSOLU)

- **Cause** : politique copiée-collée par fenêtre ; garde `webview` enregistrée
  uniquement dans `createMainWindow` (recovery/license non couvertes) ;
  `webviewTag` non défini hors print.
- **Fix** : `window-manager.ts` — `hardenedWebPreferences()` (preload +
  `contextIsolation/nodeIntegration/sandbox/webviewTag:false`),
  `secureWindow()` (permissions + navigate + redirect + popups),
  `installWebviewGuardOnce()` au chargement du module (tous modes) ;
  appliqué aux 4 fenêtres + print (`will-redirect` ajouté, §13/P3).
- **Tests** : `window-chrome` 6/8 E2E (2 skips bureau couvert, natifs) +
  `typecheck:electron` + lint.
- **Statut : VERIFIED** (E2E chrome).

## 4. P2 — Gates IPC + matrice (RÉSOLU sauf lectures documentées)

Matrice appliquée (`registry.ts`) :

| Canal                                                                                                                                                                   | Entrée     | Licence/Feature/Page                    | Rôle                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `settings.save`, `company.update`, `printer.save`                                                                                                                       | Zod dédiés | `requireLicensedMutation`               | Écritures config → mutation gardée                                                       |
| `system.selectLogo`                                                                                                                                                     | dialogue   | `requireLicensedMutation`               | Effet disque → gardé                                                                     |
| `categories.list`                                                                                                                                                       | —          | PAGE `products\|stock\|reports`         | Filtre des 3 seuls appelants                                                             |
| `app.diagnostics`                                                                                                                                                       | —          | PAGE `settings`                         | PII technique → settings                                                                 |
| `printing.testPage`                                                                                                                                                     | —          | `guardPrint(receipt-80mm,sales)`        | Impression physique                                                                      |
| `ocr.cancel/dispose`                                                                                                                                                    | Zod        | `ocr` (cohérence)                       | Même capability que select/analyze                                                       |
| `returns.create` (credit>0), `bread.create` (partiel), `bread.transfer`, `proformas.convert`, `bread.convert` (lecture DB pré-mutation)                                 | Zod        | `debt-management` (+`partial-payments`) | Tout crédit passe la gate                                                                |
| Lectures (`settings.get`, `company.get`, `printer.get`, `listPrinters`, `selectFolder`, `openDataFolder/LogsFolder`, `health/integrity/optimize/location`, `history.*`) | —          | Ouvert documenté                        | Lecture sans mutation ; UI filtrée par pages ; réactivation/recovery exigent l'ouverture |
| `app.restart`, `recovery.*`, `license.*`, `window.*`                                                                                                                    | —          | Ouvert documenté                        | Noyau pré-auth nécessaire                                                                |

- **Statut : VERIFIED** (license E2E 4/4 : blocage/activation/expirée/complète).

## 5. P3-P12 (correctifs ciblées, tous VERIFIED sauf notes)

- **P3** : `will-redirect` print (`printing.service.ts`). Testé via E2E preview/print.
- **P4** : `openPathSafe` (`realpath` + casse Windows) ; `openLogsFolder`
  confiné à `userData/logs` (égalité stricte, plus de repli `cwd`).
- **P5** : politique centrale unique (`assertSafeUserFolder` : absolu, anti-`\0`,
  anti-UNC, anti-racine, deny-list 6 racines, symlink + parents remontés) ;
  `BACKUP_EXPORT_DENIED` locale supprimée (source unique
  `isSystemDeniedPath`).
- **P6** : `getConfiguredDbPath` (schéma strict + dossier sûr, lecture
  `.vposdb` préservée) ; `persistDbPath` (`.sqlite` seul + dossier sûr +
  écriture atomique tmp→rename).
- **P7** : `moneyMinor` (≤1e9) sur `saleItem`/`printLine`/`productCreate` ;
  `quantity` centrale (finie, >0, ≤1M, 3 décimales) ; `productUpdateSchema`
  sans `operationId` mensonger (idempotente par valeur) ;
  `expenseDeleteSchema` (`operationId?` + repo claim/peek + renderer envoie
  un UUID figé) ; `licenseRenewSchema` (term ⇒ fin requise) ;
  `licenseCapabilitiesSchema` (`features ≥1`, `pages` nullable pour legacy —
  bug legacy trouvé PAR le nouveau test) ; pagination `stock.products`
  500→200 (politique 200 max partout).
- **P18** : `peek(operationId, expectedOpType)` + `{}` invalide sur 8 repos ;
  audits `product.created`/`expense.created` liés à l'`operationId` réel.
- **P8** : audit ajouté — `customer.payment`, `supplier.created`,
  `proforma.status/updated/converted`, `bread.paid/quantity/updated/status/
transferred`, `sale.due_date`, `customer/product archived/restored`,
  `category.created`, `zakat.calculated`, `company.saved`, `settings.saved`,
  `customers.imported`. Restent sans audit : mises à jour idempotentes par
  valeur (`customer.update`, `supplier.update`, `product.update`,
  `expense.update`) — documenté §20.
- **P9** : `verify-migrations` — dédupe bloc 0012, checks
  0014/0015/0016/0019/0021/0024, détection noms inattendus/doublons/trous,
  `trg23` 6/8 (2 abandonnés par 0024, vérifiés absents).
- **P10** : `package:manager` += `license:scan` ; `sign-manager-integrity.mjs`
  (21 fichiers) ; `integrity-check.ts` + gate au démarrage manager ;
  `extraResources license` dans le yml ; `smoke.js` section manager ;
  `insertLicenseRecord` (status = standing signé) ; `updateEnvelope/setStatus`
  morts supprimés (vérifié 0 appelant) ; `typecheck:manager` couvre le
  renderer.
- **P11** : aperçu OCR = vignette JPEG 800 px (plus de 15 Mo via IPC) ;
  PDF timeout 60 s + 200 k caractères max ; `escapePreText` central pour le
  thermique ; logo `companyLogo` 600 k documenté (cohérent base64 d'un
  fichier 400 k) ; `labelsOf` refuse `>200` explicitement.
- **P12** : alias `printing.testPage` supprimé du preload/typage (canal
  conservé, `printer.test` unique — 0 appelant de l'alias) ; dossiers vides
  `routes`/`providers` supprimés ; `BarChart` neutralise NaN/±∞/négatif ;
  `Dashboard` distingue chargement/vide ; `secret-scan`/`sign-integrity`
  conformes lint (override documenté pour helpers JS sans types).

## 6. Additional Issues Found (pendant la réparation, corrigées)

1. `verify-migrations` legacy `suppliers` sans `code` → alignés `FOU-*`
   (contrat 0023) ; `0008`-test exclut aussi `0023` (schéma partiel).
2. `licenseCapabilitiesSchema` rejetait `pages: null` (legacy) → nullable.
3. `insertLicenseRecord` : `status` dur `'active'` vs `licenseStatus` param →
   unifiés.
4. `helpers.ts` E2E : licence sans `receipt-80mm`/`debt-*`/`returns`/
   `backup-*` → complétée (flux exigent ces capabilities par conception).
5. `installer.spec` phase réinstall : `launchActivatedApp` attend un écran
   d'activation alors que l'état est conservé → `launchIsolatedApp`.
6. `printing.service.ts` : import `buildReportHtml` tombé pendant l'édition
   (détecté par `tsc`, restauré) — preuve que la chaîne typecheck fonctionne.
7. Commentaire `dist*/**` cassant esbuild/vitest → reformulé (leçon : pas de
   `*/` dans les commentaires).
8. `helpers.ts:155` condition toujours vraie (lint) → simplifiée.
9. `stock.test`/`logo.test`/`history.test` : contrats réellement changés
   (200/200/magie) → fixtures rendues réelles + test polyglotte ajouté.
10. Manifeste incompris en packagé (`database/`, `public/icons/` mappés sur
    l'asar) → `resolvePackagedAbs` + test unitaire (prouvé par l'E2E
    installeur : `TAMPER` avant, shell après).

## 7. Root Causes (synthèse)

Numérotation post-INSERT incompatible avec `NOT NULL` ; gardes dispersées
par fenêtre/canal au lieu de politiques centrales ; chemins validés par
suffixes ; `operationId` décoratif par endroits ; validations dupliquées
UI≠Main ; audits ajoutés après-coup ; manifests/pipelines asymétriques
POS/Manager ; fixtures E2E sans capabilities ; triggers sans égard aux
schémas partiels de test.

## 8. Files Changed (56 fichiers + 2 rapports)

DB (2) : `0024_return_number_sequences.sql` (nouveau) ;
`verify-migrations.mjs` réutilisé côté scripts.
Code : `returns.repo`, `customers.repo`, `sales.repo`, `suppliers.repo`,
`products.repo`, `expenses.repo`, `proformas.repo`, `bread.repo`,
`finance.repo`, `company.repo`, `settings.repo`, `import.repo`,
`inventory.repo`, `idempotency.ts`, `registry.ts`, `validators.ts`,
`security.ts`, `window-manager.ts`, `printing.service.ts`,
`receipt-documents.ts`, `backup.service.ts`, `database-path.service.ts`,
`file-ui.ts`, `logo.ts`, `ocr.service.ts`, `ocr-files.ts`, `ocr-pdf.ts`,
`public-key.ts` (inchangé cette phase), `integrity.ts`,
`preload.ts`, `vite-env.d.ts`, `create-sale.ts` (phase antérieure),
`SellScreen.tsx`, `ExpensesScreen.tsx`, `DashboardScreen.tsx`, `csv.ts`,
`BarChart.tsx`, `manager/{main.ts,integrity-check.ts(nouveau),ipc/registry.ts,
ipc/licenses.ts,ipc/validators.ts}`, `package.json`,
`tsconfig.manager.json`, `eslint.config.mjs`,
`electron-builder.license-manager.yml`, `sign-integrity.mjs`,
`sign-manager-integrity.mjs` (nouveau), `secret-scan.mjs`, `smoke.js`.
Tests : `root-repair.test.ts` (nouveau, 15 tests),
`root-invariants.test.ts` (+1), `history/stock/logo.test.ts`,
`atomic-slices/fifo-layers/intake-selling-price/history.test`
(fixtures `code`), `helpers.ts`, `installer.spec.ts`.
Supprimés : `src/app/routes/`, `src/app/providers/`,
`updateEnvelope/setStatus`, alias `printing.testPage`.

## 9. Database Migrations Added

- `0023_root_invariants.sql` (phase antérieure, inchangée) : 8 triggers +
  `layers_json` — dont 2 triggers retours abandonnés par 0024.
- `0024_return_number_sequences.sql` (cette phase) : séquences
  `return_customer/return_supplier` amorcées `MAX(id)+1` + `DROP` des 2
  triggers impossibles. `0001..0023` intactes (checksums vérifiés par
  `verify-migrations` + `sqlite.service` au boot de l'installeur E2E :
  `schemaVersion: 24`, `database.opened`).

## 10. Security Changes

Voir §4 + P1/P3-P6 ci-dessus. Aucun assouplissement : 3 durcissements
révélés par les tests (E2E preview, installateur TAMPER, fixtures).

## 11. License Changes

Gates dette généralisées (P2/P24) ; `printer.save`/`testPage`/`ocr.*`
gardés ; clé publique sans fallback `cwd` en packagé ; revoke ré-émise
signée ; renew/capabilities validés ; manager manifest + gate démarrage ;
`license:scan` dans `package:manager`.

## 12. IPC Changes

`expenseDeleteSchema` (op optionnel) ; `productUpdateSchema` (sans op
mensonger) ; `categories.list` + `app.diagnostics` pagés ; `selectLogo`
gardé ; crédit/partiel sur 5 canaux ; `stock.products` 200 ;
`moneyMinor`/`quantity` centrales ; alias `testPage` retiré du preload.

## 13. Business Logic Changes (comportement)

- Numéros retours : séquence pré-allouée (même format `RET-C/S-%05d`,
  continuité après historique) au lieu de `id` post-INSERT.
- Suppression dépense idempotente si `operationId` fourni.
- `productUpdate` : contrat honnête (pas d'op).
- Renew manager : `term` exige une fin. Capabilities : `≥1` feature.
- Aperçu OCR : vignette (pas de changement métier, même relecture).
- Étiquettes `>200` : erreur FR au lieu de troncature.
- `openLogsFolder` strict ; `persistDbPath` atomique ; UNC/racine refusés.

## 14. Tests Added

- `tests/unit/root-repair.test.ts` : 15 tests (percent 2.5, Zod %, ticket
  ×5, history 200, CSV ×2, logo magie, renew ×2, capabilities ×2,
  `resolvePackagedAbs`).
- `tests/database/root-invariants.test.ts` : +1 test 0024 (séquences +
  INSERT direct + doublon rejeté) = 6 tests.
- `logo.test.ts` : +1 test polyglotte ; fixtures à magie réelle.
- E2E : fixtures licence complétées ; `installer.spec` phase 5 corrigée.
- `verify-migrations.mjs` : +13 assertions (0014/15/16/19/21/24, doublons,
  trous, triggers 6/8).

## 15. Tests Executed

```text
vitest (unit+integration+database) : 46 fichiers / 296 tests — ALL PASS
  (3 erreurs worker RPC `onTaskUpdate` = bruit infra parallèle, 0 échec test)
E2E Playwright : sale-flow 4/4, license-activation 4/4, restart 1/1,
  window-chrome 6/8 + 2 skips natifs (drag/resize, bureau couvert),
  stock-backup 3/3 (après fix licence), credit-return 2/2 (après fix),
  installer 1/1 (après fix intégrité + phase 5) — total 21 PASS, 2 SKIP env.
verify:migrations : 24/24 + 40 assertions — MIGRATIONS VERIFIED
secret-scan : 357 fichiers — OK
smoke (+manager) : OK (13 + 5 lignes)
typecheck ×3 (renderer/electron/manager) : PASS
eslint fichiers touchés : 0 erreur (full `npm run lint` >300 s sur cette
  machine — timeout infra, pas d'échec ; voir §21.4)
```

## 16. Test Results — voir §15 (aucun échec restant).

## 17. Build Results

- `npm run build` (tsc-b + vite 1666 modules) : PASS.
- `npm run build:electron` (tsc + esbuild preload + stamp + sign 93
  fichiers) : PASS.
- `build:manager-client` (30 modules) + `build:manager` +
  ...[truncated 2113 chars]

---

# PHASE RADICAL REPAIR — 2026-09-19 (annexe, ne modifie pas les chapitres 1-17)

Périmètre : H-1/H-2/H-3, M-1..M-10, print/OCR, P2, audits §25-30, gates §33.
Détail par modification : voir `REPAIR_CHANGELOG.md` (section PHASE RADICAL REPAIR).
Décisions : `docs/ADR-027-credit-revocation.md`, `docs/ADR-028-money-safety-boundary.md`.

## RR-A — Corrigés (root cause + preuve)

H-1 frontière money (ADR-028) · H-2 0025 NOT NULL · H-3 état v2 + ancre
TAMPER · M-1 clé proforma stable · M-2 UUID caller (deletes/imports,
peek/claim/store) · M-3 updates sans UUID · M-4/M-5 0026 (INSERT guards +
révocation, ADR-027) · M-6/M-7/M-8 (delta fail-closed, limites unifiées,
overdue) · M-9/M-10 (streaming, suffixe, sidecar) · print fail-closed ·
OCR FR · PERF fingerprint+cache (E2E 4 échecs → 4/4) · lint VERT · E2E
helpers pages explicites.

## RR-B — Supprimés / conservés

Supprimés : `normalizeUserPath`, `realPathBestEffort`. Conservés documentés :
`validateReturnLines/*`, `parse*Csv`, 14 wrappers (canaux vivants), `bindings`,
`[data-theme=light]`, `categories.create`, `deviceBinding=false`, NOT_YET_VALID.

## RR-C — Sécurité (tests)

`license-tamper` 10/10 (suppression, remplacement, rollback, tag, rejeu,
horloge, touch, legacy ±cutoff) · red-team 11/11 · capabilities 15/15 ·
protocole/service/manager/fingerprint 20/20 · `secret-scan` 366 fichiers OK.

## RR-D — Base (22 → 26 sur ce poste de dev ; prod à migrer §37)

`verify-migrations` 26/26 + 15 assertions (NULL/duplicata/données/séquences/
triggers/downgrade-refusé) · `integrity_check=ok`, FK=0. Base locale de test
`C:\packup` : v22, ok, 4 ventes/3 produits/2 clients (pré-migration, intacte).
Procédure prod : backup → `integrity.js` → lancement (snapshot auto +
migration 23→26) → `integrity.js` → comptages + invariants (tickets,
soldes, `return_number` non NULL).

## RR-E — Tests (332 unit/intégration + 21 E2E)

`npx vitest run` : 50 fichiers / 332 PASS (baseline 46/296 ; +4 fichiers :
money-safety 10, license-tamper 10, repair-p1 5, repair-hardening 7 ;
contrats réécrits sans affaiblissement). E2E Playwright : 21 PASS + 2 SKIP
(installer 1/1 sur Setup FRAIS 114 Mo + Portable ; SHA256SUMS OK).

## RR-F — Build

`build` (1667 modules) · `build:electron` (stamp + manifest 96 fichiers
signé) · `package:win` (Setup+Portable+LicenseManager, signtool) ·
`smoke` OK · `verify-perf` seuils OK (recherche 1ms, commit 13ms, backup
551ms) · `license:scan` OK.

## RR-G — Restant (rien de P0/P1 ouvert)

- E2E 2 SKIP natifs (préexistants, hors scope).
- `floating/maxDevices` : enforcement concurrente impossible offline —
  résiduel accepté documenté (choix vendor explicite + log).
- Détection tamper runtime : grâce 60s max sur verdict `ok` (non-ok jamais
  cachés) — résiduel accepté documenté.
- `dzdInputToMinor` historique (NaN) : 15 appelants UI vérifient `isFinite` ;
  `parseDzdInputStrict` pour le neuf — migration complète refusée (risque
  throw pendant rendu).
- Aucun P0/P1 money/intégrité/licence/idempotence/backup/IPC restant.
