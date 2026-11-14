# 09 — ARCHITECTURE AS FOUND

**Audit ID:** `2026-11-11-full-forensic-audit`
**This document is the architecture RECONSTRUCTED FROM THE CODE**, not copied from `docs/specs-archive/` or any prior report. Every claim below is traceable to a file in this repository.

## 1. System context

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              VELORIA ECOSYSTEM                               │
│                                                                              │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐  │
│   │  POS (Win)   │   │License Mgr   │   │ Client APK   │   │  Owner APK   │  │
│   │ Electron 45  │   │ (vendor)     │   │  Expo/RN     │   │  Expo/RN     │  │
│   │ React 19     │   │ Electron     │   │              │   │              │  │
│   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘  │
│          │                  │                  │                  │          │
│          │  signed .vlic    │                  │   anon key      │          │
│          │◄─────────────────┘                  │   (RLS denied)  │          │
│          │                                     ▼                  ▼          │
│          │                          ┌──────────────────────────────┐        │
│          │  service_role key       │   SUPABASE MIRROR             │        │
│          │  (main process only)    │   Postgres + PostgREST       │        │
│          └────────────────────────►│   + 2 Edge Functions          │        │
│                                    │   RLS: NO policies, REVOKE   │        │
│                                    └──────────────┬───────────────┘        │
│                                                   │                        │
│                              ┌────────────────────┴──────────┐             │
│                              │  SQLite (POS master)         │             │
│                              │  57 tables · FK ON · WAL     │             │
│                              └───────────────────────────────┘             │
└──────────────────────────────────────────────────────────────────────────────┘

                     website/ — static showcase (independent)
