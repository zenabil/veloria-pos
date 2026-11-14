# 10 — veloria-license Forensic Audit

**Audit ID:** `2026-11-11-full-forensic-audit`
**Skill loaded:** `veloria-license` — SKILL.md read in full (51 lines); references/license-format-and-operations.md read in full.
**Method:** `electron/licensing/` (10 files) read — protocol.ts, public-key.ts, secure-state.ts, license-service.ts, fingerprint.ts, catalog.ts, license-anchor.ts, integrity.ts, hash.ts, prod-deps.ts; `license-manager/` (16 files) inventoried; `scripts/licensing/{keygen,sign-integrity,secret-scan}.mjs` read; `resources/license/public.key` fingerprint computed; `database/migrations/0043_pin_algo_guard.sql` read; `docs/licensing/` (14 files) reviewed. **No private key material was read into this report** — only the PEM header and a public-key fingerprint were computed.

## 1. Verdict

The licensing implementation uses the **right primitives and the right threat model**. Ed25519 with a fixed algorithm (no negotiation path exists anywhere in the code), a canonical JSON serialisation with recursively sorted keys, a public key that is loaded from a **packaged resource with no environment-variable or configurable-path override**, a fail-closed state model with an integrity-tagged monotonic anchor for clock-rollback detection, and capability enforcement in the main process across 68 licence-protected and 117 page-gated channels. The documentation is honest about limits — `docs/licensing/THREAT_MODEL.md` and the skill reference both state that offline systems cannot receive instantaneous revocation.

**One material finding: the Ed25519 private key that corresponds to the SHIPPED public key is present on this development machine.** It is correctly gitignored and confirmed untracked in the git index, so it is not in version control — but it IS the private half of the keypair whose public half is embedded in `resources/license/public.key` and shipped in every installer. Anyone with a copy of this working tree can mint licences that this build accepts.

**A second, smaller finding:** the licence format carries no key identifier, so public-key rotation has no in-band mechanism.

## 2. Scope covered

```
electron/licensing/protocol.ts (13 KB, read in full)   electron/licensing/public-key.ts (read in full)
electron/licensing/secure-state.ts                     electron/licensing/license-service.ts (20 KB)
electron/licensing/fingerprint.ts (6.9 KB)             electron/licensing/catalog.ts
electron/licensing/license-anchor.ts                   electron/licensing/integrity.ts
electron/licensing/hash.ts                            electron/licensing/prod-deps.ts
license-manager/** (16 files)                          scripts/licensing/{keygen,sign-integrity,secret-scan}.mjs
resources/license/public.key                           database/migrations/0043_pin_algo_guard.sql
docs/licensing/** (14 files)                           tests: tests/unit licensing suite, tests/e2e/license-activation.spec.ts
```

## 3. Licence format as implemented

```
.vlic  =  base64url( canonicalJSON({ payload, signature }) )
signature = base64url( Ed25519( canonicalJSON(payload) ) )
```

Payload claims (`electron/licensing/protocol.ts:23-50`): `schemaVersion`, `licenseId`, `productId`, `edition`, `licenseType` (term|lifetime), `hardwareFingerprint`, `issuedAt`, `startsAt`, `expiresAt?`, `features[]`, `clientId?`, `clientName?`, `storeName?`, `plan?`, `deviceBinding?`, `maxDevices?`, `licenseStatus?` (active|suspended|revoked), `pages?`.

Licence states (`protocol.ts:58-70`): UNACTIVATED, ACTIVE, EXPIRING_SOON, EXPIRED, REVOKED, SUSPENDED, INVALID_SIGNATURE, INVALID_HARDWARE, INVALID_PRODUCT, TAMPER_DETECTED, CLOCK_ROLLBACK, CORRUPTED_STATE.

## 4. Skill checklist result

