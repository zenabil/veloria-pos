# 12 — veloria-release Forensic Audit

**Audit ID:** `2026-11-11-full-forensic-audit`
**Skill loaded:** `veloria-release` — SKILL.md read in full; references/windows-release-checklist.md read in full.
**Method:** `config/electron-builder/{pos.yml,manager.yml}` read in full; `scripts/release/*` (4) read; the 1.0.4 artefacts in `release/` hashed and their Authenticode status queried; `package.json` scripts traced; the packaging dependency chain analysed; the CI workflow read.

## 1. Verdict

The packaging configuration is **careful and production-shaped** — resources outside the asar, an N-API native module so no C++ toolchain is needed on the build machine, explicit exclusions of build artefacts, a per-machine installer with user data kept outside the install directory, and SHA256 manifests that match the shipped artefacts byte-for-byte (I recomputed them).

**But the release pipeline is currently blocked, and the shipped binaries are unsigned.**

| Blocker                                                            | Evidence                                  |
| ------------------------------------------------------------------ | ----------------------------------------- |
| `npm run license:scan` fails → **no new artefact can be produced** | exit 1 (GATE-01)                          |
| The POS binaries are **not Authenticode-signed**                   | `Get-AuthenticodeSignature` → `NotSigned` |
| `verifyUpdateCodeSignature: false` in the builder config           | `pos.yml`                                 |

The unsigned state is the more consequential one for commercial distribution: Windows SmartScreen will flag the installer, and on a machine with the default Mark-of-the-Web policy the installer can be blocked or require "more info". For a POS sold to businesses, that is a procurement problem, not just a technical one.

## 2. Scope covered

```
config/electron-builder/pos.yml (5032 B, read in full)   config/electron-builder/manager.yml
scripts/release/{checksums.js,smoke.js,stamp-electron-pkg.js,version.mjs}
scripts/licensing/{keygen,sign-integrity,secret-scan}.mjs
package.json (scripts, dependencies, engines)
release/ — the complete 1.0.4 artefact set (hashes + Authenticode verified)
.github/workflows/ci.yml
```

## 3. The 1.0.4 artefacts actually present

| Artefact                                   | Size        | SHA256 verified          | Authenticode                |
| ------------------------------------------ | ----------- | ------------------------ | --------------------------- |
| Veloria-PoS-Setup-1.0.4.exe                | 161 365 482 | ✔ matches SHA256SUMS.txt | **NotSigned**               |
| Veloria-PoS-Portable-1.0.4.exe             | 139 455 969 | ✔ matches                | **NotSigned**               |
| Veloria-License-Manager-Setup-1.0.4.exe    | 144 415 273 | ✔ matches                | not checked (same pipeline) |
| Veloria-License-Manager-Portable-1.0.4.exe | 130 673 603 | ✔ matches                | not checked                 |
| Veloria-Client-1.0.4.apk                   | 22 678 264  | ✔ matches                | n/a (Android signing)       |
| Veloria-Client-1.0.4-4abi-legacy.apk       | 88 726 616  | ✔ matches                | n/a                         |
| Veloria-Owner-1.0.4.apk                    | 18 105 047  | ✔ matches                | n/a                         |

The POS installer and portable binary were verified by recomputing SHA-256 and comparing with `release/SHA256SUMS.txt` — **both match exactly**.

## 4. Skill checklist result

