// Veloria Licensing — Tests : protocole (canonique, signature, chaîne).
// Clés éphémères générées en mémoire : jamais les clés vendor.
import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  LICENSE_PRODUCT_ID,
  canonicalJson,
  decodeVlic,
  encodeVlic,
  signPayload,
  verifyLicenseChain,
  type LicensePayload,
} from "../../electron/licensing/protocol.ts";

function testKeys(): { pub: string; priv: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    pub: publicKey.export({ type: "spki", format: "pem" }).toString(),
    priv: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

const HW = "a".repeat(64);

function basePayload(): LicensePayload {
  return {
    schemaVersion: 1,
    licenseId: "LIC-TEST-0001",
    productId: LICENSE_PRODUCT_ID,
    edition: "professional",
    licenseType: "term",
    hardwareFingerprint: HW,
    issuedAt: "2026-01-01T00:00:00.000Z",
    startsAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z",
    features: ["advanced-reports", "ocr"],
  };
}

describe("Canonical serialization", () => {
  it("trie les clés récursivement (ordre des champs sans effet)", () => {
    const a = canonicalJson({ b: 1, a: { d: 4, c: 3 } });
    const b = canonicalJson({ a: { c: 3, d: 4 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"c":3,"d":4},"b":1}');
  });
});

describe("Sign/verify roundtrip", () => {
  it("valide une licence intacte et encode/decode .vlic", () => {
    const { pub, priv } = testKeys();
    const payload = basePayload();
    const signature = signPayload(payload, priv);
    const vlic = encodeVlic({ payload, signature });
    const back = decodeVlic(vlic);
    expect(back.payload.licenseId).toBe("LIC-TEST-0001");
    const state = verifyLicenseChain({
      signed: back,
      publicKeyPem: pub,
      expectedProductId: LICENSE_PRODUCT_ID,
      actualHardwareFingerprint: HW,
      nowMs: Date.parse("2026-06-01T00:00:00.000Z"),
    });
    expect(state).toBe("ACTIVE");
  });

  it("rejette après chaque mutation d'un champ signé", () => {
    const { pub, priv } = testKeys();
    const payload = basePayload();
    const signature = signPayload(payload, priv);
    const mutants: Partial<LicensePayload>[] = [
      { expiresAt: "2037-01-01T00:00:00.000Z" },
      { hardwareFingerprint: "b".repeat(64) },
      { edition: "enterprise" },
      { features: ["advanced-reports", "ocr", "multi-printer"] },
      { licenseId: "LIC-FORGE-9999" },
      { licenseType: "lifetime" },
    ];
    for (const m of mutants) {
      const st = verifyLicenseChain({
        signed: { payload: { ...payload, ...m }, signature },
        publicKeyPem: pub,
        expectedProductId: LICENSE_PRODUCT_ID,
        actualHardwareFingerprint: HW,
        nowMs: Date.parse("2026-06-01T00:00:00.000Z"),
      });
      expect(st).toBe("INVALID_SIGNATURE");
    }
  });

  it("rejette une signature d'une autre clé", () => {
    const other = testKeys();
    const { pub } = testKeys();
    const payload = basePayload();
    const signature = signPayload(payload, other.priv);
    const st = verifyLicenseChain({
      signed: { payload, signature },
      publicKeyPem: pub,
      expectedProductId: LICENSE_PRODUCT_ID,
      actualHardwareFingerprint: HW,
      nowMs: Date.parse("2026-06-01T00:00:00.000Z"),
    });
    expect(st).toBe("INVALID_SIGNATURE");
  });
});

describe("Verification chain", () => {
  it("détecte produit, hardware, expiration, préavis", () => {
    const { pub, priv } = testKeys();
    const payload = basePayload();
    const signature = signPayload(payload, priv);
    const base = {
      signed: { payload, signature },
      publicKeyPem: pub,
      expectedProductId: LICENSE_PRODUCT_ID,
      actualHardwareFingerprint: HW,
    };
    expect(verifyLicenseChain({ ...base, nowMs: Date.parse("2026-06-01T00:00:00.000Z") })).toBe(
      "ACTIVE",
    );
    expect(
      verifyLicenseChain({
        ...base,
        expectedProductId: "autre-produit",
        nowMs: Date.parse("2026-06-01T00:00:00.000Z"),
      }),
    ).toBe("INVALID_PRODUCT");
    expect(
      verifyLicenseChain({
        ...base,
        actualHardwareFingerprint: "c".repeat(64),
        nowMs: Date.parse("2026-06-01T00:00:00.000Z"),
      }),
    ).toBe("INVALID_HARDWARE");
    expect(verifyLicenseChain({ ...base, nowMs: Date.parse("2027-02-01T00:00:00.000Z") })).toBe(
      "EXPIRED",
    );
    expect(verifyLicenseChain({ ...base, nowMs: Date.parse("2026-12-20T00:00:00.000Z") })).toBe(
      "EXPIRING_SOON",
    );
  });

  it("accepte lifetime sans expiresAt", () => {
    const { pub, priv } = testKeys();
    const { expiresAt: _drop, ...rest } = basePayload();
    const payload: LicensePayload = { ...rest, licenseType: "lifetime" };
    const signature = signPayload(payload, priv);
    const st = verifyLicenseChain({
      signed: { payload, signature },
      publicKeyPem: pub,
      expectedProductId: LICENSE_PRODUCT_ID,
      actualHardwareFingerprint: HW,
      nowMs: Date.parse("2040-01-01T00:00:00.000Z"),
    });
    expect(st).toBe("ACTIVE");
  });

  it("rejette les enveloppes corrompues", () => {
    expect(() => decodeVlic("")).toThrow();
    expect(() => decodeVlic("!!!pas-base64!!!")).toThrow();
    expect(() => decodeVlic(Buffer.from("{}").toString("base64url"))).toThrow();
  });
});
