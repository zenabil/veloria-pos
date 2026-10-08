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
import { enqueueSnapshotAtomic } from "../ipc/handlers/client-access.repo";
import {
  SYNC_DEFAULTS,
  buildMirrorRequests,
  isPushDue,
  maskConfig,
  validateSyncConfig,
  type AccessMirrorRow,
  type OutboxMirrorRow,
  type SyncConfig,
  type SyncConfigView,
} from "./sync.protocol";

const SETTINGS_KEY = "client_sync";

interface SyncDoc {
  enabled: boolean;
  supabaseUrl: string;
  serviceKey: string;
  anonKey: string;
  intervalMinutes: number;
  lastPushAt: string | null;
  lastError: string | null;
}

function readDoc(): SyncDoc {
  const db = getDb();
  const fallback: SyncDoc = { ...SYNC_DEFAULTS, lastPushAt: null, lastError: null };
  try {
    const row = db
      .prepare(`SELECT value_json FROM app_settings WHERE key = ?`)
      .get(SETTINGS_KEY) as { value_json: string } | undefined;
    if (!row) return fallback;
    const parsed = JSON.parse(row.value_json) as Partial<SyncDoc>;
    return { ...fallback, ...parsed };
  } catch (err) {
    log("WARN", "sync", "read_failed", { error: String(err) });
    return fallback;
  }
}

function writeDoc(doc: SyncDoc, now: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
  ).run(SETTINGS_KEY, JSON.stringify({ ...doc, serviceKey: doc.serviceKey }), now);
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
  const cfg: SyncConfig = {
    enabled: doc.enabled,
    supabaseUrl: doc.supabaseUrl,
    serviceKey: doc.serviceKey,
    anonKey: doc.anonKey,
    intervalMinutes: doc.intervalMinutes,
  };
  return maskConfig(cfg, {
    lastPushAt: doc.lastPushAt,
    lastError: doc.lastError,
    pendingCount: pendingCount(),
  });
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
    };
    // Clé vide + clé existante = conservation (le renderer ne relit jamais
    // le secret — voir maskConfig) ; sinon la nouvelle valeur s'applique.
    const incomingKey = typeof incoming.serviceKey === "string" ? incoming.serviceKey.trim() : "";
    const incomingAnon = typeof incoming.anonKey === "string" ? incoming.anonKey.trim() : "";
    const cfg = validateSyncConfig({
      enabled: incoming.enabled,
      supabaseUrl: incoming.supabaseUrl,
      serviceKey:
        incomingKey === "" && prev.serviceKey !== "" ? prev.serviceKey : incoming.serviceKey,
      anonKey: incomingAnon === "" && prev.anonKey !== "" ? prev.anonKey : incoming.anonKey,
      intervalMinutes: incoming.intervalMinutes,
    });
    writeDoc({ ...cfg, lastPushAt: prev.lastPushAt, lastError: prev.lastError }, args.now);
    const result = { saved: true };
    storeIdempotencyResult(args.operationId, result);
    return result;
  });
  try {
    return (tx as unknown as () => { saved: boolean })();
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

/** Poussée complète : accès (tous, auto-réparant) + file en attente. */
export async function pushNowAtomic(
  args: { operationId: string; now: string },
  transport?: Transport,
): Promise<{ pushed: number; access: number }> {
  const db = getDb();
  const replay = peekIdempotency<{ pushed: number; access: number }>(
    args.operationId,
    "sync.pushNow",
  );
  if (replay) return replay;
  const doc = readDoc();
  const cfg = validateSyncConfig({
    enabled: doc.enabled,
    supabaseUrl: doc.supabaseUrl,
    serviceKey: doc.serviceKey,
    anonKey: doc.anonKey,
    intervalMinutes: doc.intervalMinutes,
  });
  if (!cfg.enabled) throw new Error("Synchronisation désactivée : activez-la d'abord.");
  const accessRows = db
    .prepare(
      `SELECT customer_id, phone_hash, pin_hash, pin_salt, pin_algo, qr_secret_hash, revoked_at, failed_attempts, locked_until, updated_at FROM customer_access ORDER BY customer_id ASC LIMIT 500`,
    )
    .all() as AccessMirrorRow[];
  const outboxRows = db
    .prepare(
      `SELECT operation_id, customer_id, kind, payload_json, created_at FROM sync_outbox WHERE status = 'pending' ORDER BY id ASC LIMIT 200`,
    )
    .all() as OutboxMirrorRow[];
  const requests = buildMirrorRequests(accessRows, outboxRows);
  const send: Transport =
    transport ??
    (async (url, init) => {
      const res = await fetch(url, {
        method: init.method,
        headers: init.headers,
        body: init.body,
      });
      return { ok: res.ok, status: res.status, text: () => res.text() };
    });
  const headers = {
    apikey: cfg.serviceKey,
    Authorization: `Bearer ${cfg.serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates",
  };
  const base = cfg.supabaseUrl.replace(/\/+$/, "");
  try {
    for (const req of requests) {
      const res = await send(`${base}/rest/v1/${req.table}?on_conflict=${req.onConflict}`, {
        method: "POST",
        headers,
        body: JSON.stringify(req.rows),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Miroir injoignable (HTTP ${res.status}). ${detail.slice(0, 120)}`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Échec de la poussée.";
    try {
      writeDoc({ ...doc, lastError: msg }, args.now);
    } catch {
      /* meta best-effort */
    }
    log("ERROR", "sync", "push.failed", { error: msg });
    throw err instanceof Error ? err : new Error(msg);
  }
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "sync.pushNow", args.now);
    for (const r of outboxRows) {
      db.prepare(`UPDATE sync_outbox SET status = 'sent', sent_at = ? WHERE operation_id = ?`).run(
        args.now,
        r.operation_id,
      );
    }
    try {
      writeDoc({ ...doc, lastPushAt: args.now, lastError: null }, args.now);
    } catch {
      /* meta best-effort */
    }
    const result = { pushed: outboxRows.length, access: accessRows.length };
    storeIdempotencyResult(args.operationId, result);
    return result;
  });
  try {
    return (tx as unknown as () => { pushed: number; access: number })();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ pushed: number; access: number }>(
        args.operationId,
        "sync.pushNow",
      );
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
    const now = new Date().toISOString();
    const month = now.slice(0, 7);
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

