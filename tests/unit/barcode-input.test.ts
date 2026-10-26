import { describe, expect, it } from "vitest";
import { normalizeBarcodeValue, uppercaseBarcodeInput } from "@/shared/ui/barcode-input.ts";

describe("barcode-input", () => {
  it("met les lettres ASCII en majuscules sans toucher aux accents", () => {
    expect(uppercaseBarcodeInput("ab-12x")).toBe("AB-12X");
    expect(uppercaseBarcodeInput("café-12")).toBe("CAFé-12");
    expect(uppercaseBarcodeInput("")).toBe("");
  });

  it("normalise la valeur stockée (bords retirés, casse ASCII montée)", () => {
    expect(normalizeBarcodeValue("  ab-12x  ")).toBe("AB-12X");
    expect(normalizeBarcodeValue("   ")).toBe("");
  });
});
