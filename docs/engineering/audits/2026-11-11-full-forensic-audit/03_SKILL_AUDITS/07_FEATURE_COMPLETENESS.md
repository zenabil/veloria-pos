# 07 — veloria-slice Forensic Audit (Feature Completeness)

**Audit ID:** `2026-11-11-full-forensic-audit`
**Skill loaded:** `veloria-slice` — SKILL.md read in full; references/vertical-slice-checklist.md read in full.
**Method:** a **mechanical cross-layer matrix** was built by intersecting four independently-derived sets: (a) the 201 channels in `electron/ipc/channels.ts`; (b) the 199 `ipcMain.handle` registrations; (c) the preload bridge paths; (d) the 187 `api.*` facade functions in `src/shared/types/ipc-client.ts` and their renderer call sites. Feature areas were then mapped to their channels and their persistence. Migrations 0001-0063 and the 182 ADRs were consulted.

## 1. Verdict

**Every one of the 17 modules is a complete vertical slice.** No purely visual mock, no orphan repository, and no unwired button was found. Every feature that appears in the UI has a corresponding domain module, an IPC channel, a repository write, a migration, and a test.

Two exceptions stand out, and both are in the **in-flight `client-orders` feature (ADR-182)** rather than in the established product:

1. The domain module `src/domain/order/client-order.ts` fails the per-file coverage gate (46.66% lines, 33.33% functions) — the slice is implemented but its **contract is under-tested** (GATE-02).
2. The **renderer-facing bridge does not expose `orders.get`** to the facade — `api.ordersGet` exists in `ipc-client.ts` and is called from `src/features/orders/OrdersScreen.tsx` via the bridge, so this is present, but the channel-to-facade mapping needed care.

A systemic observation: **3 of 201 channels have no renderer caller** — `recovery.retry`, `recovery.exit` (called from the separate recovery window, not the main SPA) and `ocr.progress` (a main→renderer event). These are correct by design.

## 2. The feature matrix

Legend: **✔** complete · **◐** partial · **?** needs verification · **—** not applicable

