// Veloria Licensing — Tests : capabilities (pages/features/plans, statuts
// signés, deviceBinding, compatibilité ascendante, parité des catalogues).
// Clés éphémères en mémoire : jamais les clés vendor.
import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  LICENSE_PRODUCT_ID,
  decodeVlic,
  encodeVlic,
  hasLicensedFeature,
  hasLicensedPage,
  licensedPages,
  signPayload,
  verifyLicenseChain,
  type LicensePayload,
  type SignedLicense,
} from "../../electron/licensing/protocol.ts";
import {
  LICENSE_CRITICAL_DAYS,
  LICENSE_FEATURES,
  LICENSE_PAGES,
  LICENSE_WARNING_DAYS,
  PLAN_PRESETS,
  normalizeFeatures,
  planPreset,
} from "../../electron/licensing/catalog.ts";
import {
  getLicenseStatus,
  hasFeatureAccess,
  hasPageAccess,
  importLicenseEnvelope,
  requireLicensedFeature,
  requireLicensedPage,
  type LicenseServiceDeps,
} from "../../electron/licensing/license-service.ts";
import type { PersistedLicenseState } from "../../electron/licensing/secure-state.ts";
// Miroir renderer (parité) — chemin relatif (pas d'alias vite ici).
import * as RendererCatalog from "../../src/features/license/catalog.ts";

const HW = "f".repeat(64);
const OTHER_HW = "0".repeat(64);
const NOW = Date.parse("2026-06-01T00:00:00.000Z");

