// Veloria — IPC channel inventory lock (File Splitter guard).
// Proves a pure code-move split adds/loses NO channel: the union of
// `handle(IPC_CHANNELS["x"])` across registry modules + service-owned
// registrations must equal the checked-in snapshot byte for byte.
// No Electron import (text scan only) — runs anywhere.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { IPC_CHANNELS } from "../../electron/ipc/channels.ts";

// Push-only events (main -> renderer, webContents.send, never handle()).
// G-08 : `ocr.progress` est un événement push (electron/ocr/ocr.service.ts :
// `win.webContents.send(IPC_CHANNELS["ocr.progress"], …)`) — il était absent
// d'ici, et le test passait pour la MAUVAISE raison (la chaîne
// `IPC_CHANNELS["ocr.progress"]` apparaissait dans le source, donc le canal
// comptait comme « servi »). La liste est donc vérifiée explicitement.
const PUSH_ONLY = new Set(["window.maximizedChanged", "ocr.progress"]);

const SCANNED = [
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
  "electron/ipc/registry.staff.ts",
  "electron/backup/backup.service.ts",
  "electron/printing/printing.service.ts",
  "electron/printing/printing.receipt.ts",
  "electron/printing/printing.proforma.ts",
  "electron/printing/printing.reports-labels.ts",
  "electron/printing/printing.payment.ts",
  "electron/printing/printing.logistics.ts",
  "electron/printing/printing.pdf-exports.ts",
  "electron/printing/printing.studio.ts",
  "electron/ocr/ocr.service.ts",
];

function handledChannels(root: string): string[] {
  const found = new Set<string>();
  for (const rel of SCANNED) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, "utf8");
    for (const m of text.matchAll(/IPC_CHANNELS\["([^"]+)"\]/g)) {
      const channel = m[1];
      if (channel !== undefined) found.add(channel);
    }
  }
  return [...found].sort();
}

describe("IPC channel inventory (split guard)", () => {
  it("handled set equals snapshot (no channel added/lost by the split)", () => {
    const root = path.resolve(__dirname, "../..");
    const snap = JSON.parse(
      fs.readFileSync(path.join(root, "tests/unit/__snapshots__/ipc-channels.json"), "utf8"),
    ) as string[];
    expect(handledChannels(root)).toEqual([...snap].sort());
  });

  it("every defined channel is handled or push-only", () => {
    const root = path.resolve(__dirname, "../..");
    const handled = new Set(handledChannels(root));
    for (const key of Object.keys(IPC_CHANNELS)) {
      expect(handled.has(key) || PUSH_ONLY.has(key)).toBe(true);
    }
  });

  it("G-08 : les canaux push-only sont bien des ÉVÉNEMENTS (jamais handle())", () => {
    const root = path.resolve(__dirname, "../..");
    const pushOnly = [...PUSH_ONLY];
    expect(pushOnly.length).toBeGreaterThan(0);
    for (const channel of pushOnly) {
      // 1. Jamais enregistrés comme handler (ni `handle(...)` central, ni
      //    `ipcMain.handle(...)` brut) : un canal push n'est pas invoquable.
      for (const rel of SCANNED) {
        const abs = path.join(root, rel);
        if (!fs.existsSync(abs)) continue;
        const text = fs.readFileSync(abs, "utf8");
        const served = new RegExp(
          `(?:handle|ipcMain\\.handle)\\(\\s*IPC_CHANNELS\\["${channel.replace(".", "\\.")}"\\]`,
        ).test(text);
        expect(served, `${channel} est push-only mais enregistré comme handler (${rel})`).toBe(
          false,
        );
      }
      // 2. Émis vers le renderer via webContents.send (l'événement existe).
      const sources = [
        "electron/ocr/ocr.service.ts",
        "electron/main.ts",
        "electron/main/window-manager.ts",
        "electron/window-manager.ts",
        "electron/window/window-manager.ts",
      ];
      const sent = sources.some((rel) => {
        const abs = path.join(root, rel);
        if (!fs.existsSync(abs)) return false;
        return new RegExp(
          `webContents\\.send\\(\\s*IPC_CHANNELS\\["${channel.replace(".", "\\.")}"\\]`,
        ).test(fs.readFileSync(abs, "utf8"));
      });
      expect(sent, `${channel} : push-only sans webContents.send`).toBe(true);
    }
  });
});
