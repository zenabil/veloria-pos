// Veloria PoS — Main-process repository: rôles internes gérant / utilisateur.
// Code 6 chiffres + PBKDF2-HMAC-SHA256 100k + sel par utilisateur : ce repo
// EST la règle exécutée (la copie domaine non branchée a été retirée, ADR-153
// lot B). Les constantes ci-dessous sont figées par `staff-domain.test.ts`.
// Une seule transaction par mutation ; idempotence par operationId.
// Le code ne transite en clair que sur ce pont local (jamais stocké/loggé).

import { pbkdf2Sync, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { claimIdempotency, peekIdempotency, storeIdempotencyResult } from "./idempotency";

/**
 * Paramètres KDF — mêmes valeurs que les PIN clients (#39) ; figés par le test
 * contrat `staff-domain.test.ts`. Tout écart = test contrat rouge.
 */
export const STAFF_KDF_ALGO = "pbkdf2-sha256-100k";
export const STAFF_KDF_ITERATIONS = 100_000;
export const STAFF_KDF_KEYLEN_BYTES = 32;
export const STAFF_KDF_SALT_BYTES = 16;
export const STAFF_MAX_FAILED_ATTEMPTS = 5;
export const STAFF_LOCK_MINUTES = 5;
/** Secours (0042) — MIROIR du domaine : 8 chiffres, 5 échecs → 15 minutes. */
export const STAFF_RECOVERY_LENGTH = 8;
export const STAFF_RECOVERY_MAX_FAILED = 5;
export const STAFF_RECOVERY_LOCK_MINUTES = 15;

/** Permissions — MIROIR du domaine + CHECK 0041 (une seule origine : 0041). */
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

export function newCodeSaltHex(): string {
  return randomBytes(STAFF_KDF_SALT_BYTES).toString("hex");
}

export function pbkdf2CodeHex(code: string, saltHex: string): string {
  return pbkdf2Sync(
    code,
    Buffer.from(saltHex, "hex"),
    STAFF_KDF_ITERATIONS,
    STAFF_KDF_KEYLEN_BYTES,
    "sha256",
  ).toString("hex");
}

function verifyCodeHex(code: string, saltHex: string, expectedHex: string): boolean {
  try {
    const a = Buffer.from(pbkdf2CodeHex(code, saltHex), "hex");
    const b = Buffer.from(expectedHex, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function normalizeUsername(username: string): string {
  const u = username.trim().toLowerCase();
  if (u.length < 3 || u.length > 32 || u.includes("|") || /\s/.test(u)) {
    throw new Error("Nom d'utilisateur invalide (3 à 32 caractères, sans espace).");
  }
  return u;
}

function assertValidCode(code: string): void {
  if (!/^[0-9]{6}$/.test(code)) throw new Error("Code invalide (6 chiffres).");
}

interface StaffRow {
  id: number;
  uuid: string;
  username: string;
  display_name: string;
  role: string;
  code_hash: string;
  code_salt: string;
  code_algo: string;
  must_change_code: number;
  is_active: number;
  failed_attempts: number;
  locked_until: string | null;
  created_at: string;
}

function isLocked(lockedUntil: string | null, now: string): boolean {
  if (lockedUntil == null) return false;
  const a = Date.parse(now);
  const b = Date.parse(lockedUntil);
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error("Date invalide.");
  return b > a;
}

function auditStaff(
  eventType: string,
  entityId: string | number,
  operationId: string,
  actorUserId: number | null,
  details: unknown,
  now: string,
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at, actor_user_id)
     VALUES (?, ?, 'staff', ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    eventType,
    String(entityId),
    operationId,
    JSON.stringify(details ?? {}),
    now,
    actorUserId,
  );
}

/**
 * Bootstrap : premier gérant au premier démarrage si table vide.
 * R6 RADICAL : le code initial est ALÉATOIRE (6 chiffres, générateur
 * système) et retourné UNE fois à l'appelant (affichage unique côté
 * renderer, jamais stocké/loggé en clair) — fini `admin/admin` devinable.
 * Hash KDF moderne + must_change=1 (changement forcé) + code de secours 8
 * chiffres (hash seul en base, clair retourné UNE fois à l'appelant).
 * Compatibilité : les postes déjà installés (`legacy-admin`, code "admin")
 * continuent de fonctionner et doivent toujours changer leur code.
 * Idempotent : si des lignes existent, no-op. Jamais de secret en clair en base.
 */
export function ensureDefaultManager(now: string): {
  bootstrapped: boolean;
  recoveryCode: string | null;
  initialCode: string | null;
} {
  const db = getDb();
  const count = (db.prepare(`SELECT COUNT(*) AS c FROM staff_users`).get() as { c: number }).c;
  if (count > 0) return { bootstrapped: false, recoveryCode: null, initialCode: null };
  const salt = newCodeSaltHex();
  // Codes tirés par le générateur système (jamais Math.random).
  let initialCode = "";
  for (let i = 0; i < 6; i++) initialCode += String(randomInt(0, 10));
  let recoveryCode = "";
  for (let i = 0; i < STAFF_RECOVERY_LENGTH; i++) recoveryCode += String(randomInt(0, 10));
  const recSalt = newCodeSaltHex();
  const tx = db.transaction(() => {
    const uuid = randomUUID();
    const op = randomUUID();
    try {
      claimIdempotency(op, "staff.bootstrap", now);
    } catch {
      return { bootstrapped: false, recoveryCode: null, initialCode: null };
    }
    db.prepare(
      `INSERT INTO staff_users (uuid, username, display_name, role, code_hash, code_salt, code_algo,
        must_change_code, is_active, failed_attempts, locked_until, operation_id, created_at, updated_at)
       VALUES (?, 'admin', 'Gérant', 'manager', ?, ?, ?, 1, 1, 0, NULL, ?, ?, ?)`,
    ).run(uuid, pbkdf2CodeHex(initialCode, salt), salt, STAFF_KDF_ALGO, op, now, now);
    db.prepare(
      `INSERT INTO staff_recovery (id, code_hash, code_salt, code_algo, failed_attempts, locked_until, created_at, updated_at)
       VALUES (1, ?, ?, ?, 0, NULL, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    ).run(pbkdf2CodeHex(recoveryCode, recSalt), recSalt, STAFF_KDF_ALGO, now, now);
    auditStaff("staff.bootstrapped", uuid, op, null, { username: "admin" }, now);
    storeIdempotencyResult(op, { bootstrapped: true });
    return { bootstrapped: true, recoveryCode, initialCode };
  });
  try {
    return (
      tx as unknown as () => {
        bootstrapped: boolean;
        recoveryCode: string | null;
        initialCode: string | null;
      }
    )();
  } catch (err) {
    // Course au premier démarrage : le perdant retrouve la table peuplée.
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: staff_users\.username/i.test(err.message)
    ) {
      return { bootstrapped: false, recoveryCode: null, initialCode: null };
    }
    throw err;
  }
}

export interface StaffPublic {
  id: number;
  uuid: string;
  username: string;
  displayName: string;
  role: string;
  mustChangeCode: boolean;
  isActive: boolean;
  permissions: string[];
  /** Code de secours affiché UNE fois (bootstrap venant d'être créé). */
  recoveryCode?: string | null;
  /** Code initial affiché UNE fois (bootstrap venant d'être créé, R6). */
  initialCode?: string | null;
}

/** Liste d'affichage (sélecteur d'ouverture) : jamais de condensats.
 * Propage le code de secours ET le code initial quand le bootstrap vient de
 * les créer (clairs uniquement ici, jamais stockés) — sinon la liste appelée
 * avant le login les avalerait et les écrans uniques ne s'afficheraient jamais. */
export function listStaffUsers(now: string): {
  users: StaffPublic[];
  recoveryCode: string | null;
  initialCode: string | null;
} {
  const boot = ensureDefaultManager(now);
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, uuid, username, display_name, role, must_change_code, is_active
       FROM staff_users ORDER BY role DESC, username ASC`,
    )
    .all() as Pick<
    StaffRow,
    "id" | "uuid" | "username" | "display_name" | "role" | "must_change_code" | "is_active"
  >[];
  const users: StaffPublic[] = rows.map((r) => {
    const perms =
      r.role === "manager"
        ? [...STAFF_PERMISSIONS]
        : (
            db
              .prepare(`SELECT permission_key FROM staff_user_permissions WHERE user_id = ?`)
              .all(r.id) as { permission_key: string }[]
          ).map((p) => p.permission_key);
    return {
      id: r.id,
      uuid: r.uuid,
      username: r.username,
      displayName: r.display_name,
      role: r.role,
      mustChangeCode: r.must_change_code === 1,
      isActive: r.is_active === 1,
      permissions: perms,
    };
  });
  return {
    users,
    recoveryCode: boot.bootstrapped ? (boot.recoveryCode ?? null) : null,
    initialCode: boot.bootstrapped ? (boot.initialCode ?? null) : null,
  };
}

function getPermissions(userId: number, role: string): string[] {
  if (role === "manager") return [...STAFF_PERMISSIONS];
  const db = getDb();
  return (
    db
      .prepare(`SELECT permission_key FROM staff_user_permissions WHERE user_id = ?`)
      .all(userId) as {
      permission_key: string;
    }[]
  ).map((p) => p.permission_key);
}

function requireManager(actorUserId: number): void {
  const db = getDb();
  const actor = db
    .prepare(`SELECT role, is_active FROM staff_users WHERE id = ?`)
    .get(actorUserId) as { role: string; is_active: number } | undefined;
  if (!actor || actor.is_active !== 1 || actor.role !== "manager") {
    throw new Error("Action réservée au gérant.");
  }
}

/** Rôle effectif d'un utilisateur (null si inconnu). */
export function getStaffRole(userId: number): string | null {
  const db = getDb();
  const row = db.prepare(`SELECT role FROM staff_users WHERE id = ?`).get(userId) as
    { role: string } | undefined;
  return row?.role ?? null;
}

/** Changement de code imposé en attente (must_change_code = 1). */
export function mustChangeCode(userId: number): boolean {
  const db = getDb();
  const row = db.prepare(`SELECT must_change_code FROM staff_users WHERE id = ?`).get(userId) as
    { must_change_code: number } | undefined;
  return row?.must_change_code === 1;
}

/**
 * Gestion de l'équipe : permission `users` exigée (le gérant l'a
 * implicitement via userHasPermission). Remplace le verrou rôle-seul afin
 * qu'accorder `users` à un utilisateur ait un effet réel (ex-garde P1).
 * L'escalade reste fermée : seul un gérant peut créer un gérant, désactiver
 * un gérant ou déléguer `users` (gardes posées à chaque mutation).
 */
function requireUserManagement(actorUserId: number): void {
  if (!userHasPermission(actorUserId, "users")) {
    throw new Error("Action réservée au gérant.");
  }
}

/** Authentification : message générique, compteur + verrou anti-devinette.
 * Les écritures compteur sont des UPDATE uniques atomiques (pas de
 * lecture-modification-écriture perdue) ; elles persistent même en cas
 * d'échec (hors transaction d'authentification, volontairement). */
export function authenticateAtomic(args: {
  username: string;
  code: string;
  now: string;
}): StaffPublic {
  const boot = ensureDefaultManager(args.now);
  const db = getDb();
  const username = normalizeUsername(args.username);
  const row = db.prepare(`SELECT * FROM staff_users WHERE username = ?`).get(username) as
    StaffRow | undefined;
  // Identifiants invalides : même message que le code faux (pas d'oracle).
  if (!row || row.is_active !== 1) throw new Error("Identifiants invalides.");
  if (isLocked(row.locked_until, args.now)) {
    throw new Error("Compte verrouillé : réessayez dans quelques minutes.");
  }
  if (!verifyCodeHex(args.code, row.code_salt, row.code_hash)) {
    const next = row.failed_attempts + 1;
    const lockedUntil =
      next >= STAFF_MAX_FAILED_ATTEMPTS
        ? new Date(Date.parse(args.now) + STAFF_LOCK_MINUTES * 60_000).toISOString()
        : null;
    // Incrément atomique en une seule écriture (anti course aux devinettes).
    db.prepare(
      `UPDATE staff_users SET failed_attempts = failed_attempts + 1,
        locked_until = CASE WHEN failed_attempts + 1 >= ? THEN ? ELSE locked_until END,
        updated_at = ? WHERE id = ?`,
    ).run(STAFF_MAX_FAILED_ATTEMPTS, lockedUntil, args.now, row.id);
    throw new Error("Identifiants invalides.");
  }
  db.prepare(
    `UPDATE staff_users SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?`,
  ).run(args.now, row.id);
  return {
    id: row.id,
    uuid: row.uuid,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    mustChangeCode: row.must_change_code === 1,
    isActive: true,
    permissions: getPermissions(row.id, row.role),
    // Bootstrap à l'instant : les clairs n'existent qu'ici, jamais en base.
    recoveryCode: boot.bootstrapped ? (boot.recoveryCode ?? null) : null,
    initialCode: boot.bootstrapped ? (boot.initialCode ?? null) : null,
  };
}

/** Changement de code : l'ancien est vérifié, le nouveau est 6 chiffres. */
export function changeCodeAtomic(args: {
  userId: number;
  oldCode: string;
  newCode: string;
  operationId: string;
  now: string;
}): { changed: boolean } {
  const replay = peekIdempotency<{ changed: boolean }>(args.operationId, "staff.changeCode");
  if (replay) return replay;
  assertValidCode(args.newCode);
  const db = getDb();
  const row = db.prepare(`SELECT * FROM staff_users WHERE id = ?`).get(args.userId) as
    StaffRow | undefined;
  if (!row || row.is_active !== 1) throw new Error("Identifiants invalides.");
  if (isLocked(row.locked_until, args.now)) {
    throw new Error("Compte verrouillé : réessayez dans quelques minutes.");
  }
  if (!verifyCodeHex(args.oldCode, row.code_salt, row.code_hash)) {
    // Ancien code faux = tentative de devinette : compteur anti-brute-force
    // (même politique qu'à l'ouverture, écriture atomique persistante).
    const next = row.failed_attempts + 1;
    const lockedUntil =
      next >= STAFF_MAX_FAILED_ATTEMPTS
        ? new Date(Date.parse(args.now) + STAFF_LOCK_MINUTES * 60_000).toISOString()
        : null;
    db.prepare(
      `UPDATE staff_users SET failed_attempts = failed_attempts + 1,
        locked_until = CASE WHEN failed_attempts + 1 >= ? THEN ? ELSE locked_until END,
        updated_at = ? WHERE id = ?`,
    ).run(STAFF_MAX_FAILED_ATTEMPTS, lockedUntil, args.now, args.userId);
    throw new Error("Identifiants invalides.");
  }
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "staff.changeCode", args.now);
    const salt = newCodeSaltHex();
    db.prepare(
      `UPDATE staff_users SET code_hash = ?, code_salt = ?, code_algo = ?, must_change_code = 0,
        failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?`,
    ).run(pbkdf2CodeHex(args.newCode, salt), salt, STAFF_KDF_ALGO, args.now, args.userId);
    auditStaff("staff.codeChanged", args.userId, args.operationId, args.userId, {}, args.now);
    const result = { changed: true };
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
      const retry = peekIdempotency<{ changed: boolean }>(args.operationId, "staff.changeCode");
      if (retry) return retry;
    }
    throw err;
  }
}

/** Création par le gérant (double-submit même operationId = effet unique). */
export function createStaffUserAtomic(args: {
  actorUserId: number;
  operationId: string;
  username: string;
  displayName: string;
  role: string;
  code: string;
  now: string;
}): { id: number } {
  const replay = peekIdempotency<{ id: number }>(args.operationId, "staff.create");
  if (replay) return replay;
  requireUserManagement(args.actorUserId);
  // Anti-escalade : seul un gérant crée un gérant.
  if (getStaffRole(args.actorUserId) !== "manager" && args.role === "manager") {
    throw new Error("Seul le gérant peut créer un gérant.");
  }
  const username = normalizeUsername(args.username);
  const displayName = args.displayName.trim();
  if (displayName.length < 1 || displayName.length > 64) {
    throw new Error("Nom affiché invalide (1 à 64 caractères).");
  }
  if (args.role !== "manager" && args.role !== "user") throw new Error("Rôle invalide.");
  assertValidCode(args.code);
  const db = getDb();
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "staff.create", args.now);
    const salt = newCodeSaltHex();
    const uuid = randomUUID();
    const r = db
      .prepare(
        `INSERT INTO staff_users (uuid, username, display_name, role, code_hash, code_salt, code_algo,
          must_change_code, is_active, failed_attempts, locked_until, operation_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, 0, NULL, ?, ?, ?)`,
      )
      .run(
        uuid,
        username,
        displayName,
        args.role,
        pbkdf2CodeHex(args.code, salt),
        salt,
        STAFF_KDF_ALGO,
        args.operationId,
        args.now,
        args.now,
      );
    const result = { id: Number(r.lastInsertRowid) };
    auditStaff(
      "staff.created",
      result.id,
      args.operationId,
      args.actorUserId,
      { username, role: args.role },
      args.now,
    );
    storeIdempotencyResult(args.operationId, result);
    return result;
  });
  try {
    return tx();
  } catch (err) {
    if (err instanceof Error) {
      if (/UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)) {
        const retry = peekIdempotency<{ id: number }>(args.operationId, "staff.create");
        if (retry) return retry;
      }
      if (/UNIQUE constraint failed: staff_users\.username/i.test(err.message)) {
        throw new Error("Ce nom d'utilisateur existe déjà.", { cause: err });
      }
      if (/UNIQUE constraint failed: staff_users\.operation_id/i.test(err.message)) {
        const retry = peekIdempotency<{ id: number }>(args.operationId, "staff.create");
        if (retry) return retry;
      }
    }
    throw err;
  }
}

