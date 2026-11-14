# Task routing matrix

| Task surface | Required skill(s) | Add when relevant |
|---|---|---|
| New or changed feature | `veloria-slice`, `veloria-gates` | domain skills touched |
| SQLite/schema/repository | `veloria-db` | `veloria-backup`, `veloria-money`, `veloria-stock` |
| Money/payment/discount/tax | `veloria-money` | `veloria-db`, `veloria-closing`, `veloria-gates` |
| Inventory/intake/returns | `veloria-stock` | `veloria-db`, `veloria-money` |
| Daily close/cash/Z report | `veloria-closing` | `veloria-money`, `veloria-db` |
| Renderer/UI/accessibility | `veloria-ui-fr` | `veloria-printing` |
| Electron/preload/IPC | `veloria-electron` | `veloria-security` |
| License/activation/features | `veloria-license` | `veloria-security`, `veloria-release` |
| Customer app/data bridge | `veloria-sync` | `veloria-security`, `veloria-db`, `veloria-observability` |
| Installer/build/update | `veloria-release` | `veloria-security`, `veloria-gates` |
| Backup/restore/data migration | `veloria-backup` | `veloria-db`, `veloria-security` |
| Thermal/A4/PDF/barcode/QR | `veloria-printing` | `veloria-hardware`, `veloria-ui-fr` |
| Scanner/cash drawer/scale | `veloria-hardware` | `veloria-printing`, `veloria-observability` |
| Threat model/vulnerability | `veloria-security` | relevant domain skill(s) |
| Logs/crash/performance | `veloria-observability` | `veloria-security`, `veloria-release` |
| Cross-cutting audit | `veloria-orchestrator`, `veloria-gates` | all affected specialists |

Do not load every skill for every task. Load only applicable specialists, plus `veloria-gates` for changes that can affect behavior.
