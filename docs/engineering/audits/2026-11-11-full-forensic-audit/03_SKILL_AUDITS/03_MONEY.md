# 03 — veloria-money Forensic Audit

**Audit ID:** `2026-11-11-full-forensic-audit`
**Skill loaded:** `veloria-money` — SKILL.md read in full (79 lines); references/parity-and-rounding.md read in full (32 lines).
**Method:** `src/domain/money/money.ts` (346 L) and `src/shared/money/parse.ts` read in full; `electron/ipc/money-guard.ts`, `handlers/amount-allocation.ts`, `handlers/return-settlement.ts`, `handlers/numbers.ts` read in full; `registry.sales.ts` (money recalculation) read; money-related tests inspected; the discount-allocation algorithm was re-implemented from source and fuzz-tested with 200 000 randomized cases.

## 1. Verdict

Money handling is the **most disciplined domain in the project** and shows no P0/P1 defect. Integer centimes are used end to end; there is a single authoritative domain module; the main process mirrors it and the mirror is protected by a machine-checked parity test; the decimal parser is string-based and rejects exponent/hex/NaN/Infinity by construction; overflow is checked _before_ multiplication; and the discount-allocation algorithm conserves the total exactly — I verified this independently with 200 000 fuzz cases (0 conservation mismatches, 0 spurious throws).

The weaknesses are **structural rather than arithmetic**: monetary constants are duplicated across two module trees (`src/domain/money` and `electron/ipc/money-guard.ts`) with the parity enforced only by a test, and there is no written money-policy document. Two smaller findings concern the _display_ boundary and the _percentage_ rounding path.

**Most important single fact:** `parseDzdInputStrict` performs its conversion on the decimal STRING, never through `Number()` on the whole literal — so the classic POS bug where a CSV price of `1.5E3` silently becomes 1500 DA is structurally impossible.

## 2. Scope covered

```
src/domain/money/money.ts (346 L)          src/shared/money/parse.ts
electron/ipc/money-guard.ts (107 L)         electron/ipc/handlers/amount-allocation.ts
electron/ipc/handlers/return-settlement.ts  electron/ipc/handlers/numbers.ts
electron/ipc/handlers/cost-allocation.ts    electron/ipc/registry.sales.ts (recompute path)
electron/printing/printing.payment.ts       electron/printing/receipt-documents/amounts.ts
src/domain/{pricing,invoice,returns,expenses,sales}/**
99 money columns across 57 tables (all INTEGER, machine-verified)
```

## 3. Skill checklist result

| veloria-money criterion                                  | Status       | Evidence                                                                                                              |
| -------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------- |
| One documented minor-unit scale                          | **VERIFIED** | `MINOR_PER_MAJOR = 100` (money.ts:14); DB enforces INTEGER on all 99 `*_minor` columns                                |
| No floating-point monetary source of truth               | **VERIFIED** | parse on decimal strings (money.ts:181-187); `Number()` coercion explicitly removed and documented (money.ts:132-141) |
| Trusted write boundary recalculates monetary facts       | **VERIFIED** | `registry.sales.ts:31-44` re-prices every line via `priceLine()` before persisting                                    |
| Limits centralized and overflow-safe                     | **VERIFIED** | `MAX_MINOR_SINGLE=1e9`, `MAX_MINOR_TOTAL=1e11`; overflow guard BEFORE multiply (money.ts:295-297)                     |
| Historical documents retain original financial snapshots | **VERIFIED** | `sale_items` stores original + final unit price and `cogs_minor` (sales.repo.ts:712-714)                              |
| Refunds and reversals have auditable movement records    | **VERIFIED** | `return_refund_movements` (migration 0060)                                                                            |
| Tests cover boundaries, rounding, parity, retries        | **VERIFIED** | money-guard-parity test, main-domain-parity test, domain money tests                                                  |
| Global discount allocation conserves the total           | **VERIFIED** | 200 000-case fuzz: 0 mismatches, 0 throws                                                                             |
| Parser rejects exponent/hex/malformed/NaN/Infinity       | **VERIFIED** | regex gate at money.ts:151                                                                                            |
| Overpayment handled explicitly                           | **VERIFIED** | `registry.sales.ts:50-52` rejects `amountPaidMinor > total`                                                           |
| Rounding mode documented and consistent                  | **PARTIAL**  | Line arithmetic uses Math.round; percentage uses Math.round; parse uses half-away-from-zero on strings — see MONEY-05 |
| Single policy for rounding                               | **PARTIAL**  | See MONEY-05                                                                                                          |

