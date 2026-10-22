// Veloria PoS — Format de page des tickets thermiques + code-barres calibré.
// Constat propriétaire 2026-10-22 (« grand blanc après le code-barres ») :
// (1) le ticket n'imposait aucun `pageSize` ⇒ Chromium imprimait au format du
// pilote (A4 / 297 mm) et le rouleau sortait avec un grand blanc après le bloc
// codes ; (2) le Code 39 n'était jamais mis à l'échelle (462 px dans une
// colonne de 280/200 px) ⇒ barre coupée et numéro lisible hors zone.
import { describe, it, expect } from "vitest";
import {
  measureContentPx,
  micronsToInches,
  thermalPageSize,
} from "../../../electron/printing/printing.page-size";
import { code39ModuleFor, code39Svg } from "../../../electron/printing/receipt-documents/barcode39";
import { thermalHtml } from "../../../electron/printing/receipt-documents/thermal";

const INVOICE = "FAC-2026-00001";

/** Largeur déclarée du SVG (attribut width, hors style CSS). */
function svgWidth(svg: string): number {
  const m = /<svg[^>]*\swidth="([\d.]+)"/.exec(svg);
  return m ? Number(m[1]) : 0;
}

describe("thermalPageSize — la page suit le contenu (fin du grand blanc)", () => {
  it("80 mm : largeur papier + hauteur du contenu + marge de coupe", () => {
    // 700 px CSS × 264,583 µm = 185 208 µm + 3 mm de coupe.
    expect(thermalPageSize("80mm", 700)).toEqual({ width: 80_000, height: 188_208 });
  });

  it("58 mm : même calcul sur le papier étroit", () => {
    expect(thermalPageSize("58mm", 500)).toEqual({ width: 58_000, height: 135_292 });
  });

  it("hauteur non mesurable : plancher 30 mm (jamais de page dégénérée)", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(thermalPageSize("80mm", bad)).toEqual({ width: 80_000, height: 30_000 });
    }
  });
});

describe("micronsToInches — unité attendue par printToPDF (pouces, pas microns)", () => {
  it("25 400 µm = 1 po ; 80 mm = 3,1496 po", () => {
    expect(micronsToInches(25_400)).toBe(1);
    expect(micronsToInches(80_000)).toBeCloseTo(3.1496, 4);
    expect(micronsToInches(0)).toBe(0);
  });
});

describe("measureContentPx — hauteur réelle du document imprimé", () => {
  it("renvoie la hauteur mesurée par la fenêtre d'impression", async () => {
    const contents = { executeJavaScript: (): Promise<unknown> => Promise.resolve(812) };
    await expect(measureContentPx(contents)).resolves.toBe(812);
  });

  it("valeur inattendue ou mesure en échec ⇒ 0 (repli, jamais de troncature)", async () => {
    await expect(
      measureContentPx({ executeJavaScript: (): Promise<unknown> => Promise.resolve("812") }),
    ).resolves.toBe(0);
    await expect(
      measureContentPx({ executeJavaScript: (): Promise<unknown> => Promise.resolve(0) }),
    ).resolves.toBe(0);
    await expect(
      measureContentPx({
        executeJavaScript: (): Promise<unknown> => Promise.reject(new Error("webContents détruit")),
      }),
    ).resolves.toBe(0);
  });
});

describe("code39ModuleFor — le Code 39 tient dans la colonne du papier", () => {
  it("80 mm : module réduit à 1,1 px, barre complète dans 280 px", () => {
    expect(code39ModuleFor(INVOICE, 280)).toBe(1.1);
    expect(svgWidth(code39Svg(INVOICE, 40, 1.1))).toBeLessThanOrEqual(280);
  });

  it("58 mm : module plancher 1 px (sous 1 px illisible au scan)", () => {
    expect(code39ModuleFor(INVOICE, 200)).toBe(1);
    // 1 px reste plus large que la colonne : le plafond CSS prend le relais.
    expect(svgWidth(code39Svg(INVOICE, 40, 1))).toBeLessThanOrEqual(255);
  });

  it("plafond 2 px, repli 2 px si rien d'encodable ou largeur nulle", () => {
    expect(code39ModuleFor(INVOICE, 10_000)).toBe(2);
    expect(code39ModuleFor("", 280)).toBe(2);
    expect(code39ModuleFor("!!!", 280)).toBe(2);
    expect(code39ModuleFor(INVOICE, 0)).toBe(2);
    expect(code39ModuleFor(INVOICE, Number.NaN)).toBe(2);
  });
});

describe("thermalHtml — code-barres complet et non rogné", () => {
  const codes = { barcode: INVOICE, qrSvg: "<svg></svg>", qrPayload: "VELORIA|X" };

  it("80 mm : SVG plafonné à 280 px (proportions conservées)", () => {
    const html = thermalHtml("TICKET", "80mm", codes);
    expect(html).toContain('style="max-width:280px;height:auto"');
    const svg = /<svg[\s\S]*?<\/svg>/.exec(html)?.[0] ?? "";
    expect(svgWidth(svg)).toBeLessThanOrEqual(280);
    // Le numéro lisible reste sous la barre.
    expect(html).toContain(INVOICE);
  });

  it("58 mm : SVG plafonné à 200 px (proportions conservées)", () => {
    const html = thermalHtml("TICKET", "58mm", codes);
    expect(html).toContain('style="max-width:200px;height:auto"');
  });

  it("sans code-barres : aucun SVG Code 39 injecté", () => {
    expect(thermalHtml("TICKET", "80mm", { qrSvg: "", qrPayload: "" })).not.toContain("<svg");
  });

  it("le module fin ne perd aucune barre (16 glyphes × 5 barres)", () => {
    const svg = code39Svg(INVOICE, 40, 1.1);
    expect((svg.match(/<rect /g) ?? []).length).toBe(16 * 5);
  });
});
