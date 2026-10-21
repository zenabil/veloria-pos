# FULL PROJECT QA AUDIT — Veloria POS1 (2026-09-18)

> **Chiffres historiques** : ce rapport est l'instantané de l'audit du
> 2026-09-18 (21 migrations, 160 canaux IPC, 25 tables). L'état courant est
> dans `handoff.md` §1 (migrations, ADR, contrats gelés) et
> `docs/STRUCTURE.md` (carte de maintenance). Rien n'est réécrit ici : un
> rapport daté reste la trace de ce qu'il a mesuré.

> Audit-only phase. **No fixes applied.** Discovery + testing + documentation.
> Workspace: `C:\Users\Admin\Desktop\Veloria POS1` · Commit context: `.git` present, no commits inspected (audit scope = working tree).
> Method: static inventory (Grep/Read over 100% of `src/`, `electron/`, `license-manager/`, `database/`, `scripts/`, `tests/`)
>
> - dynamic verification actually executed in this environment (typecheck ×3, `verify-migrations`, `license:scan`, full `vitest run`).
>   NOT executed live (blocked, §12): packaged Electron launch, NSIS installer, real printer, Playwright E2E (requires `build` + display + release/).

## 1. Project Overview — discovered programs (not assumed)

| #   | Program / Component                  | Type                                     | Path / Entry                                                                 | Tech                                                | Build / Run                                                       |
| --- | ------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------- | ----------------------------- | --------------------------------------------------- | ------------ | ---- | ---------------- |
| 1   | Veloria POS (shell + 16 modules)     | Electron renderer app                    | `src/main.tsx` → `src/app/shell/App.tsx`                                     | React 19 + Vite 6 + Tailwind 4 + Zustand            | `npm run build` → `dist/`                                         |
| 2   | POS Electron main                    | Desktop main process                     | `electron/main/main.ts`                                                      | Electron 37 + better-sqlite3 12.2.0                 | `npm run build:electron` → `dist-electron/`                       |
| 3   | POS preload bridge                   | Secure IPC bridge                        | `electron/preload/preload.ts`                                                | contextBridge                                       | esbuild → `dist-electron/preload/preload.js`                      |
| 4   | Veloria License Manager (renderer)   | Electron renderer app                    | `license-manager/renderer/main.tsx` → `App.tsx`                              | React + Vite (`vite.license-manager.config.ts`)     | `npm run build:manager-client` → `dist-license-manager-renderer/` |
| 5   | License Manager main + preload + DB  | Desktop vendor tool                      | `license-manager/main/main.ts`, `preload/preload.ts`, `db/manager-db.ts`     | Electron + better-sqlite3                           | `npm run build:manager` → `dist-license-manager/`                 |
| 6   | License signing module (vendor-only) | Library, NEVER in POS                    | `license-manager/signing.ts`                                                 | node:crypto Ed25519                                 | used by Manager + `scripts/licensing/keygen.mjs`                  |
| 7   | Installer POS (NSIS + portable)      | Packaging target                         | `electron-builder.yml` (appId `com.veloria.pos`)                             | electron-builder 26, NSIS, x64                      | `npm run package:pos` / `package:win` / `package:portable`        |
| 8   | Installer Manager (NSIS + portable)  | Packaging target                         | `electron-builder.license-manager.yml` (appId `com.veloria.license-manager`) | electron-builder 26, NSIS, x64                      | `npm run package:manager`                                         |
| 9   | Updater / auto-update / R2           | —                                        | **DOES NOT EXIST (by design, ADR-023)**                                      | manual NSIS reinstall                               | N/A                                                               |
| 10  | DB migration chain                   | 21 immutable migrations                  | `database/migrations/0001..0021.sql`                                         | SQLite (node:sqlite verify, better-sqlite3 runtime) | `npm run verify:migrations`                                       |
| 11  | Backup / Restore service             | Main-process service                     | `electron/backup/backup.service.ts` (6 IPC channels)                         | VACUUM INTO → `.vposdb` + sidecar JSON              | via POS Settings UI                                               |
| 12  | Printing service                     | Main-process service                     | `electron/printing/printing.service.ts` (12 IPC channels)                    | hidden BrowserWindow, silent default                | via POS UI                                                        |
| 13  | Local OCR service                    | Main-process service                     | `electron/ocr/*.ts` (4 files)                                                | tesseract.js + pdfjs-dist, offline                  | via Stock OcrImportDialog                                         |
| 14  | CLI scripts (7)                      | Tooling                                  | `scripts/licensing/keygen                                                    | secret-scan                                         | sign-integrity`, `scripts/database/verify-migrations              | integrity`, `scripts/release/smoke | checksums                     | stamp-electron-pkg`, `scripts/quality/verify-domain | verify-perf` | node | `npm run <name>` |
| 15  | Test suites                          | 42 files, 269 tests + 8 Playwright specs | `tests/unit                                                                  | integration                                         | database                                                          | e2e`                               | vitest 3.1.1, Playwright 1.63 | `npm run test`, `test:db`, `test:e2e`               |