/** Permissions d'un utilisateur (remplacement total, gérant uniquement). */
export function setPermissionsAtomic(args: {
  actorUserId: number;
  userId: number;
  permissionKeys: string[];
  operationId: string;
  now: string;
}): { saved: boolean } {
  const replay = peekIdempotency<{ saved: boolean }>(args.operationId, "staff.setPermissions");
  if (replay) return replay;
  requireUserManagement(args.actorUserId);
  const keys = [...new Set(args.permissionKeys)];
  for (const k of keys) {
    if (!(STAFF_PERMISSIONS as readonly string[]).includes(k))
      throw new Error("Permission invalide.");
  }
  // Anti-escalade : seul un gérant délègue `users`.
  if (getStaffRole(args.actorUserId) !== "manager" && keys.includes("users")) {
    throw new Error("Seul le gérant peut déléguer la gestion des utilisateurs.");
  }
  const db = getDb();
  const target = db
    .prepare(`SELECT role, is_active FROM staff_users WHERE id = ?`)
    .get(args.userId) as { role: string; is_active: number } | undefined;
  if (!target || target.is_active !== 1) throw new Error("Utilisateur introuvable.");
  if (target.role === "manager") throw new Error("Le gérant a toutes les permissions.");
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "staff.setPermissions", args.now);
    db.prepare(`DELETE FROM staff_user_permissions WHERE user_id = ?`).run(args.userId);
    for (const k of keys) {
      db.prepare(
        `INSERT INTO staff_user_permissions (user_id, permission_key, granted_at) VALUES (?, ?, ?)`,
      ).run(args.userId, k, args.now);
    }
    auditStaff(
      "staff.permissions",
      args.userId,
      args.operationId,
      args.actorUserId,
      { keys },
      args.now,
    );
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
      const retry = peekIdempotency<{ saved: boolean }>(args.operationId, "staff.setPermissions");
      if (retry) return retry;
    }
    throw err;
  }
}

