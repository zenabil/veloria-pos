# 11 — veloria-sync Forensic Audit

**Audit ID:** `2026-11-11-full-forensic-audit`
**Skill loaded:** `veloria-sync` — SKILL.md read in full; references/google-sheets-bridge.md read in full.
**Method:** `electron/sync/` (5 files — sync.service.ts 63 KB, owner-snapshot.ts 56 KB, sync.protocol.ts 20 KB, client-catalog.ts, sync-secrets.ts) inspected; `electron/ipc/handlers/client-access.repo.ts` (31 KB), `client-order.repo.ts`, `client-catalog.repo.ts` inspected; `cloud/supabase/` (11 files incl. `schema.sql`, `rls.sql` and 2 Edge Functions) read; migrations 0032, 0033, 0038, 0047, 0062 read; ADR-053 and the governance contract compared.

## 1. Verdict

**Two separate things must be reported here, and they must not be conflated.**

**(a) The implementation is well built.** The data-isolation design is the strongest in the project and exceeds what the skill requires. RLS is enabled with **no policies at all** and `REVOKE ALL` on `anon`/`authenticated`, so the mobile app's bundled anon key grants literally zero access; the only reader is the `client-sync` Edge Function running with `service_role`, which verifies the phone + PIN (PBKDF2-HMAC-SHA256, 100 000 iterations) against a stored hash, honours revocation and lockout, and fails closed on an ambiguous phone hash. The POS keeps a durable outbox, claims the operationId **before** the network call, bounds every batch, and quarantines corrupted rows instead of blocking the queue. The Supabase `service_role` key never leaves the main process.

**(b) The skill describes an architecture the project does not implement.** The skill (and the governance contract) name **Google Sheets** as the approved V1 customer bridge. The codebase implements a **Supabase PostgREST mirror**. There is no Google Sheets code anywhere. This is a live contradiction between the operating instructions and the system, and it is the single most consequential finding of this audit for the sync domain.

**On the ADR question the brief posed:** ADR-053 ("Client mirror Supabase") is dated 2026-09-29, status **accepté**, and explicitly rejects Google Sheets on technical grounds ("pas d'isolation par client, pas de transactions, quotas"). The implementation follows ADR-053. The **governance contract and the v2.0.0 skill bundle are the stale artefacts** — they still say Sheets. So this is not "Supabase is legacy"; it is the reverse: the governing text lags an accepted decision.

## 2. Architecture as implemented

```
POS (SQLite = master)                durable outbox              Supabase (mirror)
─────────────────────                ─────────────               ────────────────
sale / payment / access  ──▶  sync_outbox (pending)  ──▶  PostgREST tables
                                        │                     + Edge Functions
                                        │                       client-sync
                                        │                       client-order
                                        ▼                       (service_role)
                                 status: pending|sent|failed   RLS: deny-by-default
```

## 3. Skill checklist result

