// Veloria PoS — Tests : paramètres (clés explicites, société, impressions).
import { describe, it, expect } from "vitest";
import {
  companyUpdateSchema,
  customersSettingsSchema,
  invoiceSettingsSchema,
  productsSettingsSchema,
  salesSettingsSchema,
  settingsSaveSchema,
  suppliersSettingsSchema,
} from "../../electron/ipc/validators.ts";

describe("Settings keys", () => {
  it("parses each known key", () => {
    expect(settingsSaveSchema.parse({ key: "sales", value: {} }).key).toBe("sales");
    expect(() => settingsSaveSchema.parse({ key: "unknown", value: {} })).toThrow();
    expect(salesSettingsSchema.parse({}).allowCreditSales).toBe(true);
    expect(salesSettingsSchema.parse({ defaultPaymentMethod: "transfer" }).autoPrintInvoice).toBe(
      false,
    );
    expect(() => salesSettingsSchema.parse({ defaultPaymentMethod: "nope" })).toThrow();
    expect(invoiceSettingsSchema.parse({}).showLogo).toBe(true);
    expect(productsSettingsSchema.parse({}).defaultUnit).toBe("PIECE");
    expect(customersSettingsSchema.parse({}).defaultCreditLimitMinor).toBe(0);
    expect(suppliersSettingsSchema.parse({}).defaultPaymentMethod).toBe("cash");
  });

  it("extends the company file", () => {
    const c = companyUpdateSchema.parse({
      company_name: "Veloria",
      commercial_name: "Veloria Market",
      email: "contact@veloria.dz",
      tax_number: "000123",
      commercial_register: "16/00-1",
    });
    expect(c.commercial_name).toBe("Veloria Market");
    expect(() => companyUpdateSchema.parse({ company_name: "" })).toThrow();
  });
});
