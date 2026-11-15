// Veloria — génération du manifeste de mise à jour (ADR-186).
//
// Le script est un OUTIL DE RELEASE : il est donc exercé comme un processus
// (comme en production), dans un dossier temporaire, avec un faux `release/`.
// Ce qui est prouvé : le refus SANS URL de release (fail-closed), la forme du
// manifeste produit, et les empreintes SHA-256 des livrables.
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT = path.resolve(process.cwd(), "scripts/release/update-manifest.mjs");
const RELEASE_PAGE = "https://github.com/owner/repo/releases/tag/v1.0.5";

function makeWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-manifest-"));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "veloria-pos", version: "1.0.5" }),
  );
  fs.mkdirSync(path.join(root, "mobile"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "mobile", "app.json"),
    JSON.stringify({ expo: { version: "1.0.5" }, android: { versionCode: 7 } }),
  );
  fs.mkdirSync(path.join(root, "release"), { recursive: true });
  fs.writeFileSync(path.join(root, "release", "Veloria-PoS-Setup-1.0.5.exe"), "setup");
  fs.writeFileSync(path.join(root, "release", "Veloria-PoS-Portable-1.0.5.exe"), "portable");
  // L'APK vit dans un sous-dossier (`release/apk/`) : le manifeste doit le
  // publier sous son NOM SEUL (les assets d'une release GitHub sont plats).
  fs.mkdirSync(path.join(root, "release", "apk"), { recursive: true });
  fs.writeFileSync(path.join(root, "release", "apk", "Veloria-Client-1.0.5.apk"), "apk");
  return root;
}

function run(root: string, env: Record<string, string>): { status: number | null; stdout: string } {
  const res = spawnSync(process.execPath, [SCRIPT], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  return { status: res.status, stdout: `${res.stdout}${res.stderr}` };
}

describe("manifeste de mise à jour (scripts/release/update-manifest.mjs)", () => {
  it("REFUSE de produire un manifeste sans URL de release (fail-closed)", () => {
    const root = makeWorkspace();
    const res = run(root, { VELORIA_RELEASE_BASE_URL: "" });
    expect(res.status).not.toBe(0);
    expect(res.stdout).toContain("VELORIA_RELEASE_BASE_URL");
    expect(fs.existsSync(path.join(root, "release", "update-manifest.json"))).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("REFUSE une URL de release en http clair", () => {
    const root = makeWorkspace();
    const res = run(root, {
      VELORIA_RELEASE_BASE_URL: "http://github.com/owner/repo/releases/tag/v1.0.5",
    });
    expect(res.status).not.toBe(0);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("produit un manifeste conforme (version, versionCode, empreintes, liens)", () => {
    const root = makeWorkspace();
    const res = run(root, { VELORIA_RELEASE_BASE_URL: RELEASE_PAGE });
    expect(res.status).toBe(0);

    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, "release", "update-manifest.json"), "utf8"),
    ) as {
      schema: number;
      suiteVersion: string;
      androidVersionCode: number;
      releasePage: string;
      assets: Record<string, { name: string; sha256: string; size: number; downloadUrl: string }>;
    };
    expect(manifest.schema).toBe(1);
    expect(manifest.suiteVersion).toBe("1.0.5");
    expect(manifest.androidVersionCode).toBe(7);
    expect(manifest.releasePage).toBe(RELEASE_PAGE);
    expect(Object.keys(manifest.assets).sort()).toEqual(["apk", "winPortable", "winSetup"]);
    expect(manifest.assets["apk"]?.name).toBe("Veloria-Client-1.0.5.apk");
    expect(manifest.assets["apk"]?.downloadUrl).toContain(
      "/releases/download/v1.0.5/Veloria-Client-1.0.5.apk",
    );
    for (const asset of Object.values(manifest.assets)) {
      expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(asset.size).toBeGreaterThan(0);
      expect(asset.downloadUrl).toContain("/releases/download/v1.0.5/");
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("refuse de publier un manifeste sans livrable (rien à annoncer)", () => {
    const root = makeWorkspace();
    // `readdirSync(..., { recursive: true })` est typé `(string | Buffer)[]` :
    // on restreint à des chaînes (le dossier ne contient que des fichiers).
    const entries = fs.readdirSync(path.join(root, "release"), { recursive: true }) as string[];
    for (const f of entries) {
      fs.rmSync(path.join(root, "release", f), { recursive: true, force: true });
    }
    const res = run(root, { VELORIA_RELEASE_BASE_URL: RELEASE_PAGE });
    expect(res.status).not.toBe(0);
    expect(res.stdout).toContain("livrable");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("l'APK du PROPRIÉTAIRE n'est jamais publié comme APK du client", () => {
    const root = makeWorkspace();
    fs.writeFileSync(path.join(root, "release", "apk", "Veloria-Owner-1.0.5-release.apk"), "owner");
    expect(run(root, { VELORIA_RELEASE_BASE_URL: RELEASE_PAGE }).status).toBe(0);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, "release", "update-manifest.json"), "utf8"),
    ) as { assets: Record<string, { name: string }> };
    expect(manifest.assets["apk"]?.name).toBe("Veloria-Client-1.0.5.apk");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("le script s'exécute sans erreur de syntaxe hors release (importable)", () => {
    // `node --check` valide le fichier SANS l'exécuter : garde-fou rapide
    // contre un script cassé dans la chaîne de release.
    const res = spawnSync(process.execPath, ["--check", SCRIPT], { encoding: "utf8" });
    expect(res.status).toBe(0);
    expect(res.stderr).toBe("");
  });

  it("le manifeste est reproductible : mêmes livrables ⇒ mêmes empreintes", () => {
    const root = makeWorkspace();
    expect(run(root, { VELORIA_RELEASE_BASE_URL: RELEASE_PAGE }).status).toBe(0);
    const first = fs.readFileSync(path.join(root, "release", "update-manifest.json"), "utf8");
    expect(run(root, { VELORIA_RELEASE_BASE_URL: RELEASE_PAGE }).status).toBe(0);
    const second = fs.readFileSync(path.join(root, "release", "update-manifest.json"), "utf8");
    const strip = (s: string): string => s.replace(/"publishedAt": "[^"]*"/, "");
    expect(strip(second)).toBe(strip(first));
    fs.rmSync(root, { recursive: true, force: true });
  });
});