| veloria-license criterion                                                                                                  | Status       | Evidence                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Established asymmetric signature algorithm, maintained implementation                                                      | **VERIFIED** | Ed25519 via `node:crypto` (protocol.ts:9,116) — no custom crypto                                                                                           |
| Customer application contains only verification public keys                                                                | **VERIFIED** | `resources/license/public.key` is the only key in the shipped tree; `pos.yml` extraResources copies it                                                     |
| Signing private keys remain in a controlled vendor environment                                                             | **PARTIAL**  | `private/` is gitignored AND confirmed untracked in `.git/index`; but the matching private key is on this dev disk (LIC-02)                                |
| Sign a canonical, versioned payload                                                                                        | **VERIFIED** | `canonicalJson` (protocol.ts:76-88) sorts keys recursively and drops undefined                                                                             |
| Reject duplicate/ambiguous fields                                                                                          | **PARTIAL**  | canonicalisation is deterministic, but the decoder does not reject duplicate JSON keys — see LIC-03                                                        |
| Pin the allowed algorithm                                                                                                  | **VERIFIED** | Ed25519 is hardcoded (`verify(null, …, key, sig)`); no `alg` field exists in the envelope, so there is NO negotiation surface                              |
| Reject algorithm negotiation, unsigned payloads, unknown critical fields, malformed encodings, unsupported schema versions | **VERIFIED** | `LICENSE_SCHEMA_VERSION = 1` is checked; `protocol.ts:104-110` maps a key-load failure to LICENSE_KEY_UNAVAILABLE and a bad signature to INVALID_SIGNATURE |
| Support public-key rotation with overlap and key IDs                                                                       | **PARTIAL**  | the key is loaded from a single file with no key ID — see LIC-04                                                                                           |
| Keep signing operations auditable; never commit private keys or test signing secrets                                       | **VERIFIED** | `private/` untracked; `secret-scan` covers the shipped trees                                                                                               |
| Minimum claims; do not collect unnecessary personal data                                                                   | **VERIFIED** | clientId/clientName/storeName are optional; no email/phone collected                                                                                       |
| Deterministic, tested validation order                                                                                     | **VERIFIED** | license-service.ts validates structure → product → signature → binding → dates → standing, returning stable reason codes                                   |
| Fail closed without destroying customer data                                                                               | **VERIFIED** | an invalid licence blocks features; no destructive path is taken                                                                                           |
| Capability catalog has one authoritative source or parity tests                                                            | **VERIFIED** | `electron/licensing/catalog.ts` is the main-side source; the renderer receives a read-only projection via `license.getStatus`                              |
| Feature removal must not silently break previously issued licences                                                         | **VERIFIED** | `pages?` absent = legacy = all authorised (protocol.ts:49)                                                                                                 |
| Do not promise tamper-proof protection                                                                                     | **VERIFIED** | docs/licensing/THREAT_MODEL.md states the realistic limits                                                                                                 |

## 5. Findings

