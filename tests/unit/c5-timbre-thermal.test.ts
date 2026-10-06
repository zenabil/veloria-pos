// Veloria PoS — C5 : timbre LF 2025 + thermique 58/80 sans coupe + cohérence.
// Barème officiel (Art. 100 LF 2025) : tranches de 100 DA, espèces uniquement.
import { describe, it, expect } from "vitest";
import { timbreQuittanceLf2025 } from "@domain/invoice/timbre-rules.ts";
import {
  amountInWordsFr,
  buildA4Html,
  buildLabelsHtml,
  buildQrPayload,
  buildReceiptText,
  thermalCols,
  thermalField,
  thermalItem,
  thermalRow,
  timbreQuittanceLf2025 as timbreMirror,
  wrapThermal,
  type ReceiptData,
} from "../../electron/printing/receipt-documents";
import { printPayloadSchema } from "../../electron/ipc/validators";

const BASE: ReceiptData = {
  company: "Veloria",
  companyPhone: "0550",
  companyAddress: "Alger",
  companyCity: "",
  companyEmail: "",
  companyRc: "16/00-1234567",
  companyNif: "000123456789012",
  companyNis: "123456789012345",
  companyArticle: "12345678901",
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
      name: "Sucre en poudre extra fin de canne à sucre roux doré premium 1kg",
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
};

describe("C5 timbre LF 2025 (domaine)", () => {
  it("barème officiel par tranches de 100 DA, espèces uniquement", () => {
    expect(timbreQuittanceLf2025(30_000, "cash")).toBe(0); // ≤ 300 DA : hors champ
    expect(timbreQuittanceLf2025(100_000, "cash")).toBe(1_000); // 1000 DA → 10 tranches
    expect(timbreQuittanceLf2025(100_100, "cash")).toBe(1_100); // 1001 DA → 11 tranches
    expect(timbreQuittanceLf2025(3_101_000, "cash")).toBe(46_650); // 31010 DA → 311 × 1,5
    expect(timbreQuittanceLf2025(40_000, "cash")).toBe(500); // plancher 5 DA
    expect(timbreQuittanceLf2025(20_000_000, "cash")).toBe(400_000); // > 100k → 2 DA/tranche
    expect(timbreQuittanceLf2025(100_000, "cheque")).toBe(0);
    expect(timbreQuittanceLf2025(100_000, "transfer")).toBe(0);
    expect(timbreQuittanceLf2025(100_000, null)).toBe(0);
    expect(timbreQuittanceLf2025(0, "cash")).toBe(0);
  });

  it("miroir main === domaine (parité)", () => {
    const vectors: [number, string][] = [
      [0, "cash"],
      [30_000, "cash"],
      [30_100, "cash"],
      [100_000, "cash"],
      [100_100, "cash"],
      [3_000_000, "cash"],
      [3_001_000, "cash"],
      [10_000_000, "cash"],
      [10_010_000, "cash"],
      [20_000_000, "cash"],
      [100_000, "cheque"],
      [100_000, "transfer"],
    ];
    for (const [minor, method] of vectors) {
      expect(timbreMirror(minor, method), `${minor}/${method}`).toBe(
        timbreQuittanceLf2025(minor, method),
      );
    }
  });
});