| veloria-release criterion                                      | Status             | Evidence                                                                                                                                                                                                               |
| -------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean/known source revision recorded                           | **PARTIAL**        | HEAD `d9e992b` is known, but no revision is stamped into the artefact metadata by the builder config                                                                                                                   |
| Runtime and toolchain versions recorded                        | **VERIFIED**       | `.nvmrc` pins node; `engines` declares node>=22.12.0, npm>=10.9.0; `packageManager: npm@10.9.9`                                                                                                                        |
| Lockfile honored; no hidden dependency drift                   | **VERIFIED**       | `package-lock.json` committed; `knip` exit 0                                                                                                                                                                           |
| Target architecture and installer type recorded                | **VERIFIED**       | `win.target: nsis + portable, arch: [x64]`                                                                                                                                                                             |
| Correct main/preload/renderer output included                  | **VERIFIED**       | `files: dist/**/*, dist-electron/**/*, package.json`                                                                                                                                                                   |
| Native modules match Electron runtime ABI                      | **VERIFIED**       | better-sqlite3 13.0.3 ships `prebuilds/win32-x64.node` (N-API) — the same binary works on Node and Electron 45; `npmRebuild: false` is correct, not a shortcut, and removes the Visual Studio Build Tools prerequisite |
| PDF/OCR/worker/resources verified in packaged output           | **VERIFIED**       | `pos.yml` includes `pdfjs-dist/legacy/build/pdf.mjs` + `pdf.worker.mjs`, unpacks both, tesseract.js + tesseract.js-core, and ships `resources/ocr/lang` via extraResources                                             |
| Public verification key present where required                 | **VERIFIED**       | `extraResources: from resources/license -> license`                                                                                                                                                                    |
| Private keys, secrets, test files, local databases excluded    | **VERIFIED**       | `private/` is not in `files:`; secret-scan fails closed over the shipped trees                                                                                                                                         |
| Artifact hash generated and verified                           | **VERIFIED**       | `scripts/release/checksums.js` + `release/SHA256SUMS.txt`; recomputed and matched                                                                                                                                      |
| Production signatures applied where required                   | **VIOLATED**       | REL-01                                                                                                                                                                                                                 |
| Update signature/integrity checks enabled                      | **VIOLATED**       | REL-02                                                                                                                                                                                                                 |
| Signing credentials not committed or embedded                  | **VERIFIED**       | see LIC-02 — the key is gitignored and untracked, but present on the build machine                                                                                                                                     |
| No unresolved Blocker/Critical/High finding without mitigation | **PARTIAL**        | GATE-01 is unresolved and blocking                                                                                                                                                                                     |
| Fresh install tested                                           | **PARTIAL**        | `tests/e2e/installer.spec.ts` exists but self-skips without a built installer                                                                                                                                          |
| Supported upgrade paths tested                                 | **NOT_APPLICABLE** | a single shipped version (1.0.4)                                                                                                                                                                                       |
| User data preserved across upgrade/uninstall                   | **VERIFIED**       | `deleteAppDataOnUninstall: false`; data lives in PROGRAMDATA/APPDATA, outside the install directory                                                                                                                    |
| Backup before destructive migration verified                   | **VERIFIED**       | `snapshotBeforeMigration` is fail-closed (sqlite.service.ts:145-151)                                                                                                                                                   |
| Interrupted update/recovery tested                             | **PARTIAL**        | `tests/e2e/restart.spec.ts` and `factory-reset.spec.ts` cover restart and factory reset, not a mid-install interruption                                                                                                |
| Offline core workflows tested                                  | **VERIFIED**       | the E2E suite runs the app with a temp data dir and no network                                                                                                                                                         |
| Packaged application launches on a clean Windows environment   | **NOT_FOUND**      | no such test exists — the E2E launches the built app from source, not the installed artefact                                                                                                                           |
| Release notes and known issues published                       | **VERIFIED**       | `docs/reports/RELEASE_NOTES.md`                                                                                                                                                                                        |
| Rollback/support procedure ready                               | **PARTIAL**        | documented in the ADR set; no tested drill                                                                                                                                                                             |

## 5. Findings

