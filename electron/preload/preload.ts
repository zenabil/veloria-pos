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
    optimize: () => invoke(IPC_CHANNELS["database.optimize"]),
    relocate: (p: unknown) => invoke(IPC_CHANNELS["database.relocate"], p),
    reset: (p: unknown) => invoke(IPC_CHANNELS["database.reset"], p),
  },
  system: {
    openDataFolder: () => invoke(IPC_CHANNELS["system.openDataFolder"]),
    selectFolder: () => invoke(IPC_CHANNELS["system.selectFolder"]),
    selectLogo: () => invoke(IPC_CHANNELS["system.selectLogo"]),
    openLogsFolder: () => invoke(IPC_CHANNELS["system.openLogsFolder"]),
  },
  products: {
    search: (p: unknown) => invoke(IPC_CHANNELS["products.search"], p),
    getByBarcode: (p: unknown) => invoke(IPC_CHANNELS["products.getByBarcode"], p),
    matchBatch: (p: unknown) => invoke(IPC_CHANNELS["products.matchBatch"], p),
    barcodes: (p: unknown) => invoke(IPC_CHANNELS["products.barcodes"], p),
    get: (p: unknown) => invoke(IPC_CHANNELS["products.get"], p),
    create: (p: unknown) => invoke(IPC_CHANNELS["products.create"], p),
    update: (p: unknown) => invoke(IPC_CHANNELS["products.update"], p),
    archive: (p: unknown) => invoke(IPC_CHANNELS["products.archive"], p),
    restore: (p: unknown) => invoke(IPC_CHANNELS["products.restore"], p),
    remove: (p: unknown) => invoke(IPC_CHANNELS["products.delete"], p),
    suppliers: (p: unknown) => invoke(IPC_CHANNELS["products.suppliers"], p),
    setSuppliers: (p: unknown) => invoke(IPC_CHANNELS["products.setSuppliers"], p),
  },
  customers: {
    search: (p: unknown) => invoke(IPC_CHANNELS["customers.search"], p),
    create: (p: unknown) => invoke(IPC_CHANNELS["customers.create"], p),
    update: (p: unknown) => invoke(IPC_CHANNELS["customers.update"], p),
    archive: (p: unknown) => invoke(IPC_CHANNELS["customers.archive"], p),
    restore: (p: unknown) => invoke(IPC_CHANNELS["customers.restore"], p),
    recordPayment: (p: unknown) => invoke(IPC_CHANNELS["customers.recordPayment"], p),
    paymentReceipt: (p: unknown) => invoke(IPC_CHANNELS["customers.paymentReceipt"], p),
    statement: (p: unknown) => invoke(IPC_CHANNELS["customers.statement"], p),
    stats: () => invoke(IPC_CHANNELS["customers.stats"]),
    import: (p: unknown) => invoke(IPC_CHANNELS["customers.import"], p),
    accessActivate: (p: unknown) => invoke(IPC_CHANNELS["customers.accessActivate"], p),
    accessRevoke: (p: unknown) => invoke(IPC_CHANNELS["customers.accessRevoke"], p),
    accessStatus: (p: unknown) => invoke(IPC_CHANNELS["customers.accessStatus"], p),
    accessQrSvg: (p: unknown) => invoke(IPC_CHANNELS["customers.accessQrSvg"], p),
  },
  sync: {
    enqueue: (p: unknown) => invoke(IPC_CHANNELS["sync.enqueue"], p),
    markSent: (p: unknown) => invoke(IPC_CHANNELS["sync.markSent"], p),
    pending: (p: unknown) => invoke(IPC_CHANNELS["sync.pending"], p),
    pushNow: (p: unknown) => invoke(IPC_CHANNELS["sync.pushNow"], p),
    getConfig: () => invoke(IPC_CHANNELS["sync.getConfig"]),
    saveConfig: (p: unknown) => invoke(IPC_CHANNELS["sync.saveConfig"], p),
  },
  announcements: {
    save: (p: unknown) => invoke(IPC_CHANNELS["announcements.save"], p),
  },
  categories: {
    list: () => invoke(IPC_CHANNELS["categories.list"]),
    create: (p: unknown) => invoke(IPC_CHANNELS["categories.create"], p),
  },
  settings: {
    get: (p: unknown) => invoke(IPC_CHANNELS["settings.get"], p),
    save: (p: unknown) => invoke(IPC_CHANNELS["settings.save"], p),
  },
  stock: {
    overview: () => invoke(IPC_CHANNELS["stock.overview"]),
    products: (p: unknown) => invoke(IPC_CHANNELS["stock.products"], p),
    movements: (p: unknown) => invoke(IPC_CHANNELS["stock.movements"], p),
    inventory: (p: unknown) => invoke(IPC_CHANNELS["stock.inventory"], p),
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
    update: (p: unknown) => invoke(IPC_CHANNELS["suppliers.update"], p),
    remove: (p: unknown) => invoke(IPC_CHANNELS["suppliers.delete"], p),
    removeMany: (p: unknown) => invoke(IPC_CHANNELS["suppliers.deleteMany"], p),
    pay: (p: unknown) => invoke(IPC_CHANNELS["suppliers.pay"], p),
    statement: (p: unknown) => invoke(IPC_CHANNELS["suppliers.statement"], p),
    stats: () => invoke(IPC_CHANNELS["suppliers.stats"]),
    products: (p: unknown) => invoke(IPC_CHANNELS["suppliers.products"], p),
  },
  purchase: {
    create: (p: unknown) => invoke(IPC_CHANNELS["purchase.create"], p),
    list: (p: unknown) => invoke(IPC_CHANNELS["purchase.list"], p),
    detail: (p: unknown) => invoke(IPC_CHANNELS["purchase.detail"], p),
    order: (p: unknown) => invoke(IPC_CHANNELS["purchase.order"], p),
    cancel: (p: unknown) => invoke(IPC_CHANNELS["purchase.cancel"], p),
    receive: (p: unknown) => invoke(IPC_CHANNELS["purchase.receive"], p),
  },
  proformas: {
    create: (p: unknown) => invoke(IPC_CHANNELS["proformas.create"], p),
    list: (p: unknown) => invoke(IPC_CHANNELS["proformas.list"], p),
    status: (p: unknown) => invoke(IPC_CHANNELS["proformas.status"], p),
    convert: (p: unknown) => invoke(IPC_CHANNELS["proformas.convert"], p),
    update: (p: unknown) => invoke(IPC_CHANNELS["proformas.update"], p),
    remove: (p: unknown) => invoke(IPC_CHANNELS["proformas.delete"], p),
    detail: (p: unknown) => invoke(IPC_CHANNELS["proformas.detail"], p),
    stats: () => invoke(IPC_CHANNELS["proformas.stats"]),
  },
  debts: {
    list: (p: unknown) => invoke(IPC_CHANNELS["debts.list"], p),
    detail: (p: unknown) => invoke(IPC_CHANNELS["debts.detail"], p),
    stats: () => invoke(IPC_CHANNELS["debts.stats"]),
  },
  closings: {
    get: (p: unknown) => invoke(IPC_CHANNELS["closings.get"], p),
    create: (p: unknown) => invoke(IPC_CHANNELS["closings.create"], p),
  },
  zakat: {
    sources: () => invoke(IPC_CHANNELS["zakat.sources"]),
    saveParams: (p: unknown) => invoke(IPC_CHANNELS["zakat.saveParams"], p),
    history: (p: unknown) => invoke(IPC_CHANNELS["zakat.history"], p),
    save: (p: unknown) => invoke(IPC_CHANNELS["zakat.save"], p),
  },
  bread: {
    create: (p: unknown) => invoke(IPC_CHANNELS["bread.create"], p),
    list: (p: unknown) => invoke(IPC_CHANNELS["bread.list"], p),
    pay: (p: unknown) => invoke(IPC_CHANNELS["bread.pay"], p),
    transfer: (p: unknown) => invoke(IPC_CHANNELS["bread.transfer"], p),
    updateQty: (p: unknown) => invoke(IPC_CHANNELS["bread.updateQty"], p),
    convert: (p: unknown) => invoke(IPC_CHANNELS["bread.convert"], p),
    update: (p: unknown) => invoke(IPC_CHANNELS["bread.update"], p),
    status: (p: unknown) => invoke(IPC_CHANNELS["bread.status"], p),
    stats: () => invoke(IPC_CHANNELS["bread.stats"]),
    detail: (p: unknown) => invoke(IPC_CHANNELS["bread.detail"], p),
  },
  printer: {
    get: () => invoke(IPC_CHANNELS["printer.get"]),
    save: (p: unknown) => invoke(IPC_CHANNELS["printer.save"], p),
    test: () => invoke(IPC_CHANNELS["printing.testPage"]),
  },
  templates: {
    list: () => invoke(IPC_CHANNELS["templates.list"]),
    get: (p: unknown) => invoke(IPC_CHANNELS["templates.get"], p),
    save: (p: unknown) => invoke(IPC_CHANNELS["templates.save"], p),
    activate: (p: unknown) => invoke(IPC_CHANNELS["templates.activate"], p),
    remove: (p: unknown) => invoke(IPC_CHANNELS["templates.remove"], p),
    reset: (p: unknown) => invoke(IPC_CHANNELS["templates.reset"], p),
    preview: (p: unknown) => invoke(IPC_CHANNELS["templates.preview"], p),
    testPrint: (p: unknown) => invoke(IPC_CHANNELS["templates.testPrint"], p),
  },
  sales: {
    create: (p: unknown) => invoke(IPC_CHANNELS["sales.create"], p),
    get: (p: unknown) => invoke(IPC_CHANNELS["sales.get"], p),
    history: (p: unknown) => invoke(IPC_CHANNELS["sales.history"], p),
    cancel: (p: unknown) => invoke(IPC_CHANNELS["sales.cancel"], p),
    setDueDate: (p: unknown) => invoke(IPC_CHANNELS["sales.setDueDate"], p),
  },
  carts: {
    save: (p: unknown) => invoke(IPC_CHANNELS["carts.save"], p),
    load: () => invoke(IPC_CHANNELS["carts.load"]),
    // A1-P0 : operationId transmis (retry/double-clic idempotent, Zod l'accepte).
    clear: (p?: unknown) => invoke(IPC_CHANNELS["carts.clear"], p ?? {}),
  },
  returns: {
    create: (p: unknown) => invoke(IPC_CHANNELS["returns.create"], p),
    list: (p: unknown) => invoke(IPC_CHANNELS["returns.list"], p),
    detail: (p: unknown) => invoke(IPC_CHANNELS["returns.detail"], p),
    saleItems: (p: unknown) => invoke(IPC_CHANNELS["returns.saleItems"], p),
    intakeItems: (p: unknown) => invoke(IPC_CHANNELS["returns.intakeItems"], p),
    refund: (p: unknown) => invoke(IPC_CHANNELS["returns.refund"], p),
    cancel: (p: unknown) => invoke(IPC_CHANNELS["returns.cancel"], p),
    stats: () => invoke(IPC_CHANNELS["returns.stats"]),
  },
  expenses: {
    create: (p: unknown) => invoke(IPC_CHANNELS["expenses.create"], p),
    list: (p: unknown) => invoke(IPC_CHANNELS["expenses.list"], p),
    update: (p: unknown) => invoke(IPC_CHANNELS["expenses.update"], p),
    remove: (p: unknown) => invoke(IPC_CHANNELS["expenses.delete"], p),
    stats: () => invoke(IPC_CHANNELS["expenses.stats"]),
  },
  reports: {
    full: (p: unknown) => invoke(IPC_CHANNELS["reports.full"], p),
    summary: (p: unknown) => invoke(IPC_CHANNELS["reports.summary"], p),
  },
  dashboard: {
    summary: (p: unknown) => invoke(IPC_CHANNELS["dashboard.summary"], p),
  },
  history: {
    list: (p: unknown) => invoke(IPC_CHANNELS["history.list"], p),
    detail: (p: unknown) => invoke(IPC_CHANNELS["history.detail"], p),
    stats: (p?: unknown) => invoke(IPC_CHANNELS["history.stats"], p),
  },
  // Namespace bridge ≠ canal wire (ADR-074) : `productsExtra.import`
  // invoque le canal canonique `products.import` — alias gelé, ne pas renommer.
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
    preview: (p: unknown) => invoke(IPC_CHANNELS["printing.preview"], p),
    previewPayment: (p: unknown) => invoke(IPC_CHANNELS["printing.previewPayment"], p),
    printPayment: (p: unknown) => invoke(IPC_CHANNELS["printing.printPayment"], p),
    previewProforma: (p: unknown) => invoke(IPC_CHANNELS["printing.previewProforma"], p),
    printProformaA4: (p: unknown) => invoke(IPC_CHANNELS["printing.printProformaA4"], p),
    printProforma80mm: (p: unknown) => invoke(IPC_CHANNELS["printing.printProforma80mm"], p),
    exportProformaPdf: (p: unknown) => invoke(IPC_CHANNELS["printing.exportProformaPdf"], p),
    exportPaymentPdf: (p: unknown) => invoke(IPC_CHANNELS["printing.exportPaymentPdf"], p),
    exportReportPdf: (p: unknown) => invoke(IPC_CHANNELS["printing.exportReportPdf"], p),
    exportLabelsPdf: (p: unknown) => invoke(IPC_CHANNELS["printing.exportLabelsPdf"], p),
    previewReport: (p: unknown) => invoke(IPC_CHANNELS["printing.previewReport"], p),
    printReport: (p: unknown) => invoke(IPC_CHANNELS["printing.printReport"], p),
    previewLabels: (p: unknown) => invoke(IPC_CHANNELS["printing.previewLabels"], p),
    printLabels: (p: unknown) => invoke(IPC_CHANNELS["printing.printLabels"], p),
    exportReceiptPdf: (p: unknown) => invoke(IPC_CHANNELS["printing.exportReceiptPdf"], p),
    exportA4Pdf: (p: unknown) => invoke(IPC_CHANNELS["printing.exportA4Pdf"], p),
    previewDelivery: (p: unknown) => invoke(IPC_CHANNELS["printing.previewDelivery"], p),
    printDelivery: (p: unknown) => invoke(IPC_CHANNELS["printing.printDelivery"], p),
    previewReturnSlip: (p: unknown) => invoke(IPC_CHANNELS["printing.previewReturnSlip"], p),
    printReturnSlip: (p: unknown) => invoke(IPC_CHANNELS["printing.printReturnSlip"], p),
    previewPO: (p: unknown) => invoke(IPC_CHANNELS["printing.previewPO"], p),
    printPO: (p: unknown) => invoke(IPC_CHANNELS["printing.printPO"], p),
    // P12: alias unique conservé = printer.test (même canal printing.testPage).
  },
  backup: {
    create: () => invoke(IPC_CHANNELS["backup.create"]),
    list: () => invoke(IPC_CHANNELS["backup.list"]),
    restore: (p: unknown) => invoke(IPC_CHANNELS["backup.restore"], p),
    status: () => invoke(IPC_CHANNELS["backup.status"]),
    export: (p: unknown) => invoke(IPC_CHANNELS["backup.export"], p),
    autoGet: () => invoke(IPC_CHANNELS["backup.autoGet"]),
    autoSave: (p: unknown) => invoke(IPC_CHANNELS["backup.autoSave"], p),
  },
  ocr: {
    selectFile: () => invoke(IPC_CHANNELS["ocr.selectFile"]),
    analyze: (p: unknown) => invoke(IPC_CHANNELS["ocr.analyze"], p),
    cancel: (p: unknown) => invoke(IPC_CHANNELS["ocr.cancel"], p),
    dispose: (p: unknown) => invoke(IPC_CHANNELS["ocr.dispose"], p),
    onProgress: (
      cb: (value: {
        fileId: string;
        phase: string;
        page: number;
        pages: number;
        progress: number;
      }) => void,
    ) => {
      const listener = (_event: unknown, value: unknown): void => {
        const v = (value ?? {}) as {
          fileId?: unknown;
          phase?: unknown;
          page?: unknown;
          pages?: unknown;
          progress?: unknown;
        };
        cb({
          fileId: typeof v.fileId === "string" ? v.fileId : "",
          phase: typeof v.phase === "string" ? v.phase : "",
          page: typeof v.page === "number" ? v.page : 0,
          pages: typeof v.pages === "number" ? v.pages : 1,
          progress: typeof v.progress === "number" ? v.progress : 0,
        });
      };
      ipcRenderer.on(IPC_CHANNELS["ocr.progress"], listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS["ocr.progress"], listener);
      };
    },
  },
  recovery: {
    retry: () => invoke(IPC_CHANNELS["recovery.retry"]),
    exit: () => invoke(IPC_CHANNELS["recovery.exit"]),
  },
  license: {
    status: () => invoke(IPC_CHANNELS["license.getStatus"]),
    hardwareId: () => invoke(IPC_CHANNELS["license.getHardwareId"]),
    importLicense: () => invoke(IPC_CHANNELS["license.importLicense"]),
    validate: () => invoke(IPC_CHANNELS["license.validate"]),
    info: () => invoke(IPC_CHANNELS["license.getInfo"]),
    permissions: () => invoke(IPC_CHANNELS["license.getPermissions"]),
  },
  window: {
    minimize: () => invoke(IPC_CHANNELS["window.minimize"]),
    toggleMaximize: () => invoke(IPC_CHANNELS["window.toggleMaximize"]),
    close: () => invoke(IPC_CHANNELS["window.close"]),
    isMaximized: () => invoke(IPC_CHANNELS["window.isMaximized"]),
    onMaximizedChanged: (cb: (value: { maximized: boolean }) => void) => {
      const listener = (_event: unknown, value: { maximized: boolean } | undefined): void => {
        cb({ maximized: value?.maximized ?? false });
      };
      ipcRenderer.on(IPC_CHANNELS["window.maximizedChanged"], listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS["window.maximizedChanged"], listener);
      };
    },
  },
};

contextBridge.exposeInMainWorld("veloria", api);
