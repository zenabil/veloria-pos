# Windows release checklist

## Build identity
- [ ] Clean/known source revision recorded.
- [ ] Runtime and toolchain versions recorded.
- [ ] Lockfile honored; no hidden dependency drift.
- [ ] Target architecture and installer type recorded.

## Artifact integrity
- [ ] Correct main/preload/renderer output included.
- [ ] Native modules match Electron runtime ABI and architecture.
- [ ] PDF/OCR/worker/resources verified in packaged output.
- [ ] Public verification key/resources present where required.
- [ ] Private keys, secrets, test files, local databases, and source maps handled by policy.
- [ ] Artifact hash generated and verified.

## Security
- [ ] Production signatures applied where required.
- [ ] Update signature/integrity checks enabled.
- [ ] Signing credentials not committed or embedded.
- [ ] No unresolved high-risk security findings without approved mitigation.

## User data and recovery
- [ ] Fresh install tested.
- [ ] Supported upgrade paths tested.
- [ ] User data preserved.
- [ ] Backup before destructive migration verified.
- [ ] Interrupted update/recovery tested.
- [ ] Offline core workflows tested.

## Release approval
- [ ] Required test/build gates pass.
- [ ] Manual hardware tests recorded.
- [ ] Release notes and known issues published.
- [ ] Rollback/support procedure ready.
