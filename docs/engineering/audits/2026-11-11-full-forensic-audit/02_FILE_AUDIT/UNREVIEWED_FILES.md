# Unreviewed / not-line-by-line-reviewed files

**Audit ID:** `2026-11-11-full-forensic-audit`

This file is the honest accounting of what this audit did NOT read line by line.

## What the statuses mean

| Status                 | Meaning                                                                           |
| ---------------------- | --------------------------------------------------------------------------------- |
| REVIEWED_WITH_FINDINGS | Read in full (or in the relevant sections) and a finding was raised against it    |
| REVIEWED               | Read in full, no finding                                                          |
| IN_PROGRESS            | Mechanically inventoried and swept by automated checks, but not read line by line |
| BLOCKED                | Could not be inspected â€” reason stated                                          |

## The three automated sweeps applied to every file in `src/` and `electron/`

1. **Renderer isolation** â€” any import of `electron`, `node:*`, `fs`, `better-sqlite3` in `src/` (result: 0).
2. **Browser-storage misuse** â€” `localStorage` / `sessionStorage` / `indexedDB` in `src/` for business data (result: 0).
3. **Type and hygiene** â€” `: any`, `as any`, `@ts-ignore`, `@ts-expect-error`, `console.log` in the renderer, empty `onClick` bodies, `onClick` on a non-semantic element, `aria-*` coverage, pending/busy guards, hard-coded hex colours (results recorded per file in `FILE_AUDIT_LEDGER.csv`).

Plus: a full-text sweep of every migration for tables/columns/constraints/triggers/indexes/FKs, of every IPC handler for its schema and gates, and of every log call site for sensitive payload shapes.

## Counts by module â€” files NOT read line by line

| Module                              | Files |
| ----------------------------------- | ----- |
| docs                                | 420   |
| mobile                              | 352   |
| owner                               | 315   |
| tests/unit                          | 140   |
| src/features                        | 120   |
| website                             | 54    |
| tests/integration                   | 53    |
| electron/ipc                        | 51    |
| src/domain                          | 35    |
| electron/printing                   | 31    |
| src/shared                          | 30    |
| tests/e2e                           | 25    |
| license-manager                     | 16    |
| cloud                               | 10    |
| tests/database                      | 10    |
| scripts/maintenance                 | 9     |
| src/app                             | 9     |
| electron/licensing                  | 7     |
| scripts/licensing                   | 7     |
| electron/main                       | 5     |
| public                              | 5     |
| resources                           | 5     |
| scripts/quality                     | 5     |
| private                             | 4     |
| src/application                     | 4     |
| config                              | 3     |
| electron/ocr                        | 3     |
| scripts/database                    | 3     |
| templates                           | 3     |
| electron/database                   | 2     |
| electron/services                   | 2     |
| electron/sync                       | 2     |
| release-mgr                         | 2     |
| .editorconfig                       | 1     |
| .gitattributes                      | 1     |
| .github                             | 1     |
| .npmrc                              | 1     |
| .nvmrc                              | 1     |
| .prettierrc                         | 1     |
| handoff.md                          | 1     |
| package-lock.json                   | 1     |
| scripts/demo-client-sync-server.mjs | 1     |
| scripts/e2e-mirror-relay.mjs        | 1     |
| scripts/e2e-mobile-shots.mjs        | 1     |
| skills-lock.json                    | 1     |
| src/main.tsx                        | 1     |
| src/styles                          | 1     |
| src/vite-env.d.ts                   | 1     |
| vite.license-manager.config.ts      | 1     |

**Total files mechanically swept but not read line by line: 1758** of 1902 in-scope files.

## Honest assessment of what this means

The mechanically swept population is dominated by: (a) `docs/**` â€” 420 files of ADRs, reports and archived specs, which are documentation and were consulted selectively rather than exhaustively; (b) `mobile/` and `owner/` â€” 667 files of React Native code in two separate applications that are outside the 17-skill scope; (c) `website/` â€” 54 files of a static showcase site.

For the **POS core itself** â€” `src/**` (211 files) and `electron/**` (~120 files) â€” the coverage is materially higher: the domain, money, stock, FIFO, closing, IPC, preload, security, licence, sync, backup and printing modules were all read in full, and every file that carries a business rule is listed with a finding or an explicit REVIEWED status in `FILE_AUDIT_LEDGER.csv`.

## Not covered by this audit at all

- `node_modules/`, `.git/`, `dist*/`, `coverage/`, `test-results/`, `release/`, `graphify-out/` â€” build outputs, caches and generated artefacts, excluded per the audit brief. Their _inclusion/exclusion rules_ in the packaging configuration WERE audited (see `03_SKILL_AUDITS/12_RELEASE.md`).
- `mobile/` and `owner/` internals â€” separate applications, outside the 17-skill scope. Only their packaging, versioning and the POS-side interfaces they consume were audited.
- `license-manager/` â€” inventoried in full and its key custody reviewed; its UI and issuance workflows were not audited.
- `website/` â€” audited only through `npm run verify:site`.
- Physical hardware behaviour â€” MANUAL VALIDATION REQUIRED (no device attached).
- The live `Veloria POS DB.sqlite` â€” never opened, by design.
- Git history â€” BLOCKED (the `git` binary is not installed on this host).
