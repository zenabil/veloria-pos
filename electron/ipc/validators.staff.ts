// Veloria PoS - Zod: rôles internes gérant / utilisateur (0041).
// Login/logout/session : pas d'operationId (auth, pas de mutation rejouable).
// Toutes les mutations exigent operationId UUID (retry = rejouement, P1-6).

import { z } from "zod";

export const staffLoginSchema = z.object({
  username: z.string().min(3).max(32),
  code: z.string().min(1).max(64),
});

export const staffCreateSchema = z.object({
  operationId: z.string().uuid(),
  username: z.string().min(3).max(32),
  displayName: z.string().min(1).max(64),
  role: z.enum(["manager", "user"]),
  code: z.string().regex(/^[0-9]{6}$/, { message: "Code invalide (6 chiffres)." }),
});

export const staffChangeCodeSchema = z.object({
  operationId: z.string().uuid(),
  oldCode: z.string().min(1).max(64),
  newCode: z.string().regex(/^[0-9]{6}$/, { message: "Code invalide (6 chiffres)." }),
});

export const staffSetPermissionsSchema = z.object({
  operationId: z.string().uuid(),
  userId: z.number().int().positive(),
  permissionKeys: z
    .array(
      z.enum([
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
      ]),
    )
    .max(10),
});

export const staffSetActiveSchema = z.object({
  operationId: z.string().uuid(),
  userId: z.number().int().positive(),
  isActive: z.boolean(),
});

export const staffRecoverSchema = z.object({
  operationId: z.string().uuid(),
  username: z.string().min(3).max(32),
  recoveryCode: z
    .string()
    .regex(/^[0-9]{8}$/, { message: "Code de secours invalide (8 chiffres)." }),
  newCode: z.string().regex(/^[0-9]{6}$/, { message: "Code invalide (6 chiffres)." }),
});

export const staffRegenRecoverySchema = z.object({
  operationId: z.string().uuid(),
});
