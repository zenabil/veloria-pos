/// <reference types="vite/client" />

interface VeloriaOutcome<T = unknown> {
  ok: boolean;
  data?: T;
  code?: string;
  message?: string;
}

interface Window {
  veloria?: {
    app: {
      getVersion(): Promise<VeloriaOutcome>;
      restart(): Promise<VeloriaOutcome>;
      diagnostics(): Promise<VeloriaOutcome>;
    };
    database: {
      health(): Promise<VeloriaOutcome>;
      location(): Promise<VeloriaOutcome>;
      integrity(): Promise<VeloriaOutcome>;
      optimize(): Promise<VeloriaOutcome>;
      relocate(p: unknown): Promise<VeloriaOutcome>;
    };
    system: {
      openDataFolder(): Promise<VeloriaOutcome>;
      selectFolder(): Promise<VeloriaOutcome>;
      selectLogo(): Promise<VeloriaOutcome>;
      openLogsFolder(): Promise<VeloriaOutcome>;
    };
    products: {
      search(p: unknown): Promise<VeloriaOutcome>;
      getByBarcode(p: unknown): Promise<VeloriaOutcome>;
      matchBatch(p: unknown): Promise<VeloriaOutcome>;
      barcodes(p: unknown): Promise<VeloriaOutcome>;
      get(p: unknown): Promise<VeloriaOutcome>;
      create(p: unknown): Promise<VeloriaOutcome>;
      update(p: unknown): Promise<VeloriaOutcome>;
      archive(p: unknown): Promise<VeloriaOutcome>;
      restore(p: unknown): Promise<VeloriaOutcome>;
      remove(p: unknown): Promise<VeloriaOutcome>;
      suppliers(p: unknown): Promise<VeloriaOutcome>;
      setSuppliers(p: unknown): Promise<VeloriaOutcome>;
    };
    customers: {
      search(p: unknown): Promise<VeloriaOutcome>;
      get(p: unknown): Promise<VeloriaOutcome>;
      create(p: unknown): Promise<VeloriaOutcome>;
      update(p: unknown): Promise<VeloriaOutcome>;
      archive(p: unknown): Promise<VeloriaOutcome>;
      restore(p: unknown): Promise<VeloriaOutcome>;
      recordPayment(p: unknown): Promise<VeloriaOutcome>;
      statement(p: unknown): Promise<VeloriaOutcome>;
      stats(): Promise<VeloriaOutcome>;
      import(p: unknown): Promise<VeloriaOutcome>;
    };
    categories: { list(): Promise<VeloriaOutcome>; create(p: unknown): Promise<VeloriaOutcome> };
    settings: {
      get(p: unknown): Promise<VeloriaOutcome>;
      save(p: unknown): Promise<VeloriaOutcome>;
    };
    stock: {
      overview(): Promise<VeloriaOutcome>;
      products(p: unknown): Promise<VeloriaOutcome>;
      movements(p: unknown): Promise<VeloriaOutcome>;
      inventory(p: unknown): Promise<VeloriaOutcome>;
      lowStock(p: unknown): Promise<VeloriaOutcome>;
      ledger(p: unknown): Promise<VeloriaOutcome>;
      adjust(p: unknown): Promise<VeloriaOutcome>;
      intake(p: unknown): Promise<VeloriaOutcome>;
      intakes(p: unknown): Promise<VeloriaOutcome>;
      valuation(): Promise<VeloriaOutcome>;
    };
    suppliers: {
      search(p: unknown): Promise<VeloriaOutcome>;
      create(p: unknown): Promise<VeloriaOutcome>;
      update(p: unknown): Promise<VeloriaOutcome>;
      remove(p: unknown): Promise<VeloriaOutcome>;
      removeMany(p: unknown): Promise<VeloriaOutcome>;
      pay(p: unknown): Promise<VeloriaOutcome>;
      statement(p: unknown): Promise<VeloriaOutcome>;
      stats(): Promise<VeloriaOutcome>;
      products(p: unknown): Promise<VeloriaOutcome>;
    };
    purchase: {
      create(p: unknown): Promise<VeloriaOutcome>;
      list(p: unknown): Promise<VeloriaOutcome>;
      detail(p: unknown): Promise<VeloriaOutcome>;
      order(p: unknown): Promise<VeloriaOutcome>;
      cancel(p: unknown): Promise<VeloriaOutcome>;
      receive(p: unknown): Promise<VeloriaOutcome>;
    };
    proformas: {
      create(p: unknown): Promise<VeloriaOutcome>;
      list(p: unknown): Promise<VeloriaOutcome>;
      status(p: unknown): Promise<VeloriaOutcome>;
      convert(p: unknown): Promise<VeloriaOutcome>;
      update(p: unknown): Promise<VeloriaOutcome>;
      remove(p: unknown): Promise<VeloriaOutcome>;
      detail(p: unknown): Promise<VeloriaOutcome>;
      stats(): Promise<VeloriaOutcome>;
    };
    debts: {
      list(p: unknown): Promise<VeloriaOutcome>;
      detail(p: unknown): Promise<VeloriaOutcome>;
      stats(): Promise<VeloriaOutcome>;
    };
    closings: {
      get(p: unknown): Promise<VeloriaOutcome>;
      create(p: unknown): Promise<VeloriaOutcome>;
    };
    zakat: {
      sources(): Promise<VeloriaOutcome>;
      saveParams(p: unknown): Promise<VeloriaOutcome>;
      history(p: unknown): Promise<VeloriaOutcome>;
      save(p: unknown): Promise<VeloriaOutcome>;
    };
    bread: {
      create(p: unknown): Promise<VeloriaOutcome>;
      list(p: unknown): Promise<VeloriaOutcome>;
      pay(p: unknown): Promise<VeloriaOutcome>;
      transfer(p: unknown): Promise<VeloriaOutcome>;
      updateQty(p: unknown): Promise<VeloriaOutcome>;
      convert(p: unknown): Promise<VeloriaOutcome>;
      update(p: unknown): Promise<VeloriaOutcome>;
      status(p: unknown): Promise<VeloriaOutcome>;
      stats(): Promise<VeloriaOutcome>;
      detail(p: unknown): Promise<VeloriaOutcome>;
    };
    printer: {
      get(): Promise<VeloriaOutcome>;
      save(p: unknown): Promise<VeloriaOutcome>;
      test(): Promise<VeloriaOutcome>;
    };
    sales: {
      create(p: unknown): Promise<VeloriaOutcome>;
      get(p: unknown): Promise<VeloriaOutcome>;
      history(p: unknown): Promise<VeloriaOutcome>;
      cancel(p: unknown): Promise<VeloriaOutcome>;
      setDueDate(p: unknown): Promise<VeloriaOutcome>;
    };
    carts: {
      save(p: unknown): Promise<VeloriaOutcome>;
      load(): Promise<VeloriaOutcome>;
      clear(): Promise<VeloriaOutcome>;
    };
    returns: {
      create(p: unknown): Promise<VeloriaOutcome>;
      list(p: unknown): Promise<VeloriaOutcome>;
      detail(p: unknown): Promise<VeloriaOutcome>;
      saleItems(p: unknown): Promise<VeloriaOutcome>;
      intakeItems(p: unknown): Promise<VeloriaOutcome>;
      refund(p: unknown): Promise<VeloriaOutcome>;
      cancel(p: unknown): Promise<VeloriaOutcome>;
      stats(): Promise<VeloriaOutcome>;
    };
    expenses: {
      create(p: unknown): Promise<VeloriaOutcome>;
      list(p: unknown): Promise<VeloriaOutcome>;
      update(p: unknown): Promise<VeloriaOutcome>;
      remove(p: unknown): Promise<VeloriaOutcome>;
      stats(): Promise<VeloriaOutcome>;
    };
    reports: {
      full(p: unknown): Promise<VeloriaOutcome>;
      summary(p: unknown): Promise<VeloriaOutcome>;
    };
    dashboard: {
      summary(p: unknown): Promise<VeloriaOutcome>;
    };
    history: {
      list(p: unknown): Promise<VeloriaOutcome>;
      detail(p: unknown): Promise<VeloriaOutcome>;
      stats(p?: unknown): Promise<VeloriaOutcome>;
    };
    productsExtra: { import(p: unknown): Promise<VeloriaOutcome> };
    company: { get(): Promise<VeloriaOutcome>; update(p: unknown): Promise<VeloriaOutcome> };
    printing: {
      listPrinters(): Promise<VeloriaOutcome>;
      printReceipt(p: unknown): Promise<VeloriaOutcome>;
      printA4(p: unknown): Promise<VeloriaOutcome>;
      preview(p: unknown): Promise<VeloriaOutcome>;
      previewProforma(p: unknown): Promise<VeloriaOutcome>;
      printProformaA4(p: unknown): Promise<VeloriaOutcome>;
      previewReport(p: unknown): Promise<VeloriaOutcome>;
      printReport(p: unknown): Promise<VeloriaOutcome>;
      previewLabels(p: unknown): Promise<VeloriaOutcome>;
      printLabels(p: unknown): Promise<VeloriaOutcome>;
      exportReceiptPdf(p: unknown): Promise<VeloriaOutcome>;
      exportA4Pdf(p: unknown): Promise<VeloriaOutcome>;
      // P12: alias unique conservé = printer.test (même canal printing.testPage).
    };
    backup: {
      create(): Promise<VeloriaOutcome>;
      list(): Promise<VeloriaOutcome>;
      restore(p: unknown): Promise<VeloriaOutcome>;
      status(): Promise<VeloriaOutcome>;
      export(p: unknown): Promise<VeloriaOutcome>;
      autoGet(): Promise<VeloriaOutcome>;
      autoSave(p: unknown): Promise<VeloriaOutcome>;
    };
    ocr: {
      selectFile(): Promise<VeloriaOutcome>;
      analyze(p: unknown): Promise<VeloriaOutcome>;
      cancel(p: unknown): Promise<VeloriaOutcome>;
      dispose(p: unknown): Promise<VeloriaOutcome>;
      onProgress(
        cb: (value: {
          fileId: string;
          phase: string;
          page: number;
          pages: number;
          progress: number;
        }) => void,
      ): () => void;
    };
    recovery: {
      retry(): Promise<VeloriaOutcome>;
      exit(): Promise<VeloriaOutcome>;
    };
    license: {
      status(): Promise<VeloriaOutcome>;
      hardwareId(): Promise<VeloriaOutcome>;
      importLicense(): Promise<VeloriaOutcome>;
      validate(): Promise<VeloriaOutcome>;
      info(): Promise<VeloriaOutcome>;
      permissions(): Promise<VeloriaOutcome>;
    };
    window: {
      minimize(): Promise<VeloriaOutcome>;
      toggleMaximize(): Promise<VeloriaOutcome>;
      close(): Promise<VeloriaOutcome>;
      isMaximized(): Promise<VeloriaOutcome<{ maximized: boolean }>>;
      onMaximizedChanged(cb: (value: { maximized: boolean }) => void): () => void;
    };
  };
}
