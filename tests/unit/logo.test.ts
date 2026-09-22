import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  LOGO_MAX_BYTES,
  assertLogoValid,
  logoDataUrlFor,
  logoExtensionOf,
  readLogoDataUrlFromFile,
  storeLogoFile,
} from "../../electron/services/logo.ts";

let dir = "";

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-logo-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeFile(name: string, size: number): string {
  // EL-31: fixtures à signature réelle (PNG/JPEG magiques) — les contenus
  // polyglottes sont couverts par les cas de rejet ci-dessous.
  const p = path.join(dir, name);
  const ext = path.extname(name).toLowerCase();
  const magic =
    ext === ".png"
      ? Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      : ext === ".jpg" || ext === ".jpeg"
        ? Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
        : Buffer.alloc(0);
  const body = Buffer.alloc(Math.max(0, size - magic.length), 7);
  fs.writeFileSync(p, Buffer.concat([magic, body]));
  return p;
}

describe("Logo entreprise", () => {
  it("accepte PNG/JPEG et refuse les autres extensions", () => {
    expect(logoExtensionOf("logo.PNG")).toBe("png");
    expect(logoExtensionOf("photo.jpeg")).toBe("jpeg");
    expect(() => assertLogoValid("logo.png", 100)).not.toThrow();
    expect(() => assertLogoValid("photo.JPG", 100)).not.toThrow();
    expect(() => assertLogoValid("logo.gif", 100)).toThrow();
    expect(() => assertLogoValid("logo.svg", 100)).toThrow();
    expect(() => assertLogoValid("logo", 100)).toThrow();
  });

  it("borne la taille à 400 Ko", () => {
    expect(() => assertLogoValid("logo.png", LOGO_MAX_BYTES)).not.toThrow();
    expect(() => assertLogoValid("logo.png", LOGO_MAX_BYTES + 1)).toThrow();
    expect(() => assertLogoValid("logo.png", 0)).toThrow();
  });

  it("copie le fichier dans le dossier possédé par l'application", () => {
    const src = writeFile("enseigne.png", 1024);
    const destDir = path.join(dir, "logos");
    const dest = storeLogoFile(src, destDir);
    expect(dest.startsWith(destDir)).toBe(true);
    expect(dest.endsWith(".png")).toBe(true);
    expect(fs.statSync(dest).size).toBe(1024);
    expect(() => storeLogoFile(writeFile("trop-lourd.jpg", LOGO_MAX_BYTES + 1), destDir)).toThrow();
  });

  it("lit un data URL (png/jpeg) ou null sans exception", () => {
    const png = writeFile("a.png", 64);
    const jpg = writeFile("b.jpg", 64);
    expect(readLogoDataUrlFromFile(png)?.startsWith("data:image/png;base64,")).toBe(true);
    expect(readLogoDataUrlFromFile(jpg)?.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(readLogoDataUrlFromFile(null)).toBeNull();
    expect(readLogoDataUrlFromFile("")).toBeNull();
    expect(readLogoDataUrlFromFile(path.join(dir, "absent.png"))).toBeNull();
    expect(readLogoDataUrlFromFile(writeFile("x.gif", 64))).toBeNull();
    expect(logoDataUrlFor("a.png", "QUJD")).toBe("data:image/png;base64,QUJD");
  });

  it("rejette le contenu polyglotte (extension/magie incohérentes)", () => {
    // PNG nommé .jpg et inversement : refusés (pas de lecture arbitraire).
    const fakePng = path.join(dir, "fake.jpg");
    fs.writeFileSync(
      fakePng,
      Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(56, 7)]),
    );
    expect(readLogoDataUrlFromFile(fakePng)).toBeNull();
    expect(() => storeLogoFile(fakePng, path.join(dir, "logos2"))).toThrow();
  });
});
