// Veloria Client — Persistance locale (cache miroir + session).
// Cache : expo-sqlite (données du client seul, miroir jetable du POS).
// Session (phone+pin) : SecureStore sur device, mémoire en repli (web).
// Toute IO est gardée try/catch : jamais d'écran bloqué par le stockage.
import type * as SecureStoreT from "expo-secure-store";
import type * as SQLiteT from "expo-sqlite";
import { EMPTY_CACHE, type MirrorCache, type Session } from "./store.ts";

const SESSION_KEY = "veloria.session.v1";
const KV_PREFIX = "kv.";
/**
 * Dernier endpoint marchand CONNU (ADR-068 + accès distant) : mémorisé à
 * chaque connexion réussie, CONSERVÉ à la déconnexion (contrairement à la
 * session). Permet la reconnexion manuelle à distance (hors boutique) sans
 * re-scanner le QR : l'APK universel n'a aucun endpoint gravé d'avance.
 */
const ENDPOINT_KEY = "veloria.endpoint.v1";
/**
 * Dernier téléphone SAISI (V5 « Connexion directe ») : surviv à la déconnexion
 * comme l'endpoint, pour que l'écran de connexion ouvre directement sur le PIN.
 * Chiffré par le stockage système, jamais transmis ni affiché ailleurs ; ce
 * n'est pas un secret (c'est le numéro que le client dicte au comptoir) et ce
 * n'est PAS une donnée métier — une simple préférence d'écran.
 */
const LAST_PHONE_KEY = "veloria.last-phone.v1";

export interface ShopEndpoint {
  supabaseUrl: string;
  anonKey: string;
}

interface NativeModules {
  SecureStore: typeof SecureStoreT;
  SQLite: typeof SQLiteT;
}

// Modules natifs chargés paresseusement : sur web (ou device sans modules),
// le require lève et on bascule sur la mémoire — jamais d'écran bloqué.
// IMPORTANT : appels require() DIRECTS à littéraux statiques — Metro ne
// détecte que cette forme. Un alias (`const req = require`) rend les modules
// invisibles au bundler : absents du bundle release ("Requiring unknown
// module" au runtime, NON rattrapé → crash fatal au démarrage sur APK,
// constaté au logcat : loadNative → secureGet → loadSession).
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
      supabaseUrl: typeof o.supabaseUrl === "string" && o.supabaseUrl !== "" ? o.supabaseUrl : null,
      anonKey: typeof o.anonKey === "string" && o.anonKey !== "" ? o.anonKey : null,
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

/** Dernier endpoint connu (survit à la déconnexion — reconnexion distante). */
export async function loadLastEndpoint(): Promise<ShopEndpoint | null> {
  const raw = await secureGet(ENDPOINT_KEY);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<ShopEndpoint>;
    if (typeof o.supabaseUrl !== "string" || o.supabaseUrl === "") return null;
    if (typeof o.anonKey !== "string" || o.anonKey === "") return null;
    return { supabaseUrl: o.supabaseUrl, anonKey: o.anonKey };
  } catch {
    return null;
  }
}

export async function saveLastEndpoint(e: ShopEndpoint): Promise<void> {
  if (e.supabaseUrl === "" || e.anonKey === "") return;
  await secureSet(ENDPOINT_KEY, JSON.stringify(e));
}

/** Téléphone mémorisé pour l'écran de connexion (jamais le PIN). */
export async function loadLastPhone(): Promise<string | null> {
  const raw = await secureGet(LAST_PHONE_KEY);
  if (raw == null) return null;
  const phone = raw.trim();
  return phone.length > 0 && phone.length <= 30 ? phone : null;
}

export async function saveLastPhone(phone: string): Promise<void> {
  const value = phone.trim();
  if (value.length === 0 || value.length > 30) return;
  await secureSet(LAST_PHONE_KEY, value);
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
    // ADR-182 : le catalogue est un CACHE à part entière : il survit à une
    // synchronisation qui n'a rien remonté (miroir sans catalogue) au lieu de
    // disparaître. Un catalogue absent ne doit pas effacer le précédent.
    catalog: kv["catalog"] == null ? null : parseJson(kv["catalog"]),
    catalogVersion: kv["catalogVersion"] ?? null,
    catalogPublishedAt: kv["catalogPublishedAt"] ?? null,
    syncedAt: kv["syncedAt"] ?? null,
  };
}

export function saveCache(c: MirrorCache): void {
  if (c.syncedAt == null) return;
  writeKv("snapshot", JSON.stringify(c.snapshot ?? null));
  writeKv("invoices", JSON.stringify(c.invoices ?? null));
  writeKv("payments", JSON.stringify(c.payments ?? null));
  writeKv("syncedAt", c.syncedAt);
  // ADR-182 : n'écrase le catalogue en cache QUE si le miroir en a renvoyé
  // un (ou une version) — sinon le catalogue local survit à une synchro
  // partielle (le miroir peut être en maintenance, l'app doit rester utile).
  if (c.catalog != null) writeKv("catalog", JSON.stringify(c.catalog));
  if (c.catalogVersion != null) writeKv("catalogVersion", c.catalogVersion);
  if (c.catalogPublishedAt != null) writeKv("catalogPublishedAt", c.catalogPublishedAt);
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
