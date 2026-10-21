// Veloria PoS - Zod: base partagee (extrait de validators.ts, deplacement pur).

import { z } from "zod";

// Duplique `isRealCalendarDate` du domaine (frontière main/domaine : pas
// d'import src/ ici pour préserver rootDir) — même règle calendaire.
// P02: parité volontaire (bissextile incluse) — toute modification doit être
// répercutée dans src/domain/common/dates.ts et ici (même algorithme).
// Exporté pour le test de parité P2 (tests/unit/main-domain-parity.test.ts).
export function isRealCalendarDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = y % 400 === 0 || (y % 4 === 0 && y % 100 !== 0);
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  return day <= dim;
}

export const businessDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => isRealCalendarDate(v), { message: "Date calendaire invalide." });

// DB-14: quantités centralisées — finies, > 0, ≤ 1M, 3 décimales max (kg/L).
// Même règle que domain/common/quantity (assertValidQuantity) : la frontière
// IPC rejette tôt au lieu de laisser FIFO arrondir silencieusement.
// ADR-114 : ce refine DOIT rester identique à assertValidQuantity (round-trip
// q ↔ Math.round(q*1000)/1000). L’ancienne formule |q*1000 − round(q*1000)|
// rejetait des quantités 3-décimales valides dès ~16 384 (erreur flottante),
// provoquant un « Échec de la vente. » opaque. Parité verrouillée par le test P2.
export const quantity = z
  .number()
  .positive()
  .max(1_000_000)
  .refine((q) => Number.isFinite(q) && Math.abs(q - Math.round(q * 1000) / 1000) <= 1e-9, {
    message: "Quantité invalide (3 décimales maximum).",
  });

// MONEY-ROOT: montants en centimes bornés (anti-overflow Number.MAX_SAFE_INTEGER
// sur prix×qté : 1e9 centimes = 10M DZD, largement au-delà du commerce de détail).
export const moneyMinor = z.number().int().min(0).max(1_000_000_000);
// A1-P0 : montants strictement positifs bornés (paiements, remboursements).
export const moneyMinorPositive = z.number().int().min(1).max(1_000_000_000);

export const optionalOperationId = z.string().uuid().nullable().optional();
// A1-P0 : quantités ≥ 0 avec 3 décimales max (même règle que `quantity`, zéro inclus
// pour stocks/dégâts/imports — rejette 1.23456 au lieu d'arrondir silencieusement).
export const quantityNonNegative = z
  .number()
  .min(0)
  .max(1_000_000)
  .refine((q) => Number.isFinite(q) && Math.abs(q - Math.round(q * 1000) / 1000) <= 1e-9, {
    message: "Quantité invalide (3 décimales maximum).",
  });

// RADICAL-FIX P0: charge vide explicite pour les lectures — jamais de `null`
// (contrat Zod uniforme, AGENTS.md §3 : toute commande passe par un schéma).
export const emptyPayloadSchema = z.object({}).strict();

// E-31 (P2) : `page` était SANS borne ⇒ `OFFSET = (page-1) * pageSize`
// devenait illimité (scan complet de la table, y compris sur le branche
// UNION à 17 tables de `history.list`). Plafond dur : 10 000 pages
// (10 000 × 200 = 2 000 000 lignes au maximum) — au-delà, l'appelant doit
// filtrer (bornes de dates) ou utiliser une recherche ciblée.
export const paginationSchema = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export const idSchema = z.object({ id: z.number().int().positive() });

export const idempotentIdSchema = z.object({
  id: z.number().int().positive(),
  operationId: z.string().uuid(),
});

// P1-6 : couche centrale anti-sans-operationId. Tout schéma ZodObject dont le
// champ `operationId` est REQUIS (ZodString nu — ni optional, ni nullable, ni
// défaut) impose un UUID d'appelant ; `handle()` refuse sans (jamais de
// génération silencieuse côté main). Les schémas optionnels/compat (ex.
// expenses.delete nullable) restent hors périmètre volontairement.
export function schemaRequiresOperationId(schema: unknown): boolean {
  let current: unknown = schema;
  for (let depth = 0; depth < 5; depth++) {
    if (current !== null && typeof current === "object" && "shape" in current) {
      const shape = (current as { shape: Record<string, unknown> }).shape;
      return shape.operationId instanceof z.ZodString;
    }
    // RADICAL-FIX (conseil llm-council) : déballe les wrappers d'effets
    // (.refine/.superRefine → ZodEffects) pour lire le shape réel — sinon un
    // schéma à operationId REQUIS mais raffiné (ex. purchaseReceiveSchema)
    // échappait au garde. ZodOptional/Nullable/Default ne sont JAMAIS déballés.
    if (current instanceof z.ZodEffects) {
      current = current.innerType();
      continue;
    }
    return false;
  }
  return false;
}
