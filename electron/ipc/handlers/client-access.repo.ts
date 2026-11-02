// Veloria PoS — Main-process repository: accès clients APK + file de synchro (V1).
// Activation QR/PIN (condensats SHA-256, jamais en clair), révocation,
// clichés d'affichage vers le miroir (lecture seule), annonces magasin.
// Une seule transaction par mutation ; idempotence par operationId (retry /
// double-clic rejoue le même UUID et retrouve le résultat, jamais de doublon).
// Aucune écriture financière ici : les soldes viennent des ventes/paiements.

import { createHash, pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { claimIdempotency, peekIdempotency, storeIdempotencyResult } from "./idempotency";
import { liveDebtStatus, overdueSalesSql } from "./debt-status";
import { businessMonthOf } from "../../shared/business-day";

/**
 * Union EXACTE du CHECK `sync_outbox.kind` de la migration
 * `database/migrations/0032_client_access_sync.sql` — SOURCE AUTORITAIRE
 * (immuable, jamais éditée en place). Trois miroirs de cette liste, une seule
 * origine : `syncEnqueueSchema` (electron/ipc/validators.ts) et le CHECK de
 * `cloud/supabase/schema.sql` doivent rester identiques, sinon une poussée
 * échoue sur un kind pourtant valide en base.
 */
export const SYNC_KINDS = [
  "customer_snapshot",
  "invoice_list",
  "payment_list",
  "invoice_detail",
  "announcement",
  "access_revocation",
] as const;
export type SnapshotKind = (typeof SYNC_KINDS)[number];

/**
 * Sous-ensemble pour lequel `buildSnapshotPayload` sait CONSTRUIRE un cliché.
 * `announcement` / `access_revocation` sont des kinds valides en file (0032)
 * mais sans producteur ni format de payload aujourd'hui : on refuse
 * explicitement (erreur FR) plutôt que d'insérer un cliché au corps faux.
 */
const BUILDABLE_KINDS = [
  "customer_snapshot",
  "invoice_list",
  "payment_list",
  "invoice_detail",
] as const;

/** 1 point affiché par tranche de 1000 DZD (miroir du use-case applicatif). */
const MINOR_PER_POINT = 100_000;
/** Garde-fou : aucun cliché ne dépasse 200 Ko (quota egress du miroir). */
const MAX_PAYLOAD_CHARS = 200_000;
/**
 * Bornes annonces — MIROIR du domaine (ADR-166) : le main ne peut pas importer
 * `src/domain` (tsconfig.electron rootDir). Tout écart = test contrat rouge.
 */
const ANNOUNCEMENT_ACTIVE_MAX = 4;
const ANNOUNCEMENT_TEXT_MAX = 120;
const ANNOUNCEMENT_IMAGE_MAX = 500;

const ANNOUNCEMENT_LIMIT_MESSAGE = "4 annonces actives maximum — désactivez-en une d'abord.";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Dérivation PIN lente (#39) — MIROIR du domaine
 * (`src/domain/customer/client-access.ts`, PIN_KDF_*) : mêmes paramètres que
 * la vérification Edge et le relais E2E (tout écart = test contrat rouge).
 * `phone_hash` reste SHA-256 déterministe (clé de recherche) ; seul le
 * condensat du PIN (secret humain 10^6) est durci.
 */
export const PIN_KDF_ALGO = "pbkdf2-sha256-100k";
export const PIN_KDF_ITERATIONS = 100_000;
export const PIN_KDF_KEYLEN_BYTES = 32;
export const PIN_KDF_SALT_BYTES = 16;

export function newPinSaltHex(): string {
  return randomBytes(PIN_KDF_SALT_BYTES).toString("hex");
}

export function pbkdf2PinHex(pin: string, saltHex: string): string {
  return pbkdf2Sync(
    pin,
    Buffer.from(saltHex, "hex"),
    PIN_KDF_ITERATIONS,
    PIN_KDF_KEYLEN_BYTES,
    "sha256",
  ).toString("hex");
}

/** Code QR opaque à usage unique (32 hex, dans la borne du domaine 16..128). */
export function newActivationCode(): string {
  return randomUUID().replace(/-/g, "");
}

/**
 * Charge QR d'activation (ADR-054) — MIROIR du use-case applicatif
 * `src/application/customers/client-access.ts` (le main ne peut pas importer
 * `src/`, voir tsconfig.electron `rootDir`). Toute évolution du format doit
 * changer les deux + leurs tests + le parseur APK (`mobile/src/qr.ts`).
 */
/** Préfixe V2 (ADR-068) — miroir du use-case applicatif (même format, mêmes bornes).
 *  W6 (B-03) : le préfixe V1 n'est plus produit par le main (le format V1
 *  reste lu par l'APK pour les anciens QR — voir `mobile/src/qr.ts`). */
export const ACTIVATION_QR_PREFIX_V2 = "VELORIA2";

// W6 (audit B-03) : le constructeur V1 (`buildActivationQrPayload`) est
// supprimé — le POS n'émet plus que la V2 (ADR-068) et le LECTEUR de l'APK
// (`mobile/src/qr.ts`) conserve le format V1 pour les anciens QR. Le format
// V1 reste donc LISIBLE, il n'est plus produit.

function jwtRoleOf(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = (parts[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    const obj = JSON.parse(json) as { role?: unknown };
    return typeof obj.role === "string" ? obj.role : null;
  } catch {
    return null;
  }
}

function assertValidSupabaseUrlMain(url: string): void {
  const u = url.trim();
  const isCloud = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(u);
  const isLoopback = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/?$/i.test(u);
  if ((!isCloud && !isLoopback) || u.includes("|")) {
    throw new Error("URL Supabase invalide (https://xxx.supabase.co).");
  }
}

function assertValidAnonKeyMain(key: string): void {
  const k = key.trim();
  if (k.length < 20 || k.length > 500 || !/^[A-Za-z0-9-_.=]+$/.test(k) || k.includes("|")) {
    throw new Error("Clé anon invalide.");
  }
  if (jwtRoleOf(k) === "service_role") {
    throw new Error("Clé service interdite dans le QR (anon uniquement).");
  }
}

/** Charge QR V2 (ADR-068) — miroir du use-case applicatif. */
export function buildActivationQrPayloadV2(
  supabaseUrl: string,
  anonKey: string,
  phone: string,
  pin: string,
  code: string,
): string {
  assertValidSupabaseUrlMain(supabaseUrl);
  assertValidAnonKeyMain(anonKey);
  const p = phone.trim();
  if (p.length < 1 || p.length > 30 || p.includes("|")) {
    throw new Error("Téléphone invalide pour le QR (1 à 30 caractères, sans |).");
  }
  if (!/^[0-9]{6}$/.test(pin)) throw new Error("Code PIN invalide (6 chiffres).");
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(code)) throw new Error("Code d'activation invalide.");
  return `${ACTIVATION_QR_PREFIX_V2}|${supabaseUrl.trim()}|${anonKey.trim()}|${p}|${pin}|${code}`;
}

/**
 * SVG N&B du QR d'activation (ADR-054) — même moteur `qrcode` que l'impression.
 * Lecture seule, meilleur effort : échec → "" (le renderer garde le code texte).
 * Le PIN transite ici en clair sur le pont local uniquement (jamais stocké/loggé).
 */
export function buildActivationQrSvg(payload: string): string {
  // V2 (ADR-068) ~350 caractères : plafond 800, seuil inchangé sinon.
  if (typeof payload !== "string" || payload.length < 1 || payload.length > 800) return "";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("qrcode") as {
      create?: (
        text: string,
        opts?: unknown,
      ) => {
        modules: { size: number; get: (r: number, c: number) => boolean };
      };
    };
    if (typeof mod.create !== "function") return "";
    const qr = mod.create(payload, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    const cell = 5;
    const size = n * cell;
    let rects = "";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.modules.get(r, c)) {
          rects += `<rect x="${c * cell}" y="${r * cell}" width="${cell}" height="${cell}" fill="#000"/>`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="160" height="160" role="img" aria-label="QR activation"><rect width="${size}" height="${size}" fill="#fff"/>${rects}</svg>`;
  } catch {
    return "";
  }
}

function requireLiveCustomer(customerId: number): {
  id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  credit_limit_minor: number;
  outstanding_balance_minor: number;
  debt_status: string;
  is_over_limit: number;
  settlement_day: number | null;
} {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, first_name, last_name, phone, credit_limit_minor, outstanding_balance_minor, debt_status, is_over_limit, settlement_day,
        (CASE WHEN outstanding_balance_minor > 0 AND ${overdueSalesSql("id")} THEN 1 ELSE 0 END) AS has_overdue_sale
       FROM customers WHERE id = ? AND deleted_at IS NULL`,
    )
    .get(customerId) as
    | {
        id: number;
        first_name: string;
        last_name: string;
        phone: string | null;
        credit_limit_minor: number;
        outstanding_balance_minor: number;
        debt_status: string;
        is_over_limit: number;
        settlement_day: number | null;
        has_overdue_sale: number;
      }
    | undefined;
  if (!row) throw new Error("Client introuvable.");
  // E-30 : le statut « en retard » est recalculé à la lecture (l'échéance
  // expire avec le temps, sans mouvement en base) — l'APK affiche ainsi
  // « En retard » au bon moment (mobile/src/tokens.ts).
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    phone: row.phone,
    credit_limit_minor: row.credit_limit_minor,
    outstanding_balance_minor: row.outstanding_balance_minor,
    debt_status: liveDebtStatus(row.debt_status, row.has_overdue_sale === 1),
    is_over_limit: row.is_over_limit,
    settlement_day: row.settlement_day,
  };
}

export function activateClientAccessAtomic(args: {
  operationId: string;
  customerId: number;
  phone: string;
  pin: string;
  now: string;
}): { activated: boolean; activationCode: string } {
  const db = getDb();
  const replay = peekIdempotency<{ activated: boolean; activationCode: string }>(
    args.operationId,
    "customers.accessActivate",
  );
  if (replay) return replay;
  requireLiveCustomer(args.customerId);
  const activationCode = newActivationCode();
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "customers.accessActivate", args.now);
    // Remplacement : une seule identité active par client (nouveau PIN/QR à
    // chaque activation, compteur remis à zéro, révocation levée).
    db.prepare(`DELETE FROM customer_access WHERE customer_id = ?`).run(args.customerId);
    const phoneHash = sha256Hex(args.phone.trim());
    // Réutilisation de numéro : la fonction Edge cherche par CONDENSAT ; deux
    // clients ACTIFS sur le même numéro lui renverraient 2 lignes → échec
    // fermé des deux connexions (PIN correct ou non). Le garde-fou vit ICI,
    // dans la transaction, AVANT l'insert (message FR explicite), avec en
    // complément l'index unique partiel de la migration 0034.
    // Seules les lignes ACTIVES bloquent : 0034 impose « un seul accès ACTIF
    // par numéro » et veut qu'une ligne RÉVOQUÉE conserve son condensat pour
    // traçage SANS bloquer personne (SIM recyclée → nouveau client accepté ;
    // l'Edge lit la ligne active d'abord). Bloquer aussi les révoquées
    // condamnerait à jamais un numéro attribué une fois.
    // Le DELETE ci-dessus a retiré les lignes du MÊME client : le replay
    // idempotent (retry/double-clic) ne trouve donc jamais « un autre client »
    // et s'en sort comme avant. Échec → rollback complet (DELETE annulée).
    const reused = db
      .prepare(
        `SELECT customer_id FROM customer_access WHERE phone_hash = ? AND customer_id <> ? AND revoked_at IS NULL`,
      )
      .get(phoneHash, args.customerId) as { customer_id: number } | undefined;
    if (reused) {
      throw new Error("Ce numéro de téléphone est déjà activé pour un autre client.");
    }
    // #39 : PIN durci (PBKDF2 + sel par client). phone_hash reste SHA-256
    // déterministe (clé de recherche) ; pin_hash = dérivation lente.
    const pinSalt = newPinSaltHex();
    db.prepare(
      `INSERT INTO customer_access (customer_id, phone_hash, pin_hash, pin_salt, pin_algo, qr_secret_hash, revoked_at, failed_attempts, locked_until, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 0, NULL, ?, ?)`,
    ).run(
      args.customerId,
      phoneHash,
      pbkdf2PinHex(args.pin, pinSalt),
      pinSalt,
      PIN_KDF_ALGO,
      sha256Hex(activationCode),
      args.now,
      args.now,
    );
    const result = { activated: true, activationCode };
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
      const retry = peekIdempotency<{ activated: boolean; activationCode: string }>(
        args.operationId,
        "customers.accessActivate",
      );
      if (retry) return retry;
    }
    throw err;
  }
}

