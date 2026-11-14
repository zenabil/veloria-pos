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

/**
 * E-61 — conflit d'ACCÈS sur le miroir. `client_access_active_phone_uq`
 * (`cloud/supabase/schema.sql`, invariant miroir de la migration 0034) refuse
 * deux lignes actives du même numéro : un accès resté sur le miroir après la
 * suppression locale du client (reset d'usine, restauration d'une autre base,
 * numéro réattribué) fait rejeter la ligne d'accès réelle. Or une ligne
 * d'accès refusée n'est **jamais** condamnée (elle est relue à chaque tick) :
 * sans ce cas explicite, la poussée repartait éternellement sur le même 409
 * en silence, et le client voyait un 500 « service indisponible » pendant que
 * l'écran du POS ne disait rien.
 */
const PHONE_CONFLICT_DETAIL_RE = /client_access_active_phone_uq|unique constraint|duplicate key/i;

export function isMirrorPhoneConflict(status: number, detail: string): boolean {
  return status === 409 && PHONE_CONFLICT_DETAIL_RE.test(detail);
}

/** Message unique : la purge du miroir est une opération support, pas client. */
export const MIRROR_PHONE_CONFLICT_MESSAGE =
  "Le miroir garde un accès mobile plus ancien pour ce numéro : la purge du miroir est requise (Réglages → Miroir Android, aucune donnée locale perdue).";

/**
 * Un rejet 401/403 du miroir n'est PAS une panne réseau. Le corps le dit :
 * `Invalid API key` = valeur inconnue du projet, `42501 permission denied` =
 * identité valide mais sans droits (clé publiable à la place de la secrète).
 * Les deux se règlent de la même façon — ressaisir la clé — et le message
 * générique « miroir injoignable » enverrait le gérant vérifier son Internet.
 * La file reste rejouable : rien n'est condamné sur un problème d'identité.
 */
export function isMirrorAuthRejection(status: number, detail: string): boolean {
  if (status !== 401 && status !== 403) return false;
  return /invalid api key|permission denied|"42501"|jwt expired|missing authorization/i.test(
    detail,
  );
}

/** Ce que la forme d'une clé API Supabase révèle d'elle-même (jamais sa valeur). */
export type ApiKeyClass = "publishable" | "secret" | "role-anon" | "role-service" | "unknown";

/**
 * Classe d'une clé sans jamais en exposer le contenu : les clés modernes se
 * reconnaissent à leur préfixe, les clés legacy sont des JWT dont le claim
 * `role` est en lecture seule (non vérifié, pur classement).
 */
export function classifyApiKey(key: unknown): ApiKeyClass {
  if (typeof key !== "string") return "unknown";
  const value = key.trim();
  if (value.startsWith("sb_publishable_")) return "publishable";
  if (value.startsWith("sb_secret_")) return "secret";
  const parts = value.split(".");
  const claims = parts.length === 3 ? parts[1] : undefined;
  if (claims === undefined || !value.startsWith("eyJ")) return "unknown";
  try {
    const role = (
      JSON.parse(Buffer.from(claims, "base64url").toString("utf8")) as {
        role?: unknown;
      }
    ).role;
    if (role === "anon") return "role-anon";
    if (role === "service_role") return "role-service";
  } catch {
    /* JWT illisible : classement inconnu, jamais de refus sur une forme exotique. */
  }
  return "unknown";
}

/**
 * Le miroir n'accepte d'écrire qu'avec une clé `service_role` : une clé
 * **publiable** (ou une `anon` legacy) y est refusée par RLS avec un 401 qui
 * ressemble à s'y méprendre à une panne de réseau. Refuser à la saisie plutôt
 * que de stocker une clé qui ne poussera jamais.
 */
export function assertServiceKeyUsable(serviceKey: string): void {
  const kind = classifyApiKey(serviceKey);
  if (kind === "publishable" || kind === "role-anon") {
    throw new Error(
      "Clé de service refusée : c'est une clé publique. Collez la clé secrète (sb_secret_…) ou la clé service_role legacy.",
    );
  }
}

/**
 * La clé `anon` est embarquée dans le QR V2, donc diffusée : une clé secrète
 * à cette place reviendrait à donner l'écriture totale du miroir au premier
 * acheteur de scans. Contrôlée uniquement à la SAISIE (une valeur déjà
 * enregistrée ne doit jamais bloquer une poussée en cours).
 */
