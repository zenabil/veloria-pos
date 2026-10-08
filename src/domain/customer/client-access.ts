// Veloria PoS — Domain: accès clients APK (V1 lecture seule, framework-free).
// Règles pures : format PIN/QR, expirations, verrouillage, annonces.
// Le hachage (SHA-256) a lieu côté main ; ici on ne valide que les formes.
// SQLite reste le master, le cloud un miroir (ADR-053). V1 = lecture seule.

import { DomainError } from "../common/errors.ts";

export const CLIENT_PIN_LENGTH = 6;
export const CLIENT_QR_VALIDITY_DAYS = 7;
export const CLIENT_SESSION_VALIDITY_DAYS = 90;
export const CLIENT_MAX_FAILED_ATTEMPTS = 5;
export const CLIENT_LOCK_MINUTES = 5;
export const CLIENT_ANNOUNCEMENT_MAX = 120;

/** PIN : exactement 6 chiffres ASCII (lisible par les seniors, sans 0/O ambigus). */
export function assertValidPin(pin: string): void {
  if (!/^[0-9]{6}$/.test(pin)) {
    throw new DomainError("CUSTOMER_ERROR", "Code PIN invalide (6 chiffres).");
  }
}

/** Code d'activation QR : opaque, usage unique, 16 à 128 caractères URL-safe. */
export function assertValidActivationCode(code: string): void {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(code)) {
    throw new DomainError("CUSTOMER_ERROR", "Code d'activation invalide.");
  }
}

/** Millisecondes entre deux ISO ; lève une erreur contrôlée si illisibles. */
function diffMs(fromISO: string, toISO: string): number {
  const a = Date.parse(fromISO);
  const b = Date.parse(toISO);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new DomainError("CUSTOMER_ERROR", "Date invalide.");
  }
  return b - a;
}

const DAY_MS = 86_400_000;

/** QR périmé après 7 jours (re-généré par le commerçant, jamais prolongé). */
export function isQrExpired(issuedAtISO: string, nowISO: string): boolean {
  return diffMs(issuedAtISO, nowISO) > CLIENT_QR_VALIDITY_DAYS * DAY_MS;
}

/** Session valide 90 jours, prolongée par saisie du PIN (pas de sortie surprise). */
export function isSessionExpired(lastLoginISO: string, nowISO: string): boolean {
  return diffMs(lastLoginISO, nowISO) > CLIENT_SESSION_VALIDITY_DAYS * DAY_MS;
}

/** Verrou actif : 5 échecs → 5 minutes (anti devinette du PIN à 6 chiffres). */
export function isLocked(lockedUntilISO: string | null, nowISO: string): boolean {
  if (lockedUntilISO == null) return false;
  return diffMs(nowISO, lockedUntilISO) > 0;
}

/** Prochain verrou après un échec : verrouille au 5e, sinon simple compteur. */
export function nextFailedState(
  failedAttempts: number,
  nowISO: string,
): { failedAttempts: number; lockedUntilISO: string | null } {
  if (!Number.isInteger(failedAttempts) || failedAttempts < 0) {
    throw new DomainError("CUSTOMER_ERROR", "Compteur de tentatives invalide.");
  }
  const next = failedAttempts + 1;
  if (next < CLIENT_MAX_FAILED_ATTEMPTS) return { failedAttempts: next, lockedUntilISO: null };
  const lockMs = Date.parse(nowISO) + CLIENT_LOCK_MINUTES * 60_000;
  if (!Number.isFinite(lockMs)) throw new DomainError("CUSTOMER_ERROR", "Date invalide.");
  return { failedAttempts: next, lockedUntilISO: new Date(lockMs).toISOString() };
}

/** Annonce magasin : 1 ligne, 120 caractères max (verrou DB identique, 0032). */
export function assertValidAnnouncement(text: string): void {
  const t = text.trim();
  if (t.length < 1 || t.length > CLIENT_ANNOUNCEMENT_MAX) {
    throw new DomainError("CUSTOMER_ERROR", "Annonce invalide (1 à 120 caractères).");
  }
}

/** URL Supabase embarquée dans le QR V2 (ADR-068) : whitelist stricte anti-phishing. */
export function assertValidSupabaseUrl(url: string): void {
  const u = url.trim();
  const isCloud = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(u);
  const isLoopback = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/?$/i.test(u);
  if (!isCloud && !isLoopback) {
    throw new DomainError("CUSTOMER_ERROR", "URL Supabase invalide (https://xxx.supabase.co).");
  }
  if (u.includes("|")) {
    throw new DomainError("CUSTOMER_ERROR", "URL Supabase invalide (https://xxx.supabase.co).");
  }
}

/** Décode le rôle d'un JWT sans vérifier la signature (garde anti service_role). */
function jwtRole(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = base64UrlDecode(parts[1] ?? "");
    const obj = JSON.parse(json) as { role?: unknown };
    return typeof obj.role === "string" ? obj.role : null;
  } catch {
    return null;
  }
}

/** Décodage base64url pur (renderer + node, sans Buffer/atob). */
function base64UrlDecode(b64url: string): string {
  const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  let bits = 0;
  let acc = 0;
  const bytes: number[] = [];
  for (const ch of b64) {
    if (ch === "=") break;
    const v = table.indexOf(ch);
    if (v < 0) throw new Error("Données d'accès illisibles.");
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }
  return bytes.map((b) => String.fromCharCode(b)).join("");
}

/**
 * Clé `anon` embarquée dans le QR V2 : jamais une clé `service_role`.
 * La clé `anon` est publique par conception (RLS) ; une `service_role`
 * dans un QR imprimé exposerait toute la base — refus explicite ici.
 */
export function assertValidAnonKey(key: string): void {
  const k = key.trim();
  if (k.length < 20 || k.length > 500 || !/^[A-Za-z0-9-_.=]+$/.test(k) || k.includes("|")) {
    throw new DomainError("CUSTOMER_ERROR", "Clé anon invalide.");
  }
  if (jwtRole(k) === "service_role") {
    throw new DomainError("CUSTOMER_ERROR", "Clé service interdite dans le QR (anon uniquement).");
  }
}

/**
 * Dérivation du condensat PIN (#39) — PARAMÈTRES CANONIQUES (données pures,
 * sans crypto ici : le domaine reste empaquetable navigateur).
 * - PIN 6 chiffres (10^6 combinaisons) + SHA-256 nu = devinable en
 *   millisecondes si les condensats du miroir fuient → PBKDF2-HMAC-SHA256
 *   obligatoire (devinette lente par construction).
 * - `phone_hash` RESTE un SHA-256 déterministe : c'est une CLÉ de recherche
 *   (lookup avant sel connu), pas un vérifieur ; le secret vérifié est le PIN.
 * - `qr_secret_hash` reste SHA-256 : secret de 128 bits aléatoires (devinette
 *   impossible), pas un mot de passe humain.
 * MIROIRS OBLIGATOIRES (mêmes valeurs, commentés « miroir du domaine ») :
 * `electron/ipc/handlers/client-access.repo.ts` (écriture),
 * `cloud/supabase/functions/client-sync/index.ts` (vérification Edge),
 * `scripts/e2e-mirror-relay.mjs` (parité E2E). Tout écart = test contrat rouge.
 */
export const PIN_KDF_ALGO = "pbkdf2-sha256-100k";
export const PIN_KDF_ITERATIONS = 100_000;
export const PIN_KDF_KEYLEN_BYTES = 32;
export const PIN_KDF_SALT_BYTES = 16;
export const PIN_KDF_DIGEST = "SHA-256";
