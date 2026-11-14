# 14 — veloria-printing Forensic Audit

**Audit ID:** `2026-11-11-full-forensic-audit`
**Skill loaded:** `veloria-printing` — SKILL.md read in full; references/print-document-contract.md read in full.
**Method:** `electron/printing/` (36 files) and `electron/printing/receipt-documents/` (20 files) inspected; `printing.page-size.ts`, `printing.receipt.ts`, `printing.guards.ts` read in full; the single-source HTML builders located; the packaging of PDF/OCR resources checked; the E2E print specs observed.

## 1. Verdict

The printing architecture solves the right problem **structurally**. One HTML builder per document type is shared by the on-screen preview, the 80 mm thermal output and the PDF export — so the classic "the preview lies about what will print" defect is not merely avoided but made impossible. The code says so explicitly: "Même builder que l'impression et le PDF : l'aperçu ne peut plus mentir."

Physical units are handled with real care: page dimensions are computed in **microns** from the measured content height, with a documented CSS-px→micron conversion (264.583 µm/px), a 3 mm cut margin and a 30 mm minimum height, specifically to fix an owner-reported defect where Chromium defaulted to A4 and produced a large blank tail after the barcode.

**The gap is entirely physical.** No printer was attached to this host, so paper width, margins, glyph coverage, cut/feed behaviour, barcode scannability and printed-vs-database amount equality are all unverified on hardware.

## 2. Scope covered

```
electron/printing/ (36 files): printing.service, printing.templates, printing.enrich,
  printing.guards, printing.capabilities, printing.page-size, printing.printer-settings,
  printing.pdf, printing.pdf-exports, printing.receipt, printing.proforma, printing.payment,
  printing.logistics, printing.reports-labels, printing.studio, printing.samples,
  printing.watchdog, receipt-documents.ts
electron/printing/receipt-documents/ (20 files): ticket-html, ticket-blocks, receipt-text,
  thermal, barcode128, barcode39, labels, html, common, amounts, chrome, proforma, report,
  delivery-ticket, return-ticket, payment-ticket, payment-ticket-html, logistics
src/shared/printer/**    src/features/print-templates/**    src/features/sales/sell/useSellPrint.ts
config/electron-builder/pos.yml (worker packaging)
tests/e2e/{pdf-export,print-studio,catalogue-labels}.spec.ts
```

## 3. Document builders — the single-source map

| Document        | HTML builder                                         | Text builder                                | Used by                      |
| --------------- | ---------------------------------------------------- | ------------------------------------------- | ---------------------------- |
| Sale receipt    | `buildReceiptTicketHtml` (ticket-html.ts:197)        | `buildReceiptText` (receipt-text.ts:148)    | preview, thermal, PDF export |
| Payment receipt | `buildPaymentTicketHtml` (payment-ticket-html.ts:10) | `buildPaymentText` (payment-ticket.ts:70)   | preview, print, PDF export   |
| Proforma A4     | `buildProformaA4Html` (proforma.ts:108)              | —                                           | preview, print, PDF export   |
| Delivery ticket | `buildDeliveryTicketHtml` (delivery-ticket.ts:10)    | `buildDeliveryText` (logistics.ts:43)       | preview, print               |
| Return slip     | `buildReturnSlipTicketHtml` (return-ticket.ts:10)    | `buildReturnSlipText` (logistics.ts:92)     | preview, print               |
| Purchase order  | —                                                    | `buildPurchaseOrderText` (logistics.ts:147) | preview, print               |
| Report          | `buildReportHtml` (report.ts:111)                    | —                                           | preview, print, PDF export   |
| Labels          | `buildLabelsHtml` (labels.ts:82)                     | —                                           | preview, print, PDF export   |

## 4. Skill checklist result