| veloria-sync criterion                                                                                                        | Status       | Evidence                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| POS remains Offline-First                                                                                                     | **VERIFIED** | no sale/stock path awaits a network call; the mirror is a projection via an outbox                                            |
| SQLite remains authoritative for core POS transactions                                                                        | **VERIFIED** | no inbound write path mutates canonical financial records                                                                     |
| Export only fields necessary for the customer experience                                                                      | **VERIFIED** | `sync.protocol.ts` builds a minimal per-customer projection; no cost/margin/supplier/staff-notes exported                     |
| Never publish a whole customer table or shared sheet to every customer                                                        | **VERIFIED** | per-customer projections; RLS denies all direct access                                                                        |
| Avoid including internal cost, margin, supplier, employee notes, other customers' data                                        | **VERIFIED** | projection fields are invoice/debt/payment scoped                                                                             |
| Do not place service credentials, API keys or refresh tokens in the mobile app, renderer, QR code or customer-visible payload | **VERIFIED** | `sync-secrets.ts` (root cause M3) confines the service_role key to main; the APK uses anon + RLS, which is denied everything  |
| Use opaque stable identifiers rather than sequential database IDs                                                             | **VERIFIED** | `phone_hash` = sha256(phone); `customer_id` is the internal id but access is gated by the phone+PIN proof                     |
| Durable local outbox with stable operation IDs                                                                                | **VERIFIED** | `sync_outbox` (0032) with `operation_id`, `customer_id`, `kind`, `payload_json`, `created_at`, `status`                       |
| Reserve/claim a row before network transmission                                                                               | **VERIFIED** | `tryClaimBeforeSend` (sync.service.ts:499-507), documented as "S-01/S-02"                                                     |
| Idempotent bridge writes with unique operation references                                                                     | **VERIFIED** | `idempotency_keys` UNIQUE on operation_id; replay returns the prior result (sync.service.ts:293-310, 386-397)                 |
| Bounded retries with exponential backoff and jitter                                                                           | **PARTIAL**  | see SYNC-02                                                                                                                   |
| Track row-level failures separately from global configuration failures                                                        | **VERIFIED** | `status` per row (`pending`/`sent`/`failed`) + a document-level `lastError`/`lastAttemptAt` (sync.service.ts:101-172)         |
| Keep a monotonic update/version marker so stale updates cannot overwrite newer                                                | **VERIFIED** | outbox rows are ordered by id/created_at and the payload carries a version marker                                             |
| Manual retry/diagnostic action without requiring a POS restart                                                                | **VERIFIED** | `sync.pushNow` channel + `sync.getConfig` exposing lastError                                                                  |
| Log operation IDs and outcomes, not secrets or unnecessary personal data                                                      | **VERIFIED** | log entries carry channel/operation_id/duration (handle.ts:106-111)                                                           |
| Never block POS checkout, stock operations or core data access on a cloud call                                                | **VERIFIED** | verified: the sale path calls `enqueueSaleRefresh` AFTER the sale transaction commits (registry.sales.ts:106)                 |
| **Matches the approved V1 architecture (Google Sheets)**                                                                      | **CONFLICT** | **NOT IMPLEMENTED — Supabase instead.** See SYNC-01.                                                                          |
| Test customer A cannot read customer B's data                                                                                 | **PARTIAL**  | the design is structural (RLS deny-by-default); an executed adversarial test was not located — see SYNC-03                    |
| Test missing/expired/revoked access                                                                                           | **VERIFIED** | Edge Function handles REVOKED_ERROR / LOCKED_ERROR (client-sync/index.ts:168,174)                                             |
| Test Sheets outage, rate limit, schema change, malformed row, partial batch, retry, duplicate delivery                        | **PARTIAL**  | malformed-row quarantine is implemented (sync.service.ts:701-712); the rest are reasoned, not demonstrated                    |
| Test POS checkout while fully offline and with a large outbox backlog                                                         | **PARTIAL**  | not demonstrated by an executed test in this pass                                                                             |
| Verify deletion/revocation across cached customer-app data                                                                    | **PARTIAL**  | revocation history is tracked (`customer_access_history`, migration 0062); cache invalidation on the app side was not audited |

## 4. Findings

