// Veloria Licensing — État local sécurisé (Electron main uniquement).
// Stockage : userData/secure/license-state.dat chiffré via safeStorage
// (DPAPI sous Windows). Jamais localStorage, jamais SQLite métier, jamais clair.
// Le backend est injectable pour les tests (pas de fake en production).
//
// H-3 TAMPER-EVIDENT STATE (v2):
// - version 1 (legacy) : REFUSÉE (CORRUPTED_STATE, réimport exigé) — jamais
//   migrée silencieusement : un .dat v1 restauré après coup est un rejeu.
// - version 2 : + firstSeenUtc + monotonicSeq + integrityTag + maxStanding.
//   integrityTag = sha256(licenseId|firstSeenUtc|monotonicSeq|hardwareFingerprint)
//   (inchangé pour compat ascendante des tags v2 existants ; maxStanding est
//   couvert par le chiffrement + le cross-check séquence ancre/état).
//   Toute édition manuelle du fichier invalide le tag → CORRUPTED_STATE.
// - La suppression du fichier NE ramène PLUS à UNACTIVATED si une ancre
//   indépendante (SQLite `app_settings.license_anchor`, voir license-anchor.ts)
//   prouve une activation antérieure → TAMPER_DETECTED (fail closed).

import { app, safeStorage } from "electron";
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { LicenseStanding, SignedLicense } from "./protocol";

export interface SecureStoreBackend {
  isAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(enc: Buffer): string;
}

export function safeStorageBackend(): SecureStoreBackend {
  /* eslint-disable @typescript-eslint/no-deprecated -- API sync dépréciée en Electron 45, retirée en 46 ; migration async planifiée (ADR-155). */
  return {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encryptString: (plain: string) => safeStorage.encryptString(plain),
    decryptString: (enc: Buffer) => safeStorage.decryptString(enc),
  };
  /* eslint-enable @typescript-eslint/no-deprecated */
}

export interface PersistedLicenseState {
  version: 1 | 2;
  envelope: SignedLicense;
  hardwareFingerprint: string;
  lastSeenUtc: string;
  lastVerifyUtc: string;
  /** H-3 v2+: première activation vue (anti-rejeu de vieille licence). */
  firstSeenUtc?: string;
  /** H-3 v2+: compteur strictement croissant (rejet des copies anciennes). */
  monotonicSeq?: number;
  /** H-3 v2+: sha256(licenseId|firstSeenUtc|seq|hw). */
  integrityTag?: string;
  /**
   * Anti-rejeu de standing (#31) : sévérité maximale vue pour cette licence
   * (revoked > suspended > active). Un .vlic plus doux qu'un standing déjà
   * enregistré (ex. actif après révocation) est refusé à l'import.
   */
  maxStanding?: LicenseStanding;
}

/** Sévérité d'un standing (rejeu = standing inférieur au maximum enregistré). */
export function standingRank(s: LicenseStanding | undefined): number {
  if (s === "revoked") return 3;
  if (s === "suspended") return 2;
  return 1;
}

export function computeStateIntegrityTag(state: {
  licenseId: string;
  firstSeenUtc: string;
  monotonicSeq: number;
  hardwareFingerprint: string;
}): string {
  return createHash("sha256")
    .update(
      `${state.licenseId}|${state.firstSeenUtc}|${state.monotonicSeq}|${state.hardwareFingerprint}`,
      "utf8",
    )
    .digest("hex");
}

/** Construit un état v2 neuf (import) ou incrémenté (touch). */
export function buildSecureStateV2(args: {
  envelope: SignedLicense;
  hardwareFingerprint: string;
  firstSeenUtc: string;
  lastSeenUtc: string;
  lastVerifyUtc: string;
  monotonicSeq: number;
  maxStanding: LicenseStanding;
}): PersistedLicenseState {
  const licenseId = args.envelope.payload.licenseId;
  return {
    version: 2,
    envelope: args.envelope,
    hardwareFingerprint: args.hardwareFingerprint,
    lastSeenUtc: args.lastSeenUtc,
    lastVerifyUtc: args.lastVerifyUtc,
    firstSeenUtc: args.firstSeenUtc,
    monotonicSeq: args.monotonicSeq,
    maxStanding: args.maxStanding,
    integrityTag: computeStateIntegrityTag({
      licenseId,
      firstSeenUtc: args.firstSeenUtc,
      monotonicSeq: args.monotonicSeq,
      hardwareFingerprint: args.hardwareFingerprint,
    }),
  };
}

/** Vérifie le tag v2. Lève CORRUPTED_STATE si altéré. */
export function assertSecureStateIntegrity(state: PersistedLicenseState): void {
  if (state.version !== 2) return;
  let licenseId = "unknown";
  let firstSeenUtc = "";
  let monotonicSeq = -1;
  let hardwareFingerprint = "";
  try {
    const payload = (state.envelope as SignedLicense | null)?.payload as
      { licenseId?: unknown } | undefined;
    if (typeof payload?.licenseId === "string") licenseId = payload.licenseId;
    if (typeof state.firstSeenUtc === "string") firstSeenUtc = state.firstSeenUtc;
    if (typeof state.monotonicSeq === "number") monotonicSeq = state.monotonicSeq;
    if (typeof state.hardwareFingerprint === "string")
      hardwareFingerprint = state.hardwareFingerprint;
  } catch {
    throw new Error("CORRUPTED_STATE");
  }
  const expected = computeStateIntegrityTag({
    licenseId,
    firstSeenUtc,
    monotonicSeq,
    hardwareFingerprint,
  });
  if (state.integrityTag !== expected) throw new Error("CORRUPTED_STATE");
}

export function licenseStatePath(): string {
  return path.join(app.getPath("userData"), "secure", "license-state.dat");
}

/** null si jamais activé. Lève CORRUPTED_STATE si illisible (tamper). */
export function loadSecureState(backend: SecureStoreBackend): PersistedLicenseState | null {
  const file = licenseStatePath();
  let raw: Buffer;
  try {
    raw = fs.readFileSync(file);
  } catch {
    return null;
  }
  if (!backend.isAvailable()) throw new Error("CORRUPTED_STATE");
  let text: string;
  try {
    text = backend.decryptString(raw);
  } catch {
    throw new Error("CORRUPTED_STATE");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("CORRUPTED_STATE");
  }
  const s = (parsed ?? {}) as Record<string, unknown>;
  if (
    (s["version"] !== 1 && s["version"] !== 2) ||
    typeof s["envelope"] !== "object" ||
    s["envelope"] === null
  ) {
    throw new Error("CORRUPTED_STATE");
  }
  const state = s as unknown as PersistedLicenseState;
  // H-3: v2 tag verification (manual edits / state replacement detected).
  if (state.version === 2) assertSecureStateIntegrity(state);
  return state;
}

export function saveSecureState(backend: SecureStoreBackend, state: PersistedLicenseState): void {
  if (!backend.isAvailable()) {
    throw new Error("Stockage sécurisé indisponible sur cet ordinateur.");
  }
  fs.mkdirSync(path.dirname(licenseStatePath()), { recursive: true });
  fs.writeFileSync(licenseStatePath(), backend.encryptString(JSON.stringify(state)));
}

// W6 (audit B-02) : `clearSecureState()` supprimé — aucun flux ne l'appelait
// (l'import d'une licence ÉCRASE l'état par `saveSecureState` ; il n'existe
// pas de « forgetting » de licence dans le POS). Une fonction de suppression
// jamais appelée est un faux sentiment de sécurité : le code qui compte est
// celui qui est branché.
