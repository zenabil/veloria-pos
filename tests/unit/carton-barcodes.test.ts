// Veloria PoS — Codes-barres de carton : normalisation, validation et unités
// ajoutées par un scan. Le code ne porte ni facteur ni prix (ADR-136).
import { describe, it, expect } from "vitest";
import {
  CARTON_BARCODE_MAX,
  cartonScanUnits,
  normalizeCartonBarcodes,
  validateCartonBarcodes,
} from "@domain/packaging/carton-barcodes.ts";

describe("normalizeCartonBarcodes", () => {
  it("majuscule, déduplique et vide les jetons vides", () => {
    expect(
      normalizeCartonBarcodes([" 619abc ", "619ABC", "", null, undefined, "  ", "CARTON-16"]),
    ).toEqual(["619ABC", "CARTON-16"]);
  });

  it("ne touche pas aux accents (recherche FR des libellés)", () => {
    expect(normalizeCartonBarcodes(["cartón×16"])).toEqual(["CARTÓN×16"]);
  });
});

describe("validateCartonBarcodes", () => {
  it("accepte des codes internes et un EAN-13 valide", () => {
    expect(() => validateCartonBarcodes(["CARTON-16", "6191000000016"])).not.toThrow();
  });

  it("refuse un EAN dont la clé de contrôle est fausse", () => {
    expect(() => validateCartonBarcodes(["6191000000017"])).toThrow(/clé de contrôle/);
  });

  it("refuse au-delà du nombre maximum de codes", () => {
    const codes = Array.from({ length: CARTON_BARCODE_MAX + 1 }, (_, i) => `C${i}`);
    expect(() => validateCartonBarcodes(codes)).toThrow(/maximum/);
  });

  it("refuse un code vide", () => {
    expect(() => validateCartonBarcodes([""])).toThrow(/vide/i);
  });
});

describe("cartonScanUnits", () => {
  it("un code lié au conditionnement actif ajoute un carton", () => {
    expect(cartonScanUnits({ barcodePackagingId: 7, packagingFactor: 16 })).toBe(16);
  });

  it("un code pièce (aucune liaison) ajoute une unité", () => {
    expect(cartonScanUnits({ barcodePackagingId: null, packagingFactor: 16 })).toBe(1);
    expect(cartonScanUnits({})).toBe(1);
  });

  it("ignore une liaison sans facteur exploitable", () => {
    expect(cartonScanUnits({ barcodePackagingId: 7, packagingFactor: null })).toBe(1);
    expect(cartonScanUnits({ barcodePackagingId: 7, packagingFactor: 1 })).toBe(1);
    expect(cartonScanUnits({ barcodePackagingId: 7, packagingFactor: 2.5 })).toBe(1);
    expect(cartonScanUnits({ barcodePackagingId: 0, packagingFactor: 16 })).toBe(1);
    expect(cartonScanUnits({ barcodePackagingId: 7, packagingFactor: 2_000_000 })).toBe(1);
  });
});
