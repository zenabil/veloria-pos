# COMPATIBILITY_AND_BUILD_TESTS.md — RESULTS (2026-10-03)

## Toolchain versions (verified in fresh shells)

- Node v22.23.3 (engines `>=22.5 <23` ✓), npm 10.9.9, Git 2.55.0, Python 3.12.10, VS Code 1.140.0
- MSVC 19.44.35207 x64 + Windows SDK 10.0.26100.0, cl.exe verified

## `npm ci` — PASS (after 2 network retries)

- 696 packages installed. Electron binary download from GitHub timed out twice (flaky link, TCP connects but large transfers stall).
- Workaround (no project files modified): official binary downloaded via BITS from npmmirror,
  SHA256 verified against official `SHASUMS256.txt` from github.com (`4d445117…f6a3` MATCH),
  extracted to `node_modules/electron/dist`, `path.txt` created (standard offline procedure).
- `electron --version` → v37.2.0 ✓
- `electron-rebuild -f -w better-sqlite3` → "Rebuild Complete"; functional check under real
  Electron runtime: `NATIVE-OK {"two":2}` ✓
- Note: one vitest log line shows the repo's intentional ABI-mismatch test (`restore-rollback.test.ts`)
  expecting `NODE_MODULE_VERSION` errors — that is the test exercising the failure path, not a real problem.

## `verify:migrations` — PASS

- All 36 migrations verified in order, `integrity_check=ok foreign_key_violations=0`, "MIGRATIONS VERIFIED".

## `typecheck` + `typecheck:electron` — PASS

- `tsc -b` clean; integrity manifest signed (142 files, v1.0.0); electron project `--noEmit` clean.

## `npm test` (vitest) — PASS: 90 files, 556 tests, all green

- Includes migrations (8), FIFO layers (13), atomic slices (13), intake pricing (8), client-access sync,
  repair hardening, retention, history, license redteam/tamper/capabilities, FR error mapping.

## `build` + `build:electron` — PASS

- `vite build`: 1722 modules, built in 24s. `tsc -p tsconfig.electron.json` + preload bundle +
  integrity sign all OK.

## `format:check` — 1 pre-existing project warning (NOT modified)

- `electron/printing/printing.service.ts` fails `prettier --check` (pre-existing style drift).
  Left untouched per "do not modify project code without authorization".
- Own `maintenance-reports/*.md` files formatted with `prettier --write` (reports only).

## Outstanding

- `package:win` — DONE (see Packaging below). `package:manager` — executed, result below.
- Mobile `npm ls` — DONE (deps intact, expo CLI works).
- Playwright e2e — not run (browser download heavy on 2 GB; optional).

## Packaging — PASS (`package:win`, 2026-10-03 ~22:29 UTC)

- `license:scan` OK (936 files, no secrets); `build` + `build:electron` + `license:integrity` OK.
- electron-builder 26.0.12: NSIS `Veloria-PoS-Setup-1.0.0.exe` (122.8 MB) + `Veloria-PoS-Portable-1.0.0.exe`
  (122.4 MB), fresh timestamps, `SHA256SUMS.txt` written via `release:checksums`.
- Network workaround (env-only, documented): `ELECTRON_BUILDER_BINARIES_MIRROR=npmmirror` for
  nsis-3.0.4.1 + nsis-resources-3.4.1 (GitHub transfers stall from this link).
- Installer launch-test NOT performed (would install software on this machine; optional next step).

## Packaging — PASS (`package:manager`, 2026-10-03 ~22:33 UTC)

- `license:scan` OK (972 files); manager client (30 modules) + `tsc -p tsconfig.manager.json` + preload
  bundle OK; manager integrity manifest signed (19 files).
- NSIS `Veloria-License-Manager-Setup-1.0.0.exe` (104.9 MB) + Portable (104.5 MB), fresh, checksummed
  in `release/SHA256SUMS.txt` (all 4 artifacts). Build tools came from cache — no downloads needed.