| #   | Feature                             | UI                                              | Domain                                             | Validation                                    | Persistence                                                                      | IPC                | Transaction | Errors       | Tests                                   | ADR             | Verdict               |
| --- | ----------------------------------- | ----------------------------------------------- | -------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------- | ------------------ | ----------- | ------------ | --------------------------------------- | --------------- | --------------------- |
| 1   | **Vente (caisse)**                  | ✔ SellScreen + 12 sell components               | ✔ src/domain/sales                                 | ✔ Zod `saleCreateSchema` + money-guard recalc | ✔ sales/sale_items/sale_payments/stock_movements                                 | ✔ sales.create + 5 | ✔ one tx    | ✔ FR mapping | ✔ unit+int+db+e2e (`sale-flow.spec.ts`) | 114,131,132     | **COMPLETE**          |
| 2   | **Produits / catalogue**            | ✔ ProductsScreen + FormDialog (54 KB)           | ✔ src/domain/product                               | ✔ `productCreateSchema`                       | ✔ products + product_barcodes + product_suppliers + product_packagings           | ✔ 12               | ✔           | ✔            | ✔                                       | 009,050,054     | **COMPLETE**          |
| 3   | **Clients**                         | ✔ ClientsScreen + 9 dialogs                     | ✔ src/domain/customer                              | ✔ `customerCreateSchema`                      | ✔ customers + customer_access                                                    | ✔ 11               | ✔           | ✔            | ✔                                       | 112             | **COMPLETE**          |
| 4   | **Stock**                           | ✔ StockScreen + 6 dialogs                       | ✔ src/domain/inventory                             | ✔ `stockIntakeSchema`                         | ✔ stock_movements + stock_intakes + inventory_layers + sale_fifo_consumption     | ✔ 9                | ✔           | ✔            | ✔                                       | 010,021,137     | **COMPLETE**          |
| 5   | **Fournisseurs**                    | ✔ SuppliersScreen + 5 dialogs                   | ✔ src/domain/suppliers                             | ✔ `supplierCreateSchema`                      | ✔ suppliers + supplier_payments + supplier_returns                               | ✔ 10               | ✔           | ✔            | ✔                                       | 009,100         | **COMPLETE**          |
| 6   | **Historique**                      | ✔ HistoryScreen + dialogs                       | ✔ src/domain/sales                                 | ✔ `historyListSchema`                         | ✔ read-only over sales/returns/expenses                                          | ✔ 3                | —           | ✔            | ✔                                       | 011             | **COMPLETE**          |
| 7   | **Retours**                         | ✔ ReturnsScreen + 6 dialogs                     | ✔ src/domain/returns                               | ✔ `returnCreateSchema` + `returnRefundSchema` | ✔ returns + return_items + return_refund_movements + customer_credit_allocations | ✔ 8                | ✔           | ✔            | ✔                                       | 012,138,139     | **COMPLETE**          |
| 8   | **Dépenses**                        | ✔ ExpensesScreen + dialogs                      | ✔ src/domain/expenses                              | ✔ `expenseCreateSchema`                       | ✔ expenses                                                                       | ✔ 5                | ✔           | ✔            | ✔                                       | 014,019         | **COMPLETE**          |
| 9   | **Dettes**                          | ✔ DebtsScreen + dialogs                         | ✔ src/domain/customer                              | ✔ `debtsListSchema`                           | ✔ customers.outstanding_balance_minor                                            | ✔ 3                | —           | ✔            | ✔                                       | 015             | **COMPLETE**          |
| 10  | **Devis (proformas)**               | ✔ ProformasScreen + dialogs                     | ✔ src/domain/proforma                              | ✔ `proformaCreateSchema`                      | ✔ proforma_invoices + proforma_items                                             | ✔ 8                | ✔           | ✔            | ✔                                       | 004,121         | **COMPLETE**          |
| 11  | **Achats / commandes fournisseurs** | ✔ SupplierPOsDialog                             | ✔ src/domain/suppliers                             | ✔ `purchaseCreateSchema`                      | ✔ purchase_orders + purchase_order_items                                         | ✔ 6                | ✔           | ✔            | ✔                                       | 029             | **COMPLETE**          |
| 12  | **Rapports**                        | ✔ ReportsScreen + widgets + CashSessionsSection | ✔ src/domain                                       | ✔ `reportSummarySchema`                       | ✔ read-only aggregates                                                           | ✔ 1                | —           | ✔            | ✔                                       | 039,147         | **COMPLETE**          |
| 13  | **Tableau de bord**                 | ✔ DashboardScreen (51 KB)                       | ✔ src/domain                                       | ✔ `dashboard` channel                         | ✔ read-only aggregates                                                           | ✔ 1                | —           | ✔            | ✔                                       | 039,147,154     | **COMPLETE**          |
| 14  | **Clôture Z**                       | ✔ (Reports)                                     | ✔ src/domain/closings                              | ✔ `closings`                                  | ✔ daily_closings + audit_log                                                     | ✔ 3                | ✔           | ✔            | ✔                                       | 048,058         | **COMPLETE**          |
| 15  | **Sessions de caisse**              | ✔ CashSessionsSection                           | ✔ src/domain/cash                                  | ✔ `cashSessionOpenSchema`                     | ✔ cash_sessions                                                                  | ✔ 5                | ✔           | ✔            | ✔ e2e `cash-sessions.spec.ts`           | 170             | **COMPLETE**          |
| 16  | **Zakat**                           | ✔ ZakatScreen + dialogs                         | ✔ src/domain/zakat                                 | ✔ `zakatCalculationSchema`                    | ✔ zakat_calculations + params                                                    | ✔ 4                | ✔           | ✔            | ✔                                       | 012             | **COMPLETE**          |
| 17  | **Paramètres**                      | ✔ SettingsScreen + 2 sections files             | ✔                                                  | ✔ `settingsSaveSchema`                        | ✔ app_settings + company_profile + print_templates                               | ✔ 4                | ✔           | ✔            | ✔                                       | 017,143,145     | **COMPLETE**          |
| 18  | **Licence / activation**            | ✔ LicenseScreen + LicenseBadge                  | ✔ src/domain (read-only mirror)                    | ✔ `licenseActionSchema`                       | ✔ secure-state + anchor                                                          | ✔ 4                | ✔           | ✔            | ✔ e2e `license-activation.spec.ts`      | 025,115         | **COMPLETE**          |
| 19  | **Staff / rôles**                   | ✔ StaffGate, UsersAdmin, ChangeCode, Recovery   | ✔                                                  | ✔ `staff*Schema`                              | ✔ staff_users + staff_user_permissions + staff_recovery                          | ✔ 10               | ✔           | ✔            | ✔ e2e `staff-session.spec.ts`           | 041,042,085-087 | **COMPLETE**          |
| 20  | **Impression / modèles**            | ✔ PrintTemplatesScreen + studio                 | ✔ src/domain/print                                 | ✔ `print`/`templates` schemas                 | ✔ print_templates                                                                | ✔ 12               | —           | ✔            | ✔ e2e `print-studio.spec.ts`            | 013,064,097     | **COMPLETE**          |
| 21  | **OCR → stock**                     | ✔ OcrImportDialog (46 KB)                       | ✔ src/domain/ocr                                   | ✔ `ocr` schemas                               | ✔ (proposes an intake)                                                           | ✔ 5                | ✔           | ✔            | ✔                                       | 022             | **COMPLETE**          |
| 22  | **Sauvegarde / restauration**       | ✔ (Settings)                                    | ✔                                                  | ✔                                             | ✔ backups (filesystem)                                                           | ✔ 6                | ✔           | ✔            | ✔ e2e `stock-backup.spec.ts`            | 003,047         | **COMPLETE**          |
| 23  | **Sync / miroir client**            | ✔ ClientMobileAccess, ClientCatalogSection      | ✔ src/domain/customer/client-access                | ✔ `syncConfigSchema`                          | ✔ sync_outbox + customer_access + client_access_history                          | ✔ 8                | ✔           | ✔            | ✔                                       | 053,158,162     | **COMPLETE**          |
| 24  | **Commandes clients (ADR-182)**     | ✔ OrdersScreen                                  | ✔ src/domain/order/client-order (**under-tested**) | ✔ `clientOrderCreateSchema`                   | ✔ client_orders + client_order_lines                                             | ✔ 4                | ✔           | ✔            | ◐                                       | 182             | **PARTIAL — GATE-02** |
| 25  | **Annonces magasin**                | ✔ (Settings)                                    | ✔                                                  | ✔ `announcementSaveSchema`                    | ✔ announcements                                                                  | ✔ 3                | ✔           | ✔            | ✔                                       | 166             | **COMPLETE**          |
| 26  | **Liasse propriétaire**             | ✔ (Settings)                                    | ✔                                                  | ✔                                             | ✔ owner snapshot (outbox)                                                        | ✔ 1                | ✔           | ✔            | ✔                                       | 171             | **COMPLETE**          |
| 27  | **Import / export CSV**             | ✔ (Products, Customers)                         | ✔ src/domain/import                                | ✔ `productsImportSchema`                      | ✔ via create/update paths                                                        | ✔ 2                | ✔           | ✔            | ✔ e2e `csv-import-export.spec.ts`       | 130,135         | **COMPLETE**          |

