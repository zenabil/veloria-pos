// Veloria PoS — Feature: sales cart store (ephemeral UI state only).
// SQLite remains the source of truth; this store holds the in-progress cart.
import { create } from "zustand";
import type { CartLine } from "@/application/sales/create-sale.ts";

interface CartState {
  lines: CartLine[];
  customerId: number | null;
  customerLabel: string;
  discountType: "none" | "percent" | "amount";
  discountValue: number;
  deliveryFeeMinor: number;
  amountPaidMinor: number;
  paymentMethod: "cash" | "cheque" | "transfer" | null;
  addLine: (line: CartLine) => void;
  setQty: (key: string, qty: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;
  setCustomer: (id: number | null, label: string) => void;
  setTotals: (
    patch: Partial<
      Pick<
        CartState,
        "discountType" | "discountValue" | "deliveryFeeMinor" | "amountPaidMinor" | "paymentMethod"
      >
    >,
  ) => void;
}

let n = 0;

export const useCart = create<CartState>((set) => ({
  lines: [],
  customerId: null,
  customerLabel: "Client de passage",
  discountType: "none",
  discountValue: 0,
  deliveryFeeMinor: 0,
  amountPaidMinor: 0,
  paymentMethod: "cash",
  addLine: (line) =>
    set((s) => {
      const key = line.key || `l${++n}`;
      const existing = s.lines.find(
        (l) =>
          l.productId != null &&
          l.productId === line.productId &&
          l.unitPriceMinor === line.unitPriceMinor,
      );
      if (existing) {
        return {
          lines: s.lines.map((l) =>
            l.key === existing.key
              ? { ...l, quantity: Math.round((l.quantity + line.quantity) * 1000) / 1000 }
              : l,
          ),
        };
      }
      return { lines: [...s.lines, { ...line, key }] };
    }),
  setQty: (key, qty) =>
    set((s) => ({
      lines: s.lines
        .map((l) => (l.key === key ? { ...l, quantity: qty } : l))
        .filter((l) => l.quantity > 0),
    })),
  removeLine: (key) => set((s) => ({ lines: s.lines.filter((l) => l.key !== key) })),
  clear: () =>
    set({
      lines: [],
      amountPaidMinor: 0,
      discountType: "none",
      discountValue: 0,
      deliveryFeeMinor: 0,
      customerId: null,
      customerLabel: "Client de passage",
    }),
  setCustomer: (id, label) => set({ customerId: id, customerLabel: label }),
  setTotals: (patch) => set(patch),
}));
