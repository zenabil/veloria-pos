# VELORIA_TOOLCHAIN_REQUIREMENTS.md (2026-10-03, from actual project files)

## Veloria POS (desktop, `package.json`)

- Node `>=22.5 <23` (engines) → install **Node 22 LTS latest 22.x** (NOT Node 26 — verified latest upstream is v26.10.0, incompatible with engines + Electron 37 ABI).
- npm bundled with Node 22 (npm 10/11) — respect `package-lock.json`, no global upgrades.
- Electron 37.2.0 + better-sqlite3 12.2.0 (native): requires **Python 3.12** + **VS Build Tools 2022 (MSVC + Windows 10/11 SDK)** for `electron-rebuild`.
- electron-builder 26.0.12 for `package:win` (NSIS + portable).
- Git for Windows (repo ops, hooks, version stamping).
- Editor: VS Code (or continue with OpenCode; VS Code recommended for renderer debugging).
- Tests: Vitest 3 (unit), Playwright 1.63 (e2e, needs `npx playwright install chromium` — heavy on 2 GB, optional).

## Veloria License Manager (`electron-builder.license-manager.yml`, `license-manager/`)

- Same Electron/Node toolchain as POS. No new framework. Crypto via Node built-ins + existing scripts (`scripts/licensing/`). No key material in reports.

## Veloria Customer App (`mobile/`, Expo SDK 52 / RN 0.76)

- Framework: **Expo (managed) + EAS cloud builds** (`eas build -p android --profile preview`). Keystore `veloria-release.keystore` already in repo.
- Decision: **do NOT install Android Studio/SDK locally** — unjustifiable on 2 GB RAM (~10 GB+ SDK, emulator impossible). Foundational local needs only: Node 22 + Expo CLI via project deps.

## Install order (pending authorization)

1. Restore point → 2. Git → 3. Node 22 LTS → 4. Python 3.12 (repair/replace orphan) → 5. VS Build Tools 2022 + Win SDK → 6. VS Code → 7. `npm ci` + `electron-rebuild` + `verify-migrations` + `typecheck` + tests.
