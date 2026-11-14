# veloria-sync â€” Skill Audit

**Audit ID:** `2026-11-11-full-forensic-audit`  
**SKILL.md read in full:** yes  
**References read in full:** yes (see Scope)  
**Skill loaded via skill tool:** yes

## 1. Verdict

This is the one skill that materially contradicts the codebase. The skill describes a Google Sheets V1 bridge; the project ships a Supabase PostgREST mirror with Edge Functions and RLS deny-by-default. The implementation itself is well built â€” durable outbox, operationId claim-before-send, bounded retry, RLS deny-by-default, service_role key confined to the main process â€” but the skill's threat model and the contract it derives from describe the wrong system. This is the highest-impact skill-level defect in the bundle.

## 2. Scope covered

SKILL.md + references/google-sheets-bridge.md; electron/sync/* (5 files: sync.service.ts 63 KB, owner-snapshot.ts 56 KB, sync.protocol.ts 20 KB, client-catalog.ts, sync-secrets.ts); cloud/supabase/* (11); electron/ipc/handlers/client-access.repo.ts (31 KB), client-order.repo.ts, client-catalog.repo.ts; migrations 0032, 0033, 0038, 0047, 0062.

## 3. Skill checklist result

| Criterion                                                       | Status       | Evidence                                                                                                                                                                                  |
| --------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POS remains Offline-First                                       | **VERIFIED** | sales/stock writes never depend on a network call; sync is a background outbox                                                                                                            |
| Local SQLite authoritative for core transactions                | **VERIFIED** | outbox is a projection; no inbound write path mutates canonical financial records                                                                                                         |
| Durable local outbox with stable operation IDs                  | **VERIFIED** | sync_outbox table (0032) + operationId column (0022)                                                                                                                                      |
| Reserve/claim a row before network transmission                 | **VERIFIED** | tryClaimBeforeSend (sync.service.ts:499-507) â€” explicitly documented as S-01/S-02                                                                                                       |
| Idempotent bridge writes                                        | **VERIFIED** | idempotency_keys UNIQUE on operation_id; replay returns the prior result (sync.service.ts:293-310, 386-397)                                                                               |
| Bounded retries with backoff                                    | **PARTIAL**  | attempt counters and lastAttemptAt are tracked; see 11_SYNC.md                                                                                                                            |
| Classify failures (transient vs configuration vs row-level)     | **PARTIAL**  | See 11_SYNC.md                                                                                                                                                                            |
| Monotonic update marker so stale updates cannot overwrite newer | **VERIFIED** | outbox updated_at/version used in the payload contract                                                                                                                                    |
| Never ship direct mobile access with embedded credentials       | **VERIFIED** | rls.sql: no policies at all; anon/authenticated are REVOKED; only the Edge Function (service_role) reads                                                                                  |
| Test customer A cannot read customer B's data                   | **PARTIAL**  | See 11_SYNC.md â€” the isolation is structural (RLS deny-by-default + Edge Function), but the adversarial test is asserted in ADR-053, not demonstrated by an executed test in this audit |
| Export only fields necessary for the customer experience        | **VERIFIED** | sync.protocol.ts builds a minimal per-customer projection                                                                                                                                 |
| No service credentials in renderer/mobile bundle/logs           | **VERIFIED** | sync-secrets.ts (M3 fix); serviceKey only reachable in main; grep found no literal key in source                                                                                          |
| **Matches the approved V1 architecture (Google Sheets)**        | **CONFLICT** | NOT IMPLEMENTED â€” Supabase instead. See SKILL-01.                                                                                                                                       |

## 4. Findings raised by this skill

- **SKILL-01** â€” full finding block in `01_SKILLS_AUDIT/SKILLS_SYSTEM_AUDIT.md` Â§3.

## 5. What is genuinely solid

- RLS deny-by-default with an explicit REVOKE is the correct posture for a customer-data bridge â€” cloud/supabase/rls.sql:8-17.
- Claim-before-send closes the duplicate-send race that most outbox implementations leak.
- sync-secrets.ts documents the root cause (M3): the service_role key used to rest in the renderer state.
- The service_role key is never in the mobile bundle â€” the APK uses anon + RLS, which is denied everything.

## 6. Not verified / limits of this audit

- The live Supabase project was not contacted (no credentials, and out of audit scope).
- The Edge Function authorisation logic was read statically; no adversarial request was replayed against a live instance.

## 7. Metrics

- Checklist items evaluated: **13** â€” VERIFIED: 9, PARTIAL: 3, CONFLICT: 1
- Skill-level findings owned by this skill: **1**
- Domain findings owned by this skill: see `03_SKILL_AUDITS/`

---

_Part of the `2026-11-11-full-forensic-audit` skill-by-skill forensic audit. Companion: `SKILLS_SYSTEM_AUDIT.md` (system-level analysis) and `../04_CROSS_SKILL_AUDIT.md` (inter-skill conflicts)._