Counts: **2 renderer apps, 2 Electron mains, 2 NSIS installers (+2 portable), 7 CLI scripts, 0 updaters, 0 background services/workers, 160 IPC channels (149 POS + 11 Manager), 21 migrations, 25+ base tables, 2 entry points per app (renderer + main).**

## 2. Application Inventory (detail per program)

### P1 — Veloria POS: 16/16 modules present (`src/app/shell/App.tsx:48-151`, all `ready:true`)

dashboard(Tableau de bord) · sell(Vente) · products(Catalogue) · customers(Clients) · suppliers(Fournisseurs) · stock(Stock) ·
history(Historique) · returns(Retours) · expenses(Dépenses) · debts(Dettes) · reports(Rapports) · bread(Pain) ·
proformas(Proformas) · zakat(Zakat) · settings(Paramètres) · license(Licence).
Every `*Screen.tsx` exists; 13 `*Dialogs.tsx` + `OcrImportDialog.tsx` exist. License gate: `MODULE_PAGES` (`App.tsx:71-88`) + main-side `requireLicensedPage/Feature`; `license` module always accessible (`App.tsx:297`).

### P2 — License Manager: 2 views (`license-manager/renderer/App.tsx`, 694 lines)

`list` (license rows + detail + 9 action buttons) · `new` (client info + licence + 17 page checkboxes + 14 feature checkboxes + notes + Générer).
11 buttons, 12 inputs, 2 selects, 0 custom dialogs (uses blocking `window.prompt` ×2 `:288,297` + `window.confirm` ×2 `:306,310`).

### P3 — IPC surface: 149 POS channels (`electron/ipc/channels.ts:4-178`) + 11 Manager channels. No generic `run-sql` (comment `:1-2`, enforced by `tests/unit/bridge-shape.test.ts:26`).

### P4 — Database: 21 migrations (`0001_initial_schema` … `0021_idempotency_keys`); base = 25 tables (`schema_migrations`, `app_meta`, `app_settings`, `number_sequences`, `company_profile`, `categories`, `suppliers`, `products`, `product_barcodes`, `customers`, `sales`, `sale_items`, `sale_payments`, `stock_movements`, `stock_intakes`, `stock_intake_items`, `returns`, `return_items`, `expenses`, `supplier_payments`, `proforma_invoices`, `proforma_items`, `bread_orders`, `audit_log`, `daily_closings`) + extensions (`supplier_returns*`, `zakat_calculations`, `product_suppliers`, `inventory_layers`/`sale_fifo_consumption`, `idempotency_keys`). Money = INTEGER centimes. Pragmas: `foreign_keys=ON, journal_mode=WAL, synchronous=FULL, busy_timeout=10000, trusted_schema=OFF` (`electron/database/sqlite.service.ts:35-49`). Runtime checksum drift guard refuses modified/deleted migrations (`sqlite.service.ts:202-248`).