/** Activation / désactivation (jamais de suppression dure ici). */
export function setActiveAtomic(args: {
  actorUserId: number;
  userId: number;
  isActive: boolean;
  operationId: string;
  now: string;
}): { saved: boolean } {
  const replay = peekIdempotency<{ saved: boolean }>(args.operationId, "staff.setActive");
  if (replay) return replay;
  requireUserManagement(args.actorUserId);
  if (args.actorUserId === args.userId)
    throw new Error("Impossible de désactiver votre propre compte.");
  const db = getDb();
  const target = db.prepare(`SELECT id, role FROM staff_users WHERE id = ?`).get(args.userId) as
    { id: number; role: string } | undefined;
  if (!target) throw new Error("Utilisateur introuvable.");
  // Anti-escalade : seul un gérant touche au compte d'un gérant.
  if (getStaffRole(args.actorUserId) !== "manager" && target.role === "manager") {
    throw new Error("Seul le gérant peut modifier le compte d'un gérant.");
  }
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "staff.setActive", args.now);
    db.prepare(
      `UPDATE staff_users SET is_active = ?, failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?`,
    ).run(args.isActive ? 1 : 0, args.now, args.userId);
    auditStaff(
      "staff.active",
      args.userId,
      args.operationId,
      args.actorUserId,
      { isActive: args.isActive },
      args.now,
    );
    const result = { saved: true };
    storeIdempotencyResult(args.operationId, result);
    return result;
  });
  try {
    return tx();
  } catch (err) {
    if (err instanceof Error) {
      if (/UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)) {
        const retry = peekIdempotency<{ saved: boolean }>(args.operationId, "staff.setActive");
        if (retry) return retry;
      }
      if (/au moins un gérant actif/i.test(err.message)) throw err;
    }
    throw err;
  }
}