**27 feature areas · 26 COMPLETE · 1 PARTIAL · 0 VISUAL_ONLY · 0 NOT_IMPLEMENTED**

## 3. Mechanical dead-code analysis

| Check                                       | Method                                                | Result                                                                          |
| ------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| Channels declared but never registered      | set difference, `channels.ts` vs all `ipcMain.handle` | **0** (2 are main→renderer events)                                              |
| Handlers registered for undeclared channels | set difference, reverse                               | **0**                                                                           |
| Channels not exposed in the preload         | set difference                                        | **0**                                                                           |
| Preload references to undeclared channels   | set difference                                        | **0**                                                                           |
| Channels with no renderer caller            | bridge-path grep over `src/**`                        | 3 — `recovery.retry`, `recovery.exit` (recovery window), `ocr.progress` (event) |
| Channels not reachable via the `api` facade | facade ↔ bridge mapping                               | 14 — all verified as intentional aliases or event channels (see §4)             |
| Empty `onClick` handlers                    | regex over `src/features/**`                          | **0**                                                                           |
| `console.log` in the renderer               | regex                                                 | **0**                                                                           |
| Orphan repository functions                 | `knip` (exit 0) + manual review of 33 `*.repo.ts`     | **0** reported by knip                                                          |
| Dead code (knip, whole repo)                | `npm run knip` → exit 0                               | **0**                                                                           |