### P5 — License crypto: Ed25519 detached over canonical JSON (`electron/licensing/protocol.ts:20,89-151`); `.vlic` = base64url({payload,signature}); 12 states; hardware fingerprint = SHA-256(MachineGuid+SystemUUID+ProcessorId+disk) min 2 sources (`fingerprint.ts`); DPAPI-encrypted state (`secure-state.ts`); clock-rollback + integrity-manifest tamper detection; public key only in POS (`resources/license/public.key`); private key NEVER in POS (vendor `userData/keys` or gitignored `private/`, `signing.ts:1-4`).

## 3. Test Coverage (executed vs blocked)

| Suite                                                                                                                   | Command                                                | Result (this env)                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Renderer+electron+manager typecheck                                                                                     | `typecheck`, `typecheck:electron`, `typecheck:manager` | **PASS** (0 errors)                                                                                               |
| Migrations                                                                                                              | `verify:migrations`                                    | **PASS** (21/21 + 30 constraint checks)                                                                           |
| Secret scan (261 files)                                                                                                 | `license:scan`                                         | **PASS** (no secret/bypass/map)                                                                                   |
| Unit + integration                                                                                                      | `npx vitest run`                                       | **PASS 269/269 (42 files)** + 2 infra flakes (`Timeout calling onTaskUpdate`, vitest-worker RPC, no test failure) |
| ESLint                                                                                                                  | `npm run lint`                                         | **BLOCKED** (timeout >180s in this env, no output; prior AUDIT_REPORT claims green — UNVERIFIED here)             |
| Playwright E2E (8 specs: sale-flow, credit-return, stock-backup, restart, license-activation, window-chrome, installer) | `test:e2e`                                             | **BLOCKED** (requires `build`+`build:electron`+display; installer spec requires `release/` build)                 |
| Live button-by-button clicking / printers / NSIS install                                                                | manual                                                 | **BLOCKED** (headless env) → covered statically: 255 POS buttons, 306 onClick, **0 dead/fake** (§4)               |

## 4. Button-by-Button (static, 29 POS files + Manager)

Totals POS: `<button`=65 + `<Button>`=190 → **255 buttons**; `<input>`=23 (+wrappers), `<select|Select>`=63, `textarea`=15, `onClick`=306. Zero `onClick` with TODO/console.log/noop/empty, zero buttons without handler/submit, zero hardcoded `disabled={true}`. Examples: `SellScreen.tsx` 9+14 buttons/19 handlers; `ProformaDialogs.tsx` 4+16/20; Manager 11 buttons all wired.
**Verdict: no dead/fake/visual-only button found statically. Live double-click behavior → F-01.**

## 5. Field-by-Field (validators = single source of truth, `electron/ipc/validators.ts`, 846 lines)

All mutations Zod-validated at main boundary (lengths, ranges, enums, real-calendar dates). 16 schemas carry `operationId: uuid`; **mutations WITHOUT operationId** (§6/F-02): products._, customers.create/update, suppliers.create/update/delete_, expenses.\*, categories.create, bread.update/status, proforma.update/status/delete, settings/company/zakat writes, sales.setDueDate.

## 6. Workflow Results (atomicity + idempotency)

PASS (verified in code): `sales.create` atomic 1-tx + UNIQUE(operation_id) race guard (`sales.repo.ts:113-135,168-215`); `customers.recordPayment` idempotent on same operationId (`customers.repo.ts:233-329`); returns/bread/proforma/stock-intake/closings idempotent; validators require uuid operationId for 16 financial mutations; credit-sale double-guard (app + SQL trigger `trg_sales_credit_allowed`).
**FAIL-pattern → F-01, F-02.**

## 7. Integration Results

- Manager→POS license file: PASS design (Ed25519 chain, page/feature double-source enforcement; capability parity tested `license-capabilities.test.ts`).
- POS→DB→UI persistence: PASS (WAL, transactions, backup sidecars).
- Update→Migration→License→App: BLOCKED live (no updater; reinstall path covered only by `installer.spec.ts`, not executed here).
- License-gated printing/backup: PASS design (`guardPrint`, expired may still backup `backup.service.ts:46-52`).