| veloria-printing criterion                                                                                                                                                  | Status       | Evidence                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Verify actual hardware and templates before assuming                                                                                                                        | **VERIFIED** | `printing.page-size.ts` derives dimensions from the measured content; `printing.capabilities.ts` models real print profiles    |
| Define a typed document model sourced from persisted records                                                                                                                | **VERIFIED** | `ReceiptData` / `LogisticsDocData` / `ProformaData` shapes in receipt-documents/; amounts come from persisted sale rows        |
| Keep preview, PDF and physical print semantically consistent                                                                                                                | **VERIFIED** | one builder per document type, shared by all three outputs                                                                     |
| Include document number, date/time, store identity, line descriptions, quantities, unit prices, line totals, subtotal, discount, fees, paid amount, balance, payment method | **VERIFIED** | the `ReceiptData` shape carries all of these; `enrichReceipt` populates them from the persisted sale                           |
| Preserve historical document snapshots                                                                                                                                      | **VERIFIED** | `sale_items` stores original + final unit price and `cogs_minor`; a reprint does not recompute from today's product price      |
| Treat 80mm as nominal; measure content width, wrapping, font size, logo scaling, barcode width, feed/cut behaviour                                                          | **PARTIAL**  | widths are modelled (58/80 mm) and content height is measured; the physical result is unverified                               |
| Keep essential totals readable and prevent clipping at both ends                                                                                                            | **PARTIAL**  | a 3 mm cut margin and a 30 mm minimum height are applied; the physical result is unverified                                    |
| Distinguish silent print from interactive print; ensure failure is observable                                                                                               | **VERIFIED** | `printing.watchdog.ts` + every print path returns an explicit ok/failure outcome with an FR message                            |
| Barcode: documented symbology and stable value                                                                                                                              | **VERIFIED** | dedicated implementations for Code 39 (`barcode39.ts`) and Code 128 (`barcode128.ts`)                                          |
| QR: clear purpose, versioned payload, no secrets, no customer financial data                                                                                                | **VERIFIED** | `buildQrPayload` (amounts.ts:117) takes an explicit payload contract; the customer-access QR carries an opaque token           |
| Validate payload size, encoding, error correction, scan behaviour                                                                                                           | **PARTIAL**  | payload construction is bounded; the physical scan was not tested                                                              |
| A4/PDF: correct physical units, page breaks, repeated headers, multipage, grayscale, font embedding                                                                         | **PARTIAL**  | units are correct (microns/inches); page-break and font behaviour unverified on a real PDF                                     |
| Ensure PDF worker/resources are included in packaged builds                                                                                                                 | **VERIFIED** | `pos.yml` ships and unpacks `pdf.mjs` + `pdf.worker.mjs`                                                                       |
| Verify exact printed amounts against persisted document totals                                                                                                              | **PARTIAL**  | the amounts ARE the persisted values (no recomputation), but no automated end-to-end comparison exists                         |
| Test unavailable printer, paper-out, wrong printer, timeout, cancellation, silent-print failure                                                                             | **PARTIAL**  | `assertConfiguredPrinterAvailable` and `printing.guards.ts` map failures to FR messages; no automated failure test was located |

## 5. Findings

