// Veloria PoS — IPC channel names (typed, scoped, explicit).
// No generic "run-sql" / "execute-anything" channel exists by design.

export const IPC_CHANNELS = {
  // app
  "app.getVersion": "app.getVersion",
  "app.restart": "app.restart",
  "app.diagnostics": "app.diagnostics",
  // system / data folder
  "system.openDataFolder": "system.openDataFolder",
  "system.selectFolder": "system.selectFolder",
  // database
  "database.health": "database.health",
  "database.location": "database.location",
  "database.relocate": "database.relocate",
  "database.integrity": "database.integrity",
  // products
  "products.search": "products.search",
  "products.getByBarcode": "products.getByBarcode",
  "products.get": "products.get",
  "products.create": "products.create",
  "products.update": "products.update",
  "products.archive": "products.archive",
  "products.import": "products.import",
  // customers
  "customers.search": "customers.search",
  "customers.get": "customers.get",
  "customers.create": "customers.create",
  "customers.update": "customers.update",
  "customers.recordPayment": "customers.recordPayment",
  "customers.statement": "customers.statement",
  "customers.import": "customers.import",
  // stock (Phase 6)
  "stock.overview": "stock.overview",
  "stock.lowStock": "stock.lowStock",
  "stock.ledger": "stock.ledger",
  "stock.adjust": "stock.adjust",
  "stock.intake": "stock.intake",
  "stock.intakes": "stock.intakes",
  "stock.valuation": "stock.valuation",
  // suppliers (Phase 6)
  "suppliers.search": "suppliers.search",
  "suppliers.create": "suppliers.create",
  "suppliers.pay": "suppliers.pay",
  "suppliers.statement": "suppliers.statement",
  // proformas (Phase 7)
  "proformas.create": "proformas.create",
  "proformas.list": "proformas.list",
  "proformas.status": "proformas.status",
  "proformas.convert": "proformas.convert",
  // finance (Phase 8)
  "debts.list": "debts.list",
  "reports.full": "reports.full",
  "closings.get": "closings.get",
  "closings.create": "closings.create",
  "zakat.sources": "zakat.sources",
  "zakat.saveParams": "zakat.saveParams",
  // bread (Phase 9)
  "bread.create": "bread.create",
  "bread.list": "bread.list",
  "bread.pay": "bread.pay",
  "bread.pickup": "bread.pickup",
  "bread.transfer": "bread.transfer",
  // settings (clés explicites uniquement)
  "settings.get": "settings.get",
  "settings.save": "settings.save",
  // sales
  "sales.create": "sales.create",
  "sales.get": "sales.get",
  "sales.history": "sales.history",
  "sales.cancel": "sales.cancel",
  // returns
  "returns.create": "returns.create",
  "returns.list": "returns.list",
  // expenses
  "expenses.create": "expenses.create",
  "expenses.list": "expenses.list",
  // dashboard / reports
  "reports.dashboard": "reports.dashboard",
  "reports.period": "reports.period",
  // company
  "company.get": "company.get",
  "company.update": "company.update",
  // printing
  "printing.listPrinters": "printing.listPrinters",
  "printing.printReceipt": "printing.printReceipt",
  "printing.printA4": "printing.printA4",
  // backup
  "backup.create": "backup.create",
  "backup.list": "backup.list",
  "backup.restore": "backup.restore",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
