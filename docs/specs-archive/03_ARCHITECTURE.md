# 03 — Target Architecture

## Architectural style

Use a **modular monolith with Clean Architecture / Hexagonal boundaries** inside one Windows desktop executable package.

The architecture should optimize for simplicity, reliability, and testability rather than distributed-system complexity.

## High-level architecture

```text
┌───────────────────────────────────────────────┐
│                Renderer / UI                  │
│ React + TypeScript + feature components       │
└───────────────────────────┬───────────────────┘
                            │ typed UI API
┌───────────────────────────▼───────────────────┐
│            Application / Use Cases             │
│ Commands, queries, orchestration, DTOs         │
└───────────────────────────┬───────────────────┘
                            │ domain ports
┌───────────────────────────▼───────────────────┐
│                  Domain                        │
│ Entities, value objects, invariants, rules     │
└───────────────────────────┬───────────────────┘
                            │ ports/adapters
┌───────────────────────────▼───────────────────┐
│               Infrastructure                   │
│ SQLite repositories, files, printing, backup   │
└───────────────────────────┬───────────────────┘
                            │ native bridge
┌───────────────────────────▼───────────────────┐
│              Electron Main                    │
│ IPC, filesystem, printer, OS, lifecycle       │
└───────────────────────────┬───────────────────┘
                            │
┌───────────────────────────▼───────────────────┐
│             better-sqlite3 / SQLite            │
└───────────────────────────────────────────────┘
```

## Dependency rule

Dependencies point inward.

```text
presentation -> application -> domain
infrastructure -> application/domain ports
Electron -> infrastructure
```

Domain must not import:

- React
- Next.js
- Electron
- better-sqlite3
- browser APIs
- Node filesystem APIs
- Zustand
- Radix UI

## Module boundaries

### UI layer

Responsible for:

- rendering
- interaction
- local visual state
- form state
- accessibility
- user feedback

### Application layer

Responsible for:

- use cases
- transactions orchestration
- authorization of operations at the business capability level
- DTO mapping
- coordinating repositories and ports

### Domain layer

Responsible for:

- business invariants
- value objects
- money rules
- stock rules
- sale rules
- debt rules
- return rules
- deterministic calculations

### Infrastructure layer

Responsible for:

- repository implementation
- SQLite queries
- migrations
- backup engine
- printer adapters
- import/export adapters
- OCR adapter
- OS-specific integrations

### Electron layer

Responsible for:

- process lifecycle
- BrowserWindow
- preload
- IPC transport
- native printer discovery
- filesystem dialogs
- application paths
- single-instance behavior
- application recovery

## Commands and queries

Prefer CQRS-lite semantics, not a separate service architecture.

Commands mutate state:

- `CreateSale`
- `CancelSale`
- `RecordCustomerPayment`
- `ReceiveStock`
- `CreateReturn`
- `CreateExpense`

Queries read state:

- `SearchProducts`
- `GetCustomerStatement`
- `GetDashboard`
- `GetSalesHistory`
- `GetInventorySummary`

## Transaction boundary

The application/use-case layer declares transactional intent. The persistence adapter exposes an explicit unit-of-work/transaction port.

Example:

```text
Create Sale transaction
 ├─ validate cart
 ├─ reserve invoice number
 ├─ insert sale
 ├─ insert sale items
 ├─ insert payment(s)
 ├─ insert stock movements
 ├─ update product quantities
 ├─ update customer balance snapshot
 └─ commit
```

## Eventing

Use local in-process application events only for UI refreshes and decoupled side effects. Do not build a durable sync/event-bus subsystem unless a concrete requirement appears.

Events may include:

- `sale.created`
- `sale.cancelled`
- `payment.recorded`
- `stock.changed`
- `customer.balanceChanged`

Events are not the source of truth; SQLite remains the source of truth.
