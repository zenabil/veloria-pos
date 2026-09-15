# 02 — Current V108 Codebase Audit

## Audit basis

This audit is based on the supplied `VELORIA-PoS-v2.22.0-V108-FINAL.zip` source tree.

## Observed current stack

- Next.js App Router with static export
- React 19.0.0 in the supplied package
- TypeScript 6.0.3 in the supplied package
- Tailwind CSS 4.3.3 in the supplied package
- Electron 44.2.0
- electron-builder 26.15.3
- better-sqlite3 13.0.3
- Zustand 5.0.14
- Radix UI primitives
- Recharts
- Dexie 4.4.2
- PapaParse
- Tesseract.js
- jsPDF / html2canvas

## Current architecture discovered

The codebase already attempts layered boundaries:

```text
src/app
  -> presentation / application
  -> domain

infrastructure
  -> persistence / printing / backup / remote / sync

electron
  -> main / preload / IPC / SQLite / printing / hardware / backup
```

However, the implementation remains hybrid.

## Significant legacy/hybrid findings

### 1. Two local persistence models

The project contains:

- `src/infrastructure/persistence/browser-database.ts` using Dexie/IndexedDB
- `src/infrastructure/persistence/electron-database-api.ts`
- `src/infrastructure/persistence/sqlite-adapter.ts`
- `electron/services/SQLiteService.js`

This creates two persistence models for the same product domain. The from-scratch design should remove the browser database as a business persistence path.

### 2. Remote synchronization remnants

The supplied codebase contains:

- `src/infrastructure/remote/*`
- `src/infrastructure/sync/*`
- `sync_queue`
- `outbox`
- `sync_state`
- `conflicts`
- `transaction_journal`
- `syncStatus` fields across entities

Those structures were built for optional Google Sheets/cloud synchronization. They are unnecessary complexity for a SQLite-only desktop release. A new build should retain crash-safe local transaction journaling only where it provides a concrete reliability benefit, while removing cloud-sync state from the core domain and persistence schema.

### 3. Service layer duplication

The code contains many files under `src/services/` while application use cases also exist under `src/application/`. This creates a compatibility/service layer that makes responsibility boundaries harder to understand.

The new structure should move business operations into feature/application use cases and keep infrastructure services narrowly technical.

### 4. Very large files

Observed large source files include, among others:

- `electron/services/SQLiteService.js`
- `electron/ipc/IpcDispatcher.js`
- `src/infrastructure/persistence/sqlite-adapter.ts`
- `src/infrastructure/sync/sync-engine.ts`
- `src/services/customer.service.ts`
- `src/services/product.service.ts`
- several large route and dialog components

The new build should avoid God classes/components and split responsibilities by use case and feature.

### 5. Mixed PWA and desktop concerns

The current project contains PWA/service-worker/install/offline routes and assets. For the new desktop product, these should not be business-data persistence mechanisms. Desktop offline behavior becomes the normal mode, not an exceptional browser-offline state.

### 6. UI shell duplication risk

The current project has multiple layout-related components and a history of regression tests around header/navigation. The new shell should have one canonical application shell with feature-level content slots and no parallel legacy navigation implementation.

### 7. Database shape is partially denormalized

The current SQLite schema stores arrays and aggregate structures as serialized text in several places (`items`, `barcodes`, `settings`, bread data, etc.). This can work for snapshots, but core reporting and relational integrity are stronger when high-value transactional children are normalized into child tables.

### 8. Financial values are represented as `REAL`

The current schema uses SQLite `REAL` for monetary values. The new production schema should store monetary amounts as integer minor units where practical (for DZD, integer centimes) or use a precisely defined fixed-scale strategy consistently. This avoids floating-point ambiguity in financial state.

### 9. Current native build environment issue is tooling, not feature logic

The supplied development environment showed successful Node/npm validation and a native rebuild failure caused by missing C++ toolset configuration. The from-scratch build must include a deterministic native-module toolchain and an Electron-targeted rebuild step.

## Features confirmed by the supplied source

Routes/services/tests confirm these functional areas:

- dashboard
- sales/checkout
- products
- customers and customer detail
- stock and stock intake
- suppliers and supplier detail
- sales history
- returns
- expenses
- debt alerts
- reports
- bread orders
- zakat
- company profile
- settings/data management
- printing
- backup/recovery
- hardware contracts
- OCR import
- product/customer import
- proformas

## Recommended from-scratch decision

Do not copy the existing architecture file-for-file. Preserve the **business capabilities and tested invariants**, but rebuild the technical core around:

```text
React UI
  -> application/use cases
  -> domain
  -> ports
  -> infrastructure adapters
  -> Electron main
  -> SQLite
```

with one persistence model and one owner for every responsibility.
