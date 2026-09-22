# 15 — Build, Packaging & Windows Release

## Build outputs

Primary:

```text
Veloria-PoS-Setup.exe
```

Optional:

```text
Veloria-PoS-Portable.exe
```

## Packaging

Use `electron-builder` with NSIS for the primary Windows installer.

## Native SQLite build

The build pipeline must rebuild `better-sqlite3` against the exact Electron version used by the release.

Conceptually:

```text
npm ci
→ install native build prerequisites
→ electron-rebuild / equivalent target-specific rebuild
→ typecheck
→ lint
→ tests
→ Next/static build
→ Electron packaging
→ install in clean VM/machine
→ runtime smoke test
```

Do not validate `better-sqlite3` only against host Node.js ABI.

## Windows build prerequisites

Development/build machines require:

- Node.js supported LTS release
- npm version pinned by the project
- Python 3
- Visual Studio Build Tools with C++ workload
- Windows SDK
- Git

The end-user machine does not need these build tools.

## Installer behavior

Installer should support:

- installation directory selection
- Start Menu shortcut
- optional Desktop shortcut
- uninstaller
- version metadata
- company/product metadata
- proper icon

## User data rule

Application updates/uninstall should not silently delete the user's database.

Data directory must be separated from packaged application resources.

## Production build hardening

Production build must not contain:

- development server URLs
- test fixtures
- sample business data
- test API keys
- source maps if policy says to omit them from distribution
- unnecessary devtools exposure

## Versioning

Use semantic versioning.

Example:

```text
2.0.0
2.0.1
2.1.0
```

Schema version is tracked independently.

## Release checklist

```text
[ ] Clean checkout
[ ] npm ci
[ ] Lockfile validated
[ ] Native modules rebuilt for Electron
[ ] Typecheck
[ ] Lint
[ ] Unit tests
[ ] Integration tests
[ ] E2E smoke
[ ] UI audit
[ ] Security audit
[ ] Static export/build
[ ] electron-builder
[ ] Installer generated
[ ] Clean machine install
[ ] App starts
[ ] DB opens
[ ] Sale works
[ ] Printing works
[ ] Backup works
[ ] Restart persistence verified
[ ] Uninstaller verified
[ ] Artifact checksums generated
```