/**
 * Rafraîchit la file d'une vente (résout le client, best-effort).
 * Pousse aussi le détail de la vente (page détail APK) quand elle appartient
 * à un client non archivé — le miroir garde le dernier cliché par vente.
 */
export function enqueueSaleRefresh(saleId: number): void {
  try {
    const db = getDb();
    const row = db.prepare(`SELECT customer_id FROM sales WHERE id = ?`).get(saleId) as
      | {
          customer_id: number | null;
        }
      | undefined;
    if (row?.customer_id != null) {
      enqueueCustomerRefresh(row.customer_id);
      try {
        enqueueSnapshotAtomic({
          operationId: randomUUID(),
          customerId: row.customer_id,
          kind: "invoice_detail",
          saleId,
          now: new Date().toISOString(),
        });
      } catch (err) {
        // Vente au comptant/annulée : pas de détail client (comportement existant).
        log("WARN", "sync", "enqueue.detail.skip", { saleId, error: String(err) });
      }
    }
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
      const cfg: SyncConfig = {
        enabled: doc.enabled,
        supabaseUrl: doc.supabaseUrl,
        serviceKey: doc.serviceKey,
        anonKey: doc.anonKey,
        intervalMinutes: doc.intervalMinutes,
      };
      if (!isPushDue(cfg, doc.lastPushAt, Date.now())) return;
      void pushNowAtomic({ operationId: randomUUID(), now: new Date().toISOString() }).catch(() => {
        /* déjà loggé dans le service */
      });
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