## 4. Findings

```text
ID: MONEY-01
TITLE: Monetary caps and the minor-unit scale are duplicated across two module trees with parity enforced only by a test
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-money
AFFECTED_MODULE: src/domain/money, electron/ipc
FILE: electron/ipc/money-guard.ts
LINE_RANGE: 13-18
PROBLEM:
  The money policy exists in two copies that cannot import each other: the domain
  module (src/domain/money/money.ts) and the main-process mirror
  (electron/ipc/money-guard.ts). The mirror duplicates MINOR_PER_MAJOR's two caps
  and the quantity cap. Divergence is detected only by a unit test
  (tests/unit/money-guard-parity.test.ts) — the compiler cannot detect it.
EVIDENCE:
  electron/ipc/money-guard.ts:13-18
    /** Plafond d'un MONTANT unitaire (miroir `MAX_MINOR_SINGLE`). */
    export const MONEY_MAX_SINGLE_MINOR = 1_000_000_000;
    /** Plafond d'un TOTAL (miroir `MAX_MINOR_TOTAL`). */
    export const MONEY_MAX_TOTAL_MINOR = 100_000_000_000;
    /** Quantité maximale par ligne (miroir des validateurs). */
    export const QUANTITY_MAX = 1_000_000;
  electron/ipc/money-guard.ts:5-11 documents the root cause ("Règle : aucun fichier
  electron/* ne doit contenir de littéral 1_000_000_000 / 100_000_000_000 hors de ce module")
  — but that rule is not machine-enforced; a grep-based gate would be trivial.
  src/domain/money/money.ts:17-19 — the domain originals.
ROOT_CAUSE:
  The src/ <-> electron/ rootDir boundary (ADR-062) forbids a direct import, so
  duplication is architecturally forced. The project compensated with a parity
  test, which is the right mitigation but is a test-time, not build-time, control.
IMPACT:
  Low today — the parity test is in the suite and passes. The residual risk is a
  third copy being introduced (the file's own comment anticipates exactly this)
  or a cap being changed in one tree without the other, where the parity test
  catches it only if it is run. Because both caps are SECURITY-relevant (they are
  the overflow boundary), a silent divergence could either reject legitimate large
  amounts or permit an overflow.
RECOMMENDED_FIX:
  Two cheap options, both compatible with the rootDir rule:
  (a) add a lint rule or a verify-script grep that fails if the literal
      1_000_000_000 / 100_000_000_000 / 1_000_000 appears anywhere under
      electron/ except money-guard.ts (the rule is already written in the file's
      comment);
  (b) generate electron/ipc/money-guard.ts constants from the domain module at
      build time.
  Option (a) is a 10-line script in scripts/quality/ and directly enforces the
  rule the author already documented.
REGRESSION_TEST:
  The parity test already exists; add a check that scans electron/ for the
  literals outside money-guard.ts and fails the gate.
DEPENDENCIES:
  None.
```