## 8. Database Results — PASS

`verify-migrations` green (21/21); checksum drift guard; downgrade refusal; pre-migration snapshots; `VACUUM INTO` backups; restore with rollback; FK=0/integrity ok in tests. Backup rotation 30, auto-backup daily default, traversal guard on export.

## 9. License Results — PASS core, 1 UX finding

Valid/invalid/modified/expired/revoked/suspended/hardware-mismatch/clock-rollback/tamper all handled with FR messages; red-team tests exist (`license-redteam.test.ts`, `license-protocol.test.ts`, `license-service.test.ts`, `license-capabilities.test.ts`, `license-fingerprint.test.ts`, `license-manager.test.ts`). Findings: F-03 (Manager prompt/confirm + NaN months).

## 10. Update Results — N/A BY DESIGN (ADR-023)

`publish: []` both builders; zero `autoUpdater/R2/cloudflare` code hits. Update = full NSIS reinstall (stable appId, data outside install dir, `deleteAppDataOnUninstall:false`). Installer E2E spec exists (`tests/e2e/installer.spec.ts`, 224 lines: install→reinstall→uninstall, data preservation) — NOT executed here (no `release/` build). Unsigned binaries → SmartScreen expected (documented).

## 11. Installer Results — BLOCKED (no build in env)

Config reviewed: NSIS classic FR, per-folder choice, desktop+start-menu shortcuts, portable targets, asar + `*.node` unpack, extraResources (icons, migrations, public.key, OCR lang). `prepackage` forces `license:scan`. Live verification pending `package:win`.

## 12. Security Results — PASS (hardened)

`contextIsolation:true, nodeIntegration:false, sandbox:true` on all 5 windows; permissions denied; closed external-navigation allow-list; `shell.openExternal` https-only; no `eval/new Function`; no `run-sql`; bridge exposes only typed `invoke/on`; `secret-scan` green; DPAPI license state; fail-closed key/integrity. Note: `printing.testPage` intentionally unguarded (fixed demo content).

## 13. Performance/Stability — static PASS, live BLOCKED

No loops/awaits-in-render found by sampling; `products.matchBatch` eliminates OCR N+1 (documented); history filters 18/18. Live perf (startup/RAM/CPU/print/backup under load, rapid-click soak) not measurable headless → recommended before release (`verify-perf.mjs` exists).

## 14. Test Matrix (master)

