// Veloria — contrat de version et de mise à jour (POS, License Manager, Client).
// Une version désalignée casse la mise à jour : l'APK doit porter un versionCode
// strictement croissant, les installateurs NSIS le même appId stable, et les
// données doivent rester hors du dossier d'installation.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (rel: string): string => fs.readFileSync(path.join(process.cwd(), rel), "utf-8");
const json = (rel: string): Record<string, unknown> =>
  JSON.parse(read(rel)) as Record<string, unknown>;

const VERSION = String(json("package.json")["version"]);
const GRADLE = read("mobile/android/app/build.gradle");
const APP_TSX = read("mobile/src/App.tsx");

function gradleValue(pattern: RegExp): string {
  const m = pattern.exec(GRADLE);
  expect(m).not.toBeNull();
  return m?.[1] ?? "";
}

describe("version unifiée de la suite", () => {
  it("package.json racine est une version x.y.z", () => {
    expect(VERSION).toMatch(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  });

  it("POS + License Manager héritent du package.json racine (lock compris)", () => {
    expect(json("package-lock.json")["version"]).toBe(VERSION);
    const lock = json("package-lock.json") as { packages?: Record<string, { version?: string }> };
    expect(lock.packages?.[""]?.version).toBe(VERSION);
  });

  it("client Android : package, app.json, Gradle et écran Compte alignés", () => {
    expect(json("mobile/package.json")["version"]).toBe(VERSION);
    expect(json("mobile/package-lock.json")["version"]).toBe(VERSION);
    const app = json("mobile/app.json") as { expo?: { version?: string } };
    expect(app.expo?.version).toBe(VERSION);
    expect(gradleValue(/versionName\s+"([^"]+)"/)).toBe(VERSION);
    expect(APP_TSX).toContain(`appVersion="${VERSION}"`);
  });

  it("versionCode Android strictement positif (mise à jour acceptée)", () => {
    const code = Number(gradleValue(/versionCode\s+(\d+)/));
    expect(Number.isInteger(code)).toBe(true);
    expect(code).toBeGreaterThan(0);
  });
});

describe("contrat de mise à jour des installateurs", () => {
  it("appId stables : NSIS remplace l'ancienne version au lieu de coexister", () => {
    expect(read("config/electron-builder/pos.yml")).toContain("appId: com.veloria.pos");
    expect(read("config/electron-builder/manager.yml")).toContain(
      "appId: com.veloria.license-manager",
    );
  });

  it("données hors du dossier d'installation (conservées à la mise à jour)", () => {
    for (const cfg of ["config/electron-builder/pos.yml", "config/electron-builder/manager.yml"]) {
      const src = read(cfg);
      expect(src).toContain("perMachine: true");
      expect(src).toContain("deleteAppDataOnUninstall: false");
    }
  });

  it("APK : même package et même keystore release (signature d'upgrade)", () => {
    expect(GRADLE).toContain("applicationId 'dz.veloria.client'");
    expect(GRADLE).toContain("storeFile file('../../veloria-release.keystore')");
  });
});
