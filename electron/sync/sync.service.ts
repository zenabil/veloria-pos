// Veloria PoS — Sync service : poussée POS → miroir Supabase (V1).
// Best-effort strict : un échec réseau ne casse JAMAIS une vente ni un
// paiement (les appelants ignorent l'erreur après log). Toute la logique
// décidable vit dans sync.protocol (testé) ; ici : base + HTTP + timers.
// Secrets : URL + clé service dans app_settings (clé `client_sync`, machine
// du commerçant uniquement — jamais transmises au renderer, voir maskConfig).

import { randomUUID } from "node:crypto";
import { getDb } from "../database/sqlite.service";
import { log } from "../services/logger";
import {
  claimIdempotency,
  peekIdempotency,
  storeIdempotencyResult,
} from "../ipc/handlers/idempotency";
import { toUserMessage } from "../ipc/ipc-errors";
import { businessMonthOf } from "../shared/business-day";
import { enqueueSnapshotAtomic, hasActiveClientAccess } from "../ipc/handlers/client-access.repo";
import {
  buildCatalog,
  getCatalogSettings,
  isCatalogStale,
  recordCatalogPublished,
} from "../ipc/handlers/client-catalog.repo";
import { createClientOrderAtomic } from "../ipc/handlers/client-order.repo";
import {
  SYNC_DEFAULTS,
  MirrorRejectionError,
  MIRROR_PHONE_CONFLICT_MESSAGE,
  assertAnonKeyPublic,
  buildMirrorRequests,
  classifyMirrorRejection,
  isMirrorAuthRejection,
  isMirrorPhoneConflict,
  isPermanentMirrorRejection,
  isOwnerPushDue,
  isPushDue,
  maskConfig,
  ownerAdminUsersUrl,
  ownerSnapshotsUrl,
  partitionOutboxRows,
  requiresServiceKeyReentry,
  splitMirrorRequest,
  validateOwnerAccount,
  validateSyncConfig,
  type AccessMirrorRow,
  type MirrorRequest,
  type OutboxMirrorRow,
  type SyncConfig,
  type SyncConfigView,
} from "./sync.protocol";
import { buildOwnerSnapshot } from "./owner-snapshot";
import { reencryptLegacySecrets } from "./secret-hygiene";
import { classifySyncFailure, decideRetry, type SyncFailureKind } from "./retry-policy";
import {
  decodeSecretWith,
  encodeSecret,
  safeStorageSecretBackend,
  type SecretBackend,
} from "./sync-secrets";

const SETTINGS_KEY = "client_sync";
const OWNER_ACCOUNT_KEY = "owner_account";
const OWNER_ACCOUNT_CHANNEL = "sync.saveOwnerAccount";
/** Message unique : l'identité refusée par Supabase se répare à l'écran, pas au routeur. */
const SERVICE_KEY_REFUSED =
  "Clé de service refusée par Supabase : ressaisissez-la (Réglages → Miroir Android).";
const SYNC_DISABLED_MESSAGE = "Synchronisation désactivée : activez-la d'abord.";

/**
 * SYNC-02 : raison de quarantaine (FR) d'une ligne définitivement écartée.
 * La ligne n'est pas supprimée : elle reste consultable comme état d'audit.
 */
const QUARANTINE_REASON_FR =
  "Ligne isolée : refus définitif du miroir (données incohérentes) ou budget de tentatives épuisé.";

/**
 * SYNC-02 : classe l'échec d'une poussée dans la taxonomie
 * (transient / auth / schema / validation / permanent).
 */
function classifyPushFailure(err: unknown): SyncFailureKind {
  if (err instanceof MirrorRejectionError) {
    return classifySyncFailure(err.status, err.detail);
  }
  const msg = err instanceof Error ? err.message : "";
  if (msg === SERVICE_KEY_REFUSED) return "auth";
  if (msg.startsWith("Miroir incomplet")) return "schema";
  if (msg === MIRROR_PHONE_CONFLICT_MESSAGE) return "validation";
  return "transient";
}

/**
 * SYNC-02 : jitter DÉTERMINISTE par ligne (dérivé de l'operation_id). Deux
 * lignes rejetées par la même panne ne repartent donc pas au même instant, et
 * le comportement reste REPRODUCTIBLE (un test rejoue le même résultat).
 */
