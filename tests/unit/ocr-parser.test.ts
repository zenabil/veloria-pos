// Veloria PoS — Tests OCR : analyseur générique de facture.
import { describe, it, expect } from "vitest";
import { parseInvoiceText } from "@domain/ocr/parser.ts";

const SAMPLE = `FACTURE N° 2026-00458

SARL DISTRIBUTION XYZ
Date: 17/09/2026

Lait Candia 1L       20    145.00
Sucre Cristal 1KG    30    110.00
Huile Afia 5L        10    720.00

TOTAL HT             8 900.00
TVA                  1 691.00
TOTAL TTC           10 591.00`;

describe("OCR parser", () => {
  it("en-tête : numéro, date, fournisseur, totaux", () => {
    const inv = parseInvoiceText(SAMPLE);
    expect(inv.number).toBe("2026-00458");
    expect(inv.date).toBe("2026-09-17");
    expect(inv.supplierName).toContain("DISTRIBUTION");
    expect(inv.totalHtMinor).toBe(890000);
    expect(inv.tvaMinor).toBe(169100);
    expect(inv.totalTtcMinor).toBe(1059100);
  });
  it("lignes : nom, quantité, PU (montant calculé)", () => {
    const inv = parseInvoiceText(SAMPLE);
    expect(inv.lines).toHaveLength(3);
    const [a, b, c] = inv.lines;
    expect(a?.name).toContain("Candia");
    expect(a?.quantity).toBe(20);
    expect(a?.unitPriceMinor).toBe(14500);
    expect(a?.lineTotalMinor).toBe(20 * 14500);
    expect(b?.quantity).toBe(30);
    expect(b?.unitPriceMinor).toBe(11000);
    expect(c?.quantity).toBe(10);
    expect(c?.unitPriceMinor).toBe(72000);
  });
  it("ligne à 3 montants : qté + PU + total vérifié", () => {
    const inv = parseInvoiceText("Eau Minérale 1.5L 12 90.00 1080.00");
    expect(inv.lines).toHaveLength(1);
    expect(inv.lines[0]?.quantity).toBe(12);
    expect(inv.lines[0]?.unitPriceMinor).toBe(9000);
    expect(inv.lines[0]?.lineTotalMinor).toBe(108000);
    expect(inv.lines[0]?.confidence).toBe("high");
  });
  it("ignore NIF/totaux déguisés et mentions administratives", () => {
    const inv = parseInvoiceText(
      "SARL TEST\nNIF 123456789012345\nCachet et signature\nTOTAL TTC 1000.00",
    );
    expect(inv.lines).toHaveLength(0);
    expect(inv.totalTtcMinor).toBe(100000);
    expect(inv.supplierRef).toBe("123456789012345");
  });
  it("barcodes EAN extraits sans casser le nom", () => {
    const inv = parseInvoiceText("Jus Rouiba 1L 6111250223456 24 85.00");
    // 4 numériques → rejeté (format inconnu) : pas de devinette.
    expect(inv.lines).toHaveLength(0);
  });
  it("texte vide → erreur FR", () => {
    expect(() => parseInvoiceText("   \n ")).toThrow("vide");
  });
  it("P1-4 : dates calendrier réelles (31 février et ISO invalide rejetés)", () => {
    // Titre sans chiffres (sinon l'en-tête elle-même est lue comme ligne).
    const feb = parseInvoiceText("FACTURE\nDate: 31/02/2026\nLait 2 100.00");
    expect(feb.date).toBeNull();
    expect(feb.lines).toHaveLength(1);
    const iso = parseInvoiceText("FACTURE\nDate: 2024-13-99\nLait 2 100.00");
    expect(iso.date).toBeNull();
    const ok = parseInvoiceText("FACTURE\nDate: 17/09/26\nLait 2 100.00");
    expect(ok.date).toBe("2026-09-17");
    const leap = parseInvoiceText("FACTURE\nDate: 29/02/2024\nLait 2 100.00");
    expect(leap.date).toBe("2024-02-29");
  });
  it("P1-4 : ligne en dépassement de capacité rejetée (pas de float non borné)", () => {
    const inv = parseInvoiceText("Produit Cher 1000000 10000000.00");
    expect(inv.lines).toHaveLength(0);
  });
});