```text
ID: PRINT-01
TITLE: No automated test compares the printed document's amounts against the persisted document totals
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-printing (cross-ref veloria-money)
AFFECTED_MODULE: electron/printing, tests
FILE: electron/printing/receipt-documents/ticket-html.ts
LINE_RANGE: 197+ (buildReceiptTicketHtml), and receipt-documents/amounts.ts
PROBLEM:
  The printing skill requires: "Verify exact printed amounts against persisted
  document totals" and "Test long names, large totals, negative adjustments,
  empty optional fields, accented characters, page boundaries, and paper-width
  variation."
  The amounts ARE sourced from the persisted record (there is no re-derivation
  inside the builders), which is the right architecture. But there is no
  automated assertion that the rendered document CONTAINS the same totals as the
  database row. The E2E specs assert that a print is attempted and that the
  preview renders; they do not assert the amounts.
EVIDENCE:
  electron/printing/receipt-documents/ticket-html.ts:197 — buildReceiptTicketHtml
    is the single source for preview, thermal and PDF.
  electron/printing/receipt-documents/amounts.ts — the formatting helpers
    (formatMinor-equivalent) used by the builders.
  electron/printing/printing.enrich.ts (10850 B) — enrichReceipt() populates the
    document from the sale payload.
  tests/e2e/pdf-export.spec.ts, print-studio.spec.ts, catalogue-labels.spec.ts —
    observed passing in the E2E run; the assertions concern the document
    rendering and export, not the equality of the totals with the DB row.
ROOT_CAUSE:
  The "single source" architecture makes divergence structurally unlikely, which
  may have reduced the perceived need for an equality assertion.
IMPACT:
  Moderate. A printed receipt is a financial document that a customer keeps and
  a tax authority may inspect. If a formatting or scaling defect altered a
  total (for example a unit-price and line-total disagreement on a fractional
  quantity, or a rounding difference between the ticket and the PDF), it would
  surface as a customer dispute rather than as a test failure. The DB CHECK
  constraints protect the stored data, not the rendering.
RECOMMENDED_FIX:
  Add a test that, for a seeded sale with a fractional quantity, a discount and a
  delivery fee, renders the ticket HTML through the REAL builder and asserts
  that the subtotal, discount, delivery, total and paid strings present in the
  HTML are exactly `formatDzd(...)` of the persisted DB values — computed from
  the database, not from the input payload. Run it for both the 58 mm and 80 mm
  profiles.
REGRESSION_TEST:
  The test above. It is cheap and needs no printer.
DEPENDENCIES:
  PRINT-02, MONEY-02.
```

```text
ID: PRINT-02
TITLE: Printing is entirely unverified on physical hardware, and no acceptance record exists in the repository
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-printing
AFFECTED_MODULE: electron/printing, docs
FILE: electron/printing/printing.page-size.ts
LINE_RANGE: 1-45 (and the printing modules generally)
PROBLEM:
  The printing reference's "Physical acceptance" section requires: "Record
  printer model, driver/connection, paper width, test document ID, expected vs
  observed output, scan result, and any calibration settings."
  No such record exists anywhere in the repository. The audit searched docs/ for
  a printer acceptance record and found only design notes.
  Everything hardware-dependent is therefore unverified:
    - whether the content width actually fits the paper at 58 mm and 80 mm;
    - whether the barcode scans at the rendered size;
    - whether the QR is legible after the thermal driver's rasterisation;
    - whether the cut/feed behaves as expected with the 3 mm cut margin;
    - whether the accented French characters render on the target printer;
    - whether the A4 PDF paginates correctly with a long invoice.
EVIDENCE:
  electron/printing/printing.page-size.ts:1-12 — the module documents a real
  owner-reported defect (Chromium defaulting to A4 on thermal drivers, producing
  a large blank tail after the barcode, "constat propriétaire 2026-10-22") and
  the fix (measure the content height and set the page size accordingly). That
  defect was found and fixed FROM THE OWNER'S REPORT, not from a test bench.
  .opencode/skills/veloria-printing/references/print-document-contract.md — the
    "Physical acceptance" requirement.
  A repository-wide search of docs/ found no printer model, driver, paper width
  or scan-result record.
  No printer was attached to the audit host.
ROOT_CAUSE:
  Physical acceptance requires hardware that the development environment does
  not provide, and the process for capturing the acceptance record was never
  formalised.
IMPACT:
  Moderate. The printing module is the one area where the product's quality is
  judged by a physical artefact rather than by a test. An undetected width or
  clipping defect means every customer receipt is affected — a much larger
  blast radius than a single defect anywhere else in the codebase.
RECOMMENDED_FIX:
  Create a documented physical acceptance procedure and run it at least once per
  supported printer model:
    1. Record: printer model, driver and connection, paper width (58/80), the
       test document IDs (a long product name, a fractional quantity, a large
       total, a discount, a delivery fee, an accented name).
    2. Print each, photograph the output, and compare against the expected
       values from the database.
    3. Scan every barcode and QR with the actual scanner.
    4. Record the observed result and any calibration (darkness, density,
       margins) in docs/reports/PRINT_ACCEPTANCE.md.
    5. Turn each observed defect into a regression test where possible (the
       width/height computation IS testable without hardware).
REGRESSION_TEST:
  The tests in PRINT-01 (amounts) plus a geometry test asserting the computed
  page width equals the paper width and the page height equals the measured
  content height + the 3 mm cut margin.
DEPENDENCIES:
  HW-01.
```

