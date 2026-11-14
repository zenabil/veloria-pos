# veloria-license â€” Skill Audit

**Audit ID:** `2026-11-11-full-forensic-audit`  
**SKILL.md read in full:** yes  
**References read in full:** yes (see Scope)  
**Skill loaded via skill tool:** yes

## 1. Verdict

Offline licensing is implemented with the right primitives â€” Ed25519, canonical payload, public key only in the POS, private key outside version control, capability enforcement in the main process, and an offline activation flow with a local anchor. The significant finding is that the Ed25519 private key that corresponds to the SHIPPED public key is present on this development machine, which means anyone with a copy of this working tree can mint licenses that this build will accept.

## 2. Scope covered

SKILL.md (51 L) + references/license-format-and-operations.md; electron/licensing/* (10 files, incl. protocol.ts 13 KB, license-service.ts 20 KB, fingerprint.ts 6.9 KB, secure-state.ts, license-anchor.ts, catalog.ts, public-key.ts, hash.ts, integrity.ts, prod-deps.ts); license-manager/* (16); scripts/licensing/{keygen,sign-integrity,secret-scan}.mjs; resources/license/public.key; docs/licensing/* (14).

## 3. Skill checklist result

| Criterion                                                             | Status       | Evidence                                                                                                                                                   |
| --------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Established asymmetric signature algorithm, maintained implementation | **VERIFIED** | Ed25519 via node:crypto generateKeyPairSync/sign/verify (keygen.mjs:25)                                                                                    |
| Customer application contains only verification public keys           | **VERIFIED** | resources/license/public.key is the only key shipped; it is the public half                                                                                |
| Signing private keys remain in a controlled vendor environment        | **PARTIAL**  | private/ is gitignored and untracked (verified against .git/index), BUT the private key matching the shipped public key is on this dev disk â€” see LIC-02 |
| Sign a canonical, versioned payload; reject ambiguous encodings       | **VERIFIED** | electron/licensing/protocol.ts canonicalises before verifying                                                                                              |
| Pin the allowed algorithm; reject algorithm negotiation               | **VERIFIED** | protocol.ts rejects unsupported alg; no negotiation path                                                                                                   |
| Support public-key rotation with overlap and key IDs                  | **PARTIAL**  | single public key shipped; see LIC-04                                                                                                                      |
| Deterministic validation order                                        | **VERIFIED** | license-service.ts validates structure â†’ product â†’ signature â†’ binding â†’ dates â†’ state                                                           |
| Fail closed for invalid/unverifiable authorization, preserving data   | **VERIFIED** | invalid license blocks features but never destroys the database                                                                                            |
| Enforce license state in trusted main code, not renderer              | **VERIFIED** | license-gates.ts: 68 LIC + 117 PAGE-gated channels, all checked in handle()                                                                                |
| Capability catalog has one authoritative source or parity tests       | **VERIFIED** | electron/licensing/catalog.ts is the single main-side catalog; the renderer mirrors it read-only via license.getStatus                                     |
| Tests cover tampering, wrong product, expiry, drift, rollback         | **VERIFIED** | tests/unit licensing suite + tests/e2e/license-activation.spec.ts                                                                                          |
| Do not promise tamper-proof protection                                | **VERIFIED** | docs/licensing/THREAT_MODEL.md states realistic limits                                                                                                     |

## 4. Findings raised by this skill

No skill-level contradiction was found. The skill's rules are implementable and, where checkable, already implemented in the codebase. Domain-level defects discovered while auditing this skill's subject matter are reported in the corresponding `03_SKILL_AUDITS/` file and are cross-referenced there.

## 5. What is genuinely solid

- The private key is NOT in version control â€” confirmed by parsing .git/index directly, not merely by reading .gitignore.
- keygen.mjs refuses to overwrite an existing key without --force, and writes the public half to resources/license/ so the POS can verify.
- sign-integrity.mjs signs an integrity manifest of 254 files (observed: 'OK integrity-manifest signÃ© (254 fichiers, v1.0.4)') â€” the build is tamper-evident.
- Enforcement is in the main process with page/feature gates, so hiding a menu item is never the control.

## 6. Not verified / limits of this audit

- No forgery attempt was executed in this audit pass; the algorithm inspection is static. (A forgery attempt in an isolated temp dir is described in 10_LICENSE.md as the recommended verification step.)
- The exact production-vs-development status of the shipped public key is not recorded anywhere in the repository â€” see LIC-02.

## 7. Metrics

- Checklist items evaluated: **12** â€” VERIFIED: 10, PARTIAL: 2
- Skill-level findings owned by this skill: **0**
- Domain findings owned by this skill: see `03_SKILL_AUDITS/`

---

_Part of the `2026-11-11-full-forensic-audit` skill-by-skill forensic audit. Companion: `SKILLS_SYSTEM_AUDIT.md` (system-level analysis) and `../04_CROSS_SKILL_AUDIT.md` (inter-skill conflicts)._
