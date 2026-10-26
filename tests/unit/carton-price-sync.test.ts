import { describe, expect, it } from "vitest";
import {
  cartonPriceFromUnit,
  unitPriceFromCarton,
} from "../../src/domain/packaging/carton-price-sync.ts";

describe("carton-price-sync", () => {
  it("calcule le carton depuis le prix pièce (œufs 25 × 30 = 750)", () => {
    expect(cartonPriceFromUnit(25_00, 30)).toBe(750_00);
    expect(cartonPriceFromUnit(0, 12)).toBe(0);
  });

  it("calcule le prix pièce depuis le carton avec arrondi au centime", () => {
    expect(unitPriceFromCarton(650_00, 30)).toBe(21_67);
    expect(unitPriceFromCarton(750_00, 30)).toBe(25_00);
    expect(unitPriceFromCarton(100, 3)).toBe(33);
  });

  it("refuse un facteur ou un montant invalide", () => {
    expect(cartonPriceFromUnit(1000, 1)).toBeNull();
    expect(cartonPriceFromUnit(1000, 0)).toBeNull();
    expect(cartonPriceFromUnit(1000, 2.5)).toBeNull();
    expect(cartonPriceFromUnit(-1, 12)).toBeNull();
    expect(unitPriceFromCarton(1000, 1)).toBeNull();
    expect(unitPriceFromCarton(Number.NaN, 12)).toBeNull();
  });

  it("refuse un total hors bornes au lieu de produire un montant faux", () => {
    expect(cartonPriceFromUnit(1_000_000_000, 2)).toBeNull();
  });
});