export function revokeClientAccessAtomic(args: {
  customerId: number;
  operationId: string;
  now: string;
}): { revoked: boolean } {
  const db = getDb();
  const replay = peekIdempotency<{ revoked: boolean }>(args.operationId, "customers.accessRevoke");
  if (replay) return replay;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "customers.accessRevoke", args.now);
    // Idempotent par valeur : déjà révoqué = no-op (jamais d'erreur au retry).
    db.prepare(
      `UPDATE customer_access SET revoked_at = ?, updated_at = ? WHERE customer_id = ?`,
    ).run(args.now, args.now, args.customerId);
    const result = { revoked: true };
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
      const retry = peekIdempotency<{ revoked: boolean }>(
        args.operationId,
        "customers.accessRevoke",
      );
      if (retry) return retry;
    }
    throw err;
  }
}

/** État d'accès (lecture) : jamais de condensats exposés au renderer. */
export function getClientAccessStatus(customerId: number): {
  active: boolean;
  revokedAt: string | null;
  failedAttempts: number;
  lockedUntil: string | null;
} {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT revoked_at, failed_attempts, locked_until FROM customer_access WHERE customer_id = ?`,
    )
    .get(customerId) as
    { revoked_at: string | null; failed_attempts: number; locked_until: string | null } | undefined;
  if (!row) return { active: false, revokedAt: null, failedAttempts: 0, lockedUntil: null };
  return {
    active: row.revoked_at == null,
    revokedAt: row.revoked_at,
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until,
  };
}

interface SaleRow {
  id: number;
  invoice_number: string;
  total_minor: number;
  amount_paid_minor: number;
  remaining_balance_minor: number;
  payment_status: string;
  is_cancelled: number;
  created_at: string;
}

interface PaymentRow {
  id: number;
  amount_minor: number;
  method: string;
  reference: string | null;
  sale_id: number | null;
  payment_date: string;
}

/** Cadence de poussée choisie dans POS (5–1440 min), 15 par défaut. */
function currentSyncIntervalMinutes(): number {
  try {
    const row = getDb()
      .prepare(`SELECT value_json FROM app_settings WHERE key = 'client_sync'`)
      .get() as { value_json: string } | undefined;
    if (!row) return 15;
    const doc = JSON.parse(row.value_json) as { intervalMinutes?: unknown };
    const n = doc.intervalMinutes;
    return typeof n === "number" && Number.isInteger(n) && n >= 5 && n <= 1440 ? n : 15;
  } catch {
    return 15;
  }
}

/** Cliché JSON poussé vers le miroir (même forme que le use-case applicatif). */
export function buildSnapshotPayload(
  customerId: number,
  kind: SnapshotKind,
  saleId: number | null,
  monthKey: string,
  now: string,
): string {
  // Garde AVANT toute lecture : kind valide en file (0032) mais sans build →
  // refus explicite, jamais un cliché au corps faux.
  if (!(BUILDABLE_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Aucun producteur de cliché pour « ${kind} ».`);
  }
  const db = getDb();
  const customer = requireLiveCustomer(customerId);
  const sales = db
    .prepare(
      `SELECT id, invoice_number, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, is_cancelled, created_at
       FROM sales WHERE customer_id = ? ORDER BY id DESC LIMIT 500`,
    )
    .all(customerId) as SaleRow[];
  const payments = db
    .prepare(
      `SELECT id, amount_minor, method, reference, sale_id, payment_date
       FROM sale_payments WHERE customer_id = ? ORDER BY id DESC LIMIT 500`,
    )
    .all(customerId) as PaymentRow[];
  const announcements = db
    .prepare(
      `SELECT id, text, image_url AS imageUrl, ends_at AS endsAt
       FROM announcements
       WHERE is_active = 1 AND (ends_at IS NULL OR ends_at > ?)
       ORDER BY sort ASC, id DESC
       LIMIT ?`,
    )
    .all(now, ANNOUNCEMENT_ACTIVE_MAX) as {
    id: number;
    text: string | null;
    imageUrl: string | null;
    endsAt: string | null;
  }[];
  const company = db
    .prepare(
      `SELECT commercial_name, company_name, phone, address FROM company_profile WHERE id = 1`,
    )
    .get() as
    | {
        commercial_name: string | null;
        company_name: string;
        phone: string | null;
        address: string | null;
      }
    | undefined;

  const base = {
    customer: {
      id: customer.id,
      first_name: customer.first_name,
      last_name: customer.last_name,
      phone: customer.phone,
      credit_limit_minor: customer.credit_limit_minor,
      outstanding_balance_minor: customer.outstanding_balance_minor,
      debt_status: customer.debt_status,
      is_over_limit: customer.is_over_limit,
      settlement_day: customer.settlement_day,
    },
    syncedAt: now,
    // L'APK historique (≤ 1.0.4) ne lit que ce champ texte : il reste servi
    // avec le premier texte disponible ; les clients à jour lisent le tableau.
    announcement: announcements.find((a) => a.text != null && a.text !== "")?.text ?? null,
    announcements,
    syncIntervalMinutes: currentSyncIntervalMinutes(),
    shop: {
      name: company?.commercial_name || company?.company_name || "Veloria",
      phone: company?.phone ?? null,
      address: company?.address ?? null,
    },
  };

  // Factures actives : sommes/mois/Top calculés hors annulées ; la liste
  // complète (avec `is_cancelled`) part vers le miroir pour le filtre APK.
  const live = sales.filter((s) => s.is_cancelled !== 1);
  let body: Record<string, unknown>;
  if (kind === "invoice_list") {
    body = { sales };
  } else if (kind === "payment_list") {
    body = { payments };
  } else if (kind === "invoice_detail") {
    if (saleId == null) throw new Error("Facture requise pour le détail.");
    const sale = live.find((s) => s.id === saleId);
    if (!sale) throw new Error("Cette facture appartient à un autre client ou est annulée.");
    const items = db
      .prepare(
        `SELECT product_name_snapshot, quantity, unit_price_minor, line_total_minor
         FROM sale_items WHERE sale_id = ? ORDER BY id ASC LIMIT 200`,
      )
      .all(saleId);
    body = { sale, items };
  } else {
    // E-35 : le mois des clichés est le MOIS MÉTIER (Africa/Algiers) ;
    // `payment_date` porte déjà une date métier.
    const monthSales = live.filter((s) => businessMonthOf(s.created_at) === monthKey);
    const monthPayments = payments.filter((p) => p.payment_date.slice(0, 7) === monthKey);
    const totalPurchases = live.reduce((a, s) => a + s.total_minor, 0);
    const itemRows = db
      .prepare(
        `SELECT si.product_name_snapshot, si.quantity, si.unit_price_minor
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.customer_id = ? AND s.is_cancelled = 0 ORDER BY si.sale_id DESC LIMIT 2000`,
      )
      .all(customerId) as {
      product_name_snapshot: string;
      quantity: number;
      unit_price_minor: number;
    }[];
    const grouped = new Map<string, { quantity: number; lastPriceMinor: number }>();
    for (const it of itemRows) {
      const name = it.product_name_snapshot.trim();
      if (!name) continue;
      const prev = grouped.get(name);
      grouped.set(name, {
        quantity: (prev?.quantity ?? 0) + it.quantity,
        lastPriceMinor: it.unit_price_minor,
      });
    }
    const topProducts = [...grouped.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
    body = {
      monthKey,
      monthPurchasesMinor: monthSales.reduce((a, s) => a + s.total_minor, 0),
      monthPaymentsMinor: monthPayments.reduce((a, p) => a + p.amount_minor, 0),
      loyaltyPoints: Math.floor(totalPurchases / MINOR_PER_POINT),
      invoiceCount: live.length,
      totalPurchasesMinor: totalPurchases,
      lastSaleAt: live.length > 0 ? (live[0]?.created_at ?? null) : null,
      lastSales: live.slice(0, 3),
      lastPayments: payments.slice(0, 3),
      topProducts,
    };
  }
  const json = JSON.stringify({ ...base, kind, ...body });
  if (json.length > MAX_PAYLOAD_CHARS) {
    throw new Error("Cliché trop volumineux pour le miroir.");
  }
  return json;
}

