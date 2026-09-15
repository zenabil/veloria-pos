# 12 — Printing & Hardware

## Printing architecture

Use a provider/adapter model:

```text
Application
  -> Printing Port
     -> Windows Printer Adapter
     -> Thermal Printer Adapter
     -> PDF/Preview Adapter (development/testing only)
```

## 80 mm receipt

Required content:

- company information
- invoice number
- date/time
- `Ticket de caisse`
- product
- quantity
- unit price
- line total
- subtotal
- discount
- delivery fee when applicable
- total amount
- amount paid
- previous customer balance when applicable
- current balance
- thank-you message

Receipt generation must be deterministic and testable without a physical printer.

## A4 invoice

- black and white
- professional typography
- correct margins
- stable pagination
- company identifiers
- customer details
- invoice metadata
- line items
- totals
- payment/balance information

## Silent printing

Silent print APIs are main-process only. The renderer requests a named application command and the main process resolves the target printer.

## Printer discovery

Provide:

- list printers
- default printer
- test print
- select configured printer
- clear printer selection

Printer failure must not crash the application.

## Barcode scanners

Treat typical USB HID scanners as keyboard input first. The sales field must tolerate rapid keystrokes and terminator keys.

## Cash drawer

Provide a hardware port. The default implementation should use the supported printer/cash-drawer command pathway. Never allow arbitrary serial/system commands from the renderer.

## Scale

Create a `ScaleAdapter` interface so supported Windows/USB/network scales can be added later without changing POS domain logic.

## Test strategy

Hardware adapter tests must use contract fakes, while physical validation is documented separately in a hardware test procedure.
