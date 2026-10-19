// Veloria PoS — Domain: rôles internes gérant / utilisateur (pur, sans framework).
// Code = exactement 6 chiffres (choix produit). Le hachage PBKDF2 vit côté main ;
// ici : formes, verrouillage, permissions. Miroir main :
// electron/ipc/handlers/staff.repo.ts (mêmes constantes, commentées « miroir »).

import { DomainError } from "../common/errors.ts";

export const STAFF_MAX_FAILED_ATTEMPTS = 5;
export const STAFF_LOCK_MINUTES = 5;

/** Code de secours (0042) : 8 chiffres, 5 échecs → 15 minutes. */
export const STAFF_RECOVERY_LENGTH = 8;

export const STAFF_ROLES = ["manager", "user"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Permissions accordées par le gérant (union EXACTE du CHECK 0041). */
export const STAFF_PERMISSIONS = [
  "sales",
  "stock",
  "debts",
  "expenses",
  "returns",
  "closings",
  "settings",
  "users",
  "discount",
  "cancel",
] as const;
export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

/** Nom d'utilisateur : 3 à 32 caractères, sans | ni espaces de bord. */
export function assertValidUsername(username: string): string {
  const u = username.trim().toLowerCase();
  if (u.length < 3 || u.length > 32 || u.includes("|") || /\s/.test(u)) {
    throw new DomainError(
      "STAFF_ERROR",
      "Nom d'utilisateur invalide (3 à 32 caractères, sans espace).",
    );
  }
  return u;
}

/** Code : exactement 6 chiffres ASCII. */
export function assertValidCode(code: string): void {
  if (!/^[0-9]{6}$/.test(code)) {
    throw new DomainError("STAFF_ERROR", "Code invalide (6 chiffres).");
  }
}

/** Code de secours : exactement 8 chiffres ASCII. */
export function assertValidRecoveryCode(code: string): void {
  if (!/^[0-9]{8}$/.test(code)) {
    throw new DomainError("STAFF_ERROR", "Code de secours invalide (8 chiffres).");
  }
}

export function assertValidRole(role: string): StaffRole {
  if (role !== "manager" && role !== "user") {
    throw new DomainError("STAFF_ERROR", "Rôle invalide.");
  }
  return role;
}

export function assertValidPermission(key: string): StaffPermission {
  if (!(STAFF_PERMISSIONS as readonly string[]).includes(key)) {
    throw new DomainError("STAFF_ERROR", "Permission invalide.");
  }
  return key as StaffPermission;
}

/** Verrou actif : 5 échecs → 5 minutes (même politique que les clients). */
export function isLocked(lockedUntilISO: string | null, nowISO: string): boolean {
  if (lockedUntilISO == null) return false;
  const a = Date.parse(nowISO);
  const b = Date.parse(lockedUntilISO);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new DomainError("STAFF_ERROR", "Date invalide.");
  }
  return b > a;
}

/** Prochain état après un échec : verrouille au 5e, sinon simple compteur. */
export function nextFailedState(
  failedAttempts: number,
  nowISO: string,
): { failedAttempts: number; lockedUntilISO: string | null } {
  if (!Number.isInteger(failedAttempts) || failedAttempts < 0) {
    throw new DomainError("STAFF_ERROR", "Compteur de tentatives invalide.");
  }
  const next = failedAttempts + 1;
  if (next < STAFF_MAX_FAILED_ATTEMPTS) return { failedAttempts: next, lockedUntilISO: null };
  const lockMs = Date.parse(nowISO) + STAFF_LOCK_MINUTES * 60_000;
  if (!Number.isFinite(lockMs)) throw new DomainError("STAFF_ERROR", "Date invalide.");
  return { failedAttempts: next, lockedUntilISO: new Date(lockMs).toISOString() };
}

/**
 * Le gérant a tout implicitement ; l'utilisateur n'a que les clés accordées.
 * Décision d'affichage uniquement — le main revérifie en base à chaque IPC.
 */
export function hasPermission(
  role: StaffRole,
  granted: readonly string[],
  key: StaffPermission,
): boolean {
  if (role === "manager") return true;
  return granted.includes(key);
}
