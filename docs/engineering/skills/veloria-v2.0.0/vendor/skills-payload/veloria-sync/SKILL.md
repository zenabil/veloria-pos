---
name: veloria-sync
description: "Design and maintain Veloria's offline-first synchronization boundary, especially the approved Google Sheets V1 customer-data bridge, outbox retries, idempotency, access isolation, conflict policy, and data minimization."
---

# Veloria Sync — offline-first bridge and customer data exchange

## Mission

Connect the local POS to approved companion services without making the POS dependent on the network. The local SQLite store remains authoritative for core POS transactions.

## Approved product direction

The current product decision is:

- Veloria POS remains Offline-First. Sales, local customer records, stock, reports, and core operations must continue when internet is unavailable.
- Google Sheets is the approved intermediary for the first customer-app bridge, not a replacement for local SQLite and not the canonical database for POS operations.
- The customer app is an extension that may display a customer's invoices, debt/balance, and payments. It is not part of the POS core's online dependency.
- The exact trusted access layer between the customer app and the Sheets data must be verified or designed. Do not expose spreadsheet credentials, service-account secrets, or unrestricted sheet access in a mobile app or renderer.

## Mandatory architecture questions

Before implementation, verify:

1. Which POS records are eligible for export and which exact fields are necessary?
2. How is a customer authenticated and authorized to see only their own records?
3. What trusted server-side component reads/writes Sheets on behalf of the app?
4. How are spreadsheet credentials stored and rotated?
5. What happens when the POS is offline, a customer record changes, or export fails?
6. What is the deletion/revocation/retention behavior?
7. Does the customer app need read-only access or can it submit a request/payment action?

If per-customer isolation cannot be guaranteed by the actual access layer, do not ship the feature. A spreadsheet by itself is not a per-customer authorization boundary.

## Offline-first rules

- Never block POS checkout, stock operations, or core data access on a cloud call.
- Write local business transactions first. Queue eligible outbound projections through a durable outbox.
- Use stable operation IDs and idempotent updates. Retries must not duplicate invoices, payments, balances, or notifications.
- Separate local transaction commit from remote delivery status.
- Define bounded retry/backoff and a visible diagnostic status without exposing raw secrets.
- Do not apply remote customer-app data directly to canonical local financial records unless a separate approved inbound workflow explicitly requires it.

## Data minimization and privacy

- Export only fields necessary for the customer experience.
- Never publish a whole customer table or shared sheet to every customer.
- Avoid including internal cost, margin, supplier, employee, private notes, or other customers' information.
- Do not place service credentials, API keys, refresh tokens, or shared admin links in the mobile app, renderer, QR code, or customer-visible payload.
- Use opaque stable identifiers rather than sequential database IDs where practical.
- Log operation IDs and outcomes, not secrets or unnecessary personal data.

## Outbox and failure taxonomy

Classify failures as transient (network/timeouts/rate limits/server errors), authentication/configuration, row-level validation, schema/table mismatch, and permanent business rejection. Retry only transient failures. A table/schema configuration failure must not mark every row as permanently invalid. Quarantine a single malformed row without blocking unrelated queued rows.

## Conflict policy

Document ownership per field. POS-owned financial and invoice fields are outbound projections. Do not allow the customer app or Sheets to overwrite the POS-owned source of truth. Resolve duplicate customer phone/access cases explicitly. Preserve a traceable history of access revocation and reactivation.

## Security and test requirements

- Test customer A cannot read customer B's data, including guessed IDs and altered request parameters.
- Test missing/expired/revoked access.
- Test Sheets outage, rate limit, schema change, malformed row, partial batch, retry, and duplicate delivery.
- Verify no credentials appear in renderer/mobile bundle/logs.
- Test POS checkout while fully offline and while a large outbox backlog exists.
- Verify deletion/revocation behavior across cached customer app data.

## Reference

- `references/google-sheets-bridge.md`