/** Réémission du secours par un gérant (le clair ne transite qu'ici).
 * Couvre aussi les bases où 0041 tournait déjà sans ligne staff_recovery. */
export function regenRecoveryAtomic(args: {
  actorUserId: number;
  operationId: string;
  now: string;
}): { recoveryCode: string } {
  const replay = peekIdempotency<{ recoveryCode: string }>(args.operationId, "staff.regenRecovery");
  if (replay) return replay;
  requireManager(args.actorUserId);
  let recoveryCode = "";
  for (let i = 0; i < STAFF_RECOVERY_LENGTH; i++) recoveryCode += String(randomInt(0, 10));
  const salt = newCodeSaltHex();
  const db = getDb();
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "staff.regenRecovery", args.now);
    db.prepare(
      `INSERT INTO staff_recovery (id, code_hash, code_salt, code_algo, failed_attempts, locked_until, created_at, updated_at)
       VALUES (1, ?, ?, ?, 0, NULL, ?, ?)
       ON CONFLICT(id) DO UPDATE SET code_hash = excluded.code_hash, code_salt = excluded.code_salt,
         code_algo = excluded.code_algo, failed_attempts = 0, locked_until = NULL, updated_at = excluded.updated_at`,
    ).run(pbkdf2CodeHex(recoveryCode, salt), salt, STAFF_KDF_ALGO, args.now, args.now);
    auditStaff("staff.recoveryRegen", 1, args.operationId, args.actorUserId, {}, args.now);
    const result = { recoveryCode };
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
      const retry = peekIdempotency<{ recoveryCode: string }>(
        args.operationId,
        "staff.regenRecovery",
      );
      if (retry) return retry;
    }
    throw err;
  }
}

