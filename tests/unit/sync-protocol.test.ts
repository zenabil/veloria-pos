// Veloria — Protocole de synchro POS → miroir : validation, cadence, requêtes.
import { describe, expect, it } from "vitest";
import {
  buildMirrorRequests,
  isPushDue,
  maskConfig,
  validateSyncConfig,
} from "../../electron/sync/sync.protocol";

const FULL = {
  enabled: true,
  supabaseUrl: "https://abcxyz.supabase.co",
  serviceKey: "k".repeat(40),
  anonKey: "",
  intervalMinutes: 15,
};

describe("validateSyncConfig", () => {
  it("accepte une configuration complète", () => {
    expect(validateSyncConfig(FULL)).toEqual(FULL);
  });
  it("désactivée : URL/clé vides acceptées", () => {
    expect(
      validateSyncConfig({
        enabled: false,
        supabaseUrl: "",
        serviceKey: "",
        anonKey: "",
        intervalMinutes: 15,
      }),
    ).toEqual({
      enabled: false,
      supabaseUrl: "",
      serviceKey: "",
      anonKey: "",
      intervalMinutes: 15,
    });
  });
  it("activée : URL et clé exigées", () => {
    expect(() => validateSyncConfig({ ...FULL, supabaseUrl: "http://evil.com" })).toThrow();
    expect(() =>
      validateSyncConfig({ ...FULL, supabaseUrl: "http://127.0.0.1:8100" }),
    ).not.toThrow();
    expect(() =>
      validateSyncConfig({ ...FULL, supabaseUrl: "http://localhost:8100/" }),
    ).not.toThrow();
    expect(() =>
      validateSyncConfig({ ...FULL, supabaseUrl: "http://127.0.0.1:8100/evil" }),
    ).toThrow();
    expect(() => validateSyncConfig({ ...FULL, serviceKey: "court" })).toThrow();
    expect(() => validateSyncConfig({ ...FULL, serviceKey: "" })).toThrow();
  });
  it("cadence bornée 5..1440, défaut 15", () => {
    expect(validateSyncConfig({ ...FULL, intervalMinutes: 3 }).intervalMinutes).toBe(15);
    expect(validateSyncConfig({ ...FULL, intervalMinutes: 30 }).intervalMinutes).toBe(30);
  });
  it("masque la clé au renderer", () => {
    const view = maskConfig(FULL, { lastPushAt: null, lastError: "x", pendingCount: 2 });
    expect(view.hasKey).toBe(true);
    expect(view.hasAnonKey).toBe(false);
    expect(JSON.stringify(view)).not.toContain("k".repeat(40));
    expect(view.pendingCount).toBe(2);
  });
  it("clé anon : acceptée vide, refusée trop courte", () => {
    expect(validateSyncConfig({ ...FULL, anonKey: "a".repeat(40) }).anonKey).toBe("a".repeat(40));
    expect(() => validateSyncConfig({ ...FULL, anonKey: "court" })).toThrow(/anon/);
  });
});

describe("isPushDue", () => {
  const NOW = Date.parse("2026-09-29T10:00:00.000Z");
  it("jamais poussé → dû ; désactivé → jamais", () => {
    expect(isPushDue(FULL, null, NOW)).toBe(true);
    expect(isPushDue({ ...FULL, enabled: false }, null, NOW)).toBe(false);
    expect(isPushDue({ ...FULL, supabaseUrl: "" }, null, NOW)).toBe(false);
  });
  it("cadence 15 min", () => {
    expect(isPushDue(FULL, "2026-09-29T09:50:00.000Z", NOW)).toBe(false);
    expect(isPushDue(FULL, "2026-09-29T09:44:00.000Z", NOW)).toBe(true);
    expect(isPushDue(FULL, "illisible", NOW)).toBe(true);
  });
});

describe("buildMirrorRequests", () => {
  const access = [
    {
      customer_id: 1,
      phone_hash: "ph",
      pin_hash: "pin",
      qr_secret_hash: null,
      revoked_at: null,
      failed_attempts: 0,
      locked_until: null,
      updated_at: "2026-09-29",
    },
  ];
  it("construit upserts idempotents", () => {
    const reqs = buildMirrorRequests(access, [
      {
        operation_id: "op-1",
        customer_id: 1,
        kind: "customer_snapshot",
        payload_json: '{"a":1}',
        created_at: "2026-09-29",
      },
    ]);
    expect(reqs).toHaveLength(2);
    expect(reqs[0]?.onConflict).toBe("customer_id");
    expect(reqs[1]?.onConflict).toBe("operation_id");
    expect((reqs[1]?.rows[0] as { payload: unknown }).payload).toEqual({ a: 1 });
  });
  it("file vide → aucune requête ; JSON cassé → erreur FR", () => {
    expect(buildMirrorRequests([], [])).toEqual([]);
    expect(() =>
      buildMirrorRequests(
        [],
        [
          {
            operation_id: "op-x",
            customer_id: 1,
            kind: "customer_snapshot",
            payload_json: "{cassé",
            created_at: "2026-09-29",
          },
        ],
      ),
    ).toThrow(/corrompu/);
  });
});
