// Veloria Licensing — Protocol (framework-free, zero deps hors node:crypto).
// Partagé par POS (vérification seule) et License Manager (vérification) ;
// la SIGNATURE vit uniquement côté Manager (clé privée jamais importée ici).
//
// Format .vlic : base64url(canonicalJSON({ payload, signature }))
// signature = Ed25519(canonicalJSON(payload)) — toute mutation d'un champ
// signé (dates, hardware, edition, features...) invalide la signature.

import { createPublicKey, sign, verify } from "node:crypto";
import { LICENSE_PAGES, LICENSE_WARNING_DAYS, isLicensePage, normalizeFeatures } from "./catalog";

export const LICENSE_SCHEMA_VERSION = 1;
export const LICENSE_PRODUCT_ID = "veloria-pos";

export type LicenseType = "term" | "lifetime";
export type LicenseEdition =
  "basic" | "standard" | "professional" | "pro" | "enterprise" | "custom";
/** Plan commercial (preset d'émission, §20) — signé, informatif. */
export type LicensePlan = "BASIC" | "STANDARD" | "PRO" | "ENTERPRISE" | "CUSTOM";
/** Statut signé (révocation/suspension offline, §3/§30). */
export type LicenseStanding = "active" | "suspended" | "revoked";

export interface LicensePayload {
  schemaVersion: number;
  licenseId: string;
  productId: string;
  edition: LicenseEdition;
  licenseType: LicenseType;
  /** Empreinte SHA-256 hex (64 car.) — ignorée si deviceBinding === false. */
  hardwareFingerprint: string;
  issuedAt: string;
  startsAt: string;
  /** Requis si licenseType === "term". Absent si "lifetime". */
  expiresAt?: string;
  features: string[];
  /** Identité client (optionnelle : compatibilité ascendante). */
  clientId?: string;
  clientName?: string;
  storeName?: string;
  /** Plan preset (optionnel : anciennes licences). */
  plan?: LicensePlan;
  /** Reliure matérielle (défaut true = comportement historique). */
  deviceBinding?: boolean;
  /** Parc appareils autorisé (informatif, appliqué à l'émission). */
  maxDevices?: number;
  /** Statut signé (défaut "active"). */
  licenseStatus?: LicenseStanding;
  /** Capabilities pages (partiel = refus ; absent = tout autorisé/legacy). */
  pages?: Record<string, boolean> | null;
}

export interface SignedLicense {
  payload: LicensePayload;
  /** base64url(Ed25519 signature) */
  signature: string;
}

export type LicenseState =
  | "UNACTIVATED"
  | "ACTIVE"
  | "EXPIRING_SOON"
  | "EXPIRED"
  | "REVOKED"
  | "SUSPENDED"
  | "INVALID_SIGNATURE"
  | "INVALID_HARDWARE"
  | "INVALID_PRODUCT"
  | "TAMPER_DETECTED"
  | "CLOCK_ROLLBACK"
  | "CORRUPTED_STATE";

export const EXPIRING_SOON_DAYS = LICENSE_WARNING_DAYS;
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

/** Sérialisation canonique : clés triées récursivement, sans espaces. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    // JSON.stringify peut rendre undefined (entrée undefined/fonction) :
    // élargissement explicite pour préserver le repli "null" historique.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- JSON.stringify rend undefined pour undefined/fonction, que le type lib ignore.
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function base64UrlEncode(buf: Uint8Array | Buffer): string {
  return Buffer.from(buf).toString("base64url");
}

export function base64UrlDecode(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

/** Signature détachée d'un texte canonique (usage : manifeste d'intégrité). */
export function verifyDetachedSignature(
  canonicalText: string,
  signatureB64u: string,
  publicKeyPem: string,
): void {
  let key;
  try {
    key = createPublicKey(publicKeyPem);
  } catch {
    throw new Error("LICENSE_KEY_UNAVAILABLE");
  }
  let sig: Buffer;
  try {
    sig = base64UrlDecode(signatureB64u);
  } catch {
    throw new Error("INVALID_SIGNATURE");
  }
  const ok = verify(null, Buffer.from(canonicalText, "utf8"), key, sig);
  if (!ok) throw new Error("INVALID_SIGNATURE");
}

/** Signature détachée (MANAGER / scripts vendor uniquement). */
export function signDetached(canonicalText: string, privateKeyPem: string): string {
  return base64UrlEncode(sign(null, Buffer.from(canonicalText, "utf8"), privateKeyPem));
}

/** Vérifie la signature d'un payload (clé publique PEM SPKI). Lève si invalide. */
export function verifyPayloadSignature(
  payload: LicensePayload,
  signatureB64u: string,
  publicKeyPem: string,
): void {
  verifyDetachedSignature(canonicalJson(payload), signatureB64u, publicKeyPem);
}