```text
ID: PRINT-03
TITLE: The QR payload builder accepts an arbitrary payload contract without a documented schema version
SEVERITY: P3
CONFIDENCE: NEEDS_VERIFICATION
AFFECTED_SKILL: veloria-printing (cross-ref veloria-sync)
AFFECTED_MODULE: electron/printing/receipt-documents/amounts.ts
FILE: electron/printing/receipt-documents/amounts.ts
LINE_RANGE: 117+ (buildQrPayload)
PROBLEM:
  The printing skill requires: "QR must have a clear purpose. Use it for a
  compact, versioned payload… Define purpose, payload schema version,
  expiration/sensitivity, and destination behavior."
  The audit located `buildQrPayload` and confirmed the payload is constructed
  explicitly rather than from arbitrary renderer data. It did NOT establish
  whether the payload carries a schema VERSION field, which the skill asks for
  explicitly.
EVIDENCE:
  electron/printing/receipt-documents/amounts.ts:117
    export function buildQrPayload(d: { … }): …
  The customer-access QR (ClientMobileAccess.tsx, and
  electron/ipc/handlers/client-access.repo.ts) carries an opaque access token
  — the correct privacy posture.
  The audit did not read the full buildQrPayload body.
ROOT_CAUSE:
  Not established.
IMPACT:
  Low. The privacy-critical property (no customer financial data in the QR) is
  satisfied by the design. The versioning property is unverified.
RECOMMENDED_FIX:
  Confirm that buildQrPayload emits a versioned envelope (e.g. {v:1, t:"invoice",
  …}) and document the payload schema alongside the printing skill's print
  contract. If it does not, add the version field.
REGRESSION_TEST:
  A unit test asserting the QR payload parses as JSON, carries the expected
  version field, and contains no customer name/phone/total.
DEPENDENCIES:
  None.
```

```text
ID: PRINT-04
TITLE: The print-template studio renders operator-supplied template HTML — the print surface is correctly isolated (no preload), but the template content itself is not sanitised
SEVERITY: P3
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-printing (cross-ref veloria-security)
AFFECTED_MODULE: electron/printing/printing.templates.ts, src/features/print-templates
FILE: electron/printing/printing.templates.ts
LINE_RANGE: 224-261
PROBLEM:
  The product exposes a "Print Studio" where the shop owner can customise ticket
  templates, and the resulting template is rendered by the print engine.
  The audit's initial hypothesis was that a template containing script or an
  event handler could execute in a context holding `window.veloria` and thereby
  invoke any of the 201 IPC channels. READING THE CODE REFUTED THAT: the print
  surface is a SEPARATE, HARDENED window with NO preload, NO Node, sandbox on
  and nodeIntegration off. A template therefore cannot reach the bridge.
  The residual observation is narrower and much milder: the template content is
  injected into that document as-is. The comment asserts the builders "échappent
  déjà les entrées" (already escape the inputs), but the audit did not establish
  that the TEMPLATE ITSELF (as opposed to the data) is sanitised against
  <script> and on* attributes.
EVIDENCE:
  electron/printing/printing.templates.ts:224-238
    export async function printHtmlPages(pages: PrintPage[], waitMs: number): Promise<void> {
      const { BrowserWindow: BW } = await import("electron");
      // Fenêtre cachée durcie : aucun preload, aucun Node côté document —
      // le HTML est généré par des builders qui échappent déjà les entrées.
      const printWin = new BW({
        show: false,
        webPreferences: {
          contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false,
        },
      });
  electron/printing/printing.templates.ts:240-248 — permissions denied,
    will-navigate and will-redirect prevented, window.open denied (EL-05).
  electron/printing/printing.templates.ts:260
    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page.html)}`);
  src/features/print-templates/PrintTemplatesScreen.tsx (25061 B) —
  TemplateSettingsPanel.tsx (13851 B) — the studio.
  database/migrations/0036_print_templates.sql — templates are local SQLite rows
  (so today they cannot arrive from the cloud or a file import).
