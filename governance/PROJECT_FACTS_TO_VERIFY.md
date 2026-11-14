# Project Facts to Verify Before Implementation

This file prevents historical details from being mistaken for current repository facts. Fill it from the live codebase before substantial engineering work.

| Fact                                                      | Verify from                                      | Current status                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Electron, Node, React, TypeScript, SQLite driver versions | package manifests, lockfiles, build config       | Must verify                                                                                    |
| Main/preload/renderer entry paths                         | source tree and Electron config                  | Must verify                                                                                    |
| Renderer-to-main bridge API                               | preload exports, IPC registry, contracts         | Must verify                                                                                    |
| Current migration version and naming                      | migration directory, runner, live DB metadata    | Must verify                                                                                    |
| Migration hash/immutability tooling                       | scripts and CI configuration                     | Must verify                                                                                    |
| SQLite journal mode, FK enforcement, backup mechanism     | DB initialization/runtime tests                  | Must verify                                                                                    |
| Money minor-unit scale, rounding, bounds                  | domain code, schema, tests, product policy       | Must verify                                                                                    |
| Quantity scale and packaging conversion                   | domain code, schema, product policy              | Must verify                                                                                    |
| Inventory valuation method and layer model                | stock repositories, schema, tests, approved ADR  | Must verify                                                                                    |
| Business timezone/date-only semantics                     | time utilities, DB types, boundary tests         | Must verify; do not assume fixed UTC+1                                                         |
| Cash/Z report source ledgers and formulas                 | repositories, report tests, accounting decisions | Must verify                                                                                    |
| Current active modules and removed modules                | navigation, module registry, product scope       | Must verify                                                                                    |
| License format, algorithm, keys, capability catalog       | licensing code, resource files, build manifests  | Must verify                                                                                    |
| Release signing/update configuration                      | builder/updater config, certificates policy      | Must verify                                                                                    |
| Printer models, thermal protocol, A4/PDF engine           | hardware inventory, print code, physical tests   | Must verify                                                                                    |
| Supported barcode symbologies and QR purpose              | product workflow and hardware tests              | Must verify                                                                                    |
| Customer-data bridge access layer and authorization       | bridge/API configuration, security tests, ADR    | Verified: Supabase mirror, RLS deny-by-default + REVOKE, single Edge Function reader (ADR-053) |
| Customer identity and recovery workflow                   | product requirements, trusted API code           | Must design/verify                                                                             |
| Logging, retention, telemetry consent                     | logger config, product policy                    | Must verify                                                                                    |
| Quality scripts, coverage, CI gates                       | package scripts and CI workflows                 | Must verify                                                                                    |

## Historical claims that must not be copied blindly

The V1 skill bundle contains exact paths, migration numbers, table names, trigger names, script commands, thresholds, capability counts, and Supabase-specific implementation details. These may have been correct for one snapshot, but they are not automatically correct now. Verify each against code and accepted ADRs before reusing it.

Particularly important:

- Timezone policy ACCEPTED by ADR-169 (2026-11-02): Algeria is UTC+1 permanently
  (no DST since 2011), so the business day is `Africa/Algiers` applied as a
  constant offset `+1 hour` — `BUSINESS_DAY_OFFSET_MS = 3_600_000` in
  `src/domain/common/business-day.ts` and `electron/shared/business-day.ts`,
  SQL modifier `date(col, '+1 hour')`. Storage stays ISO UTC. The policy is
  NOT a "named timezone through ICU" (rejected: Hermes-safety, determinism)
  and is NOT configurable at runtime (single geography). Any future change to
  this offset requires a NEW ADR and a re-verification of the closing triggers
  (0058) and the boundary tests.
- Do not assume a previously mentioned next migration number is still next.
- **The selected V1 customer bridge is Supabase** (PostgREST mirror + Edge Functions), per accepted ADR-053. The former instruction ("Google Sheets is the approved V1 intermediary direction") was STALE and was corrected on 2026-11-12 — Google Sheets was rejected on technical grounds by ADR-053 (2026-09-29). Verify against ADR-053 and `cloud/supabase/`, not against older text.
- Do not assume a legacy module or license capability remains active.
- Do not assume a test/quality command exists until checked in `package.json` and CI.

## Faits verifies automatiquement (source : code, genere par verify-docs)

<!-- GENERATED:verify-docs:FACTS-START -->

<!-- Mesure par `node scripts/quality/verify-docs.mjs --write` le 2026-11-13. -->

| Indicateur                                       | Valeur                |
| ------------------------------------------------ | --------------------- |
| Migrations SQL (immuables)                       | 66 (jusqu'a 0066)     |
| ADRs (decisions)                                 | 185 (jusqu'a ADR-185) |
| Canaux IPC declares                              | 202                   |
| Canaux IPC servis (snapshot)                     | 201                   |
| Fichiers de test (unit + integration + database) | 216                   |
| Specs E2E (Playwright)                           | 26                    |
| Tables reelles (hors *_new temporaires)          | 50                    |
| Pages de licence                                 | 17                    |
| Features de licence                              | 14                    |

<!-- GENERATED:verify-docs:FACTS-END -->