function jitterFactor(operationId: string): number {
  let hash = 0;
  for (let i = 0; i < operationId.length; i += 1) {
    hash = (hash * 31 + operationId.charCodeAt(i)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

interface OwnerAccountDoc {
  email: string;
  userId: string;
  updatedAt: string;
}

export interface OwnerAccountResult {
  email: string;
  userId: string;
  created: boolean;
  updatedAt: string;
}

/** Backend de chiffrement (DPAPI en prod). */
let secretBackend: SecretBackend | null = null;
function secrets(): SecretBackend {
  if (!secretBackend) secretBackend = safeStorageSecretBackend();
  return secretBackend;
}

interface SyncDoc {
  enabled: boolean;
  supabaseUrl: string;
  serviceKey: string;
  anonKey: string;
  intervalMinutes: number;
  lastPushAt: string | null;
  /**
   * E-43 : horodatage de la DERNIÈRE TENTATIVE (succès ou échec). Sans lui, la
   * cadence `intervalMinutes` n'était respectée qu'après un succès : un miroir
   * injoignable relançait une poussée complète toutes les 60 s du timer, à
   * vie (quota egress, logs inutiles, file jamais reposée).
   */
  lastAttemptAt: string | null;
  lastError: string | null;
  /** ADR-171 : liasse de supervision propriétaire (clés absentes = défauts). */
  ownerEnabled: boolean;
  ownerIntervalMinutes: number;
  lastOwnerPushAt: string | null;
  /** Tentative la plus récente de publication (succès ou échec) — cadence. */
  lastOwnerAttemptAt: string | null;
  lastOwnerError: string | null;
}

/** Vue `sync.getConfig` enrichie (ADR-171) — jamais de secret vers l'UI. */
type SyncDocMeta = Pick<
  SyncDoc,
  | "lastPushAt"
  | "lastAttemptAt"
  | "lastError"
  | "lastOwnerPushAt"
  | "lastOwnerAttemptAt"
  | "lastOwnerError"
>;

function docMeta(doc: SyncDoc): SyncDocMeta {
  return {
    lastPushAt: doc.lastPushAt,
    lastAttemptAt: doc.lastAttemptAt,
    lastError: doc.lastError,
    lastOwnerPushAt: doc.lastOwnerPushAt,
    lastOwnerAttemptAt: doc.lastOwnerAttemptAt,
    lastOwnerError: doc.lastOwnerError,
  };
}

function docOf(cfg: SyncConfig, meta: SyncDocMeta): SyncDoc {
  return { ...cfg, ...meta };
}

/**
 * E-44 — un échec de LECTURE (DPAPI indisponible, JSON illisible) n'est pas un
 * réglage « désactivé » : l'ancienne chute sur `SYNC_DEFAULTS` faisait dire à
 * l'écran que le miroir n'avait JAMAIS été configuré, alors que la
 * configuration était intacte en base. L'erreur est donc mémorisée et rendue
 * visible par `getSyncView` au lieu d'être silencieusement absorbée.
 */
let docReadError: string | null = null;

function readDoc(): SyncDoc {
  const db = getDb();
  const fallback: SyncDoc = {
    ...SYNC_DEFAULTS,
    lastPushAt: null,
    lastAttemptAt: null,
    lastError: null,
    lastOwnerPushAt: null,
    lastOwnerAttemptAt: null,
    lastOwnerError: null,
  };
  try {
    const row = db
      .prepare(`SELECT value_json FROM app_settings WHERE key = ?`)
      .get(SETTINGS_KEY) as { value_json: string } | undefined;
    if (!row) return fallback;
    const parsed = JSON.parse(row.value_json) as Partial<SyncDoc>;
    // R5 RADICAL : les secrets sont déchiffrés ici (legacy clair accepté en
    // lecture, réchiffré à la prochaine écriture). Le reste du service ne
    // manipule QUE du clair en mémoire, jamais persisté tel quel.
    const backend = secrets();
    docReadError = null;
    return {
      ...fallback,
      ...parsed,
      lastAttemptAt: parsed.lastAttemptAt ?? null,
      serviceKey: decodeSecretWith(backend, parsed.serviceKey),
      anonKey: decodeSecretWith(backend, parsed.anonKey),
    };
  } catch (err) {
    docReadError = "Réglages de synchronisation illisibles sur ce poste : ressaisissez la clé.";
    log("WARN", "sync", "read_failed", { error: String(err) });
    return fallback;
  }
}

function writeDoc(doc: SyncDoc, now: string): void {
  const db = getDb();
  const backend = secrets();
  const stored: SyncDoc = {
    ...doc,
    // R5 RADICAL : persistance TOUJOURS chiffrée (vide → vide).
    serviceKey: doc.serviceKey === "" ? "" : encodeSecret(doc.serviceKey, backend),
    anonKey: doc.anonKey === "" ? "" : encodeSecret(doc.anonKey, backend),
  };
  db.prepare(
    `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
  ).run(SETTINGS_KEY, JSON.stringify(stored), now);
}

function readOwnerAccount(): OwnerAccountDoc | null {
  try {
    const row = getDb()
      .prepare(`SELECT value_json FROM app_settings WHERE key = ?`)
      .get(OWNER_ACCOUNT_KEY) as { value_json: string } | undefined;
    if (!row) return null;
    const parsed = JSON.parse(row.value_json) as Partial<OwnerAccountDoc>;
    if (
      typeof parsed.email !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }
    return { email: parsed.email, userId: parsed.userId, updatedAt: parsed.updatedAt };
  } catch (err) {
    log("WARN", "sync", "owner_account_read_failed", { error: String(err) });
    return null;
  }
}

function writeOwnerAccount(doc: OwnerAccountDoc): void {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    )
    .run(OWNER_ACCOUNT_KEY, JSON.stringify(doc), doc.updatedAt);
}

/**
 * BACK-04 : HYGIÈNE DES SECRETS AU DÉMARRAGE.
 *
 * Une installation antérieure au chiffrement DPAPI peut encore avoir un
 * secret de synchronisation LEGACY en clair dans `app_settings`. Ce secret
 * serait alors recopié tel quel dans CHAQUE sauvegarde (une sauvegarde est une
 * copie complète de la base). Ce passage ré-encode ces secrets sous forme
 * chiffrée, une fois, AVANT toute sauvegarde automatique.
 *
 * best-effort : un échec n'empêche JAMAIS l'application de démarrer (le
 * secret reste lisible en clair, comme avant — c'est le comportement
 * historique, pas une panne).
 */
export function upgradeLegacySecrets(): { upgraded: number; failed: boolean } {
  try {
    const result = reencryptLegacySecrets({
      read: () =>
        getDb().prepare(`SELECT value_json FROM app_settings WHERE key = ?`).get(SETTINGS_KEY) as
          { value_json: string } | undefined,
      write: (valueJson: string, now: string) => {
        getDb()
          .prepare(`UPDATE app_settings SET value_json = ?, updated_at = ? WHERE key = ?`)
          .run(valueJson, now, SETTINGS_KEY);
      },
      backend: secrets(),
      now: () => new Date().toISOString(),
    });
    if (result.upgraded > 0) {
      log("INFO", "sync", "secrets.reencrypted", { upgraded: result.upgraded });
    }
    if (result.failed) {
      log("WARN", "sync", "secrets.reencrypt_unavailable", {});
    }
    if (result.unreadable) {
      log("WARN", "sync", "secrets.doc_unreadable", {});
    }
    return { upgraded: result.upgraded, failed: result.failed };
  } catch (err) {
    log("WARN", "sync", "secrets.reencrypt_failed", { error: String(err) });
    return { upgraded: 0, failed: true };
  }
}

interface AdminResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

async function adminAuthFetch(
  url: string,
  method: "GET" | "POST" | "PUT",
  key: string,
  body?: Record<string, unknown>,
): Promise<AdminResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status, json: () => res.json(), text: () => res.text() };
  } catch {
    throw new Error("Supabase injoignable. Vérifiez la connexion.");
  } finally {
    clearTimeout(timer);
  }
}

async function findOwnerUserIdByEmail(
  base: string,
  key: string,
  email: string,
): Promise<string | null> {
  const res = await adminAuthFetch(`${ownerAdminUsersUrl(base)}?page=1&per_page=200`, "GET", key);
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { users?: unknown } | null;
  const users = Array.isArray(data?.users) ? data.users : [];
  for (const entry of users) {
    const user = entry as { id?: unknown; email?: unknown };
    if (
      typeof user.id === "string" &&
      typeof user.email === "string" &&
      user.email.toLowerCase() === email
    ) {
      return user.id;
    }
  }
  return null;
}

/**
 * Crée ou met à jour le compte Supabase Auth du propriétaire (app mobile).
 * Le mot de passe n'est jamais persisté localement ; seul l'e-mail + l'id
 * Auth sont conservés dans `app_settings.owner_account`.
 */
export async function saveOwnerAccountAtomic(args: {
  operationId: string;
  email: unknown;
  password: unknown;
  now: string;
}): Promise<OwnerAccountResult> {
  const replay = peekIdempotency<OwnerAccountResult>(args.operationId, OWNER_ACCOUNT_CHANNEL);
  if (replay) return replay;
  const { email, password } = validateOwnerAccount(args.email, args.password);
  const doc = readDoc();
  const base = doc.supabaseUrl.trim();
  const key = doc.serviceKey;
  if (base === "" || key === "") {
    throw new Error(
      "Renseignez l'URL et la clé service du miroir avant de créer le compte propriétaire.",
    );
  }
  // S-02 : le claim précède le réseau — une réémission ne peut pas rejouer
  // PUT/POST (Auth) après perte de réponse. En cas de claim préexistant
  // (crash après écriture locale), l'état local tranche sans rappeler.
  const claimedNow = tryClaimBeforeSend(args.operationId, OWNER_ACCOUNT_CHANNEL, args.now);
  if (!claimedNow) {
    const retry = peekIdempotency<OwnerAccountResult>(args.operationId, OWNER_ACCOUNT_CHANNEL);
    if (retry) return retry;
    const local = readOwnerAccount();
    if (local && local.email.toLowerCase() === email.toLowerCase()) {
      return {
        email,
        userId: local.userId,
        created: false,
        updatedAt: local.updatedAt,
      };
    }
    // Pending sans écriture locale = crash avant commit réseau : on converge
    // (le chemin 409/422 + mise à jour rend l'opération idempotente) sans
    // re-clamer.
  }
  const existing = readOwnerAccount();
  let userId = existing?.userId ?? null;
  let created = false;
  const payload = { email, password, email_confirm: true };

  if (userId) {
    const res = await adminAuthFetch(ownerAdminUsersUrl(base, userId), "PUT", key, payload);
    if (res.status === 404) {
      userId = null;
    } else if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error("Clé service refusée par Supabase.");
      }
      const detail = await res.text().catch(() => "");
      log("ERROR", "sync", "owner_account_update_failed", {
        status: res.status,
        detail: detail.slice(0, 300),
      });
      throw new Error(`Mise à jour du compte propriétaire impossible (HTTP ${res.status}).`);
    }
  }

  if (!userId) {
    const res = await adminAuthFetch(ownerAdminUsersUrl(base), "POST", key, payload);
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as { id?: unknown } | null;
      if (typeof data?.id !== "string" || data.id === "") {
        throw new Error("Réponse Supabase inattendue (identifiant du compte manquant).");
      }
      userId = data.id;
      created = true;
    } else if (res.status === 422 || res.status === 409) {
      const found = await findOwnerUserIdByEmail(base, key, email);
      if (!found) throw new Error("Un compte existe déjà avec cet e-mail dans Supabase.");
      const upd = await adminAuthFetch(ownerAdminUsersUrl(base, found), "PUT", key, payload);
      if (!upd.ok) {
        throw new Error(`Mise à jour du compte propriétaire impossible (HTTP ${upd.status}).`);
      }
      userId = found;
    } else if (res.status === 401 || res.status === 403) {
      throw new Error("Clé service refusée par Supabase.");
    } else {
      const detail = await res.text().catch(() => "");
      log("ERROR", "sync", "owner_account_create_failed", {
        status: res.status,
        detail: detail.slice(0, 300),
      });
      throw new Error(`Création du compte propriétaire impossible (HTTP ${res.status}).`);
    }
  }

  const finalUserId = userId;
  const tx = getDb().transaction(() => {
    // Claim déjà réservé avant le réseau (S-02) : la transaction finale ne
    // fait que le solder (écriture locale + résultat).
    writeOwnerAccount({ email, userId: finalUserId, updatedAt: args.now });
    const result: OwnerAccountResult = {
      email,
      userId: finalUserId,
      created,
      updatedAt: args.now,
    };
    storeIdempotencyResult(args.operationId, result);
    return result;
  });
  try {
    return tx();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<OwnerAccountResult>(args.operationId, OWNER_ACCOUNT_CHANNEL);
      if (retry) return retry;
    }
    throw err;
  }
}

function pendingCount(): number {
  const db = getDb();
  try {
    const row = db
      .prepare(`SELECT COUNT(*) AS c FROM sync_outbox WHERE status = 'pending'`)
      .get() as { c: number };
    return row.c;
  } catch (err) {
    log("WARN", "sync", "pending_count_failed", { error: String(err) });
    return 0;
  }
}

export function getSyncView(): SyncConfigView {
  const doc = readDoc();
  const owner = readOwnerAccount();
  return maskConfig(syncConfigOf(doc), {
    lastPushAt: doc.lastPushAt,
    lastError: docReadError ?? doc.lastError,
    pendingCount: pendingCount(),
    ownerEmail: owner?.email ?? null,
    ownerUpdatedAt: owner?.updatedAt ?? null,
    lastOwnerPushAt: doc.lastOwnerPushAt,
    lastOwnerError: doc.lastOwnerError,
  });
}

/**
 * SyncConfig complète lue depuis le doc persisté (une seule fabrique,
 * utilisée par la poussée miroir, la publication propriétaire et le timer).
 */
function syncConfigOf(doc: SyncDoc): SyncConfig {
  return {
    enabled: doc.enabled,
    supabaseUrl: doc.supabaseUrl,
    serviceKey: doc.serviceKey,
    anonKey: doc.anonKey,
    intervalMinutes: doc.intervalMinutes,
    ownerEnabled: doc.ownerEnabled,
    ownerIntervalMinutes: doc.ownerIntervalMinutes,
  };
}

/**
 * E-60 : un refus HORS HTTP (clé de la mauvaise classe, configuration
 * incomplète, synchro coupée) doit être visible à l'écran, pas seulement au
 * clic. Sans cette écriture, la garde de clé faisait RECULER l'observabilité :
 * le timer d'auto-poussée avale l'exception, `lastError` restait figée sur
 * l'ancienne panne réseau — désormais fausse. Renvoie l'erreur à propager.
 */
function noteConfigRejection(
  _doc: SyncDoc,
  now: string,
  err: Error,
  lane: "mirror" | "owner",
): Error {
  const message = toUserMessage(err).message;
  try {
    // S-04 : on relit la doc FRAÎCHE avant d'écrire (jamais la copie
    // d'entrée, potentiellement périmée par une config concurrente).
    writeDoc(
      lane === "owner"
        ? { ...readDoc(), lastOwnerError: message, lastOwnerAttemptAt: now }
        : { ...readDoc(), lastError: message, lastAttemptAt: now },
      now,
    );
  } catch {
    /* meta best-effort */
  }
  log("ERROR", "sync", `push.config_rejected.${lane}`, { error: message });
  return new Error(message);
}

/**
 * S-04 : mise à jour des métadonnées de la doc SANS écraser une config
 * concurrente. Les chemins succès/échec réseau relisent toujours la doc
 * avant d'écrire (le `doc` capturé avant le réseau est périmé par
 * `saveSyncConfigAtomic` qui a pu passer entre-temps) — pas d'attente (une
 * copie périmée n'écrase jamais les secrets/intervalles nouveaux).
 */
function writeDocMeta(patch: Partial<SyncDoc>, now: string): void {
  try {
    writeDoc({ ...readDoc(), ...patch }, now);
  } catch {
    /* meta best-effort */
  }
}

function isIdempotencyUnique(err: unknown): boolean {
  return (
    err instanceof Error &&
    /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
  );
}

/**
 * S-01/S-02 : réserve `operationId` AVANT l'appel réseau (hors transaction
 * métier, sinon le verrou SQLite serait tenu pendant la requête HTTP).
 * Retourne true si le claim est nouveau, false s'il existait déjà (le
 * rejouement doit alors vérifier la parole locale avant de renvoyer).
 */
function tryClaimBeforeSend(operationId: string, channel: string, now: string): boolean {
  const db = getDb();
  try {
    db.transaction(() => claimIdempotency(operationId, channel, now))();
    return true;
  } catch (err) {
    if (isIdempotencyUnique(err)) return false;
    throw err;
  }
}

/**
 * Endpoint public du magasin pour le QR V2 (ADR-068) : URL + clé `anon`
 * (jamais la `service_role`). Lu depuis `app_settings` côté main uniquement.
 */
export function getShopEndpoint(): { supabaseUrl: string; anonKey: string } | null {
  const doc = readDoc();
  const url = doc.supabaseUrl.trim();
  const anon = doc.anonKey.trim();
  if (url === "" || anon === "") return null;
  return { supabaseUrl: url, anonKey: anon };
}

export function saveSyncConfigAtomic(args: { config: unknown; operationId: string; now: string }): {
  saved: boolean;
} {
  const db = getDb();
  const replay = peekIdempotency<{ saved: boolean }>(args.operationId, "sync.saveConfig");
  if (replay) return replay;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "sync.saveConfig", args.now);
    const prev = readDoc();
    const incoming = args.config as {
      enabled?: unknown;
      supabaseUrl?: unknown;
      serviceKey?: unknown;
      anonKey?: unknown;
      intervalMinutes?: unknown;
      ownerEnabled?: unknown;
      ownerIntervalMinutes?: unknown;
    };
    // Clé vide + clé existante = conservation (le renderer ne relit jamais
    // le secret — voir maskConfig) ; sinon la nouvelle valeur s'applique.
    const incomingKey = typeof incoming.serviceKey === "string" ? incoming.serviceKey.trim() : "";
    const incomingAnon = typeof incoming.anonKey === "string" ? incoming.anonKey.trim() : "";
    // E-60 : contrôle de la VALEUR SAISIE uniquement. Une clé déjà en base ne
    // doit jamais faire échouer une poussée en cours ; en revanche coller la
    // clé secrète dans le champ public l'enverrait dans le QR V2.
    if (incomingAnon !== "") assertAnonKeyPublic(incomingAnon);
    const cfg = validateSyncConfig({
      enabled: incoming.enabled,
      supabaseUrl: incoming.supabaseUrl,
      serviceKey:
        incomingKey === "" && prev.serviceKey !== "" ? prev.serviceKey : incoming.serviceKey,
      anonKey: incomingAnon === "" && prev.anonKey !== "" ? prev.anonKey : incoming.anonKey,
      intervalMinutes: incoming.intervalMinutes,
      ownerEnabled: incoming.ownerEnabled,
      ownerIntervalMinutes: incoming.ownerIntervalMinutes,
    });
    if (
      requiresServiceKeyReentry({
        prevUrl: prev.supabaseUrl,
        prevHasKey: prev.serviceKey.length > 0,
        nextUrl: cfg.supabaseUrl,
        incomingKey,
      })
    ) {
      throw new Error(
        "Changement d'adresse du miroir : ressaisissez la clé service pour confirmer la nouvelle destination.",
      );
    }
    writeDoc(docOf(cfg, docMeta(prev)), args.now);
    const result = { saved: true };
    storeIdempotencyResult(args.operationId, result);
    return result;
  });
  try {
    return tx();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ saved: boolean }>(args.operationId, "sync.saveConfig");
      if (retry) return retry;
    }
    throw err;
  }
}

type Transport = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

/**
 * E-45 — la poussée miroir n'avait NI délai d'échéance NI verrou d'exclusion :
 * le `fetch` nu pouvait rester pendu (peer TCP qui ne répond pas), et le timer
 * de 60 s relançait une poussée COMPLÈTE par tick au-dessus de la précédente.
 * Résultat : POST concurrents des mêmes lignes et écritures concurrentes de
 * `app_settings.client_sync` (perte d'updates sur `lastPushAt`/`lastError`).
 * `adminAuthFetch` avait déjà ces deux gardes — le miroir, non.
 */
const MIRROR_TIMEOUT_MS = 20_000;

let mirrorInFlight = false;

/** Transport par défaut : HTTP avec échéance (jamais de requête suspendue). */
const mirrorTransport: Transport = async (url, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MIRROR_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status, text: () => res.text() };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Point d'entrée public (timer + clic « Pousser maintenant ») : verrou
 * d'exclusion strict, une seule tentative réseau à la fois.
 */
export async function pushNowAtomic(
  args: { operationId: string; now: string },
  transport?: Transport,
): Promise<{ pushed: number; access: number; accessRejected: number; failed: number }> {
  if (mirrorInFlight) throw new Error("Poussée déjà en cours : réessayez dans un instant.");
  mirrorInFlight = true;
  try {
    return await pushNowOnce(args, transport);
  } finally {
    mirrorInFlight = false;
  }
}

/** Poussée complète : accès (tous, auto-réparant) + file en attente. */
async function pushNowOnce(
  args: { operationId: string; now: string },
  transport?: Transport,
): Promise<{ pushed: number; access: number; accessRejected: number; failed: number }> {
  const db = getDb();
  const replay = peekIdempotency<{
    pushed: number;
    access: number;
    accessRejected?: number;
    failed: number;
  }>(args.operationId, "sync.pushNow");
  if (replay) return { ...replay, accessRejected: replay.accessRejected ?? 0 };
  const doc = readDoc();
  let cfg: SyncConfig;
  try {
    cfg = validateSyncConfig(syncConfigOf(doc));
  } catch (err) {
    throw noteConfigRejection(
      doc,
      args.now,
      err instanceof Error ? err : new Error(String(err)),
      "mirror",
    );
  }
  if (!cfg.enabled)
    throw noteConfigRejection(doc, args.now, new Error(SYNC_DISABLED_MESSAGE), "mirror");
  // Claim avant tout GET/POST réseau (une réémission avec le même UUID ne
  // peut pas doubler les POST : le miroir fait `merge-duplicates`, donc la
  // duplication serait bénigne, mais la réparation pousse unique l'est moins).
  const claimedNowPush = tryClaimBeforeSend(args.operationId, "sync.pushNow", args.now);
  if (!claimedNowPush) {
    const retry = peekIdempotency<{
      pushed: number;
      access: number;
      accessRejected?: number;
      failed: number;
    }>(args.operationId, "sync.pushNow");
    if (retry) return { ...retry, accessRejected: retry.accessRejected ?? 0 };
    // Pending sans résultat = une première tentative est en cours (ou a
    // échoué avant le résultat) : le verrou `mirrorInFlight` en sérialise
    // déjà les appels dans ce processus ; on converge normalement.
  }
  const queuedRows = db
    .prepare(
      // SYNC-02 : une ligne en attente de BACKOFF n'est pas sélectionnée
      // (elle repart au plus tôt à son `next_attempt_at`). Sans cette porte,
      // une panne réseau rejouait la file entière toutes les 60 s.
      `SELECT operation_id, customer_id, kind, payload_json, created_at, attempts FROM sync_outbox
       WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
       ORDER BY id ASC LIMIT 200`,
    )
    .all(args.now) as OutboxMirrorRow[];
  // E-41 : une ligne localement corrompue est écartée, elle ne gèle plus la
  // file (avant : `buildMirrorRequests` levait, la poussée entière mourait, la
  // même ligne était re-sélectionnée au tick suivant — pour toujours).
  const { valid: outboxRows, corruptedOperationIds } = partitionOutboxRows(queuedRows);
  // E-41 : une ligne localement illisible ne sera JAMAIS poussable — condamnée
  // tout de suite (et pas à la prochaine poussée chanceuse), avec traçabilité.
  if (corruptedOperationIds.length > 0) {
    const condemn = db.transaction(() => {
      for (const operationId of corruptedOperationIds) {
        db.prepare(`UPDATE sync_outbox SET status = 'failed' WHERE operation_id = ?`).run(
          operationId,
        );
      }
    });
    try {
      condemn();
    } catch (err) {
      log("ERROR", "sync", "push.condemn_failed", { error: String(err) });
    }
    for (const operationId of corruptedOperationIds) {
      log("ERROR", "sync", "push.payload_corrupted", { operation_id: operationId });
    }
  }
  const send: Transport = transport ?? mirrorTransport;
  const headers = {
    apikey: cfg.serviceKey,
    Authorization: `Bearer ${cfg.serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates",
  };
  const base = cfg.supabaseUrl.replace(/\/+$/, "");
  const post = async (req: MirrorRequest): Promise<void> => {
    const res = await send(`${base}/rest/v1/${req.table}?on_conflict=${req.onConflict}`, {
      method: "POST",
      headers,
      body: JSON.stringify(req.rows),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // FIX-P1-03 : le détail serveur brut (anglais/JSON) reste au log
      // technique ; seul un message FR est persisté dans lastError (lu par
      // l'UI) — règle 6 (jamais d'exception brute à l'utilisateur).
      log("ERROR", "sync", "push.http", { status: res.status, detail: detail.slice(0, 500) });
      // E-60 : un refus d'IDENTITÉ n'est pas une panne réseau. Sans ce cas, le
      // gérant voyait « miroir injoignable » pour une clé mal collée et
      // cherchait la faute du côté de sa connexion.
      if (isMirrorAuthRejection(res.status, detail)) {
        throw new Error(SERVICE_KEY_REFUSED);
      }
      // ADR-173 : le service doit distinguer ce qui est REJOUABLE de ce qui est
      // CONDAMNÉ, sinon une seule ligne incohérente gèle toute la file.
      if (isPermanentMirrorRejection(res.status)) {
        throw new MirrorRejectionError(res.status, detail);
      }
      throw new Error(`Miroir injoignable (HTTP ${res.status}).`);
    }
  };
  // ADR-173 : les clichés écartés (rejet définitif sur LA ligne) ne bloquent
  // plus les autres. Un lot refusé est divisé jusqu'à isoler la coupable.
  const rejected: string[] = [];
  const postPayloads = async (req: MirrorRequest): Promise<void> => {
    try {
      await post(req);
    } catch (err) {
      if (!(err instanceof MirrorRejectionError)) throw err;
      // E-42 : rejet de TABLE = configuration, pas une ligne coupable. On
      // stoppe net (file inchangée, donc rejouable) au lieu de condamneer les
      // 200 clichés un par un — perte silencieuse et définitive sinon.
      if (classifyMirrorRejection(err.status, err.detail) === "table") {
        throw new Error(
          `Miroir incomplet : la table « ${req.table} » est absente ou illisible du projet configuré.`,
          { cause: err },
        );
      }
      const parts = splitMirrorRequest(req);
      if (parts.length === 2) {
        for (const part of parts) await postPayloads(part);
        return;
      }
      const opId = req.rows[0]?.["operation_id"];
      if (typeof opId !== "string" || opId === "") throw err;
      rejected.push(opId);
      log("WARN", "sync", "push.row_rejected", {
        status: err.status,
        operation_id: opId,
        detail: err.detail.slice(0, 300),
      });
    }
  };
  let accessCount = 0;
  // E-58 — une ligne d'ACCÈS refusée condamnait toute la poussée AVANT que la
  // file des clichés ne parte : l'ordre est une dépendance réelle (la FK
  // `client_payloads.customer_id` exige la ligne d'accès côté miroir), donc les
  // accès passent TOUJOURS en premier — mais un refus sur UNE ligne d'accès ne
  // doit plus affamer les 200 clichés. La ligne d'accès est rejouable (elle est
  // relue dans `customer_access` au tick suivant), elle est donc écartée sans
  // état `failed` à tracer.
  const rejectedAccess: string[] = [];
  const postAccess = async (req: MirrorRequest): Promise<void> => {
    try {
      await post(req);
    } catch (err) {
      if (!(err instanceof MirrorRejectionError)) throw err;
      // E-61 : conflit d'accès = état du MIROIR, pas ligne coupable. La
      // bissection n'aboutirait qu'à condamneer un accès après l'autre, et la
      // poussée repartirait chaque tick sur le même 409 sans rien dire.
      if (isMirrorPhoneConflict(err.status, err.detail)) {
        throw new Error(MIRROR_PHONE_CONFLICT_MESSAGE, { cause: err });
      }
      if (classifyMirrorRejection(err.status, err.detail) === "table") {
        throw new Error(
          `Miroir incomplet : la table « ${req.table} » est absente ou illisible du projet configuré.`,
          { cause: err },
        );
      }
      const parts = splitMirrorRequest(req);
      if (parts.length === 2) {
        for (const part of parts) await postAccess(part);
        return;
      }
      const customerId = req.rows[0]?.["customer_id"];
      if (typeof customerId !== "number") throw err;
      rejectedAccess.push(String(customerId));
      log("WARN", "sync", "push.access_rejected", {
        status: err.status,
        customer_id: customerId,
        detail: err.detail.slice(0, 300),
      });
    }
  };
  try {
    // Pagination par customer_id : les comptes au-delà du 500e ne sont plus
    // affamés. Chaque lot est borné ; un échec laisse la file rejouable.
    let cursor = 0;
    for (;;) {
      const batch = db
        .prepare(
          `SELECT customer_id, phone_hash, pin_hash, pin_salt, pin_algo, qr_secret_hash, revoked_at, failed_attempts, locked_until, updated_at
           FROM customer_access
           WHERE customer_id > ? AND NOT EXISTS (
             SELECT 1 FROM customer_access AS newer
             WHERE newer.customer_id = customer_access.customer_id AND newer.id > customer_access.id
           )
           ORDER BY customer_id ASC LIMIT 500`,
        )
        .all(cursor) as AccessMirrorRow[];
      if (batch.length === 0) break;
      accessCount += batch.length;
      for (const req of buildMirrorRequests(batch, [])) await postAccess(req);
      cursor = Number(batch[batch.length - 1]?.customer_id ?? 0);
      if (batch.length < 500) break;
    }
    // ADR-173 : les lignes condamnées sont écartées de la file, jamais la file
    // arrêtée (les accès restent en behavior inchangé : un refus d'accès est
    // structurel, il doit interrompre la poussée).
    for (const req of buildMirrorRequests([], outboxRows)) await postPayloads(req);
  } catch (err) {
    // FIX-P1-03 : lastError affiché par l'UI → message FR garanti via la
    // source unique main (toUserMessage : technique → repli FR générique).
    const msg = toUserMessage(err).message;
    // SYNC-02 : le rejeu est DÉCIDÉ PAR LIGNE (taxonomie + backoff +
    // quarantaine), jamais « tout ou rien ». Une panne réseau transitoire
    // reprogramme les lignes au lieu de les rejouer à chaque tick ; un refus
    // définitif les isole immédiatement ; une ligne qui épuise son budget passe
    // en quarantaine (état d'audit) au lieu de bloquer la file.
    const kind = classifyPushFailure(err);
    const rejectedNow = new Set(rejected);
    try {
      const bookkeep = db.transaction(() => {
        for (const row of outboxRows) {
          const permanent = rejectedNow.has(row.operation_id);
          // Les erreurs de CONFIGURATION/MIROIR (auth, schema, conflit
          // telephone) n'atteignent pas la ligne : aucune ligne n'est
          // condamnee, et on ne touche ni au compteur ni au statut (les
          // lignes restent `pending`, rejouables des que la cause est
          // leve). Seules les erreurs TRANSIENTES reprogramment la ligne
          // (backoff), et seules les lignes INDIVIDUELLEMENT rejetes sont
          // mises en quarantaine (`failed`).
          if (!permanent && kind !== "transient") {
            continue;
          }
          const decision = permanent
            ? {
                attempts: row.attempts + 1,
                quarantined: true,
                nextAttemptAt: null,
                kind: "validation" as const,
              }
            : decideRetry({
                attempts: row.attempts,
                kind,
                nowIso: args.now,
                jitter: jitterFactor(row.operation_id),
              });
          db.prepare(
            `UPDATE sync_outbox
             SET attempts = ?,
                 last_error = ?,
                 next_attempt_at = ?,
                 status = CASE WHEN ? = 1 THEN 'failed' ELSE status END,
                 quarantined_at = CASE WHEN ? = 1 THEN COALESCE(quarantined_at, ?) ELSE quarantined_at END
             WHERE operation_id = ?`,
          ).run(
            decision.attempts,
            msg,
            decision.nextAttemptAt,
            decision.quarantined ? 1 : 0,
            decision.quarantined ? 1 : 0,
            args.now,
            row.operation_id,
          );
        }
      });
      bookkeep();
      log("WARN", "sync", "push.retry_scheduled", {
        kind,
        rows: outboxRows.length,
        quarantined: outboxRows.filter((r) => rejectedNow.has(r.operation_id)).length,
      });
    } catch (bookErr) {
      log("ERROR", "sync", "push.retry_bookkeeping_failed", { error: String(bookErr) });
    }
    // E-43 : l'échec horodate aussi la TENTATIVE, sinon la cadence
    // `intervalMinutes` est ignorée et le timer repart toutes les 60 s.
    // S-04 : doc fraîche (pas la copie d'entrée).
    writeDocMeta({ lastError: msg, lastAttemptAt: args.now }, args.now);
    log("ERROR", "sync", "push.failed", { error: msg });
    throw err instanceof Error ? err : new Error(msg);
  }
  const rejectedIds = new Set(rejected);
  const condemned = new Set([...rejectedIds, ...corruptedOperationIds]);
  const delivered = outboxRows.filter((r) => !condemned.has(r.operation_id));
  const tx = db.transaction(() => {
    // Claim déjà réservé avant le réseau (S-01) : solder, pas re-clamer.
    for (const r of delivered) {
      db.prepare(
        `UPDATE sync_outbox SET status = 'sent', sent_at = ?, next_attempt_at = NULL, last_error = NULL WHERE operation_id = ?`,
      ).run(args.now, r.operation_id);
    }
    // ADR-173 : une ligne écartée ne reste pas `pending` (elle repartirait
    // éternellement au prochain tick) — `failed` est un état d'audit.
    // SYNC-02 : elle est en outre QUARANTAINE (rejet définitif : la rejouer
    // ne changera rien), avec sa raison en français.
    for (const operationId of condemned) {
      db.prepare(
        `UPDATE sync_outbox
         SET status = 'failed',
             attempts = attempts + 1,
             quarantined_at = COALESCE(quarantined_at, ?),
             next_attempt_at = NULL,
             last_error = COALESCE(last_error, ?)
         WHERE operation_id = ?`,
      ).run(args.now, QUARANTINE_REASON_FR, operationId);
    }
    try {
      const condemnedCount = condemned.size;
      const accessRejectedCount = rejectedAccess.length;
      writeDoc(
        {
          ...readDoc(),
          lastPushAt: args.now,
          lastAttemptAt: args.now,
          lastError:
            condemnedCount === 0 && accessRejectedCount === 0
              ? null
              : [
                  condemnedCount > 0
                    ? `${condemnedCount} cliché(s) écarté(s) définitivement de la file : ${
                        corruptedOperationIds.length > 0
                          ? `${corruptedOperationIds.length} illisible(s) en local`
                          : ""
                      }${corruptedOperationIds.length > 0 && rejectedIds.size > 0 ? " · " : ""}${
                        rejectedIds.size > 0
                          ? `${rejectedIds.size} refusé(s) par le miroir (données client incohérentes : accès correspondant absent)`
                          : ""
                      }.`
                    : "",
                  accessRejectedCount > 0
                    ? `${accessRejectedCount} accès écarté(s) par le miroir (rejouable au prochain tick).`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" "),
        },
        args.now,
      );
    } catch {
      /* meta best-effort */
    }
    const result = {
      pushed: delivered.length,
      access: accessCount,
      accessRejected: rejectedAccess.length,
      failed: condemned.size,
    };
    storeIdempotencyResult(args.operationId, result);
    return result;
  });
  try {
    return tx();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{
        pushed: number;
        access: number;
        accessRejected?: number;
        failed: number;
      }>(args.operationId, "sync.pushNow");
      if (retry) return { ...retry, accessRejected: retry.accessRejected ?? 0 };
    }
    throw err;
  }
}

/**
 * ADR-171 : publication de la liasse de supervision propriétaire.
 * POST append-only vers `public.owner_snapshots` (aucun upsert : la table
 * n'a aucune contrainte d'unicité, « la plus récente gagne » est un tri de
 * l'app). Idempotent au `operationId` : un rejouement rend le PREMIER résultat
 * sans insérer une seconde ligne.
 */
export interface OwnerPublishResult {
  published: boolean;
  /** Taille réellement envoyée du corps JSON (garde `MAX_LIASSE_CHARS`). */
  chars: number;
  generatedAt: string;
  /** Instant enregistré dans `lastOwnerPushAt` (le renderer ne relit pas le doc). */
  lastOwnerPushAt: string;
}

const OWNER_PUSH_CHANNEL = "sync.pushOwnerSnapshot";
/** `shop_key` unique de la liasse (miroir de `cloud/supabase/owner.sql`). */
const OWNER_SHOP_KEY = "veloria";

/** S-03 : même verrou d'exclusion que le miroir — un clic manuel et le timer
 * ne peuvent pas publier deux liasse en parallèle (append-only). */
let ownerInFlight = false;

export async function publishOwnerSnapshotAtomic(
  args: { operationId: string; now: string },
  transport?: Transport,
): Promise<OwnerPublishResult> {
  if (ownerInFlight) throw new Error("Publication déjà en cours : réessayez dans un instant.");
  ownerInFlight = true;
  try {
    return await publishOwnerSnapshotOnce(args, transport);
  } finally {
    ownerInFlight = false;
  }
}

async function publishOwnerSnapshotOnce(
  args: { operationId: string; now: string },
  transport?: Transport,
): Promise<OwnerPublishResult> {
  const replay = peekIdempotency<OwnerPublishResult>(args.operationId, OWNER_PUSH_CHANNEL);
  if (replay) return replay;
  const doc = readDoc();
  // Portes lues sur le doc PERSISTÉ, avant toute validation : `validateSyncConfig`
  // refuse déjà « liasse activée sans miroir » à l'ENREGISTREMENT, mais un doc
  // hérité/altéré (miroir coupé après coup) doit rester refusé ICI, avec un
  // message qui dit au gérant quoi réactiver (défense en profondeur, règle 6).
  if (!doc.enabled || doc.supabaseUrl === "" || doc.serviceKey === "") {
    throw noteConfigRejection(
      doc,
      args.now,
      new Error(
        "Miroir non configuré : activez la synchronisation (Réglages → Miroir Android) avant de publier la liasse.",
      ),
      "owner",
    );
  }
  if (!doc.ownerEnabled) {
    throw noteConfigRejection(
      doc,
      args.now,
      new Error(
        "Liasse de supervision désactivée : activez-la (Réglages → Miroir Android) pour publier.",
      ),
      "owner",
    );
  }
  let cfg: SyncConfig;
  try {
    cfg = validateSyncConfig(syncConfigOf(doc));
  } catch (err) {
    throw noteConfigRejection(
      doc,
      args.now,
      err instanceof Error ? err : new Error(String(err)),
      "owner",
    );
  }
  // S-01 : claim AVANT l'appel réseau. Le POST est append-only (aucun upsert
  // côté table) : sans claim préalable, un crash après le POST envoyait une
  // seconde ligne au rejouement avec le même `operationId`.
  const claimedNow = tryClaimBeforeSend(args.operationId, OWNER_PUSH_CHANNEL, args.now);
  if (!claimedNow) {
    const retry = peekIdempotency<OwnerPublishResult>(args.operationId, OWNER_PUSH_CHANNEL);
    if (retry) return retry;
    // Crash après le POST mais avant le résultat : la doc porte la preuve
    // (`lastOwnerPushAt == now`). On rend le même résultat SANS réenvoyer.
    if (readDoc().lastOwnerPushAt === args.now) {
      // Corps reconstruit uniquement pour la taille (aucun envoi).
      let chars = 0;
      try {
        const snapshot = buildOwnerSnapshot(args.now);
        chars = JSON.stringify([
          { shop_key: OWNER_SHOP_KEY, payload: snapshot, generated_at: args.now },
        ]).length;
      } catch {
        chars = 0;
      }
      const result: OwnerPublishResult = {
        published: true,
        chars,
        generatedAt: args.now,
        lastOwnerPushAt: args.now,
      };
      storeIdempotencyResult(args.operationId, result);
      return result;
    }
    // Pending sans preuve locale = tentative précédente échouée AVANT le
    // succès réseau (sinon la doc ci-dessus le prouverait). On converge en
    // poursuivant vers le POST sans re-clamer : la duplication exigerait
    // que le POST précédent ait réussi ET que l'écriture de la doc ait été
    // perdue — fenêtre étroite acceptée au bénéfice du retry légitime.
    // (Le verrou `ownerInFlight` interdit déjà deux POST simultanés ici.)
  }
  // E-45 : même transport gardé que la file client (échéance + pas de requête
  // suspendue) — la duplication d'un `fetch` nu était le même défaut.
  const send: Transport = transport ?? mirrorTransport;
  const headers = {
    apikey: cfg.serviceKey,
    Authorization: `Bearer ${cfg.serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  let body = "";
  try {
    // S-05 : la construction de la liasse vit DANS le try — un échec ici
    // horodate aussi la tentative (`lastOwnerError`/`lastOwnerAttemptAt`) au
    // lieu de repartir toutes les 60 s en silence.
    const snapshot = buildOwnerSnapshot(args.now);
    body = JSON.stringify([
      { shop_key: OWNER_SHOP_KEY, payload: snapshot, generated_at: args.now },
    ]);
    const res = await send(ownerSnapshotsUrl(cfg.supabaseUrl), { method: "POST", headers, body });
    if (!res.ok) {
      // Règle 6 : le détail serveur brut reste au log, seul un message FR est
      // persisté (`lastOwnerError`, lu par l'UI).
      const detail = await res.text().catch(() => "");
      log("ERROR", "sync", "owner_push.http", { status: res.status, detail: detail.slice(0, 500) });
      if (isMirrorAuthRejection(res.status, detail)) {
        throw new Error(SERVICE_KEY_REFUSED);
      }
      throw new Error(`Publication de la liasse impossible (HTTP ${res.status}).`);
    }
  } catch (err) {
    const msg = toUserMessage(err).message;
    // E-43 : cadence respectée aussi en échec (sinon 60 s de re-tentatives).
    writeDocMeta({ lastOwnerError: msg, lastOwnerAttemptAt: args.now }, args.now);
    log("ERROR", "sync", "owner_push.failed", { error: msg });
    throw err instanceof Error ? err : new Error(msg);
  }
  // Soudure : doc d'abord (la preuve locale précède le résultat), puis
  // résultat. Une interruption entre les deux est couverte par le chemin
  // `lastOwnerPushAt === now` ci-dessus au rejouement.
  writeDocMeta(
    { lastOwnerPushAt: args.now, lastOwnerAttemptAt: args.now, lastOwnerError: null },
    args.now,
  );
  const result: OwnerPublishResult = {
    published: true,
    chars: body.length,
    generatedAt: args.now,
    lastOwnerPushAt: args.now,
  };
  storeIdempotencyResult(args.operationId, result);
  return result;
}

/**
 * ADR-182 : publication du catalogue client vers la table `store_catalog`.
 *
 * Le catalogue est une PROJECTION de SQLite (les prix restent dans
 * `products`) : une seule COPIE par magasin, quel que soit le nombre de
 * clients (contrairement à un cliché par client). Le retrait d'un produit
 * se fait par FLAGUE (`is_published = 0`), jamais par `DELETE` : la
 * réactivation est un simple upsert et l'historique reste lisible.
 *
 * Idempotence : l'upsert miroir porte `on_conflict=product_id` — un rejeu
 * réécrit les mêmes lignes, il ne les duplique pas.
 */
export interface CatalogPublishResult {
  published: boolean;
  /** Nombre de produits publiés (hors retirés). */
  productCount: number;
  /** Nombre de produits retirés du catalogue (flagués). */
  retiredCount: number;
  /** Empreinte de version (SHA-256) du catalogue publié. */
  version: string;
  publishedAt: string;
}

const CATALOG_PUSH_CHANNEL = "sync.publishCatalog";

/** Verrou d'exclusion : un clic manuel et le timer ne publient jamais deux
 * catalogues en parallèle (le second verrait un miroir à moitié à jour). */
let catalogInFlight = false;

export async function publishCatalogAtomic(
  args: { operationId: string; now: string },
  transport?: Transport,
): Promise<CatalogPublishResult> {
  if (catalogInFlight) throw new Error("Publication déjà en cours : réessayez dans un instant.");
  catalogInFlight = true;
  try {
    return await publishCatalogOnce(args, transport);
  } finally {
    catalogInFlight = false;
  }
}

/** Ligne du miroir lue pour le calcul du retrait (colonnes de `store_catalog`).
 * Les colonnes NOT NULL sont typées « nullable » : la lecture vient du réseau,
 * une valeur illisible doit être neutralisée, pas propagée telle quelle. */
interface MirrorCatalogRow {
  product_id: number;
  name: string | null;
  category_id: number | null;
  category_name: string | null;
  price_minor: number | null;
  unit_code: string | null;
  available: number | null;
  image_url: string | null;
}

async function publishCatalogOnce(
  args: { operationId: string; now: string },
  transport?: Transport,
): Promise<CatalogPublishResult> {
  const replay = peekIdempotency<CatalogPublishResult>(args.operationId, CATALOG_PUSH_CHANNEL);
  if (replay) return replay;
  const doc = readDoc();
  if (!doc.enabled || doc.supabaseUrl === "" || doc.serviceKey === "") {
    throw noteConfigRejection(
      doc,
      args.now,
      new Error(
        "Miroir non configuré : activez la synchronisation (Réglages → Miroir Android) avant de publier le catalogue.",
      ),
      "mirror",
    );
  }
  if (!getCatalogSettings().enabled) {
    throw noteConfigRejection(
      doc,
      args.now,
      new Error(
        "Catalogue client désactivé : activez-le (Réglages → Produits publiés dans l'application).",
      ),
      "mirror",
    );
  }
  let cfg: SyncConfig;
  try {
    cfg = validateSyncConfig(syncConfigOf(doc));
  } catch (err) {
    throw noteConfigRejection(
      doc,
      args.now,
      err instanceof Error ? err : new Error(String(err)),
      "mirror",
    );
  }
  // Claim AVANT tout appel réseau : une opération réseau n'est pas « à moitié
  // faite » (ADR-177). Un rejeu rend le résultat stocké.
  const claimed = tryClaimBeforeSend(args.operationId, CATALOG_PUSH_CHANNEL, args.now);
  if (!claimed) {
    const retry = peekIdempotency<CatalogPublishResult>(args.operationId, CATALOG_PUSH_CHANNEL);
    if (retry) return retry;
  }
  const send: Transport = transport ?? mirrorTransport;
  const authHeaders = {
    apikey: cfg.serviceKey,
    Authorization: `Bearer ${cfg.serviceKey}`,
  };
  const headers = {
    ...authHeaders,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates",
  };
  const base = cfg.supabaseUrl.replace(/\/+$/, "");
  const build = buildCatalog(args.operationId, args.now);
  let retiredCount = 0;
  try {
    // 1) État courant du miroir : ids publiés (source du calcul du retrait).
    // Filtre `eq.1` : la colonne est un ENTIER (0/1), pas un booléen —
    // `eq.true` serait rejeté par PostgREST (400) sur une colonne integer.
    const currentRes = await send(
      `${base}/rest/v1/store_catalog?select=product_id,name,category_id,category_name,price_minor,unit_code,available,image_url&is_published=eq.1`,
      { method: "GET", headers: authHeaders, body: "" },
    );
    if (!currentRes.ok) {
      const detail = await currentRes.text().catch(() => "");
      log("ERROR", "sync", "catalog_push.read_http", {
        status: currentRes.status,
        detail: detail.slice(0, 500),
      });
      if (isMirrorAuthRejection(currentRes.status, detail)) {
        throw new Error(SERVICE_KEY_REFUSED);
      }
      if (currentRes.status === 404) {
        throw new Error(
          "Miroir incomplet : la table « store_catalog » est absente du projet configuré.",
        );
      }
      throw new Error(`Publication du catalogue impossible (HTTP ${currentRes.status}).`);
    }
    const rawCurrent = await currentRes.text().catch(() => "");
    let current: MirrorCatalogRow[] = [];
    try {
      const parsed = JSON.parse(rawCurrent) as unknown;
      if (!Array.isArray(parsed)) throw new Error("not-an-array");
      current = parsed as MirrorCatalogRow[];
    } catch {
      // Fail-closed : sans l'état du miroir on ne sait pas QUOI retirer ;
      // publier à l'aveugle laisserait des produits retirés en ligne.
      log("ERROR", "sync", "catalog_payload.unreadable");
      throw new Error("Catalogue illisible sur le miroir : publication interrompue.");
    }
    const newIds = new Set(build.rows.map((r) => r.product_id));
    const retired = current.filter((r) => !newIds.has(Number(r.product_id)));
    retiredCount = retired.length;
    const payload = [
      ...build.rows,
      ...retired.map((r) => ({
        product_id: Number(r.product_id),
        name: String(r.name ?? "").slice(0, 120),
        category_id: r.category_id == null ? null : Number(r.category_id),
        category_name: r.category_name == null ? null : String(r.category_name),
        price_minor: Number(r.price_minor ?? 0),
        unit_code: String(r.unit_code ?? "PIECE").slice(0, 24),
        available: Number(r.available ?? 0) === 1 ? 1 : 0,
        image_url: r.image_url == null ? null : String(r.image_url).slice(0, 500),
        is_published: 0,
        batch_id: args.operationId,
        published_at: args.now,
      })),
    ];
    // 2) Upsert du catalogue (publiés + retirés).
    if (payload.length > 0) {
      const res = await send(`${base}/rest/v1/store_catalog?on_conflict=product_id`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        log("ERROR", "sync", "catalog_push.http", {
          status: res.status,
          detail: detail.slice(0, 500),
        });
        if (isMirrorAuthRejection(res.status, detail)) {
          throw new Error(SERVICE_KEY_REFUSED);
        }
        if (res.status === 404) {
          throw new Error(
            "Miroir incomplet : la table « store_catalog » est absente du projet configuré.",
          );
        }
        throw new Error(`Publication du catalogue impossible (HTTP ${res.status}).`);
      }
    }
    // 3) Version du catalogue (l'APK ne re-télécharge que si elle change).
    const metaRes = await send(`${base}/rest/v1/store_catalog_meta?on_conflict=id`, {
      method: "POST",
      headers,
      body: JSON.stringify([
        {
          id: 1,
          version: build.version,
          product_count: build.productCount,
          published_at: args.now,
        },
      ]),
    });
    if (!metaRes.ok) {
      const detail = await metaRes.text().catch(() => "");
      log("ERROR", "sync", "catalog_push.meta_http", {
        status: metaRes.status,
        detail: detail.slice(0, 500),
      });
      throw new Error(`Publication du catalogue impossible (HTTP ${metaRes.status}).`);
    }
  } catch (err) {
    const msg = toUserMessage(err).message;
    log("ERROR", "sync", "catalog_push.failed", { error: msg });
    throw err instanceof Error ? err : new Error(msg);
  }
  // Soudure : la version publiée est mémorisée APRÈS l'acquittement du
  // miroir — sinon l'APK comparerait sa version à une version jamais posée.
  recordCatalogPublished({
    version: build.version,
    productCount: build.productCount,
    now: args.now,
  });
  const result: CatalogPublishResult = {
    published: true,
    productCount: build.productCount,
    retiredCount,
    version: build.version,
    publishedAt: args.now,
  };
  storeIdempotencyResult(args.operationId, result);
  return result;
}

/**
 * ADR-182 tranche F : tire les INTENTIONS de commande en attente et les
 * transforme en commandes (`client_orders`, SQLite = master).
 *
 * L'intention est un transport : la commande créée est la seule vérité. Le
 * `operationId` de l'intention sert d'`operationId` de création ⇒ un rejeur
 * (tick suivant, redémarrage) ne crée jamais une seconde commande.
 *
 * Une intention refusée DÉFINITIVEMENT (produit archivé, client archivé,
 * prix nul) est marquée `rejected` : sinon elle reviendrait à chaque tick,
 * pour toujours. Une erreur transitoire la laisse `pending`.
 */
const ORDER_INTENT_REJECTED = [
  "Client introuvable",
  "Client archivé",
  "Produit introuvable",
  "n'est plus proposé à la vente",
  "n'a pas de prix de vente valide",
  "Quantité invalide",
  "Trop de lignes pour une commande",
  "Commande vide",
];

interface OrderIntentRow {
  operation_id: string;
  customer_id: number;
  lines: { productId: number; quantity: number; unitCode: string }[];
  total_minor: number;
  note: string | null;
}

let orderPullInFlight = false;

export async function pullOrderIntentsAtomic(
  transport?: Transport,
): Promise<{ taken: number; rejected: number }> {
  if (orderPullInFlight) return { taken: 0, rejected: 0 };
  orderPullInFlight = true;
  try {
    return await pullOrderIntentsOnce(transport);
  } finally {
    orderPullInFlight = false;
  }
}

async function pullOrderIntentsOnce(
  transport?: Transport,
): Promise<{ taken: number; rejected: number }> {
  const doc = readDoc();
  if (!doc.enabled || doc.supabaseUrl === "" || doc.serviceKey === "") {
    return { taken: 0, rejected: 0 };
  }
  const send: Transport = transport ?? mirrorTransport;
  const base = doc.supabaseUrl.replace(/\/+$/, "");
  const headers = {
    apikey: doc.serviceKey,
    Authorization: `Bearer ${doc.serviceKey}`,
  };
  let intents: OrderIntentRow[] = [];
  try {
    const res = await send(
      `${base}/rest/v1/order_intents?select=operation_id,customer_id,lines,total_minor,note&status=eq.pending&order=created_at.asc&limit=50`,
      { method: "GET", headers, body: "" },
    );
    if (!res.ok) {
      log("WARN", "sync", "orders_pull.http", { status: res.status });
      return { taken: 0, rejected: 0 };
    }
    const raw = await res.text().catch(() => "");
    const parsed = JSON.parse(raw) as unknown;
    intents = Array.isArray(parsed) ? (parsed as OrderIntentRow[]) : [];
  } catch (err) {
    log("WARN", "sync", "orders_pull.failed", { error: String(err) });
    return { taken: 0, rejected: 0 };
  }

  let taken = 0;
  let rejected = 0;
  for (const intent of intents) {
    try {
      const created = createClientOrderAtomic({
        operationId: intent.operation_id,
        customerId: Number(intent.customer_id),
        lines: (Array.isArray(intent.lines) ? intent.lines : []).map((l) => ({
          productId: Number(l.productId),
          quantity: Number(l.quantity),
        })),
        note: intent.note ?? null,
        source: "app",
        now: new Date().toISOString(),
      });
      await supaMarkIntent(send, base, headers, intent.operation_id, "taken", created.reference);
      taken += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (ORDER_INTENT_REJECTED.some((reason) => message.includes(reason))) {
        await supaMarkIntent(send, base, headers, intent.operation_id, "rejected", null);
        rejected += 1;
        log("WARN", "sync", "orders_pull.rejected", { reason: message });
      } else {
        // Erreur transitoire : l'intention reste en attente.
        log("WARN", "sync", "orders_pull.deferred", { error: message });
      }
    }
  }
  return { taken, rejected };
}

/** Marque une intention (prise ou refus) — mise à jour de transport. */
async function supaMarkIntent(
  send: Transport,
  base: string,
  headers: Record<string, string>,
  operationId: string,
  status: "taken" | "rejected",
  reference: string | null,
): Promise<void> {
  try {
    await send(`${base}/rest/v1/order_intents?operation_id=eq.${encodeURIComponent(operationId)}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        order_reference: reference,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (err) {
    log("WARN", "sync", "orders_pull.mark_failed", { error: String(err) });
  }
}

/**
 * ADR-182 tranche E : usage de l'application client (30 derniers jours).
 *
 * LECTURE seule, best-effort : un miroir ancien (table ou vue absente) ne
 * doit pas casser l'écran — on renvoie `null` et l'UI affiche « indisponible ».
 * La clé de service est en lecture seule ici (aucune écriture).
 */
export interface ClientActivityStats {
  /** Nombre d'appels authentifiés (visites + consultations). */
  calls: number;
  /** Nombre de clients distincts venus dans la période. */
  customers: number;
  /** Dernière visite (instant ISO) ou null. */
  lastAt: string | null;
}

export async function getClientActivityStats(
  transport?: Transport,
): Promise<ClientActivityStats | null> {
  const doc = readDoc();
  if (!doc.enabled || doc.supabaseUrl === "" || doc.serviceKey === "") return null;
  const send: Transport = transport ?? mirrorTransport;
  const base = doc.supabaseUrl.replace(/\/+$/, "");
  const res = await send(`${base}/rest/v1/client_activity_30d?select=calls,customers,last_at`, {
    method: "GET",
    headers: {
      apikey: doc.serviceKey,
      Authorization: `Bearer ${doc.serviceKey}`,
    },
    body: "",
  });
  if (!res.ok) {
    log("WARN", "sync", "activity.http", { status: res.status });
    return null;
  }
  const raw = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(raw) as {
      calls?: number;
      customers?: number;
      last_at?: string | null;
    }[];
    const row = Array.isArray(parsed) ? parsed[0] : null;
    if (!row) return null;
    return {
      calls: Number.isFinite(Number(row.calls)) ? Number(row.calls) : 0,
      customers: Number.isFinite(Number(row.customers)) ? Number(row.customers) : 0,
      lastAt: typeof row.last_at === "string" ? row.last_at : null,
    };
  } catch {
    return null;
  }
}

/**
 * Rafraîchit la file d'un client après vente/paiement (best-effort : jamais
 * d'exception vers la finance — tout échec est loggé et ignoré).
 */
export function enqueueCustomerRefresh(customerId: number): void {
  // Best-effort : jamais d'exception vers la finance (log + ignoré).
  try {
    // Aucun cliché pour un client sans application mobile active : le miroir
    // refuserait la ligne (FK client_access) et bloquerait TOUTE la poussée.
    if (!hasActiveClientAccess(customerId)) return;
    const now = new Date().toISOString();
    const month = businessMonthOf(now);
    for (const kind of ["customer_snapshot", "invoice_list", "payment_list"] as const) {
      try {
        enqueueSnapshotAtomic({
          operationId: randomUUID(),
          customerId,
          kind,
          monthKey: kind === "customer_snapshot" ? month : null,
          now,
        });
      } catch (err) {
        log("WARN", "sync", "enqueue.failed", { customerId, kind, error: String(err) });
      }
    }
  } catch (err) {
    log("WARN", "sync", "enqueue.failed", { customerId, error: String(err) });
  }
}

/** Client d'une vente (null = vente au comptant ou introuvable). */
function customerIdOfSale(saleId: number): number | null {
  const row = getDb().prepare(`SELECT customer_id FROM sales WHERE id = ?`).get(saleId) as
    { customer_id: number | null } | undefined;
  return row?.customer_id ?? null;
}

function enqueueDetailFor(customerId: number, saleId: number): void {
  if (!hasActiveClientAccess(customerId)) return;
  enqueueSnapshotAtomic({
    operationId: randomUUID(),
    customerId,
    kind: "invoice_detail",
    saleId,
    now: new Date().toISOString(),
  });
}

/**
 * Détail d'UNE vente seulement (page facture APK), sans rafraîchir les listes :
 * un encaissement ventilé touche plusieurs factures du même client, une seule
 * paire de clichés de listes suffit (pas de doublons par facture).
 */
export function enqueueInvoiceDetailRefresh(saleId: number): void {
  try {
    const customerId = customerIdOfSale(saleId);
    if (customerId == null) return;
    enqueueDetailFor(customerId, saleId);
  } catch (err) {
    // Vente au comptant/annulée : pas de détail client (comportement existant).
    log("WARN", "sync", "enqueue.detail.skip", { saleId, error: String(err) });
  }
}

/**
 * Annonce magasin : l'annonce voyage dans le cliché `customer_snapshot`.
 * Un cliché par accès mobile ACTIF — sans cela, l'enregistrement dans la
 * table `announcements` n'atteignait jamais le miroir (l'APK gardait
 * l'ancien snapshot, souvent `announcement: null`).
 * Best-effort : un client en échec n'empêche pas les autres.
 */
export function enqueueAnnouncementRefresh(): void {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT customer_id FROM customer_access WHERE revoked_at IS NULL ORDER BY customer_id ASC`,
      )
      .all() as { customer_id: number }[];
    const now = new Date().toISOString();
    const month = businessMonthOf(now);
    for (const row of rows) {
      try {
        enqueueSnapshotAtomic({
          operationId: randomUUID(),
          customerId: row.customer_id,
          kind: "customer_snapshot",
          monthKey: month,
          now,
        });
      } catch (err) {
        log("WARN", "sync", "enqueue.announcement.failed", {
          customerId: row.customer_id,
          error: String(err),
        });
      }
    }
  } catch (err) {
    log("WARN", "sync", "enqueue.announcement.failed", { error: String(err) });
  }
}

/**
 * Rafraîchit la file d'une vente (résout le client, best-effort).
 * Pousse les trois clichés de listes + le détail de la vente (page détail APK)
 * quand elle appartient à un client non archivé.
 */
export function enqueueSaleRefresh(saleId: number): void {
  try {
    const customerId = customerIdOfSale(saleId);
    if (customerId == null) return;
    enqueueCustomerRefresh(customerId);
    enqueueDetailFor(customerId, saleId);
  } catch (err) {
    log("WARN", "sync", "enqueue.failed", { saleId, error: String(err) });
  }
}

/** Timer auto-poussée (60 s, best-effort, n'empêche jamais la sortie). */
let syncTimer: NodeJS.Timeout | null = null;
export function startSyncTimer(): void {
  if (syncTimer) return;
  syncTimer = setInterval(() => {
    try {
      const doc = readDoc();
      const cfg = syncConfigOf(doc);
      const nowMs = Date.now();
      const now = new Date(nowMs).toISOString();
      if (isPushDue(cfg, doc.lastPushAt, nowMs, doc.lastAttemptAt)) {
        void pushNowAtomic({ operationId: randomUUID(), now }).catch(() => {
          /* déjà loggé dans le service */
        });
      }
      // ADR-171 : cadence PROPRE (le gérant n'attend pas la file APK pour
      // avoir sa liasse). Best-effort strict : un échec ne remonte jamais.
      if (isOwnerPushDue(cfg, doc.lastOwnerPushAt, nowMs, doc.lastOwnerAttemptAt)) {
        void publishOwnerSnapshotAtomic({ operationId: randomUUID(), now }).catch(() => {
          /* déjà loggé dans le service */
        });
      }
      // ADR-182 tranche F : les INTENTIONS de commande en attente sont tirées
      // et transformées en commandes (SQLite = master). Best-effort : un échec
      // ne remonte jamais et l'intention reste en attente (reprise au tick
      // suivant) ; le `operationId` de l'intention évite tout doublon.
      void pullOrderIntentsAtomic().catch(() => {
        /* déjà loggé dans le service */
      });

      // ADR-182 : republication AUTOMATIQUE du catalogue quand son empreinte
      // a changé (prix, activation, archivage, import). La comparaison se
      // fait sur l'EMPREINTE, pas sur un drapeau : aucun chemin d'écriture
      // produit ne peut être oublié. Best-effort : un échec ne remonte jamais
      // et sera repris au tick suivant.
      if (doc.enabled && doc.supabaseUrl !== "" && doc.serviceKey !== "" && isCatalogStale()) {
        void publishCatalogAtomic({ operationId: randomUUID(), now }).catch(() => {
          /* déjà loggé dans le service */
        });
      }
    } catch (err) {
      log("ERROR", "sync", "auto.failed", { error: String(err) });
    }
  }, 60_000);
  if (typeof syncTimer.unref === "function") syncTimer.unref();
}

/**
 * L8 : arrêt explicite du timer (arrêt gracieux) — le timer est `unref` et ne
 * bloque jamais la sortie, mais on le libère proprement pour éviter qu'une
 * poussée auto démarre pendant la fermeture.
 */
export function stopSyncTimer(): void {
  if (!syncTimer) return;
  clearInterval(syncTimer);
  syncTimer = null;
}
