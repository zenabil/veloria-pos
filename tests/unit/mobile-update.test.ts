// Veloria Client (APK) — détection d'une version plus récente (ADR-186).
//
// L'APK ne s'installe JAMAIS tout seul (Android l'interdit) : il compare la
// version publiée à la sienne puis PROPOSE le téléchargement. Ces tests
// prouvent que rien n'est annoncé quand le manifeste est illisible, absent,
// ou quand la version publiée n'est pas plus récente.
import { describe, expect, it, vi } from "vitest";
import {
  checkClientUpdate,
  compareVersions,
  parseClientManifest,
  resolveClientUpdate,
} from "../../mobile/src/update.ts";

const MANIFEST_URL = "https://github.com/owner/repo/releases/latest/download/update-manifest.json";

const NEWER = {
  schema: 1,
  suiteVersion: "1.0.5",
  androidVersionCode: 7,
  notes: "Correctifs divers",
  releasePage: "https://github.com/owner/repo/releases/tag/v1.0.5",
  assets: {
    apk: {
      name: "veloria-client-1.0.5.apk",
      sha256: "a".repeat(64),
      downloadUrl: "https://github.com/owner/repo/releases/download/v1.0.5/app.apk",
    },
  },
};

describe("comparaison de versions (client)", () => {
  it("compare numériquement", () => {
    expect(compareVersions("1.0.10", "1.0.9")).toBe(1);
    expect(compareVersions("1.0.4", "1.0.4")).toBe(0);
    expect(compareVersions("abc", "1.0.0")).toBe(0);
  });
});

describe("manifeste client", () => {
  it("accepte un manifeste conforme et écarte les champs invalides", () => {
    const m = parseClientManifest(NEWER);
    expect(m?.suiteVersion).toBe("1.0.5");
    expect(m?.assets?.["apk"]?.downloadUrl).toContain("/download/");

    const douteux = parseClientManifest({
      ...NEWER,
      androidVersionCode: -1,
      releasePage: "http://exemple.test/x",
      assets: { apk: { name: "../evil.apk", downloadUrl: "http://exemple.test/x.apk" } },
    });
    expect(douteux?.androidVersionCode).toBeUndefined();
    expect(douteux?.releasePage).toBeUndefined();
    expect(douteux?.assets?.["apk"]?.downloadUrl).toBeUndefined();
  });

  it("refuse un manifeste hors schéma", () => {
    expect(parseClientManifest({ ...NEWER, schema: 2 })).toBeNull();
    expect(parseClientManifest(null)).toBeNull();
  });

  it("n'annonce rien si la version publiée n'est pas plus récente", () => {
    const same = parseClientManifest({ ...NEWER, suiteVersion: "1.0.4" });
    expect(resolveClientUpdate(same, "1.0.4")).toBeNull();
    const older = parseClientManifest({ ...NEWER, suiteVersion: "1.0.3" });
    expect(resolveClientUpdate(older, "1.0.4")).toBeNull();
    expect(resolveClientUpdate(null, "1.0.4")).toBeNull();
  });

  it("annonce le lien de téléchargement de l'APK", () => {
    const info = resolveClientUpdate(parseClientManifest(NEWER), "1.0.4");
    expect(info?.version).toBe("1.0.5");
    expect(info?.versionCode).toBe(7);
    expect(info?.url).toBe("https://github.com/owner/repo/releases/download/v1.0.5/app.apk");
  });

  it("retombe sur la page de release quand l'APK n'est pas listé", () => {
    const info = resolveClientUpdate(
      parseClientManifest({
        schema: 1,
        suiteVersion: "1.0.5",
        releasePage: "https://github.com/o/r/releases/tag/v1.0.5",
      }),
      "1.0.4",
    );
    expect(info?.url).toBe("https://github.com/o/r/releases/tag/v1.0.5");
  });
});

describe("lecture réseau (silencieuse)", () => {
  it("sans URL configurée : aucun appel réseau", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const info = await checkClientUpdate({ currentVersion: "1.0.4", url: "" });
    expect(info).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("refuse une URL non https", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const info = await checkClientUpdate({
      currentVersion: "1.0.4",
      url: "http://127.0.0.1:8787/m.json",
    });
    expect(info).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("annonce la mise à jour quand le manifeste est conforme", async () => {
    const info = await checkClientUpdate({
      currentVersion: "1.0.4",
      url: MANIFEST_URL,
      fetchImpl: () =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(NEWER) }),
    });
    expect(info?.version).toBe("1.0.5");
  });

  it("reste muet sur erreur HTTP ou réseau coupé", async () => {
    expect(
      await checkClientUpdate({
        currentVersion: "1.0.4",
        url: MANIFEST_URL,
        fetchImpl: () =>
          Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }),
      }),
    ).toBeNull();
    expect(
      await checkClientUpdate({
        currentVersion: "1.0.4",
        url: MANIFEST_URL,
        fetchImpl: () => Promise.reject(new Error("réseau coupé")),
      }),
    ).toBeNull();
  });
});
