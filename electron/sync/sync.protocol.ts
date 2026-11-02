// Veloria PoS — Sync protocol (PUR, sans IO) : POS → miroir Supabase.
// Toute la logique décidable vit ici (testable sans Electron) ; le service
// ne fait que lire la base, appeler fetch et marquer la file.
// V1 : poussée seule (jamais de lecture financière depuis le cloud).

/** Cadence de publication propriétaire : bornes basses hautes (quota egress). */
export const OWNER_INTERVAL_MIN = 15;
export const OWNER_INTERVAL_MAX = 1440;

export interface SyncConfig {
  enabled: boolean;
  supabaseUrl: string;
  serviceKey: string;
  /** Clé `anon` publique embarquée dans le QR V2 (ADR-068, jamais la service). */
  anonKey: string;
  /** Cadence auto-poussée en minutes (défaut 15, min 5 — quota egress). */
  intervalMinutes: number;
  /**
   * ADR-171 : publication de la liasse de supervision propriétaire (app
   * `owner/`). Défaut OFF — aucune donnée ne sort sans décision du gérant.
   */
  ownerEnabled: boolean;
  /** Cadence de publication propriétaire en minutes (défaut 60, bornes 15..1440). */
  ownerIntervalMinutes: number;
}

export const SYNC_DEFAULTS: SyncConfig = {
  enabled: false,
  supabaseUrl: "",
  serviceKey: "",
  anonKey: "",
  intervalMinutes: 15,
  ownerEnabled: false,
  ownerIntervalMinutes: 60,
};

export interface SyncConfigView {
  enabled: boolean;
  supabaseUrl: string;
  hasKey: boolean;
  hasAnonKey: boolean;
  intervalMinutes: number;
  lastPushAt: string | null;
  lastError: string | null;
  pendingCount: number;
  /** Compte propriétaire (app mobile) — e-mail affiché, jamais le mot de passe. */
  ownerEmail: string | null;
  ownerUpdatedAt: string | null;
  /** ADR-171 : liasse de supervision (état de publication, jamais de secret). */
  ownerEnabled: boolean;
  ownerIntervalMinutes: number;
  lastOwnerPushAt: string | null;
  lastOwnerError: string | null;
}

const OWNER_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Valide les identifiants du compte propriétaire (création/mise à jour).
 * Le mot de passe n'est jamais stocké : il part vers Supabase Auth.
 */
export function validateOwnerAccount(
  rawEmail: unknown,
  rawPassword: unknown,
): { email: string; password: string } {
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";
  if (email.length === 0 || email.length > 200 || !OWNER_EMAIL_RE.test(email)) {
    throw new Error("Adresse e-mail du propriétaire invalide.");
  }
  if (password.length < 8 || password.length > 200) {
    throw new Error("Mot de passe propriétaire : 8 à 200 caractères.");
  }
  return { email, password };
}

/** URL Admin Auth (Supabase) — `id` absent = création. */
export function ownerAdminUsersUrl(baseUrl: string, id?: string): string {
  const base = `${baseUrl.replace(/\/+$/, "")}/auth/v1/admin/users`;
  return id ? `${base}/${encodeURIComponent(id)}` : base;
}