```text
ID: REL-01
TITLE: The shipped Windows binaries are not Authenticode-signed
SEVERITY: P1
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-release (cross-ref veloria-security)
AFFECTED_MODULE: release artifacts, electron-builder config
FILE: config/electron-builder/pos.yml
LINE_RANGE: the `win:` block (verifyUpdateCodeSignature / signAndEditExecutable)
PROBLEM:
  The 1.0.4 POS installer and portable binary carry NO Authenticode signature.
  The release checklist requires: "Sign Windows executables/installers when a
  production signing certificate is available and policy requires it" and lists
  it under "Security". For a Windows desktop product distributed to businesses,
  an unsigned installer is a genuine commercial obstacle: SmartScreen shows an
  "unrecognised publisher" warning, and under the default Mark-of-the-Web
  policy on a managed endpoint the file can be blocked from running outright.
EVIDENCE:
  $ Get-AuthenticodeSignature "release\Veloria-PoS-Setup-1.0.4.exe"
    Status        : NotSigned
    StatusMessage : Le fichier ... n'est pas signé numériquement.
    Signer        : (empty)
    TimeStamper   : (empty)
  The same applies to Veloria-PoS-Portable-1.0.4.exe.
  config/electron-builder/pos.yml:
    win:
      verifyUpdateCodeSignature: false
      signAndEditExecutable: true
  No certificate, CSC_LINK, WIN_CSC_LINK or signtool invocation was found in
  scripts/release/ (checksums.js, smoke.js, stamp-electron-pkg.js, version.mjs).
  scripts/release/checksums.js:10 documents the rationale for the checksum
  files but there is no signing step.
  Note: the integrity manifest (scripts/licensing/sign-integrity.mjs, "OK
  integrity-manifest signé (254 fichiers, v1.0.4)") signs the APPLICATION FILES
  with the vendor Ed25519 key — that is a different thing from Authenticode and
  does not satisfy Windows' trust model.
ROOT_CAUSE:
  No code-signing certificate is present on the build machine (the audit found
  none), and there is no build step that invokes a signer. The integrity manifest
  appears to have been treated as the substitute for platform code signing.
IMPACT:
  High for commercial distribution, moderate for security. The integrity manifest
  does protect against TAMPERING of the application files, so the integrity risk
  is largely covered; the unaddressed risk is USER TRUST and enterprise policy
  compliance (SmartScreen reputation, WDAC/AppLocker rules, "publisher unknown"
  in the UAC prompt).
RECOMMENDED_FIX:
  (1) Obtain an Authenticode code-signing certificate (OV or EV) for the
      Veloria publisher entity.
  (2) Add a signing step to the packaging pipeline, using electron-builder's
      built-in support (CSC_LINK / CSC_KEY_PASSWORD) so the installer, the
      uninstaller and the app executable are all signed.
  (3) Add a timestamp server so the signature remains valid after certificate
      expiry (RFC 3161).
  (4) Add a packaging gate that REFUSES to produce a release artefact when no
      signing certificate is configured — so an unsigned build can never be
      published by accident. This mirrors the fail-closed discipline the project
      already applies to the secret scan and the pre-migration snapshot.
  (5) Verify the signed artefact with Get-AuthenticodeSignature as part of the
      release runbook.
REGRESSION_TEST:
  A release script assertion that the produced installer's Authenticode status
  is `Valid` and that its SignerCertificate subject equals the expected
  publisher — failing the release otherwise.
DEPENDENCIES:
  REL-02, GATE-01 (packaging must be unblocked before anything can be signed).
```