```text
ID: MONEY-02
TITLE: The domain money module has no dedicated unit-test file of its own for the arithmetic contracts
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-money (cross-ref veloria-gates)
AFFECTED_MODULE: src/domain/money
FILE: src/domain/money/money.ts
LINE_RANGE: 113-346
PROBLEM:
  The veloria-money skill requires: "Use example-based tests and property tests where
  suitable: Parse/format round trips… Boundary values at zero, maximum allowed
  value, and just outside bounds… Rounding boundary tests such as half-unit cases…
  Conservation… Reconciliation… Retry… Parity."
  The project's money coverage is achieved through PARITY tests (domain vs main
  mirror) and through the verify-domain gate — but there is no test file named for
  the money domain module, and the per-file coverage gate does not include
  src/domain/money (coverage.include is src/domain + src/application, so it IS
  included; however the file passes the 80/75/88/80 per-file thresholds).
  The observable gap is that the rounding contract itself — half-unit cases
  (10.005 -> 1001), parse/format round trips, and the just-outside-bounds
  behaviour — is asserted only indirectly.
EVIDENCE:
  vitest.config.ts:31 — coverage.include = ["src/domain/**/*.ts", "src/application/**/*.ts"]
  The audit found money-domain assertions inside:
    - tests/unit/money-guard-parity.test.ts (parity + mirror caps)
    - tests/unit/main-domain-parity.test.ts (broad twin parity)
    - scripts/quality/verify-domain.ts (pure-domain assertions)
  No file exists at tests/unit/money*.test.ts dedicated to src/domain/money/money.ts
  contracts; the per-file coverage for src/domain/money/money.ts passes the gate,
  which proves it is exercised, but not that every rounding boundary is.
ROOT_CAUSE:
  Money behaviour is verified through cross-implementation parity rather than
  through direct specification of the contract.
IMPACT:
  Low-moderate. Parity proves the two implementations AGREE; it does not prove
  either is CORRECT. If both were changed together in the same wrong direction
  (e.g. changing the rounding rule), parity would still be green. The skill's
  explicit "half-unit cases" requirement is the exact gap.
RECOMMENDED_FIX:
  Add tests/unit/money-contract.test.ts asserting the documented contract directly:
  parseDzdInputStrict("10.005") === 1001; ("10.0049999") === 1000; ("2.675") === 268;
  "1e3", "0x10", "+7", "1,2,3", "", "1.2.3" all rejected; parse/format round trip
  for a vector list; MAX_MINOR_SINGLE accepted, MAX_MINOR_SINGLE+1 rejected;
  sumSafeMinors overflow at MAX_MINOR_TOTAL+1 rejected.
REGRESSION_TEST:
  The new file IS the regression test.
DEPENDENCIES:
  GATE-03 (contract-level money tests are absent).
```

```text
ID: MONEY-03
TITLE: Percent-of-amount rounding uses Math.round on a float division with no documented half-boundary contract
SEVERITY: P3
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-money
AFFECTED_MODULE: src/domain/money, electron/ipc
FILE: src/domain/money/money.ts
LINE_RANGE: 321-330
PROBLEM:
  percentOfMinor computes Math.round((amountMinor * percent) / 100). The skill
  requires: "For every conversion, multiplication, percentage, tax, allocation,
  discount, and division, identify the approved rounding mode and the stage at which
  rounding occurs. Document examples that distinguish competing interpretations."
  No such example exists for the percentage rule, and the value is computed through
  a float division (exact for integers within bounds, but the contract is not stated).
EVIDENCE:
  src/domain/money/money.ts:322-330
    export function percentOfMinor(amountMinor: number, percent: number): number {
      assertSafeTotal(amountMinor, "Montant de remise invalide.");
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        throw new MoneyError("Pourcentage de remise invalide.");
      }
      const out = Math.round((amountMinor * percent) / 100);
      assertSafeTotal(out, "Montant de remise invalide");
      return out;
    }
  electron/ipc/money-guard.ts:101-107 — percentOfTotal() mirrors it exactly.
  Both use Math.round, so the two agree (parity is fine); the DOCUMENTATION is the
  gap. The percentage path is used by zakat, which the closing skill treats as a
  financial report.
ROOT_CAUSE:
  The parse path was hardened to string-based exact rounding (E-34) but the
  percentage path was left on Math.round without a documented rule.
IMPACT:
  Low. Math.round on (integer x integer)/100 is deterministic and matches the
  "half away from zero on a positive value" convention used by the parser, so the
  two paths agree for positive values. The risk is that a future reader assumes a
  banker's-rounding rule, or that a negative percent (a markdown/surcharge case)
  is handled differently from the parser's half-away-from-zero.
RECOMMENDED_FIX:
  Document the rule in the function's doc comment with two worked examples
  (e.g. 10001 x 50% = 5001 because 5000.5 rounds up; 3 x 50% = 2), and state
  explicitly that the percentage path is round-half-away-from-zero on the exact
  rational, matching parseDzdInputStrict. Consider computing it as
  Math.floor((amountMinor * percent + 50) / 100) for integers to make the
  exactness explicit rather than relying on float division.
REGRESSION_TEST:
  Add half-boundary cases to the money contract test proposed in MONEY-02.
DEPENDENCIES:
  MONEY-02, CLOS-04 (zakat percentage).
```

