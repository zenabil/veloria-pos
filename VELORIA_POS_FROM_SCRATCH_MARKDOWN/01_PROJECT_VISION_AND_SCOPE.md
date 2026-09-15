# 01 — Project Vision & Scope

## Product identity

**Name:** Veloria PoS  
**Database:** `veloria POS DB`  
**Locale:** French-first product UI  
**Currency:** DZD  
**Platform:** Windows desktop  
**Model:** Offline-first retail POS

## Core objective

Build a professional Windows desktop point-of-sale system that feels like a native commercial application: fast startup, instant navigation, reliable local persistence, keyboard-driven sales, resilient printing, safe backups, and deterministic financial behavior.

## In scope

### Sales

- Point of sale / checkout
- Product lookup and barcode lookup
- Cart management
- Custom sale items where business rules allow them
- Quantity and unit handling
- Discounts
- Delivery fees
- Customer selection
- Cash / cheque / transfer payment methods
- Full, partial, and unpaid sales
- Credit sales
- Invoice numbering
- Sale cancellation
- Sales history
- Sale details
- Receipt reprint
- Proforma creation and conversion
- Returns/refunds

### Products and stock

- Product CRUD
- Multiple barcodes per product
- Categories
- Units
- Purchase price / selling price
- Minimum stock level
- Expiration date
- Stock status
- Stock intake
- Damaged quantities
- Stock adjustments
- Stock movement ledger
- Product import
- Product history
- Label/barcode printing
- Inventory valuation

### Customers

- Customer CRUD
- Customer details
- Initial balance
- Credit limit
- Outstanding balance
- Debt status
- Payment history
- Customer statements
- Customer activity
- Customer import
- Customer-specific bread profile where enabled

### Suppliers

- Supplier CRUD
- Supplier balances
- Supplier payments
- Supplier activity
- Stock intake association

### Finance

- Customer payments
- Supplier payments
- Expenses
- Period performance
- Daily closing / Z report
- Sales analytics
- Inventory valuation
- Debt analytics
- Zakat calculation support

### Bread orders

- Bread order creation
- Customer association
- Pickup scheduling
- Payment state
- Pickup/delivery state
- Quantity changes
- Daily workflows
- Transfer to customer account when applicable
- Conversion into sales where business rules permit

### Data management

- Company profile
- Database location management
- Backup
- Restore
- Export/import workflows
- Integrity checks
- Diagnostic information
- Application logs

### Hardware

- Windows printers
- 80 mm thermal receipts
- A4 black-and-white invoices
- Barcode scanners through keyboard/HID patterns
- Cash drawer through supported printer pathway
- Scale integration through an adapter boundary

## Explicitly out of scope for this version

- Login/account creation
- Roles and permissions system
- tenantId / multi-tenant isolation
- mandatory cloud account
- mandatory Internet connection
- Firebase
- Google Sheets as a database
- Dexie/IndexedDB as a business-data store
- browser/PWA data as a business-data store
- cloud synchronization engine
- remote conflict-resolution subsystem
- customer/driver Android apps

Those can be future products, but they must not contaminate the architecture of this desktop release.

## Operational assumptions

- One Windows workstation is the primary local database host.
- The database is local and authoritative.
- Multiple processes must not write to the same SQLite database file simultaneously unless an explicit supported architecture is introduced later.
- The application must operate completely without Internet for core POS functions.
- Internet may be used only for optional future features, updates, or telemetry if explicitly designed later.
