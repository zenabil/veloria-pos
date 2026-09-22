// Veloria PoS — Tests de non-régression : réparations racine (P01/P04/P06/RX-18/BL).
// Chaque test = Bug ID + cause racine + résultat attendu. Aucun skip.
import { describe, it, expect } from "vitest";
import path from "node:path";

import { totalsOf, buildSalePayload } from "@/application/sales/create-sale.ts";
import {
  saleCreateSchema,
  printPayloadSchema,
  historyListSchema,
} from "../../electron/ipc/validators.ts";
import {
  licenseCapabilitiesSchema,
  licenseRenewSchema,
} from "../../license-manager/ipc/validators.ts";
import { resolvePackagedAbs } from "../../electron/licensing/integrity.ts";
import { toCsv } from "@/shared/export/csv.ts";
import { assertLogoMagic } from "../../electron/services/logo.ts";

function line(
  price: number,
  qty: number,
  name = "Huile 5L",
): {
  key: string;
  productId: number;
  productName: string;
  unitCode: string;
  originalUnitPriceMinor: number;
  unitPriceMinor: number;
  purchasePriceMinor: number;
  quantity: number;
} {
  return {
    key: "l1",
    productId: 7,
    productName: name,
    unitCode: "PIECE",
    originalUnitPriceMinor: price,
    unitPriceMinor: price,
    purchasePriceMinor: 8000,
    quantity: qty,
  };
}

describe("P0-7 — remise par prix unitaire (remplace P01/DB-10 percent)", () => {
  it("totalsOf : (original − final) × qty = remise (20000 → 19500 = 500)", () => {
    const t = totalsOf({
      lines: [{ ...line(20000, 1), unitPriceMinor: 19500 }],
      deliveryFeeMinor: 0,
      amountPaidMinor: 0,
    });
    // 20000 − 19500 = 500 de remise.
    expect(t.discountAmountMinor).toBe(500);
    expect(t.totalMinor).toBe(19500);
  });

  it("saleCreateSchema : clés discount legacy ignorées, original exigé", () => {
    const parsed = saleCreateSchema.parse({
      operationId: "123e4567-e89b-12d3-a456-426614174000",
      lines: [
        {
          productId: 1,
          productName: "X",
          unitCode: "PIECE",
          originalUnitPriceMinor: 1000,
          unitPriceMinor: 900,
          purchasePriceMinor: 0,
          quantity: 1,
        },
      ],
      discountType: "percent",
      discountValueMinor: 101,
      deliveryFeeMinor: 0,
      amountPaidMinor: 0,
    });
    // Clés inconnues dépouillées (compat) : pas de discountType dans le contrat.
    expect("discountType" in parsed).toBe(false);
    expect("discountValueMinor" in parsed).toBe(false);
    expect(() =>
      saleCreateSchema.parse({
        operationId: "123e4567-e89b-12d3-a456-426614174000",
        lines: [
          {
            productId: 1,
            productName: "X",
            unitCode: "PIECE",
            originalUnitPriceMinor: -5,
            unitPriceMinor: 900,
            purchasePriceMinor: 0,
            quantity: 1,
          },
        ],
        deliveryFeeMinor: 0,
        amountPaidMinor: 0,
      }),
    ).toThrow();
  });

  it("buildSalePayload transmet l'operationId + prix origine/facturé", () => {
    const p = buildSalePayload({
      lines: [{ ...line(20000, 1), unitPriceMinor: 19500 }],
      deliveryFeeMinor: 0,
      amountPaidMinor: 19500,
      customerId: null,
      paymentMethod: "cash",
      operationId: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(p.operationId).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(p.lines[0]).toMatchObject({ originalUnitPriceMinor: 20000, unitPriceMinor: 19500 });
    expect(p.totals.discountAmountMinor).toBe(500);
  });
});

function ticket(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    company: "Veloria",
    invoice: "FAC-1",
    date: "01/01/2026",
    lines: [
      {
        name: "Huile",
        qty: 2,
        unit: "PIECE",
        unitPriceMinor: 10000,
        lineTotalMinor: 20000,
        ref: "",
      },
    ],
    subtotalMinor: 20000,
    discountMinor: 0,
    deliveryMinor: 0,
    totalMinor: 20000,
    paidMinor: 20000,
    ...over,
  };
}

describe("P04 — ticket incohérent rejeté à la frontière", () => {
  it("accepte un ticket cohérent", () => {
    expect(() => printPayloadSchema.parse(ticket())).not.toThrow();
  });
  it("rejette ligne ≠ prix×qté", () => {
    expect(() =>
      printPayloadSchema.parse(
        ticket({
          lines: [
            { name: "H", qty: 2, unit: "", unitPriceMinor: 10000, lineTotalMinor: 19999, ref: "" },
          ],
        }),
      ),
    ).toThrow();
  });
  it("rejette sous-total ≠ Σ lignes", () => {
    expect(() => printPayloadSchema.parse(ticket({ subtotalMinor: 1 }))).toThrow();
  });
  it("rejette total ≠ subtotal-remise+livraison", () => {
    expect(() => printPayloadSchema.parse(ticket({ totalMinor: 1 }))).toThrow();
  });
  it("rejette remise > sous-total", () => {
    expect(() =>
      printPayloadSchema.parse(ticket({ discountMinor: 20001, totalMinor: -1 })),
    ).toThrow();
  });
});

describe("P06 — historique borné à 200", () => {
  it("200 passe, 201 échoue", () => {
    expect(() => historyListSchema.parse({ op: "all", pageSize: 200 })).not.toThrow();
    expect(() => historyListSchema.parse({ op: "all", pageSize: 201 })).toThrow();
  });
});

describe("RX-18 — CSV anti-injection", () => {
  it("préfixe = + - @ | %", () => {
    const csv = toCsv([
      { ref: "=CMD|calc", label: "+SUM(A1)", note: "@link", pct: "%x", bar: "|y", ok: "Huile" },
    ]);
    expect(csv).toContain("'=CMD|calc");
    expect(csv).toContain("'+SUM(A1)");
    expect(csv).toContain("'@link");
    expect(csv).toContain("'|y");
    expect(csv).toContain("Huile");
  });
  it("nombres non préfixés", () => {
    const csv = toCsv([{ amount: 1500 }]);
    expect(csv).toContain('"1500"');
    expect(csv).not.toContain(`"'1500"`);
  });
});

describe("EL-31 — logo octets magiques", () => {
  it("accepte PNG/JPEG valides, refuse croisés", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]);
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    expect(() => assertLogoMagic(png, "a.png")).not.toThrow();
    expect(() => assertLogoMagic(jpg, "a.jpg")).not.toThrow();
    expect(() => assertLogoMagic(jpg, "a.png")).toThrow();
    expect(() => assertLogoMagic(png, "a.jpg")).toThrow();
    expect(() => assertLogoMagic(Buffer.from([1, 2, 3]), "a.png")).toThrow();
  });
});