```text
ID: SYNC-01
TITLE: The veloria-sync skill and the governance contract specify a Google Sheets bridge that the project does not implement (it ships a Supabase mirror)
SEVERITY: P1
CONFIDENCE: CONFLICT
AFFECTED_SKILL: veloria-sync (cross-ref veloria-orchestrator)
AFFECTED_MODULE: governance, .opencode/skills, electron/sync, cloud/
FILE: .opencode/skills/veloria-sync/SKILL.md
LINE_RANGE: 16-24, 43-49; also references/google-sheets-bridge.md:1-70
PROBLEM:
  The skill presents as an approved product decision: "Google Sheets is the
  approved intermediary for the first customer-app bridge, not a replacement for
  local SQLite and not the canonical database for POS operations." The reference
  file's entire "Security gate — release blocker" is written around spreadsheet
  credentials, and its "Open decisions" list is about sheet layout, row key and
  quota handling.
  The project implements NONE of that. It ships:
    - cloud/supabase/schema.sql, rls.sql, activity.sql, catalog.sql, orders.sql,
      owner.sql
    - cloud/supabase/functions/client-sync/index.ts (14 139 B)
    - cloud/supabase/functions/client-order/index.ts (10 049 B)
    - electron/sync/sync.protocol.ts validating the URL as
      /^https:\/\/[a-z0-9-]+\.supabase\.co$/i
  A mechanical search for sheets.googleapis / spreadsheet / googleapis across
  electron/, src/ and cloud/ returned ZERO matches.
EVIDENCE:
  .opencode/skills/veloria-sync/SKILL.md:19
    "- Google Sheets is the approved intermediary for the first customer-app
     bridge, not a replacement for local SQLite and not the canonical database
     for POS operations."
  .opencode/skills/veloria-sync/references/google-sheets-bridge.md:1
    "# Google Sheets V1 bridge — constraints and implementation outline"
  .opencode/skills/veloria-sync/references/google-sheets-bridge.md:47-53
    "## Security gate — release blocker
     Never ship direct mobile access to a shared spreadsheet using embedded
     credentials. The bridge must authenticate the customer and authorize every
     requested record against that customer's identity."
  governance/VELORIA_PROJECT_CONTRACT.md:32
    "- Google Sheets was approved as the intermediary for the first customer-app
     bridge. It is a bridge/projection, not the canonical POS database."
  governance/PROJECT_FACTS_TO_VERIFY.md:36
    "- Do not assume Supabase is the selected V1 customer bridge; Google Sheets is
     the approved V1 intermediary direction."
  — the CODE:
  electron/sync/sync.protocol.ts:204
    const isCloud = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl);
  cloud/supabase/rls.sql, cloud/supabase/functions/client-sync/index.ts,
  cloud/supabase/functions/client-order/index.ts — the actual implementation.
  — the DECISION:
  docs/ADR-053-client-mirror-supabase.md:4-5
    "Statut : accepté (V1, 40 clients, lecture seule, 0 $)"
  docs/ADR-053-client-mirror-supabase.md:14
    "Contrainte AGENTS.md n°1 : SQLite (`Veloria POS DB.sqlite`) seule source
     métier. Google Sheets REJETÉ (pas d'isolation par client, pas de
     transactions, quotas)."
ROOT_CAUSE:
  The v2.0.0 skills bundle was generated from `governance/`, and the governance
  contract was never updated after ADR-053 was accepted on 2026-09-29. The
  orchestrator's authority order puts an accepted ADR (level 2) on the same
  footing as the contract (level 2); when they conflict, the orchestrator's own
  rule is to surface the conflict rather than pick silently — which is what this
  audit does.
IMPACT:
  An agent loading veloria-sync will design Google Sheets bridge work against a
  project that ships a Supabase mirror, and will reason about the wrong threat
  model (spreadsheet service-account credentials and shared-sheet privileges
  instead of a PostgREST service_role key and RLS policies). The concrete
  downside is wasted engineering and a false sense of the security posture.
  There is also a real security consequence of the divergence: the contract
  says "Never expose Google service-account credentials, shared spreadsheet
  privileges, or unrestricted sheet access in the customer app or renderer"
  (contract §4) — a rule that is trivially satisfied by the current Supabase
  design but that a future engineer following the SKILL might accidentally
  violate by building a sheet-based path.
RECOMMENDED_FIX:
  Update, in this order:
  (1) governance/VELORIA_PROJECT_CONTRACT.md §4 — replace the Google Sheets
      sentence with the accepted ADR-053 architecture (SQLite master, Supabase
      PostgREST mirror, Edge Functions as the trusted access layer, RLS
      deny-by-default), keeping the invariants that still hold (the mirror is not
      the canonical database; no service credential in the renderer or the APK).
  (2) governance/PROJECT_FACTS_TO_VERIFY.md:36 — correct the instruction to match
      ADR-053.
  (3) .opencode/skills/veloria-sync/SKILL.md and
      references/google-sheets-bridge.md — rewrite the approved-direction
      section and the security gate for the actual architecture; keep the
      offline-first, data-minimisation, outbox, idempotency and failure-taxonomy
      rules VERBATIM, because they are correct and implemented.
  (4) Optionally rename the reference file to google-sheets-bridge.md →
      customer-data-bridge.md so the filename matches the content.
  Do NOT change the implementation — the implementation follows the accepted ADR.
REGRESSION_TEST:
  Add a machine gate (in scripts/quality/) that extracts the technology names
  each SKILL.md presents as an approved architecture and asserts each is present
  in the codebase or is explicitly marked "direction, not implemented". This
  prevents the next bundle from repeating the error.
DEPENDENCIES:
  SYNC-02, XSKILL-01, and the governance reconciliation in 04_CROSS_SKILL_AUDIT.md.
```

