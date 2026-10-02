// Veloria PoS — Tests P0-3/P0-4/P1-3 : docs logistiques + étiquettes + backup fréquences.
import { describe, it, expect } from "vitest";
import {
  buildDeliveryHtml,
  buildDeliveryText,
  buildLabelsHtml,
  buildPurchaseOrderHtml,
  buildPurchaseOrderText,
  buildReturnSlipHtml,
  buildReturnSlipText,
  type LogisticsDocData,
} from "../../electron/printing/receipt-documents";
import {
  backupAutoSchema,
  deliveryPayloadSchema,
  labelsPayloadSchema,
  purchaseOrderDocPayloadSchema,
  returnSlipPayloadSchema,
} from "../../electron/ipc/validators";
import { backupFrequencyMinutes } from "@/domain/backup/backup-rules";

const DOC: LogisticsDocData = {
  company: "Veloria",
  companyPhone: "",
  companyAddress: "Alger",
  companyCity: "",
  companyEmail: "",
  companyRc: "RC1",
  companyNif: "NIF1",
  companyLogo: "",
  customerName: "Amine",
  customerPhone: "",
  customerAddress: "",
  customerCode: "",
  paymentMethod: "cash",
  dueDate: "",
  notes: "",
  invoice: "FAC-2026-00001",
  date: "01/01/2026",
  lines: [
    {
      name: "Coca",
      qty: 2,
      unit: "PIECE",
      unitPriceMinor: 10000,
      lineTotalMinor: 20000,
      ref: "00125",
    },
  ],
  subtotalMinor: 20000,
  discountMinor: 0,
  deliveryMinor: 0,
  totalMinor: 20000,
  paidMinor: 20000,
  footerText: "",
  thankYouMessage: "",
  originNumber: "FAC-2026-00001",
  returnNumber: "RET-2026-00001",
  reason: "Défectueux",
  refundMinor: 20000,
  orderNumber: "CMD-2026-00001",
  supplierName: "Fournisseur SARL",
  validityDays: 30,
};

describe("P0-3 documents logistiques", () => {
  it("livraison : A4 N&B + thermique + schémas", () => {
    const html = buildDeliveryHtml(DOC);
    expect(html).toContain("BON DE LIVRAISON");
    expect(html).toContain("Vente d");
    expect(html).not.toMatch(/#111|#555|#999|#eee/i);
    expect(buildDeliveryText(DOC)).toContain("BON DE LIVRAISON");
    expect(() => deliveryPayloadSchema.parse({ ...DOC, lines: DOC.lines })).not.toThrow();
  });
  it("retour : cause + remboursement", () => {
    const html = buildReturnSlipHtml(DOC);
    expect(html).toContain("BON DE RETOUR");
    expect(html).toContain("Défectueux");
    expect(html).toContain("Remboursé");
    expect(buildReturnSlipText(DOC)).toContain("BON DE RETOUR");
    expect(() => returnSlipPayloadSchema.parse({ ...DOC, lines: DOC.lines })).not.toThrow();
  });
  it("commande : fournisseur + validité", () => {
    const html = buildPurchaseOrderHtml(DOC);
    expect(html).toContain("BON DE COMMANDE");
    expect(html).toContain("Fournisseur SARL");
    expect(buildPurchaseOrderText(DOC)).toContain("BON DE COMMANDE");
    expect(() => purchaseOrderDocPayloadSchema.parse({ ...DOC, lines: DOC.lines })).not.toThrow();
  });
});

describe("P0-4 étiquettes multi-formats", () => {
  const items = [{ name: "Coca", priceMinor: 10000, barcode: "FAC-2026-00001" }];
  it("5 formats N&B déterministes", () => {
    for (const format of ["30x20", "50x30", "58x40", "A4-24", "custom"] as const) {
      const opts = { format, customWidthMm: 40, customHeightMm: 25 } as const;
      const html = buildLabelsHtml(items, opts);
      expect(html).toContain("Coca");
      expect(html).toContain("<svg");
      expect(html).not.toMatch(/#111|#555|#999|#eee|#888/i);
      expect(buildLabelsHtml(items, opts)).toBe(html);
    }
    expect(buildLabelsHtml(items, { format: "30x20" })).toContain("30mm 20mm");
    expect(buildLabelsHtml(items, { format: "58x40" })).toContain("58mm 40mm");
  });
  it("schéma labels accepte format + custom", () => {
    expect(() =>
      labelsPayloadSchema.parse({ items: [{ name: "C", priceMinor: 1, barcode: "X" }] }),
    ).not.toThrow();
    expect(() =>
      labelsPayloadSchema.parse({
        items: [{ name: "C", priceMinor: 1, barcode: "X" }],
        format: "58x40",
      }),
    ).not.toThrow();
  });
});

describe("P1-3 backup 8 fréquences", () => {
  it("schéma + minutes par fréquence", () => {
    const parsed = backupAutoSchema.parse({
      enabled: true,
      frequency: "10min",
      customMinutes: 60,
      retentionCount: 30,
    });
    expect(parsed.frequency).toBe("10min");
    expect(backupFrequencyMinutes("10min", 60)).toBe(10);
    expect(backupFrequencyMinutes("10min", 60)).toBe(10);
    expect(backupFrequencyMinutes("1h", 60)).toBe(60);
    expect(backupFrequencyMinutes("daily", 60)).toBe(1440);
    expect(backupFrequencyMinutes("weekly", 60)).toBe(10080);
    expect(backupFrequencyMinutes("custom", 45)).toBe(45);
  });
});
