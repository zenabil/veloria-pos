// Veloria PoS — `ocr-files` : la mise en scène d'une facture est une surface
// ATTaquante (le renderer choisit le fichier, le main le copie et le relit).
// Surtout ce module était mesuré à 0 % par la porte projet.
// Électron est simulé (app.getPath / dialog / nativeImage) : on teste la
// validation, pas l'interface.
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const holder = vi.hoisted(() => ({
  userData: "",
  picked: null as string | null,
}));

vi.mock("electron", () => ({
  app: { getPath: () => holder.userData },
  dialog: {
    showOpenDialogSync: () => (holder.picked === null ? undefined : [holder.picked]),
  },
  nativeImage: {
    createFromBuffer: (buf: Buffer) => ({
      isEmpty: () => buf.length === 0,
      getSize: () => ({ width: 12, height: 8 }),
      resize: () => ({
        toPNG: () => buf,
        toDataURL: () => "data:image/png;base64,MOCK",
      }),
      toPNG: () => buf,
      toDataURL: () => "data:image/png;base64,MOCK",
    }),
  },
}));

import {
  OCR_MAX_BYTES,
  cleanupStaleOcrTemp,
  disposeAllStagedFiles,
  disposeStagedFile,
  getStagedFile,
  normalizeImageForOcr,
  ocrTempDir,
  pickInvoiceFile,
} from "../../electron/ocr/ocr-files";

const PNG_MAGIC = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const PDF_MAGIC = Buffer.from("%PDF-1.7 faux contenu".slice(0, 12), "latin1");
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

let source: string;

function seedSource(name: string, bytes: Buffer): string {
  const file = path.join(source, name);
  fs.writeFileSync(file, bytes);
  return file;
}

beforeEach(() => {
  // Un profil Electron neuf par test : le dossier temporaire ne se mélange pas.
  holder.userData = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-ocr-user-"));
  source = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-ocr-src-"));
  holder.picked = null;
  disposeAllStagedFiles();
});

describe("ocr-files — sélection et validation", () => {
  it("annuler le sélecteur rend null sans erreur", () => {
    expect(pickInvoiceFile()).toBe(null);
  });

  it("met en scène un PNG valide dans le dossier temporaire du profil", () => {
    holder.picked = seedSource("facture.png", PNG_MAGIC);
    const picked = pickInvoiceFile();
    expect(picked).not.toBe(null);
    const file = picked?.file;
    expect(file?.kind).toBe("image");
    expect(file?.name).toBe("facture.png");
    expect(file?.size).toBe(PNG_MAGIC.length);
    // Le chemin mis en scène est BIEN sous <userData>/ocr-temp (aucune évasion).
    const dir = ocrTempDir();
    expect(path.resolve(file?.stagedPath ?? "").startsWith(path.resolve(dir))).toBe(true);
    expect(fs.existsSync(String(file?.stagedPath))).toBe(true);
    expect(picked?.previewDataUrl).toBe("data:image/png;base64,MOCK");
  });

  it("accepte PDF et JPEG par leurs signatures, et le PDF n'a pas d'aperçu", () => {
    holder.picked = seedSource("facture.pdf", PDF_MAGIC);
    const pdf = pickInvoiceFile();
    expect(pdf?.file.kind).toBe("pdf");
    expect(pdf?.previewDataUrl).toBe(null);

    holder.picked = seedSource("scan.JPG", JPEG_MAGIC);
    const jpg = pickInvoiceFile();
    expect(jpg?.file.kind).toBe("image");
    expect(jpg?.file.name).toBe("scan.JPG");
  });

  it("refuse une extension hors liste", () => {
    holder.picked = seedSource("piege.gif", PNG_MAGIC);
    expect(() => pickInvoiceFile()).toThrow(/Format non pris en charge/);
  });

  it("refuse un fichier vide, un fichier trop lourd et un contenu déguisé", () => {
    holder.picked = seedSource("vide.png", Buffer.alloc(0));
    expect(() => pickInvoiceFile()).toThrow(/Fichier vide ou illisible/);

    // Nom PNG, contenu texte : la signature ne suit pas → refus (le type
    // déclaré par le renderer ne fait pas foi).
    holder.picked = seedSource("faux.png", Buffer.from("bonjour le monde", "utf8"));
    expect(() => pickInvoiceFile()).toThrow(/Contenu PNG invalide/);

    const heavy = path.join(source, "lourd.png");
    fs.writeFileSync(heavy, Buffer.alloc(OCR_MAX_BYTES + 1));
    holder.picked = heavy;
    expect(() => pickInvoiceFile()).toThrow(/Fichier trop lourd/);
  });

  it("refuse un chemin qui n'existe plus", () => {
    const gone = seedSource("disparu.png", PNG_MAGIC);
    fs.unlinkSync(gone);
    holder.picked = gone;
    expect(() => pickInvoiceFile()).toThrow(/Fichier introuvable ou illisible/);
  });
});