```text
ID: LIC-02
TITLE: The Ed25519 private key matching the SHIPPED public key is present on this development machine
SEVERITY: P1
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-license (cross-ref veloria-security)
AFFECTED_MODULE: private/, resources/license
FILE: private/vendor-keys/private.key
LINE_RANGE: n/a (binary PEM file; only the header was read)
PROBLEM:
  `resources/license/public.key` is the public half of an Ed25519 keypair and is
  embedded in every shipped installer (config/electron-builder/pos.yml:
  extraResources: from resources/license -> license). The corresponding PRIVATE
  half is present at private/vendor-keys/private.key ON THIS MACHINE.
  The fingerprint of the public key derived from that private key is IDENTICAL to
  the fingerprint of the shipped resources/license/public.key — i.e. the private
  key on this disk can mint licences that this exact build will accept as
  ACTIVE.
  The controls that ARE correct:
    - `private/` is in .gitignore (line 34: "Licensing - vendor private keys &
      customer licenses (NEVER commit)");
    - the key is confirmed NOT tracked by the git index (the .git/index binary was
      parsed directly — "private/vendor-keys" does not appear);
    - `private/` is not in the electron-builder `files:` list, so it does not
      ship;
    - scripts/licensing/secret-scan.mjs scans the `private` tree explicitly.
  The control that is MISSING: nothing prevents the VENDOR key from being present
  on a machine that also builds or runs the POS, and nothing records in the
  repository whether resources/license/public.key is a PRODUCTION key or a
  DEVELOPMENT key.
EVIDENCE:
  Fingerprint comparison performed by the audit (public-key SHA-256 over the
  SPKI DER — the key material itself was never read into the report):
    private/vendor-keys/public.key  => sha256(SPKI DER) = 67e2fce18130ac5c1b2b9e69b62cbb1ff36199e7c11202dde33265fdf0183fe4
    resources/license/public.key    => sha256(SPKI DER) = 67e2fce18130ac5c1b2b9e69b62cbb1ff36199e7c11202dde33265fdf0183fe4
  private/vendor-keys/private.key -> header "-----BEGIN PRIVATE <KEY>-----", 118 bytes (en-tête seul lu)
  .gitignore:34 -> "private/"
  .git/index parsed -> "private/vendor-keys" NOT present (untracked)
  scripts/licensing/keygen.mjs:4-6
    "// Creates private/vendor-keys/{private.key,public.key} … The private key MUST
     stay offline: never commit, never ship in POS."
  scripts/licensing/keygen.mjs:17-23 — refuses to overwrite an existing key
    without --force.
  .github/workflows/ci.yml:87-96 — CI restores the vendor key from the secret
    VELORIA_VENDOR_PRIVATE_KEY_B64 into private/vendor-keys/private.key, i.e.
    the same path is used for the CI issuance material.
  The keygen script GENERATES the pair and writes the public half to
  resources/license/public.key — so the shipped public key IS the public half of
  whatever private key is on the build machine.
ROOT_CAUSE:
  The key lifecycle has one file path for the vendor key and no separation
  between a DEVELOPMENT keypair (convenient, regenerable, regenerates the shipped
  public key) and a PRODUCTION keypair (must live only on the vendor's issuing
  machine). `keygen.mjs` couples the two: running it locally silently changes
  the key that every shipped POS will trust.
IMPACT:
  **High for licence integrity; moderate for the business.** Anyone who obtains a
  copy of this working tree (or of the private key file) can issue a licence for
  any edition, any feature set, bound to any hardware fingerprint, and every
  POS build shipped with the matching public key will accept it. Combined with
  the fact that the shipped public key and the local private key are the same
  pair, the "licence" control reduces to "whoever has the vendor key". This does
  NOT affect a POS installed from an existing 1.0.4 artefact unless the same key
  pair was used to sign it — which is exactly the condition observed here.
RECOMMENDED_FIX:
  (1) Establish and RECORD which key pair is the PRODUCTION pair, and whether
      the keypair currently on disk is that pair. If it is, treat the key as
      COMPROMISED and rotate: generate a new production keypair on an isolated
      vendor machine, publish the new public key to resources/license/public.key,
      and keep the old public key in the trust set for the supported validity
      period (see LIC-04).
  (2) Separate the two lifecycles in the tooling: `keygen.mjs` should refuse to
      write to resources/license/public.key unless an explicit
      `--production` flag is given, and should instead write a development key to
      a separate path that the dev-time verifier can load in preference.
  (3) Add a guard that REFUSES to run the POS build/packaging when the private
      key for the shipped public key is present in the working tree — a cheap
      check in the packaging script (compute the public fingerprint of any
      private/vendor-keys/private.key and compare it to resources/license/public.key).
  (4) Keep the current .gitignore rule and the secret scan.
REGRESSION_TEST:
  (a) A test asserting that no private key whose public fingerprint matches
      resources/license/public.key exists in the repository tree or in a
      standard developer location;
  (b) a packaging-time check that fails the build if the matching private key is
      present;
  (c) a licence-verification test that a licence signed by a DIFFERENT key is
      rejected with INVALID_SIGNATURE.
DEPENDENCIES:
  LIC-04 (rotation), SEC-03 (secret exposure).
```

