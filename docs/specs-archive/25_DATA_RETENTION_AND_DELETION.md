# 25 — Data Retention & Deletion

## Principle

Commercial records are history, not disposable UI rows.

## Product/customer/supplier deletion

Use archive/soft-delete when historical references exist.

## Financial records

Do not physically delete:

- committed sales
- committed payments
- returns
- stock movements
- daily closings

Cancellation is represented as a business event.

## Purge

If a future purge feature is added, it must:

- be explicit
- produce a backup first
- require confirmation
- report exactly what will be removed
- preserve accounting/legal records according to local requirements
