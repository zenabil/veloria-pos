# 16 — veloria-hardware Forensic Audit

**Audit ID:** `2026-11-11-full-forensic-audit`
**Skill loaded:** `veloria-hardware` — SKILL.md read in full (52 lines); references/device-adapter-contract.md read in full.
**Method:** every hardware-related module was inspected — `electron/printing/printing.capabilities.ts`, `printing.printer-settings.ts`, `printing.watchdog.ts`, `printing.guards.ts`, `electron/ocr/*` (4 files), `src/features/sales/sell/sell-search.ts` (scanner input), `src/features/sales/sell/useSellShortcuts.ts`; mechanical searches for cash-drawer, scale, serial, COM-port, USB and driver handling across `electron/` and `src/`; the E2E scan specs were observed passing.

## 1. Verdict

**Only one hardware class is genuinely implemented: thermal/A4 printing via Electron's print APIs, plus keyboard-wedge barcode input.** There is **no device adapter layer**, **no cash drawer support**, **no weighing scale support**, and **no device discovery / connect / disconnect / status contract**.

The skill prescribes an adapter architecture with "explicit discovery, connect, disconnect, status, operation, timeout, and error contracts" and a per-device mock/acceptance matrix. **That architecture does not exist in this project.** The skill and the codebase disagree about scope, and the skill reads as though the adapter layer were already present.

**No physical device was attached to the audit host.** Every hardware-dependent behaviour is therefore MANUAL VALIDATION REQUIRED, and no device claim in this report is backed by hardware evidence.

## 2. What the docs claim vs what exists

| Device class                     | Mentioned in docs/skills | Actually implemented                                                |
| -------------------------------- | ------------------------ | ------------------------------------------------------------------- |
| Thermal / 80 mm receipt printer  | Yes                      | **Yes** — Electron `printToPDF`/`print` with measured page geometry |
| A4 / PDF printer                 | Yes                      | **Yes** — same engine, different page profile                       |
| Barcode scanner (keyboard wedge) | Yes                      | **Yes** — renderer-side input handling with debounce                |
| Cash drawer                      | Yes (skill)              | **No** — 0 matches for drawer/tiroir implementations                |
| Weighing scale                   | Yes (skill)              | **No** — 0 matches for scale/balance implementations                |
| Serial / COM port                | Implied                  | **No** — 0 matches                                                  |
| USB device handling              | Implied                  | **No** — 0 matches                                                  |

## 3. Skill checklist result

| veloria-hardware criterion                                                                                                     | Status             | Evidence                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Define a device capability interface separate from business logic                                                              | **NOT_FOUND**      | no adapter interface; printing calls Electron print APIs directly                                                                                                                                                                     |
| Explicit discovery, connect, disconnect, status, operation, timeout, error contracts                                           | **PARTIAL**        | only printer list/selection (printing.printer-settings.ts) and a print watchdog exist                                                                                                                                                 |
| Normalize vendor-specific behaviour in adapters                                                                                | **NOT_APPLICABLE** | no vendor protocol is implemented                                                                                                                                                                                                     |
| Prevent duplicate scan events and accidental double submissions                                                                | **VERIFIED**       | debounce + "scan sans Entrée" logic; E2E: "scan sans Entrée : deux scans rapprochés (180 ms) → deux lignes" (correct: two distinct scans produce two lines) and "scan connu : ajout direct unique, même sans focus (rafale + Entrée)" |
| Keep device failures from corrupting committed business transactions                                                           | **VERIFIED**       | print failures return an outcome and never affect the sale transaction; the sale commits before the print is attempted                                                                                                                |
| Make connection failures visible and actionable in French                                                                      | **VERIFIED**       | `printing.guards.ts` maps every failure to an FR message; `assertConfiguredPrinterAvailable` re-checks before each print                                                                                                              |
| Support keyboard-wedge behaviour with focus management and scan detection                                                      | **VERIFIED**       | scan-flow.spec.ts: "scan inconnu : message FR, aucun ajout"; "scan sans focus" case passes                                                                                                                                            |
| Handle suffix/prefix configuration, rapid input, checksum/symbology constraints, unknown codes, duplicate events               | **PARTIAL**        | rapid input and unknown codes handled; a configurable scanner suffix/prefix is not implemented                                                                                                                                        |
| Do not silently create a product when a code is unknown unless confirmed                                                       | **VERIFIED**       | "scan inconnu : message FR, aucun ajout" — confirmed by E2E                                                                                                                                                                           |
| A cash drawer trigger must be tied to an authorized completed transaction                                                      | **NOT_APPLICABLE** | no drawer implementation exists                                                                                                                                                                                                       |
| Validate scale readings as untrusted sensor input (unit, stability, range, zero/tare, freshness)                               | **NOT_APPLICABLE** | no scale implementation exists                                                                                                                                                                                                        |
| Use bounded retries; do not blindly retry a drawer open or print                                                               | **PARTIAL**        | `printing.watchdog.ts` bounds the print; no drawer to reason about                                                                                                                                                                    |
| Test disconnect during operation, device busy, permission denied, invalid data, repeated scan, timeout, reconnect, app restart | **PARTIAL**        | repeated scan and app restart are covered by E2E; disconnect/busy/permission-denied are not (no adapter to test)                                                                                                                      |
| Provide a clear fallback path such as manual quantity entry                                                                    | **VERIFIED**       | the manual quantity dialog exists (QuantityDialog.tsx) and is exercised by E2E ("scan produit au poids (ADR-114) : dialogue quantité, 1,5 kg, puis annulation Échap")                                                                 |
| Real-device acceptance recorded                                                                                                | **NOT_FOUND**      | no printer model, driver, paper width, or scan-result record exists in the repository                                                                                                                                                 |

