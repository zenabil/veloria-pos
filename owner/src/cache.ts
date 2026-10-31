// Veloria Owner — persistance locale (session chiffrée + dernière liasse).
// La liasse est un miroir jetable du POS : elle ne sert qu'à ouvrir l'app
// hors ligne sur les derniers chiffres connus, avec la puce « hors ligne ».
import type * as SecureStoreT from "expo-secure-store";
import type * as SQLiteT from "expo-sqlite";
import type { Session } from "./store.ts";

const SESSION_KEY = "veloria.owner.session.v1";
const KV_PREFIX = "kv.";

interface NativeModules {
  SecureStore: typeof SecureStoreT;
  SQLite: typeof SQLiteT;
}

function loadNative(): NativeModules | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require("expo-secure-store") as typeof SecureStoreT;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SQLite = require("expo-sqlite") as typeof SQLiteT;
    return { SecureStore, SQLite };
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
    return m.SQLite.openDatabaseSync("veloria-owner.db");
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
    /* base illisible : repli mémoire */
  }
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
    /* pas de base : purge mémoire ci-dessous */
  }
  for (const k of [...mem.keys()]) {
    if (k.startsWith(KV_PREFIX)) mem.delete(k);
  }
}

export async function loadSession(): Promise<Session | null> {
  const raw = await secureGet(SESSION_KEY);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<Session>;
    if (typeof o.email !== "string" || o.email === "") return null;
    return {
      email: o.email,
      accessToken: typeof o.accessToken === "string" ? o.accessToken : null,
      demo: o.demo === true,
      lastLoginAt: typeof o.lastLoginAt === "string" ? o.lastLoginAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
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

export function loadSnapshot(): { snapshot: unknown; generatedAt: string | null } {
  const kv = readKv();
  return {
    snapshot: parseJson(kv["snapshot"]),
    generatedAt: kv["generatedAt"] ?? null,
  };
}

export function saveSnapshot(snapshot: unknown, generatedAt: string): void {
  writeKv("snapshot", JSON.stringify(snapshot ?? null));
  writeKv("generatedAt", generatedAt);
}

/** Déconnexion : purge la liasse, la session part seule. */
export function clearSnapshot(): void {
  clearKv();
}
