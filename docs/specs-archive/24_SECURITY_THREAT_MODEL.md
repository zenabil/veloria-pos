# 24 — Security Threat Model

## Assets

- sales data
- customer balances
- supplier balances
- product/inventory data
- company profile
- backups
- application configuration

## Threats

- malicious renderer content
- unsafe IPC payloads
- path traversal
- arbitrary external navigation
- malicious/invalid restore file
- corrupted database
- accidental deletion
- compromised packaged resources

## Controls

### Renderer isolation

- context isolation
- nodeIntegration disabled
- narrow preload

### IPC validation

Every mutating command validates:

- types
- ranges
- identifiers
- business preconditions

### SQL safety

Prepared statements and controlled query builders.

### Restore safety

Validate SQLite files before activation.

### External navigation

No silent navigation from page content.

### Package integrity

Use application/package integrity features that are compatible with the chosen Electron release strategy.

## Security release gate

Block release for:

- arbitrary command execution
- arbitrary SQL from renderer
- unrestricted filesystem access
- secrets bundled into renderer
- unsafe external navigation
