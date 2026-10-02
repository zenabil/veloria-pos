// Veloria PoS — Application: CreateSale use-case (PUR, sans IO).
// P0-7 : use-case testable — aucune importation IPC, aucun UUID généré ici.
// `operationId` est FOURNI par l'appelant (dialogue d'encaissement) ; absent =
// refus explicite (jamais de génération silencieuse qui casserait le retry).
// La remise vit dans le prix unitaire de ligne (sale-rules) : aucun
// discountType/discountValue au niveau vente.

import { computeSaleTotals, type CartLineInput } from "@domain/sales/sale-rules.ts";
import { assertCreditSaleAllowed } from "@domain/customer/debt-rules.ts";

export interface CartLine extends CartLineInput {
  key: string;
}

export interface SaleDraft {
  lines: CartLine[];
  deliveryFeeMinor: number;
  amountPaidMinor: number;
  customerId: number | null;
  /** `customers.credit_allowed` du client choisi (false = passage/sans autorisation). */
  customerCreditAllowed?: boolean;
  /** Échéance du crédit (AAAA-MM-JJ) ou null = comptant/sans échéance. */
  dueDate?: string | null;
  paymentMethod: "cash" | "cheque" | "transfer" | null;
  /** Idempotence (F-01) : UUID figé par l'appelant, rejoué tel quel au retry. */
  operationId: string;
}

interface SalePayload {
  operationId: string;
  customerId: number | null;
  lines: {
    productId: number | null;
    productName: string;
    unitCode: string;
    originalUnitPriceMinor: number;
    unitPriceMinor: number;
    purchasePriceMinor: number;
    quantity: number;
  }[];
  deliveryFeeMinor: number;
  amountPaidMinor: number;
  paymentMethod: "cash" | "cheque" | "transfer" | null;
  dueDate: string | null;
  totals: ReturnType<typeof computeSaleTotals>;
}

export function totalsOf(
  draft: Pick<SaleDraft, "lines" | "deliveryFeeMinor" | "amountPaidMinor">,
): ReturnType<typeof computeSaleTotals> {
  return computeSaleTotals({
    lines: draft.lines,
    deliveryFeeMinor: draft.deliveryFeeMinor,
    amountPaidMinor: draft.amountPaidMinor,
  });
}

/** Construit la charge sales.create (validation métier pure, zéro IO). */
export function buildSalePayload(draft: SaleDraft): SalePayload {
  if (typeof draft.operationId !== "string" || draft.operationId.trim().length === 0) {
    throw new Error("operationId manquant : le use-case refuse sans identifiant d'opération.");
  }
  // Validation métier côté appelant (totaux recalculés côté main, défense en profondeur).
  const totals = totalsOf(draft);
  assertCreditSaleAllowed({
    customerId: draft.customerId,
    creditAllowed: draft.customerCreditAllowed ?? false,
    remainingMinor: totals.remainingMinor,
  });
  return {
    operationId: draft.operationId,
    customerId: draft.customerId,
    lines: draft.lines.map((l) => ({
      productId: l.productId,
      productName: l.productName,
      unitCode: l.unitCode,
      originalUnitPriceMinor: l.originalUnitPriceMinor,
      unitPriceMinor: l.unitPriceMinor,
      purchasePriceMinor: l.purchasePriceMinor,
      quantity: l.quantity,
    })),
    deliveryFeeMinor: draft.deliveryFeeMinor,
    amountPaidMinor: draft.amountPaidMinor,
    paymentMethod: draft.paymentMethod,
    dueDate: draft.dueDate ?? null,
    totals,
  };
}
