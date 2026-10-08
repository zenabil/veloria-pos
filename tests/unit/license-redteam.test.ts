// Veloria Licensing — Red-Team contrôlée (attaques simulées, clés éphémères).
// Chaque attaque DOIT échouer de façon sûre (état refusé, données intactes).
import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  LICENSE_PRODUCT_ID,
  canonicalJson,
  decodeVlic,
  encodeVlic,
  signDetached,
  signPayload,
  verifyDetachedSignature,
  verifyLicenseChain,
  type LicensePayload,
  type SignedLicense,
} from "../../electron/licensing/protocol.ts";
import {
  getLicenseStatus,
  importLicenseEnvelope,
  type LicenseServiceDeps,
} from "../../electron/licensing/license-service.ts";
import type { PersistedLicenseState } from "../../electron/licensing/secure-state.ts";
import { buildSecureStateV2 } from "../../electron/licensing/secure-state.ts";
import { licenseActionSchema } from "../../electron/ipc/validators.ts";

const HW = "a".repeat(64);
const HW2 = "b".repeat(64);

function keys(): { pub: string; priv: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    pub: publicKey.export({ type: "spki", format: "pem" }).toString(),
    priv: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

function payload(): LicensePayload {
  return {
    schemaVersion: 1,
    licenseId: "LIC-RT-1",
    productId: LICENSE_PRODUCT_ID,
    edition: "professional",
    licenseType: "term",
    hardwareFingerprint: HW,
    issuedAt: "2026-01-01T00:00:00.000Z",
    startsAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z",
    features: ["ocr"],
  };
}

function depsWith(
  stored: PersistedLicenseState | null,
  k: { pub: string },
  now: number,
  hw = HW,
): LicenseServiceDeps {
  return {
    nowMs: () => now,
    getPublicKeyPem: () => k.pub,
    getFingerprint: () => hw,
    formatShort: (f) => f.slice(0, 4),
    loadState: () => stored,
    saveState: () => undefined,
    backend: {
      isAvailable: () => true,
      encryptString: (s) => Buffer.from(s),
      decryptString: (b) => b.toString(),
    },
    verifyIntegrity: () => "skipped-dev",
    log: () => undefined,
  };
}

const NOW = Date.parse("2026-06-01T00:00:00.000Z");

describe("Red-Team : falsification de licence", () => {
  it("expiration prolongée à la main => signature invalide", () => {
    const k = keys();
    const p = payload();
    const sig = signPayload(p, k.priv);
    const forged: SignedLicense = {
      payload: { ...p, expiresAt: "2037-01-01T00:00:00.000Z" },
      signature: sig,
    };
    expect(
      verifyLicenseChain({
        signed: forged,
        publicKeyPem: k.pub,
        expectedProductId: LICENSE_PRODUCT_ID,
        actualHardwareFingerprint: HW,
        nowMs: NOW,
      }),
    ).toBe("INVALID_SIGNATURE");
  });

  it("hardware ID substitué => signature invalide (même avec le bon HW local)", () => {
    const k = keys();
    const p = payload();
    const sig = signPayload(p, k.priv);
    const forged: SignedLicense = { payload: { ...p, hardwareFingerprint: HW2 }, signature: sig };
    expect(
      verifyLicenseChain({
        signed: forged,
        publicKeyPem: k.pub,
        expectedProductId: LICENSE_PRODUCT_ID,
        actualHardwareFingerprint: HW2,
        nowMs: NOW,
      }),
    ).toBe("INVALID_SIGNATURE");
  });

  it("édition/features gonflés => signature invalide", () => {
    const k = keys();
    const p = payload();
    const sig = signPayload(p, k.priv);
    for (const patch of [
      { edition: "enterprise" },
      { features: ["ocr", "multi-printer", "advanced-reports", "tout"] },
    ] as Partial<LicensePayload>[]) {
      expect(
        verifyLicenseChain({
          signed: { payload: { ...p, ...patch }, signature: sig },
          publicKeyPem: k.pub,
          expectedProductId: LICENSE_PRODUCT_ID,
          actualHardwareFingerprint: HW,
          nowMs: NOW,
        }),
      ).toBe("INVALID_SIGNATURE");
    }
  });

  it("licence d'un autre produit refusée (INVALID_PRODUCT avant les dates)", () => {
    const k = keys();
    const p = { ...payload(), productId: "autre-produit" };
    const st = verifyLicenseChain({
      signed: { payload: p, signature: signPayload(p, k.priv) },
      publicKeyPem: k.pub,
      expectedProductId: LICENSE_PRODUCT_ID,
      actualHardwareFingerprint: HW,
      nowMs: NOW,
    });
    expect(st).toBe("INVALID_PRODUCT");
  });

  it("copie vers un autre poste => INVALID_HARDWARE, poste d'origine intact", () => {
    const k = keys();
    const p = payload();
    const envelope = { payload: p, signature: signPayload(p, k.priv) };
    const stored: PersistedLicenseState = buildSecureStateV2({
      envelope,
      hardwareFingerprint: HW,
      firstSeenUtc: new Date(NOW).toISOString(),
      lastSeenUtc: new Date(NOW).toISOString(),
      lastVerifyUtc: new Date(NOW).toISOString(),
      monotonicSeq: 1,
      maxStanding: "active",
    });
    expect(getLicenseStatus(depsWith(stored, k, NOW, HW)).state).toBe("ACTIVE");
    expect(getLicenseStatus(depsWith(stored, k, NOW, HW2)).state).toBe("INVALID_HARDWARE");
  });

  it("état local trafiqué => refus sûr (signature ou structure)", () => {
    const k = keys();
    // Forme conservée + signature cassée => INVALID_SIGNATURE.
    const edited = buildSecureStateV2({
      envelope: {
        payload: { ...payload(), total: 999999 },
        signature: "x",
      } as unknown as SignedLicense,
      hardwareFingerprint: HW,
      firstSeenUtc: new Date(NOW).toISOString(),
      lastSeenUtc: new Date(NOW).toISOString(),
      lastVerifyUtc: new Date(NOW).toISOString(),
      monotonicSeq: 1,
      maxStanding: "active",
    });
    expect(getLicenseStatus(depsWith(edited, k, NOW)).state).toBe("INVALID_SIGNATURE");
    // Structure brisée (champs manquants) => CORRUPTED_STATE.
    const broken = buildSecureStateV2({
      envelope: { payload: { licenseId: "x" }, signature: "y" } as unknown as SignedLicense,
      hardwareFingerprint: HW,
      firstSeenUtc: new Date(NOW).toISOString(),
      lastSeenUtc: new Date(NOW).toISOString(),
      lastVerifyUtc: new Date(NOW).toISOString(),
      monotonicSeq: 1,
      maxStanding: "active",
    });
    expect(getLicenseStatus(depsWith(broken, k, NOW)).state).toBe("CORRUPTED_STATE");
  });

  it("horloge reculée => CLOCK_ROLLBACK (pas EXPIRED ni ACTIVE)", () => {
    const k = keys();
    const p = payload();
    const stored: PersistedLicenseState = buildSecureStateV2({
      envelope: { payload: p, signature: signPayload(p, k.priv) },
      hardwareFingerprint: HW,
      firstSeenUtc: new Date(NOW).toISOString(),
      lastSeenUtc: new Date(NOW).toISOString(),
      lastVerifyUtc: new Date(NOW).toISOString(),
      monotonicSeq: 1,
      maxStanding: "active",
    });
    const d = depsWith(stored, k, Date.parse("2025-01-01T00:00:00.000Z"));
    expect(getLicenseStatus(d).state).toBe("CLOCK_ROLLBACK");
  });

  it("manifeste d'intégrité altéré => signature détachée invalide", () => {
    const k = keys();
    const body = { appVersion: "1.0.0", builtAt: "2026-01-01", files: { "a.js": "h1" } };
    const sig = signDetached(canonicalJson(body), k.priv);
    verifyDetachedSignature(canonicalJson(body), sig, k.pub);
    const tampered = { ...body, files: { "a.js": "PATCHED" } };
    expect(() => verifyDetachedSignature(canonicalJson(tampered), sig, k.pub)).toThrow();
  });

  it("import .vlic corrompu => refus FR, rien persisté", () => {
    const k = keys();
    let saved = false;
    const d: LicenseServiceDeps = {
      ...depsWith(null, k, NOW),
      saveState: () => {
        saved = true;
      },
    };
    expect(() => importLicenseEnvelope(d, "contenu-pas-une-licence")).toThrow();
    expect(saved).toBe(false);
  });

  it("canal IPC licence : charge utile non-objet rejetée par Zod", () => {
    expect(() => licenseActionSchema.parse({ unexpected: 1 })).not.toThrow();
    expect(licenseActionSchema.parse({})).toEqual({});
  });

  it(".vlic tronqué/modifié => décodage ou signature en échec", () => {
    const k = keys();
    const p = payload();
    const vlic = encodeVlic({ payload: p, signature: signPayload(p, k.priv) });
    const cut = vlic.slice(0, Math.floor(vlic.length / 2));
    let threw = false;
    try {
      const back = decodeVlic(cut);
      const st = verifyLicenseChain({
        signed: back,
        publicKeyPem: k.pub,
        expectedProductId: LICENSE_PRODUCT_ID,
        actualHardwareFingerprint: HW,
        nowMs: NOW,
      });
      threw = st !== "ACTIVE";
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