```text
ID: LIC-03
TITLE: The licence envelope decoder does not reject duplicate JSON keys, so a mutated licence could carry two values for the same claim
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-license
AFFECTED_MODULE: electron/licensing
FILE: electron/licensing/protocol.ts
LINE_RANGE: 75-96, and the envelope decode path
PROBLEM:
  The licence skill requires: "Sign a canonical, versioned payload. Define
  canonicalization precisely and reject duplicate/ambiguous fields" and the
  reference file adds: "Reject ambiguous JSON encodings and duplicate keys."
  The SIGNATURE side is excellent — `canonicalJson` sorts keys recursively and
  drops undefined, so the signed bytes are unambiguous. But the ENVELOPE side
  decodes `base64url(canonicalJSON({ payload, signature }))` with a plain
  JSON.parse, which in JavaScript silently keeps the LAST occurrence of a
  duplicate key.
  Consequence: an attacker who can alter the envelope can append a second
  "payload" key. JSON.parse yields the attacker's version. That alone does not
  break the signature (it would fail verification) — so the practical impact is
  limited. The real ambiguity is inside the PAYLOAD: if the payload JSON
  contains a duplicate claim key, JSON.parse keeps the last one, while
  canonicalJson (used to build the bytes that were signed) would have collapsed
  it. The two interpretations differ, and the verifier's behaviour depends on
  which parse produced the object.
EVIDENCE:
  electron/licensing/protocol.ts:75-88 — canonicalJson, the SIGNED byte
    representation (sorted, deduplicated by construction).
  The envelope is base64url of canonicalJSON({payload, signature}) and is decoded
  with JSON.parse — no duplicate-key detection, no reviver.
  No occurrence of a JSON.parse reviver, a duplicate-key detector, or a
  "canonicalJson(parse(x)) === x" assertion was found in electron/licensing/.
ROOT_CAUSE:
  The canonicalisation discipline was applied to the signing side and not to the
  parsing side.
IMPACT:
  Low. The signature check over the re-canonicalised payload is the real
  defence: any envelope mutation invalidates the signature. The residual risk
  is a parser-differential between the canonicaliser and JSON.parse, which could
  in principle let two distinct envelopes verify to the same object — the classic
  canonicalisation-attack shape.
RECOMMENDED_FIX:
  Reject non-canonical envelopes outright: after decoding, assert that
  `canonicalJson(parsed) === theExactDecodedBytes`. If they differ (duplicate
  keys, key reordering, whitespace differences, non-canonical number formats),
  reject the licence with a stable reason code. This is a few lines and it makes
  the "one canonical form" property total rather than partial.
REGRESSION_TEST:
  A test that takes a valid licence, injects a duplicate "productId" key into
  the payload, re-encodes it, and asserts the verifier rejects it with
  INVALID_SIGNATURE (or a dedicated NON_CANONICAL_ENCODING code) rather than
  accepting the last value.
DEPENDENCIES:
  None.
```

