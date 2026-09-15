# 26 — Release Runbook

## Pre-release

1. Freeze feature changes.
2. Run full quality gate.
3. Verify dependency lockfile.
4. Build from clean checkout.
5. Rebuild native modules for Electron target.
6. Package installer.
7. Install on clean Windows machine.
8. Execute smoke suite.
9. Validate database initialization.
10. Test sale/payment/stock/backup/printing.

## Post-build verification

- verify executable exists
- verify installer exists
- verify file hashes
- verify version metadata
- verify app starts
- verify SQLite loads
- verify no development URL remains

## Release artifacts

```text
release/
  Veloria-PoS-Setup.exe
  Veloria-PoS-Portable.exe
  SHA256SUMS.txt
  RELEASE_NOTES.md
```

## Rollback

If the release corrupts or mishandles data:

1. stop rollout
2. preserve affected logs and DB
3. restore supported prior application version
4. restore verified backup if required
5. investigate migration compatibility
6. publish a corrected release