/**
 * Un cliché ne part que pour un accès mobile ACTIF : le miroir exige une
 * ligne `client_access` (FK `client_payloads.customer_id`). Sans cette garde,
 * une vente à un client non activé mettait toute la poussée en échec (409).
 */
export function hasActiveClientAccess(customerId: number): boolean {
  const row = getDb()
    .prepare(`SELECT 1 AS ok FROM customer_access WHERE customer_id = ? AND revoked_at IS NULL`)
    .get(customerId) as { ok: number } | undefined;
  return row != null;
}

export function enqueueSnapshotAtomic(args: {
  operationId: string;
  customerId: number;
  kind: SnapshotKind;
  saleId?: number | null;
  monthKey?: string | null;
  now: string;
}): { queued: boolean; existed: boolean } {
  const db = getDb();
  const existing = db
    .prepare(`SELECT id FROM sync_outbox WHERE operation_id = ?`)
    .get(args.operationId) as { id: number } | undefined;
  if (existing) return { queued: true, existed: true };
  requireLiveCustomer(args.customerId);
  if (!hasActiveClientAccess(args.customerId)) {
    throw new Error("Application mobile non activée pour ce client.");
  }
  if (!(SYNC_KINDS as readonly string[]).includes(args.kind)) {
    throw new Error("Type de cliché invalide.");
  }
  const month = args.monthKey ?? businessMonthOf(args.now);
  const payload = buildSnapshotPayload(
    args.customerId,
    args.kind,
    args.saleId ?? null,
    month,
    args.now,
  );
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO sync_outbox (operation_id, customer_id, kind, payload_json, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)`,
    ).run(args.operationId, args.customerId, args.kind, payload, args.now);
  });
  try {
    tx();
    return { queued: true, existed: false };
  } catch (err) {
    // Course concurrent : le gagnant a inséré, le perdant retrouve la file.
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: sync_outbox\.operation_id/i.test(err.message)
    ) {
      return { queued: true, existed: true };
    }
    throw err;
  }
}

/** Annonce telle que gérée dans Paramètres (lecture seule côté renderer). */
export interface AnnouncementView {
  id: number;
  text: string | null;
  imageUrl: string | null;
  isActive: boolean;
  endsAt: string | null;
  sort: number;
  createdAt: string;
  updatedAt: string | null;
}

/**
 * Liste COMPLÈTE (actives, inactives, expirées) pour l'écran Paramètres.
 * L'APK ne reçoit que les actives non expirées via `buildSnapshotPayload`.
 */
export function listAnnouncements(): AnnouncementView[] {
  const rows = getDb()
    .prepare(
      `SELECT id, text, image_url, is_active, ends_at, sort, created_at, updated_at
       FROM announcements
       ORDER BY is_active DESC, sort ASC, id DESC`,
    )
    .all() as {
    id: number;
    text: string | null;
    image_url: string | null;
    is_active: number;
    ends_at: string | null;
    sort: number;
    created_at: string;
    updated_at: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    imageUrl: r.image_url,
    isActive: r.is_active === 1,
    endsAt: r.ends_at,
    sort: r.sort,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

function normalizeAnnouncementInput(args: {
  text: string | null;
  imageUrl: string | null;
  endsAt: string;
  now: string;
}): { text: string | null; imageUrl: string | null; endsAt: string } {
  const text = args.text?.trim() ?? "";
  const imageUrl = args.imageUrl?.trim() ?? "";
  if (text === "" && imageUrl === "") {
    throw new Error("Annonce invalide (texte ou image requis).");
  }
  if (text !== "" && (text.length < 1 || text.length > ANNOUNCEMENT_TEXT_MAX)) {
    throw new Error("Annonce invalide (1 à 120 caractères).");
  }
  if (
    imageUrl !== "" &&
    (imageUrl.length > ANNOUNCEMENT_IMAGE_MAX || !/^https:\/\/\S+$/i.test(imageUrl))
  ) {
    throw new Error("Lien d'image invalide (https, 500 caractères max).");
  }
  const ends = Date.parse(args.endsAt);
  const now = Date.parse(args.now);
  if (!Number.isFinite(ends) || !Number.isFinite(now)) {
    throw new Error("Date de fin d'annonce invalide.");
  }
  if (ends <= now) {
    throw new Error("La date de fin doit être dans le futur.");
  }
  return {
    text: text === "" ? null : text,
    imageUrl: imageUrl === "" ? null : imageUrl,
    endsAt: new Date(ends).toISOString(),
  };
}

function countLiveAnnouncements(now: string, excludeId: number | null): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM announcements
       WHERE is_active = 1 AND (ends_at IS NULL OR ends_at > ?)
         AND (? IS NULL OR id <> ?)`,
    )
    .get(now, excludeId, excludeId) as { n: number };
  return row.n;
}