/** Récupération sans session (code de secours 8 chiffres, 0042).
 * Message générique (pas d'oracle), compteur + verrou 15 min sur le secours.
 * Succès : nouveau code 6 chiffres + compteurs remis à zéro, audité. */
export function recoverAccessAtomic(args: {
  username: string;
  recoveryCode: string;
  newCode: string;
  operationId: string;
  now: string;
}): { recovered: boolean } {
  const replay = peekIdempotency<{ recovered: boolean }>(args.operationId, "staff.recover");
  if (replay) return replay;
  assertValidCode(args.newCode);
  const db = getDb();
  const username = normalizeUsername(args.username);
  const row = db.prepare(`SELECT * FROM staff_users WHERE username = ?`).get(username) as
    StaffRow | undefined;
  const rec = db.prepare(`SELECT * FROM staff_recovery WHERE id = 1`).get() as
    | {
        code_hash: string;
        code_salt: string;
        failed_attempts: number;
        locked_until: string | null;
      }
    | undefined;
  // Même message que le secours faux (pas d'oracle sur l'existence).
  if (!row || row.is_active !== 1 || !rec) throw new Error("Récupération impossible.");
  if (isLocked(rec.locked_until, args.now)) {
    throw new Error("Secours verrouillé : réessayez dans quelques minutes.");
  }
  if (!verifyCodeHex(args.recoveryCode, rec.code_salt, rec.code_hash)) {
    const next = rec.failed_attempts + 1;
    const lockedUntil =
      next >= STAFF_RECOVERY_MAX_FAILED
        ? new Date(Date.parse(args.now) + STAFF_RECOVERY_LOCK_MINUTES * 60_000).toISOString()
        : null;
    db.prepare(
      `UPDATE staff_recovery SET failed_attempts = failed_attempts + 1,
        locked_until = CASE WHEN failed_attempts + 1 >= ? THEN ? ELSE locked_until END,
        updated_at = ? WHERE id = 1`,
    ).run(STAFF_RECOVERY_MAX_FAILED, lockedUntil, args.now);
    throw new Error("Récupération impossible.");
  }
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "staff.recover", args.now);
    const salt = newCodeSaltHex();
    db.prepare(
      `UPDATE staff_users SET code_hash = ?, code_salt = ?, code_algo = ?, must_change_code = 0,
        failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?`,
    ).run(pbkdf2CodeHex(args.newCode, salt), salt, STAFF_KDF_ALGO, args.now, row.id);
    db.prepare(
      `UPDATE staff_recovery SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = 1`,
    ).run(args.now);
    auditStaff("staff.recovered", row.id, args.operationId, row.id, {}, args.now);
    const result = { recovered: true };
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
      const retry = peekIdempotency<{ recovered: boolean }>(args.operationId, "staff.recover");
      if (retry) return retry;
    }
    throw err;
  }
}

/** Permission effective (gérant = tout). */
export function userHasPermission(userId: number, key: string): boolean {
  const db = getDb();
  const row = db.prepare(`SELECT role, is_active FROM staff_users WHERE id = ?`).get(userId) as
    { role: string; is_active: number } | undefined;
  if (!row || row.is_active !== 1) return false;
  if (row.role === "manager") return true;
  const hit = db
    .prepare(`SELECT 1 AS ok FROM staff_user_permissions WHERE user_id = ? AND permission_key = ?`)
    .get(userId, key) as { ok: number } | undefined;
  return hit != null;
}
