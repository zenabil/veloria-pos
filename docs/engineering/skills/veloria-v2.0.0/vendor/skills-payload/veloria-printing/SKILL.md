---
name: veloria-printing
description: "Implement and validate Veloria receipt, invoice, proforma, PDF, thermal 80mm, barcode, QR, label, and print-preview workflows with consistent data, layout, and hardware behavior."
---

# Veloria Printing — receipts, invoices, barcode, and QR

## Mission

Make printed documents accurate, readable, consistent, and reliable across preview, PDF, A4, and thermal printers.

## Verify actual hardware and templates

Inspect the current print pipeline, browser/PDF engine, ESC/POS library, supported printer models, driver settings, page sizes, barcode symbologies, QR payload contract, and existing templates. Do not assume every device supports every command.

## Single document contract

- Define a typed document model for receipt/invoice/proforma data.
- Source all amounts and customer/product details from trusted persisted records or approved snapshots.
- Keep preview, PDF, and physical print outputs semantically consistent. Reuse a shared renderer/template where it is reliable; do not force identical layout engines if thermal and A4 require distinct implementations.
- Include document number, date/time, institution/store identity, line descriptions, quantities, unit prices, line totals, subtotal, discount, taxes/fees when applicable, paid amount, balance, payment method, and legally required fields only when supported by the approved business rules.
- Preserve historical document snapshots. Reprinting an old invoice must not use current prices or customer details unless an explicitly labeled updated copy is requested.

## Thermal 80mm

- Treat 80mm as a nominal paper width; usable printable width depends on printer model, driver, margins, and dot density.
- Measure content width, wrapping, font size, logo scaling, barcode width, and feed/cut behavior against the real printer.
- Keep essential totals readable and prevent clipping at both ends.
- Test Arabic/French glyph support only if the approved document requires Arabic; current POS UI direction is French-only.
- Distinguish silent print from interactive print and ensure failure is observable.

## A4 and PDF

- Use correct physical units and page dimensions.
- Test page breaks, repeated table headers, orphan/widow lines, long descriptions, multipage invoices, grayscale/black-and-white output, and font embedding.
- Ensure PDF worker/resources are included in packaged builds.

## Barcode and QR

- Barcode identifies the intended product/document using a documented symbology and stable value. Verify scanner compatibility and checksum rules where applicable.
- QR must have a clear purpose. Use it for a compact, versioned payload or a safe public verification URL only when an approved service exists. Never encode secrets, full customer financial records, or privileged activation credentials in a QR code.
- Validate payload size, encoding, error correction, scan behavior, and privacy impact.
- A QR code is not a substitute for a barcode if the workflow needs fast product scanning.

## Verification

- Snapshot tests for templates plus physical print tests on supported hardware.
- Test long names, large totals, negative adjustments, empty optional fields, accented characters, page boundaries, and paper-width variation.
- Test unavailable printer, offline printer, paper-out, wrong printer, timeout, cancellation, and silent-print failure.
- Verify exact printed amounts against persisted document totals.

## Reference

- `references/print-document-contract.md`
