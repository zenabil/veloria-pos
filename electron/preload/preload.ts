// Veloria PoS — Preload: minimal typed bridge (contextIsolation, no Node in renderer).
import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../ipc/channels";

type Channel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

async function invoke<T>(channel: Channel, payload?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, payload) as Promise<T>;
}

const api = {
  app: {
    getVersion: () => invoke(IPC_CHANNELS["app.getVersion"]),
    restart: () => invoke(IPC_CHANNELS["app.restart"]),
    diagnostics: () => invoke(IPC_CHANNELS["app.diagnostics"]),
  },
  database: {
    health: () => invoke(IPC_CHANNELS["database.health"]),
    location: () => invoke(IPC_CHANNELS["database.location"]),
    integrity: () => invoke(IPC_CHANNELS["database.integrity"]),
  },
  system: {
    openDataFolder: () => invoke(IPC_CHANNELS["system.openDataFolder"]),
    selectFolder: () => invoke(IPC_CHANNELS["system.selectFolder"]),
  },
  products: {
    search: (p: unknown) => invoke(IPC_CHANNELS["products.search"], p),
    getByBarcode: (p: unknown) => invoke(IPC_CHANNELS["products.getByBarcode"], p),
    get: (p: unknown) => invoke(IPC_CHANNELS["products.get"], p),
    create: (p: unknown) => invoke(IPC_CHANNELS["products.create"], p),
    update: (p: unknown) => invoke(IPC_CHANNELS["products.update"], p),
    archive: (p: unknown) => invoke(IPC_CHANNELS["products.archive"], p),
  },
  customers: {
    search: (p: unknown) => invoke(IPC_CHANNELS["customers.search"], p),
    get: (p: unknown) => invoke(IPC_CHANNELS["customers.get"], p),
    create: (p: unknown) => invoke(IPC_CHANNELS["customers.create"], p),
    update: (p: unknown) => invoke(IPC_CHANNELS["customers.update"], p),
    recordPayment: (p: unknown) => invoke(IPC_CHANNELS["customers.recordPayment"], p),
    statement: (p: unknown) => invoke(IPC_CHANNELS["customers.statement"], p),
    import: (p: unknown) => invoke(IPC_CHANNELS["customers.import"], p),
  },
  settings: {
    get: (p: unknown) => invoke(IPC_CHANNELS["settings.get"], p),
    save: (p: unknown) => invoke(IPC_CHANNELS["settings.save"], p),
  },
  stock: {
    overview: () => invoke(IPC_CHANNELS["stock.overview"]),
    lowStock: (p: unknown) => invoke(IPC_CHANNELS["stock.lowStock"], p),
    ledger: (p: unknown) => invoke(IPC_CHANNELS["stock.ledger"], p),
    adjust: (p: unknown) => invoke(IPC_CHANNELS["stock.adjust"], p),
    intake: (p: unknown) => invoke(IPC_CHANNELS["stock.intake"], p),
    intakes: (p: unknown) => invoke(IPC_CHANNELS["stock.intakes"], p),
    valuation: () => invoke(IPC_CHANNELS["stock.valuation"]),
  },
  suppliers: {
    search: (p: unknown) => invoke(IPC_CHANNELS["suppliers.search"], p),
    create: (p: unknown) => invoke(IPC_CHANNELS["suppliers.create"], p),
    pay: (p: unknown) => invoke(IPC_CHANNELS["suppliers.pay"], p),
    statement: (p: unknown) => invoke(IPC_CHANNELS["suppliers.statement"], p),
  },
  proformas: {
    create: (p: unknown) => invoke(IPC_CHANNELS["proformas.create"], p),
    list: (p: unknown) => invoke(IPC_CHANNELS["proformas.list"], p),
    status: (p: unknown) => invoke(IPC_CHANNELS["proformas.status"], p),
    convert: (p: unknown) => invoke(IPC_CHANNELS["proformas.convert"], p),
  },
  debts: {
    list: (p: unknown) => invoke(IPC_CHANNELS["debts.list"], p),
  },
  closings: {
    get: (p: unknown) => invoke(IPC_CHANNELS["closings.get"], p),
    create: (p: unknown) => invoke(IPC_CHANNELS["closings.create"], p),
  },
  zakat: {
    sources: () => invoke(IPC_CHANNELS["zakat.sources"]),
    saveParams: (p: unknown) => invoke(IPC_CHANNELS["zakat.saveParams"], p),
  },
  bread: {
    create: (p: unknown) => invoke(IPC_CHANNELS["bread.create"], p),
    list: (p: unknown) => invoke(IPC_CHANNELS["bread.list"], p),
    pay: (p: unknown) => invoke(IPC_CHANNELS["bread.pay"], p),
    pickup: (p: unknown) => invoke(IPC_CHANNELS["bread.pickup"], p),
    transfer: (p: unknown) => invoke(IPC_CHANNELS["bread.transfer"], p),
  },
  sales: {
    create: (p: unknown) => invoke(IPC_CHANNELS["sales.create"], p),
    get: (p: unknown) => invoke(IPC_CHANNELS["sales.get"], p),
    history: (p: unknown) => invoke(IPC_CHANNELS["sales.history"], p),
    cancel: (p: unknown) => invoke(IPC_CHANNELS["sales.cancel"], p),
  },
  returns: {
    create: (p: unknown) => invoke(IPC_CHANNELS["returns.create"], p),
    list: (p: unknown) => invoke(IPC_CHANNELS["returns.list"], p),
  },
  expenses: {
    create: (p: unknown) => invoke(IPC_CHANNELS["expenses.create"], p),
    list: (p: unknown) => invoke(IPC_CHANNELS["expenses.list"], p),
  },
  reports: {
    dashboard: () => invoke(IPC_CHANNELS["reports.dashboard"]),
    period: (p: unknown) => invoke(IPC_CHANNELS["reports.period"], p),
    full: (p: unknown) => invoke(IPC_CHANNELS["reports.full"], p),
  },
  productsExtra: {
    import: (p: unknown) => invoke(IPC_CHANNELS["products.import"], p),
  },
  company: {
    get: () => invoke(IPC_CHANNELS["company.get"]),
    update: (p: unknown) => invoke(IPC_CHANNELS["company.update"], p),
  },
  printing: {
    listPrinters: () => invoke(IPC_CHANNELS["printing.listPrinters"]),
    printReceipt: (p: unknown) => invoke(IPC_CHANNELS["printing.printReceipt"], p),
    printA4: (p: unknown) => invoke(IPC_CHANNELS["printing.printA4"], p),
  },
  backup: {
    create: () => invoke(IPC_CHANNELS["backup.create"]),
    list: () => invoke(IPC_CHANNELS["backup.list"]),
    restore: (p: unknown) => invoke(IPC_CHANNELS["backup.restore"], p),
  },
};

export type VeloriaApi = typeof api;

contextBridge.exposeInMainWorld("veloria", api);
