# WINDOWS_SERVICES_AUDIT.md (2026-10-03)

## Policy applied

No service was changed during this audit. Every service below is left at its current configuration because on a 2 GB machine no single optional service offers a safe, demonstrable gain, and several "optimizable" services (Defender, Firewall, Update, sppsvc) are explicitly protected by the mission rules.

| Service                | Status / StartType    | Purpose                              | Proposal                                                                     |
| ---------------------- | --------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| WinDefend              | Running / Automatic   | Antivirus service                    | **No change** (protected)                                                    |
| WdNisSvc               | Stopped / Manual      | Defender network inspection          | No change                                                                    |
| MpsSvc (Firewall)      | Running / Automatic   | Firewall                             | **No change** (protected)                                                    |
| wuauserv               | Stopped / Manual      | Windows Update                       | No change (protected); status unknown, check in Settings                     |
| sppsvc                 | Stopped / Automatic\* | Software Protection (licensing)      | No change; stopped state noted, Windows will start on demand                 |
| IObitUnSvr             | Stopped / Automatic   | IObit Uninstaller background service | No change pending user decision on IObit removal (see authorization request) |
| GoogleUpdater x2       | Stopped / Automatic   | Chrome updater                       | No change (required by Chrome)                                               |
| Intel TPM Provisioning | Stopped / Automatic   | Hardware TPM                         | No change (hardware-related)                                                 |

- `sppsvc` shows Automatic start with Stopped status at audit time — normal on-demand behavior, not an error.

## Rollback

No changes were made, so no rollback is required. Template for any future authorized change: record `sc qc <name>` output before the change, apply the smallest modification, verify boot + app functionality, restore with `sc config <name> start= <original>`.
