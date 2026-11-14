---
name: veloria-hardware
description: "Integrate and diagnose Veloria-supported retail hardware such as barcode scanners, thermal printers, cash drawers, and optional scales with resilient connection handling and testable device adapters."
---

# Veloria Hardware — peripheral integration

## Mission

Make supported retail peripherals predictable, recoverable, and isolated behind adapters so device-specific behavior does not contaminate business logic.

## Discover supported devices

Inspect the operating system, actual hardware models, connection types (USB, serial, network, keyboard wedge, driver-managed), vendor protocols, permissions, and user workflows. Do not assume a printer/scanner model or a universal ESC/POS feature set.

## Adapter architecture

- Define a device capability interface separate from sales/inventory domain logic.
- Provide explicit discovery, connect, disconnect, status, operation, timeout, and error contracts.
- Normalize vendor-specific behavior in adapters.
- Prevent duplicate scan events and accidental double submissions.
- Keep device failures from corrupting committed business transactions.
- Make connection failures visible and actionable in French.
- Use bounded retries; do not retry a cash drawer open or print action blindly if the device may have received the command already.

## Barcode scanners

- Support keyboard-wedge behavior only with focus management and scan detection that avoids confusing normal typing with scans.
- Handle suffix/prefix configuration, rapid input, checksum/symbology constraints, unknown codes, and duplicate events.
- Do not silently create a product when a code is unknown unless the user confirms the intended workflow.

## Thermal printers and cash drawers

- Coordinate with `veloria-printing` for paper size, raster/text modes, barcodes, cut/feed, and physical validation.
- A cash drawer trigger must be tied to an authorized completed transaction or explicit cashier action, not arbitrary renderer input.
- Make the expected device and action visible before manual tests.

## Optional weighing scales

- Treat readings as untrusted sensor input. Validate unit, stability, range, zero/tare state, and freshness.
- Require explicit confirmation if a reading is invalid or unstable.
- Never silently convert measurement units or assume calibration.

## Tests and fallback

- Use mocked adapters for deterministic unit tests and real devices for acceptance tests.
- Test disconnect during operation, device busy, permission denied, invalid data, repeated scan, timeout, reconnect, and app restart.
- Provide a clear fallback path such as manual quantity entry where the business process permits.

## Reference

- `references/device-adapter-contract.md`
