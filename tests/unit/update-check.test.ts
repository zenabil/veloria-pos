// Veloria — service de détection de mise à jour (ADR-186), côté processus
// principal. L'Electron est SIMULÉ : ce qui est testé ici, c'est la logique
// du service (cache, silence, comparaison, ouverture de la page de release),
// pas Electron lui-même (preuve réelle : `npm run test:e2e`).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openExternal: vi.fn((_url: string) => Promise.resolve()),
  log: vi.fn(),
}));

vi.mock("electron", () => ({
  app: { getVersion: () => "1.0.4", isPackaged: true },
  shell: { openExternal: mocks.openExternal },
}));

vi.mock("../../electron/services/logger", () => ({ log: mocks.log }));

import {
  DEFAULT_UPDATE_MANIFEST_URL,
  getUpdateManifestUrl,
  getUpdateStatus,
  openUpdatePage,
  resetUpdateCache,
} from "../../electron/services/update-check.ts";

const MANIFEST_URL = "https://github.com/owner/repo/releases/latest/download/update-manifest.json";

function manifestResponse(body: unknown, ok = true) {
  return () => Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) });
}

const NEWER = {
  schema: 1,
  suiteVersion: "1.0.5",
  notes: "Correctifs divers",
  releasePage: "https://github.com/owner/repo/releases/tag/v1.0.5",
};

describe("détection de mise à jour (ADR-186)", () => {
  beforeEach(() => {
    mocks.openExternal.mockClear();
    mocks.log.mockClear();
    resetUpdateCache();
    delete process.env["VELORIA_UPDATE_MANIFEST_URL"];
  });

  it("sans flux configuré : détection désactivée, AUCUN réseau sollicité", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const status = await getUpdateStatus();
    expect(status.enabled).toBe(false);
    expect(status.available).toBe(false);
    expect(status.currentVersion).toBe("1.0.4");
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("URL par défaut vide tant que le dépôt de distribution n'existe pas", () => {
    expect(DEFAULT_UPDATE_MANIFEST_URL).toBe("");
    expect(getUpdateManifestUrl()).toBeNull();
  });

  it("refuse une origine hors liste blanche", () => {
    process.env["VELORIA_UPDATE_MANIFEST_URL"] = "https://exemple-pirate.test/m.json";
    expect(getUpdateManifestUrl()).toBeNull();
  });

  it("annonce la version plus récente et reste silencieux hors ligne", async () => {
    process.env["VELORIA_UPDATE_MANIFEST_URL"] = MANIFEST_URL;
    vi.stubGlobal("fetch", manifestResponse(NEWER));
    const status = await getUpdateStatus();
    expect(status.enabled).toBe(true);
    expect(status.available).toBe(true);
    expect(status.latestVersion).toBe("1.0.5");
    expect(status.notes).toBe("Correctifs divers");
    expect(status.failed).toBe(false);

    vi.stubGlobal("fetch", () => Promise.reject(new Error("réseau coupé")));
    resetUpdateCache();
    const offline = await getUpdateStatus();
    expect(offline.available).toBe(false);
    expect(offline.failed).toBe(true);
    vi.unstubAllGlobals();
  });

  it("n'annonce rien quand la version publiée est identique ou antérieure", async () => {
    process.env["VELORIA_UPDATE_MANIFEST_URL"] = MANIFEST_URL;
    vi.stubGlobal("fetch", manifestResponse({ ...NEWER, suiteVersion: "1.0.4" }));
    expect((await getUpdateStatus()).available).toBe(false);
    resetUpdateCache();
    vi.stubGlobal("fetch", manifestResponse({ ...NEWER, suiteVersion: "1.0.3" }));
    expect((await getUpdateStatus()).available).toBe(false);
    vi.unstubAllGlobals();
  });

  it("ouvre la page de release dans le navigateur du système", async () => {
    process.env["VELORIA_UPDATE_MANIFEST_URL"] = MANIFEST_URL;
    vi.stubGlobal("fetch", manifestResponse(NEWER));
    const result = await openUpdatePage();
    expect(result.opened).toBe(true);
    expect(mocks.openExternal).toHaveBeenCalledWith(
      "https://github.com/owner/repo/releases/tag/v1.0.5",
    );
    vi.unstubAllGlobals();
  });

  it("refuse d'ouvrir une page de release hors liste blanche", async () => {
    process.env["VELORIA_UPDATE_MANIFEST_URL"] = MANIFEST_URL;
    vi.stubGlobal(
      "fetch",
      manifestResponse({ ...NEWER, releasePage: "https://exemple-pirate.test/x" }),
    );
    const result = await openUpdatePage();
    expect(result.opened).toBe(false);
    expect(mocks.openExternal).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("n'ouvre rien (et ne plante pas) si le manifeste est indisponible", async () => {
    process.env["VELORIA_UPDATE_MANIFEST_URL"] = MANIFEST_URL;
    vi.stubGlobal("fetch", () => Promise.reject(new Error("réseau coupé")));
    const result = await openUpdatePage();
    expect(result.opened).toBe(false);
    expect(result.message).toBeTruthy();
    expect(mocks.openExternal).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