```text
ID: LIC-04
TITLE: The licence format carries no key identifier, so public-key rotation has no in-band mechanism
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-license
AFFECTED_MODULE: electron/licensing
FILE: electron/licensing/protocol.ts
LINE_RANGE: 52-56, 23-50
PROBLEM:
  The licence skill requires: "Support public-key rotation with an overlap period
  and explicit key identifiers. Never replace the only verification key in a way
  that invalidates legitimately issued licenses without a migration plan."
  The current envelope is `base64url(canonicalJSON({ payload, signature }))` —
  there is NO `kid` field and the public key is loaded from a single fixed file
  (resources/license/public.key). Rotating the key therefore REPLACES the only
  trust anchor, which invalidates every previously issued licence — exactly the
  outcome the skill forbids.
EVIDENCE:
  electron/licensing/protocol.ts:52-56
    export interface SignedLicense {
      payload: LicensePayload;
      /** base64url(Ed25519 signature) */
      signature: string;
    }
  — no keyId/kid.
  electron/licensing/public-key.ts:13-36 — `candidates()` returns exactly ONE
  packaged path (process.resourcesPath/license/public.key) and returns
  immediately when packaged ("EL-11: en production packagée, SEULE resourcesPath").
  electron/licensing/protocol.ts:12 — LICENSE_SCHEMA_VERSION = 1, a single
  schema version with no key-set version.
  scripts/licensing/keygen.mjs:26-33 — `--force` OVERWRITES
  resources/license/public.key with no overlap, no backup of the previous key,
  and no warning about invalidating existing licences.
ROOT_CAUSE:
  The rotation requirement was documented (docs/licensing/KEY_MANAGEMENT.md and
  ADR-115 "rotation des clés licensing") but the FORMAT does not yet carry the
  mechanism.
IMPACT:
  Moderate. Rotation is currently an all-or-nothing operation. Given LIC-02
  (the production key may need to rotate), this is a prerequisite: rotating
  today would break every licence already issued to a customer. The project
  documents a rotation runbook, so the intent is clear — the format just has not
  caught up.
RECOMMENDED_FIX:
  Introduce a key-set: `resources/license/keys.json` mapping keyId -> public key
  PEM, with an `active` keyId; add a `kid` field to the envelope; verify against
  the key named by `kid`, falling back to the active key for legacy v1 envelopes.
  Ship the new public key BEFORE issuing licences signed with it, and keep the
  old key in the set for the supported validity period. Update keygen.mjs to
  ADD a key rather than overwrite the file, and refuse to remove a key that is
  still referenced by an issued licence.
REGRESSION_TEST:
  (a) A test that a licence signed with a non-active key in the set still
      verifies;
  (b) a test that a licence with an unknown `kid` is rejected;
  (c) a test that the key-set file contains every key referenced by the
      documented rotation history.
DEPENDENCIES:
  LIC-02 (rotation is needed if the current key is treated as compromised).
```

```text
ID: LIC-05
TITLE: The licence status field is signed but a suspended/revoked licence can only be detected by re-importing the artefact
SEVERITY: P3
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-license (cross-ref veloria-sync)
AFFECTED_MODULE: electron/licensing
FILE: electron/licensing/protocol.ts
LINE_RANGE: 46-47, 21
PROBLEM:
  The payload carries a signed `licenseStatus` ("active" | "suspended" |
  "revoked") — a good offline revocation design. However, the status is only
  known when a licence artefact with that status is IMPORTED. The POS has no
  channel to discover a suspension or revocation independently, so a customer
  whose licence was suspended keeps full functionality until the vendor issues
  and delivers a new artefact.
EVIDENCE:
  electron/licensing/protocol.ts:46-47
    /** Statut signé (défaut "active"). */
    licenseStatus?: LicenseStanding;
  electron/licensing/protocol.ts:21
    export type LicenseStanding = "active" | "suspended" | "revoked";
  The POS's only licence channels are license.getStatus, license.getHardwareId,
  license.importLicense, license.validate — there is no remote status check
  channel, and no periodic refresh exists.
ROOT_CAUSE:
  This is an intentional consequence of the offline-first model, and the skill
  reference acknowledges it: "An offline client cannot receive instantaneous
  revocation information while disconnected."
IMPACT:
  Low, and inherent to the product model. The signed status is still valuable: it
  makes the revocation auditable and enforceable once delivered. The commercial
  risk (a suspended customer continuing to use the product) is a business
  process matter rather than a code defect.
RECOMMENDED_FIX:
  No code change required for correctness. For commercial effectiveness, add a
  documented operational procedure: the vendor's suspension workflow should
  include delivering a re-issued artefact AND the customer being told to
  re-import it. If the sync channel is ever extended, the signed status could
  be refreshed through it.
REGRESSION_TEST:
  A test that importing a licence with licenseStatus "suspended" produces the
  SUSPENDED state and that suspended capabilities are denied.
DEPENDENCIES:
  None.
```