### The 14 channels not reachable via the `api` facade

All 14 were individually checked and are **intentional**:

| Channel                                                     | Why it is not in the facade                                                             |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `products.matchBatch`                                       | used internally by the sale flow via the bridge directly                                |
| `customers.recordPayment`                                   | used by `PaymentDialog` via `useClientDrawerActions`                                    |
| `customers.accessActivate` / `accessStatus` / `accessQrSvg` | used by `ClientMobileAccess.tsx` via the bridge                                         |
| `sync.enqueue` / `sync.pushNow`                             | invoked internally by the sale/payment flow (`enqueueSaleRefresh`)                      |
| `suppliers.pay`                                             | used by `supplierPayment` in the supplier dialogs                                       |
| `closings.get`                                              | used by the reports screen                                                              |
| `sales.create`                                              | used by `sell-finalize.ts` (`a.sales.create(...)` at line 316) — the critical sale path |
| `recovery.retry` / `recovery.exit`                          | the separate recovery window, not the SPA                                               |
| `window.maximizedChanged`                                   | a main→renderer event                                                                   |

**None of these is dead.** The most safety-critical one — `sales.create` — is reached through `src/features/sales/sell/sell-finalize.ts:316`, which was verified directly.

## 4. Findings

```text
ID: SLICE-01
TITLE: The client-orders vertical slice is implemented end to end but its domain contract is under-tested, failing the per-file coverage gate
SEVERITY: P1
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-slice (cross-ref veloria-gates)
AFFECTED_MODULE: src/domain/order, src/features/orders, electron/ipc/handlers/client-order.repo.ts
FILE: src/domain/order/client-order.ts
LINE_RANGE: 14-66
PROBLEM:
  ADR-182 tranche C added the client-orders feature. The slice is complete in
  structure — UI (src/features/orders/OrdersScreen.tsx, 21 KB), domain
  (src/domain/order/client-order.ts), persistence (client_orders +
  client_order_lines, migration 0063), IPC (orders.list/get/create/setStatus),
  and a main-side twin (electron/ipc/handlers/client-order.repo.ts).
  But the domain module — which defines a STATE MACHINE with two terminal states
  — is only 46.66% line-covered and 33.33% function-covered, below the project's
  own blocking per-file thresholds (80/75/88/80). The uncovered code is
  orderStatusLabelFr() and parts of the transition table.
  The module's own header claims the transitions are an "EXACT MIRROR" of the
  SQL trigger trg_client_orders_status_transition — an assertion that is NOT
  proven by any test the audit could locate.
EVIDENCE:
  src/domain/order/client-order.ts:14-32
    export const ORDER_STATUSES = ["nouvelle","preparing","ready","served","cancelled"] as const;
    export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
      nouvelle: ["preparing","ready","served","cancelled"],
      preparing: ["ready","served","cancelled"],
      ready: ["served","cancelled"],
      served: [],
      cancelled: [],
    };
  src/domain/order/client-order.ts:22-25
    "Transitions autorisées — MIROIR EXACT du trigger
     `trg_client_orders_status_transition` (migration 0063)."
  src/domain/order/client-order.ts:35-38 — canTransitionOrder()
  src/domain/order/client-order.ts:41-54 — orderStatusLabelFr() (a switch over
  all five statuses, the most likely uncovered branch)
  $ npm run test:coverage -> EXIT=1
    ERROR: Coverage for lines (46.66%) does not meet global threshold (80%) for src/domain/order/client-order.ts
    ERROR: Coverage for functions (33.33%) does not meet global threshold (88%) for src/domain/order/client-order.ts
  database/migrations/0063_client_orders.sql — creates client_orders, client_order_lines
  and the status-transition trigger.
ROOT_CAUSE:
  The slice was delivered on a feature branch with a partially-written test
  file; the coverage gate correctly detected the shortfall and is blocking.
IMPACT:
  Moderate. The slice is functionally complete and the database trigger is the
  real enforcement point, so a divergence between the domain twin and the
  trigger would most likely be caught at the database. But the divergence would
  be user-visible (the UI would offer a transition the database rejects, or
  vice versa), and no test proves the two agree.
RECOMMENDED_FIX:
  Do not lower the threshold and do not exclude the file. Add:
  (a) a table-driven test over ORDER_STATUSES asserting orderStatusLabelFr()
      returns a non-empty French label for each status;
  (b) a test over ORDER_TRANSITIONS asserting canTransitionOrder() accepts every
      listed transition and rejects every unlisted one;
  (c) a MIRROR test against the SQL trigger — build a temp DB with migration
      0063, attempt each transition pair, and assert the DB accepts exactly the
      pairs ORDER_TRANSITIONS allows;
  (d) formatOrderReference() edge cases (counter <= 0 throws; empty prefix
      falls back to "CMD").
  Test (c) is the valuable one — it is the missing proof of the module's own
  headline claim.
REGRESSION_TEST:
  The four tests above; the coverage gate then goes green with no threshold
  change.
DEPENDENCIES:
  GATE-02 (the same failure, viewed as a gate defect rather than a slice defect).
```

