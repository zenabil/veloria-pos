// Veloria — Validators inventory lock (File Splitter guard).
// The barrel validators.ts must re-export every schema: count of
// `export const XSchema` across validators.*.ts equals the frozen total.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const MODULES = [
  "validators.common.ts",
  "validators.catalog.ts",
  "validators.customers.ts",
  "validators.sales.ts",
  "validators.documents.ts",
  "validators.finance.ts",
  "validators.stock.ts",
  "validators.settings.ts",
  "validators.print.ts",
  "validators.templates.ts",
];

// ADR-075 (2026-10-09) : 125 → 122 (cartsClearSchema, customersImportSchema,
// periodSchema retirés avec leurs canaux morts ; closingsListSchema inliné).
const FROZEN_SCHEMA_COUNT = 122;
const FROZEN_MAX_LINES = 300;

describe("Validators inventory (split guard)", () => {
  it("schema count unchanged (no schema added/lost by the split)", () => {
    const root = path.resolve(__dirname, "../../electron/ipc");
    let total = 0;
    for (const m of MODULES) {
      const text = fs.readFileSync(path.join(root, m), "utf8");
      total += [...text.matchAll(/^export const (\w+Schema)/gm)].length;
    }
    expect(total).toBe(FROZEN_SCHEMA_COUNT);
  });

  it("every module stays under the size cap", () => {
    const root = path.resolve(__dirname, "../../electron/ipc");
    for (const m of MODULES) {
      const lines = fs.readFileSync(path.join(root, m), "utf8").split("\n").length;
      expect(lines, `${m} dépasse ${FROZEN_MAX_LINES}`).toBeLessThanOrEqual(FROZEN_MAX_LINES);
    }
  });
});
