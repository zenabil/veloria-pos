// Veloria POS — H-3 Red-Team: tamper-evident license state.
// Adversarial: deletion / replacement / rollback / corruption / replay / clock.
import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  getLicenseStatus,
  importLicenseEnvelope,
  requireLicensedMutation,
  canOpenShell,
  type LicenseServiceDeps,
} from "../../electron/licensing/license-service.ts";
import {
  encodeVlic,
  signPayload,
  licensedPages,
  hasLicensedPage,
  type LicensePayload,
} from "../../electron/licensing/protocol.ts";
import type { PersistedLicenseState } from "../../electron/licensing/secure-state.ts";
import type { LicenseAnchor } from "../../electron/licensing/license-anchor.ts";
import { manifestCoversCritical } from "../../electron/licensing/integrity.ts";
import { managerManifestCoversCritical } from "../../license-manager/main/integrity-check.ts";

const HW = "t".repeat(64);

function keys(): { pub: string; priv: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    pub: publicKey.export({ type: "spki", format: "pem" }).toString(),
    priv: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

function setup(opts?: { now?: number }): {
  deps: LicenseServiceDeps;
  priv: string;
  setNow: (n: number) => void;
  getStored: () => PersistedLicenseState | null;
  setStored: (s: PersistedLicenseState | null) => void;
  getAnchor: () => LicenseAnchor | null;
  setAnchor: (a: LicenseAnchor | null) => void;
  logs: string[];
} {
  const k = keys();
  let now = opts?.now ?? Date.parse("2026-06-01T00:00:00.000Z");
  let stored: PersistedLicenseState | null = null;
  let anchor: LicenseAnchor | null = null;
  const logs: string[] = [];
  const deps: LicenseServiceDeps = {
    nowMs: () => now,
    getPublicKeyPem: () => k.pub,
    getFingerprint: () => HW,
    formatShort: (f) => f.slice(0, 4),
    loadState: () => stored,
    saveState: (_b, s) => {
      stored = s;
    },
    backend: {
      isAvailable: () => true,
      encryptString: (s: string) => Buffer.from(s),
      decryptString: (b: Buffer) => b.toString(),
    },
    loadAnchor: () => anchor,
    saveAnchor: (a) => {
      anchor = a;
    },
    verifyIntegrity: () => "skipped-dev",
    log: (_l, e) => {
      logs.push(e);
    },
  };
  return {
    deps,
    priv: k.priv,
    setNow: (n: number) => {
      now = n;
    },
    getStored: () => stored,
    setStored: (s: PersistedLicenseState | null) => {
      stored = s;
    },
    getAnchor: () => anchor,
    setAnchor: (a: LicenseAnchor | null) => {
      anchor = a;
    },
    logs,
  };
}

function payload(id = "LIC-TAMPER-1"): LicensePayload {
  const pages: Record<string, boolean> = { dashboard: true, sales: true };
  return {
    schemaVersion: 1,
    licenseId: id,
    productId: "veloria-pos",
    edition: "professional",
    licenseType: "term",
    hardwareFingerprint: HW,
    issuedAt: "2026-01-01T00:00:00.000Z",
    startsAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z",
    features: ["ocr"],
    pages,
  };
}

function vlic(p: LicensePayload, priv: string): string {
  return encodeVlic({ payload: p, signature: signPayload(p, priv) });
}

describe("H-3 tamper-evident state", () => {
  it("state deletion after activation => TAMPER_DETECTED (never UNACTIVATED)", () => {
    const s = setup();
    importLicenseEnvelope(s.deps, vlic(payload(), s.priv));
    expect(getLicenseStatus(s.deps).state).toBe("ACTIVE");
    // Attacker deletes license-state.dat only.
    s.setStored(null);
    const st = getLicenseStatus(s.deps);
    expect(st.state).toBe("TAMPER_DETECTED");
    expect(st.licenseId).toBe("LIC-TAMPER-1");
    expect(canOpenShell(s.deps)).toBe(false);
    expect(() => requireLicensedMutation(s.deps)).toThrow(/réactivez|impossible/);
  });

  it("fresh machine (no state, no anchor) stays UNACTIVATED", () => {
    const s = setup();
    expect(getLicenseStatus(s.deps).state).toBe("UNACTIVATED");
  });

  it("state replacement (different licenseId) => TAMPER", () => {
    const s = setup();
    importLicenseEnvelope(s.deps, vlic(payload("LIC-REPLACE-A"), s.priv));
    const other = setup();
    importLicenseEnvelope(other.deps, vlic(payload("LIC-REPLACE-B"), other.priv));
    // Attacker swaps the secure file with another machine's copy.
    s.setStored(other.getStored());
    expect(getLicenseStatus(s.deps).state).toBe("TAMPER_DETECTED");
  });

  it("old-copy rollback (valid tag, stale seq) => TAMPER", () => {
    const s = setup();
    importLicenseEnvelope(s.deps, vlic(payload(), s.priv));
    const firstCopy: PersistedLicenseState = JSON.parse(
      JSON.stringify(s.getStored()),
    ) as PersistedLicenseState;
    // Legit activity advances seq (mutation heartbeat beyond throttle).
    s.setNow(Date.parse("2026-06-01T02:00:00.000Z"));
    requireLicensedMutation(s.deps);
    s.setNow(Date.parse("2026-06-01T04:00:00.000Z"));
    getLicenseStatus(s.deps);
    const firstSeq = typeof firstCopy.monotonicSeq === "number" ? firstCopy.monotonicSeq : 0;
    expect(s.getStored()?.monotonicSeq ?? 0).toBeGreaterThan(firstSeq);
    // Attacker restores the older (validly signed) copy.
    s.setStored(firstCopy);
    expect(getLicenseStatus(s.deps).state).toBe("TAMPER_DETECTED");
  });

  it("manual tag edit => CORRUPTED_STATE", () => {
    const s = setup();
    importLicenseEnvelope(s.deps, vlic(payload(), s.priv));
    const cur = s.getStored();
    expect(cur?.version).toBe(2);
    s.setStored({ ...(cur as PersistedLicenseState), monotonicSeq: 999 });
    expect(getLicenseStatus(s.deps).state).toBe("CORRUPTED_STATE");
  });

  it("re-import of renewed license preserves firstSeen (replay detectable)", () => {
    const s = setup();
    importLicenseEnvelope(s.deps, vlic(payload(), s.priv));
    const first = s.getStored()?.firstSeenUtc;
    s.setNow(Date.parse("2026-12-01T00:00:00.000Z"));
    const renewed: LicensePayload = {
      ...payload(),
      issuedAt: "2026-12-01T00:00:00.000Z",
      expiresAt: "2027-12-01T00:00:00.000Z",
    };
    importLicenseEnvelope(s.deps, vlic(renewed, s.priv));
    expect(s.getStored()?.firstSeenUtc).toBe(first);
    expect(s.getStored()?.monotonicSeq ?? 0).toBeGreaterThan(1);
  });

  it("clock rollback still detected with anchor present", () => {
    const s = setup();
    importLicenseEnvelope(s.deps, vlic(payload(), s.priv));
    s.setNow(Date.parse("2026-01-01T00:00:00.000Z"));
    expect(getLicenseStatus(s.deps).state).toBe("CLOCK_ROLLBACK");
  });

  it("licensed read advances lastSeen (no clock freeze via reads)", () => {
    const s = setup();
    importLicenseEnvelope(s.deps, vlic(payload(), s.priv));
    const before = s.getStored()?.lastSeenUtc as string;
    s.setNow(Date.parse("2026-06-01T05:00:00.000Z"));
    getLicenseStatus(s.deps);
    expect(s.getStored()?.lastSeenUtc).not.toBe(before);
  });

  it("post-cutoff license without pages is denied (no silent grant)", () => {
    const p = {
      ...payload(),
      issuedAt: "2026-10-01T00:00:00.000Z",
    };
    delete (p as Partial<LicensePayload>).pages;
    expect(hasLicensedPage(p as LicensePayload, "sales")).toBe(false);
    expect(Object.values(licensedPages(p as LicensePayload)).every(Boolean)).toBe(false);
  });

  it("pre-cutoff legacy without pages keeps access (no existing client blocked)", () => {
    const p = {
      ...payload(),
      issuedAt: "2026-01-01T00:00:00.000Z",
    };
    delete (p as Partial<LicensePayload>).pages;
    expect(hasLicensedPage(p as LicensePayload, "sales")).toBe(true);
  });
});

describe("P0-4 : manifeste vide ou incomplet = refus", () => {
  it("POS : vide → false, critique manquant → false, complet → true", () => {
    expect(manifestCoversCritical({})).toBe(false);
    expect(
      manifestCoversCritical({
        "dist-electron/main/main.js": "a",
        "dist-electron/preload/preload.js": "b",
      }),
    ).toBe(false);
    expect(
      manifestCoversCritical({
        "dist-electron/main/main.js": "a",
        "dist-electron/preload/preload.js": "b",
        "resources/license/public.key": "c",
        "dist/index.html": "d",
      }),
    ).toBe(true);
  });
  it("Manager : vide → false, critique manquant → false, complet → true", () => {
    expect(managerManifestCoversCritical({})).toBe(false);
    expect(
      managerManifestCoversCritical({
        "dist-license-manager/license-manager/main/main.js": "a",
      }),
    ).toBe(false);
    expect(
      managerManifestCoversCritical({
        "dist-license-manager/license-manager/main/main.js": "a",
        "dist-license-manager/license-manager/db/manager-db.js": "b",
        "dist-license-manager-renderer/index.html": "c",
        "resources/license/public.key": "d",
      }),
    ).toBe(true);
  });
});