```text
ID: SLICE-02
TITLE: The feature-matrix evidence required by the slice checklist is not recorded anywhere, so a future auditor cannot tell complete from unverified without redoing this analysis
SEVERITY: P3
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-slice (cross-ref veloria-orchestrator)
AFFECTED_MODULE: docs
FILE: docs/reports/E2E_COVERAGE_MATRIX.md
LINE_RANGE: n/a (existing artefact)
PROBLEM:
  The slice checklist requires per-feature verification evidence: "Tests cover
  behavior and failure paths", "Acceptance criteria are mapped to tests or
  explicit manual verification", and the project contract requires phase
  progress in docs/reports/PHASE_X_REPORT.md.
  The project HAS a feature-to-test matrix (docs/reports/E2E_COVERAGE_MATRIX.md)
  and 182 ADRs, but no artefact maps each FEATURE to its (UI, domain, repo, IPC,
  migration, tests) chain in one place — that mapping had to be reconstructed by
  this audit from four independent mechanical sources.
EVIDENCE:
  docs/reports/E2E_COVERAGE_MATRIX.md exists and maps features to E2E specs.
  docs/ADR-001..ADR-182 record decisions per feature.
  No file maps feature -> channel -> repository -> migration -> test.
  The audit had to build that map with a bespoke script intersecting channels.ts,
  the registry files, the preload bridge, ipc-client.ts and the renderer call
  sites.
ROOT_CAUSE:
  The evidence is distributed across ADRs, test names and code, with no
  generated index.
IMPACT:
  Low operationally, moderate for maintainability: "is feature X complete?"
  currently costs a full manual trace. It also means the completeness matrix
  goes stale silently — exactly the drift this audit had to detect.
RECOMMENDED_FIX:
  Generate the feature matrix as part of the existing metrics pipeline
  (docs/METRICS.md is already generated and verified by `verify:docs`): a
  script that intersects the channel set, the handler set, the preload bridge,
  the api facade and the test files, and emits a feature-to-chain table. A
  channel with no test would then show up automatically.
REGRESSION_TEST:
  The generator itself; optionally, a gate that fails when a channel added in
  the last N commits has no corresponding test.
DEPENDENCIES:
  None.
```

