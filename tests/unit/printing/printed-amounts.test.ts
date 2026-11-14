// Veloria PoS — PRINT-01 : comparaison AUTOMATISÉE des montants imprimés
// aux montants persistés.
//
// L'audit a constaté qu'aucun test ne comparait les montants imprimés aux
// totaux persistés. Les tests existants vérifient des aiguilles isolées ;
// celui-ci vérifie la CONSERVATION bout en bout : pour une vente donnée,
// le ticket HTML contient EXACTEMENT les montants que la base stocke.
import { describe, it, expect } from "vitest";
import { buildReceiptTicketHtml } from "../../../electron/printing/receipt-documents/ticket-html";
import { formatMinorDa } from "../../../electron/printing/receipt-documents/amounts";
import type { ReceiptData } from "../../../electron/printing/receipt-documents/common";

// Vente persistée (totaux en centimes) — mêmes valeurs qu'une ligne de
// `sales` / `sale_items`.
const PERSISTED = {
  subtotalMinor: 729000,
  discountMinor: 25000,
  deliveryMinor: 500,
  totalMinor: 704500,
  paidMinor: 500000,
  prevBalanceMinor: 120000,
};

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
  invoice: "FAC-2026-PRINT-01",
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
  subtotalMinor: PERSISTED.subtotalMinor,
  discountMinor: PERSISTED.discountMinor,
  deliveryMinor: PERSISTED.deliveryMinor,
  totalMinor: PERSISTED.totalMinor,
  paidMinor: PERSISTED.paidMinor,
  prevBalanceMinor: PERSISTED.prevBalanceMinor,
  currentBalanceMinor: PERSISTED.prevBalanceMinor + PERSISTED.totalMinor - PERSISTED.paidMinor,
};

describe("PRINT-01 — montants imprimés = montants persistés", () => {
  const html = buildReceiptTicketHtml(DOC, "80mm", {
    barcode: "FAC-2026-PRINT-01",
    qrSvg: "",
    qrPayload: "",
  });

  it("le sous-total imprimé correspond au sous-total persisté", () => {
    expect(html).toContain(formatMinorDa(PERSISTED.subtotalMinor));
  });

  it("la remise imprimée correspond à la remise persistée", () => {
    expect(html).toContain(formatMinorDa(PERSISTED.discountMinor));
  });

  it("la livraison imprimée correspond à la livraison persistée", () => {
    expect(html).toContain(formatMinorDa(PERSISTED.deliveryMinor));
  });

  it("le total vente imprimé correspond au total persisté", () => {
    expect(html).toContain(formatMinorDa(PERSISTED.totalMinor));
  });

  it("le versement imprimé correspond au montant payé persisté", () => {
    expect(html).toContain(formatMinorDa(PERSISTED.paidMinor));
  });

  it("le reste à payer imprimé = total − payé (conservation)", () => {
    const remaining = PERSISTED.totalMinor - PERSISTED.paidMinor;
    const html2 = buildReceiptTicketHtml({ ...DOC, currentBalanceMinor: undefined }, "80mm", {
      barcode: "FAC-2026-PRINT-01",
      qrSvg: "",
      qrPayload: "",
    });
    expect(html2).toContain("Reste à payer");
    expect(html2).toContain(formatMinorDa(remaining));
  });

  it("l'ancien solde imprimé correspond au solde persisté", () => {
    expect(html).toContain(formatMinorDa(PERSISTED.prevBalanceMinor));
  });

  it("le nouveau solde imprimé = ancien + total − payé (conservation)", () => {
    const newBalance = PERSISTED.prevBalanceMinor + PERSISTED.totalMinor - PERSISTED.paidMinor;
    expect(html).toContain(formatMinorDa(newBalance));
  });

  it("chaque ligne de vente : le montant imprimé = line_total_minor persisté", () => {
    // Les montants de tableau sont compacts (sans « DA », sans milliers) —
    // c'est le contrat de `cellMoney` dans ticket-html.ts.
    const compact = (minor: number): string => {
      const raw = formatMinorDa(minor)
        .replace(/ DA$/, "")
        .replace(/[\s\u00a0\u202f]/g, "");
      return raw.endsWith(",00") ? raw.slice(0, -3) : raw;
    };
    for (const line of DOC.lines) {
      expect(html).toContain(compact(line.lineTotalMinor));
      expect(html).toContain(compact(line.unitPriceMinor));
    }
  });

  it("le total des lignes imprimées = sous-total − remise + livraison (cohérence)", () => {
    const linesSum = DOC.lines.reduce((a, l) => a + l.lineTotalMinor, 0);
    expect(linesSum - PERSISTED.discountMinor + PERSISTED.deliveryMinor).toBe(PERSISTED.totalMinor);
  });
});
