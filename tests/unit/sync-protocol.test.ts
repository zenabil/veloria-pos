// Veloria — Protocole de synchro POS → miroir : validation, cadence, requêtes.
import { describe, expect, it } from "vitest";
import {
  buildMirrorRequests,
  isPushDue,
  maskConfig,
  ownerAdminUsersUrl,
  validateOwnerAccount,
  requiresServiceKeyReentry,
  syncHost,
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
    const view = maskConfig(FULL, {
      lastPushAt: null,
      lastError: "x",
      pendingCount: 2,
      ownerEmail: "direction@exemple.dz",
      ownerUpdatedAt: "2026-10-31T10:00:00.000Z",
    });
    expect(view.hasKey).toBe(true);
    expect(view.hasAnonKey).toBe(false);
    expect(JSON.stringify(view)).not.toContain("k".repeat(40));
    expect(view.pendingCount).toBe(2);
    expect(view.ownerEmail).toBe("direction@exemple.dz");
  });
  it("clé anon : acceptée vide, refusée trop courte", () => {
    expect(validateSyncConfig({ ...FULL, anonKey: "a".repeat(40) }).anonKey).toBe("a".repeat(40));
    expect(() => validateSyncConfig({ ...FULL, anonKey: "court" })).toThrow(/anon/);
  });
});

describe("validateOwnerAccount", () => {
  it("accepte un e-mail normalisé + mot de passe ≥ 8", () => {
    expect(validateOwnerAccount("  Direction@Exemple.DZ  ", "motdepasse")).toEqual({
      email: "direction@exemple.dz",
      password: "motdepasse",
    });
  });
  it("refuse e-mail invalide, mot de passe trop court ou trop long", () => {
    expect(() => validateOwnerAccount("pas-un-email", "motdepasse")).toThrow(/e-mail/i);
    expect(() => validateOwnerAccount("a@b.dz", "court")).toThrow(/Mot de passe/);
    expect(() => validateOwnerAccount("a@b.dz", "x".repeat(201))).toThrow(/Mot de passe/);
    expect(() => validateOwnerAccount("x".repeat(210) + "@b.dz", "motdepasse")).toThrow(/e-mail/i);
  });
  it("URLs Admin Auth sans double slash, identifiant encodé", () => {
    expect(ownerAdminUsersUrl("https://x.supabase.co/")).toBe(
      "https://x.supabase.co/auth/v1/admin/users",
    );
    expect(ownerAdminUsersUrl("https://x.supabase.co", "id 1")).toBe(
      "https://x.supabase.co/auth/v1/admin/users/id%201",
    );
  });
});

describe("requiresServiceKeyReentry", () => {
  it("exige la clé quand l'hôte change et que la clé est conservée", () => {
    expect(
      requiresServiceKeyReentry({
        prevUrl: "https://abcxyz.supabase.co",
        prevHasKey: true,
        nextUrl: "https://evil.supabase.co",
        incomingKey: "",
      }),
    ).toBe(true);
  });
  it("accepte le même hôte, une nouvelle clé, ou l'absence de clé précédente", () => {
    expect(
      requiresServiceKeyReentry({
        prevUrl: "https://abcxyz.supabase.co",
        prevHasKey: true,
        nextUrl: "https://abcxyz.supabase.co/",
        incomingKey: "",
      }),
    ).toBe(false);
    expect(
      requiresServiceKeyReentry({
        prevUrl: "https://abcxyz.supabase.co",
        prevHasKey: true,
        nextUrl: "https://evil.supabase.co",
        incomingKey: "k".repeat(40),
      }),
    ).toBe(false);
    expect(
      requiresServiceKeyReentry({
        prevUrl: "https://abcxyz.supabase.co",
        prevHasKey: false,
        nextUrl: "https://evil.supabase.co",
        incomingKey: "",
      }),
    ).toBe(false);
  });
  it("normalise l'hôte", () => {
    expect(syncHost("https://ABCXYZ.supabase.co/")).toBe("abcxyz.supabase.co");
    expect(syncHost("pas une url")).toBe("");
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
