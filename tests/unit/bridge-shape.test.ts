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
    const validators = read("electron/ipc/validators.ts");
    const registry = read("electron/ipc/registry.ts");
    const printing = read("electron/printing/printing.service.ts");
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
    ]);
    for (const n of names) {
      if (nested.has(n)) continue;
      const used =
        registry.includes(n) || printing.includes(n) || backup.includes(n) || ocr.includes(n);
      expect(used, `schéma mort: ${n}`).toBe(true);
    }
  });
});