/** Valide la configuration (le renderer valide déjà via Zod : défense en profondeur). */
export function validateSyncConfig(raw: unknown): SyncConfig {
  if (typeof raw !== "object" || raw === null)
    throw new Error("Configuration de synchro invalide.");
  const v = raw as Partial<SyncConfig>;
  const enabled = v.enabled === true;
  const supabaseUrl = typeof v.supabaseUrl === "string" ? v.supabaseUrl.trim() : "";
  const serviceKey = typeof v.serviceKey === "string" ? v.serviceKey.trim() : "";
  const anonKey = typeof v.anonKey === "string" ? v.anonKey.trim() : "";
  const intervalMinutes =
    typeof v.intervalMinutes === "number" &&
    Number.isInteger(v.intervalMinutes) &&
    v.intervalMinutes >= 5 &&
    v.intervalMinutes <= 1440
      ? v.intervalMinutes
      : 15;
  const ownerEnabled = v.ownerEnabled === true;
  const ownerIntervalMinutes =
    typeof v.ownerIntervalMinutes === "number" &&
    Number.isInteger(v.ownerIntervalMinutes) &&
    v.ownerIntervalMinutes >= OWNER_INTERVAL_MIN &&
    v.ownerIntervalMinutes <= OWNER_INTERVAL_MAX
      ? v.ownerIntervalMinutes
      : SYNC_DEFAULTS.ownerIntervalMinutes;
  if (enabled) {
    const isCloud = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl);
    // Relais local (essais E2E/boucle locale) : http réservé au loopback.
    const isLoopback = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/?$/i.test(supabaseUrl);
    if (!isCloud && !isLoopback) {
      throw new Error("URL Supabase invalide (https://xxx.supabase.co).");
    }
    if (serviceKey.length < 20 || serviceKey.length > 500) {
      throw new Error("Clé service invalide.");
    }
  }
  // ADR-171 : la liasse part sur le MÊME miroir (mêmes identifiants, mêmes
  // secrets) — l'activer sans destination est un non-sens, refusé ici aussi
  // quand la synchro générale est coupée (défense en profondeur).
  if (ownerEnabled && (!enabled || supabaseUrl === "" || serviceKey === "")) {
    throw new Error(
      "Liasse propriétaire : renseignez l'URL et la clé service du miroir avant de l'activer.",
    );
  }
  // Clé anon (QR V2) : optionnelle pour la poussée, obligatoire pour le QR.
  // Validée dès qu'elle est renseignée (même au repos) pour refuser aussitôt
  // une service_role collée par erreur à la place de l'anon.
  if (anonKey !== "") {
    if (anonKey.length < 20 || anonKey.length > 500 || !/^[A-Za-z0-9-_.=]+$/.test(anonKey)) {
      throw new Error("Clé anon invalide.");
    }
  }
  return {
    enabled,
    supabaseUrl,
    serviceKey,
    anonKey,
    intervalMinutes,
    ownerEnabled,
    ownerIntervalMinutes,
  };
}

/** Vue sans secret pour le renderer (jamais de clé vers l'UI). */
export function maskConfig(
  cfg: SyncConfig,
  meta: {
    lastPushAt: string | null;
    lastError: string | null;
    pendingCount: number;
    ownerEmail: string | null;
    ownerUpdatedAt: string | null;
    lastOwnerPushAt: string | null;
    lastOwnerError: string | null;
  },
): SyncConfigView {
  return {
    enabled: cfg.enabled,
    supabaseUrl: cfg.supabaseUrl,
    hasKey: cfg.serviceKey.length > 0,
    hasAnonKey: cfg.anonKey.length > 0,
    intervalMinutes: cfg.intervalMinutes,
    lastPushAt: meta.lastPushAt,
    lastError: meta.lastError,
    pendingCount: meta.pendingCount,
    ownerEmail: meta.ownerEmail,
    ownerUpdatedAt: meta.ownerUpdatedAt,
    ownerEnabled: cfg.ownerEnabled,
    ownerIntervalMinutes: cfg.ownerIntervalMinutes,
    lastOwnerPushAt: meta.lastOwnerPushAt,
    lastOwnerError: meta.lastOwnerError,
  };
}

