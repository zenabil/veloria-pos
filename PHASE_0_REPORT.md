# PHASE 0 — Lecture specs + Maps (2026-09-14)

## Completed
- Lu les 27 fichiers MD de `VELORIA_POS_FROM_SCRATCH_MARKDOWN/` + 3 captures d'écran de référence (dark UI, bottom nav, caisse).
- Maps produites ci-dessous. Aucun code écrit avant compréhension.

## Requirements Map (MD → implémentation)
| Exigence | Spec | Implémentation |
|---|---|---|
| SQLite source unique, `Veloria POS DB.sqlite` | 00,06,07,18 | `electron/database/sqlite.service.ts`, `database/migrations/` |
| Main seul propriétaire DB, renderer isolé | 03,06,09 | `electron/main/`, `electron/preload/preload.ts`, pas de `run-sql` |
| IPC typés + Zod, pas de broker générique | 09,24 | `electron/ipc/channels.ts`, `validators.ts`, `registry.ts` |
| Money centimes DZD, transactions atomiques + operationId | 06,08,11 | `src/domain/money/`, `sales.repo.ts` (7 étapes/1 tx) |
| Domain framework-free, use cases testables | 03,08 | `src/domain/`, `src/application/` |
| Migrations versionnées + checksums | 07,22 | `0001..0003`, `schema_migrations`, `verify-migrations.mjs` |
| UI FR, dark desktop, keyboard-first caisse | 10,21 + screenshots | `src/app/shell/App.tsx`, `SellScreen.tsx`, design tokens |
| Backup VACUUM INTO `.vposdb`, restore avec snapshot | 13 | `electron/backup/backup.service.ts` |
| Impression 80mm + A4, hardware adapters | 12 | `electron/printing/`, `electron/hardware/` |
| Tests pyramide + atomicité + perfs | 14 | `tests/`, `scripts/quality/verify-domain.ts` |
| NSIS Setup + Portable, user-data hors Program Files | 15 | `electron-builder.yml`, `database-path.service.ts` |

## Architecture Map
`React → application use cases → domain → ports → main-process repos → better-sqlite3 → SQLite`
Dépendance vers l'intérieur uniquement. Events locaux (`sale.created`…) non persistés.

## Database Map
21 tables (07) en 0001, 19 index en 0002, vues `v_customer_balance_check`/`v_daily_sales` + trigger garde-fou en 0003.
Soldes clients matérialisés + recalculables. Annulation = événement métier, jamais DELETE financier.

## Screen Map (21)
Dashboard (agrégats SQL) → `/sell` caisse F3/F10 → Catalogue → Clients → Stock/Commerce (Phase 6) →
Historique → Retours (Phase 7) → Dépenses → Dettes/Rapports/Zakat (Phase 8) → Pain (Phase 9) → Paramètres (DB/backup/diagnostics).

## Implementation Dependency Map
Migrations → repos → IPC → use cases → UI → tests. Pain/proformas/rapports avancés après socle vente.

## Decisions
- ADR-001 : renderer **Vite** (alternative autorisée par 04 : « controlled static-export-compatible setup ») — démarrage ≤2,5s, pas de serveur.
- ADR-002 : versions **réelles** épinglées (Electron 37.2/Node22/React19.1…) au lieu des versions projetées de 04 ; rebuild natif documenté.
- ADR-003 : `%PROGRAMDATA%` + repli userData ; backup `VACUUM INTO` ; `deleteAppDataOnUninstall:false`.
- Conflit résolu : `synchronous=FULL` (06) préféré à toute optimisation non profilée ; `sandbox:true` activé avec preload minimal.

## Files Created
Structure complète `src/`, `electron/`, `database/migrations/`, `tests/`, `scripts/`, `docs/ADR-00x`.

## Tests
n/a (Phase 0 = lecture).

## Remaining Work
Phases 1+ : voir PHASE_1/2_REPORT.
