// Veloria Client — Persistance locale (cache miroir + session).
// Cache : expo-sqlite (données du client seul, miroir jetable du POS).
// Session (phone+pin) : SecureStore sur device, mémoire en repli (web).
// Toute IO est gardée try/catch : jamais d'écran bloqué par le stockage.
import type * as SecureStoreT from "expo-secure-store";
import type * as SQLiteT from "expo-sqlite";
import { EMPTY_CACHE, type MirrorCache, type Session } from "./store.ts";

const SESSION_KEY = "veloria.session.v1";
const KV_PREFIX = "kv.";

interface NativeModules {
  SecureStore: typeof SecureStoreT;
  SQLite: typeof SQLiteT;
}

// Modules natifs chargés paresseusement : sur web (ou device sans modules),
// le require lève et on bascule sur la mémoire — jamais d'écran bloqué.
// Le `import` statique d'avant plantait le bundle web au démarrage car
// l'init d'expo-sqlite exige le module natif (repli prévu dès l'origine).
function loadNative(): NativeModules | null {
  try {
    const req = require as unknown as (id: string) => unknown;
    return {
      SecureStore: req("expo-secure-store") as typeof SecureStoreT,
      SQLite: req("expo-sqlite") as typeof SQLiteT,
    };
  } catch {
    return null;
  }
}

let native: NativeModules | null | undefined;
function nativeModules(): NativeModules | null {
  if (native === undefined) native = loadNative();
  return native;
}

const mem = new Map<string, string>();

function memGet(key: string): string | null {
  return mem.has(key) ? (mem.get(key) as string) : null;
}

async function secureGet(key: string): Promise<string | null> {
  try {
    const m = nativeModules();
    if (!m) return memGet(key);
    return await m.SecureStore.getItemAsync(key);
  } catch {
    return memGet(key);
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  try {
    const m = nativeModules();
    if (!m) throw new Error("no-native");
    await m.SecureStore.setItemAsync(key, value);
  } catch {
    mem.set(key, value);
  }
}

async function secureDel(key: string): Promise<void> {
  try {
    const m = nativeModules();
    if (!m) throw new Error("no-native");
    await m.SecureStore.deleteItemAsync(key);
  } catch {
    mem.delete(key);
  }
}

function db(): SQLiteT.SQLiteDatabase | null {
  try {
    const m = nativeModules();
    if (!m) return null;
    return m.SQLite.openDatabaseSync("veloria-client.db");
  } catch {
    return null;
  }
}

function readKv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const d = db();
    if (d) {
      d.execSync("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
      const rows = d.getAllSync<{ k: string; v: string }>("SELECT k, v FROM kv");
      for (const r of rows) out[r.k] = r.v;
      return out;
    }
  } catch {
    /* base illisible : repli mémoire ci-dessous */
  }
  // Repli mémoire GÉNÉRIQUE (web / sans natif) : TOUTES les clés `kv.*`,
  // lignes miroir comme détails `detail:<id>` — la lecture doit rester
  // symétrique de l'écriture, sinon le cache détail ne se relit jamais.
  for (const [k, v] of mem) {
    if (k.startsWith(KV_PREFIX)) out[k.slice(KV_PREFIX.length)] = v;
  }
  return out;
}

function writeKv(key: string, value: string): void {
  try {
    const d = db();
    if (!d) throw new Error("no-db");
    d.execSync("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
    d.runSync("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)", key, value);
  } catch {
    mem.set(`${KV_PREFIX}${key}`, value);
  }
}

function clearKv(): void {
  try {
    const d = db();
    if (d) d.execSync("DELETE FROM kv");
  } catch {
    /* pas de base : le nettoyage mémoire reste nécessaire */
  }
  // Purge mémoire TOUJOURS : sans cela, la session précédente garde ses
  // détails de facture en mémoire (fuite cross-session sur appareil partagé).
  for (const k of [...mem.keys()]) {
    if (k.startsWith(KV_PREFIX)) mem.delete(k);
  }
}

function parseSession(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<Session>;
    if (typeof o.phone !== "string" || typeof o.pin !== "string") return null;
    return {
      phone: o.phone,
      pin: o.pin,
      lang: o.lang === "fr" ? "fr" : "ar",
      amountsHidden: o.amountsHidden !== false,
      lastLoginAt: typeof o.lastLoginAt === "string" ? o.lastLoginAt : null,
    };
  } catch {
    return null;
  }
}

export async function loadSession(): Promise<Session | null> {
  return parseSession(await secureGet(SESSION_KEY));
}

export async function saveSession(s: Session): Promise<void> {
  await secureSet(SESSION_KEY, JSON.stringify(s));
}

export async function clearSession(): Promise<void> {
  await secureDel(SESSION_KEY);
}

function parseJson(raw: string | undefined): unknown {
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function loadCache(): MirrorCache {
  const kv = readKv();
  if (kv["syncedAt"] == null) return EMPTY_CACHE;
  return {
    snapshot: parseJson(kv["snapshot"]),
    invoices: parseJson(kv["invoices"]),
    payments: parseJson(kv["payments"]),
    syncedAt: kv["syncedAt"] ?? null,
  };
}

export function saveCache(c: MirrorCache): void {
  if (c.syncedAt == null) return;
  writeKv("snapshot", JSON.stringify(c.snapshot ?? null));
  writeKv("invoices", JSON.stringify(c.invoices ?? null));
  writeKv("payments", JSON.stringify(c.payments ?? null));
  writeKv("syncedAt", c.syncedAt);
}

export function clearCache(): void {
  clearKv();
}

/** Détail facture persisté (`detail:<saleId>` → {detail, syncedAt}). */
export function loadDetail(saleId: number): { detail: unknown; syncedAt: string | null } | null {
  const kv = readKv();
  const raw = kv[`detail:${saleId}`];
  if (raw == null) return null;
  const o = parseJson(raw) as { detail?: unknown; syncedAt?: unknown } | null;
  if (!o || typeof o !== "object") return null;
  return {
    detail: (o as Record<string, unknown>)["detail"] ?? null,
    syncedAt:
      typeof (o as Record<string, unknown>)["syncedAt"] === "string"
        ? ((o as Record<string, unknown>)["syncedAt"] as string)
        : null,
  };
}

export function saveDetail(saleId: number, detail: unknown, syncedAt: string): void {
  writeKv(`detail:${saleId}`, JSON.stringify({ detail: detail ?? null, syncedAt }));
}
