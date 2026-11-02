// Veloria — Protocole de synchro POS → miroir : validation, cadence, requêtes.
import { describe, expect, it } from "vitest";
import {
  MirrorRejectionError,
  buildMirrorRequests,
  isPermanentMirrorRejection,
  isPushDue,
  maskConfig,
  ownerAdminUsersUrl,
  splitMirrorRequest,
  validateOwnerAccount,
  requiresServiceKeyReentry,
  syncHost,
  validateSyncConfig,
  type MirrorRequest,
} from "../../electron/sync/sync.protocol";

const FULL = {
  enabled: true,
  supabaseUrl: "https://abcxyz.supabase.co",
  serviceKey: "k".repeat(40),
  anonKey: "",
  intervalMinutes: 15,
  // ADR-171 : défaut OFF — la liasse ne sort jamais sans décision du gérant.
  ownerEnabled: false,
  ownerIntervalMinutes: 60,
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
      ownerEnabled: false,
      ownerIntervalMinutes: 60,
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
      lastOwnerPushAt: null,
      lastOwnerError: null,
    });
    expect(view.hasKey).toBe(true);
    expect(view.hasAnonKey).toBe(false);
    expect(JSON.stringify(view)).not.toContain("k".repeat(40));
    expect(view.pendingCount).toBe(2);
    expect(view.ownerEmail).toBe("direction@exemple.dz");
    // ADR-171 : l'état de publication de la liasse passe, jamais le secret.
    expect(view.ownerEnabled).toBe(false);
    expect(view.ownerIntervalMinutes).toBe(60);
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

// ADR-173 : la frontière « temporaire » / « définitif » est décidable sans IO,
// donc ici — le service ne fait qu'appliquer le verdict.
describe("ADR-173 : rejets du miroir, condamnés vs rejouables", () => {
  it("les codes qui échoueraient à l'identique au centième essai", () => {
    for (const status of [400, 404, 409, 410, 415, 422]) {
      expect(isPermanentMirrorRejection(status)).toBe(true);
    }
  });
  it("identité, RLS, saturation et panne restent REJOUABLES", () => {
    for (const status of [401, 403, 408, 429, 500, 502, 503, 504]) {
      expect(isPermanentMirrorRejection(status)).toBe(false);
    }
  });
  it("divise un lot en deux moitiés à la taille impaire contrôlée", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ operation_id: `op-${i}` }));
    const parts = splitMirrorRequest({
      table: "client_payloads",
      onConflict: "operation_id",
      rows,
    });
    expect(parts.map((p) => p.rows.length)).toEqual([3, 2]);
    expect(parts[0]?.table).toBe("client_payloads");
    expect(parts[1]?.onConflict).toBe("operation_id");
    // Rien n'est perdu ni réordonné : la reunion redonne le lot exact.
    expect([...(parts[0]?.rows ?? []), ...(parts[1]?.rows ?? [])]).toEqual(rows);
  });
  it("une ligne seule ne se divise plus : c'est elle qui est condamnée", () => {
    const one: MirrorRequest = {
      table: "client_payloads",
      onConflict: "operation_id",
      rows: [{ operation_id: "op-1" }],
    };
    expect(splitMirrorRequest(one)).toEqual([]);
    expect(splitMirrorRequest({ ...one, rows: [] })).toEqual([]);
  });
  it("le rejet typé porte le code et le détail serveur", () => {
    const err = new MirrorRejectionError(409, "23503");
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(409);
    expect(err.detail).toBe("23503");
    expect(err.message).toMatch(/HTTP 409/);
  });
});
