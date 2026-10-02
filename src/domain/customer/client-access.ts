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
