// Veloria PoS — Garde R5 (conseil llm-council) : l'alias bridge
// `productsExtra.import` → canal wire `products.import` est gelé.
// Text-scan only (jamais d'import Electron) — runs anywhere.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
const read = (p: string): string => fs.readFileSync(path.join(root, p), "utf-8");

describe("R5 : alias productsExtra.import gelé (ADR-074)", () => {
  it("le canal wire canonique reste products.import", async () => {
    const { IPC_CHANNELS } = await import("../../electron/ipc/channels.ts");
    expect(IPC_CHANNELS["products.import"]).toBe("products.import");
  });
  it("le preload expose productsExtra.import vers ce canal", () => {
    const preload = read("electron/preload/preload.ts");
    expect(preload).toContain("productsExtra: {");
    expect(preload).toContain('IPC_CHANNELS["products.import"]');
  });
  it("le client renderer passe par le namespace productsExtra", () => {
    const client = read("src/shared/types/ipc-client.ts");
    expect(client).toContain("a.productsExtra.import(p)");
  });
  it("le typage renderer déclare le namespace", () => {
    const env = read("src/vite-env.d.ts");
    expect(env).toContain("productsExtra");
  });
});