```

## 2. The POS internal architecture

### 2.1 Layer 1 — `src/features/**` (123 files, 17 areas)

React screens, dialogs and hooks. The ONLY consumers of privileged operations.

```
src/features/
  sales/      SellScreen + 13 components (cart, search, totals, settle, pay, quantity…)
  products/   ProductsScreen + FormDialog (54 KB) + DetailsDrawer + LabelsDialog
  customers/  ClientsScreen + 9 dialogs (form, drawer, debts, payment, mobile access)
  stock/      StockScreen + 6 dialogs (adjustment, intake, inventory, history, OCR import)
  suppliers/  SuppliersScreen + 5 dialogs (+ PO dialog, 25 KB)
  returns/    ReturnsScreen + 6 dialogs (customer, supplier, refund, slip)
  proformas/  ProformasScreen + ProformaDialogs (38 KB)
  expenses/   ExpensesScreen + ExpenseDialogs
  debts/      DebtsScreen + DebtDialogs
  history/    HistoryScreen + HistoryDialogs
  reports/    ReportsScreen + widgets + CashSessionsSection
  dashboard/  DashboardScreen (51 KB) + widgets
  orders/     OrdersScreen (ADR-182, in flight)
  settings/   SettingsScreen + SettingsSectionsA/B (92 KB) + ClientCatalogSection
  staff/      StaffGate + UsersAdmin + ChangeCode + RecoveryCode + StaffRecover
  license/    LicenseScreen + LicenseBadge + use-license
  print-templates/ PrintTemplatesScreen + TemplateSettingsPanel
  zakat/      ZakatScreen + ZakatDialogs
```

### 2.2 Layer 2 — `src/shared/**` (32 files) and `src/app/**` (11 files)

```
src/shared/
  money/parse.ts          strictOrNum / strictOrNeg / strictOrNegTotal  → @domain/money
  formatters/  dates/  errors/ (fr-map)  company/  documents/  export/
  printer/  sales/  settings/  charts/  sound/  ui/  types/
src/app/shell/
  App.tsx (15 KB)         the shell; owns the module state (useState, no router)
  modules.ts              the 17-module registry: id, FR label, hint, icon, group, licence pages
  module-screens.ts       lazy() per module (16 chunks)
  Sidebar.tsx  TopBar.tsx  WindowChrome.tsx  ShellOverlays.tsx
  use-notifications.ts    the notification band (backup status, licence, sync)
  use-vigilance.ts        the alert/watchdog hook
```

**Key fact:** the app has **no router**. Navigation is `useState` in `App.tsx`, and the shell module registry is the single source of the navigation and its licence-hint mapping.

### 2.3 Layer 3 — `src/domain/**` (38 files) — pure, framework-free

```
domain/
  money/money.ts (346 L)          MINOR_PER_MAJOR=100, MAX_MINOR_SINGLE=1e9,
                                  MAX_MINOR_TOTAL=1e11, strict parser, format, guards
  common/business-day.ts          the business-day twin
  sales/                          sale rules
  pricing/ invoice/ returns/ expenses/ cash/ closings/ zakat/
  inventory/ packaging/ units/ product/ suppliers/ customer/
  barcode/ import/ order/ print/ ocr/ backup/
```

`src/domain/**` imports no framework, no Electron, no SQLite. It is pure logic.

### 2.4 Layer 4 — `electron/preload/preload.ts` (339 lines)

The **only** renderer→main path. A named `api` object exposed via `contextBridge`:

```
app(2) database(6) system(4) products(12) customers(11) sync(8) clientCatalog(3) orders(4)
announcements(3) categories(2) settings(2) staff(10) stock(9) suppliers(10) purchase(6)
proformas(9) debts(3) closings(3) cash(5) zakat(4) printer(2) templates(7) sales(7)
carts(2) returns(8) expenses(5) reports(1) dashboard(1) history(3) company(2) productsExtra(1)
printing(24) backup(6) ocr(5) recovery(2) license(4) window(5)
```

**Exposed:** 201 named methods across 41 namespaces. **Not exposed:** raw `ipcRenderer`, `fs`, `invoke(channel, …)`, any SQL capability.

### 2.5 Layer 5 — `electron/ipc/**` (69 files)

```
channels.ts          the 201 channel names (single source)
handle.ts            THE choke point for 161 channels:
                       licence gate → page gate → feature gate → debt gate
                       → Zod parse → operationId requirement → credit gate
                       → staff gate → must_change_code lock → handler
                       → {ok,data} | {ok:false,code,message(FR)}
registry.ts          composes the 12 domain registries
registry.*.ts        core, system, catalog, clientcatalog, clientorder, customers,
                     sales, finance, stock, staff, documents, recovery   (164 handle() calls)
validators.*.ts      13 files, 167 Zod schemas
license-gates.ts     68 LIC · 117 PAGE · 10 FEATURE · 2 DEBT
staff-gates.ts       146 staff-gated channels
credit-gates.ts      the credit-limit gates
money-guard.ts       the main-side money mirror (parity-tested)
raw-guards.ts        the 38 raw channels' guard, machine-verified against the code
handlers/*.repo.ts   33 repository files — all business writes
```

**The 38 raw channels** (`ipcMain.handle` directly, bypassing `handle()`):
25 printing · 6 backup · 4 OCR · 2 recovery · 1 printer.save — all covered by `enforceRawChannelGates`, and the coverage is machine-verified by a test.

### 2.6 Layer 6 — `electron/database/sqlite.service.ts` (22 KB)

The SOLE owner of the connection.

```
PRAGMA foreign_keys = ON          PRAGMA journal_mode = WAL
PRAGMA synchronous = FULL         PRAGMA busy_timeout = 10000
PRAGMA wal_autocheckpoint = 1000  PRAGMA temp_store = MEMORY
PRAGMA trusted_schema = OFF       (best-effort)

63 migrations, forward-only, sealed by database/migrations.lock.json (sha256)
snapshotBeforeMigration()    → fail-closed (throws; the migration does not proceed)
snapshotBeforeFactoryReset() → fail-closed (VACUUM INTO before unlinking)
```

### 2.7 Layer 7 — the specialist modules

```
electron/licensing/ (10)  Ed25519 protocol, public-key loading, secure-state (integrity-tagged
                          monotonic anchor), fingerprint, catalog, license-anchor, integrity
electron/sync/ (5)        sync.service (63 KB), owner-snapshot (56 KB), sync.protocol (20 KB),
                          client-catalog, sync-secrets
electron/printing/ (36)   8 document builders, guards, watchdog, capabilities, page-size,
                          printer-settings, pdf-exports, receipt-documents/ (20)
electron/backup/ (1)      VACUUM INTO backup, restore with staging + verification, retention
electron/ocr/ (4)         tesseract.js pipeline, file selection
electron/security/ (1)    navigation allow-list, path validation
electron/services/ (3)    logger, file-ui, logo
electron/shared/ (1)      business-day
electron/main/ (7)        main, window-manager, startup-flow, app-lifecycle,
                          crash-recovery, license-view, recovery-view
```

## 3. The src ↔ electron mirroring (7 duplicated rules)

Architecturally forced by the separate tsconfig rootDirs. Each duplicate is documented as a mirror and paired with a parity test.

| Rule                       | Domain                                    | Main                                         | Parity proof                                   |
| -------------------------- | ----------------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| Money caps + line pricing  | `src/domain/money/money.ts`               | `electron/ipc/money-guard.ts`                | `money-guard-parity.test.ts`                   |
| Business day / date SQL    | `src/domain/common/business-day.ts`       | `electron/shared/business-day.ts`            | `main-domain-parity.test.ts`                   |
| Return settlement + status | `src/domain/returns/return-rules.ts`      | `electron/ipc/handlers/return-settlement.ts` | `main-domain-parity.test.ts`                   |
| Purchase-cost allocation   | `src/domain/packaging/packaging-rules.ts` | `electron/ipc/handlers/cost-allocation.ts`   | ADR-167 (untested wrapper removed)             |
| Global discount allocation | `src/domain/proforma/proforma-rules.ts`   | `electron/ipc/handlers/amount-allocation.ts` | `proforma-discount-parity.test.ts`             |
| Order state machine        | `src/domain/order/client-order.ts`        | `electron/ipc/handlers/client-order.repo.ts` | `client-order-parity.test.ts`                  |
| Closing formula            | `src/domain/closings/closing-rules.ts`    | `electron/ipc/handlers/finance.repo.ts`      | claimed by `documents.test.ts` (not confirmed) |

## 4. The data model as found

57 tables, grouped:

| Domain      | Tables                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| Core        | `schema_migrations`, `app_meta`, `app_settings`, `number_sequences`, `company_profile`                |
| Catalogue   | `categories`, `suppliers`, `products`, `product_barcodes`, `product_suppliers`, `product_packagings`  |
| Customers   | `customers`, `customer_access`, `customer_access_history`, `customer_credit_allocations`              |
| Sales       | `sales`, `sale_items`, `sale_payments`                                                                |
| Stock       | `stock_movements`, `stock_intakes`, `stock_intake_items`, `inventory_layers`, `sale_fifo_consumption` |
| Returns     | `returns`, `return_items`, `return_refund_movements`, `supplier_returns`, `supplier_return_items`     |
| Money       | `expenses`, `supplier_payments`                                                                       |
| Documents   | `proforma_invoices`, `proforma_items`, `purchase_orders`, `purchase_order_items`                      |
| Closing     | `daily_closings`, `cash_sessions`, `zakat_calculations`, `audit_log`                                  |
| Bridge      | `sync_outbox`, `announcements`, `client_orders`, `client_order_lines`                                 |
| Printing    | `print_templates`                                                                                     |
| Staff       | `staff_users`, `staff_user_permissions`, `staff_recovery`                                             |
| Idempotency | `idempotency_keys`                                                                                    |
| Legacy      | `bread_orders` (module removed per ADR-109)                                                           |

**Integrity inventory:** 217 CHECK · 77 triggers · 166 indexes · 7 views · 90 inline REFERENCES.
**Money:** 99 `*_minor` columns, all INTEGER (machine-verified).
**Quantity:** 26 columns, all NUMERIC (float affinity — see DB-01).

## 5. The main data flows

### 5.1 A sale

```
renderer  api.sales.create(payload with operationId)
   │        → Zod (saleCreateSchema, 500-line max, moneyMinor bounds)
   ▼
main      license gate · sales page gate · staff gate · operationId required
   │      → priceLine() recomputes every line (unit × qty, discount, billed total)
   │      → subtotal − discount + delivery = total; paid > total → refused
   ▼
repo      createSaleAtomic():
            1  re-read products, customers, packagings inside the transaction
            2  aggregate demand per product, THEN compare against availability
            3  allocate the invoice number
            4  INSERT sales
            5  INSERT sale_items (+ cogs_minor snapshot)
            6  consume FIFO layers (oldest-first, transaction-guarded, tripwired)
            7  UPDATE products.quantity (negative refused)
            8  INSERT stock_movements (sale_out)
            9  INSERT sale_payments
           10  UPDATE customers.outstanding_balance_minor (atomic, credit-limit guarded)
   ▼
side      enqueueSaleRefresh() → sync_outbox (AFTER the commit — never blocking)
```

### 5.2 A daily close

```
renderer  api.closingCreate({businessDate, openingMinor, operationId})
   ▼
repo      one transaction:
            cash sales      ← sale_payments (method='cash', today, sale not cancelled)
                              + legacy fallback guarded by NOT EXISTS
            collections     ← all cash movements today − cash sales
            expenses        ← expenses WHERE status = 'paid'
            refunds         ← return_refund_movements (dated by the movement instant)
                              + legacy fallback guarded by NOT EXISTS
            closing = opening + cashSales + collections − expenses − refunds
            INSERT daily_closings
            INSERT audit_log ('closing.created')
```

The closed-period lock (migration 0048, 15 triggers + 0058) blocks any later write on that business date — **in the database, not in the UI**.

### 5.3 The mirror push

```
sale committed locally
   → sync_outbox row (operation_id UNIQUE, status pending)
   → tryClaimBeforeSend(operationId)   [claim BEFORE the network call]
   → POST to Supabase PostgREST (service_role, main process only)
   → mark sent / failed; bounded batches (LIMIT 200 outbox, LIMIT 500 access)
   → corrupted rows quarantined individually, not blocking the queue
```

## 6. Architectural characteristics the audit verified

| Property                                    | Status                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| Renderer → native isolation                 | **ENFORCED** (0 imports; separate rootDirs)                                    |
| main → renderer isolation                   | **ENFORCED** (0 native imports in `src/`; 0 browser storage for business data) |
| Explicit IPC surface, no escape hatch       | **ENFORCED** (201 named channels, 0 generic)                                   |
| Authorisation in trusted code               | **ENFORCED** (68 LIC, 117 PAGE, 10 FEATURE, 146 STAFF, 2 DEBT)                 |
| Idempotency on every mutation               | **ENFORCED** (operationId; refused if missing)                                 |
| Atomicity on every mutation                 | **ENFORCED** (verify:domain: 70/70 in a transaction)                           |
| Foreign-key enforcement                     | **ENFORCED** (PRAGMA + verify)                                                 |
| Migration immutability                      | **ENFORCED** (sha256 lock)                                                     |
| Fail-closed before destructive operations   | **ENFORCED** (pre-migration and pre-reset snapshots)                           |
| Money type purity                           | **ENFORCED** (99/99 INTEGER, machine-verified)                                 |
| Offline-first core operations               | **ENFORCED** (no network call on any sale/stock/report path)                   |
| Per-customer isolation in the mirror        | **ENFORCED structurally** (RLS deny-by-default + REVOKE)                       |
| Authorisation in the renderer               | **NOT APPLICABLE** — the renderer has no authority                             |
| Sender-frame validation at the IPC boundary | **ABSENT** (SEC-01)                                                            |
| Quantity type purity                        | **ABSENT** (DB-01)                                                             |
| Code signing of the release artefacts       | **ABSENT** (SEC-05)                                                            |
| Physical device acceptance                  | **ABSENT** (HW-02)                                                             |
