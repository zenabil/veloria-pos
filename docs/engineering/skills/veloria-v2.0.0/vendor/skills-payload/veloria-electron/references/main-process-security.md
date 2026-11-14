# Main-process security checklist

## Window and renderer

- [ ] Context isolation enabled.
- [ ] Node integration disabled in renderer.
- [ ] Preload is the only intended bridge.
- [ ] CSP is restrictive and verified against real app resources.
- [ ] Navigation and popup creation are restricted.
- [ ] External URL handling is explicit and validated.

## IPC

- [ ] Every channel has a schema and bounded payload.
- [ ] Sender/frame is validated.
- [ ] Authorization and license checks happen in trusted code.
- [ ] No arbitrary SQL, shell, filesystem, or generic IPC escape hatch.
- [ ] Errors are sanitized for UI and detailed enough in protected logs.
- [ ] Mutations have transactional and idempotency behavior.

## Files and secrets

- [ ] Paths are normalized and contained within approved locations.
- [ ] File types/sizes are bounded.
- [ ] Symlink and overwrite behavior is explicit.
- [ ] Secrets never cross into renderer state or logs.
- [ ] Backup/export/import flows have explicit consent and integrity checks.

## Packaged runtime

- [ ] Main and preload artifacts are packaged.
- [ ] Native modules match Electron ABI and target architecture.
- [ ] No development-only privileges or test keys ship.
- [ ] Installer and update artifacts are verified.
