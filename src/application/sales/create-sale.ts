// Veloria PoS — Application: CreateSale use-case (renderer orchestration).
// Domain totals computed here; main process re-validates + commits atomically.

import { computeSaleTotals, type CartLineInput } from "@domain/sales/sale-rules.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { api } from "@shared/types/ipc-client.ts";

export interface CartLine extends CartLineInput {
  key: string;
}

export interface SaleDraft {
  lines: CartLine[];
  discountType: "none" | "percent" | "amount";
  discountValue: number;
  deliveryFeeMinor: number;
  amountPaidMinor: number;
  customerId: number | null;
  paymentMethod: "cash" | "cheque" | "transfer" | null;
}

export function totalsOf(draft: SaleDraft): ReturnType<typeof computeSaleTotals> {
  return computeSaleTotals({
    lines: draft.lines,
    discountType: draft.discountType,
    discountValueMinor: Math.round(draft.discountValue),
    deliveryFeeMinor: draft.deliveryFeeMinor,
    amountPaidMinor: draft.amountPaidMinor,
  });
}

export async function createSale(
  draft: SaleDraft,
): Promise<{ saleId: number; invoiceNumber: string }> {
  const totals = totalsOf(draft);
  const payload = {
    operationId: newOperationId(),
    customerId: draft.customerId,
    lines: draft.lines.map((l) => ({
      productId: l.productId,
      productName: l.productName,
      unitCode: l.unitCode,
      unitPriceMinor: l.unitPriceMinor,
      purchasePriceMinor: l.purchasePriceMinor,
      quantity: l.quantity,
    })),
    discountType: draft.discountType,
    discountValueMinor: Math.round(draft.discountValue),
    deliveryFeeMinor: draft.deliveryFeeMinor,
    amountPaidMinor: draft.amountPaidMinor,
    paymentMethod: draft.paymentMethod,
  };
  void totals;
  return (await api.saleCreate(payload)) as { saleId: number; invoiceNumber: string };
}