function keys(): { pub: string; priv: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    pub: publicKey.export({ type: "spki", format: "pem" }).toString(),
    priv: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

function basePayload(): LicensePayload {
  return {
    schemaVersion: 1,
    licenseId: "LIC-CAP-0001",
    productId: LICENSE_PRODUCT_ID,
    edition: "pro",
    plan: "PRO",
    clientId: "CLI-1",
    clientName: "Ahmed",
    storeName: "Ennour",
    licenseType: "term",
    deviceBinding: true,
    maxDevices: 1,
    hardwareFingerprint: HW,
    issuedAt: "2026-01-01T00:00:00.000Z",
    startsAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z",
    features: ["receipt-80mm", "ocr"],
    pages: { dashboard: true, sales: true, stock: false },
  };
}

function setup(
  payload: LicensePayload,
  opts?: { now?: number; hw?: string },
): {
  deps: LicenseServiceDeps;
  envelope: SignedLicense;
  vlic: string;
  setNow: (n: number) => void;
} {
  const k = keys();
  const signature = signPayload(payload, k.priv);
  const envelope = { payload, signature };
  let now = opts?.now ?? NOW;
  let stored: PersistedLicenseState | null = null;
  const deps: LicenseServiceDeps = {
    nowMs: () => now,
    getPublicKeyPem: () => k.pub,
    getFingerprint: () => opts?.hw ?? HW,
    formatShort: (f) => f.slice(0, 4),
    loadState: () => stored,
    saveState: (_b, s) => {
      stored = s;
    },
    backend: {
      isAvailable: () => true,
      encryptString: (s: string) => Buffer.from(`enc:${s}`),
      decryptString: (b: Buffer) => {
        const t = b.toString();
        if (!t.startsWith("enc:")) throw new Error("bad");
        return t.slice(4);
      },
    },
    verifyIntegrity: () => "skipped-dev",
    log: () => undefined,
  };
  return {
    deps,
    envelope,
    vlic: encodeVlic(envelope),
    setNow: (n: number) => {
      now = n;
    },
  };
}

describe("Catalogue & presets", () => {
  it("expose 17 pages et 14 features, seuils 30/7", () => {
    expect(LICENSE_PAGES).toHaveLength(17);
    expect(LICENSE_FEATURES).toHaveLength(14);
    expect(LICENSE_WARNING_DAYS).toBe(30);
    expect(LICENSE_CRITICAL_DAYS).toBe(7);
  });

  it("parité main ↔ miroir renderer (aucune dérive)", () => {
    expect([...RendererCatalog.LICENSE_PAGES]).toEqual([...LICENSE_PAGES]);
    expect([...RendererCatalog.LICENSE_FEATURES]).toEqual([...LICENSE_FEATURES]);
    expect(RendererCatalog.LICENSE_WARNING_DAYS).toBe(LICENSE_WARNING_DAYS);
    expect(RendererCatalog.LICENSE_CRITICAL_DAYS).toBe(LICENSE_CRITICAL_DAYS);
  });

  it("presets : BASIC restreint, ENTERPRISE tout, PRO modifiable", () => {
    expect(PLAN_PRESETS.BASIC.pages["dashboard"]).toBe(true);
    expect(PLAN_PRESETS.BASIC.pages["reports"]).toBe(false);
    expect(PLAN_PRESETS.BASIC.pages["zakat"]).toBe(false);
    expect(PLAN_PRESETS.ENTERPRISE.pages["zakat"]).toBe(true);
    const pro = planPreset("PRO");
    pro.pages["zakat"] = true;
    expect(PLAN_PRESETS.PRO.pages["zakat"]).toBe(false);
  });

  it("normalise les features (inconnues ignorées, triées)", () => {
    expect(normalizeFeatures(["ocr", "future-x", "ocr", 42])).toEqual(["ocr"]);
  });
});

describe("Chaîne de vérification étendue", () => {
  it("révoquée / suspendue (statut signé) bloquent avant les dates", () => {
    const k = keys();
    for (const standing of ["revoked", "suspended"] as const) {
      const payload = { ...basePayload(), licenseStatus: standing } as LicensePayload;
      const st = verifyLicenseChain({
        signed: { payload, signature: signPayload(payload, k.priv) },
        publicKeyPem: k.pub,
        expectedProductId: LICENSE_PRODUCT_ID,
        actualHardwareFingerprint: HW,
        nowMs: NOW,
      });
      expect(st).toBe(standing === "revoked" ? "REVOKED" : "SUSPENDED");
    }
  });

  it("deviceBinding=false : autre poste accepté (licence flottante)", () => {
    const k = keys();
    const payload = { ...basePayload(), deviceBinding: false };
    const st = verifyLicenseChain({
      signed: { payload, signature: signPayload(payload, k.priv) },
      publicKeyPem: k.pub,
      expectedProductId: LICENSE_PRODUCT_ID,
      actualHardwareFingerprint: OTHER_HW,
      nowMs: NOW,
    });
    expect(st).toBe("ACTIVE");
  });

  it("toute mutation des pages/features invalide la signature", () => {
    const k = keys();
    const payload = basePayload();
    const signature = signPayload(payload, k.priv);
    for (const mutant of [
      { ...payload, pages: { ...payload.pages, stock: true } },
      { ...payload, features: ["receipt-80mm", "ocr", "excel-export"] },
      { ...payload, plan: "ENTERPRISE" as const },
      { ...payload, clientName: "Autre" },
      { ...payload, deviceBinding: false },
    ]) {
      expect(
        verifyLicenseChain({
          signed: { payload: mutant, signature },
          publicKeyPem: k.pub,
          expectedProductId: LICENSE_PRODUCT_ID,
          actualHardwareFingerprint: HW,
          nowMs: NOW,
        }),
      ).toBe("INVALID_SIGNATURE");
    }
  });

  it("helpers pages/features sur payload vérifié", () => {
    const p = basePayload();
    expect(hasLicensedPage(p, "sales")).toBe(true);
    expect(hasLicensedPage(p, "stock")).toBe(false);
    expect(hasLicensedPage(p, "zakat")).toBe(false);
    expect(hasLicensedFeature(p, "ocr")).toBe(true);
    expect(hasLicensedFeature(p, "excel-export")).toBe(false);
    expect(licensedPages(p)["sales"]).toBe(true);
  });

  it("compatibilité ascendante : enveloppe legacy sans pages/client", () => {
    const k = keys();
    const legacy: LicensePayload = {
      schemaVersion: 1,
      licenseId: "LIC-OLD-1",
      productId: LICENSE_PRODUCT_ID,
      edition: "professional",
      licenseType: "term",
      hardwareFingerprint: HW,
      issuedAt: "2026-01-01T00:00:00.000Z",
      startsAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
      features: ["ocr"],
    };
    const st = verifyLicenseChain({
      signed: { payload: legacy, signature: signPayload(legacy, k.priv) },
      publicKeyPem: k.pub,
      expectedProductId: LICENSE_PRODUCT_ID,
      actualHardwareFingerprint: HW,
      nowMs: NOW,
    });
    expect(st).toBe("ACTIVE");
    expect(hasLicensedPage(legacy, "stock")).toBe(true);
    expect(Object.values(licensedPages(legacy)).every(Boolean)).toBe(true);
  });
});

describe("Service : authorization pages/features", () => {
  it("import expose pages/features/client, gardes page/feature", () => {
    const s = setup(basePayload());
    const st = importLicenseEnvelope(s.deps, s.vlic);
    expect(st.state).toBe("ACTIVE");
    expect(st.clientName).toBe("Ahmed");
    expect(st.plan).toBe("PRO");
    expect(st.pages["sales"]).toBe(true);
    expect(st.pages["stock"]).toBe(false);
    expect(hasPageAccess(s.deps, "sales")).toBe(true);
    expect(hasPageAccess(s.deps, "stock")).toBe(false);
    expect(hasFeatureAccess(s.deps, "ocr")).toBe(true);
    expect(hasFeatureAccess(s.deps, "excel-export")).toBe(false);
    expect(() => requireLicensedPage(s.deps, "sales")).not.toThrow();
    expect(() => requireLicensedPage(s.deps, "stock")).toThrow(/non disponible/);
    expect(() => requireLicensedFeature(s.deps, "ocr")).not.toThrow();
    expect(() => requireLicensedFeature(s.deps, "excel-export")).toThrow(/pas incluse/);
  });

  it("import révoquée/suspendue refusé avec message FR", () => {
    for (const standing of ["revoked", "suspended"] as const) {
      const s = setup({ ...basePayload(), licenseStatus: standing });
      expect(() => importLicenseEnvelope(s.deps, s.vlic)).toThrow(
        standing === "revoked" ? /révoquée/ : /suspendue/,
      );
      expect(getLicenseStatus(s.deps).state).toBe(standing === "revoked" ? "REVOKED" : "SUSPENDED");
    }
  });

  it("expirée : pages en lecture seule, features bloquées", () => {
    const s = setup(basePayload());
    importLicenseEnvelope(s.deps, s.vlic);
    s.setNow(Date.parse("2027-06-01T00:00:00.000Z"));
    expect(getLicenseStatus(s.deps).state).toBe("EXPIRED");
    expect(hasPageAccess(s.deps, "sales")).toBe(true);
    expect(() => requireLicensedPage(s.deps, "sales")).not.toThrow();
    expect(() => requireLicensedPage(s.deps, "stock")).toThrow();
    expect(() => requireLicensedFeature(s.deps, "ocr")).toThrow(/expirée/);
  });

  it("licence flottante : import sur autre poste accepté", () => {
    const s = setup({ ...basePayload(), deviceBinding: false }, { hw: OTHER_HW });
    const st = importLicenseEnvelope(s.deps, s.vlic);
    expect(st.state).toBe("ACTIVE");
    expect(st.deviceBinding).toBe(false);
  });

  it("enveloppe corrompue / signature forgée refusées", () => {
    const s = setup(basePayload());
    expect(() => importLicenseEnvelope(s.deps, "!!!")).toThrow(/illisible/);
    const other = keys();
    const forged = encodeVlic({
      payload: basePayload(),
      signature: signPayload(basePayload(), other.priv),
    });
    // Forgée avec une autre clé : le service utilise SA clé publique.
    expect(() => importLicenseEnvelope(s.deps, forged)).toThrow(/signature/);
  });

  it(".vlic roundtrip conserve les capabilities", () => {
    const s = setup(basePayload());
    const back = decodeVlic(s.vlic);
    expect(back.payload.pages?.["sales"]).toBe(true);
    expect(back.payload.plan).toBe("PRO");
    expect(back.payload.clientName).toBe("Ahmed");
  });
});
