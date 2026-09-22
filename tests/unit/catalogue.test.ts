// Veloria PoS — Tests : helpers catalogue (tri + statuts, purs).
import { describe, it, expect } from "vitest";
import {
  sortProducts,
  stockLabel,
  stockTone,
  unitLabel,
  type Product,
} from "@features/products/types.ts";

function makeProduct(over: Partial<Product> & { id: number; name: string }): Product {
  return {
    category_id: null,
    category_name: null,
    unit_code: "PIECE",
    purchase_price_minor: 5000,
    selling_price_minor: 10000,
    quantity: 10,
    min_stock_level: 2,
    max_stock_level: 0,
    expiration_date: null,
    stock_status: "in_stock",
    is_active: 1,
    primary_barcode: null,
    ...over,
  };
}

describe("Catalogue helpers", () => {
  it("labels stock status in French", () => {
    expect(stockLabel(makeProduct({ id: 1, name: "A" }))).toBe("En stock");
    expect(stockTone(makeProduct({ id: 1, name: "A" }))).toBe("green");
    expect(stockLabel(makeProduct({ id: 2, name: "B", stock_status: "low_stock" }))).toBe(
      "Stock bas",
    );
    expect(stockTone(makeProduct({ id: 2, name: "B", stock_status: "low_stock" }))).toBe("amber");
    expect(stockLabel(makeProduct({ id: 3, name: "C", stock_status: "out_of_stock" }))).toBe(
      "Rupture",
    );
    expect(stockLabel(makeProduct({ id: 4, name: "D", is_active: 0 }))).toBe("Archivé");
    expect(stockTone(makeProduct({ id: 4, name: "D", is_active: 0 }))).toBe("grey");
  });

  it("sorts without mutating the input", () => {
    const rows = [
      makeProduct({ id: 1, name: "Citron", selling_price_minor: 3000, quantity: 5 }),
      makeProduct({ id: 2, name: "Abricot", selling_price_minor: 9000, quantity: 50 }),
    ];
    expect(sortProducts(rows, "name_asc").map((p) => p.id)).toEqual([2, 1]);
    expect(sortProducts(rows, "price_desc").map((p) => p.id)).toEqual([2, 1]);
    expect(sortProducts(rows, "stock_asc").map((p) => p.id)).toEqual([1, 2]);
    expect(rows[0]?.id).toBe(1); // entrée intacte
  });

  it("labels units in French with fallback", () => {
    expect(unitLabel("KG")).toBe("Kilogramme");
    expect(unitLabel("??")).toBe("??");
  });
});
