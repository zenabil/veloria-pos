# 00 — PROJECT BASELINE (as found)

**Audit ID:** `2026-11-11-full-forensic-audit`
**Captured:** 2026-11-11
**Mode:** READ-ONLY forensic audit. Nothing was modified except files created under `docs/engineering/audits/2026-11-11-full-forensic-audit/`.

## 1. Repository identity

| Fact                   | Value                                                                                       | How verified                         |
| ---------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------ |
| Project root           | `C:\Users\Admin\Desktop\Veloria POS dev zenagui bilal`                                      | filesystem                           |
| Package name / version | `veloria-pos` @ **1.0.4**                                                                   | `package.json:3-4`                   |
| Product name           | Veloria PoS                                                                                 | `package.json:3`                     |
| License                | UNLICENSED, private                                                                         | `package.json:6-7`                   |
| Module system          | ESM (`"type": "module"`)                                                                    | `package.json:9`                     |
| Electron main entry    | `dist-electron/main/main.js`                                                                | `package.json:10`                    |
| Node                   | v22.23.4                                                                                    | `node -v`                            |
| npm                    | 10.9.9                                                                                      | `npm -v`                             |
| Package manager pin    | npm@10.9.9                                                                                  | `package.json:113`                   |
| engines                | node >=22.12.0, npm >=10.9.0                                                                | `package.json:109-112`               |
| Branch                 | `feat/client-orders`                                                                        | `.git/HEAD`                          |
| HEAD commit            | `d9e992b369dbe98406836cbbb6da8b02bb9409ce`                                                  | `.git/refs/heads/feat/client-orders` |
| Other branches         | `master`, `chore/batch-a-format-baseline`, `chore/batch-b-money-audit`, `chore/root-layout` | `.git/refs/heads/`                   |

### Git status — BLOCKED

**`git` is NOT installed on this machine.** `where git` returns "impossible de trouver le fichier"; no `C:\Program Files\Git`, no scoop/chocolatey install, no `git.exe` on PATH. Consequently:

- `git status` (uncommitted work) could **not** be inspected — **BLOCKED**.
- `git diff` could not be inspected — **BLOCKED**.
- History/drift analysis limited to reading `.git/HEAD`, `.git/refs/heads/*`, `.git/index` directly.

Substituted evidence: the git index was parsed directly to determine which files are tracked (`private/vendor-keys/*` is **not** tracked — confirmed).

**Consequence for the audit:** user uncommitted changes cannot be distinguished from committed state. All findings are based on the working tree as-is.

## 2. Technology stack (from manifests, not docs)

| Layer      | Technology                 | Version          | Source                |
| ---------- | -------------------------- | ---------------- | --------------------- |
| Shell      | Electron                   | 45.1.0           | `package.json:95`     |
| Renderer   | React / ReactDOM           | 19.3.1           | `package.json:80-81`  |
| Build      | Vite                       | 8.3.5            | `package.json:103`    |
| Language   | TypeScript                 | 6.0.3            | `package.json:103`    |
| Styling    | Tailwind CSS               | 4.3.3            | `package.json:99,102` |
| DB driver  | better-sqlite3             | 13.0.3           | `package.json:75`     |
| Validation | zod                        | 4.6.7            | `package.json:84`     |
| State      | zustand                    | 5.0.16           | `package.json:85`     |
| Barcode    | qrcode                     | ^1.5.4           | `package.json:79`     |
| PDF        | pdfjs-dist                 | 6.4.299          | `package.json:78`     |
| OCR        | tesseract.js               | 7.0.0            | `package.json:83`     |
| Tests      | vitest                     | 5.0.5            | `package.json:104`    |
| E2E        | @playwright/test           | ^1.64.1          | `package.json:89`     |
| Packaging  | electron-builder           | 26.18.0          | `package.json:96`     |
| Lint       | eslint + typescript-eslint | 10.13.0 / 8.72.1 | `package.json:97,100` |

## 3. Repository layout as found (source of truth)

```
.
├── src/                 211 files  (app 11, application 4, domain 38, features 123, shared 32, styles 1)
├── electron/            ~120 files (backup 1, database 3, ipc 69, licensing 10, main 7,
│                                  ocr 4, preload 1, printing 36, security 1, services 3,
│                                  shared 1, sync 5)
├── database/            64 files  (63 migrations + migrations.lock.json)
├── tests/               230 files  (unit 140, integration 53, database 10, e2e 27)
├── scripts/             32 files  (database 4, licensing 9, maintenance 9, quality 6, release 4)
├── config/              4 files    (electron-builder/pos.yml, manager.yml, knip.json, playwright.config.ts)
├── docs/                420 files  (182 ADRs, reports, licensing/, engineering/skills/ v2.0.0)
├── governance/          5 files    (project contract v2.0.0, facts-to-verify, skills registry, …)
├── .opencode/           skills v2.0.0 (17 skills), 5 agents, 5 commands, plugins/
├── mobile/              352 files  (Expo client app — French APK)
├── owner/               315 files  (Expo owner supervision app)
├── license-manager/     16 files   (vendor app — separate Electron app)
├── cloud/supabase/      11 files   (schema.sql, rls.sql, 2 Edge Functions, …)
├── website/             54 files   (vitrine)
├── resources/           icons-src, license/public.key, ocr/lang
├── private/             backups/, vendor-keys/ (gitignored — NOT tracked)
├── release/             prebuilt 1.0.4 artifacts (POS, Manager, Client APK, Owner APK)
├── templates/, public/, scripts/, governance/
```

**Total in-scope files (audit inventory): 1902** — see `02_FILE_AUDIT/FILE_INVENTORY.csv`.

## 4. Database as found

