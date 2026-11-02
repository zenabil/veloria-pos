// Veloria PoS — ADR-171 : protocole de la liasse de supervision propriétaire.
// Validation des nouveaux champs, bornes de cadence, échéance de publication
// et URL de la table append-only. PUR (aucune IO, aucun Electron).
import { describe, it, expect } from "vitest";
import {
  OWNER_INTERVAL_MAX,
  OWNER_INTERVAL_MIN,
  SYNC_DEFAULTS,
  isOwnerPushDue,
  maskConfig,
  ownerSnapshotsUrl,
  validateSyncConfig,
  type SyncConfig,
} from "../../electron/sync/sync.protocol";

const MIRROR: SyncConfig = {
  enabled: true,
  supabaseUrl: "https://abcxyz.supabase.co",
  serviceKey: "k".repeat(40),
  anonKey: "",
  intervalMinutes: 15,
  ownerEnabled: false,
  ownerIntervalMinutes: 60,
};

describe("ADR-171 : validateSyncConfig — champs liasse", () => {
  it("absents du payload : défauts sûrs (OFF, 60 minutes)", () => {
    const cfg = validateSyncConfig({
      enabled: MIRROR.enabled,
      supabaseUrl: MIRROR.supabaseUrl,
      serviceKey: MIRROR.serviceKey,
      anonKey: "",
      intervalMinutes: 15,
    });
    expect(cfg.ownerEnabled).toBe(false);
    expect(cfg.ownerIntervalMinutes).toBe(SYNC_DEFAULTS.ownerIntervalMinutes);
  });
  it("cadence bornée 15..1440, hors bornes ou non entière = défaut", () => {
    expect(OWNER_INTERVAL_MIN).toBe(15);
    expect(OWNER_INTERVAL_MAX).toBe(1440);
    expect(validateSyncConfig({ ...MIRROR, ownerIntervalMinutes: 15 }).ownerIntervalMinutes).toBe(
      15,
    );
    expect(validateSyncConfig({ ...MIRROR, ownerIntervalMinutes: 1440 }).ownerIntervalMinutes).toBe(
      1440,
    );
    expect(validateSyncConfig({ ...MIRROR, ownerIntervalMinutes: 90 }).ownerIntervalMinutes).toBe(
      90,
    );
    // Trop court (quota egress) et trop long (hors borne haute) → défaut.
    expect(validateSyncConfig({ ...MIRROR, ownerIntervalMinutes: 14 }).ownerIntervalMinutes).toBe(
      SYNC_DEFAULTS.ownerIntervalMinutes,
    );
    expect(validateSyncConfig({ ...MIRROR, ownerIntervalMinutes: 1441 }).ownerIntervalMinutes).toBe(
      SYNC_DEFAULTS.ownerIntervalMinutes,
    );
    expect(validateSyncConfig({ ...MIRROR, ownerIntervalMinutes: 60.5 }).ownerIntervalMinutes).toBe(
      SYNC_DEFAULTS.ownerIntervalMinutes,
    );
  });
  it("activée sans miroir : refus en français (synchro générale coupée)", () => {
    expect(() => validateSyncConfig({ ...MIRROR, enabled: false, ownerEnabled: true })).toThrow(
      /^Liasse propriétaire :/,
    );
    // Miroir activé mais incomplet : la porte du miroir passe en premier
    // (défense en profondeur dans l'ordre — un refus FR dans tous les cas).
    expect(() => validateSyncConfig({ ...MIRROR, serviceKey: "", ownerEnabled: true })).toThrow(
      /^Clé service invalide\.$/,
    );
    expect(() => validateSyncConfig({ ...MIRROR, supabaseUrl: "", ownerEnabled: true })).toThrow(
      /^URL Supabase invalide/,
    );
    // Sans miroir DU TOUT (synchro coupée) : c'est le message de la liasse.
    expect(() =>
      validateSyncConfig({
        ...MIRROR,
        enabled: false,
        supabaseUrl: "",
        serviceKey: "",
        ownerEnabled: true,
      }),
    ).toThrow(/URL et la clé service/);
  });
  it("activée sur un miroir complet : acceptée, relayée jusqu'à la vue", () => {
    const cfg = validateSyncConfig({
      ...MIRROR,
      ownerEnabled: true,
      ownerIntervalMinutes: 30,
    });
    expect(cfg.ownerEnabled).toBe(true);
    expect(cfg.ownerIntervalMinutes).toBe(30);
    const view = maskConfig(cfg, {
      lastPushAt: null,
      lastError: null,
      pendingCount: 0,
      ownerEmail: null,
      ownerUpdatedAt: null,
      lastOwnerPushAt: "2026-11-02T09:00:00.000Z",
      lastOwnerError: null,
    });
    expect(view.ownerEnabled).toBe(true);
    expect(view.ownerIntervalMinutes).toBe(30);
    expect(view.lastOwnerPushAt).toBe("2026-11-02T09:00:00.000Z");
    // Règle 2 : la vue ne contient JAMAIS la clé service.
    expect(JSON.stringify(view)).not.toContain("k".repeat(40));
  });
});

