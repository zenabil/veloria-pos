// Veloria PoS — Tests OCR : schémas IPC + garantie 100 % local (statique).
// - Les schémas Zod OCR rejettent les charges inattendues (fileId, langues).
// - Aucun appel réseau / cloud dans la chaîne OCR (ni fetch ni endpoint).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ocrAnalyzeSchema,
  ocrCancelSchema,
  ocrDisposeSchema,
  ocrSelectFileSchema,
} from "../../electron/ipc/validators.ts";

const root = process.cwd();
const read = (p: string): string => fs.readFileSync(path.join(root, p), "utf-8");

describe("OCR IPC schemas", () => {
  it("valide la demande d'analyse", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(ocrSelectFileSchema.parse({})).toEqual({});
    expect(ocrAnalyzeSchema.parse({ fileId: id }).languages).toEqual(["fra", "eng"]);
    expect(ocrAnalyzeSchema.parse({ fileId: id, languages: ["fra"] }).languages).toEqual(["fra"]);
    expect(() => ocrAnalyzeSchema.parse({ fileId: "nope" })).toThrow();
    expect(() => ocrAnalyzeSchema.parse({ fileId: id, languages: [] })).toThrow();
    expect(() => ocrAnalyzeSchema.parse({ fileId: id, languages: ["deu"] })).toThrow();
    expect(() => ocrCancelSchema.parse({})).toThrow();
    expect(ocrDisposeSchema.parse({ fileId: id }).fileId).toBe(id);
  });
});

describe("OCR strictement local (garantie statique)", () => {
  const sources = [
    "electron/ocr/ocr.service.ts",
    "electron/ocr/ocr-engine.ts",
    "electron/ocr/ocr-files.ts",
    "electron/ocr/ocr-pdf.ts",
    "electron/preload/preload.ts",
    "src/domain/ocr/parser.ts",
    "src/domain/ocr/matcher.ts",
    "src/domain/ocr/numbers.ts",
    "src/features/stock/OcrImportDialog.tsx",
  ];
  it("aucun appel réseau ni fournisseur cloud", () => {
    const banned = [
      "fetch(",
      "XMLHttpRequest",
      "api_key",
      "apikey",
      "vision.googleapis",
      "cognitiveservices",
      "textract",
      "openai",
      "gemini",
      "anthropic",
      "ocr.space",
    ];
    for (const f of sources) {
      const code = read(f);
      for (const b of banned) {
        expect(code.includes(b), `${f} contient ${b}`).toBe(false);
      }
    }
  });
  it("aucune URL http(s) dans la chaîne OCR", () => {
    for (const f of sources) {
      const code = read(f);
      expect(/https?:\/\//.test(code), `${f} contient une URL`).toBe(false);
    }
  });
  it("tous les canaux OCR sont exposés par le preload", () => {
    const pre = read("electron/preload/preload.ts");
    for (const c of [
      "ocr.selectFile",
      "ocr.analyze",
      "ocr.cancel",
      "ocr.dispose",
      "ocr.progress",
    ]) {
      expect(pre.includes(`"${c}"`), `canal manquant: ${c}`).toBe(true);
    }
  });
});