export function assertAnonKeyPublic(anonKey: string): void {
  const kind = classifyApiKey(anonKey);
  if (kind === "secret" || kind === "role-service") {
    throw new Error(
      "Clé anon refusée : cette clé donne tous les droits et part dans le QR public. Utilisez la clé publiable (sb_publishable_…).",
    );
  }
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
    assertServiceKeyUsable(serviceKey);
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
/**
 * Cadence de poussée due ? `lastPushAt` seul était insuffisant : il n'est écrit
 * qu'au SUCCÈS, donc un miroir injoignable (clé refusée, réseau HS) relançait
 * une poussée complète à chaque tick de 60 s, indéfiniment. E-43 ajoute
 * `lastAttemptAt` (horodaté succès ET échec) : la gate prend le plus récent
 * des deux, la cadence `intervalMinutes` est donc réellement respectée.
 */
export function isPushDue(
  cfg: SyncConfig,
  lastPushAt: string | null,
  nowMs: number,
  lastAttemptAt?: string | null,
): boolean {
  if (!cfg.enabled) return false;
  if (cfg.supabaseUrl === "" || cfg.serviceKey === "") return false;
  const latest = latestIso(lastPushAt, lastAttemptAt ?? null);
  if (latest == null) return true;
  const last = Date.parse(latest);
  if (!Number.isFinite(last)) return true;
  return nowMs - last >= cfg.intervalMinutes * 60_000;
}

/** Le plus récent de deux horodatages ISO (null si les deux sont absents). */
function latestIso(a: string | null, b: string | null): string | null {
  if (a == null) return b;
  if (b == null) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
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
  lastOwnerAttemptAt?: string | null,
): boolean {
  if (!cfg.ownerEnabled) return false;
  if (cfg.supabaseUrl === "" || cfg.serviceKey === "") return false;
  const latest = latestIso(lastOwnerPushAt, lastOwnerAttemptAt ?? null);
  if (latest == null) return true;
  const last = Date.parse(latest);
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
  /** SYNC-02 : nombre de tentatives déjà effectuées (backoff + quarantaine). */
  attempts: number;
}

export interface MirrorRequest {
  table: "client_access" | "client_payloads";
  onConflict: string;
  rows: Record<string, unknown>[];
}

/**
 * ADR-173 : un rejet **définitif** du miroir se reconnaît au code HTTP seul.
 * Ces requêtes échoueraient à l'identique au centième essai — contrainte
 * étrangère (409 : `client_payloads.customer_id` sans ligne `client_access`),
 * payload invalide (400/422), table absente (404), ressource partie (410),
 * média non pris (415). Les 401/403 (identité, RLS) et les 5xx/réseau sont au
 * contraire **temporaires** : la file doit rester rejouable, rien n'est écarté.
 */
const PERMANENT_MIRROR_REJECTION = new Set([400, 404, 409, 410, 415, 422]);

export function isPermanentMirrorRejection(status: number): boolean {
  return PERMANENT_MIRROR_REJECTION.has(status);
}

/** Rejet miroir définitif, typé : le service décide « écarter » ou « stopper ». */
export class MirrorRejectionError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Miroir injoignable (HTTP ${status}).`);
    this.name = "MirrorRejectionError";
  }
}

/**
 * E-42 (radical) — un rejet définitif n'est pas forcément **de la faute d'une
 * ligne**. `ADR-173` divise le lot jusqu'à isoler « la coupable » : efficace
 * pour une contrainte étrangère (409) ou un payload invalide (400/422),
 * catastrophique pour une table absente (mauvais projet, schéma non provisionné) :
 * la bissection condamnait UNE PAR UNE les 200 clichés en `failed` — perte
 * silencieuse et **définitive** de tout l'historique client, pour une simple
 * erreur de configuration.
 *
 * La distinction est dans le détail PostgREST, donc elle est décidable ici
 * (pur, testable) : `42P01` / `PGRST205` / « relation … does not exist » /
 * « Could not find the … table » parlent de la **table**, jamais d'une ligne.
 */
export type MirrorRejectionKind = "row" | "table" | "transient";

const TABLE_LEVEL_DETAIL_RE =
  /does not exist|could not find the (?:table|view|relation)|relation "?[a-z0-9_.]+"?|schema cache|\b42P01\b|\bPGRST205\b|\bPGRST111\b/i;

export function classifyMirrorRejection(status: number, detail: string): MirrorRejectionKind {
  if (!isPermanentMirrorRejection(status)) return "transient";
  if (status === 404) return "table";
  if (TABLE_LEVEL_DETAIL_RE.test(detail)) return "table";
  return "row";
}

/**
 * E-41 (radical) — un `payload_json` illisible DANS LA FILE gelait toute la
 * poussée : `buildMirrorRequests` levait, donc la file entière restait
 * `pending` et le tick suivant mourait sur la même ligne (miroir jamais à
 * jour, aucune erreur nouvelle). Comme pour le rejet HTTP, la ligne coupable
 * est écartée et les autres partent.
 *
 * Sépare donc la file en « poussable » / « corrompue » AVANT construction des
 * requêtes. La corruption est locale (disque), elle n'a rien de temporaire :
 * ces lignes-là sont condamnées, avec raison FR, et non rejouées indéfiniment.
 */
export function partitionOutboxRows(rows: readonly OutboxMirrorRow[]): {
  valid: OutboxMirrorRow[];
  corruptedOperationIds: string[];
} {
  const valid: OutboxMirrorRow[] = [];
  const corruptedOperationIds: string[] = [];
  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.payload_json) as unknown;
    } catch {
      corruptedOperationIds.push(row.operation_id);
      continue;
    }
    // Un JSON légal mais vide/nul n'est pas un cliché : même traitement.
    if (parsed === null || parsed === "") {
      corruptedOperationIds.push(row.operation_id);
      continue;
    }
    valid.push(row);
  }
  return { valid, corruptedOperationIds };
}

/**
 * Moitiés d'une requête. PostgREST applique un POST par lot en **une seule**
 * instruction : une ligne condamnée fait échouer tout le lot. Diviser isole la
 * coupable sans casser les autres (coût `k·log n` requêtes, `n ≤ 200`).
 * Rend `[]` pour une ligne seule : c'est elle qui est condamnée.
 */
export function splitMirrorRequest(req: MirrorRequest): MirrorRequest[] {
  if (req.rows.length < 2) return [];
  const mid = Math.ceil(req.rows.length / 2);
  return [
    { table: req.table, onConflict: req.onConflict, rows: req.rows.slice(0, mid) },
    { table: req.table, onConflict: req.onConflict, rows: req.rows.slice(mid) },
  ];
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