```text
ID: SYNC-02
TITLE: The outbox failure taxonomy is implemented, but there is no exponential backoff with jitter — retries are driven by a manual push and a timer, not by a per-row backoff schedule
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-sync
AFFECTED_MODULE: electron/sync, database
FILE: electron/sync/sync.service.ts
LINE_RANGE: 101-172, 465-466, 614, 690, 856
PROBLEM:
  The skill requires: "Apply bounded retries with exponential backoff and jitter
  for transient failures" and "Classify failures as transient (network/timeouts/
  rate limits/server errors), authentication/configuration, row-level validation,
  schema/table mismatch, and permanent business rejection. Retry only transient
  failures."
  The implementation has:
    - a per-row status taxonomy (pending | sent | failed) — good;
    - a document-level `lastError` / `lastAttemptAt` — good for diagnostics;
    - a request timeout (12 s, and MIRROR_TIMEOUT_MS) — good;
    - a manual `sync.pushNow` — good.
  What it does NOT have is a PER-ROW attempt counter, a next-attempt timestamp,
  or a backoff schedule. `sync_outbox` has no `attempts` column and no
  `next_attempt_at`. A row that fails transiently is therefore retried on the
  next push cycle with the SAME timing as a fresh row — there is no backoff, and
  no jitter.
EVIDENCE:
  database/migrations/0032_client_access_sync.sql:26-37 — the outbox schema:
    CREATE TABLE IF NOT EXISTS sync_outbox (
      id INTEGER PRIMARY KEY, operation_id TEXT NOT NULL UNIQUE,
      customer_id INTEGER, kind TEXT NOT NULL, payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed'))
    );
  — NO attempts column, NO next_attempt_at column, NO last_error column.
  electron/sync/sync.service.ts:101-129 — the document-level config tracks
    lastAttemptAt / lastOwnerAttemptAt / lastError / lastOwnerError — a single
    timestamp for the whole sync document, not per row.
  electron/sync/sync.service.ts:690
    `SELECT operation_id, customer_id, kind, payload_json, created_at
       FROM sync_outbox WHERE status = 'pending' ORDER BY id ASC LIMIT 200`
  — every pending row is retried on every push, with no attempt-based filter.
  electron/sync/sync.service.ts:240, 614 — a 12 s abort timeout (MIRROR_TIMEOUT_MS).
  The customer_access table DOES have `failed_attempts` and `locked_until`
  (migration 0032:16) — but that is the CUSTOMER LOGIN brute-force counter on
  the cloud side, not the POS outbox retry counter.
ROOT_CAUSE:
  The outbox schema was designed for at-most-once delivery with manual retry,
  not for autonomous retry with backoff.
IMPACT:
  Moderate. A persistent transient failure (the mirror is down, or rate-limited)
  causes every push cycle to re-attempt every pending row, with no backoff and
  no jitter. With a 200-row batch limit and a scheduled push, this produces
  sustained request pressure against a rate-limited endpoint and can convert a
  transient outage into a sustained one. There is also no per-row failure
  detail: a row marked 'failed' carries no reason, so the operator cannot
  distinguish a transient failure from a permanent business rejection — which is
  exactly the classification the skill demands.
  Mitigating factor: the push is partly operator-driven ("bouton Synchroniser"),
  so the request rate is naturally low.
RECOMMENDED_FIX:
  Forward-only migration 0064 adding to sync_outbox:
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_attempt_at TEXT,
    failure_kind TEXT   -- 'transient' | 'config' | 'row' | 'permanent'
  Then:
  (a) classify the failure by kind at the catch site (network/timeout/5xx ->
      transient; 401/403 -> configuration; 4xx body parse -> row; unknown ->
      permanent);
  (b) schedule the next attempt with exponential backoff + jitter (e.g. base 30 s,
      factor 2, cap 1 h, ±20 % jitter) and persist `next_attempt_at`;
  (c) filter the push query on `next_attempt_at IS NULL OR next_attempt_at <= now`;
  (d) quarantine a row after N attempts with its reason recorded.
REGRESSION_TEST:
  A test that simulates a 503 from the mirror, asserts the row's attempts
  increments and `next_attempt_at` is set to a future value, asserts a second
  push within the backoff window does NOT retry it, and asserts the row is
  quarantined after the configured maximum with `failure_kind = 'transient'`.
DEPENDENCIES:
  SYNC-01, GATE-03 (the failure taxonomy is a business contract).
```

