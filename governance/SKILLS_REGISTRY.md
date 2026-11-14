# Skills Registry

**Version:** 2.0.0  
**Total:** 17 skills (1 orchestrator + 16 specialists)

| Skill ID              | Domain                  | Activate when                                                 | Key dependencies                    |
| --------------------- | ----------------------- | ------------------------------------------------------------- | ----------------------------------- |
| veloria-orchestrator  | Coordination            | All cross-cutting tasks; loads only needed specialists        | All skills; project contract        |
| veloria-db            | Data integrity          | Schema, migration, SQL, repository, transaction               | backup, money, stock, closing, sync |
| veloria-money         | Financial arithmetic    | Totals, prices, discounts, tax, payments, refunds             | db, stock, closing, printing        |
| veloria-stock         | Inventory               | Stock, receipts, packaging, FIFO, adjustments, returns        | db, money, backup                   |
| veloria-electron      | Desktop boundary        | Electron main/preload/renderer, IPC, native services          | security, release, observability    |
| veloria-ui-fr         | POS interface           | Renderer, forms, tables, dialogs, navigation                  | money, printing, electron           |
| veloria-slice         | Feature delivery        | Any complete vertical feature                                 | domain specialist + gates           |
| veloria-gates         | Quality assurance       | Tests, static checks, audit, regression, acceptance           | all applicable specialists          |
| veloria-closing       | Cash/accounting reports | Daily close, cash session, Z report, zakat reporting          | money, db, stock                    |
| veloria-license       | Licensing               | Offline activation, signed license, capabilities              | security, release                   |
| veloria-sync          | Offline-first bridge    | Outbox, Sheets bridge, customer app data exposure             | security, db, observability         |
| veloria-release       | Build/distribution      | Windows installer, signing, updater, packaging                | electron, security, gates, backup   |
| veloria-backup        | Data protection         | Backup, restore, migration snapshots, recovery                | db, security, release               |
| veloria-printing      | Print output            | 80mm, A4, PDF, barcode, QR, labels                            | hardware, ui, money                 |
| veloria-security      | Security engineering    | Threat modeling, secrets, trust boundaries, security findings | all applicable specialists          |
| veloria-hardware      | Peripheral integration  | Scanner, printer, drawer, optional scale                      | printing, observability             |
| veloria-observability | Diagnostics             | Logs, metrics, crash recovery, support bundles                | security, release, hardware, sync   |

## Activation policy

- Do not load all 17 skills for every task.
- Load `veloria-orchestrator` for cross-cutting work or when the affected layer is uncertain.
- Load the narrowest relevant specialist(s); add `veloria-gates` when behavior, data, security, or packaging can change.
- References are supporting material and should be read only when needed.
- The skills are instructions, not proof that a capability exists in the repository.