/**
 * Création OU mise à jour (id fourni) — une seule opération idempotente.
 * Plafond ADR-166 vérifié DANS la transaction : 4 annonces actives non
 * expirées maximum ; expirées/inactives ne comptent pas.
 */
export function saveAnnouncementAtomic(args: {
  operationId: string;
  id?: number | null;
  text: string | null;
  imageUrl: string | null;
  endsAt: string;
  sort: number;
  isActive: boolean;
  now: string;
}): { announcementId: number } {
  const db = getDb();
  const replay = peekIdempotency<{ announcementId: number }>(
    args.operationId,
    "announcements.save",
  );
  if (replay) return replay;
  const clean = normalizeAnnouncementInput(args);
  const sort = Number.isInteger(args.sort) && args.sort >= 0 && args.sort <= 99 ? args.sort : 0;
  const active = args.isActive ? 1 : 0;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "announcements.save", args.now);
    if (args.id != null) {
      const exists = db.prepare(`SELECT id FROM announcements WHERE id = ?`).get(args.id) as
        { id: number } | undefined;
      if (!exists) throw new Error("Annonce introuvable.");
      if (args.isActive && countLiveAnnouncements(args.now, args.id) >= ANNOUNCEMENT_ACTIVE_MAX) {
        throw new Error(ANNOUNCEMENT_LIMIT_MESSAGE);
      }
      db.prepare(
        `UPDATE announcements SET text = ?, image_url = ?, is_active = ?, ends_at = ?, sort = ?, updated_at = ? WHERE id = ?`,
      ).run(clean.text, clean.imageUrl, active, clean.endsAt, sort, args.now, args.id);
      const result = { announcementId: args.id };
      storeIdempotencyResult(args.operationId, result);
      return result;
    }
    if (args.isActive && countLiveAnnouncements(args.now, null) >= ANNOUNCEMENT_ACTIVE_MAX) {
      throw new Error(ANNOUNCEMENT_LIMIT_MESSAGE);
    }
    const r = db
      .prepare(
        `INSERT INTO announcements (text, image_url, is_active, ends_at, sort, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(clean.text, clean.imageUrl, active, clean.endsAt, sort, args.now, args.now);
    const result = { announcementId: Number(r.lastInsertRowid) };
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
      const retry = peekIdempotency<{ announcementId: number }>(
        args.operationId,
        "announcements.save",
      );
      if (retry) return retry;
    }
    throw err;
  }
}

/** Suppression idempotente par valeur : déjà supprimée = succès au retry. */
export function removeAnnouncementAtomic(args: { id: number; operationId: string; now: string }): {
  removed: boolean;
} {
  const db = getDb();
  const replay = peekIdempotency<{ removed: boolean }>(args.operationId, "announcements.remove");
  if (replay) return replay;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "announcements.remove", args.now);
    db.prepare(`DELETE FROM announcements WHERE id = ?`).run(args.id);
    const result = { removed: true };
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
      const retry = peekIdempotency<{ removed: boolean }>(args.operationId, "announcements.remove");
      if (retry) return retry;
    }
    throw err;
  }
}