```text
ID: SYNC-03
TITLE: The per-customer isolation guarantee is structural but is not proven by an executed adversarial test
SEVERITY: P2
CONFIDENCE: NEEDS_VERIFICATION
AFFECTED_SKILL: veloria-sync
AFFECTED_MODULE: cloud/supabase, tests
FILE: cloud/supabase/rls.sql
LINE_RANGE: 1-17
PROBLEM:
  The skill's security requirement is explicit: "Test customer A cannot read
  customer B's data, including guessed IDs and altered request parameters" and
  "If per-customer isolation cannot be guaranteed by the actual access layer, do
  not ship the feature."
  The DESIGN is strong and structural — RLS enabled with NO policies, and
  anon/authenticated REVOKED on all three customer tables. Under that posture,
  a direct PostgREST read with the APK's anon key returns nothing at all, which
  is stronger than a policy-based restriction. The Edge Function additionally
  verifies the phone+PIN and refuses on revocation/lockout/ambiguity.
  What the audit did NOT establish is that an EXECUTED test proves it. ADR-053
  lists "Test d'isolement obligatoire : client A ne lit jamais client B" as a
  requirement, and the CI workflow restores the vendor key and runs the E2E
  suite, but the audit did not locate an executed adversarial isolation test.
EVIDENCE:
  cloud/supabase/rls.sql:8-17
    ALTER TABLE client_access ENABLE ROW LEVEL SECURITY;
    ALTER TABLE client_payloads ENABLE ROW LEVEL SECURITY;
    -- Aucune politique créée volontairement : tout accès direct est rejeté.
    REVOKE ALL ON client_access FROM anon, authenticated;
    REVOKE ALL ON client_payloads FROM anon, authenticated;
    REVOKE ALL ON latest_client_payloads FROM anon, authenticated;
  cloud/supabase/functions/client-sync/index.ts:135-175 — phone hash lookup,
  active-row filtering, REVOKED_ERROR / LOCKED_ERROR handling, and the
  ambiguous-phone fail-closed branch (line 162:
  "client-sync: phone_hash ambigu (plusieurs lignes actives) -> echec ferme").
  docs/ADR-053-client-mirror-supabase.md:31
    "- Test d'isolement obligatoire : client A ne lit jamais client B."
  The audit did not locate a test that asserts customer A's request returns no
  trace of customer B's records.
ROOT_CAUSE:
  The isolation property is enforced by the deployed Supabase configuration
  (RLS + REVOKE), which a local Vitest run cannot exercise — it needs a live
  Supabase project. There is a live-cloud E2E spec
  (tests/e2e/real-cloud-loop.spec.ts), but it self-skips without credentials.
IMPACT:
  Moderate. The property is very likely to hold (deny-by-default RLS is about as
  strong as it gets), but it is a RELEASE-BLOCKER-class property that is asserted
  in prose rather than demonstrated. If someone later adds an RLS policy for
  convenience — e.g. a permissive SELECT policy on customer_payloads for
  `anon` — nothing in the test suite would notice, and the failure would be a
  cross-customer data leak in a live app.
RECOMMENDED_FIX:
  Add an executable isolation proof to the live-cloud E2E suite (which already
  self-skips without credentials — so it will run in a properly configured CI):
  (a) create customer A and customer B with invoices;
  (b) authenticate as A and request B's invoice by its real number, by a guessed
      id, and by an altered customer_id parameter;
  (c) assert every response contains no trace of B's data;
  (d) assert a direct PostgREST read with the anon key returns an empty set.
  Additionally, add a static gate that asserts `cloud/supabase/rls.sql` still
  contains the REVOKE statements and creates no policy — cheap, runs in the
  normal CI, and catches the most likely future regression.
REGRESSION_TEST:
  The isolation spec plus the static RLS gate.
DEPENDENCIES:
  SYNC-01, GATE-05 (the cloud spec self-skips without credentials).
```

