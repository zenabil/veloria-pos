// Veloria Licensing — Tests : fingerprint (normalisation, déterminisme).
// Aucun accès matériel réel : sources injectées.
import { describe, it, expect } from "vitest";
import {
  fingerprintFromSources,
  formatFingerprintShort,
  FINGERPRINT_MAX_ATTEMPTS,
  FINGERPRINT_FAILURE_TTL_MS,
  FINGERPRINT_MIN_SOURCES,
} from "../../electron/licensing/fingerprint.ts";

describe("Hardware fingerprint", () => {
  it("est déterministe et insensible à l'ordre des sources", () => {
    const a = fingerprintFromSources([
      { name: "cpu-id", value: "ABC123" },
      { name: "machine-guid", value: "GUID-1" },
    ]);
    const b = fingerprintFromSources([
      { name: "machine-guid", value: "GUID-1" },
      { name: "cpu-id", value: "ABC123" },
    ]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("change si une source change (liaison matérielle)", () => {
    const a = fingerprintFromSources([{ name: "machine-guid", value: "GUID-1" }]);
    const b = fingerprintFromSources([{ name: "machine-guid", value: "GUID-2" }]);
    expect(a).not.toBe(b);
  });

  it("formate un identifiant court affichable", () => {
    expect(formatFingerprintShort("a".repeat(64))).toBe("AAAA-AAAA-AAAA-AAAA");
    expect(formatFingerprintShort("0123456789abcdef".repeat(4))).toBe("0123-4567-89AB-CDEF");
  });

  it("P0-3 : 3 tentatives backoff, échec transitoire jamais figé (TTL > 0)", () => {
    expect(FINGERPRINT_MAX_ATTEMPTS).toBe(3);
    expect(FINGERPRINT_FAILURE_TTL_MS).toBeGreaterThan(0);
    expect(FINGERPRINT_MIN_SOURCES).toBe(2);
  });
});
