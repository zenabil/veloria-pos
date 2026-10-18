// Veloria — Rôles internes : règles pures du domaine + frontière Zod.
// Code 6 chiffres, verrou 5 échecs / 5 min, permissions gérant = tout.

import { describe, expect, it } from "vitest";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  STAFF_LOCK_MINUTES,
  STAFF_MAX_FAILED_ATTEMPTS,
  STAFF_PERMISSIONS,
  assertValidCode,
  assertValidPermission,
  assertValidRole,
  assertValidUsername,
  hasPermission,
  isLocked,
  nextFailedState,
} from "../../src/domain/staff/staff";
import {
  staffChangeCodeSchema,
  staffCreateSchema,
  staffLoginSchema,
  staffRecoverSchema,
  staffRegenRecoverySchema,
  staffSetActiveSchema,
  staffSetPermissionsSchema,
} from "../../electron/ipc/validators";
import { STAFF_RECOVERY_LENGTH, assertValidRecoveryCode } from "../../src/domain/staff/staff";

const OP = "123e4567-e89b-12d3-a456-426614174000";
const ROOT = process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("domaine staff", () => {
  it("code 6 chiffres strict", () => {
    expect(() => assertValidCode("123456")).not.toThrow();
    for (const bad of ["12345", "1234567", "12345a", "admin", "", "12 456"]) {
      expect(() => assertValidCode(bad)).toThrow();
    }
  });
  it("nom normalisé minuscule, sans espace", () => {
    expect(assertValidUsername("  Karim ")).toBe("karim");
    expect(() => assertValidUsername("ab")).toThrow();
    expect(() => assertValidUsername("a b")).toThrow();
    expect(() => assertValidUsername("a|b")).toThrow();
  });
  it("rôle et permission fermés (union 0041)", () => {
    expect(assertValidRole("manager")).toBe("manager");
    expect(() => assertValidRole("super")).toThrow();
    expect(STAFF_PERMISSIONS).toHaveLength(10);
    expect(() => assertValidPermission("sales")).not.toThrow();
    expect(() => assertValidPermission("root")).toThrow();
  });
  it("verrou au 5e échec pour 5 minutes", () => {
    const now = "2026-10-13T10:00:00.000Z";
    expect(nextFailedState(3, now)).toEqual({ failedAttempts: 4, lockedUntilISO: null });
    const s5 = nextFailedState(4, now);
    expect(s5.failedAttempts).toBe(STAFF_MAX_FAILED_ATTEMPTS);
    expect(isLocked(s5.lockedUntilISO, now)).toBe(true);
    const after = new Date(Date.parse(now) + STAFF_LOCK_MINUTES * 60_000 + 1000).toISOString();
    expect(isLocked(s5.lockedUntilISO, after)).toBe(false);
  });
  it("gérant = tout, utilisateur = accordé uniquement", () => {
    expect(hasPermission("manager", [], "sales")).toBe(true);
    expect(hasPermission("user", ["sales"], "sales")).toBe(true);
    expect(hasPermission("user", ["sales"], "settings")).toBe(false);
  });
});

describe("validateurs IPC staff", () => {
  it("login : username + code requis", () => {
    expect(staffLoginSchema.safeParse({ username: "karim", code: "123456" }).success).toBe(true);
    expect(staffLoginSchema.safeParse({ username: "ab", code: "123456" }).success).toBe(false);
  });
  it("mutations : operationId UUID requis (P1-6)", () => {
    const base = {
      operationId: OP,
      username: "karim",
      displayName: "Karim",
      role: "user" as const,
      code: "123456",
    };
    expect(staffCreateSchema.safeParse(base).success).toBe(true);
    expect(staffCreateSchema.safeParse({ ...base, operationId: "nope" }).success).toBe(false);
    expect(staffCreateSchema.safeParse({ ...base, code: "admin" }).success).toBe(false);
    expect(
      staffChangeCodeSchema.safeParse({ operationId: OP, oldCode: "admin", newCode: "654321" })
        .success,
    ).toBe(true);
    expect(
      staffSetPermissionsSchema.safeParse({
        operationId: OP,
        userId: 2,
        permissionKeys: ["sales", "nope"],
      }).success,
    ).toBe(false);
    expect(
      staffSetActiveSchema.safeParse({ operationId: OP, userId: 2, isActive: true }).success,
    ).toBe(true);
    expect(
      staffRecoverSchema.safeParse({
        operationId: OP,
        username: "karim",
        recoveryCode: "12345678",
        newCode: "654321",
      }).success,
    ).toBe(true);
    expect(
      staffRecoverSchema.safeParse({
        operationId: OP,
        username: "karim",
        recoveryCode: "123456",
        newCode: "654321",
      }).success,
    ).toBe(false);
    expect(staffRegenRecoverySchema.safeParse({ operationId: OP }).success).toBe(true);
    expect(staffRegenRecoverySchema.safeParse({ operationId: "nope" }).success).toBe(false);
  });
});

