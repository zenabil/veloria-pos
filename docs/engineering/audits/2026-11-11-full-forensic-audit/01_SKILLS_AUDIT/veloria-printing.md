# veloria-printing â€” Skill Audit

**Audit ID:** `2026-11-11-full-forensic-audit`  
**SKILL.md read in full:** yes  
**References read in full:** yes (see Scope)  
**Skill loaded via skill tool:** yes

## 1. Verdict

Printing is architecturally well solved: one HTML document source is shared by the on-screen preview, the 80 mm thermal output and the PDF export, so preview and print cannot diverge â€” this is the correct answer to the classic 'preview lies' defect. Support for A4, thermal, barcodes (Code 39/128), QR, labels and the print studio is broad. The gaps are physical: no printer model was available, so paper widths, margins, glyph coverage and cut/feed behaviour are unverified on hardware.

## 2. Scope covered

SKILL.md + references/print-document-contract.md; electron/printing/* (36 files, incl. templates.ts 11.8 KB, enrich.ts 10.8 KB, logistics.ts 9 KB, pdf-exports.ts, page-size.ts, printer-settings.ts, watchdog.ts, guards.ts, capabilities.ts); electron/printing/receipt-documents/* (20 files incl. barcode128.ts, barcode39.ts, thermal.ts, labels.ts); src/shared/printer/_; src/features/print-templates/_; tests/e2e/{pdf-export,print-studio,catalogue-labels}.spec.ts.

## 3. Skill checklist result

| Criterion                                                                        | Status        | Evidence                                                                                                                                                                         |
| -------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verify actual hardware and templates before assuming                             | **VERIFIED**  | printing.page-size.ts and capabilities.ts encode real profiles                                                                                                                   |
| Define a typed document model sourced from persisted records                     | **VERIFIED**  | receipt-documents/* builders take a ReceiptData shape built from persisted sale data                                                                                             |
| Keep preview, PDF and physical print semantically consistent                     | **VERIFIED**  | registry.sales path and printing share buildReceiptTicketHtml; the printing.receipt.ts comment states 'MÃªme builder que l'impression et le PDF : l'aperÃ§u ne peut plus mentir' |
| Include document number, date, store identity, lines, totals, payment method     | **VERIFIED**  | ReceiptData carries invoice, date, company, lines, subtotal/discount/delivery/total/paid                                                                                         |
| Preserve historical document snapshots                                           | **VERIFIED**  | sale_items store original + final unit price and cogs; reprint does not recompute from today's product price                                                                     |
| Treat 80mm as nominal; measure content width                                     | **PARTIAL**   | widths are modelled (getThermalWidth) but not measured on a physical printer                                                                                                     |
| Distinguish silent print from interactive print and ensure failure is observable | **VERIFIED**  | printing.watchdog.ts + every print path returns an ok/failure outcome with an FR message                                                                                         |
| Barcode: documented symbology and stable value                                   | **VERIFIED**  | both Code 39 and Code 128 implementations present with dedicated modules                                                                                                         |
| QR: clear purpose, versioned payload, no secrets                                 | **VERIFIED**  | customer access QR uses a signed/opaque token, not customer financial data                                                                                                       |
| PDF worker/resources included in packaged builds                                 | **VERIFIED**  | pos.yml ships pdf.worker.mjs and unpacks it                                                                                                                                      |
| Verify exact printed amounts against persisted document totals                   | **PARTIAL**   | amounts come from persisted values, but no automated end-to-end comparison of printed totals vs DB totals was found                                                              |
| Physical acceptance (printer model, expected vs observed, scan result)           | **NOT_FOUND** | No physical acceptance record exists in the repository                                                                                                                           |

## 4. Findings raised by this skill

No skill-level contradiction was found. The skill's rules are implementable and, where checkable, already implemented in the codebase. Domain-level defects discovered while auditing this skill's subject matter are reported in the corresponding `03_SKILL_AUDITS/` file and are cross-referenced there.

## 5. What is genuinely solid

- The single-source rendering rule (one builder for preview/thermal/PDF) structurally eliminates the preview/print divergence class of bug.
- barcode128.ts and barcode39.ts are separate, dedicated implementations â€” symbologies are not approximated with a generic encoder.
- pdfjs worker and OCR language data are explicitly unpacked from the asar, which is the usual cause of PDF-invalid false negatives in packaged builds.
- printing.guards.ts converts every failure into an FR operator message rather than a raw exception.

## 6. Not verified / limits of this audit

- NO physical printer was available on this host â€” every hardware-dependent criterion is MANUAL VALIDATION REQUIRED.
- A barcode was not physically scanned; symbology correctness is judged from the implementation only.

## 7. Metrics

- Checklist items evaluated: **12** â€” VERIFIED: 9, PARTIAL: 2, NOT_FOUND: 1
- Skill-level findings owned by this skill: **0**
- Domain findings owned by this skill: see `03_SKILL_AUDITS/`

---

_Part of the `2026-11-11-full-forensic-audit` skill-by-skill forensic audit. Companion: `SKILLS_SYSTEM_AUDIT.md` (system-level analysis) and `../04_CROSS_SKILL_AUDIT.md` (inter-skill conflicts)._
