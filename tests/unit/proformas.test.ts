// Veloria PoS — Tests : proformas (helpers UI, validateurs Zod).
import { describe, it, expect } from "vitest";
import {
  isProformaConvertible,
  isProformaEditable,
  proformaStatusLabel,
  proformaStatusTone,
} from "@features/proformas/types.ts";
import { proformaListSchema, proformaUpdateSchema } from "../../electron/ipc/validators.ts";

describe("Proforma UI helpers", () => {
  it("labels statuses and guards transitions", () => {
    expect(proformaStatusLabel("draft")).toBe("Brouillon");
    expect(proformaStatusLabel("sent")).toBe("Envoyé");
    expect(proformaStatusTone("converted")).toBe("green");
    expect(isProformaEditable("draft")).toBe(true);
    expect(isProformaEditable("sent")).toBe(false);
    expect(isProformaConvertible("sent")).toBe(true);
    expect(isProformaConvertible("converted")).toBe(false);
  });
});

describe("Proforma Zod schemas", () => {
  it("validates updates (draft payload)", () => {
    const u = proformaUpdateSchema.parse({
      id: 1,
      lines: [{ productId: 2, productName: "Coca", unitPriceMinor: 10000, quantity: 2 }],
      discountMinor: 500,
      terms: "Paiement à 30 jours",
    });
    expect(u.deliveryMinor).toBe(0);
    expect(() => proformaUpdateSchema.parse({ id: 1, lines: [] })).toThrow();
  });

  it("validates list filters", () => {
    const list = proformaListSchema.parse({ status: "sent", sort: "amount_desc" });
    expect(list.page).toBe(1);
    expect(() => proformaListSchema.parse({ status: "pending" })).toThrow();
  });
});