```text
ID: SLICE-03
TITLE: The sales.create bridge path bypasses the typed api facade, so the highest-value mutation is not covered by the facade's uniformity guarantees
SEVERITY: P3
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-slice
AFFECTED_MODULE: src/features/sales/sell, src/shared/types/ipc-client.ts
FILE: src/features/sales/sell/sell-finalize.ts
LINE_RANGE: 316
PROBLEM:
  Nearly every renderer call goes through the typed `api` facade in
  src/shared/types/ipc-client.ts, which centralises the VeloriaOutcome
  unwrapping and the French error mapping. The single most important mutation
  in the product — creating a sale — instead calls the bridge directly:
  `a.sales.create(...)`, obtained through a local `bridge()` accessor, and
  handles its outcome separately.
EVIDENCE:
  src/features/sales/sell/sell-finalize.ts:316
    a.sales.create(
  src/shared/types/ipc-client.ts:38-238 — the `api` facade. It contains
    `saleGet`, `salesHistory`, `saleCancel`, `saleReopen`, `saleSetDueDate`
    — every OTHER sale channel — but NOT `saleCreate`.
  src/shared/types/ipc-client.ts:4-7
    function bridge(): NonNullable<Window["veloria"]> {
      if (!window.veloria) throw new Error("Pont applicatif indisponible (preload).");
      return window.veloria;
    }
  src/shared/types/ipc-client.ts:9-36 — `call()` is the wrapper that maps a raw
  bridge rejection to "Réponse du programme de caisse perdue : réessayez."
ROOT_CAUSE:
  The sale flow needs to construct and observe a richer payload than the facade's
  generic `unknown` signature allows, so it uses the bridge directly with local
  typing.
IMPACT:
  Low. The flow is not broken and the error handling is evidently explicit. The
  risk is that the sale path is the one path that does NOT benefit from the
  facade's uniform "no raw rejection reaches the UI" guarantee, so a future
  change to the error contract could expose the raw English Electron message
  in the most visible screen of the application.
RECOMMENDED_FIX:
  Add `saleCreate` to the `api` facade with a typed payload and result (the
  shape is already described in src/shared/types/ipc-contracts.ts:66 — "Vente
  créée (sales.create / conversions) : id + numéro, jamais de cast") and have
  sell-finalize.ts use it, so the sale path inherits the facade's error
  contract like every other mutation.
REGRESSION_TEST:
  A test asserting that the facade exposes every mutating channel used by the
  renderer — a completeness check that would have caught this.
DEPENDENCIES:
  None.
```

## 5. What is genuinely solid

- **Zero visual-only modules.** All 17 navigation modules map to a real screen with a real data path. The mechanical sweep found 0 empty handlers and 0 unwired buttons.
- **Every channel is reachable, and every handler is declared.** The two set differences that usually reveal dead code are both empty.
- **The sales path is the most complete slice in the product**: UI → `api`/bridge → `saleCreateSchema` → `priceLine` recalculation in main → `createSaleAtomic` (one transaction) → sales/sale_items/sale_payments/stock_movements/sale_fifo_consumption → audit_log, with an operationId, a unique invoice number allocated in the same transaction, and 15 E2E specs.
- **The cross-app boundary is respected.** `src/` never imports `electron/`; the required duplications (money-guard, business-day, client-order, return-settlement) are explicit, documented as mirrors, and covered by parity tests — a deliberate architectural choice (ADR-062) rather than accidental coupling.
- **Documentation is unusually dense for a vertical-slice product**: 182 ADRs, a phase report per phase, an E2E coverage matrix, and a generated metrics file that a gate verifies is in sync.

## 6. Not verified / limits of this audit

- **The 14 channels not in the `api` facade were checked individually** (all intentional), but the audit did not trace every one of the 187 facade functions to its renderer caller — the sweep established reachability, not usage frequency.
- The feature matrix's "Tests" column reflects the audit's identification of test files per feature, not an exhaustive per-feature test inventory.
- Physical acceptance (real printer, real scanner, real installation) is outside a slice's automated completion criteria and was not performed.
- The `mobile/` and `owner/` applications were not audited as slices in this pass.

## 7. Metrics

| Metric                           | Value                         |
| -------------------------------- | ----------------------------- |
| Feature areas mapped             | 27                            |
| COMPLETE                         | 26                            |
| PARTIAL                          | 1 (client-orders)             |
| VISUAL_ONLY                      | 0                             |
| NOT_IMPLEMENTED                  | 0                             |
| Channels analysed                | 201                           |
| Channels with a handler          | 199                           |
| Channels with no renderer caller | 3 (all intentional)           |
| Channels not in the `api` facade | 14 (all verified intentional) |
| Empty click handlers             | 0                             |
| Orphan repositories (knip)       | 0                             |
| Skill checklist items evaluated  | 11 (9 VERIFIED, 2 PARTIAL)    |
| Findings                         | 3 (P1×1, P3×2)                |