```text
ID: SYNC-04
TITLE: The Supabase service_role key is stored DPAPI-encrypted, but its PRIVILEGE (full bypass of RLS) is what remains the dominant exposure
SEVERITY: P2
CONFIDENCE: VERIFIED — CORRECTED 2026-11-12 (the initial finding overstated the AT-REST exposure)
AFFECTED_SKILL: veloria-sync (cross-ref veloria-security)
AFFECTED_MODULE: electron/sync
FILE: electron/sync/sync-secrets.ts
LINE_RANGE: 1-99; electron/sync/sync.service.ts:56-57, 160-190
PROBLEM:
  CORRECTION OF THE INITIAL AUDIT FINDING. The audit first recorded that the
  `service_role` key "persists in a plain local document". THAT WAS WRONG, and
  the correction matters: the key is ALREADY ENCRYPTED AT REST with the OS
  keystore (`safeStorage` → DPAPI under Windows), through the very mechanism
  the licensing state uses.

  What is actually true:
    - `electron/sync/sync-secrets.ts` provides a `SecretBackend` whose
      production implementation is `safeStorageSecretBackend()` (DPAPI), with
      `encodeSecret` / `decodeSecretWith` and a transparent migration path for
      legacy clear-text values.
    - `electron/sync/sync.service.ts:189-190` encodes `serviceKey` and `anonKey`
      on EVERY write, and decodes them on read (line 173).
    - A value that is not decryptable (e.g. a DPAPI blob restored onto a
      DIFFERENT machine) raises "Secret de synchronisation illisible" — i.e.
      the failure mode is fail-closed, not a silent clear-text fallback.

  The RESIDUAL exposure (the real one):
    1. PRIVILEGE. `service_role` bypasses RLS entirely (cloud/supabase/rls.sql:12
       — "La fonction Edge contourne RLS via service_role (bypass intégré)").
       The credential is therefore a bearer token granting FULL read AND write
       on the mirror: every customer's invoices, and the ability to alter them.
       DPAPI protects it from a DISK COPY; it does not reduce what it can do
       once used.
    2. SCOPE. It is a full-privilege key where a scoped key (limited to the
       mirror tables, and to INSERT/SELECT) would do: the POS never writes
       anything else.
    3. Any process running as the SAME OS USER can ask DPAPI to decrypt it
       (that is the DPAPI contract), so on a shared counter PC a local
       process of the same user can obtain a total-privilege cloud credential.
    4. The legacy clear-text path still exists in the DECODER by design
       (migration of old values) — it is a decryption of already-stored
       clear-text, not a new write of clear-text.
EVIDENCE:
  electron/sync/sync-secrets.ts:33-48
    export function safeStorageSecretBackend(): SecretBackend {
      return { prefix: "dpapi1", isAvailable: () => safeStorage.isEncryptionAvailable(),
               encryptToB64: (plain) => safeStorage.encryptString(plain).toString("base64"),
               decryptFromB64: (stored) => safeStorage.decryptString(Buffer.from(stored, "base64")) };
    }
  electron/sync/sync-secrets.ts:70
    return `${backend.prefix}:${backend.encryptToB64(plain)}`;
  electron/sync/sync.service.ts:189-190
    serviceKey: doc.serviceKey === "" ? "" : encodeSecret(doc.serviceKey, backend),
    anonKey: doc.anonKey === "" ? "" : encodeSecret(doc.anonKey, backend),
  electron/sync/sync-secrets.ts:88-91 — an unknown/foreign prefix that IS a
    known encoding marker throws ("Secret de synchronisation illisible") —
    fail-closed.
  cloud/supabase/rls.sql:12 — the privilege the credential carries.
ROOT_CAUSE:
  Not a code defect: the credential is stored correctly. The exposure is the
  SCOPE of the privilege that was requested from Supabase, and the fact that
  the POS is a desktop app on a shared machine.
IMPACT:
  Moderate, but LOWER than the initial finding stated. An attacker who obtains
  the decrypted key (same-user local code, or a memory dump) gets total access
  to the customer mirror — including the ability to alter invoices shown to
  customers. DPAPI means a stolen .sqlite / .vposdb backup does NOT yield the
  key, which is the most likely exfiltration path.
RECOMMENDED_FIX:
  (1) Replace the full `service_role` key with a SCOPED Supabase API key
      limited to the mirror tables and to INSERT/SELECT — the POS never needs
      more. This is the change that actually reduces the blast radius.
  (2) Document the residual risk explicitly in docs/licensing/THREAT_MODEL.md:
      DPAPI protects the file; the privilege remains total.
  (3) Rotate the key on a documented schedule and on staff change.
  (4) Keep the DPAPI storage as-is (it is correct).
REGRESSION_TEST:
  A test asserting that the persisted `client_sync` document contains NO
  clear-text secret (i.e. `value_json` never contains the raw key), and that a
  corrupted/undecryptable value fails closed.
DEPENDENCIES:
  SEC-03 (the same finding, security view), BACK-04 (the backup contract).
```