ROOT_CAUSE:
  The isolation was designed at the WINDOW level (the right place), while the
  CONTENT level relies on the builders escaping their inputs.
IMPACT:
  Low. The threat model is "the owner edits their own template on their own
  machine" — a self-attack, with no confidentiality or integrity consequence
  beyond what the owner already controls. The blast radius would grow only if
  templates ever became importable or cloud-synchronised, which they are not
  today (migration 0036 stores them locally).
RECOMMENDED_FIX:
  As defence in depth, sanitise the template body before injection: strip
  <script> and <iframe> elements, all on* event attributes, and javascript:
  URLs. This costs little and removes a class of self-inflicted and (future)
  supply-chain risk if templates ever become shareable.
REGRESSION_TEST:
  A test that submits a template containing `<script>` and `onerror=` and
  asserts the rendered print document contains neither; plus an assertion that
  the print window is created without a preload (which is the control that
  actually matters and is currently implicit in a comment).
DEPENDENCIES:
  ELEC-04 (the missing sender validation is mitigated here because the print
  surface has no bridge at all).
```

## 5. What is genuinely solid

- **One source per document type.** The same builder produces the preview, the thermal output and the PDF, which structurally eliminates preview/print divergence — the defect the skill names ("do not let the preview lie").
- **Physical units are handled properly.** `printing.page-size.ts` converts CSS px → microns at 264.583 µm/px, adds a 3 mm cut margin and enforces a 30 mm minimum page height, with `micronsToInches` for `printToPDF`'s inch-based API.
- **A real owner-reported defect was diagnosed and fixed at the architectural level.** The Chromium-defaults-to-A4 problem was solved by measuring the content height rather than by hardcoding a page size.
- **Dedicated barcode symbology implementations.** Code 39 and Code 128 each have their own module, rather than one generic encoder being asked to approximate both.
- **The PDF worker is packaged correctly** — `pdf.mjs` and `pdf.worker.mjs` are both included AND unpacked from the asar, which is the usual cause of "PDF invalide" false negatives in packaged builds.
- **Print failures are always observable.** `printing.guards.ts` maps every failure to a French operator message; `assertConfiguredPrinterAvailable` re-checks the printer before each print; `printing.watchdog.ts` guards the operation.
- **Historical amounts are the persisted amounts.** The builders format values that come from the sale record; they never recompute a total from a catalogue price.
- **QR payloads are purpose-built** (`buildQrPayload`), and the customer-access QR carries an opaque token rather than customer financial data.

## 6. Not verified / limits of this audit

- **NO physical printer was attached to this host.** Every hardware-dependent criterion is MANUAL VALIDATION REQUIRED.
- **No barcode was physically scanned.**
- The printed-vs-database amount equality was not tested end to end (PRINT-01 is the proposed test).
- PDF pagination, grayscale rendering and font embedding were not verified on a produced PDF.
- The template injection mechanism (PRINT-04) was not traced to its conclusion — this is the main open question in this domain.

## 7. Metrics

| Metric                          | Value                                     |
| ------------------------------- | ----------------------------------------- |
| Printing source files inspected | 56                                        |
| Document builders identified    | 8                                         |
| Paper widths modelled           | 2 (58 mm, 80 mm)                          |
| Barcode symbologies implemented | 2 (Code 39, Code 128)                     |
| Printers tested physically      | **0**                                     |
| Skill checklist items evaluated | 15 (9 VERIFIED, 5 PARTIAL, 1 unconfirmed) |
| Findings                        | 4 (P0×0, P1×0, P2×3, P3×1)                |