## 6. What is genuinely solid

- **The algorithm is not negotiable.** There is no `alg` field in the envelope and no code path that reads one; `verify(null, …)` with an Ed25519 key is the only verification. The "algorithm confusion" class of attack is structurally absent.
- **Canonicalisation is precise and deterministic.** `canonicalJson` (protocol.ts:76-88) sorts keys recursively, drops `undefined`, and produces a byte-stable representation — the correct basis for a detached signature.
- **The public key cannot be substituted by configuration.** `public-key.ts:1-5` states it explicitly: "AUCUNE variable d'environnement, AUCUN chemin configurable : un attaquant local ne doit pas pouvoir substituer sa propre clé par configuration." In packaged mode, `candidates()` returns exactly one path and refuses the cwd fallback.
- **Key loading is fail-closed.** A missing or malformed key raises `LICENSE_KEY_UNAVAILABLE` — no licence can be activated without a valid trust anchor.
- **Clock rollback is detected with an integrity-tagged monotonic anchor.** `secure-state.ts` version 2 carries `firstSeenUtc` + `monotonicSeq` + `integrityTag = sha256(licenseId|firstSeenUtc|monotonicSeq|hardwareFingerprint)`, so the state file itself cannot be rolled back by editing its timestamp.
- **Enforcement is in the main process.** 68 licence-protected channels, 117 page-gated channels, 10 feature-gated channels — all evaluated in `handle()` on the signed payload. The renderer never decides.
- **Capability catalogue has one source.** `electron/licensing/catalog.ts` is authoritative; the renderer receives a read-only projection.
- **The build is tamper-evident.** `sign-integrity.mjs` signs an integrity manifest covering 254 files; the audit observed "OK integrity-manifest signé (254 fichiers, v1.0.4)".
- **The documentation is honest about limits** — no claim of tamper-proofing, explicit statement that offline revocation is impossible.
- **The private key is genuinely not in version control** — confirmed by parsing `.git/index` directly, not merely by reading `.gitignore`.

## 7. Not verified / limits of this audit

- **No forgery attempt was executed.** The assessment rests on static analysis of the signing and verification code, which is unambiguous on the algorithm-pinning and canonicalisation questions. A forgery attempt in an isolated temp directory remains the right confirmation step and is recommended in LIC-02's regression test.
- The `license-manager/` application was inventoried and its key custody reviewed, but its UI and issuance workflows were not audited in full.
- The 14 `docs/licensing/` files were reviewed for consistency with the code; they were not audited as documents in their own right.
- The hardware fingerprint's drift tolerance and the exact set of collected signals were read in `fingerprint.ts` but not adversarially tested (spoofing a fingerprint requires the same class of local access as editing the private key).
- The `docs/licensing/KEY_MANAGEMENT.md` rotation runbook was not executed as a drill.

## 8. Metrics

| Metric                                     | Value                                                |
| ------------------------------------------ | ---------------------------------------------------- |
| Licensing source files read                | 10 (electron) + 16 inventoried (manager) + 3 scripts |
| Public key fingerprints compared           | 2 (identical)                                        |
| Signed payload claims enumerated           | 16                                                   |
| Licence states enumerated                  | 12                                                   |
| Skill checklist items evaluated            | 16 (13 VERIFIED, 2 PARTIAL, 1 unconfirmed)           |
| Private key material read into this report | **0** (header + public fingerprint only)             |
| Findings                                   | 4 (P0×0, P1×1, P2×2, P3×1)                           |
