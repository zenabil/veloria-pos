// Veloria Licensing — Tests : service (state machine, horloge, enforcement).
// Dépendances injectées (clés éphémères, horloge fixe, backend mémoire).
import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  canOpenShell,
  getLicenseStatus,
  importLicenseEnvelope,
  requireLicensedMutation,
  type LicenseServiceDeps,
} from "../../electron/licensing/license-service.ts";
import { encodeVlic, signPayload, type LicensePayload } from "../../electron/licensing/protocol.ts";
import type { PersistedLicenseState } from "../../electron/licensing/secure-state.ts";

const HW = "d".repeat(64);
const OTHER_HW = "e".repeat(64);

function keys(): { pub: string; priv: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    pub: publicKey.export({ type: "spki", format: "pem" }).toString(),
    priv: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

function memoryBackend(): {
  backend: {
    isAvailable: () => boolean;
    encryptString: (s: string) => Buffer;
    decryptString: (b: Buffer) => string;
  };
  readRaw: () => string | null;
  writeRaw: (s: string | null) => void;
} {
  let blob: string | null = null;
  return {
    backend: {
      isAvailable: () => true,
      encryptString: (s: string) => Buffer.from(`enc:${s}`),
      decryptString: (b: Buffer) => {
        const t = b.toString();
        if (!t.startsWith("enc:")) throw new Error("bad");
        return t.slice(4);
      },
    },
    readRaw: () => blob,
    writeRaw: (s: string | null) => {
      blob = s;
    },
  };
}

function setup(opts?: { now?: number; hw?: string }): {
  deps: LicenseServiceDeps;
  priv: string;
  setNow: (n: number) => void;
  corrupt: () => void;
} {
  const k = keys();
  const mem = memoryBackend();
  let now = opts?.now ?? Date.parse("2026-06-01T00:00:00.000Z");
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
    backend: mem.backend,
    verifyIntegrity: () => "skipped-dev",
    log: () => undefined,
  };
  return {
    deps,
    priv: k.priv,
    setNow: (n: number) => {
      now = n;
    },
    corrupt: () => {
      stored = { version: 1, envelope: "x" } as unknown as PersistedLicenseState;
    },
  };
}

function payload(): LicensePayload {
  return {
    schemaVersion: 1,
    licenseId: "LIC-SVC-1",
    productId: "veloria-pos",
    edition: "professional",
    licenseType: "term",
    hardwareFingerprint: HW,
    issuedAt: "2026-01-01T00:00:00.000Z",
    startsAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z",
    features: ["ocr"],
  };
}

