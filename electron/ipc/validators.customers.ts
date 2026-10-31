// Veloria PoS - Zod: clients + acces APK + synchro (extrait de validators.ts, deplacement pur).

import { z } from "zod";
import { moneyMinor } from "./validators.common";
import { optionalOperationId } from "./validators.common";

export const customerCreateSchema = z.object({
  operationId: z.uuid(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(30).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  creditLimitMinor: moneyMinor.default(0),
  initialBalanceMinor: moneyMinor.default(0),
  settlementDay: z.number().int().min(1).max(31).nullable().optional(),
  isBreadClient: z.boolean().default(false),
  creditAllowed: z.boolean().default(false),
  notes: z.string().max(500).nullable().optional(),
});

export const customerUpdateSchema = z.object({
  id: z.number().int().positive(),
  operationId: optionalOperationId,
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(30).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  creditLimitMinor: moneyMinor.default(0),
  creditAllowed: z.boolean().default(false),
  settlementDay: z.number().int().min(1).max(31).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const customerDebtFilterSchema = z.enum(["all", "with_debt", "no_debt", "over_limit"]);

/**
 * Import CSV clients (lot) — `prénom;nom;téléphone` (en-tête optionnel).
 * `operationId` REQUIS (idem de lot) : le même fichier rejoué rejoue le
 * compte stocké, aucune fiche en double (même règle que
 * `productsImportSchema`).
 */
export const customersImportSchema = z.object({
  operationId: z.uuid(),
  rows: z
    .array(
      z.object({
        firstName: z.string().min(1).max(100),
        lastName: z.string().min(1).max(100),
        phone: z.string().max(30).default(""),
      }),
    )
    .min(1)
    .max(5000),
});

// Tri serveur (miroir du type `CustomerSort` main + `CustomerSort` renderer) :
// whitelist fermée, jamais d'interpolation SQL brute.
export const customerSortSchema = z
  .enum(["name_asc", "name_desc", "debt_desc", "debt_asc", "purchases_desc"])
  .default("name_asc");

// P1-3 : filtre serveur « archivés seuls » (total réel côté main).
export const archivedOnlySchema = z.boolean().default(false);

// Liaison produits — fournisseurs (jonction 0015).

export const clientAccessActivateSchema = z.object({
  operationId: z.uuid(),
  customerId: z.number().int().positive(),
  phone: z.string().min(1).max(30),
  pin: z.string().regex(/^[0-9]{6}$/, { message: "Code PIN invalide (6 chiffres)." }),
});

// QR d'activation scanné par l'APK (ADR-054) : lecture seule, sans mutation.
// Mêmes bornes que buildActivationQrPayload (use-case) ; le main génère le SVG.
export const clientAccessQrSchema = z.object({
  phone: z
    .string()
    .min(1)
    .max(30)
    .refine((s) => !s.includes("|"), {
      message: "Téléphone invalide pour le QR.",
    }),
  pin: z.string().regex(/^[0-9]{6}$/, { message: "Code PIN invalide (6 chiffres)." }),
  code: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/, { message: "Code d'activation invalide." }),
});

export const syncEnqueueSchema = z.object({
  operationId: z.uuid(),
  customerId: z.number().int().positive(),
  // Union EXACTE du CHECK `sync_outbox.kind` — SOURCE AUTORITAIRE :
  // database/migrations/0032_client_access_sync.sql (immuable). Miroiée par
  // `SYNC_KINDS` (electron/ipc/handlers/client-access.repo.ts) et par le CHECK
  // de cloud/supabase/schema.sql : un kind valide en base doit toujours
  // franchir cette frontière, sinon la poussée échoue à la porte d'entrée.
  kind: z.enum([
    "customer_snapshot",
    "invoice_list",
    "payment_list",
    "invoice_detail",
    "announcement",
    "access_revocation",
  ]),
  saleId: z.number().int().positive().nullable().optional(),
  monthKey: z
    .string()
    .regex(/^\d{4}-\d{2}$/, { message: "Mois invalide (AAAA-MM)." })
    .nullable()
    .optional(),
});

// ADR-166 : création (id absent) ou mise à jour (id fourni) d'une annonce.
// Texte OU image ; l'échéance est obligatoire et doit être future (domaine).
export const announcementSaveSchema = z.object({
  operationId: z.uuid(),
  id: z.number().int().positive().nullable().optional(),
  text: z.string().max(120).nullable().optional(),
  imageUrl: z.string().max(500).nullable().optional(),
  endsAt: z.string().min(10).max(40),
  sort: z.number().int().min(0).max(99).default(0),
  isActive: z.boolean().default(true),
});

// Synchro miroir (V1) : configuration merchant + poussée manuelle.
// La clé service ne transite que sur ce pont local (jamais vers le renderer
// en lecture : getConfig la masque — voir maskConfig côté service).
export const syncConfigSchema = z.object({
  operationId: z.uuid(),
  enabled: z.boolean(),
  supabaseUrl: z.string().max(200),
  serviceKey: z.string().max(500),
  anonKey: z.string().max(500).optional().default(""),
  intervalMinutes: z.number().int().min(5).max(1440).default(15),
});

export const syncPushNowSchema = z.object({
  operationId: z.uuid(),
});

// Compte propriétaire (app mobile) : e-mail + mot de passe transmis à
// Supabase Auth. Le mot de passe reste local à cet appel (jamais persisté).
export const ownerAccountSaveSchema = z.object({
  operationId: z.uuid(),
  email: z.string().min(5).max(200),
  password: z.string().min(8).max(200),
});