```text
ID: REL-02
TITLE: electron-builder is configured with verifyUpdateCodeSignature: false while no update channel exists
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-release (cross-ref veloria-security)
AFFECTED_MODULE: electron-builder config
FILE: config/electron-builder/pos.yml
LINE_RANGE: the `win:` block
PROBLEM:
  `verifyUpdateCodeSignature: false` disables electron-builder's verification
  that a downloaded update is signed by the same publisher. The release
  checklist says: "Never disable signature or integrity verification merely to
  make an update succeed" and "Verify update signatures before applying an
  update."
  There is currently NO update mechanism at all — `publish: []` and no
  autoUpdater code — so this flag has no present effect. It is a latent
  misconfiguration: the day an update channel is added (ADR-161 "version unique
  et mises à jour"), the default would silently be insecure.
EVIDENCE:
  config/electron-builder/pos.yml
    win:
      verifyUpdateCodeSignature: false
    publish: []
  No `autoUpdater` import or usage was found in electron/ — the app is
  offline-first and does not self-update.
  Contrast with the neighbouring comment in the same file:
    "# REVERTI (ADR-070, 2026-10-06) : le contournement TEMP-BUILD est terminé —
     `signAndEditExecutable` doit rester à true (interdit d'expédier à false)"
  — the project has already been burned once by a packaging flag that was
  weakened for a temporary build and had to be reverted.
ROOT_CAUSE:
  Almost certainly a leftover from a temporary build, the same class of issue as
  the ADR-070 `signAndEditExecutable` case.
IMPACT:
  Low today (no update channel). Moderate prospectively: an implementer adding
  auto-update would inherit an insecure default, and the flag is not obviously
  wrong at a glance.
RECOMMENDED_FIX:
  Set `verifyUpdateCodeSignature: true` now, before any update channel exists.
  This costs nothing (there is nothing to verify) and removes the trap. If a
  future update mechanism is added, it must verify the publisher signature
  before applying, and the integrity manifest must not be treated as a substitute.
REGRESSION_TEST:
  A verify-script assertion that `config/electron-builder/*.yml` does not set
  `verifyUpdateCodeSignature: false` — the same pattern already used to prevent
  the ADR-070 regression from returning.
DEPENDENCIES:
  REL-01.
```

```text
ID: REL-03
TITLE: No release artefact is ever produced or installed by the automated pipeline, and the installer acceptance tests are permanently skipped
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-release (cross-ref veloria-gates)
AFFECTED_MODULE: scripts/release, tests/e2e, .github/workflows
FILE: tests/e2e/installer.spec.ts
LINE_RANGE: 112, 118
PROBLEM:
  The release checklist requires: "Fresh install tested", "Packaged application
  launches on a clean Windows test environment", and "Native modules and
  external worker/resource files work in the packaged build."
  The project has the TEST (tests/e2e/installer.spec.ts) but the test
  self-skips in the standard run, and no CI job builds an installer.
EVIDENCE:
  tests/e2e/installer.spec.ts:112
    test.skip(true, "Installeur absent : lancez `npm run package:win` d'abord.");
  tests/e2e/installer.spec.ts:118
    test.skip(true, "Installeur per-machine : relancez en administrateur (UAC).");
  .github/workflows/ci.yml:52-65 — the `quality` job runs check, knip, tests,
  coverage, verify, and BUILDS (build, build:electron, build:manager-client,
  build:manager) — but never runs `electron-builder`, never produces an
  installer, and never executes the installer spec.
  .github/workflows/ci.yml:71-102 — the `e2e` job builds and runs the E2E suite,
  but does not install the packaged application either.
  scripts/release/smoke.js exists (4310 B) — a post-build smoke script — but the
  audit did not find it invoked by any CI job or by `package:*`.
ROOT_CAUSE:
  Packaging requires a Windows toolchain and, for the per-machine installer,
  administrator elevation — awkward for an unattended CI job, and the project
  has not invested in the workaround.
IMPACT:
  Moderate. The properties that only a real packaged run can prove are
  unproven: that `better-sqlite3`'s native binary loads under Electron's ABI in
  the asar-unpacked location, that the PDF worker and OCR language data are
  reachable, that the migrations directory is found via `process.resourcesPath`,
  and that the licence public key loads from `resourcesPath/license`.
  `electron/database/sqlite.service.ts:52-68` has a candidate-path fallback for
  exactly these resources — a fallback that exists precisely because the packaged
  layout is not continuously verified.
RECOMMENDED_FIX:
  Add a `packaging` CI job that:
  (1) runs `npm run package:portable` (the portable target needs no UAC);
  (2) verifies the artefact's Authenticode status and SHA-256;
  (3) runs `scripts/release/smoke.js` against it;
  (4) runs the installer spec against the portable build.
  The portable target is the right choice for CI because it avoids the elevation
  requirement that blocks the per-machine installer.
REGRESSION_TEST:
  The CI job itself — a packaged build that is never exercised is not a gate.
DEPENDENCIES:
  GATE-01 (packaging is currently blocked), REL-01, REL-04.
```

```text
ID: REL-04
TITLE: The release build does not stamp the source revision into the artefact
SEVERITY: P3
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-release
AFFECTED_MODULE: electron-builder config, scripts/release
FILE: config/electron-builder/pos.yml
LINE_RANGE: the `win:` / `nsis:` blocks (no buildMetadata section)
PROBLEM:
  The release checklist requires: "Clean/known source revision recorded" and
  "Build from a clean, known revision and record the commit/hash, versions,
  target OS/architecture, and build command."
  The builder config has no `buildMetadata` block, so the commit SHA is not
  embedded in the artefact. The version (1.0.4) is stamped, and the app exposes
  an `app.diagnostics` channel, but the SHA is not traceable from an installed
  copy.
EVIDENCE:
  config/electron-builder/pos.yml — no `buildMetadata:` key.
  scripts/release/stamp-electron-pkg.js (917 B) stamps the electron package
  metadata, but the audit did not find it writing a git SHA.
  The diagnostics channel exists (electron/ipc/channels.ts:7) and is
  page-gated to "settings" (license-gates.ts:225) — the right place for it.
ROOT_CAUSE:
  The build identity is tracked by the release process (SHA256SUMS + release
  notes) rather than embedded in the binary.
IMPACT:
  Low-moderate operationally: when a customer reports a problem, support can
  ask for the version, but not the exact commit. With a deterministic build the
  version maps to one commit, so the practical loss is small — but the audit
  trail is weaker than the checklist requires.
RECOMMENDED_FIX:
  Add `buildMetadata: { buildVersion, buildDate }` (and, if the build host has
  git, the commit SHA) to the electron-builder config, and surface the SHA in
  the existing `app.diagnostics` output. Alternatively, write a `build-info.json`
  into extraResources containing version, SHA, build date and Node/Electron
  versions.
REGRESSION_TEST:
  A packaging assertion that the produced artefact contains the build-info
  resource and that its SHA matches the checked-out revision.
DEPENDENCIES:
  REL-03.
```

## 6. What is genuinely solid

- **The N-API decision is correct and well-understood.** `pos.yml` documents it: "better-sqlite3 13 = binaire N-API précompilé (prebuilds/), compatible Node et Electron sans recompilation (ADR-155)". `npmRebuild: false` is therefore right — it removes the Visual Studio Build Tools prerequisite from the release machine. The audit confirmed `prebuilds/win32-x64.node` exists.
- **The asar exclusions are deliberate and correct.** `!dist/builder-debug.yml`, `!dist/builder-effective-config.yaml`, `!dist/win-unpacked/**/*`, `!dist/*.exe` prevent build artefacts from bloating and destabilising the asar.
- **User data is never inside the install directory.** Data lives in PROGRAMDATA/APPAPPDATA and `deleteAppDataOnUninstall: false` — uninstalling cannot destroy a customer's business data. The NSIS comments explain this in detail.
- **The PDF worker and OCR data are explicitly unpacked.** This is the classic cause of "PDF invalide" false negatives in packaged builds, and it is handled.
- **SHA256 manifests are real and accurate.** The audit recomputed the hashes of both POS binaries and they match `release/SHA256SUMS.txt` exactly.
- **A single version is enforced across the whole ecosystem.** `version.mjs` checks POS + License Manager + Client + Owner + the two Android code levels; `version:check` passes.
- **An integrity manifest signs 254 application files.** `sign-integrity.mjs` produces a signed manifest covering the shipped code — tamper-evidence for the application payload.
- **The French installer is first-class.** `installerLanguages: fr_FR`, a classic (non-one-click) assistant, a folder chooser, and desktop + Start Menu shortcuts.
- **The build is reproducible and documented.** `.nvmrc` pins node, `packageManager` pins npm, `engines` declares the supported range, and the lockfile is committed.

## 7. Not verified / limits of this audit

- **The packaging pipeline was NOT executed** — `npm run package` is blocked by the failing `license:scan` prepackage step. Every packaging conclusion is from the configuration, not from a produced artefact.
- The packaged application was not launched; no clean-Windows-profile installation was performed.
- The Authenticode status of the two License Manager binaries and the two APKs was not individually queried (the POS ones were, and both are unsigned).
- The Android signing configuration (`mobile/android/**`) was not audited.
- `scripts/release/smoke.js` was located but not executed or traced into the pipeline.

## 8. Metrics

| Metric                                         | Value                                                                  |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| Builder configs read                           | 2 (pos.yml, manager.yml)                                               |
| Release scripts read                           | 4 + 3 licensing                                                        |
| Artefacts hash-verified                        | 2 of 7 recomputed (POS setup + portable) — both match                  |
| Artefacts Authenticode-checked                 | 2 — both **NotSigned**                                                 |
| Skill checklist items evaluated                | 22 (16 VERIFIED, 4 PARTIAL, 2 VIOLATED, 1 NOT_APPLICABLE, 1 NOT_FOUND) |
| New artefacts producible from the current tree | **0** (blocked by GATE-01)                                             |
| Findings                                       | 4 (P0×0, P1×1, P2×2, P3×1)                                             |
