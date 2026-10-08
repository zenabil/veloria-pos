# SOFTWARE_INSTALLATION_REPORT.md (2026-10-03)

## Step 1 (done, verified in `elevated-step1.log`)

Restore point, Defender re-enable, PATH prune, IObit removals — see SAFE_CLEANUP_REPORT.md.

## Step 2 (done 12:55–13:27 UTC, verified in `elevated-step2.log`)

| Tool                | Version verified                          | Method                                                        |
| ------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| Git                 | 2.55.0.windows.5                          | winget `Git.Git`                                              |
| Node.js             | v22.23.3 (engines `>=22.5 <23` ✓)         | official nodejs.org MSI, latest 22.x queried from dist index  |
| npm                 | 10.9.9 (bundled)                          | —                                                             |
| VS Code             | 1.140.0                                   | winget `Microsoft.VisualStudioCode`                           |
| VS Build Tools 2022 | MSVC 19.44.35207 (cl.exe x64 verified)    | official `vs_BuildTools.exe` + `VCTools --includeRecommended` |
| Windows SDK         | 10.0.26100.0 (+4 older, bin+Lib verified) | via Build Tools recommended components                        |
| Python              | 3.12.10 working (`py-ok`, prefix correct) | see Python incident below                                     |

## Python incident (honest record)

- Pre-existing orphaned per-user + per-machine MSI registrations for 3.12.10 (files deleted) poisoned every reinstall: winget reported success while installing nothing; `msiexec /fa` was a no-op; python.org installer ran in maintenance mode preserving a feature set with `Lib/` excluded.
- Resolution: non-elevated `winget uninstall` cleared the user-scope registration, then an elevated python.org install with explicit `Include_lib=1` (+dev/exe/pip/tcltk/tools) produced a complete `C:\Program Files\Python312\` with working stdlib. Verified `python -c "import sys"` OK.
- `C:\Program Files\Python312\` + `Scripts\` appended to Machine PATH (installer flag alone did not persist it). Bare `python` now resolves ahead of the WindowsApps stub because Machine PATH precedes User PATH.

## Outstanding residuals

- IDM program folder: `IDMShellExt64.dll` still locked by Explorer even after `regsvr32 /u`; deletes itself on next reboot (or delete manually then). 2 files, cosmetic.
- `E:\Veloria POS dev zenagui bilal` — still unidentified, untouched.

## Step 7/8 — dev & design apps (2026-10-03 ~21:46–21:52 UTC, `elevated-step7/8.log`)

| Tool                   | Version verified                                                                            | Notes                             |
| ---------------------- | ------------------------------------------------------------------------------------------- | --------------------------------- |
| Figma Desktop          | exe present (`%LOCALAPPDATA%\Figma\Figma.exe`)                                              | UI design; free tier              |
| DB Browser for SQLite  | exe `C:\Program Files\DB Browser for SQLite\...`                                            | local DB inspection               |
| Windows Terminal       | 1.24.12741.0 (WindowsApps)                                                                  | dev ergonomics                    |
| VS Code extensions (5) | eslint 3.0.34, prettier 12.4.0, tailwindcss 0.16.0, sqlite-viewer 26.9.1, playwright 1.1.19 | `code --list-extensions` verified |

Incidents: wrong winget ID for DB Browser first (`DBHub.DBBrowserforSQLite` not found → corrected to
`DBBrowserForSQLite.DBBrowserForSQLite`); Terminal first attempt failed with `0x80072ee2` (network timeout,
same flaky link as GitHub) → retry succeeded. Deliberately NOT installed: nvm-windows (would break the
engines-pinned Node 22), Android Studio/SDK (EAS cloud builds; emulator impossible on 2 GB).

No software has been installed, upgraded, or uninstalled by this agent. Internet + winget v1.29.380 verified working.

Proposed (official sources, stable releases, project-compatible):

| #   | Tool                                        | Version       | Source/method                                                                                                                    | Size est. | Reboot?           |
| --- | ------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------- |
| 1   | Git for Windows                             | latest 2.x    | `winget install Git.Git`                                                                                                         | ~400 MB   | no                |
| 2   | Node.js LTS 22                              | latest 22.x   | `winget install OpenJS.NodeJS.LTS --version 22` (or official MSI)                                                                | ~150 MB   | no (PATH refresh) |
| 3   | Python 3.12                                 | 3.12.x        | `winget install Python.Python.3.12` (repairs orphaned 3.12.10 entries)                                                           | ~200 MB   | no                |
| 4   | VS Build Tools 2022 + Desktop C++ + Win SDK | 2022 latest   | official `vs_BuildTools.exe --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.Windows10SDK.*` | ~5–7 GB   | possible          |
| 5   | VS Code                                     | latest stable | `winget install Microsoft.VisualStudioCode`                                                                                      | ~350 MB   | no                |

Recorded after execution: executable path, version, PATH diff, diagnostic command output, rollback (winget uninstall + restore point).
