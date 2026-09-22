// Veloria PoS — Electron: logo entreprise (validation + stockage + aperçu).
// Le chemin saisi à la main est fragile (fichier déplacé/supprimé = logo perdu
// sur les impressions). Le fichier choisi est donc COPIÉ dans un dossier
// possédé par l'application (<userData>/logos) et seul ce chemin est persisté.
// Contraintes reprises du service d'impression : PNG/JPEG, ≤ 400 Ko.

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const LOGO_MAX_BYTES = 400_000;

const LOGO_EXTENSIONS = new Set(["png", "jpg", "jpeg"]);

/** Extension normalisée (sans point) ou "" si absente. */
export function logoExtensionOf(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace(/^\./, "");
  return ext;
}

/** Garde-fou : extension + taille. Lève un message FR. */
export function assertLogoValid(filename: string, sizeBytes: number): void {
  const ext = logoExtensionOf(filename);
  if (!LOGO_EXTENSIONS.has(ext)) {
    throw new Error("Logo invalide : choisissez un fichier PNG ou JPEG.");
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new Error("Logo invalide : fichier vide ou illisible.");
  }
  if (sizeBytes > LOGO_MAX_BYTES) {
    throw new Error("Logo trop lourd : 400 Ko maximum (PNG/JPEG).");
  }
}

/** Octets magiques : PNG (89 50 4E 47) / JPEG (FF D8 FF). */
export function assertLogoMagic(buffer: Buffer, filename: string): void {
  const ext = logoExtensionOf(filename);
  const png =
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const jpg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (ext === "png" && !png) throw new Error("Logo invalide : contenu non-PNG.");
  if ((ext === "jpg" || ext === "jpeg") && !jpg) {
    throw new Error("Logo invalide : contenu non-JPEG.");
  }
}

export function logoDataUrlFor(filename: string, base64: string): string {
  const ext = logoExtensionOf(filename);
  const mime = ext === "png" ? "png" : "jpeg";
  return `data:image/${mime};base64,${base64}`;
}

/**
 * Lecture meilleure-effort d'un logo pour aperçu/impression : null si absent,
 * invalide ou illisible (jamais d'exception — l'impression continue sans logo).
 * EL-31: vérifie aussi les octets magiques (polyglotte à en-tête valide refusé).
 */
export function readLogoDataUrlFromFile(logoPath: string | null | undefined): string | null {
  try {
    const p = logoPath?.trim();
    if (!p) return null;
    const stat = fs.statSync(p);
    if (!stat.isFile()) return null;
    assertLogoValid(p, stat.size);
    const buf = fs.readFileSync(p);
    assertLogoMagic(buf, p);
    return logoDataUrlFor(p, buf.toString("base64"));
  } catch {
    return null;
  }
}

/**
 * Copie un fichier logo validé vers le dossier possédé par l'application.
 * Retourne le chemin de destination (à persister en `logo_path`).
 * Lève un message FR si invalide.
 */
export function storeLogoFile(sourcePath: string, destDir: string): string {
  const stat = fs.statSync(sourcePath);
  if (!stat.isFile()) throw new Error("Logo invalide : fichier introuvable.");
  assertLogoValid(sourcePath, stat.size);
  assertLogoMagic(fs.readFileSync(sourcePath), sourcePath);
  const ext = logoExtensionOf(sourcePath);
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, `logo-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`);
  fs.copyFileSync(sourcePath, dest);
  return dest;
}