| Test ID | Application | Page/Module                                      | Element                               | Action                 | Expected                                       | Actual                                                                                                                 | Status  | Severity |
| ------- | ----------- | ------------------------------------------------ | ------------------------------------- | ---------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------- | -------- |
| T001    | POS         | shell (16 modules)                               | navigation                            | open each module       | all render                                     | 16/16 screens exist, static OK                                                                                         | PASS    | —        |
| T002    | POS         | Vente                                            | Valider (submit)                      | rapid double-click     | ONE sale                                       | fresh operationId/call (`create-sale.ts:48`); only `busy` flag guards (`SellScreen.tsx:659-662`) → duplicates possible | FAIL    | HIGH     |
| T003    | POS         | Vente→Proforma                                   | Créer proforma                        | rapid double-click     | ONE proforma                                   | fresh operationId/call (`SellScreen.tsx:529`); only `proformaBusy` guards                                              | FAIL    | MEDIUM   |
| T004    | POS         | Vente (settle)                                   | Régler dette                          | double-click retry     | ONE payment                                    | same `settleOperationId` reused (`:204,222`) + idempotent repo → safe                                                  | PASS    | —        |
| T005    | POS         | Dépenses/Fournisseurs/Catalogue/Clients          | create/update/delete                  | double submit          | idempotent                                     | NO operationId in schemas (validators) → duplicates possible                                                           | FAIL    | HIGH     |
| T006    | POS         | all mutations                                    | validators                            | invalid/empty/boundary | FR rejection                                   | Zod at boundary + domain rules + 269 green tests                                                                       | PASS    | —        |
| T007    | Manager     | renew/transfer/revoke/suspend                    | prompt/confirm                        | valid+invalid input    | validated FR flow                              | blocking prompt/confirm; `Number(months)` unvalidated (`App.tsx:288-293`) → NaN path                                   | FAIL    | MEDIUM   |
| T008    | POS+Manager | license chain                                    | tampered/expired/hw-mismatch/rollback | import+enforce         | 拒 fail-closed FR                              | protocol+service+red-team tests green                                                                                  | PASS    | —        |
| T009    | POS         | Activation→shell                                 | `switchToMainFromLicense`             | activate               | main window focused                            | `getLicenseWindow()?.focus()` after close = always null; new window never focused (`main.ts:143-147`)                  | FAIL    | MEDIUM   |
| T010    | POS         | shell                                            | module count comment                  | read                   | 16                                             | comment says 14 (`App.tsx:1`)                                                                                          | FAIL    | LOW      |
| T011    | Infra       | migrations 21                                    | `verify:migrations`                   | run                    | green                                          | 21/21 + 30 checks green                                                                                                | PASS    | —        |
| T012    | Infra       | secrets                                          | `license:scan`                        | run                    | clean                                          | 261 files clean                                                                                                        | PASS    | —        |
| T013    | Infra       | unit+integration                                 | `vitest run`                          | run                    | green                                          | 269/269 (+2 worker-RPC flakes)                                                                                         | PASS    | —        |
| T014    | Infra       | typecheck ×3                                     | `tsc -b`                              | run                    | clean                                          | 0 errors                                                                                                               | PASS    | —        |
| T015    | Infra       | lint                                             | `eslint`                              | run                    | clean                                          | BLOCKED (timeout, unverified here)                                                                                     | BLOCKED | MEDIUM   |
| T016    | POS         | backup/restore                                   | Settings UI + service                 | backup→restore→verify  | data intact                                    | code path sound (snapshot+rollback); NOT executed live                                                                 | BLOCKED | HIGH\*   |
| T017    | POS         | print 80mm/A4/proforma/report/labels             | print+preview                         | silent print           | output                                         | channels+guards sound; NOT executed (no printer)                                                                       | BLOCKED | MEDIUM\* |
| T018    | Installer   | NSIS install/reinstall/uninstall                 | `installer.spec.ts`                   | run                    | data preserved                                 | NOT executed (no `release/` build)                                                                                     | BLOCKED | HIGH\*   |
| T019    | Update/R2   | check/download/verify/install                    | —                                     | —                      | N/A by design (ADR-023); reinstall path = T018 | N/A                                                                                                                    | —       |
| T020    | E2E         | sale/credit/return/backup/restart/license/chrome | Playwright 8 specs                    | run                    | green                                          | NOT executed (needs build+display)                                                                                     | BLOCKED | HIGH\*   |

`*` BLOCKED = must-run before production release, not a code defect.

## 15. Critical/High Bugs (no fixes applied)