describe("secours 0042", () => {
  it("8 chiffres stricts", () => {
    expect(STAFF_RECOVERY_LENGTH).toBe(8);
    expect(() => assertValidRecoveryCode("12345678")).not.toThrow();
    for (const bad of ["1234567", "123456789", "1234567a", ""]) {
      expect(() => assertValidRecoveryCode(bad)).toThrow();
    }
  });
});

describe("KDF staff : parité main/domaine (miroir #39)", () => {
  it("repo main : mêmes itérations + clé + identifiant d'algorithme", () => {
    const src = read("electron/ipc/handlers/staff.repo.ts");
    expect(src).toContain("STAFF_KDF_ITERATIONS = 100_000");
    expect(src).toContain("STAFF_KDF_KEYLEN_BYTES = 32");
    expect(src).toContain('STAFF_KDF_ALGO = "pbkdf2-sha256-100k"');
  });

  it("déterministe, sel unique, faux code rejeté", () => {
    const derive = (code: string, saltHex: string): string =>
      pbkdf2Sync(code, Buffer.from(saltHex, "hex"), 100_000, 32, "sha256").toString("hex");
    const saltA = randomBytes(16).toString("hex");
    const saltB = randomBytes(16).toString("hex");
    expect(saltA).not.toBe(saltB);
    expect(derive("123456", saltA)).toBe(derive("123456", saltA));
    expect(derive("123456", saltA)).not.toBe(derive("123456", saltB));
    expect(derive("123456", saltA)).not.toBe(derive("654321", saltA));
    expect(derive("123456", saltA)).toHaveLength(64);
  });
});

describe("gardes staff : carte canaux → permissions (décision main)", () => {
  it("canaux sensibles mappés, secours et remise couverts", () => {
    const gates = read("electron/ipc/staff-gates.ts");
    for (const entry of [
      '["sales.create"]]: "sales"',
      '["sales.cancel"]]: "cancel"',
      '["stock.adjust"]]: "stock"',
      '["customers.recordPayment"]]: "debts"',
      '["expenses.create"]]: "expenses"',
      '["returns.create"]]: "returns"',
      '["closings.create"]]: "closings"',
      '["settings.save"]]: "settings"',
      '["staff.create"]]: "users"',
      // Matrice complète (ADR-087) : toutes les mutations mappées.
      '["products.create"]]: "stock"',
      '["products.import"]]: "stock"',
      '["suppliers.pay"]]: "stock"',
      '["purchase.receive"]]: "stock"',
      '["customers.create"]]: "debts"',
      '["proformas.convert"]]: "sales"',
      '["backup.restore"]]: "settings"',
      '["database.reset"]]: "settings"',
      '["announcements.save"]]: "settings"',
    ]) {
      expect(gates.includes(entry), `garde manquante: ${entry}`).toBe(true);
    }
    expect(gates.includes('["staff.regenRecovery"]]: "users"'), "garde manquante regen").toBe(true);
    // Couverture totale : chacune des 10 clés protège au moins un canal
    // (discount via la règle payload saleHasDiscount, vérifiée ci-dessous).
    for (const key of [
      "sales",
      "stock",
      "debts",
      "expenses",
      "returns",
      "closings",
      "settings",
      "users",
      "cancel",
    ]) {
      expect(gates.includes(`]: "${key}"`), `permission sans canal: ${key}`).toBe(true);
    }
    // Remise dans les lignes (P0-7) : permission dédiée exigée.
    expect(gates).toContain("saleHasDiscount");
    expect(gates).toContain('"discount"');
    // Authentification et secours : jamais verrouillés par une session.
    expect(gates).not.toContain("staff.login");
    expect(gates).not.toContain("staff.recover");
  });
});
