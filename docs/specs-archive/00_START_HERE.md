# VELORIA PoS — From-Scratch Engineering Specification

> ⚠️ **ARCHIVE HISTORIQUE — 2026-09-14 — NON CONTRACTUEL.**
> Cette spécification est **figée depuis le 2026-09-14** : elle décrit le
> produit _à cette date_. Le code a avancé depuis (modules, tables, pile
> technique, migrant de 0001..00NN). **Elle n'est plus un contrat
> d'exécution** : l'écart est mesuré (25 tables documentées contre 48
> réelles ; unité `Bread` supprimée par ADR-109 ; pile imposée — Next.js,
> Radix, Recharts — jamais adoptée).
>
> Pour l'état **vivant** du projet : le code, indexé par `docs/INDEX.md`
> (ADR) et `docs/METRICS.md` (volumétrie, vérifiée par `npm run verify:docs`).
> Voir `docs/ADR-178-source-unique-des-metriques.md` (décision et écart).

**Application:** Veloria PoS  
**Logical database name:** `veloria POS DB`  
**Physical SQLite file:** `Veloria POS DB.sqlite`  
**Target:** Professional Windows Desktop POS  
**Primary language:** French  
**Currency:** DZD  
**Architecture:** Offline-first, SQLite-first, local single-store desktop  
**Status:** Historical reconstruction specification (frozen 2026-09-14 — archive, see banner above)

## Purpose

This documentation set is the source of truth for rebuilding Veloria PoS from zero while preserving the business capabilities discovered in the supplied V108 codebase, removing legacy complexity, and establishing a clean production architecture.

## Authoritative principles

1. SQLite is the single source of truth for all commercial data.
2. The Electron main process owns native capabilities and SQLite access.
3. The renderer never connects to SQLite and never receives arbitrary Node.js APIs.
4. Business rules are framework-independent and testable.
5. The UI is feature-oriented, keyboard-friendly, fast, and visually consistent.
6. No login, signup, tenantId, or roles system is part of this desktop scope.
7. No Firebase, Google Sheets, Dexie/IndexedDB, browser database, or remote sync engine is part of the new core.
8. Every financial mutation that crosses multiple aggregates is atomic.
9. Production data must survive restart, crash, update, and backup/restore workflows.
10. No feature is considered complete until its UI, application logic, persistence, error states, tests, and release behavior are verified.

## Reading order

- `01_PROJECT_VISION_AND_SCOPE.md`
- `02_CURRENT_PROJECT_AUDIT.md`
- `03_ARCHITECTURE.md`
- `04_TECH_STACK.md`
- `05_PROJECT_STRUCTURE.md`
- `06_DATABASE_ARCHITECTURE.md`
- `07_DATABASE_SCHEMA.md`
- `08_DOMAIN_AND_USE_CASES.md`
- `09_ELECTRON_IPC_SECURITY.md`
- `10_UI_UX_DESIGN_SYSTEM.md`
- `11_PERFORMANCE_RELIABILITY.md`
- `12_PRINTING_HARDWARE.md`
- `13_BACKUP_RECOVERY_DATA_MANAGEMENT.md`
- `14_TESTING_QA.md`
- `15_BUILD_RELEASE_INSTALLER.md`
- `16_CODING_STANDARDS.md`
- `17_IMPLEMENTATION_PLAN.md`
- `18_ACCEPTANCE_CRITERIA.md`
- `19_AGENT_EXECUTION_RULES.md`

## Definition of done

The project is done only when the complete application can be installed on a clean supported Windows machine, creates/opens `Veloria POS DB.sqlite`, performs real sales and inventory transactions, prints receipts/invoices, survives restart, performs verified backups and restores, passes automated quality gates, and produces a signed/verified Windows release artifact according to the release policy.