describe("C5 thermique sans coupe (58 = 32 cols, 80 = 42 cols)", () => {
  it("largeurs + helpers : montants jamais coupés", () => {
    expect(thermalCols("58mm")).toBe(32);
    expect(thermalCols("80mm")).toBe(42);
    expect(thermalCols()).toBe(42);
    for (const row of thermalRow("TOTAL TTC", "1 234,50 DA", 32)) {
      expect(row.length).toBeLessThanOrEqual(32);
    }
    expect(thermalRow("TOTAL TTC", "1 234,50 DA", 32).join("")).toContain("1 234,50 DA");
    expect(thermalField("QR", "VELORIA|FAC-1|100|d|rc|nif|nis|v", 32)[0]).toBe("QR :");
    const item = thermalItem(
      "Nom très long qui dépasse largement la largeur du papier",
      "2 x 5,00 DA",
      "10,00 DA",
      32,
    );
    for (const l of item) expect(l.length).toBeLessThanOrEqual(32);
    expect(item.join(" ")).toContain("10,00 DA");
    expect(wrapThermal("", 32)).toEqual([""]);
  });

  it("ticket : aucune ligne ne dépasse la largeur, montants intacts", () => {
    for (const w of ["58mm", "80mm"] as const) {
      const cols = thermalCols(w);
      const text = buildReceiptText(BASE, w);
      for (const line of text.split("\n")) {
        expect(line.length, `${w}: ${line}`).toBeLessThanOrEqual(cols);
      }
      expect(text).toContain("PRODUIT");
      expect(text).toContain("Sucre en poudre");
      expect(text).toContain("TOTAL TTC");
      expect(text).toContain("NIS :");
      expect(text).toContain("Art :");
    }
  });

  it("lettres === chiffres au centime (net timbré)", () => {
    const stamp = timbreQuittanceLf2025(100_000, "cash");
    const d: ReceiptData = {
      ...BASE,
      lines: [
        { name: "X", qty: 1, unit: "PIECE", unitPriceMinor: 100_000, lineTotalMinor: 100_000 },
      ],
      subtotalMinor: 100_000,
      totalMinor: 100_000,
      paidMinor: 100_000,
      stampMinor: stamp,
    };
    const text = buildReceiptText(d, "58mm");
    const flat = text.replace(/\s+/g, " ");
    expect(flat).toContain("Timbre fiscal");
    expect(flat).toContain("NET À PAYER");
    expect(flat).toContain(
      amountInWordsFr(100_000 + stamp)
        .replace(/\s+/g, " ")
        .trim(),
    );
    const html = buildA4Html(d);
    expect(html).toContain("Timbre fiscal");
    expect(html).toContain("NET À PAYER");
    expect(html).toContain("NIS :");
  });
});

describe("C5 cohérence timbre au passage frontière (Zod)", () => {
  const line = {
    name: "X",
    qty: 1,
    unit: "",
    unitPriceMinor: 100_000,
    lineTotalMinor: 100_000,
    ref: "",
  };
  const payload = {
    lines: [line],
    subtotalMinor: 100_000,
    discountMinor: 0,
    deliveryMinor: 0,
    totalMinor: 100_000,
    paidMinor: 100_000,
    paymentMethod: "cash" as const,
    stampMinor: 1_000,
  };
  it("timbre exact accepté, timbre forgé/omis rejeté", () => {
    expect(() => printPayloadSchema.parse(payload)).not.toThrow();
    expect(() => printPayloadSchema.parse({ ...payload, stampMinor: 999 })).toThrow(
      /Timbre fiscal incohérent/,
    );
    expect(() => printPayloadSchema.parse({ ...payload, stampMinor: 0 })).toThrow(
      /Timbre fiscal incohérent/,
    );
    expect(() =>
      printPayloadSchema.parse({ ...payload, paymentMethod: "cheque", stampMinor: 1_000 }),
    ).toThrow(/Timbre fiscal incohérent/);
    expect(() =>
      printPayloadSchema.parse({ ...payload, paymentMethod: "cheque", stampMinor: 0 }),
    ).not.toThrow();
  });
});

describe("C5 QR + étiquettes", () => {
  it("QR porte le NIS (8 segments, déterministe)", () => {
    const p = buildQrPayload({
      invoice: "FAC-1",
      totalMinor: 100,
      date: "d",
      companyRc: "rc",
      companyNif: "nif",
      companyNis: "nis123",
      seller: "v",
    });
    expect(p).toBe("VELORIA|FAC-1|100|d|rc|nif|nis123|v");
    expect(
      buildQrPayload({
        invoice: "FAC-1",
        totalMinor: 100,
        date: "d",
        companyRc: "rc",
        companyNif: "nif",
        seller: "v",
      }),
    ).toBe("VELORIA|FAC-1|100|d|rc|nif||v");
  });

  it("étiquettes : QR opt-in sous le Code 39, N&B", () => {
    const item = { name: "Sucre", priceMinor: 10_000, barcode: "ABC123" };
    const without = buildLabelsHtml([item], { format: "A4-24" });
    expect(without).toContain("ABC123");
    expect(without).not.toContain('<div class="lqr">');
    const withQr = buildLabelsHtml([{ ...item, qrSvg: "<svg></svg>" }], { format: "A4-24" });
    expect(withQr).toContain('<div class="lqr">');
    expect(withQr).not.toMatch(/#111|#555|#999|#eee/i);
  });
});