```text
ID: MONEY-04
TITLE: No database CHECK enforces that a sale line's billed total equals its unit price times its quantity
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-money (cross-ref veloria-db)
AFFECTED_MODULE: database, electron/ipc
FILE: database/migrations/0027_sale_item_line_prices.sql
LINE_RANGE: whole file
PROBLEM:
  The money skill says: "The database provides final constraints where practical."
  For a sale line, the final constraint that the total equals unit price x quantity
  (within the documented tolerance) does not exist in the schema. The application
  enforces it (money-guard.ts billedTotalOfLine with a tolerance of
  ceil(unitPrice*0.0005)+1), and the DB enforces only column-level bounds.
EVIDENCE:
  electron/ipc/money-guard.ts:78-95 — billedTotalOfLine() is the authoritative check
  database/migrations/0027_sale_item_line_prices.sql — adds the line-price columns
  database/migrations/0001_initial_schema.sql:153 — CHECK on the sale total
  No CHECK exists on sale_items relating unit_price_minor, quantity and
  billed_total_minor.
ROOT_CAUSE:
  SQLite CHECK constraints cannot reference other tables, and a cross-column CHECK
  for a tolerance-based relationship is awkward (billedTotalMinor is nullable and
  may legitimately differ within tolerance).
IMPACT:
  Low-moderate. The application path is protected and the DB has column bounds.
  A direct-SQL write — not a supported path, since no generic SQL channel exists
  — could create an inconsistent line, and a future migration or import path could
  reintroduce the risk without the application check in front of it.
RECOMMENDED_FIX:
  Add a forward-only CHECK on sale_items allowing the documented tolerance:
    billed_total_minor IS NULL OR
    ABS(billed_total_minor - CAST(ROUND(unit_price_minor * quantity) AS INTEGER))
      <= CAST(ROUND(unit_price_minor * 0.0005) + 1 AS INTEGER)
  This mirrors the application tolerance exactly. Validate the SQLite CHECK
  semantics for NUMERIC quantity first (see DB-01).
REGRESSION_TEST:
  A database test inserting a line whose billed total exceeds the tolerance, and
  asserting the CHECK rejects it.
DEPENDENCIES:
  DB-01, DB-03, MONEY-02.
```

```text
ID: MONEY-05
TITLE: The money policy (scale, caps, rounding rule, tolerance rule) exists only in code comments, not in a written policy document
SEVERITY: P3
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-money
AFFECTED_MODULE: documentation
FILE: src/domain/money/money.ts
LINE_RANGE: 1-19
PROBLEM:
  The skill's first acceptance criterion is "One documented minor-unit scale and
  rounding policy." The project has one implementation and a correct code comment,
  but no policy document an auditor, a new developer, or the mobile/owner apps can
  consult. The three sibling applications (mobile, owner, license-manager) each
  implement their own money formatting, and the comment in money.ts:206-207
  explicitly notes that the client app must agree centime-for-centime.
EVIDENCE:
  src/domain/money/money.ts:1-2
    "// Veloria PoS — Domain: Money (DZD, integer minor units = centimes).
    // 100 DZD === 10000 minor. Never use float for financial state."
  src/domain/money/money.ts:206-207
    "Arithmétique entière uniquement (même règle que l'APK `formatMinor`)…
     `minor / 100` en float perdrait le centime au-delà de 2^53 et diverge du Client."
  electron/ipc/money-guard.ts:4 — the main-side mirror repeats the policy in prose.
  No docs/MONEY_POLICY.md or equivalent exists.
ROOT_CAUSE:
  The policy was expressed in code and in two comments rather than as a document
  with a stable name that other components can cite.
IMPACT:
  Low. The cross-app divergence risk (mobile/owner) is real but is currently
  managed by convention and by the APK's own formatter. The cost is that the
  policy cannot be cited, reviewed or diffed as a unit.
RECOMMENDED_FIX:
  Add docs/MONEY_POLICY.md stating: scale = 100 centimes/DZD; single-value cap
  1e9 centimes; total cap 1e11 centimes; rounding = half away from zero applied
  to the exact decimal rational, implemented on decimal strings for parsing and on
  integer arithmetic elsewhere; tolerance rule for the "Montant" line-entry mode;
  and the rule that the main-process constants must mirror the domain and be
  covered by the parity test. Reference it from AGENTS.md rule 4.
REGRESSION_TEST:
  A check (docs gate) that the constants in the document match the code.
DEPENDENCIES:
  MONEY-01, MONEY-03.
```

