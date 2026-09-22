// Veloria PoS — Tests OCR : rapprochement produit local.
import { describe, it, expect } from "vitest";
import {
  bigramDice,
  confidenceLabelFr,
  extractBarcodeCandidates,
  matchByName,
  normalizeProductName,
  tokenDice,
} from "@domain/ocr/matcher.ts";
import type { OcrMatchCandidate } from "@domain/ocr/types.ts";

const CANDS: OcrMatchCandidate[] = [
  {
    productId: 1,
    name: "LAIT CANDIA 1L",
    sellingPriceMinor: 16000,
    purchasePriceMinor: 14500,
    quantity: 20,
  },
  {
    productId: 2,
    name: "Sucre Cristal 1KG",
    sellingPriceMinor: 12000,
    purchasePriceMinor: 11000,
    quantity: 30,
  },
  {
    productId: 3,
    name: "Huile Afia 5L",
    sellingPriceMinor: 80000,
    purchasePriceMinor: 72000,
    quantity: 10,
  },
];

describe("OCR matcher", () => {
  it("normalisation (casse, accents, espaces chiffres-unités)", () => {
    expect(normalizeProductName("Lait Candia 1 L")).toBe("lait candia 1l");
    expect(normalizeProductName("SUCRE  CRISTAL-1KG")).toBe("sucre cristal 1kg");
    expect(normalizeProductName("Café moulu 250G")).toBe("cafe moulu 250g");
  });
  it("exact + normalisé → confiance Élevée", () => {
    expect(matchByName("LAIT CANDIA 1L", CANDS).kind).toBe("exact");
    const m = matchByName("Lait Candia 1 L", CANDS);
    expect(m.kind).toBe("normalized");
    expect(m.product?.productId).toBe(1);
    expect(m.confidence).toBe("high");
  });
  it("flou : faute de frappe → Moyenne, inconnu → none/Faible", () => {
    const m = matchByName("Lait Cnadia 1L", CANDS);
    expect(m.product?.productId).toBe(1);
    expect(["fuzzy"]).toContain(m.kind);
    const n = matchByName("Tracteur agricole", CANDS);
    expect(n.kind).toBe("none");
    expect(n.product).toBe(null);
    expect(n.confidence).toBe("low");
  });
  it("arabe : préservé, normalisé, chiffres arabes → 0-9", () => {
    expect(normalizeProductName("خبز")).toBe("خبز");
    expect(normalizeProductName("حليب كانديا ١ل")).toBe("حليب كانديا 1ل");
    expect(normalizeProductName("سُكَّر 1 كغ")).toBe("سكر 1كغ");
  });
  it("arabe : exact + normalisé + flou", () => {
    const cands: OcrMatchCandidate[] = [
      {
        productId: 9,
        name: "خبز",
        sellingPriceMinor: 1500,
        purchasePriceMinor: 1000,
        quantity: 50,
      },
      {
        productId: 10,
        name: "حليب كانديا 1ل",
        sellingPriceMinor: 16000,
        purchasePriceMinor: 14500,
        quantity: 20,
      },
    ];
    expect(matchByName("خبز", cands).kind).toBe("exact");
    const m = matchByName("حليب  كانديا  1 ل", cands);
    expect(m.kind).toBe("normalized");
    expect(m.product?.productId).toBe(10);
    const f = matchByName("حليب كانديا", cands);
    expect(f.product?.productId).toBe(10);
    expect(f.kind).toBe("fuzzy");
  });
  it("barcodes candidats", () => {
    expect(extractBarcodeCandidates("Jus 6111250223456 lot")).toEqual(["6111250223456"]);
    expect(extractBarcodeCandidates("sans code")).toEqual([]);
  });
  it("scores bornés 0–1", () => {
    expect(tokenDice("lait candia", "lait candia")).toBe(1);
    expect(tokenDice("", "x")).toBe(0);
    expect(bigramDice("abc", "abc")).toBe(1);
  });
  it("libellés FR", () => {
    expect(confidenceLabelFr("high")).toBe("Élevée");
    expect(confidenceLabelFr("medium")).toBe("Moyenne");
    expect(confidenceLabelFr("low")).toBe("Faible");
  });
});
