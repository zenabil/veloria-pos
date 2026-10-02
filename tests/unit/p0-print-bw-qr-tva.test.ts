// Veloria PoS — Tests P0-1 : N&B strict + TVA + vendeur + QR (centimes, déterminisme).
import { describe, it, expect } from "vitest";
import {
  buildA4Html,
  buildPaymentText,
  buildPaymentTicketA4Html,
  buildProformaA4Html,
  buildProformaText,
  buildPurchaseOrderText,
  buildQrPayload,
  buildReceiptText,
  thermalHtml,
  tvaBreakdown,
  toReceiptData,
  type ReceiptData,
} from "../../electron/printing/receipt-documents";

const BASE: ReceiptData = {
  company: "Veloria",
  companyPhone: "0550",
  companyAddress: "Alger",
  companyCity: "",
  companyEmail: "",
  companyRc: "16/00-1234567",
  companyNif: "000123456789012",
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
};

describe("P0-1 N&B strict", () => {
  it("A4 ne contient aucune couleur hors #fff/#000", () => {
    const html = buildA4Html(BASE);
    const colors = [...html.matchAll(/#[0-9a-fA-F]{3,6}/g)].map((m) => m[0].toLowerCase());
    const allowed = new Set(["#fff", "#ffffff", "#000", "#000000"]);
    for (const c of colors) {
      const norm =
        c.length === 4
          ? `#${c[1]}${c[1]}${c[1]}`.replace(
              /#(.)(.)(.)/,
              (_, a, b, d) => `#${a}${a}${b}${b}${d}${d}`,
            )
          : c;
      expect(allowed.has(c) || allowed.has(norm), c).toBe(true);
    }
    expect(html).toContain("background:#fff");
    expect(html).toContain("grayscale(1)");
  });
});

describe("P0-1 TVA centimes", () => {
  it("ventile sans float et masque quand taux = 0", () => {
    expect(tvaBreakdown(20000, 0)).toEqual({ htMinor: 0, tvaMinor: 0 });
    const v = tvaBreakdown(11900, 19);
    expect(v.htMinor + v.tvaMinor).toBe(11900);
    expect(v.htMinor).toBe(10000);
    // Ticket sans TVA : aucune ligne HT/TVA.
    expect(buildReceiptText(BASE)).not.toContain("TVA");
    // Ticket avec TVA 19% : lignes HT/TVA/TTC.
    const withTva = buildReceiptText({ ...BASE, tvaRatePercent: 19 });
    expect(withTva).toContain("Total HT");
    expect(withTva).toContain("TVA (19 %)");
    expect(withTva).toContain("TOTAL TTC");
    // A4 avec TVA : lignes Total HT / TVA.
    expect(buildA4Html({ ...BASE, tvaRatePercent: 19 })).toContain("Total HT");
  });
});

describe("P0-1 vendeur + QR", () => {
  it("affiche le vendeur quand renseigné, masque sinon", () => {
    expect(buildReceiptText(BASE)).not.toContain("Vendeur");
    expect(buildReceiptText({ ...BASE, seller: "Yacine" })).toContain("Vendeur : Yacine");
    expect(buildA4Html({ ...BASE, seller: "Yacine" })).toContain("Vendeur : Yacine");
  });
  it("QR déterministe et présent (ticket + A4)", () => {
    const p1 = buildQrPayload({
      invoice: "FAC-1",
      totalMinor: 100,
      date: "d",
      companyRc: "rc",
      companyNif: "nif",
      seller: "v",
    });
    const p2 = buildQrPayload({
      invoice: "FAC-1",
      totalMinor: 100,
      date: "d",
      companyRc: "rc",
      companyNif: "nif",
      seller: "v",
    });
    expect(p1).toBe(p2);
    expect(p1.startsWith("VELORIA|")).toBe(true);
    expect(buildReceiptText(BASE)).toContain("QR : VELORIA|");
    const html = buildA4Html({ ...BASE, qrSvg: "<svg></svg>", qrPayload: "VELORIA|X" });
    expect(html).toContain("VELORIA|X");
  });
  it("toReceiptData accepte les nouveaux champs optionnels", () => {
    const d = toReceiptData({ ...BASE, seller: "Yacine", tvaRatePercent: 19 });
    expect(d.seller).toBe("Yacine");
    expect(d.tvaRatePercent).toBe(19);
  });
  it("devis : vendeur + TVA + QR sans valeur fiscale", () => {
    const proforma = {
      company: "Veloria",
      companyPhone: "",
      companyAddress: "",
      companyCity: "",
      companyEmail: "",
      companyRc: "RC1",
      companyNif: "NIF1",
      companyLogo: "",
      footerText: "",
      customerName: "Amine",
      customerPhone: "",
      customerAddress: "",
      seller: "Yacine",
      tvaRatePercent: 19,
      htMinor: 0,
      tvaMinor: 0,
      qrPayload: "",
      qrSvg: "",
      number: "PRO-2026-00042",
      date: "01/01/2026",
      dueDate: "",
      notes: "",
      lines: BASE.lines,
      subtotalMinor: 20000,
      discountMinor: 0,
      totalMinor: 20000,
    };
    const text = buildProformaText(proforma);
    expect(text).toContain("Vendeur : Yacine");
    expect(text).toContain("TVA (19 %)");
    expect(text).toContain("QR : VELORIA|");
    expect(text.includes("Facture")).toBe(false);
    const html = buildProformaA4Html(proforma);
    expect(html).toContain("Vendeur : Yacine");
    expect(html).toContain("Total HT");
    expect(html).not.toMatch(/#111|#555|#999|#eee/i);
  });
  it("reçu de règlement : QR présent, N&B", () => {
    const ticket = {
      company: "Veloria",
      companyPhone: "",
      companyAddress: "",
      companyCity: "",
      companyEmail: "",
      companyRc: "",
      companyNif: "",
      companyLogo: "",
      partyLabel: "Amine — CL-00125",
      kind: "customer" as const,
      reference: "PAY-00042",
      date: "23/09/2026",
      amountMinor: 5000,
      paymentMethod: "cash",
      prevBalanceMinor: 15000,
      newBalanceMinor: 10000,
      notes: "",
      footerText: "",
      thankYouMessage: "",
    };
    expect(buildPaymentText(ticket)).toContain("QR : VELORIA|PAY-00042|5000|");
    const html = buildPaymentTicketA4Html(ticket);
    expect(html).toContain("PAY-00042");
    expect(html).toContain("<svg");
    expect(html).not.toMatch(/#111|#555|#999|#eee/i);
  });
  it("thermique : chaque document porte Code 39 + QR (58/80mm, N&B)", () => {
    const codes = { barcode: "FAC-2026-00001", qrSvg: "<svg></svg>", qrPayload: "VELORIA|X" };
    for (const width of ["58mm", "80mm"] as const) {
      const html = thermalHtml("TICKET", width, codes);
      expect(html).toContain("<svg");
      expect(html).toContain("FAC-2026-00001");
      expect(html).toContain("VELORIA|X");
      expect(html).not.toMatch(/#111|#555|#999|#eee/i);
      expect(thermalHtml("TICKET", width, codes)).toBe(html);
    }
    expect(thermalHtml("TICKET", "58mm", codes)).toContain("200px");
    expect(thermalHtml("TICKET", "80mm", codes)).toContain("280px");
    expect(thermalHtml("TICKET")).not.toContain("<svg");
  });
  it("bon de commande thermique : QR présent", () => {
    const text = buildPurchaseOrderText({
      ...BASE,
      orderNumber: "CMD-2026-00001",
      supplierName: "Fournisseur SARL",
    });
    expect(text).toContain("QR : VELORIA|CMD-2026-00001|");
  });
});
