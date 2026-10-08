# SYSTEM_BASELINE.md — Veloria Workstation Audit (2026-10-03)

Measured on the actual machine. No assumptions. Commands: `Get-ComputerInfo`, `Get-CimInstance`, registry, filesystem checks.

## Hardware (verified)

| Item                | Value                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| CPU                 | Intel Core i3-2100 @ 3.10GHz (Sandy Bridge, 2011), 2 cores / 4 threads                                                                           |
| RAM (total)         | 2.0 GB (2,109,456,384 bytes)                                                                                                                     |
| RAM (free at audit) | ~170 MB (FreePhysicalMemory=174,300 KB) — **critical memory pressure**                                                                           |
| GPU                 | NVIDIA GeForce 210, driver 21.21.13.4201 (2016, legacy)                                                                                          |
| Disk C:             | NTFS 108.8 GB total, **72.4 GB free** — healthy, no space problem                                                                                |
| Disk E:             | NTFS 10.4 GB total, 3.3 GB free; contains a folder named `Veloria POS dev zenagui bilal` (contents not inspected — possible project copy/backup) |
| Uptime at audit     | ~12 h                                                                                                                                            |

## Windows (verified)

| Item                            | Value                                                                                                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edition                         | Windows 10 Pro, 25H2, build 26200.7922, 64-bit                                                                                                                                      |
| Security                        | Firewall (MpsSvc) Running; Defender service (WinDefend) Running BUT **real-time monitoring disabled** (`HKLM\...\Real-Time Protection\DisableRealtimeMonitoring=1`) — see risk note |
| Windows Update                  | `wuauserv` Manual/Stopped; last-success timestamp not readable from registry — status **unknown**, needs Settings check                                                             |
| Restore points                  | None returned by `Get-ComputerRestorePoint` — **no restore point available** before changes                                                                                         |
| Startup entries (WMI)           | `SecurityHealthSystray.exe`, `NvBackend.exe` only                                                                                                                                   |
| Non-Microsoft scheduled tasks   | None enumerated                                                                                                                                                                     |
| Auto-start services not running | GoogleUpdater x2, Intel TPM Provisioning, IObitUnSvr, sppsvc (Software Protection — stopped, note for licensing)                                                                    |

## Top resource consumers at audit

- CPU (cumulative): explorer, DriverBooster, UninstallMonitor (IObit), chrome, OpenCode/opencode-cli
- RAM: opencode-cli 316 MB, OpenCode ~350 MB combined, explorer 108 MB, Chrome multi-process
- Observation: on a 2 GB machine, Chrome + OpenCode + IObit background tools leave ~170 MB free. **RAM is the #1 bottleneck**, not disk or CPU.

## Development environment (verified — essentially absent)

| Tool                           | Status                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Node.js / npm                  | **NOT installed** (no exe at any standard path, `where.exe` negative, NVM dirs missing)                       |
| Git                            | **NOT installed**                                                                                             |
| Python                         | **Broken**: uninstall entries for 3.12.10 exist but no files, no `py` launcher, PATH entries orphaned         |
| VS Code / editor               | **NOT installed** (only OpenCode desktop 2.0.22 present)                                                      |
| VS Build Tools / MSVC `cl.exe` | **NOT installed** (`...\2022\` and `18\` dirs exist but contain 0 files — orphan empty dirs dated 2026-10-03) |
| Windows SDK                    | **NOT installed** (`Windows Kits\10\` contains only `UnionMetadata`, no `bin`/`Lib`)                          |
| JDK / Android SDK / ADB        | **NOT installed**                                                                                             |
| .NET                           | `~\.dotnet\tools` on PATH (unverified contents); MSBuild legacy WF targets only                               |
| Project `node_modules/`        | Present (144 `.bin` entries) — orphan from a previous toolchain, **not usable without Node**                  |
| winget                         | v1.29.380 available; HTTPS internet works (nodejs.org reachable, ping 195–370 ms)                             |

## PATH integrity (verified)

- Machine PATH contains 2 orphan entries: `C:\ProgramData\chocolatey\bin` (dir does not exist), `...\AppData\Local\nvm` (does not exist).
- User PATH contains 4 orphan entries: Python312 x2, `...\AppData\Local\nvm`, `C:\nvm4w\nodejs` (none exist).
- Valid: WindowsApps, `.dotnet\tools`, `.lmstudio\bin`, OpenSSH.

## Risks / blockers

1. **No restore point.** Create one before any system-wide change.
2. **Defender real-time protection off.** Do not treat as an optimization; recommend re-enabling (needs authorization since security-sensitive).
3. **2 GB RAM** fundamentally limits: Android Emulator impossible, Electron packaging will be slow, Chrome + dev servers concurrently will thrash.
4. `E:\Veloria POS dev zenagui bilal` — unknown copy; do not touch until identified.
