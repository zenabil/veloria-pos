// Veloria License Manager — Tests : durées, validateurs, émission vérifiable.
// Clés éphémères : la clé vendor réelle n'est jamais touchée par les tests.
import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { addMonths } from "../../license-manager/ipc/licenses.ts";
import {
  licenseCreateSchema,
  licenseRenewSchema,
  licenseTransferSchema,
} from "../../license-manager/ipc/validators.ts";
import { buildSignedLicense } from "../../license-manager/signing.ts";
import {
  LICENSE_PRODUCT_ID,
  decodeVlic,
  verifyLicenseChain,
} from "../../electron/licensing/protocol.ts";

const FP = "f".repeat(64);

describe("License durations", () => {
  it("ajoute des mois calendaires (clamp fin de mois)", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-06-15", 6)).toBe("2026-12-15");
  });
});

describe("Manager validators", () => {
  it("accepte une création complète", () => {
    const c = licenseCreateSchema.parse({
      customerRef: "Épicerie Ennour",
      edition: "professional",
      licenseType: "term",
      durationMonths: 12,
      hardwareFingerprint: FP,
      features: ["ocr"],
    });
    expect(c.edition).toBe("professional");
  });

  it("rejette empreinte, édition et périodes incohérentes", () => {
    expect(() =>
      licenseCreateSchema.parse({
        customerRef: "X",
        edition: "professional",
        licenseType: "term",
        durationMonths: 12,
        hardwareFingerprint: "trop-court",
      }),
    ).toThrow();
    expect(() =>
      licenseCreateSchema.parse({
        customerRef: "Client",
        edition: "gold",
        licenseType: "term",
        durationMonths: 12,
        hardwareFingerprint: FP,
      }),
    ).toThrow();
    expect(() =>
      licenseCreateSchema.parse({
        customerRef: "Client",
        edition: "basic",
        licenseType: "term",
        hardwareFingerprint: FP,
      }),
    ).toThrow();
    expect(() =>
      licenseRenewSchema.parse({ id: 1, licenseType: "term", durationMonths: 0 }),
    ).toThrow();
    expect(() => licenseTransferSchema.parse({ id: 1, newFingerprint: "zz" })).toThrow();
  });
});

describe("Manager emission (cross-module proof)", () => {
  it("une licence émise par le Manager se vérifie côté POS", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const pub = publicKey.export({ type: "spki", format: "pem" }).toString();
    const priv = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const { payload, vlic } = buildSignedLicense(
      {
        customerRef: "Client Test",
        edition: "enterprise",
        licenseType: "term",
        hardwareFingerprint: FP,
        startsAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2027-01-01T00:00:00.000Z",
        features: ["ocr"],
      },
      priv,
    );
    expect(payload.productId).toBe(LICENSE_PRODUCT_ID);
    expect(vlic.length).toBeGreaterThan(100);
    // Chaîne POS complète avec la clé publique appariée :
    const signed = decodeVlic(vlic);
    const st = verifyLicenseChain({
      signed,
      publicKeyPem: pub,
      expectedProductId: LICENSE_PRODUCT_ID,
      actualHardwareFingerprint: FP,
      nowMs: Date.parse("2026-06-01T00:00:00.000Z"),
    });
    expect(st).toBe("ACTIVE");
  });
});