- Migrations: **63** files, `0001_initial_schema.sql` → `0063_client_orders.sql`.
- Lock file: `database/migrations.lock.json` (sha256 per migration, immutable guard).
- Schema extraction: **57 tables**, **217 CHECK constraints**, **77 triggers**, **166 indexes**, **7 views**, **90 inline `REFERENCES` FK declarations**.
- Runtime pragmas (`electron/database/sqlite.service.ts:36-50`): `foreign_keys = ON`, `journal_mode = WAL`, `synchronous = FULL`, `busy_timeout = 10000`, `wal_autocheckpoint = 1000`, `temp_store = MEMORY`, `trusted_schema = OFF` (best-effort).

## 5. IPC as found

- **201 channels** declared in `electron/ipc/channels.ts`.
- **199** have a registered `ipcMain.handle` handler.
- 2 have no handler by design (main→renderer event channels): `window.maximizedChanged`, `ocr.progress`.
- **161** route through the guarded `handle()` wrapper (`electron/ipc/handle.ts`) which enforces Zod parsing, licence gates, staff gates, credit gates, operationId requirement, and FR error mapping.
- **38** use raw `ipcMain.handle` (printing, backup, OCR, recovery) and rely on `enforceRawChannelGates` (`electron/ipc/raw-guards.ts`).
- Full matrix: `02_FILE_AUDIT/IPC_CHANNEL_MATRIX.csv`.

## 6. Governance / decision documents as found

- `governance/VELORIA_PROJECT_CONTRACT.md` — contract v2.0.0.
- `governance/PROJECT_FACTS_TO_VERIFY.md` — 22 facts requiring verification (all still marked "Must verify" — the file has never been updated).
- `governance/SKILLS_REGISTRY.md` — 17 skills, v2.0.0.
- `docs/ADR-001…ADR-182` — 182 architecture decision records.
- `docs/METRICS.md` — generated counters, verified in sync by `npm run verify:docs`.
- `docs/engineering/skills/veloria-v2.0.0/` — the installed skills package with SHA256SUMS integrity manifest.
- `handoff.md` — 664 KB running session log.

## 7. Pre-existing release artifacts

`release/` contains a complete 1.0.4 artifact set. SHA256SUMS verified against actual files — **all match**. Authenticode status: **NotSigned**.

## 8. Baseline risk signals (established before any report)

1. `npm run license:scan` **FAILS** (exit 1) → `npm run package`, `package:win`, `package:pos`, `package:manager` are all **blocked** (prepackage runs the scan).
2. `npm run test:coverage` **FAILS** (exit 1) on per-file thresholds for `src/domain/order/client-order.ts`.
3. `npm run test:e2e` **FAILS** (exit 1): 53 passed, 4 skipped, 1 failed (`full-loop-client.spec.ts` — requires an external mirror relay on `127.0.0.1:8100`).
4. Governance contract says **Google Sheets** is the approved V1 customer bridge; the implementation is **Supabase** (ADR-053, accepted). Unreconciled conflict.
5. Business day uses a hardcoded `+1 hour` offset, which `governance/PROJECT_FACTS_TO_VERIFY.md:34` explicitly forbids.
6. `private/vendor-keys/private.key` (Ed25519, PEM) exists on disk. It is **gitignored and untracked**, but its public counterpart `resources/license/public.key` **is** shipped — the same keypair can therefore mint licenses accepted by this build.

## 9. Tools used

- `node`/`npm` for gates and tests.
- `npx prettier`, `npx playwright` via project scripts.
- Custom Node extractors written to `C:\Users\Admin\AppData\Local\Temp\opencode\` (IPC matrix, DB schema extract, money allocation fuzz) — outside the repo, read-only w.r.t. the project.
- `Get-AuthenticodeSignature` for installer signing status.
- `Get-FileHash` for artifact integrity.

## 10. What was NOT done (scope discipline)

- No application file was modified by this audit. No fix was implemented.
- No migration was run against `Veloria POS DB.sqlite`.
- No npm dependency was added/removed/upgraded.
- No git history was altered.
- The private key material was **not** read into any report (only its PEM header and public-key fingerprint were computed).

## 11. Observed concurrent modification (not caused by this audit)

During the audit window, three files changed on disk **by a process other than this audit**:

| File                                  | Modified            | Change                                                                                           |
| ------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------ |
| `AGENTS.md`                           | 2026-11-11 22:13:33 | rules 13-14 rewritten; a machine-readable `<!-- SKILL-ROUTING:START/END -->` routing table added |
| `scripts/quality/verify-docs.mjs`     | 2026-11-11 22:14:01 | gained a routing-table parser (`ROUTING_START` / `ROUTING_END`, line 542-556)                    |
| `tests/unit/verify-docs-gate.test.ts` | 2026-11-11 22:15:42 | extended accordingly                                                                             |

These changes were observed through session system-notifications (the `AGENTS.md` diff was pushed into the session context) and by filesystem timestamps. **This audit did not author them** — the only files it wrote are under `docs/engineering/audits/2026-11-11-full-forensic-audit/` and `C:\Users\Admin\AppData\Local\Temp\opencode\`.

**Impact on the audit's validity:** the modification timestamps (22:13–22:15) **precede** every gate execution in this audit (the first was at 22:41). The full test suite ran from 22:30:30, the typecheck family at 22:41, the E2E suite ending 23:18 and the coverage runs through 23:37. **All 26 command results therefore reflect the current tree state**, including the routing-table gate — `npm run verify:docs` was re-run after the audit completed and still reports `DOCS VERIFIED` with the 17-skill routing check active.

This is a useful observation in its own right: it demonstrates the ADR-178 mechanism working (the routing table is machine-verified against the filesystem), and it is recorded here so that no reader mistakes the tree state for a snapshot.
