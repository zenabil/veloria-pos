// Veloria PoS — Tests P0-3/P0-4/P1-3 : docs logistiques + étiquettes + backup fréquences.
import { describe, it, expect } from "vitest";
import {
  buildDeliveryText,
  buildLabelsHtml,
  buildPurchaseOrderText,
  buildReturnSlipText,
  code128Svg,
  code128Symbols,
  labelPageMicrons,
  sanitizeCode128,
  type LogisticsDocData,
  CODE128_WIDTHS,
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

describe("P0-3 documents logistiques (ticket uniquement, jamais A4)", () => {
  it("livraison : thermique N&B + schéma", () => {
    const text = buildDeliveryText(DOC);
    expect(text).toContain("BON DE LIVRAISON");
    expect(text).toContain("Vente");
    expect(text).toContain("FAC-2026-00001");
    expect(text).not.toMatch(/#111|#555|#999|#eee/i);
    expect(() => deliveryPayloadSchema.parse({ ...DOC, lines: DOC.lines })).not.toThrow();
  });
  it("retour : cause + remboursement", () => {
    const text = buildReturnSlipText(DOC);
    expect(text).toContain("BON DE RETOUR");
    expect(text).toContain("Défectueux");
    expect(text).toContain("Remboursé");
    expect(() => returnSlipPayloadSchema.parse({ ...DOC, lines: DOC.lines })).not.toThrow();
  });
  it("commande : fournisseur + validité", () => {
    const text = buildPurchaseOrderText(DOC);
    expect(text).toContain("BON DE COMMANDE");
    expect(text).toContain("Fournisseur SARL");
    expect(() => purchaseOrderDocPayloadSchema.parse({ ...DOC, lines: DOC.lines })).not.toThrow();
  });
});

describe("P0-4 étiquettes multi-formats", () => {
  const items = [{ name: "Coca", priceMinor: 10000, barcode: "FAC-2026-00001" }];
  it("6 formats thermiques N&B déterministes (jamais A4)", () => {
    for (const format of ["30x20", "45x20", "50x30", "58x30", "58x40", "custom"] as const) {
      const opts = { format, customWidthMm: 40, customHeightMm: 25 } as const;
      const html = buildLabelsHtml(items, opts);
      // Étiquette épurée : prix + Code39 seuls (ni nom, ni code répété).
      expect(html).not.toContain("Coca");
      expect(html).toContain("100,00");
      expect(html).toContain("<svg");
      expect(html).not.toMatch(/#111|#555|#999|#eee|#888/i);
      expect(buildLabelsHtml(items, opts)).toBe(html);
    }
    expect(buildLabelsHtml(items, { format: "30x20" })).toContain("30mm 20mm");
    expect(buildLabelsHtml(items, { format: "45x20" })).toContain("45mm 20mm");
    expect(buildLabelsHtml(items, { format: "58x30" })).toContain("58mm 30mm");
    expect(buildLabelsHtml(items, { format: "58x40" })).toContain("58mm 40mm");
  });
  it("thermique : 1 étiquette = 1 page (pas de vierges)", () => {
    // Sans break-after + marges CSS, Chromium débordait sur 2-4 pages
    // → la 365B sortait des étiquettes vierges pour 1 seule demandée.
    for (const format of ["30x20", "45x20", "50x30", "58x30", "58x40", "custom"] as const) {
      const html = buildLabelsHtml(items, { format, customWidthMm: 40, customHeightMm: 25 });
      expect(html).toContain("break-after:page");
      expect(html).toContain("color:#000;margin:0}");
      expect(html).not.toContain("margin:5mm");
    }
  });
  it("1 article = 1 cellule (jobs unitaires)", () => {
    // printLabels envoie 1 page par étiquette : le HTML unitaire ne doit
    // contenir qu'une seule cellule pour garantir 2 demandées = 2 sorties.
    const one = { name: "Coca", priceMinor: 10000, barcode: "FAC-2026-00001" };
    for (const format of ["30x20", "45x20", "50x30", "58x30", "58x40", "custom"] as const) {
      const html = buildLabelsHtml([one], { format, customWidthMm: 40, customHeightMm: 25 });
      expect(html.match(/class="label"/g)).toHaveLength(1);
    }
  });
  it("labelPageMicrons : formats exacts en microns", () => {
    expect(labelPageMicrons({ format: "30x20" })).toEqual({ width: 30000, height: 20000 });
    expect(labelPageMicrons({ format: "50x30" })).toEqual({ width: 50000, height: 30000 });
    expect(labelPageMicrons({ format: "45x20" })).toEqual({ width: 45000, height: 20000 });
    expect(labelPageMicrons({ format: "58x30" })).toEqual({ width: 58000, height: 30000 });
    expect(labelPageMicrons({ format: "58x40" })).toEqual({ width: 58000, height: 40000 });
    expect(labelPageMicrons({ format: "custom", customWidthMm: 40, customHeightMm: 25 })).toEqual({
      width: 40000,
      height: 25000,
    });
    expect(labelPageMicrons({})).toEqual({ width: 45000, height: 20000 });
  });
  it("schéma labels accepte format + custom, rejette l'ancienne planche A4", () => {
    expect(() =>
      labelsPayloadSchema.parse({ items: [{ name: "C", priceMinor: 1, barcode: "X" }] }),
    ).not.toThrow();
    expect(() =>
      labelsPayloadSchema.parse({
        items: [{ name: "C", priceMinor: 1, barcode: "X" }],
        format: "58x30",
      }),
    ).not.toThrow();
    // « A4-24 » a disparu : l'A4 est banni pour les étiquettes.
    expect(() =>
      labelsPayloadSchema.parse({
        items: [{ name: "C", priceMinor: 1, barcode: "X" }],
        format: "A4-24",
      }),
    ).toThrow();
  });
});

describe("Code 128 étiquettes (ISO 15417)", () => {
  it("table 107 symboles intègre (11 modules, barres paires)", () => {
    expect(CODE128_WIDTHS).toHaveLength(107);
    for (const w of CODE128_WIDTHS) {
      expect(w).toMatch(/^[1-4]{6}$/);
      const runs = w.split("").map(Number);
      expect(runs.reduce((a, b) => a + b, 0)).toBe(11);
      const bars = (runs[0] ?? 0) + (runs[2] ?? 0) + (runs[4] ?? 0);
      const spaces = (runs[1] ?? 0) + (runs[3] ?? 0) + (runs[5] ?? 0);
      expect(bars % 2).toBe(0);
      expect(spaces % 2).toBe(1);
    }
  });
  it("vecteur Wikipedia PJJ123C en B → contrôle 55", () => {
    expect(code128Symbols("PJJ123C")).toEqual([104, 48, 42, 42, 17, 18, 19, 35, 55, 106]);
  });
  it("chiffres pairs → set C compact", () => {
    expect(code128Symbols("0012")).toEqual([105, 0, 12, 26, 106]);
    expect(code128Symbols("11")).toEqual([105, 11, 13, 106]);
  });
  it("chiffres impairs → B + latch C", () => {
    const s = code128Symbols("1234567");
    expect(s.slice(0, 3)).toEqual([104, 17, 99]);
    expect(s[s.length - 1]).toBe(106);
    expect(s).toHaveLength(8);
  });
  it("sanitize garde ASCII 32-126 (minuscules incluses)", () => {
    expect(sanitizeCode128("Ab-12")).toBe("Ab-12");
    expect(sanitizeCode128("café")).toBe("caf");
    expect(code128Symbols("café")).not.toEqual([]);
    expect(code128Symbols("é")).toEqual([]);
  });
  it("zones de silence 10 modules + zone de sécurité thermique", () => {
    const svg = code128Svg("11", 22);
    // Première barre à x=20 (silence gauche), largeur totale = symboles + 2×20.
    expect(svg).toContain('x="20"');
    expect(svg).toContain("viewBox");
    const thermal = buildLabelsHtml([{ name: "C", priceMinor: 10000, barcode: "11" }], {
      format: "45x20",
    });
    expect(thermal).toContain("margin:0 2mm");
    // Thermique uniquement : même sans format explicite (défaut 45x20).
    expect(buildLabelsHtml([{ name: "C", priceMinor: 10000, barcode: "11" }], {})).toContain(
      "margin:0 2mm",
    );
  });
  it("45x20 : code-barres compact (barH 18)", () => {
    const html = buildLabelsHtml([{ name: "C", priceMinor: 10000, barcode: "11" }], {
      format: "45x20",
    });
    expect(html).toContain('height="34"');
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