/** Signe un payload (MANAGER UNIQUEMENT — clé privée PEM PKCS#8). */
export function signPayload(payload: LicensePayload, privateKeyPem: string): string {
  const data = Buffer.from(canonicalJson(payload), "utf8");
  const sig = sign(null, data, privateKeyPem);
  return base64UrlEncode(sig);
}

export function encodeVlic(signed: SignedLicense): string {
  return base64UrlEncode(Buffer.from(canonicalJson(signed), "utf8"));
}

export function decodeVlic(raw: string): SignedLicense {
  const text = raw.trim();
  if (text.length === 0 || text.length > 20000) throw new Error("CORRUPTED_STATE");
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(text, "base64url").toString("utf8"));
  } catch {
    throw new Error("CORRUPTED_STATE");
  }
  const p = (parsed ?? {}) as Record<string, unknown>;
  const payload = p["payload"] as Record<string, unknown> | undefined;
  if (!payload || typeof p["signature"] !== "string") throw new Error("CORRUPTED_STATE");
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- l'intermédiaire `unknown` est requis : l'assertion directe Record→LicensePayload est refusée par TS, et le payload vient d'un JSON adverse non typé.
  return { payload: payload as unknown as LicensePayload, signature: p["signature"] as string };
}

/** Contrôles structurels du payload (avant toute crypto). */
export function assertPayloadShape(payload: LicensePayload): void {
  if (payload.schemaVersion !== LICENSE_SCHEMA_VERSION) throw new Error("CORRUPTED_STATE");
  if (typeof payload.licenseId !== "string" || payload.licenseId.length < 8) {
    throw new Error("CORRUPTED_STATE");
  }
  if (
    !["basic", "standard", "professional", "pro", "enterprise", "custom"].includes(payload.edition)
  ) {
    throw new Error("CORRUPTED_STATE");
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- le payload vient d'un .vlic JSON adverse : les types TS ne s'appliquent pas au runtime, ce contrôle est la garde réelle.
  if (payload.licenseType !== "term" && payload.licenseType !== "lifetime") {
    throw new Error("CORRUPTED_STATE");
  }
  if (typeof payload.hardwareFingerprint !== "string" || payload.hardwareFingerprint.length < 16) {
    throw new Error("CORRUPTED_STATE");
  }
  for (const d of [payload.issuedAt, payload.startsAt]) {
    if (typeof d !== "string" || Number.isNaN(Date.parse(d))) throw new Error("CORRUPTED_STATE");
  }
  if (payload.licenseType === "term") {
    if (typeof payload.expiresAt !== "string" || Number.isNaN(Date.parse(payload.expiresAt))) {
      throw new Error("CORRUPTED_STATE");
    }
  }
  if (!Array.isArray(payload.features) || payload.features.length > 64) {
    throw new Error("CORRUPTED_STATE");
  }
  if (
    payload.plan !== undefined &&
    !["BASIC", "STANDARD", "PRO", "ENTERPRISE", "CUSTOM"].includes(payload.plan)
  ) {
    throw new Error("CORRUPTED_STATE");
  }
  if (
    payload.licenseStatus !== undefined &&
    !["active", "suspended", "revoked"].includes(payload.licenseStatus)
  ) {
    throw new Error("CORRUPTED_STATE");
  }
  if (payload.deviceBinding !== undefined && typeof payload.deviceBinding !== "boolean") {
    throw new Error("CORRUPTED_STATE");
  }
  if (
    payload.maxDevices !== undefined &&
    (!Number.isInteger(payload.maxDevices) || payload.maxDevices < 1 || payload.maxDevices > 99)
  ) {
    throw new Error("CORRUPTED_STATE");
  }
  for (const opt of [payload.clientId, payload.clientName, payload.storeName]) {
    if (opt !== undefined && (typeof opt !== "string" || opt.length > 160)) {
      throw new Error("CORRUPTED_STATE");
    }
  }
  if (payload.pages !== undefined) {
    if (
      typeof payload.pages !== "object" ||
      payload.pages === null ||
      Array.isArray(payload.pages)
    ) {
      throw new Error("CORRUPTED_STATE");
    }
    const entries = Object.entries(payload.pages);
    if (entries.length > 64) throw new Error("CORRUPTED_STATE");
    for (const [k, v] of entries) {
      if (!isLicensePage(k) || typeof v !== "boolean") throw new Error("CORRUPTED_STATE");
    }
  }
}

/**
 * Capabilities effectives (après vérification de la chaîne uniquement).
 * Licences SANS `pages` émises AVANT le cutoff : tout autorisé (compatibilité
 * ascendante, aucun client existant bloqué). Licences SANS `pages` émises
 * APRÈS le cutoff : REFUS (une licence neuve doit porter ses capabilities
 * explicites — fail closed, jamais d'octroi silencieux).
 * Le cutoff correspond au déploiement du catalogue capabilities (PHASE_4).
 */
export const LEGACY_PAGES_CUTOFF_ISO = "2026-09-01T00:00:00.000Z";

function isLegacyGrandfathered(payload: LicensePayload): boolean {
  if (payload.pages !== undefined && payload.pages !== null) return false;
  return payload.issuedAt < LEGACY_PAGES_CUTOFF_ISO;
}

export function licensedPages(payload: LicensePayload): Record<string, boolean> {
  if (payload.pages === undefined || payload.pages === null) {
    if (!isLegacyGrandfathered(payload)) {
      return Object.fromEntries(LICENSE_PAGES.map((p) => [p, false]));
    }
    return Object.fromEntries(LICENSE_PAGES.map((p) => [p, true]));
  }
  const out: Record<string, boolean> = {};
  for (const p of LICENSE_PAGES) out[p] = payload.pages[p] === true;
  return out;
}

/** Page autorisée ? (payload déjà vérifié). */
export function hasLicensedPage(payload: LicensePayload, page: string): boolean {
  if (payload.pages === undefined || payload.pages === null) {
    return isLegacyGrandfathered(payload);
  }
  return payload.pages[page] === true;
}

/** Feature autorisée ? (payload déjà vérifié, alias normalisés). */
export function hasLicensedFeature(payload: LicensePayload, feature: string): boolean {
  return normalizeFeatures(payload.features).includes(feature);
}

/** Reliure matérielle effective (défaut historique : true). */
export function isDeviceBinding(payload: LicensePayload): boolean {
  return payload.deviceBinding !== false;
}

export interface VerificationInput {
  signed: SignedLicense;
  publicKeyPem: string;
  expectedProductId: string;
  actualHardwareFingerprint: string;
  nowMs: number;
}

/**
 * Chaîne de vérification complète (ordre fixe) :
 * structure → signature → statut signé → produit → hardware → dates.
 * Ne touche ni à l'horloge système relative ni à l'intégrité binaire
 * (couches du LicenseService : clock + integrity).
 */
export function verifyLicenseChain(input: VerificationInput): LicenseState {
  const { signed, publicKeyPem, expectedProductId, actualHardwareFingerprint, nowMs } = input;
  try {
    assertPayloadShape(signed.payload);
  } catch (err) {
    return err instanceof Error && err.message === "INVALID_SIGNATURE"
      ? "INVALID_SIGNATURE"
      : "CORRUPTED_STATE";
  }
  try {
    verifyPayloadSignature(signed.payload, signed.signature, publicKeyPem);
  } catch (err) {
    return err instanceof Error && err.message === "LICENSE_KEY_UNAVAILABLE"
      ? "CORRUPTED_STATE"
      : "INVALID_SIGNATURE";
  }
  if (signed.payload.licenseStatus === "revoked") return "REVOKED";
  if (signed.payload.licenseStatus === "suspended") return "SUSPENDED";
  if (signed.payload.productId !== expectedProductId) return "INVALID_PRODUCT";
  if (
    isDeviceBinding(signed.payload) &&
    signed.payload.hardwareFingerprint.toLowerCase() !== actualHardwareFingerprint.toLowerCase()
  ) {
    return "INVALID_HARDWARE";
  }
  const p = signed.payload;
  // Note intentionnelle (revue §19) : `now < startsAt` retourne
  // INVALID_SIGNATURE (pas de nouvel état NOT_YET_VALID) pour préserver le
  // contrat à 12 états (UI labels, red-team, manager). L'utilisateur voit un
  // message FR générique, jamais le détail interne.
  if (nowMs < Date.parse(p.startsAt) - CLOCK_SKEW_TOLERANCE_MS) return "INVALID_SIGNATURE";
  if (p.licenseType === "lifetime") return "ACTIVE";
  const exp = Date.parse(p.expiresAt as string);
  if (nowMs > exp) return "EXPIRED";
  if (exp - nowMs <= EXPIRING_SOON_DAYS * 24 * 3600 * 1000) return "EXPIRING_SOON";
  return "ACTIVE";
}

/** Jours restants (lifetime → +Infini). */
export function daysLeft(payload: LicensePayload, nowMs: number): number {
  if (payload.licenseType === "lifetime") return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.ceil((Date.parse(payload.expiresAt as string) - nowMs) / 86400000));
}
