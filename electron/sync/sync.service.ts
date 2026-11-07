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
    claimIdempotency(args.operationId, OWNER_ACCOUNT_CHANNEL, args.now);
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
  doc: SyncDoc,
  now: string,
  err: Error,
  lane: "mirror" | "owner",
): Error {
  const message = toUserMessage(err).message;
  try {
    writeDoc(
      lane === "owner"
        ? { ...doc, lastOwnerError: message, lastOwnerAttemptAt: now }
        : { ...doc, lastError: message, lastAttemptAt: now },
      now,
    );
  } catch {
    /* meta best-effort */
  }
  log("ERROR", "sync", `push.config_rejected.${lane}`, { error: message });
  return new Error(message);
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
): Promise<{ pushed: number; access: number; failed: number }> {
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
): Promise<{ pushed: number; access: number; failed: number }> {
  const db = getDb();
  const replay = peekIdempotency<{ pushed: number; access: number; failed: number }>(
    args.operationId,
    "sync.pushNow",
  );
  if (replay) return replay;
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
  const queuedRows = db
    .prepare(
      `SELECT operation_id, customer_id, kind, payload_json, created_at FROM sync_outbox WHERE status = 'pending' ORDER BY id ASC LIMIT 200`,
    )
    .all() as OutboxMirrorRow[];
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
      // stoppe net (file inchangée, donc rejouable) au lieu de condamner les
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
      // bissection n'aboutirait qu'à condamner un accès après l'autre, et la
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
           FROM customer_access WHERE customer_id > ? ORDER BY customer_id ASC LIMIT 500`,
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
    try {
      // E-43 : l'échec horodate aussi la TENTATIVE, sinon la cadence
      // `intervalMinutes` est ignorée et le timer repart toutes les 60 s.
      writeDoc({ ...doc, lastError: msg, lastAttemptAt: args.now }, args.now);
    } catch {
      /* meta best-effort */
    }
    log("ERROR", "sync", "push.failed", { error: msg });
    throw err instanceof Error ? err : new Error(msg);
  }
  const rejectedIds = new Set(rejected);
  const condemned = new Set([...rejectedIds, ...corruptedOperationIds]);
  const delivered = outboxRows.filter((r) => !condemned.has(r.operation_id));
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "sync.pushNow", args.now);
    for (const r of delivered) {
      db.prepare(`UPDATE sync_outbox SET status = 'sent', sent_at = ? WHERE operation_id = ?`).run(
        args.now,
        r.operation_id,
      );
    }
    // ADR-173 : une ligne écartée ne reste pas `pending` (elle repartirait
    // éternellement au prochain tick) — `failed` est un état d'audit.
    for (const operationId of condemned) {
      db.prepare(`UPDATE sync_outbox SET status = 'failed' WHERE operation_id = ?`).run(
        operationId,
      );
    }
    try {
      const condemnedCount = condemned.size;
      writeDoc(
        {
          ...doc,
          lastPushAt: args.now,
          lastAttemptAt: args.now,
          lastError:
            condemnedCount === 0
              ? null
              : `${condemnedCount} cliché(s) écarté(s) définitivement de la file : ${
                  corruptedOperationIds.length > 0
                    ? `${corruptedOperationIds.length} illisible(s) en local`
                    : ""
                }${corruptedOperationIds.length > 0 && rejectedIds.size > 0 ? " · " : ""}${
                  rejectedIds.size > 0
                    ? `${rejectedIds.size} refusé(s) par le miroir (données client incohérentes : accès correspondant absent)`
                    : ""
                }.`,
        },
        args.now,
      );
    } catch {
      /* meta best-effort */
    }
    const result = {
      pushed: delivered.length,
      access: accessCount,
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
      const retry = peekIdempotency<{ pushed: number; access: number; failed: number }>(
        args.operationId,
        "sync.pushNow",
      );
      if (retry) return retry;
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

export async function publishOwnerSnapshotAtomic(
  args: { operationId: string; now: string },
  transport?: Transport,
): Promise<OwnerPublishResult> {
  const db = getDb();
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
  const snapshot = buildOwnerSnapshot(args.now);
  const body = JSON.stringify([
    { shop_key: OWNER_SHOP_KEY, payload: snapshot, generated_at: args.now },
  ]);
  // E-45 : même transport gardé que la file client (échéance + pas de requête
  // suspendue) — la duplication d'un `fetch` nu était le même défaut.
  const send: Transport = transport ?? mirrorTransport;
  const headers = {
    apikey: cfg.serviceKey,
    Authorization: `Bearer ${cfg.serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  try {
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
    try {
      // E-43 : cadence respectée aussi en échec (sinon 60 s de re-tentatives).
      writeDoc({ ...doc, lastOwnerError: msg, lastOwnerAttemptAt: args.now }, args.now);
    } catch {
      /* meta best-effort */
    }
    log("ERROR", "sync", "owner_push.failed", { error: msg });
    throw err instanceof Error ? err : new Error(msg);
  }
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, OWNER_PUSH_CHANNEL, args.now);
    try {
      writeDoc(
        {
          ...doc,
          lastOwnerPushAt: args.now,
          lastOwnerAttemptAt: args.now,
          lastOwnerError: null,
        },
        args.now,
      );
    } catch {
      /* meta best-effort */
    }
    const result: OwnerPublishResult = {
      published: true,
      chars: body.length,
      generatedAt: args.now,
      lastOwnerPushAt: args.now,
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
      const retry = peekIdempotency<OwnerPublishResult>(args.operationId, OWNER_PUSH_CHANNEL);
      if (retry) return retry;
    }
    throw err;
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