describe("ADR-171 : isOwnerPushDue", () => {
  const NOW = Date.parse("2026-11-02T10:00:00.000Z");
  const ON: SyncConfig = { ...MIRROR, ownerEnabled: true, ownerIntervalMinutes: 60 };
  it("jamais publiée → due ; désactivée → jamais due", () => {
    expect(isOwnerPushDue(ON, null, NOW)).toBe(true);
    expect(isOwnerPushDue({ ...ON, ownerEnabled: false }, null, NOW)).toBe(false);
  });
  it("miroir non configuré : jamais due (défense en profondeur)", () => {
    expect(isOwnerPushDue({ ...ON, supabaseUrl: "" }, null, NOW)).toBe(false);
    expect(isOwnerPushDue({ ...ON, serviceKey: "" }, null, NOW)).toBe(false);
  });
  it("arithmétique de cadence : 60 minutes", () => {
    expect(isOwnerPushDue(ON, "2026-11-02T09:30:00.000Z", NOW)).toBe(false);
    expect(isOwnerPushDue(ON, "2026-11-02T08:30:00.000Z", NOW)).toBe(true);
  });
  it("exactement à la borne = due (cadence 15 minutes)", () => {
    const q15: SyncConfig = { ...ON, ownerIntervalMinutes: OWNER_INTERVAL_MIN };
    expect(isOwnerPushDue(q15, "2026-11-02T09:45:00.000Z", NOW)).toBe(true);
    expect(isOwnerPushDue(q15, "2026-11-02T09:45:00.001Z", NOW)).toBe(false);
  });
  it("horodatage illisible → due (jamais bloquée sur une méta corrompue)", () => {
    expect(isOwnerPushDue(ON, "pas-un-instant", NOW)).toBe(true);
  });
  it("cadence indépendante de celle du miroir", () => {
    const slowMirror: SyncConfig = { ...ON, intervalMinutes: 1440 };
    expect(isOwnerPushDue(slowMirror, "2026-11-02T09:30:00.000Z", NOW)).toBe(false);
    expect(isOwnerPushDue(slowMirror, "2026-11-02T08:59:59.000Z", NOW)).toBe(true);
  });
});

describe("ADR-171 : ownerSnapshotsUrl", () => {
  it("table PostgREST des liasses, slash final normalisé", () => {
    expect(ownerSnapshotsUrl("https://abcxyz.supabase.co")).toBe(
      "https://abcxyz.supabase.co/rest/v1/owner_snapshots",
    );
    expect(ownerSnapshotsUrl("https://abcxyz.supabase.co///")).toBe(
      "https://abcxyz.supabase.co/rest/v1/owner_snapshots",
    );
  });
  it("relais local (E2E) : même chemin, aucun upsert ajouté", () => {
    expect(ownerSnapshotsUrl("http://127.0.0.1:8100")).toBe(
      "http://127.0.0.1:8100/rest/v1/owner_snapshots",
    );
    // Append-only : la table n'a aucune contrainte d'unicité (`cloud/supabase/
    // owner.sql`) → JAMAIS d'`on_conflict=` dans l'URL du publieur.
    expect(ownerSnapshotsUrl("https://abcxyz.supabase.co")).not.toContain("on_conflict");
  });
});
