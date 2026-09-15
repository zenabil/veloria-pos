// Veloria PoS — Domain errors (French user-facing codes).

export type DomainErrorCode =
  | "VALIDATION_ERROR"
  | "MONEY_ERROR"
  | "QUANTITY_ERROR"
  | "BARCODE_ERROR"
  | "PRODUCT_ERROR"
  | "CUSTOMER_ERROR"
  | "SALE_ERROR"
  | "STOCK_ERROR"
  | "RETURN_ERROR"
  | "PAYMENT_ERROR"
  | "PROFORMA_ERROR"
  | "BREAD_ERROR"
  | "SUPPLIER_ERROR"
  | "CLOSING_ERROR"
  | "IMPORT_ERROR"
  | "CONFLICTING_OPERATION";

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export function validationError(message: string): DomainError {
  return new DomainError("VALIDATION_ERROR", message);
}
