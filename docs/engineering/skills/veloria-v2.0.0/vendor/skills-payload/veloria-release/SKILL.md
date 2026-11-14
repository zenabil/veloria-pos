---
name: veloria-release
description: "Prepare safe, reproducible Windows desktop releases for Veloria, including versioning, Electron packaging, native module ABI, signing, installer validation, update integrity, release notes, and rollback readiness."
---

# Veloria Release — reproducible Windows build and distribution

## Mission

Ensure the artifact users install is the artifact that was built, tested, reviewed, and approved. Development success alone is not release readiness.

## Inspect before releasing

Verify package scripts, runtime versions, lockfiles, Electron version, target architecture, builder configuration, native modules, signing setup, updater design, artifact channels, and current versioning policy. Never assume a specific Electron ABI, Node version, migration count, or package target from a historical note.

## Reproducible build rules

- Use the committed lockfile and documented supported runtime/toolchain.
- Avoid unreviewed dependency upgrades during a bug-fix release.
- Build from a clean, known revision and record the commit/hash, versions, target OS/architecture, and build command.
- Ensure native modules are rebuilt for the exact Electron runtime and target architecture.
- Verify required resources, migrations, preload/main files, OCR/PDF workers, fonts, icons, and license public keys are included.
- Verify debug files, test secrets, private keys, local databases, and development-only tools are excluded.

## Signing and integrity

- Sign Windows executables/installers when a production signing certificate is available and policy requires it.
- Never disable signature or integrity verification merely to make an update succeed.
- Keep signing credentials outside source control and restrict access.
- Generate cryptographic hashes for release artifacts and verify them after upload/download.
- Treat unsigned temporary builds as test-only, clearly labeled artifacts.

## Installer and update validation

Test fresh installation, upgrade from each supported prior release, uninstall behavior, retained database/data, default backup, rollback/recovery, offline launch, and update interruption. Verify update signatures before applying an update. Do not overwrite user data as part of application updates.

## Release gates

- Required automated gates pass.
- No unresolved Blocker/Critical/High finding without documented approval and mitigation.
- Packaged application launches on a clean Windows test environment.
- Native modules and external worker/resource files work in the packaged build.
- Printing, database initialization, license validation, and backup paths work in the packaged build.
- Release notes identify user-visible changes and data/schema migration effects.
- Recovery and support instructions are available.

## Rollback

Define a rollback strategy before shipping schema or updater changes. If database migrations are not backward-compatible, application rollback alone may not be safe; use a tested database recovery/forward-fix plan.

## Reference

- `references/windows-release-checklist.md`
