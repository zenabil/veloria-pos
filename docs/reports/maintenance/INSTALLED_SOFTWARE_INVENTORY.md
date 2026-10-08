# INSTALLED_SOFTWARE_INVENTORY.md (2026-10-03, from registry uninstall keys)

## Machine-wide (HKLM)

- Microsoft Visual C++ Redistributables: 2008 x64, 2010 x64, 2012 x64 (min+add), 2013 x64 (min+add), 2022 X64 (min+add, 14.51.36247)
- NVIDIA: graphics 342.01, 3D Vision 342.01, HD audio 1.3.30.1, Update Core 10.4.0, Install Application
- Python 3.12.10 entries (Core, Standard Library, Dev libs, Tcl/Tk, pip bootstrap, docs, test suite, Add-to-Path) — **files absent, entries orphaned**
- Synaptics Pointing Device Driver 19.3.31.31
- WinRAR 7.23 (64-bit)
- Google Chrome 154.0.8037.98 (Program Files, exe version verified)

## Per-user (HKCU)

- OpenCode 2.0.22
- "ChatGPT zenagui bilal2" 1.0

## Observed on disk but not in uninstall keys (no official uninstaller found)

- IObit Driver Booster + IObit Uninstaller (+ `IObitUnSvr` service, `UninstallMonitor`/`DriverBooster` processes)
- Internet Download Manager (IDM: `IDMan.exe` process seen)
- `C:\Program Files\Veloria PoS Team` — directory entry exists but enumerates empty (possible orphan Start-Menu/publisher dir)
- LM Studio CLI (`~\.lmstudio\bin` on PATH, not verified)

## Explicitly verified ABSENT

Node.js, npm, Git for Windows, VS Code, VS Build Tools 2022, Windows SDK 10/11, JDK, Android Studio/SDK, Python working interpreter.

## Project toolchain required (from `package.json` + `mobile/package.json`)

- Desktop: Node `>=22.5 <23` (engines), npm bundled, Electron 37.2.0, better-sqlite3 12.2.0 (native, needs MSVC+Python), electron-builder 26.0.12, Vite 6, Vitest 3, Playwright 1.63
- Customer App: Expo SDK 52 / RN 0.76, builds via `eas build -p android` (cloud) — **no local Android SDK required**
- License Manager: same Electron toolchain as POS (separate electron-builder config)
