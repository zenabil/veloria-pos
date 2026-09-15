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
    };
    system: { openDataFolder(): Promise<VeloriaOutcome>; selectFolder(): Promise<VeloriaOutcome> };
    products: {
      search(p: unknown): Promise<VeloriaOutcome>;
      getByBarcode(p: unknown): Promise<VeloriaOutcome>;
      get(p: unknown): Promise<VeloriaOutcome>;
      create(p: unknown): Promise<VeloriaOutcome>;
      update(p: unknown): Promise<VeloriaOutcome>;
      archive(p: unknown): Promise<VeloriaOutcome>;
    };
    customers: {
      search(p: unknown): Promise<VeloriaOutcome>;
      get(p: unknown): Promise<VeloriaOutcome>;
      create(p: unknown): Promise<VeloriaOutcome>;
      update(p: unknown): Promise<VeloriaOutcome>;
      recordPayment(p: unknown): Promise<VeloriaOutcome>;
      statement(p: unknown): Promise<VeloriaOutcome>;
      import(p: unknown): Promise<VeloriaOutcome>;
    };
    settings: {
      get(p: unknown): Promise<VeloriaOutcome>;
      save(p: unknown): Promise<VeloriaOutcome>;
    };
    stock: {
      overview(): Promise<VeloriaOutcome>;
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
      pay(p: unknown): Promise<VeloriaOutcome>;
      statement(p: unknown): Promise<VeloriaOutcome>;
    };
    proformas: {
      create(p: unknown): Promise<VeloriaOutcome>;
      list(p: unknown): Promise<VeloriaOutcome>;
      status(p: unknown): Promise<VeloriaOutcome>;
      convert(p: unknown): Promise<VeloriaOutcome>;
    };
    debts: { list(p: unknown): Promise<VeloriaOutcome> };
    closings: {
      get(p: unknown): Promise<VeloriaOutcome>;
      create(p: unknown): Promise<VeloriaOutcome>;
    };
    zakat: { sources(): Promise<VeloriaOutcome>; saveParams(p: unknown): Promise<VeloriaOutcome> };
    bread: {
      create(p: unknown): Promise<VeloriaOutcome>;
      list(p: unknown): Promise<VeloriaOutcome>;
      pay(p: unknown): Promise<VeloriaOutcome>;
      pickup(p: unknown): Promise<VeloriaOutcome>;
      transfer(p: unknown): Promise<VeloriaOutcome>;
    };
    sales: {
      create(p: unknown): Promise<VeloriaOutcome>;
      get(p: unknown): Promise<VeloriaOutcome>;
      history(p: unknown): Promise<VeloriaOutcome>;
      cancel(p: unknown): Promise<VeloriaOutcome>;
    };
    returns: {
      create(p: unknown): Promise<VeloriaOutcome>;
      list(p: unknown): Promise<VeloriaOutcome>;
    };
    expenses: {
      create(p: unknown): Promise<VeloriaOutcome>;
      list(p: unknown): Promise<VeloriaOutcome>;
    };
    reports: {
      dashboard(): Promise<VeloriaOutcome>;
      period(p: unknown): Promise<VeloriaOutcome>;
      full(p: unknown): Promise<VeloriaOutcome>;
    };
    productsExtra: { import(p: unknown): Promise<VeloriaOutcome> };
    company: { get(): Promise<VeloriaOutcome>; update(p: unknown): Promise<VeloriaOutcome> };
    printing: {
      listPrinters(): Promise<VeloriaOutcome>;
      printReceipt(p: unknown): Promise<VeloriaOutcome>;
      printA4(p: unknown): Promise<VeloriaOutcome>;
    };
    backup: {
      create(): Promise<VeloriaOutcome>;
      list(): Promise<VeloriaOutcome>;
      restore(p: unknown): Promise<VeloriaOutcome>;
    };
  };
}