/** Hôte normalisé d'une URL de miroir ("" si illisible). */
export function syncHost(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Changement de destination avec conservation d'une clé service existante :
 * la clé a été saisie pour l'ancien hôte, pas pour le nouveau. Exiger sa
 * ressaisie empêche un utilisateur `settings` de rediriger silencieusement la
 * clé service_role (et les données) vers son propre projet/relais.
 */
export function requiresServiceKeyReentry(args: {
  prevUrl: string;
  prevHasKey: boolean;
  nextUrl: string;
  incomingKey: string;
}): boolean {
  if (!args.prevHasKey) return false;
  if (args.incomingKey.trim().length > 0) return false;
  return syncHost(args.prevUrl) !== syncHost(args.nextUrl);
}

/** Poussée due ? (désactivée, jamais poussée, ou cadence dépassée). */
export function isPushDue(cfg: SyncConfig, lastPushAt: string | null, nowMs: number): boolean {
  if (!cfg.enabled) return false;
  if (cfg.supabaseUrl === "" || cfg.serviceKey === "") return false;
  if (lastPushAt == null) return true;
  const last = Date.parse(lastPushAt);
  if (!Number.isFinite(last)) return true;
  return nowMs - last >= cfg.intervalMinutes * 60_000;
}

/**
 * ADR-171 : publication de la liasse propriétaire due ? Indépendante de la
 * cadence du miroir (le gérant n'a pas besoin d'un cliché APK toutes les
 * heures, mais d'une liasse fraîche). Exactement à la borne = dû.
 */
export function isOwnerPushDue(
  cfg: SyncConfig,
  lastOwnerPushAt: string | null,
  nowMs: number,
): boolean {
  if (!cfg.ownerEnabled) return false;
  if (cfg.supabaseUrl === "" || cfg.serviceKey === "") return false;
  if (lastOwnerPushAt == null) return true;
  const last = Date.parse(lastOwnerPushAt);
  if (!Number.isFinite(last)) return true;
  return nowMs - last >= cfg.ownerIntervalMinutes * 60_000;
}

/**
 * Table PostgREST des liasses (`cloud/supabase/owner.sql`) : append-only,
 * aucune contrainte d'unicité → un POST simple, jamais d'upsert. La plus
 * récente gagne, triée par l'app sur `generated_at DESC`.
 */
export function ownerSnapshotsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/rest/v1/owner_snapshots`;
}

export interface AccessMirrorRow {
  customer_id: number;
  phone_hash: string;
  pin_hash: string;
  /** #39 : sel PBKDF2 (absent/NULL = ligne historique SHA-256, chemin transitoire). */
  pin_salt?: string | null;
  /** #39 : identifiant de dérivation (lignes neuves : PIN_KDF_ALGO). */
  pin_algo?: string | null;
  qr_secret_hash: string | null;
  revoked_at: string | null;
  failed_attempts: number;
  locked_until: string | null;
  updated_at: string;
}

export interface OutboxMirrorRow {
  operation_id: string;
  customer_id: number;
  kind: string;
  payload_json: string;
  created_at: string;
}

export interface MirrorRequest {
  table: "client_access" | "client_payloads";
  onConflict: string;
  rows: Record<string, unknown>[];
}

/**
 * Requêtes REST vers le miroir : upserts idempotents (rejouables sans
 * doublons grâce aux UNIQUE operation_id / customer_id côté miroir).
 * `payload_json` est validé JSON ici (jamais de texte cassé poussé).
 */
export function buildMirrorRequests(
  accessRows: AccessMirrorRow[],
  outboxRows: OutboxMirrorRow[],
): MirrorRequest[] {
  const out: MirrorRequest[] = [];
  if (accessRows.length > 0) {
    out.push({
      table: "client_access",
      onConflict: "customer_id",
      rows: accessRows.map((r) => ({ ...r })),
    });
  }
  const payloads: Record<string, unknown>[] = [];
  for (const r of outboxRows) {
    let payload: unknown;
    try {
      payload = JSON.parse(r.payload_json) as unknown;
    } catch {
      throw new Error(`Cliché corrompu en file (op ${r.operation_id}).`);
    }
    payloads.push({
      operation_id: r.operation_id,
      customer_id: r.customer_id,
      kind: r.kind,
      payload,
      created_at: r.created_at,
    });
  }
  if (payloads.length > 0) {
    out.push({ table: "client_payloads", onConflict: "operation_id", rows: payloads });
  }
  return out;
}