describe("ocr-files — cycle de vie de la copie", () => {
  function stagePng(): string {
    holder.picked = seedSource("a.png", PNG_MAGIC);
    const picked = pickInvoiceFile();
    const id = picked?.file.fileId;
    if (typeof id !== "string") throw new Error("Mise en scène impossible.");
    return id;
  }

  it("un identifiant inconnu ou un fichier disparu = document expiré, en FR", () => {
    expect(() => getStagedFile("00000000-0000-4000-8000-000000000000")).toThrow(/Document expiré/);
    const id = stagePng();
    const file = getStagedFile(id);
    fs.unlinkSync(file.stagedPath);
    expect(() => getStagedFile(id)).toThrow(/Document expiré/);
    // L'entrée morte est retirée de la carte : plus rien à libérer.
    expect(disposeAllStagedFiles()).toBe(0);
  });

  it("normalise une image, met le résultat en cache, refuse un PDF", () => {
    const id = stagePng();
    const first = normalizeImageForOcr(id);
    expect(fs.existsSync(first)).toBe(true);
    expect(first).toContain(".norm.png");
    expect(normalizeImageForOcr(id)).toBe(first);

    holder.picked = seedSource("b.pdf", PDF_MAGIC);
    const pdf = pickInvoiceFile();
    expect(() => normalizeImageForOcr(String(pdf?.file.fileId))).toThrow(
      /Normalisation réservée aux images/,
    );
  });

  it("la libération supprime copie et normalisé, et reste idempotente", () => {
    const id = stagePng();
    const stagedPath = getStagedFile(id).stagedPath;
    const normalized = normalizeImageForOcr(id);
    disposeStagedFile(id);
    expect(fs.existsSync(stagedPath)).toBe(false);
    expect(fs.existsSync(normalized)).toBe(false);
    expect(() => disposeStagedFile(id)).not.toThrow();
    expect(() => getStagedFile(id)).toThrow(/Document expiré/);
  });

  it("disposeAll rend le nombre de copies libérées", () => {
    const a = stagePng();
    const b = stagePng();
    expect(disposeAllStagedFiles()).toBe(2);
    expect(() => getStagedFile(a)).toThrow(/Document expiré/);
    expect(() => getStagedFile(b)).toThrow(/Document expiré/);
  });

  it("la purge d'âge écoulé vide le dossier temporaire", () => {
    const id = stagePng();
    const p = getStagedFile(id).stagedPath;
    // Âge négatif : `now - mtime > maxAge` avec la résolution de `Date.now()`
    // en millisecondes rendrait un `0` dépendant de l'instant exact de la
    // frappe — ici la condition est vraie quoi qu'il arrive.
    cleanupStaleOcrTemp(-5_000);
    expect(fs.existsSync(p)).toBe(false);
    // Sans objet en carte, l'appel reste sans danger.
    expect(() => cleanupStaleOcrTemp()).not.toThrow();
  });
});
