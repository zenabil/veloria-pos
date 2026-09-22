// Veloria PoS — Electron OCR: fichiers (sélection, validation, staging local).
// Règle vie privée : l'original n'est jamais modifié ; une COPIE vit dans
// <userData>/ocr-temp et est supprimée (dispose + purge 24 h). Le renderer ne
// voit que des fileId opaques (jamais de chemin disque).

import { app, dialog, nativeImage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const OCR_MAX_BYTES = 15_000_000;
export const OCR_MAX_DIMENSION = 3000;
// P11: aperçu IPC borné (jamais le fichier brut ≤15 Mo) : vignette JPEG
// 800 px qui suffit à la vérification humaine dans OcrImportDialog.
export const OCR_PREVIEW_DIMENSION = 800;

const OCR_EXTENSIONS = new Set(["jpg", "jpeg", "png", "pdf"]);

export type OcrFileKind = "image" | "pdf";

export interface OcrStagedFile {
  fileId: string;
  name: string;
  size: number;
  kind: OcrFileKind;
  stagedPath: string;
  normalizedPath: string | null;
  createdAt: number;
}

const staged = new Map<string, OcrStagedFile>();

export function ocrTempDir(): string {
  const dir = path.join(app.getPath("userData"), "ocr-temp");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function extensionOf(filename: string): string {
  return path.extname(filename).toLowerCase().replace(/^\./, "");
}

function assertMagicBytes(filePath: string, ext: string): void {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(8);
    const read = fs.readSync(fd, buf, 0, 8, 0);
    if (read < 4) throw new Error("Fichier vide ou illisible.");
    if (ext === "png") {
      if (!(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)) {
        throw new Error("Contenu PNG invalide.");
      }
    } else if (ext === "pdf") {
      if (!(buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)) {
        throw new Error("Contenu PDF invalide.");
      }
    } else {
      // jpg / jpeg
      if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) {
        throw new Error("Contenu JPEG invalide.");
      }
    }
  } catch (err) {
    try {
      fs.closeSync(fd);
    } catch {
      /* ignore */
    }
    if (err instanceof Error && /invalide|vide/.test(err.message)) throw err;
    throw new Error("Fichier illisible.");
  }
  try {
    fs.closeSync(fd);
  } catch {
    /* ignore */
  }
}

/**
 * Sélecteur de facture (image/PDF ≤ 15 Mo). Copie locale + validation
 * extension + taille + signature. Annulation = null (pas d'erreur).
 */
export function pickInvoiceFile(): {
  file: OcrStagedFile;
  previewDataUrl: string | null;
} | null {
  const res = dialog.showOpenDialogSync({
    properties: ["openFile"],
    filters: [
      { name: "Factures (JPG, PNG, PDF)", extensions: ["jpg", "jpeg", "png", "pdf"] },
      { name: "Images (JPG, PNG)", extensions: ["jpg", "jpeg", "png"] },
      { name: "PDF", extensions: ["pdf"] },
    ],
  });
  if (!res || res.length === 0) return null;
  const source = res.at(0);
  if (source === undefined) return null;
  const name = path.basename(source);
  const ext = extensionOf(name);
  if (!OCR_EXTENSIONS.has(ext)) {
    throw new Error("Format non pris en charge : choisissez JPG, PNG ou PDF.");
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(source);
  } catch {
    throw new Error("Fichier introuvable ou illisible.");
  }
  if (!stat.isFile() || stat.size <= 0) throw new Error("Fichier vide ou illisible.");
  if (stat.size > OCR_MAX_BYTES) {
    throw new Error("Fichier trop lourd : 15 Mo maximum.");
  }
  assertMagicBytes(source, ext);
  const kind: OcrFileKind = ext === "pdf" ? "pdf" : "image";
  const fileId = randomUUID();
  const stagedPath = path.join(ocrTempDir(), `${fileId}.${ext}`);
  try {
    fs.copyFileSync(source, stagedPath);
  } catch {
    throw new Error("Copie locale impossible (disque ou droits).");
  }
  const file: OcrStagedFile = {
    fileId,
    name,
    size: stat.size,
    kind,
    stagedPath,
    normalizedPath: null,
    createdAt: Date.now(),
  };
  staged.set(fileId, file);
  // P11: aperçu = vignette bornée (pas le fichier brut) : JPEG 800 px,
  // qualité réduite. Échec aperçu → null (l'analyse reste possible).
  let previewDataUrl: string | null = null;
  if (kind === "image") {
    try {
      const bytes = fs.readFileSync(stagedPath);
      const img = nativeImage.createFromBuffer(bytes);
      if (!img.isEmpty()) {
        const size = img.getSize();
        const longest = Math.max(size.width, size.height);
        const thumb =
          longest > OCR_PREVIEW_DIMENSION
            ? img.resize({
                width: size.width >= size.height ? OCR_PREVIEW_DIMENSION : undefined,
                height: size.height > size.width ? OCR_PREVIEW_DIMENSION : undefined,
                quality: "good",
              })
            : img;
        previewDataUrl = thumb.toDataURL();
      }
    } catch {
      previewDataUrl = null;
    }
  }
  return { file, previewDataUrl };
}

