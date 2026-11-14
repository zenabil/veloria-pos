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
      restart(): Promise<VeloriaOutcome>;
      diagnostics(): Promise<VeloriaOutcome>;
    };
    database: {
      health(): Promise<VeloriaOutcome>;
      location(): Promise<VeloriaOutcome>;
      integrity(): Promise<VeloriaOutcome>;
      optimize(): Promise<VeloriaOutcome>;
      relocate(p: unknown): Promise<VeloriaOutcome>;
      reset(p: unknown): Promise<VeloriaOutcome>;
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
      create(p: unknown): Promise<VeloriaOutcome>;
      update(p: unknown): Promise<VeloriaOutcome>;
      archive(p: unknown): Promise<VeloriaOutcome>;
      restore(p: unknown): Promise<VeloriaOutcome>;
      remove(p: unknown): Promise<VeloriaOutcome>;
      suppliers(p: unknown): Promise<VeloriaOutcome>;
      setSuppliers(p: unknown): Promise<VeloriaOutcome>;
      packagings: {
        list(p: unknown): Promise<VeloriaOutcome>;
        save(p: unknown): Promise<VeloriaOutcome>;
        remove(p: unknown): Promise<VeloriaOutcome>;
      };
    };
    customers: {
      search(p: unknown): Promise<VeloriaOutcome>;
      create(p: unknown): Promise<VeloriaOutcome>;
      import(p: unknown): Promise<VeloriaOutcome>;
      update(p: unknown): Promise<VeloriaOutcome>;
      archive(p: unknown): Promise<VeloriaOutcome>;
      restore(p: unknown): Promise<VeloriaOutcome>;
      recordPayment(p: unknown): Promise<VeloriaOutcome>;
      paymentReceipt(p: unknown): Promise<VeloriaOutcome>;
      statement(p: unknown): Promise<VeloriaOutcome>;
      stats(): Promise<VeloriaOutcome>;
      accessActivate(p: unknown): Promise<VeloriaOutcome>;
      accessRevoke(p: unknown): Promise<VeloriaOutcome>;
      accessStatus(p: unknown): Promise<VeloriaOutcome>;
      accessQrSvg(p: unknown): Promise<VeloriaOutcome>;
    };
    sync: {
      enqueue(p: unknown): Promise<VeloriaOutcome>;
      pushNow(p: unknown): Promise<VeloriaOutcome>;
      /** ADR-171 : publication de la liasse de supervision propriétaire. */
      pushOwnerSnapshot(p: unknown): Promise<VeloriaOutcome>;
      getConfig(): Promise<VeloriaOutcome>;
      saveConfig(p: unknown): Promise<VeloriaOutcome>;
      saveOwnerAccount(p: unknown): Promise<VeloriaOutcome>;
      /** ADR-182 : publication du catalogue client. */
      publishCatalog(p: unknown): Promise<VeloriaOutcome>;
      /** ADR-182 tranche E : usage de l'application client (30 jours). */
      getClientActivity(): Promise<VeloriaOutcome>;
    };
    /** ADR-182 : catalogue publié dans l'application client. */
    clientCatalog: {
      getSettings(): Promise<VeloriaOutcome>;
      preview(): Promise<VeloriaOutcome>;
      saveSettings(p: unknown): Promise<VeloriaOutcome>;
    };
    /** ADR-182 : commandes clients (réservation et retrait). */
    orders: {
      list(p: unknown): Promise<VeloriaOutcome>;
      get(p: unknown): Promise<VeloriaOutcome>;
      create(p: unknown): Promise<VeloriaOutcome>;
      setStatus(p: unknown): Promise<VeloriaOutcome>;
    };
    announcements: {
      save(p: unknown): Promise<VeloriaOutcome>;
      /** ADR-165 : liste complète des annonces (Paramètres). */
      list(): Promise<VeloriaOutcome>;
      remove(p: unknown): Promise<VeloriaOutcome>;
    };
    categories: { list(): Promise<VeloriaOutcome>; create(p: unknown): Promise<VeloriaOutcome> };
    settings: {
      get(p: unknown): Promise<VeloriaOutcome>;
      save(p: unknown): Promise<VeloriaOutcome>;
    };
    staff: {
      list(): Promise<VeloriaOutcome>;
      login(p: unknown): Promise<VeloriaOutcome>;
      logout(): Promise<VeloriaOutcome>;
      session(): Promise<VeloriaOutcome>;
      create(p: unknown): Promise<VeloriaOutcome>;
      setPermissions(p: unknown): Promise<VeloriaOutcome>;
      changeCode(p: unknown): Promise<VeloriaOutcome>;
      setActive(p: unknown): Promise<VeloriaOutcome>;
      recover(p: unknown): Promise<VeloriaOutcome>;
      regenRecovery(p: unknown): Promise<VeloriaOutcome>;
    };
    stock: {
      overview(): Promise<VeloriaOutcome>;
      products(p: unknown): Promise<VeloriaOutcome>;
      movements(p: unknown): Promise<VeloriaOutcome>;
      inventory(p: unknown): Promise<VeloriaOutcome>;
      adjust(p: unknown): Promise<VeloriaOutcome>;
      intake(p: unknown): Promise<VeloriaOutcome>;
      intakes(p: unknown): Promise<VeloriaOutcome>;
      intakeDetail(p: unknown): Promise<VeloriaOutcome>;
      intakeCancel(p: unknown): Promise<VeloriaOutcome>;
      /** STK-01 : diagnostic de réconciliation du stock (lecture seule). */
      reconcile(): Promise<VeloriaOutcome>;
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
      /** E-21 : réouverture d'une journée close (gérant). */
      reopen(p: unknown): Promise<VeloriaOutcome>;
    };
    /** Sessions de caisse (migration 0059) : poste, comptage, écart. */
    cash: {
      open(p: unknown): Promise<VeloriaOutcome>;
      count(p: unknown): Promise<VeloriaOutcome>;
      close(p: unknown): Promise<VeloriaOutcome>;
      current(): Promise<VeloriaOutcome>;
      list(p: unknown): Promise<VeloriaOutcome>;
    };
    zakat: {
      sources(): Promise<VeloriaOutcome>;
      saveParams(p: unknown): Promise<VeloriaOutcome>;
      history(p: unknown): Promise<VeloriaOutcome>;
      save(p: unknown): Promise<VeloriaOutcome>;
    };
    printer: {
      save(p: unknown): Promise<VeloriaOutcome>;
      test(): Promise<VeloriaOutcome>;
    };
    templates: {
      list(): Promise<VeloriaOutcome>;
      save(p: unknown): Promise<VeloriaOutcome>;
      activate(p: unknown): Promise<VeloriaOutcome>;
      remove(p: unknown): Promise<VeloriaOutcome>;
      reset(p: unknown): Promise<VeloriaOutcome>;
      preview(p: unknown): Promise<VeloriaOutcome>;
      testPrint(p: unknown): Promise<VeloriaOutcome>;
    };
    sales: {
      create(p: unknown): Promise<VeloriaOutcome>;
      get(p: unknown): Promise<VeloriaOutcome>;
      history(p: unknown): Promise<VeloriaOutcome>;
      cancel(p: unknown): Promise<VeloriaOutcome>;
      reopen(p: unknown): Promise<VeloriaOutcome>;
      setDueDate(p: unknown): Promise<VeloriaOutcome>;
    };
    carts: {
      save(p: unknown): Promise<VeloriaOutcome>;
      load(): Promise<VeloriaOutcome>;
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
      preview(p: unknown): Promise<VeloriaOutcome>;
      previewProforma(p: unknown): Promise<VeloriaOutcome>;
      printProformaA4(p: unknown): Promise<VeloriaOutcome>;
      exportProformaPdf(p: unknown): Promise<VeloriaOutcome>;
      previewReport(p: unknown): Promise<VeloriaOutcome>;
      printReport(p: unknown): Promise<VeloriaOutcome>;
      previewLabels(p: unknown): Promise<VeloriaOutcome>;
      printLabels(p: unknown): Promise<VeloriaOutcome>;
      exportLabelsPdf(p: unknown): Promise<VeloriaOutcome>;
      previewPayment(p: unknown): Promise<VeloriaOutcome>;
      printPayment(p: unknown): Promise<VeloriaOutcome>;
      exportPaymentPdf(p: unknown): Promise<VeloriaOutcome>;
      exportReportPdf(p: unknown): Promise<VeloriaOutcome>;
      exportReceiptPdf(p: unknown): Promise<VeloriaOutcome>;
      previewDelivery(p: unknown): Promise<VeloriaOutcome>;
      printDelivery(p: unknown): Promise<VeloriaOutcome>;
      previewReturnSlip(p: unknown): Promise<VeloriaOutcome>;
      printReturnSlip(p: unknown): Promise<VeloriaOutcome>;
      previewPO(p: unknown): Promise<VeloriaOutcome>;
      printPO(p: unknown): Promise<VeloriaOutcome>;
      // P12: alias unique conservé = printer.test (même canal printing.testPage).
    };
    backup: {
      create(): Promise<VeloriaOutcome>;
      list(): Promise<VeloriaOutcome>;
      restore(p: unknown): Promise<VeloriaOutcome>;
      status(): Promise<VeloriaOutcome>;
      export(p: unknown): Promise<VeloriaOutcome>;
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
