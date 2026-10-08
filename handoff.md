# Handoff — POS shell redesign + Manager icon (2026-10-07)

## 1) Goal

- POS cashier visual refont (Arabic-speaking requester, answers in Arabic):
  sidebar moved to a top bar with transition effects, professional digital
  clock in the top strip, same buttons and F1–F10, dark industrial + gold
  kept, new light mode added.
- Then: merge the nav bar with the two strips above it, show the page name
  in the nav only for the selected module, fix License Manager window icon.
- Zero functional regression on all 3 apps (same exports/props/flux, no IPC
  or Zod change, centimes logic / DZD display untouched).

## 2) Current state

- Implemented, verified, rebuilt, relaunched. Both apps currently running
  from fresh builds:
  - POS: `npx electron .` (bg shell sh_1165b2152001ZsDZtsRTVSoxUR).
  - License Manager: `npx electron ./dist-license-manager/license-manager/main/main.js`
    (bg shell sh_1165b7640001j3H1UGi7ZYSika).
- VERIFY green: `typecheck` + `typecheck:manager`, vitest 36/36
  (shell/sales/bridge-shape/license-manager), `grep ipcRenderer|better-sqlite3|node:`
  empty under `src/`, prettier clean.
- Screenshots (stub-bridge harness, real layout): `docs/shots/pos-before-desktop.png`,
  `pos-before-mobile.png`, `pos-after-desktop.png`, `pos-after-mobile.png`,
  `pos-after-light-desktop.png`. Reviewed visually; fixed clock `PM` → 24h
  and light-mode gold contrast from review.
- Mobile APK (Expo): untouched. Manager renderer UI: untouched (icon only).

## 3) Active files

| File                                          | Lines | Status                                                                                    |
| --------------------------------------------- | ----- | ----------------------------------------------------------------------------------------- |
| `src/app/shell/TopBar.tsx`                    | 206   | rewritten: single merged band (badges, inline module title, print toggle, clock, actions) |
| `src/app/shell/Sidebar.tsx`                   | 139   | rewritten: compact icon nav, label+kbd only on active module                              |
| `src/app/shell/App.tsx`                       | 296   | unified header wrapper around TopBar+Sidebar, theme wiring                                |
| `src/app/shell/use-theme.ts`                  | 29    | NEW: localStorage-only theme hook                                                         |
| `src/app/shell/shell-types.ts`                | 67    | + `Theme`, `THEME_KEY`, `initialTheme`                                                    |
| `src/styles/globals.css`                      | 299   | + `[data-theme="light"]` overrides, `.topnav-indicator`                                   |
| `license-manager/main/window-manager.ts`      | 75    | + `resolveManagerIcon()` + `icon:` option                                                 |
| `electron-builder.license-manager.yml`        | —     | + `extraResources` `public/icons → icons`                                                 |
| `docs/ADR-072-pos-topnav-light.md`            | 36    | NEW                                                                                       |
| `docs/ADR-073-compact-header-manager-icon.md` | —     | NEW                                                                                       |
| `docs/shots/`                                 | 5 PNG | NEW (before/after desktop+mobile, after-light)                                            |

Temp files created then deleted: `tests/e2e/__shots.spec.ts`, `tests/e2e/__probe.spec.ts`.
`test-results/` holds harness error-context (git-ignored build artifact).

## 4) Changes made

1. Phase 1 plan (validated before code): dark tokens locked
   (`#051424 #0D1C2D #0A0F1C #FBBF24 #D4E4FA #4EDEA3`), new light tokens
   (`#FAF8F2 #FFFFFF #14202E #9A6206 #E5DCC8 #007A55`), Inter + JetBrains Mono kept.
2. Sidebar → horizontal top nav, same `SidebarProps` (`data-path`, `kbd`,
   vigilance badges, filter, collapse). Active = gold pill + sliding
   underline (150 ms, killed by `prefers-reduced-motion`).
3. `Horloge` in TopBar: local `fr-DZ` HH:MM:SS (`hourCycle h23`) + short date,
   1 s interval with cleanup, no business logic, no new dep.
4. Light mode = CSS-only `[data-theme="light"]` overrides; dark default
   pixel-identical; preference in `localStorage` (`veloria.theme`), never SQLite.
5. Header merge (ADR-073): TopBar single band + Sidebar nav-only row in one
   `bg-[#0a0f1c]` container; module header block removed, title inline;
   nav label+kbd render only when selected (tooltip keeps `label — hint`).
6. Manager icon: root cause was a missing `icon:` option (the `.ico` and
   builder `win.icon` already existed). Added resolver mirroring POS
   (resourcesPath → getAppPath → cwd) + packaged `extraResources/icons`.
7. Cut for sobriety: ALL-CAPS eyebrows, cream-AI tones, `→` markers, extra KPIs,
   new fonts/libs, full-width module header, 17 nav labels.

## 5) Failed attempts

1. `grep/wc/tail/head` do not exist in PowerShell → used `default.grep` tool
   and `Get-Content … .Count` / `Select-Object -First`.
2. `Start-Process -FilePath "npm"` fails (npm is a `.cmd` shim) → used
   `cmd /c "npm …"` and background `default.shell` + port-PID kill.
3. First screenshot run found no `<aside>`: stub bridge returned a Promise for
   `windowOnMaximizedChanged`, crashing `WindowChrome` (`detach is not a function`).
   Fixed stub: `on*/windowOn*` → noop fn, `windowIsMaximized` → `{ok:true}`.
4. Light-toggle round-trip click timed out (button name flips to
   "mode sombre") → second click targets the new name.
5. Accidental replacement of the `.text-slate-400` light rule while appending
   new rules → restored immediately, verified in file.
6. `graphify update .` impossible: `graphify` CLI and Python `graphify` module
   both absent (Python 3.12 present). Graph left untouched; reported to user.

## 6) Next steps

- [ ] Requester visual sign-off on the two running windows (merged band,
      selected-only labels, light mode, Manager taskbar icon).
- [ ] Optional: full packaged E2E (`npm run test:e2e`, needs vendor key +
      build) — unit scope + typecheck already green.
- [ ] Optional: commit this work (currently uncommitted; pre-existing tree
      modifications from `chore/root-layout` are also present — coordinate).
- [ ] Optional follow-ups from screenshots: 390 px top-strip wrapping density,
      `SellTotalsPanel` inner `bg-black/25` tuning if needed.
- [ ] Apps B (Manager UI) and C (mobile APK) refonts: still pending, need
      per-screen scope + Figma yes/no before any Phase 1 plan.
- [ ] Run `graphify update .` once graphify tooling is installed.