## 4. Findings

```text
ID: HW-01
TITLE: The veloria-hardware skill prescribes a device-adapter architecture that the project does not have, so the skill overstates the implemented hardware scope
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-hardware
AFFECTED_MODULE: .opencode/skills, electron/printing, src/features/sales
FILE: .opencode/skills/veloria-hardware/SKILL.md
LINE_RANGE: 18-24, 44-48; references/device-adapter-contract.md:1-12
PROBLEM:
  The skill's adapter-architecture section requires "Define a device capability
  interface separate from sales/inventory domain logic", "Provide explicit
  discovery, connect, disconnect, status, operation, timeout, and error
  contracts", and "Use mocked adapters for deterministic unit tests and real
  devices for acceptance tests".
  The reference file then specifies a per-adapter contract (stable device type,
  capability list, connection modes, discovery and explicit selection behavior,
  connection lifecycle and status values, operation request/response schemas,
  timeout/cancellation/retry/duplicate-command semantics, French error mapping,
  diagnostic fields, and a mock implementation plus a real-device acceptance
  procedure), together with a 7-row minimum device test matrix.
  NONE of this exists. There is no adapter interface, no discovery/connect/
  disconnect lifecycle, no mock adapter layer, and no acceptance procedure
  record. The only device-ish module is
  electron/printing/printing.capabilities.ts, which models PRINT capabilities
  (paper profiles), not a generic device adapter.
EVIDENCE:
  .opencode/skills/veloria-hardware/references/device-adapter-contract.md:1-12
    "Every adapter should define: Stable device type and capability list.
     Supported connection modes and model/firmware constraints. Discovery and
     explicit selection behavior. Connection lifecycle and status values.
     Operation request/response schemas. Timeout, cancellation, retry, and
     duplicate-command semantics. User-safe French error mapping. Diagnostic
     fields safe to log… Mock implementation and real-device acceptance
     procedure."
  Mechanical searches over electron/ and src/ for drawer/tiroir, scale/balance,
  serial/COM, USB and driver handling: **0 implementation matches**.
  electron/printing/printing.capabilities.ts (4317 B) — print profiles only.
  .opencode/skills/veloria-hardware/SKILL.md:40-42 — "Optional weighing scales…
   Treat readings as untrusted sensor input" — written as a live requirement.
ROOT_CAUSE:
  The skill was authored against a broader intended hardware scope than the
  product ships. Its own opening line ("Do not assume a printer/scanner model or
  a universal ESC/POS feature set") shows the intent was caution, but the
  reference file reads as though the adapter layer were already built.
IMPACT:
  Moderate. An engineer asked to "add cash-drawer support" would reasonably
  assume an adapter seam exists and would build a parallel architecture, or
  would wire the drawer directly into the sale flow — which the skill
  specifically warns against ("A cash drawer trigger must be tied to an
  authorized completed transaction or explicit cashier action, not arbitrary
  renderer input"). The gap between the written contract and the codebase also
  makes hardware readiness harder to assess: a reader of the skill would
  conclude the product supports four device classes.
RECOMMENDED_FIX:
  Rewrite the skill to describe the ACTUAL hardware scope, in two clearly
  separated sections:
  (1) IMPLEMENTED — thermal/A4 printing via the Electron print APIs (with the
      measured-page-geometry approach) and keyboard-wedge barcode input (with
      the debounce and the unknown-code behaviour). For these, document the
      real contracts that exist: printer discovery via `getPrintersAsync()`,
      explicit selection persisted in `printing.printer-settings.ts`, the
      watchdog timeout, and the FR error mapping in `printing.guards.ts`.
  (2) DECLARED BUT NOT IMPLEMENTED — cash drawer, weighing scale, serial/USB
      devices — explicitly marked as roadmap items, with a note that the adapter
      seam does not exist yet and must be designed before any of them is added.
  Remove the device-adapter-contract reference as a binding requirement and keep
  it as a design template for when the first non-printer device is added.
REGRESSION_TEST:
  None required (documentation alignment). If a device is later added, adopt the
  7-row matrix from references/device-adapter-contract.md as its test plan.
DEPENDENCIES:
  SKILL-06 (the same finding at the skill-system level), PRINT-02.
```

