// Veloria — contrat du manifeste de mise à jour (ADR-186).
//
// Le manifeste est lu sur le RÉSEAU : chaque champ est donc non fiable par
// construction. Ces tests prouvent que le contrat REFUSE ce qui doit l'être
// (origine non autorisée, schéma inconnu, asset piégé) et que la comparaison
// de versions est exacte (1.0.10 > 1.0.9 — le piège classique du tri
// lexicographique).
import { describe, expect, it } from "vitest";
import {
  ALLOWED_FEED_HOSTS,
  compareVersions,
  fetchUpdateManifest,
  isAllowedFeedUrl,
  isNewerVersion,
  parseUpdateManifest,
} from "../../electron/services/update-feed.ts";

describe("comparaison de versions (ADR-186)", () => {
  it("compare numériquement, pas lexicographiquement", () => {
    expect(compareVersions("1.0.10", "1.0.9")).toBe(1);
    expect(compareVersions("1.0.9", "1.0.10")).toBe(-1);
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
    expect(compareVersions("1.0.4", "1.0.4")).toBe(0);
  });

  it("une version illisible n'est jamais « plus récente »", () => {
    expect(compareVersions("abc", "1.0.0")).toBe(0);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(isNewerVersion("n'importe quoi", "1.0.4")).toBe(false);
  });

  it("détecte la version strictement plus récente", () => {
    expect(isNewerVersion("1.0.5", "1.0.4")).toBe(true);
    expect(isNewerVersion("1.0.4", "1.0.4")).toBe(false);
    expect(isNewerVersion("1.0.4", "1.0.5")).toBe(false);
  });
});

describe("origines autorisées (deny-by-default)", () => {
  it("accepte les hôtes de la liste blanche, en https", () => {
    expect(
      isAllowedFeedUrl(
        "https://github.com/owner/repo/releases/latest/download/update-manifest.json",
      ),
    ).toBe(true);
    expect(isAllowedFeedUrl("https://raw.githubusercontent.com/owner/repo/main/m.json")).toBe(true);
    expect(isAllowedFeedUrl("https://objects.githubusercontent.com/x")).toBe(true);
  });

  it("refuse tout le reste", () => {
    expect(isAllowedFeedUrl("https://exemple-pirate.test/m.json")).toBe(false);
    expect(isAllowedFeedUrl("http://github.com/owner/repo/m.json")).toBe(false);
    expect(isAllowedFeedUrl("file:///C:/manifeste.json")).toBe(false);
    expect(isAllowedFeedUrl("pas une url")).toBe(false);
    expect(ALLOWED_FEED_HOSTS).not.toContain("exemple-pirate.test");
  });

  it("tolère la boucle locale UNIQUEMENT hors paquetage (développement/test)", () => {
    expect(isAllowedFeedUrl("http://127.0.0.1:8787/m.json", false)).toBe(false);
    expect(isAllowedFeedUrl("http://127.0.0.1:8787/m.json", true)).toBe(true);
    expect(isAllowedFeedUrl("http://localhost:8787/m.json", true)).toBe(true);
    expect(isAllowedFeedUrl("http://192.168.1.10:8787/m.json", true)).toBe(false);
  });
});

describe("validation du manifeste", () => {
  const valid = {
    schema: 1,
    suiteVersion: "1.0.5",
    androidVersionCode: 7,
    publishedAt: "2026-11-15T10:00:00.000Z",
    notes: "Correctifs divers",
    releasePage: "https://github.com/owner/repo/releases/tag/v1.0.5",
    assets: {
      winSetup: {
        name: "Veloria-PoS-Setup-1.0.5.exe",
        sha256: "a".repeat(64),
        size: 1234,
        downloadUrl: "https://github.com/owner/repo/releases/download/v1.0.5/x.exe",
      },
    },
  };

  it("accepte un manifeste conforme", () => {
    const m = parseUpdateManifest(valid);
    expect(m).not.toBeNull();
    expect(m?.suiteVersion).toBe("1.0.5");
    expect(m?.androidVersionCode).toBe(7);
    expect(m?.assets?.["winSetup"]?.size).toBe(1234);
  });

  it("refuse un schéma inconnu ou une version illisible", () => {
    expect(parseUpdateManifest({ ...valid, schema: 2 })).toBeNull();
    expect(parseUpdateManifest({ ...valid, suiteVersion: "1.0" })).toBeNull();
    expect(parseUpdateManifest({ ...valid, suiteVersion: 105 })).toBeNull();
    const { suiteVersion: _ignored, ...sansVersion } = valid;
    expect(parseUpdateManifest(sansVersion)).toBeNull();
    expect(parseUpdateManifest(null)).toBeNull();
    expect(parseUpdateManifest("pas un objet")).toBeNull();
  });

  it("écarte les champs illisibles au lieu de les propager", () => {
    const m = parseUpdateManifest({
      ...valid,
      androidVersionCode: 0,
      notes: "x".repeat(2001),
      assets: {
        winSetup: { name: "../evil.exe", sha256: "pas-un-hash" },
        winPortable: { name: "Veloria-PoS-Portable-1.0.5.exe", sha256: "b".repeat(64) },
      },
    });
    expect(m?.androidVersionCode).toBeUndefined();
    expect(m?.notes).toBeUndefined();
    expect(m?.assets?.["winSetup"]).toBeUndefined();
    expect(m?.assets?.["winPortable"]?.sha256).toBe("b".repeat(64));
  });
});

describe("lecture du manifeste (silencieuse)", () => {
  it("renvoie le manifeste quand la réponse est conforme", async () => {
    const manifest = await fetchUpdateManifest("https://github.com/x/y/m.json", () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ schema: 1, suiteVersion: "1.0.5" }),
      }),
    );
    expect(manifest?.suiteVersion).toBe("1.0.5");
  });

  it("renvoie null sur erreur HTTP, JSON invalide ou réseau coupé", async () => {
    expect(
      await fetchUpdateManifest("https://github.com/x/y/m.json", () =>
        Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }),
      ),
    ).toBeNull();
    expect(
      await fetchUpdateManifest("https://github.com/x/y/m.json", () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.reject(new Error("json invalide")),
        }),
      ),
    ).toBeNull();
    expect(
      await fetchUpdateManifest("https://github.com/x/y/m.json", () =>
        Promise.reject(new Error("réseau coupé")),
      ),
    ).toBeNull();
  });
});
