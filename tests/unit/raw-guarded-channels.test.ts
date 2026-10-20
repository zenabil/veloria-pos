// Veloria PoS — G-01 / B-01 / G-12 (audit 2026-10-19) : les canaux IPC BRUTS
// sont énumérés par SCAN COMPLET du dossier `electron/` (pas une liste de
// fichiers figée) et comparés à `RAW_GUARDED_CHANNELS`.
//
// Avant : `RAW_GUARDED_CHANNELS` n'était lu par AUCUN code (constante
// décorative) et ne couvrait pas les 5 canaux bruts non gardés (liste
// périmée). Un nouveau handler brut pouvait donc être ajouté SANS porte.
//
// Maintenant : la constante est APPLIQUÉE — un handler brut sans
// `enforceRawChannelGates` et sans justification écrite fait échouer la suite.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAW_GUARDED_CHANNELS, RAW_UNGUARDED_CHANNELS } from "../../electron/ipc/raw-guards";
import { IPC_CHANNELS } from "../../electron/ipc/channels";

const root = path.resolve(__dirname, "../..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** Tous les fichiers `electron/` (hors `handle.ts`, l'enveloppe universelle). */
const ELECTRON_FILES = walk(path.join(root, "electron")).filter(
  (f) => path.basename(f) !== "handle.ts",
);

/** Les commentaires sont retirés : un exemple dans une doc-comment ne doit
 *  pas compter comme un handler (sinon la garde crible sur du texte). */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Canaux enregistrés en RAW (`ipcMain.handle(IPC_CHANNELS["x"])`). */
function rawChannels(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of ELECTRON_FILES) {
    const text = stripComments(fs.readFileSync(file, "utf8"));
    const rel = path.relative(root, file).replace(/\\/g, "/");
    for (const m of text.matchAll(/ipcMain\.handle\(\s*IPC_CHANNELS\["([^"]+)"\]/g)) {
      const channel = m[1];
      if (channel) found.set(channel, rel);
    }
  }
  return found;
}

/** Canaux qui passent par la garde `enforceRawChannelGates`. */
function guardedChannels(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of ELECTRON_FILES) {
    const text = stripComments(fs.readFileSync(file, "utf8"));
    const rel = path.relative(root, file).replace(/\\/g, "/");
    for (const m of text.matchAll(/enforceRawChannelGates\(\s*IPC_CHANNELS\["([^"]+)"\]/g)) {
      const channel = m[1];
      if (channel) found.set(channel, rel);
    }
  }
  return found;
}

describe("G-01 : les canaux IPC bruts sont énumérés par scan complet", () => {
  it("le scan trouve des canaux bruts (garde non vacuous)", () => {
    const raw = rawChannels();
    expect(raw.size).toBeGreaterThan(20);
    // Les 5 familles de canaux bruts sont présentes (référence de l'audit).
    const families = new Set([...raw.keys()].map((c) => c.split(".")[0] ?? ""));
    for (const family of ["backup", "ocr", "printing", "printer", "templates", "recovery"]) {
      expect(families.has(family), `famille brute absente : ${family}`).toBe(true);
    }
  });

  it("RAW_GUARDED_CHANNELS = exactement les canaux bruts qui passent la garde", () => {
    const guarded = guardedChannels();
    expect([...RAW_GUARDED_CHANNELS].sort()).toEqual([...guarded.keys()].sort());
  });

  it("tout canal brut non gardé est JUSTIFIÉ (liste explicite + raison)", () => {
    const raw = rawChannels();
    const guarded = new Set(RAW_GUARDED_CHANNELS);
    const unguarded = [...raw.keys()].filter((c) => !guarded.has(c));
    expect(unguarded.length).toBeGreaterThan(0);
    for (const channel of unguarded) {
      const reason = RAW_UNGUARDED_CHANNELS[channel];
      expect(reason, `canal brut non gardé sans justification : ${channel}`).toBeTruthy();
      expect(String(reason).length).toBeGreaterThan(20);
    }
    // Les deux listes sont disjointes ET couvrent tous les canaux bruts.
    const exceptions = Object.keys(RAW_UNGUARDED_CHANNELS);
    expect(exceptions.filter((c) => guarded.has(c))).toEqual([]);
    expect([...guarded, ...exceptions].sort()).toEqual([...raw.keys()].sort());
  });

  it("les canaux listés existent réellement dans IPC_CHANNELS", () => {
    const known = new Set(Object.keys(IPC_CHANNELS));
    for (const channel of [...RAW_GUARDED_CHANNELS, ...Object.keys(RAW_UNGUARDED_CHANNELS)]) {
      expect(known.has(channel), `canal inconnu : ${channel}`).toBe(true);
    }
  });
});