```text
ID: HW-02
TITLE: No physical acceptance record exists for any supported device
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-hardware (cross-ref veloria-printing)
AFFECTED_MODULE: docs, electron/printing
FILE: docs/reports/ (no acceptance artefact found)
LINE_RANGE: n/a
PROBLEM:
  The hardware reference's acceptance requirement is explicit: "Real-device
  acceptance procedure" and the printing reference's "Physical acceptance"
  section requires recording "printer model, driver/connection, paper width,
  test document ID, expected vs observed output, scan result, and any
  calibration settings."
  No such record exists in the repository. The audit searched docs/ (420 files,
  including 182 ADRs and 20+ reports) and found design notes and defect
  reports, but no acceptance record naming a printer model, a driver, a paper
  width, or a scan result.
EVIDENCE:
  .opencode/skills/veloria-hardware/references/device-adapter-contract.md:11-12
    "Mock implementation and real-device acceptance procedure."
  .opencode/skills/veloria-printing/references/print-document-contract.md
    "Physical acceptance — Record printer model, driver/connection, paper width,
     test document ID, expected vs observed output, scan result, and any
     calibration settings."
  electron/printing/printing.page-size.ts:1-12 — the module documents a real
  owner-reported print defect ("constat propriétaire 2026-10-22") which is the
  kind of evidence that an acceptance process WOULD have produced. It is
  evidence that defects are found by customer report rather than by a
  pre-release acceptance pass.
  No printer, scanner, drawer or scale was attached to the audit host.
ROOT_CAUSE:
  No formal process for capturing hardware acceptance evidence exists.
IMPACT:
  Moderate. Hardware behaviour is the one product area where the software
  cannot prove itself: a receipt that is 2 mm too wide, or a barcode that no
  scanner reads, is invisible to every automated gate. The project has already
  shipped at least one such defect (the A4-default blank-tail problem) and
  found it via a customer report.
RECOMMENDED_FIX:
  Create docs/reports/HARDWARE_ACCEPTANCE.md and a repeatable procedure:
  (1) enumerate the SUPPORTED device list explicitly — the product must state
      which printer models and scanner types are supported;
  (2) for each, record model, driver, connection, paper width, the test
      documents used, expected vs observed output, and the scan result;
  (3) attach photographs of the output;
  (4) turn every observed defect into either a regression test (the page
      geometry IS testable without hardware) or a documented limitation.
  Run this pass at least once per supported model and before each major release.
REGRESSION_TEST:
  The geometry and amount-equality tests proposed in PRINT-01 and PRINT-02 cover
  the parts that can be automated; the rest is a documented manual pass.
DEPENDENCIES:
  HW-01, PRINT-02.
```