describe("P7 — manager : renouvellement et capabilities explicites", () => {
  it("renew term exige durée ou date de fin", () => {
    expect(() => licenseRenewSchema.parse({ id: 1, licenseType: "term" })).toThrow();
    expect(() =>
      licenseRenewSchema.parse({ id: 1, licenseType: "term", durationMonths: 12 }),
    ).not.toThrow();
    expect(() => licenseRenewSchema.parse({ id: 1, licenseType: "lifetime" })).not.toThrow();
  });
  it("capabilities refuse features: [] (anti-wipe accidentel)", () => {
    expect(() => licenseCapabilitiesSchema.parse({ id: 1, features: [], pages: null })).toThrow();
    expect(() =>
      licenseCapabilitiesSchema.parse({ id: 1, features: ["ocr"], pages: null }),
    ).not.toThrow();
  });
});

describe("BL-03 — intégrité packagée : extraResources résolus sous resourcesPath", () => {
  const root = path.join("C:", "app", "resources", "app.asar");
  const res = path.join("C:", "app", "resources");
  it("dist dans l'asar, extraResources hors asar", () => {
    expect(resolvePackagedAbs("dist-electron/main/main.js", root, res)).toBe(
      path.join(root, "dist-electron/main/main.js"),
    );
    expect(resolvePackagedAbs("resources/license/public.key", root, res)).toBe(
      path.join(res, "license/public.key"),
    );
    expect(resolvePackagedAbs("database/migrations/0001_initial_schema.sql", root, res)).toBe(
      path.join(res, "database/migrations/0001_initial_schema.sql"),
    );
    expect(resolvePackagedAbs("resources/ocr/lang/fra.traineddata", root, res)).toBe(
      path.join(res, "ocr/lang/fra.traineddata"),
    );
    expect(resolvePackagedAbs("public/icons/icon.ico", root, res)).toBe(
      path.join(res, "icons/icon.ico"),
    );
  });
});