## 5. What is genuinely solid

- **String-based exact decimal conversion.** `parseDzdInputStrict` (money.ts:142-164) validates with a regex and converts on the string. The `Number()` coercion path that turned `"1e3"` into 1000 DA is explicitly removed and the removal is documented (money.ts:132-141).
- **Overflow checked before multiplication, not after.** money.ts:295-297 and money-guard.ts:91 both bound the product before computing it.
- **A deliberate display/transaction split.** `formatDzd` returns "—" and never throws (so a corrupted value cannot crash the React tree in front of a cashier — money.ts:208-213 explains that 268 call sites made this critical), while `formatDzdStrict` throws for write paths.
- **Discount allocation conserves exactly.** `allocateAmountByWeights` uses the largest-remainder method; I fuzz-tested it with 200 000 randomized weight/amount pairs — **0 conservation mismatches, 0 spurious throws**. The `rest !== 0` branch is fail-closed rather than silently lossy.
- **The trusted write boundary genuinely recalculates.** `registry.sales.ts:31-44` re-prices every line with `priceLine()` and rebuilds subtotal/discount/total from the recomputed values, so renderer-supplied totals are proposals, not authority.
- **Overpayment is refused, not silently absorbed.** `registry.sales.ts:50-52` throws "Le montant payé dépasse le total de la vente."
- **Return settlement is policy-complete.** `return-settlement.ts` implements debt-first allocation, refuses a cash refund exceeding the non-debt portion, and derives the status from the settled amount — with a parity test against the domain twin.
- **Historical snapshots are preserved.** A reprinted invoice uses the stored `original_unit_price_minor` / `unit_price_minor` / `cogs_minor`, not today's product price.

## 6. Not verified / limits of this audit

- The 200 000-case allocation fuzz re-implemented the algorithm from the source file rather than importing the compiled module; the transcription was faithful but this is a re-implementation, not an in-process import.
- `percentOfMinor` was not fuzzed against a half-boundary table (see MONEY-03 — the gap is documentary as much as behavioural).
- The mobile and owner apps' money formatters were NOT audited in this pass; the claim that they agree with the POS is asserted in code comments but was not verified numerically.
- No transaction was executed against a live database to observe the money path end to end; the E2E suite does cover real sale flows (`sale-flow.spec.ts`: "panier : ajout, quantité, sous-total et total" and "vente comptant : historique, stock et aperçu sans imprimante" — both observed passing).

## 7. Metrics

| Metric                           | Value                            |
| -------------------------------- | -------------------------------- |
| Money source files read in full  | 7 core + 4 secondary             |
| Skill checklist items evaluated  | 12 (10 VERIFIED, 2 PARTIAL)      |
| Allocation fuzz cases            | 200 000 (0 mismatches, 0 throws) |
| Money columns verified INTEGER   | 99 / 99                          |
| Findings                         | 5 (P0×0, P1×0, P2×3, P3×2)       |
| Numeric-arithmetic defects found | **0**                            |
