// Veloria Client (APK) — Parseur QR d'activation (pur, testé).
// V1 (ADR-054) : `VELORIA1|<phone>|<pin>|<code>` → endpoint gravé au build.
// V2 (ADR-068) : `VELORIA2|<supabaseUrl>|<anonKey>|<phone>|<pin>|<code>` →
// APK universel : l'endpoint du magasin voyage dans le QR, un seul build
// pour tous les magasins. Sécurité : whitelist stricte (même règle que le
// POS), clé `service_role` refusée (anon uniquement).
// Toute évolution du format : POS use-case + repo + ici + tests des deux côtés.

export const ACTIVATION_QR_PREFIX = "VELORIA1";
export const ACTIVATION_QR_PREFIX_V2 = "VELORIA2";

export interface ShopEndpoint {
  supabaseUrl: string;
  anonKey: string;
}

export interface QrCredentials {
  phone: string;
  pin: string;
  /** Null = V1 (endpoint gravé au build) ; renseigné = V2 (endpoint du QR). */
  endpoint: ShopEndpoint | null;
}

export class QrError extends Error {
  constructor() {
    super("QR_INVALIDE");
    this.name = "QrError";
  }
}

function isValidSupabaseUrl(url: string): boolean {
  const u = url.trim();
  if (u.includes("|") || u === "") return false;
  if (/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(u)) return true;
  // Relais local (démo/boucle locale) : http réservé au loopback.
  if (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/?$/i.test(u)) return true;
  return false;
}

function base64UrlRole(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const bin = base64UrlDecode(parts[1] ?? "");
    const obj = JSON.parse(bin) as { role?: unknown };
    return typeof obj.role === "string" ? obj.role : null;
  } catch {
    return null;
  }
}

/** Décodage base64url pur (sans Buffer/atob : runtime Hermes/web). */
function base64UrlDecode(b64url: string): string {
  const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  let bits = 0;
  let acc = 0;
  const bytes: number[] = [];
  for (const ch of b64) {
    if (ch === "=") break;
    const v = table.indexOf(ch);
    if (v < 0) throw new Error("b64");
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }
  // ASCII seul (claim `role`) : conversion directe sans TextDecoder.
  return bytes.map((b) => String.fromCharCode(b)).join("");
}

function isValidAnonKey(key: string): boolean {
  const k = key.trim();
  if (k.length < 20 || k.length > 500) return false;
  if (!/^[A-Za-z0-9-_.=]+$/.test(k) || k.includes("|")) return false;
  // Garde anti service_role : un QR imprimé ne doit jamais porter la clé
  // maîtresse. L'anon est publique par conception (RLS).
  if (base64UrlRole(k) === "service_role") return false;
  return true;
}

function assertPhonePin(phone: string, pin: string): string {
  const p = phone.trim();
  if (p.length < 1 || p.length > 30) throw new QrError();
  if (!/^[0-9]{6}$/.test(pin)) throw new QrError();
  return p;
}

function assertCode(code: string): void {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(code)) throw new QrError();
}

/** Extrait {phone, pin, endpoint} d'un QR scanné, sinon QrError (mappée ar/fr à l'écran). */
export function parseActivationQr(text: string): QrCredentials {
  const raw = text.trim();
  if (raw.startsWith(`${ACTIVATION_QR_PREFIX_V2}|`)) {
    const parts = raw.split("|");
    if (parts.length !== 6) throw new QrError();
    const supabaseUrl = (parts[1] ?? "").trim();
    const anonKey = (parts[2] ?? "").trim();
    const phone = assertPhonePin(parts[3] ?? "", parts[4] ?? "");
    assertCode(parts[5] ?? "");
    if (!isValidSupabaseUrl(supabaseUrl)) throw new QrError();
    if (!isValidAnonKey(anonKey)) throw new QrError();
    return { phone, pin: parts[4] ?? "", endpoint: { supabaseUrl, anonKey } };
  }
  const parts = raw.split("|");
  if (parts.length !== 4 || parts[0] !== ACTIVATION_QR_PREFIX) throw new QrError();
  const phone = assertPhonePin(parts[1] ?? "", parts[2] ?? "");
  assertCode(parts[3] ?? "");
  return { phone, pin: parts[2] ?? "", endpoint: null };
}
