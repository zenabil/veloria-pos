# 09 — Electron, IPC & Security

## Security baseline

The Electron app must use:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true` where compatible with the chosen preload architecture
- restrictive navigation policy
- a minimal preload surface
- no arbitrary renderer-controlled filesystem paths without validation
- no renderer access to `child_process`
- no renderer access to SQLite

## Process responsibilities

### Main process

Owns:

- database
- filesystem
- printer APIs
- hardware adapters
- backup/restore
- app lifecycle
- single instance
- diagnostics

### Preload

Exposes a typed, minimal API:

```text
app
  getVersion()
  restart()

system
  openDataFolder()
  selectFolder()

database
  health()
  location()
  query(command)
  execute(command)

printing
  listPrinters()
  getDefaultPrinter()
  printReceipt()
  printA4Invoice()
  testPrinter()

backup
  status()
  create()
  list()
  restore()
```

The actual API surface should be narrower than a generic `execute(table, type, args)` interface. Prefer named application commands and read-only queries over generic database RPC.

## IPC contract rules

Each channel has:

- unique name
- input schema
- output schema
- timeout behavior
- error mapping
- audit requirement
- test

Use a schema validator such as Zod at the IPC boundary.

## Forbidden IPC design

Do not expose:

```text
query(table, arbitraryWhereObject)
execute(table, arbitraryOperation, arbitraryArgs)
```

as the public renderer API. Such generic database brokers make business authorization and validation too weak.

Instead expose explicit contracts such as:

```text
products.search
sales.create
sales.cancel
customers.search
customers.recordPayment
reports.getPeriodPerformance
backup.create
printing.printReceipt
```

## Navigation security

The app should load its packaged static content through a trusted local origin/protocol and deny navigation to unexpected origins except explicit user-triggered external links.

## External URLs

External navigation must be allow-listed and opened with the OS default browser through the main process.

## File paths

All paths are validated and normalized in the main process.

Restore operations must reject:

- directories
- non-SQLite files
- unexpected extensions
- paths outside approved user-selected locations when such a restriction is required

## Logging

Never log:

- passwords (none should exist in this scope)
- secrets
- complete customer statements unnecessarily
- card/payment credentials

Log technical event IDs and contextual metadata instead.

## Crash behavior

Main-process fatal errors should:

1. log the error
2. attempt a safe database close
3. prevent duplicate shutdown paths
4. show a user-friendly recovery message where feasible
5. preserve the database file and logs

Renderer crashes should be recoverable by reloading the window when safe.
