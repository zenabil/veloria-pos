// Veloria PoS — Ports: repository contracts (domain -> infrastructure).
// Infrastructure implements these; application depends only on contracts.

export interface ProductRepository {
  search(params: {
    query: string;
    page: number;
    pageSize: number;
  }): Promise<{ rows: unknown[]; total: number }>;
  findByBarcode(barcode: string): Promise<Record<string, unknown> | null>;
}

export interface SaleRepository {
  create(input: unknown): Promise<{ saleId: number; invoiceNumber: string }>;
  cancel(saleId: number): Promise<void>;
}

export interface TransactionPort {
  run<T>(fn: () => T): T;
}