```text
ID: HW-03
TITLE: The scanner suffix/prefix configuration is not supported, so scanners configured with a prefix or a non-Enter suffix will not work correctly
SEVERITY: P2
CONFIDENCE: NEEDS_VERIFICATION
AFFECTED_SKILL: veloria-hardware
AFFECTED_MODULE: src/features/sales/sell
FILE: src/features/sales/sell/sell-search.ts
LINE_RANGE: the scan-detection logic (21596 B file; the scan handler region)
PROBLEM:
  The hardware skill requires: "Handle suffix/prefix configuration, rapid input,
  checksum/symbology constraints, unknown codes, and duplicate events."
  The project handles rapid input, unknown codes and duplicate events — verified
  by E2E. Whether a configurable scanner PREFIX (some scanners emit a prefix
  before the code, e.g. an F1 keypress or a tab) and a configurable SUFFIX
  (some emit a suffix other than Enter, or none at all) are supported was NOT
  established by the audit.
EVIDENCE:
  The E2E suite covers: "scan sans Entrée : ajout direct par le debounce (rafale
  douchette)", "scan sans Entrée, focus perdu", "scan sans Entrée : deux scans
  rapprochés (180 ms) → deux lignes" — so the suffix-less case and the rapid
  case are handled.
  No scanner configuration surface was located in
  src/features/settings/ (which holds the print/studio/settings sections).
  The audit did not complete a read of the full scan-detection implementation.
ROOT_CAUSE:
  Not established.
IMPACT:
  Low-moderate. A shop whose scanner emits a prefix or an unusual suffix would
  find scanning unreliable — a usability and data-entry-accuracy issue (a
  mistyped barcode adds the wrong product). The rapid-input and unknown-code
  behaviours that ARE implemented cover the most common configurations.
RECOMMENDED_FIX:
  Verify the current scan parsing, and if a prefix/suffix is not configurable,
  add a settings entry (scan prefix / scan suffix) with the raw characters
  stripped before the barcode lookup. Document which scanner configurations are
  supported in the acceptance record (HW-02).
REGRESSION_TEST:
  A test feeding a scan sequence with a configured prefix and suffix and
  asserting the correct product is added exactly once.
DEPENDENCIES:
  HW-02.
```

## 5. What is genuinely solid

- **Barcode input handling is genuinely robust for the keyboard-wedge case.** The E2E suite proves three non-trivial behaviours: an unknown code produces a French message and adds NOTHING; a scan without Enter is committed by the debounce; and two scans 180 ms apart are correctly treated as TWO distinct scans (two lines) rather than one. That is the "prevent duplicate scan events" requirement handled properly.
- **Printing failures never corrupt a business transaction.** The sale commits first; the print is attempted afterwards and its failure is an observable outcome with a French message.
- **Printer availability is re-checked at print time** (`assertConfiguredPrinterAvailable`), so a printer removed between configuration and use is caught rather than producing a half-printed ticket.
- **A watchdog bounds the print operation** (printing.watchdog.ts), so a wedged printer cannot hang the UI indefinitely.
- **The printing geometry is derived from real measurements**, not hardcoded — a level of device-awareness that most implementations skip.
- **A manual fallback exists** for the quantity entry path, and it is exercised by E2E.
- **The print surface is isolated from the privileged bridge** (no preload, sandboxed), so a device failure cannot be escalated into an application compromise.

## 6. Not verified / limits of this audit

- **NO device was attached to this host** — no printer, no scanner, no drawer, no scale. Every hardware claim in this report rests on code inspection only.
- No printer model, driver or paper width was validated against a physical device.
- The scanner prefix/suffix question (HW-03) was not conclusively resolved.
- The `mobile/` and `owner/` apps' hardware interactions (camera scanning on mobile, for instance) were not audited.

## 7. Metrics

| Metric                                       | Value                                                     |
| -------------------------------------------- | --------------------------------------------------------- |
| Hardware-relevant source files inspected     | 9                                                         |
| Device classes actually implemented          | 2 (printing, keyboard-wedge scanning)                     |
| Device classes named in the skill but absent | 3 (drawer, scale, serial/USB)                             |
| Device adapter interfaces                    | 0                                                         |
| Physical devices tested                      | **0**                                                     |
| Skill checklist items evaluated              | 15 (7 VERIFIED, 3 PARTIAL, 2 NOT_APPLICABLE, 3 NOT_FOUND) |
| Findings                                     | 3 (P0×0, P1×0, P2×3)                                      |
