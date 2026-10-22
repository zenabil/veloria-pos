// Veloria PoS — Ticket de vente HTML (design ADR-134) : structure, montants,
// encadré de soldes, échappement et largeurs 58/80 mm.
import { describe, it, expect } from "vitest";
import { buildReceiptTicketHtml } from "../../../electron/printing/receipt-documents";
import { formatMinorDa } from "../../../electron/printing/receipt-documents/amounts";
import type { ReceiptData } from "../../../electron/printing/receipt-documents/common";

const DOC: ReceiptData = {
  company: "Superette MADANI",
  companyPhone: "0550 00 00 00",
  companyAddress: "Rue des Frères",
  companyCity: "SABRA",
  companyEmail: "",
  companyRc: "16/00-1234567",
  companyNif: "000123456789012",
  companyLogo: "",
  customerName: "Bilel Zenagui",
  customerPhone: "0555 00 00 00",
  customerAddress: "",
  customerCode: "CL-00001",
  paymentMethod: "cash",
  dueDate: "",
  notes: "",
  footerText: "",
  thankYouMessage: "",
  invoice: "FAC-2026-00001",
  date: "22/10/2026",
  lines: [
    {
      name: "BIMCO TANGO",
      qty: 20,
      unit: "PIECE",
      unitPriceMinor: 12650,
      lineTotalMinor: 253000,
      ref: "00020",
    },
    {
      name: "Cafe Aroma Rouge 250g",
      qty: 20,
      unit: "PIECE",
      unitPriceMinor: 23800,
      lineTotalMinor: 476000,
      ref: "00021",
    },
  ],
  subtotalMinor: 729000,
  discountMinor: 0,
  deliveryMinor: 0,
  totalMinor: 729000,
  paidMinor: 729000,
  prevBalanceMinor: 26446477,
  currentBalanceMinor: 26446477,
};

const CODES = { barcode: "FAC-2026-00001", qrSvg: "", qrPayload: "" };

const FIRST_LINE = DOC.lines[0];
if (!FIRST_LINE) throw new Error("Fixture ticket sans ligne");

describe("Ticket de vente HTML (ADR-134)", () => {
  it("est déterministe et porte le design demandé", () => {
    const html = buildReceiptTicketHtml(DOC, "80mm", CODES);
    expect(buildReceiptTicketHtml(DOC, "80mm", CODES)).toBe(html);
    for (const needle of [
      "<!doctype html>",
      "Superette MADANI",
      "SABRA",
      "22/10/2026",
      "Client :",
      "Bilel Zenagui",
      "Qté",
      "Article",
      "P.U",
      "Montant",
      "BIMCO TANGO",
      "2 Article(s)",
      "Ancien solde",
      "Total vente",
      "Versement",
      "Nouveau solde",
      "Merci de votre visite.",
      "Ticket obligatoire pour toutes réclamations",
      "FAC-2026-00001",
    ]) {
      expect(html.includes(needle), needle).toBe(true);
    }
    expect(html.includes("<script")).toBe(false);
  });

  it("largeur 80 mm par défaut et 58 mm sur demande", () => {
    const wide = buildReceiptTicketHtml(DOC, "80mm", CODES);
    expect(wide).toContain('class="t-80"');
    expect(wide).toContain("width:280px");
    const narrow = buildReceiptTicketHtml(DOC, "58mm", CODES);
    expect(narrow).toContain('class="t-58"');
    expect(narrow).toContain("width:200px");
    expect(narrow).toContain(".t-58 .t-bottom{display:block}");
  });

  it("encadré : ancien solde, versement et nouveau solde réels", () => {
    const html = buildReceiptTicketHtml(DOC, "80mm", CODES);
    expect(html).toContain(formatMinorDa(26446477));
    expect(html).toContain(formatMinorDa(729000));
    expect(html).toContain("t-strong");
  });

  it("vente à crédit sans fiche solde : reste à payer affiché", () => {
    const html = buildReceiptTicketHtml(
      { ...DOC, paidMinor: 500000, prevBalanceMinor: undefined, currentBalanceMinor: undefined },
      "80mm",
      CODES,
    );
    expect(html).toContain("Reste à payer");
    expect(html.includes("Nouveau solde")).toBe(false);
  });

  it("montant saisi : P.U honnête (—), montant facturé intact", () => {
    const html = buildReceiptTicketHtml(
      {
        ...DOC,
        lines: [
          {
            name: "Pommes",
            qty: 0.071,
            unit: "KG",
            unitPriceMinor: 70000,
            lineTotalMinor: 5000,
            ref: "00125",
            billedTotalMinor: 5000,
          },
        ],
      },
      "80mm",
      CODES,
    );
    expect(html).toContain('<td class="t-num">—</td>');
    expect(html).toContain('<td class="t-num">50</td>');
    expect(html).toContain(">kg<");
    expect(html).toContain("Montant saisi");
  });

  it("TVA affichée uniquement quand le taux est > 0", () => {
    const without = buildReceiptTicketHtml(DOC, "80mm", CODES);
    expect(without.includes("TVA (")).toBe(false);
    const withTva = buildReceiptTicketHtml(
      { ...DOC, tvaRatePercent: 19, htMinor: 612605, tvaMinor: 116395 },
      "80mm",
      CODES,
    );
    expect(withTva).toContain("TVA (19 %)");
    expect(withTva).toContain("Total HT");
  });

  it("échappe toutes les entrées libres (aucune injection)", () => {
    const html = buildReceiptTicketHtml(
      {
        ...DOC,
        company: "Superette <MADANI>",
        customerName: 'Bilel <b>"x"</b>',
        lines: [{ ...FIRST_LINE, name: "<img src=x onerror=alert(1)>" }],
      },
      "80mm",
      CODES,
    );
    expect(html.includes("<MADANI>")).toBe(false);
    expect(html.includes("&lt;MADANI&gt;")).toBe(true);
    expect(html.includes('Bilel <b>"x"</b>')).toBe(false);
    expect(html.includes("<img src=x")).toBe(false);
  });

  it("aperçu écran : papier blanc détouré sur fond gris, impression blanche", () => {
    const html = buildReceiptTicketHtml(DOC, "80mm", CODES);
    expect(html).toContain("@media screen{html,body{background:#d1d5db}");
    expect(html).toContain("html,body{margin:0;padding:0;background:#fff");
    expect(html).toContain("#veloria-ticket{box-shadow:");
    // Le fond gris est réservé à l'écran : `@media print` n'est pas nécessaire
    // car `printToPDF`/`webContents.print` rendent la feuille en média print.
    expect(html.includes("@media print")).toBe(false);
  });

  it("code-barres complet et QR optionnel", () => {
    const html = buildReceiptTicketHtml(DOC, "80mm", CODES);
    expect(html).toContain("<svg");
    expect(html).toContain('style="max-width:276px;height:auto"');
    expect(html.includes('<div class="t-qr">')).toBe(false);
  });

  it("masque signatures et codes selon le modèle", () => {
    const html = buildReceiptTicketHtml({ ...DOC, hideSigns: true }, "80mm", {
      barcode: "",
      qrSvg: "",
      qrPayload: "",
    });
    expect(html.includes("Signature client")).toBe(false);
    expect(html).toContain("N° FAC-2026-00001");
  });
});