- **F-01 HIGH · FUNCTIONAL/INTEGRATION — Sale/proforma double-submit duplicates.** `createSale()` mints a new `operationId` per call (`src/application/sales/create-sale.ts:48`); backend dedup keys on that id (`electron/ipc/handlers/sales.repo.ts:122-135`), so two rapid submits = two ids = two sales. Only guard is renderer `busy` (`SellScreen.tsx:659-662,1278`), set via async React state — a second submit in the same tick / F10+click can slip through. Same shape for proforma (`SellScreen.tsx:524-529,888`). Fix direction (later): mint ONE operationId per payment dialog opening (like `settleOperationId` `:204`) and/or disable+refocus guard synchronously.
- **F-02 HIGH · DATABASE/ARCHITECTURE — Idempotency gap vs AGENTS.md rule 4.** Financial/catalog mutations without `operationId`: `expenseCreate/Update`, `supplierCreate/Update/Delete/DeleteMany`, `productCreate/Update/Delete/Archive/Restore/Import`, `customerCreate/Update`, `categoryCreate`, `breadUpdate/Status`, `proformaUpdate/Status/Delete` (`electron/ipc/validators.ts`). Double-click/retry can duplicate (expenses = financial). Fix direction: extend `operationId` + UNIQUE/replay guard to at least expenses/suppliers/customers.
- **F-03 MEDIUM · UX/VALIDATION — Manager destructive flows on blocking prompt/confirm** (`license-manager/renderer/App.tsx:288,297,306,310`); renew months `Number(months)` unvalidated → `NaN` reaches main. Fix: custom modal + zod `positive int` check renderer-side.
- **F-04 MEDIUM · ELECTRON/UX — Activation never focuses new window.** `switchToMainFromLicense` (`electron/main/main.ts:143-147`) calls `getLicenseWindow()?.focus()` AFTER `closeLicenseWindow()` nulled it (`window-manager.ts:223-231`) → dead statement; `createMainWindow()` result never focused. Fix: focus the created main window.
- **F-05 LOW · UI — Stale comment.** `App.tsx:1` says 14 modules, `MODULES` has 16.
- **F-06 INFO — Update/R2/Cross-version-data flows untestable by design.** No auto-update (ADR-023 accepted); reinstall-over-real-data covered only by unexecuted `installer.spec.ts`. Must run T016/T018/T020 pre-release.
- **F-07 INFO — Release hygiene.** `dist*/release/` pre-date this audit (per AUDIT_REPORT §22); unsigned binaries (SmartScreen); `lint` unverified in this env; vitest worker-RPC flakes ×2.

## 16. Recommended Fix Order

1. F-01 (duplicate sale = financial integrity) → 2. F-02 (expenses/suppliers at minimum) → 3. F-04 (2-line focus fix) + F-05 → 4. F-03 (Manager modal) → 5. Run BLOCKED gates: `lint`, `build`+`build:electron`, full Playwright E2E, `package:win` + installer spec on real Windows, backup/restore + print drills → 6. Regression: re-run §3 table green + bump release.

## 17. Production Readiness (per component, with evidence)

| Component                    | Verdict                                                   | Evidence                               |
| ---------------------------- | --------------------------------------------------------- | -------------------------------------- |
| Veloria POS                  | **NEEDS FIXES**                                           | F-01, F-02                             |
| License Manager              | **NEEDS FIXES** (minor)                                   | F-03; crypto core READY                |
| DB layer + migrations        | **READY**                                                 | §8, T011                               |
| IPC / Electron security      | **READY**                                                 | §12, T012/T014, `bridge-shape.test.ts` |
| License enforcement          | **READY**                                                 | §9, red-team suites                    |
| Backup / Restore             | **READY (code) / BLOCKED (live)**                         | T016 must-run                          |
| Printing                     | **READY (code) / BLOCKED (live)**                         | T017 must-run                          |
| Updater / R2                 | **N/A (by design)**                                       | ADR-023; T019                          |
| Installer                    | **BLOCKED**                                               | T018 must-run after `package:win`      |
| Integration POS↔Manager↔DB | **NEEDS FIXES**                                           | F-01 spans UI→DB                       |
| **Whole project**            | **NOT READY — blocked by F-01/F-02 + BLOCKED live gates** | —                                      |

## 18. Not-testable items + reasons

Live Electron launch, NSIS install/uninstall, Playwright E2E, real-printer output, OCR accuracy on scans, perf/soak under load, multi-device activation: all BLOCKED — headless audit env without display/printer/release build. Code paths reviewed statically; live runs required pre-release.

_End of FULL PROJECT QA AUDIT. Next phase (separate): BUG FIX → REGRESSION TEST → FINAL PRODUCTION AUDIT._