export function getStagedFile(fileId: string): OcrStagedFile {
  const file = staged.get(fileId);
  if (!file) throw new Error("Document expiré : sélectionnez-le à nouveau.");
  if (!fs.existsSync(file.stagedPath)) {
    staged.delete(fileId);
    throw new Error("Document expiré : sélectionnez-le à nouveau.");
  }
  return file;
}

/**
 * Normalisation locale avant OCR (zéro dépendance : Electron nativeImage) :
 * borne 3000 px + ré-encodage PNG. L'original reste intact.
 */
export function normalizeImageForOcr(fileId: string): string {
  const file = getStagedFile(fileId);
  if (file.kind !== "image") throw new Error("Normalisation réservée aux images.");
  if (file.normalizedPath !== null && fs.existsSync(file.normalizedPath)) {
    return file.normalizedPath;
  }
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(file.stagedPath);
  } catch {
    throw new Error("Image illisible.");
  }
  const img = nativeImage.createFromBuffer(bytes);
  if (img.isEmpty()) throw new Error("Image illisible ou format non décodable.");
  const size = img.getSize();
  const longest = Math.max(size.width, size.height);
  const scaled =
    longest > OCR_MAX_DIMENSION
      ? img.resize({
          width: size.width >= size.height ? OCR_MAX_DIMENSION : undefined,
          height: size.height > size.width ? OCR_MAX_DIMENSION : undefined,
          quality: "best",
        })
      : img;
  const out = path.join(ocrTempDir(), `${file.fileId}.norm.png`);
  try {
    fs.writeFileSync(out, scaled.toPNG());
  } catch {
    throw new Error("Préparation locale de l'image impossible.");
  }
  file.normalizedPath = out;
  return out;
}

export function disposeStagedFile(fileId: string): void {
  const file = staged.get(fileId);
  staged.delete(fileId);
  if (!file) return;
  for (const p of [file.stagedPath, file.normalizedPath]) {
    if (!p) continue;
    try {
      fs.unlinkSync(p);
    } catch {
      /* meilleur effort */
    }
  }
}

/** Purge best-effort des copies de plus de 24 h (au démarrage du service). */
export function cleanupStaleOcrTemp(maxAgeMs = 24 * 3600 * 1000): void {
  let dir: string;
  try {
    dir = ocrTempDir();
  } catch {
    return;
  }
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  const now = Date.now();
  for (const e of entries) {
    const full = path.join(dir, e);
    try {
      const st = fs.statSync(full);
      if (st.isFile() && now - st.mtimeMs > maxAgeMs) fs.unlinkSync(full);
    } catch {
      /* meilleur effort */
    }
  }
}