describe("License service", () => {
  it("UNACTIVATED sans état, ACTIVE après import, mutation autorisée", () => {
    const s = setup();
    expect(getLicenseStatus(s.deps).state).toBe("UNACTIVATED");
    expect(canOpenShell(s.deps)).toBe(false);
    const vlic = encodeVlic({ payload: payload(), signature: signPayload(payload(), s.priv) });
    const st = importLicenseEnvelope(s.deps, vlic);
    expect(st.state).toBe("ACTIVE");
    expect(canOpenShell(s.deps)).toBe(true);
    expect(() => requireLicensedMutation(s.deps)).not.toThrow();
    expect(() => requireLicensedMutation(s.deps, "ocr")).not.toThrow();
    expect(() => requireLicensedMutation(s.deps, "multi-printer")).toThrow();
  });

  it("refuse le hardware d'une autre machine à l'import", () => {
    const s = setup({ hw: OTHER_HW });
    const vlic = encodeVlic({ payload: payload(), signature: signPayload(payload(), s.priv) });
    expect(() => importLicenseEnvelope(s.deps, vlic)).toThrow(/autre ordinateur/);
    expect(getLicenseStatus(s.deps).state).toBe("UNACTIVATED");
  });

  it("détecte le rollback d'horloge sans détruire l'état", () => {
    const s = setup();
    const vlic = encodeVlic({ payload: payload(), signature: signPayload(payload(), s.priv) });
    importLicenseEnvelope(s.deps, vlic);
    s.setNow(Date.parse("2026-01-01T00:00:00.000Z"));
    expect(getLicenseStatus(s.deps).state).toBe("CLOCK_ROLLBACK");
    expect(canOpenShell(s.deps)).toBe(false);
    expect(() => requireLicensedMutation(s.deps)).toThrow(/Horloge/);
  });

  it("EXPIRED ouvre le shell en lecture seule (mutations bloquées)", () => {
    const s = setup();
    const vlic = encodeVlic({ payload: payload(), signature: signPayload(payload(), s.priv) });
    importLicenseEnvelope(s.deps, vlic);
    s.setNow(Date.parse("2027-06-01T00:00:00.000Z"));
    expect(getLicenseStatus(s.deps).state).toBe("EXPIRED");
    expect(canOpenShell(s.deps)).toBe(true);
    expect(() => requireLicensedMutation(s.deps)).toThrow(/expirée/);
  });

  it("état corrompu => CORRUPTED_STATE, jamais de crash", () => {
    const s = setup();
    s.corrupt();
    expect(getLicenseStatus(s.deps).state).toBe("CORRUPTED_STATE");
    expect(canOpenShell(s.deps)).toBe(false);
  });

  it("aucun contournement : sans état, shell bloqué et mutations refusées", () => {
    const s = setup();
    expect(canOpenShell(s.deps)).toBe(false);
    expect(() => requireLicensedMutation(s.deps)).toThrow(/activez/);
  });

  it("#31 : .vlic actif rejoué après révocation => refus, REVOKED colle", () => {
    const s = setup();
    const base = payload();
    const active = encodeVlic({ payload: base, signature: signPayload(base, s.priv) });
    importLicenseEnvelope(s.deps, active);
    expect(getLicenseStatus(s.deps).state).toBe("ACTIVE");
    const revokedPayload = { ...base, licenseStatus: "revoked" as const };
    const revoked = encodeVlic({
      payload: revokedPayload,
      signature: signPayload(revokedPayload, s.priv),
    });
    expect(() => importLicenseEnvelope(s.deps, revoked)).toThrow(/révoquée/);
    expect(getLicenseStatus(s.deps).state).toBe("REVOKED");
    // Rejeu de l'ancien actif : refusé, l'état révoqué est conservé.
    expect(() => importLicenseEnvelope(s.deps, active)).toThrow(/révoquée/);
    expect(getLicenseStatus(s.deps).state).toBe("REVOKED");
    expect(() => requireLicensedMutation(s.deps)).toThrow(/révoquée/);
    // Une autre licence reste importable (pas de verrou global).
    const other = { ...base, licenseId: "LIC-SVC-2" };
    const otherVlic = encodeVlic({ payload: other, signature: signPayload(other, s.priv) });
    expect(importLicenseEnvelope(s.deps, otherVlic).state).toBe("ACTIVE");
  });

  it("#31 : état v1 legacy => refus (CORRUPTED_STATE, réimport exigé)", () => {
    const s = setup();
    const vlic = encodeVlic({ payload: payload(), signature: signPayload(payload(), s.priv) });
    importLicenseEnvelope(s.deps, vlic);
    expect(getLicenseStatus(s.deps).state).toBe("ACTIVE");
    const stored = s.deps.loadState(s.deps.backend);
    expect(stored?.version).toBe(2);
    if (!stored) throw new Error("état attendu");
    const v1: PersistedLicenseState = {
      version: 1,
      envelope: stored.envelope,
      hardwareFingerprint: stored.hardwareFingerprint,
      lastSeenUtc: stored.lastSeenUtc,
      lastVerifyUtc: stored.lastVerifyUtc,
    };
    s.deps.saveState(s.deps.backend, v1);
    expect(getLicenseStatus(s.deps).state).toBe("CORRUPTED_STATE");
    expect(canOpenShell(s.deps)).toBe(false);
  });
});
