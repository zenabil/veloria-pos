# veloria-release â€” Skill Audit

**Audit ID:** `2026-11-11-full-forensic-audit`  
**SKILL.md read in full:** yes  
**References read in full:** yes (see Scope)  
**Skill loaded via skill tool:** yes

## 1. Verdict

The packaging configuration is careful and production-shaped â€” resources outside the asar, N-API native module so no compiler is needed on the build machine, explicit exclusions of debug artefacts, per-machine install with user data outside the install directory, and SHA256 manifests that match the shipped artifacts. Two material gaps: the binaries are NOT Authenticode-signed, and electron-builder is configured with `verifyUpdateCodeSignature: false`.

## 2. Scope covered

SKILL.md + references/windows-release-checklist.md; config/electron-builder/{pos.yml,manager.yml}; scripts/release/* (4: checksums.js, smoke.js, stamp-electron-pkg.js, version.mjs); package.json scripts; release/ artifacts; scripts/licensing/sign-integrity.mjs.

## 3. Skill checklist result

| Criterion                                                      | Status             | Evidence                                                                                                                                                    |
| -------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean/known source revision recorded                           | **PARTIAL**        | HEAD is d9e992b but no revision is stamped into the artifact metadata by the builder config                                                                 |
| Lockfile honored; no hidden dependency drift                   | **VERIFIED**       | package-lock.json committed; knip reports no drift                                                                                                          |
| Native modules match Electron runtime ABI                      | **VERIFIED**       | better-sqlite3 13.0.3 ships prebuilds/win32-x64.node (N-API) â€” the same binary works on Node and Electron 45; npmRebuild:false is correct, not a shortcut |
| PDF/OCR/worker/resources verified in packaged output           | **VERIFIED**       | pos.yml unpacks pdfjs pdf.worker.mjs, tesseract.js-core, and ships resources/ocr/lang via extraResources                                                    |
| Public verification key present where required                 | **VERIFIED**       | extraResources: resources/license -> license                                                                                                                |
| Private keys, secrets, test files, local databases excluded    | **VERIFIED**       | secret-scan enumerates the scan set and fails closed                                                                                                        |
| Artifact hash generated and verified                           | **VERIFIED**       | release/SHA256SUMS.txt matches all 7 artifacts byte-for-byte (recomputed in this audit)                                                                     |
| Production signatures applied where required                   | **VIOLATED**       | Get-AuthenticodeSignature: NotSigned on Veloria-PoS-Setup-1.0.4.exe                                                                                         |
| Update signature/integrity checks enabled                      | **VIOLATED**       | pos.yml `verifyUpdateCodeSignature: false`                                                                                                                  |
| Fresh install tested                                           | **PARTIAL**        | tests/e2e/installer.spec.ts exists but self-skips without a built installer                                                                                 |
| Supported upgrade paths tested                                 | **NOT_APPLICABLE** | single shipped version 1.0.4                                                                                                                                |
| Packaged application launches on a clean Windows environment   | **PARTIAL**        | E2E launches the built app from source, not the installed artifact                                                                                          |
| No unresolved Blocker/Critical/High finding without mitigation | **PARTIAL**        | see 12_RELEASE.md                                                                                                                                           |

## 4. Findings raised by this skill

No skill-level contradiction was found. The skill's rules are implementable and, where checkable, already implemented in the codebase. Domain-level defects discovered while auditing this skill's subject matter are reported in the corresponding `03_SKILL_AUDITS/` file and are cross-referenced there.

## 5. What is genuinely solid

- User data lives outside the install directory (PROGRAMDATA/APPAPPDATA) with `deleteAppDataOnUninstall: false` â€” uninstall never destroys a customer's business data.
- The exclusion of `dist/builder-*.yml` and `dist/win-unpacked/**` prevents build artefacts from bloating and destabilising the asar.
- NSIS is configured with `installerLanguages: fr_FR` and a classic (non-one-click) assistant.
- version.mjs enforces a single version across POS, License Manager, Client, Owner and the Android code levels.
- An integrity manifest covering 254 files is signed at build time.

## 6. Not verified / limits of this audit

- The installer was not executed end-to-end on a clean Windows profile in this audit.
- Code-signing was not performed â€” no certificate is present on this machine (confirmed via Authenticode: NotSigned).
- An auto-update channel does not exist (`publish: []`), so update integrity is a future concern, not a live one.

## 7. Metrics

- Checklist items evaluated: **13** â€” PARTIAL: 4, VERIFIED: 6, VIOLATED: 2, NOT_APPLICABLE: 1
- Skill-level findings owned by this skill: **0**
- Domain findings owned by this skill: see `03_SKILL_AUDITS/`

---

_Part of the `2026-11-11-full-forensic-audit` skill-by-skill forensic audit. Companion: `SKILLS_SYSTEM_AUDIT.md` (system-level analysis) and `../04_CROSS_SKILL_AUDIT.md` (inter-skill conflicts)._
