// Veloria PoS — IPC client (renderer): typed calls over the preload bridge.
// Renderer never touches SQLite/Node directly.

export interface IpcOk<T> {
  ok: true;
  data: T;
}

export interface IpcFail {
  ok: false;
  code: string;
  message: string;
}

export type IpcResult<T> = IpcOk<T> | IpcFail;

function bridge(): NonNullable<Window["veloria"]> {
  if (!window.veloria) throw new Error("Pont applicatif indisponible (preload).");
  return window.veloria;
}

export async function call<T>(
  fn: (api: NonNullable<Window["veloria"]>) => Promise<VeloriaOutcome>,
): Promise<T> {
  const res = await fn(bridge());
  if (!res.ok) {
    const err = new Error(res.message || "Erreur inattendue.");
    if (res.code) (err as Error & { code?: string }).code = res.code;
    throw err;
  }
  return res.data as T;
}

export const api = {
  dashboard: () => call((a) => a.reports.dashboard()),
  fullReport: (p: unknown) => call((a) => a.reports.full(p)),
  productSearch: (p: unknown) => call((a) => a.products.search(p)),
  productByBarcode: (p: unknown) => call((a) => a.products.getByBarcode(p)),
  productCreate: (p: unknown) => call((a) => a.products.create(p)),
  productUpdate: (p: unknown) => call((a) => a.products.update(p)),
  productsImport: (p: unknown) => call((a) => a.productsExtra.import(p)),
  customerSearch: (p: unknown) => call((a) => a.customers.search(p)),
  customerCreate: (p: unknown) => call((a) => a.customers.create(p)),
  customerUpdate: (p: unknown) => call((a) => a.customers.update(p)),
  customerStatement: (p: unknown) => call((a) => a.customers.statement(p)),
  customerPayment: (p: unknown) => call((a) => a.customers.recordPayment(p)),
  customersImport: (p: unknown) => call((a) => a.customers.import(p)),
  settingsGet: (p: unknown) => call((a) => a.settings.get(p)),
  settingsSave: (p: unknown) => call((a) => a.settings.save(p)),
  saleCreate: (p: unknown) => call((a) => a.sales.create(p)),
  saleGet: (p: unknown) => call((a) => a.sales.get(p)),
  salesHistory: (p: unknown) => call((a) => a.sales.history(p)),
  returnCreate: (p: unknown) => call((a) => a.returns.create(p)),
  returnsList: (p: unknown) => call((a) => a.returns.list(p)),
  expenseCreate: (p: unknown) => call((a) => a.expenses.create(p)),
  expensesList: (p: unknown) => call((a) => a.expenses.list(p)),
  backupCreate: () => call((a) => a.backup.create()),
  companyGet: () => call((a) => a.company.get()),
  stockOverview: () => call((a) => a.stock.overview()),
  stockLow: (p: unknown) => call((a) => a.stock.lowStock(p)),
  stockLedger: (p: unknown) => call((a) => a.stock.ledger(p)),
  stockAdjust: (p: unknown) => call((a) => a.stock.adjust(p)),
  stockIntake: (p: unknown) => call((a) => a.stock.intake(p)),
  stockIntakes: (p: unknown) => call((a) => a.stock.intakes(p)),
  stockValuation: () => call((a) => a.stock.valuation()),
  supplierSearch: (p: unknown) => call((a) => a.suppliers.search(p)),
  supplierCreate: (p: unknown) => call((a) => a.suppliers.create(p)),
  supplierPay: (p: unknown) => call((a) => a.suppliers.pay(p)),
  supplierStatement: (p: unknown) => call((a) => a.suppliers.statement(p)),
  proformaCreate: (p: unknown) => call((a) => a.proformas.create(p)),
  proformasList: (p: unknown) => call((a) => a.proformas.list(p)),
  proformaStatus: (p: unknown) => call((a) => a.proformas.status(p)),
  proformaConvert: (p: unknown) => call((a) => a.proformas.convert(p)),
  debtsList: (p: unknown) => call((a) => a.debts.list(p)),
  closingsGet: (p: unknown) => call((a) => a.closings.get(p)),
  closingCreate: (p: unknown) => call((a) => a.closings.create(p)),
  zakatSources: () => call((a) => a.zakat.sources()),
  zakatSave: (p: unknown) => call((a) => a.zakat.saveParams(p)),
  breadCreate: (p: unknown) => call((a) => a.bread.create(p)),
  breadList: (p: unknown) => call((a) => a.bread.list(p)),
  breadPay: (p: unknown) => call((a) => a.bread.pay(p)),
  breadPickup: (p: unknown) => call((a) => a.bread.pickup(p)),
  breadTransfer: (p: unknown) => call((a) => a.bread.transfer(p)),
};
