import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Contrats statiques du bridge (sans Electron) :
// - chaque canal IPC est exposé par le preload (pas de canal mort) ;
// - le preload ne touche ni fs/sqlite/enfant-processus ni SQL générique ;
// - chaque validateur Zod est consommé (pas de schéma mort).
const root = process.cwd();
const read = (p: string): string => fs.readFileSync(path.join(root, p), "utf-8");

function channels(): string[] {
  return [...read("electron/ipc/channels.ts").matchAll(/"([a-z0-9.]+)":/g)].map((m) => m[1] ?? "");
}

describe("Preload bridge shape", () => {
  it("exposes every IPC channel", () => {
    const pre = read("electron/preload/preload.ts");
    for (const c of channels()) {
      expect(pre.includes(`"${c}"`), `canal manquant dans preload: ${c}`).toBe(true);
    }
  });

  it("denies unsafe APIs in preload", () => {
    const pre = read("electron/preload/preload.ts");
    for (const banned of ["child_process", "better-sqlite3", "node:fs", "run-sql", "execute("]) {
      expect(pre.includes(banned), `API interdite dans preload: ${banned}`).toBe(false);
    }
  });

  it("uses every Zod validator", () => {
    const ipcDir = "electron/ipc";
    const validatorFiles = [
      "validators.ts",
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
    const validators = validatorFiles.map((f) => read(`${ipcDir}/${f}`)).join("\n");
    const registryFiles = [
      "electron/ipc/registry.ts",
      "electron/ipc/registry.core.ts",
      "electron/ipc/registry.recovery.ts",
      "electron/ipc/registry.catalog.ts",
      "electron/ipc/registry.sales.ts",
      "electron/ipc/registry.customers.ts",
      "electron/ipc/registry.finance.ts",
      "electron/ipc/registry.stock.ts",
      "electron/ipc/registry.documents.ts",
      "electron/ipc/registry.system.ts",
      "electron/ipc/handle.ts",
      "electron/ipc/credit-gates.ts",
    ];
    const registry = registryFiles.map(read).join("\n");
    // Decoupage printing.service : l'union des modules printing porte les schemas.
    const printingFiles = fs
      .readdirSync(path.join(root, "electron/printing"))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => `electron/printing/${f}`);
    const printing = printingFiles.map(read).join("\n");
    const backup = read("electron/backup/backup.service.ts");
    const ocr = read("electron/ocr/ocr.service.ts");
    const names = [...validators.matchAll(/export const (\w+Schema)/g)].map((m) => m[1] ?? "");
    expect(names.length).toBeGreaterThan(10);
    // Composants imbriqués : vérifiés structurellement (pas seulement listés).
    expect(
      validators.includes("z.array(saleItemSchema)"),
      "saleItemSchema ⊂ saleCreateSchema",
    ).toBe(true);
    expect(
      validators.includes("z.array(purchaseLineSchema)"),
      "purchaseLineSchema ⊂ purchaseCreateSchema",
    ).toBe(true);
    expect(validators.includes("z.array(cartLineSchema)"), "cartLineSchema ⊂ cartsSaveSchema").toBe(
      true,
    );
    expect(
      validators.includes("z.array(printLineSchema)"),
      "printLineSchema ⊂ printPayloadSchema",
    ).toBe(true);
    const nested = new Set([
      "saleItemSchema",
      "printLineSchema",
      "labelItemSchema",
      "labelFormatSchema",
      "purchaseLineSchema",
      "cartLineSchema",
      "printFormatSchema",
      "paymentTicketFormatSchema",
      "templateDocTypeSchema",
      "templatePaperSchema",
    ]);
    for (const n of names) {
      if (nested.has(n)) continue;
      const used =
        registry.includes(n) || printing.includes(n) || backup.includes(n) || ocr.includes(n);
      expect(used, `schéma mort: ${n}`).toBe(true);
    }
  });
});
