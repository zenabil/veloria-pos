// Veloria Licensing — Service d'orchestration (Electron main uniquement).
// Chaîne : signature → produit → hardware → horloge → dates → intégrité.
// Décisions ici (main), jamais dans le renderer. Dépendances injectées :
// les tests unitaires fournissent de fausses horloges/clés/états.

import {
  CLOCK_SKEW_TOLERANCE_MS,
  LICENSE_PRODUCT_ID,
  daysLeft,
  decodeVlic,
  hasLicensedFeature,
  hasLicensedPage,
  isDeviceBinding,
  licensedPages,
  verifyLicenseChain,
  type LicenseStanding,
  type LicenseState,
  type SignedLicense,
} from "./protocol";
import { normalizeFeatures } from "./catalog";
import type { PersistedLicenseState, SecureStoreBackend } from "./secure-state";
import { assertSecureStateIntegrity, buildSecureStateV2, standingRank } from "./secure-state";
import type { LicenseAnchor } from "./license-anchor";
import type { IntegrityVerdict } from "./integrity";

export interface LicenseStatus {
  state: LicenseState;
  /** Toujours true : l'application n'existe qu'en mode vérifié. */
  enforcementActive: boolean;
  licenseId: string | null;
  edition: string | null;
  licenseType: string | null;
  plan: string | null;
  clientId: string | null;
  clientName: string | null;
  storeName: string | null;
  maxDevices: number | null;
  deviceBinding: boolean;
  expiresAt: string | null;
  daysLeft: number | null;
  features: string[];
  pages: Record<string, boolean>;
  hardwareShort: string;
  lastVerifyUtc: string | null;
}

export interface LicenseServiceDeps {
  reportIntegrityMismatch?: (rel: string) => void;
  /** Racine applicative pour l'intégrité (outils opérateur uniquement). */
  integrityAppRoot?: string;
  nowMs: () => number;
  getPublicKeyPem: () => string;
  /**
   * LIC-04 : résout la clé de vérification à partir du `kid` de l'enveloppe.
   * Optionnelle — absente, le service retombe sur `getPublicKeyPem()` (v1).
   */
  resolveVerificationKey?: (kid: string | undefined) => {
    pem: string | null;
    kid: string | null;
    reason: string;
  };
  getFingerprint: () => string;
  formatShort: (fingerprint: string) => string;
  loadState: (backend: SecureStoreBackend) => PersistedLicenseState | null;
  saveState: (backend: SecureStoreBackend, state: PersistedLicenseState) => void;
  backend: SecureStoreBackend;
  /** H-3: ancre indépendante (optionnelle — absente en tests legacy). */
  loadAnchor?: () => LicenseAnchor | null;
  saveAnchor?: (anchor: LicenseAnchor) => void;
  verifyIntegrity: (
    publicKeyPem: string,
    isPackaged: boolean,
    report?: (rel: string) => void,
    appRootOverride?: string,
  ) => IntegrityVerdict;
  log: (level: "INFO" | "WARN" | "ERROR", event: string, data?: Record<string, unknown>) => void;
}

/** H-3: throttle des touchs lecture (60s) — pas de tempête d'écriture. */
const TOUCH_THROTTLE_MS = 60_000;
/** H-3: saut temporel anormalement grand vers le futur (log WARN, pas de blocage). */
const FUTURE_JUMP_MS = 90 * 24 * 3600 * 1000;

function loadAnchorBestEffort(deps: LicenseServiceDeps): LicenseAnchor | null {
  try {
    return deps.loadAnchor?.() ?? null;
  } catch {
    return null;
  }
}

function saveAnchorBestEffort(deps: LicenseServiceDeps, anchor: LicenseAnchor): void {
  try {
    deps.saveAnchor?.(anchor);
  } catch {
    /* best effort */
  }
}

/**
 * H-3: avance best-effort du marqueur anti-rollback + ancre (throttled).
 * Appelée sur lecture ACTIVE aussi — la consultation seule ne doit plus
 * permettre de geler l'horloge.
 */
function touchActivity(deps: LicenseServiceDeps, stored: PersistedLicenseState, now: number): void {
  try {
    const lastSeen = Date.parse(stored.lastSeenUtc);
    if (Number.isFinite(lastSeen) && now - lastSeen < TOUCH_THROTTLE_MS) return;
    const iso = new Date(now).toISOString();
    const licenseId = storedLicenseId(stored) ?? "unknown";
    const seq = (typeof stored.monotonicSeq === "number" ? stored.monotonicSeq : 0) + 1;
    const prevFirst = typeof stored.firstSeenUtc === "string" ? stored.firstSeenUtc : null;
    const prevLast = typeof stored.lastSeenUtc === "string" ? stored.lastSeenUtc : null;
    const next: PersistedLicenseState = {
      ...stored,
      version: 2,
      lastSeenUtc: iso,
      firstSeenUtc: prevFirst ?? prevLast ?? iso,
      monotonicSeq: seq,
    };
    const full = buildSecureStateV2({
      envelope: next.envelope,
      hardwareFingerprint: next.hardwareFingerprint,
      firstSeenUtc: next.firstSeenUtc as string,
      lastSeenUtc: iso,
      lastVerifyUtc: next.lastVerifyUtc,
      monotonicSeq: seq,
      maxStanding: stored.maxStanding ?? next.envelope.payload.licenseStatus ?? "active",
    });
    deps.saveState(deps.backend, full);
    // Future jump observability (long-off machine vs clock tamper: log only).
    if (Number.isFinite(lastSeen) && now - lastSeen > FUTURE_JUMP_MS) {
      deps.log("WARN", "license.time_jump", { licenseId });
    }
    saveAnchorBestEffort(deps, {
      licenseId,
      firstSeenUtc: full.firstSeenUtc as string,
      monotonicSeq: seq,
      hardwareFingerprint: full.hardwareFingerprint,
      updatedAt: iso,
    });
  } catch {
    /* état déjà classé par getLicenseStatus */
  }
}

export const LICENSE_REQUIRED_MESSAGE =
  "Fonction protégée : activez Veloria POS avec une licence valide.";
export const FEATURE_NOT_LICENSED_MESSAGE = "Cette fonction n'est pas incluse dans votre licence.";
export const PAGE_NOT_LICENSED_MESSAGE =
  "Fonction non disponible dans votre licence. Contactez votre fournisseur.";

function storedLicenseId(stored: PersistedLicenseState): string | null {
  try {
    const envelope = stored.envelope as unknown;
    if (typeof envelope !== "object" || envelope === null) return null;
    const payload = (envelope as { payload?: unknown }).payload;
    if (typeof payload !== "object" || payload === null) return null;
    const id = (payload as { licenseId?: unknown }).licenseId;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

function unauthenticated(short: string): LicenseStatus {
  return {
    state: "UNACTIVATED",
    enforcementActive: true,
    licenseId: null,
    edition: null,
    licenseType: null,
    plan: null,
    clientId: null,
    clientName: null,
    storeName: null,
    maxDevices: null,
    deviceBinding: true,
    expiresAt: null,
    daysLeft: null,
    features: [],
    pages: {},
    hardwareShort: short,
    lastVerifyUtc: null,
  };
}

/** Évaluation complète à l'instant présent (lecture seule, sans écriture). */
export function getLicenseStatus(deps: LicenseServiceDeps): LicenseStatus {
  const fp = deps.getFingerprint();
  const short = deps.formatShort(fp);
  let stored: PersistedLicenseState | null;
  try {
    stored = deps.loadState(deps.backend);
    // H-3: v2 integrity tag check (manual edit / replacement → CORRUPTED).
    if (stored) assertSecureStateIntegrity(stored);
    // #31: état v1 legacy REFUSÉ (jamais migré silencieusement : un .dat v1
    // restauré après coup est un rejeu) — réimport exigé.
    if (stored && stored.version !== 2) {
      deps.log("WARN", "license.legacy_v1_rejected", {});
      return { ...unauthenticated(short), state: "CORRUPTED_STATE" };
    }
  } catch {
    deps.log("WARN", "license.corrupted_state", {});
    return { ...unauthenticated(short), state: "CORRUPTED_STATE" };
  }
  const anchor = loadAnchorBestEffort(deps);
  // H-3 FAIL CLOSED: activated before + secure state gone = TAMPER, never
  // UNACTIVATED. (No anchor configured — e.g. legacy tests — keeps old path.)
  if (!stored) {
    if (anchor) {
      deps.log("WARN", "license.state_deleted", { licenseId: anchor.licenseId });
      return { ...unauthenticated(short), state: "TAMPER_DETECTED", licenseId: anchor.licenseId };
    }
    return unauthenticated(short);
  }
  // H-3: cross-check secure state vs anchor (old-copy replay / replacement).
  if (anchor) {
    const sid = storedLicenseId(stored);
    if (sid && sid !== anchor.licenseId) {
      deps.log("WARN", "license.state_replaced", { stored: sid, anchor: anchor.licenseId });
      return { ...unauthenticated(short), state: "TAMPER_DETECTED", licenseId: sid };
    }
    const sSeq = stored.monotonicSeq ?? 0;
    if (stored.version === 2 && sSeq < anchor.monotonicSeq) {
      deps.log("WARN", "license.state_rollback", { seq: sSeq, anchorSeq: anchor.monotonicSeq });
      return { ...unauthenticated(short), state: "TAMPER_DETECTED", licenseId: sid };
    }
  }
  let key: string;
  try {
    key = deps.getPublicKeyPem();
  } catch {
    return { ...unauthenticated(short), state: "CORRUPTED_STATE" };
  }
  // LIC-04 : la clé qui VÉRIFIE est choisie par le `kid` de l'enveloppe
  // dans le jeu de clés ; `key` (clé unique historique) reste le repli
  // pour les licences v1 (sans `kid`) et pour les installations qui
  // n'ont pas encore de `keys.json` embarqué.
  const keyResolution = deps.resolveVerificationKey
    ? deps.resolveVerificationKey(stored.envelope.kid)
    : { pem: key, kid: null, reason: "OK" as const };
  if (!keyResolution.pem) {
    deps.log("WARN", "license.key_unavailable", {
      reason: keyResolution.reason,
      kid: stored.envelope.kid ?? null,
    });
    return { ...unauthenticated(short), state: "CORRUPTED_STATE" };
  }
  const now = deps.nowMs();
  // Horloge AVANT les dates : une horloge reculée rend tout contrôle de
  // validité temporelle mensonger (rollback détecté, données préservées).
  try {
    const lastSeen = Date.parse(stored.lastSeenUtc);
    if (Number.isFinite(lastSeen) && now < lastSeen - CLOCK_SKEW_TOLERANCE_MS) {
      deps.log("WARN", "license.clock_rollback", { lastSeenUtc: stored.lastSeenUtc });
      return {
        ...unauthenticated(short),
        state: "CLOCK_ROLLBACK",
        licenseId: storedLicenseId(stored),
      };
    }
  } catch {
    return { ...unauthenticated(short), state: "CORRUPTED_STATE" };
  }
  let chain;
  try {
    chain = verifyLicenseChain({
      signed: stored.envelope,
      publicKeyPem: key,
      verificationKeyPem: keyResolution.pem,
      expectedProductId: LICENSE_PRODUCT_ID,
      actualHardwareFingerprint: fp,
      nowMs: now,
    });
  } catch {
    return { ...unauthenticated(short), state: "CORRUPTED_STATE" };
  }
  if (chain !== "ACTIVE" && chain !== "EXPIRING_SOON" && chain !== "EXPIRED") {
    if (chain === "INVALID_HARDWARE") deps.log("WARN", "license.hardware_mismatch", {});
    if (chain === "INVALID_SIGNATURE") deps.log("WARN", "license.invalid_signature", {});
    return {
      ...unauthenticated(short),
      state: chain,
      licenseId: storedLicenseId(stored),
    };
  }
  // Intégrité toujours vérifiée : aucun mode d'exécution contourné.
  const integrity = deps.verifyIntegrity(
    key,
    true,
    deps.reportIntegrityMismatch,
    deps.integrityAppRoot,
  );
  if (integrity === "tampered" || integrity === "missing") {
    deps.log("ERROR", "license.integrity_failed", { verdict: integrity });
    return { ...unauthenticated(short), state: "TAMPER_DETECTED" };
  }
  const p = stored.envelope.payload;
  // H-3: licensed READ advances the anti-rollback marker too (throttled,
  // best-effort) — read-only use must not freeze the clock.
  if (chain === "ACTIVE" || chain === "EXPIRING_SOON") {
    touchActivity(deps, stored, now);
  }
  return {
    state: chain,
    enforcementActive: true,
    licenseId: p.licenseId,
    edition: p.edition,
    licenseType: p.licenseType,
    plan: p.plan ?? null,
    clientId: p.clientId ?? null,
    clientName: p.clientName ?? null,
    storeName: p.storeName ?? null,
    maxDevices: p.maxDevices ?? null,
    deviceBinding: isDeviceBinding(p),
    expiresAt: p.expiresAt ?? null,
    daysLeft: daysLeft(p, now),
    features: normalizeFeatures(p.features),
    pages: licensedPages(p),
    hardwareShort: short,
    lastVerifyUtc: stored.lastVerifyUtc,
  };
}

/**
 * Importe un .vlic (contenu texte) : vérifie TOUTE la chaîne puis persiste
 * l'état chiffré. Ne persiste jamais un état invalide. Lève un message FR.
 */
export function importLicenseEnvelope(deps: LicenseServiceDeps, vlicText: string): LicenseStatus {
  const fp = deps.getFingerprint();
  let envelope: SignedLicense;
  try {
    envelope = decodeVlic(vlicText);
  } catch {
    deps.log("WARN", "license.import_corrupted", {});
    throw new Error("Fichier de licence illisible ou corrompu.");
  }
  const key = deps.getPublicKeyPem();
  const now = deps.nowMs();
  const chain = verifyLicenseChain({
    signed: envelope,
    publicKeyPem: key,
    expectedProductId: LICENSE_PRODUCT_ID,
    actualHardwareFingerprint: fp,
    nowMs: now,
  });
  if (chain === "INVALID_SIGNATURE") {
    deps.log("WARN", "license.import_bad_signature", {});
    throw new Error("Licence invalide : signature non reconnue.");
  }
  if (chain === "INVALID_PRODUCT")
    throw new Error("Cette licence est destinée à un autre produit.");
  if (chain === "INVALID_HARDWARE") {
    deps.log("WARN", "license.import_hardware_mismatch", {});
    throw new Error("Cette licence est associée à un autre ordinateur.");
  }
  if (chain === "EXPIRED") throw new Error("Cette licence a expiré. Demandez un renouvellement.");
  if (chain === "CORRUPTED_STATE") throw new Error("Fichier de licence illisible ou corrompu.");
  const iso = new Date(now).toISOString();
  // H-3 v2: preserve firstSeen across re-imports/renewals of the SAME license
  // (old-license replay after renewal stays detectable); new licenseId resets.
  // #31 anti-replay de standing : on mémorise la sévérité maximale vue
  // (revoked > suspended > active) ; un .vlic plus doux qu'un standing déjà
  // enregistré (ex. actif rejoué après révocation) est refusé.
  const incomingStanding: LicenseStanding = envelope.payload.licenseStatus ?? "active";
  let firstSeen = iso;
  let seq = 1;
  let maxStanding: LicenseStanding = incomingStanding;
  try {
    const prev = deps.loadState(deps.backend);
    if (prev && storedLicenseId(prev) === envelope.payload.licenseId) {
      const pFirst = typeof prev.firstSeenUtc === "string" ? prev.firstSeenUtc : null;
      const pLast = typeof prev.lastSeenUtc === "string" ? prev.lastSeenUtc : null;
      firstSeen = pFirst ?? pLast ?? iso;
      seq = (typeof prev.monotonicSeq === "number" ? prev.monotonicSeq : 0) + 1;
      const prevMax: LicenseStanding =
        prev.maxStanding ?? prev.envelope.payload.licenseStatus ?? "active";
      if (standingRank(incomingStanding) < standingRank(prevMax)) {
        deps.log("WARN", "license.import_replay", {
          licenseId: envelope.payload.licenseId,
          incoming: incomingStanding,
          recorded: prevMax,
        });
        throw new Error(
          prevMax === "revoked"
            ? "Cette licence a été révoquée. Contactez votre fournisseur."
            : "Cette licence est suspendue. Contactez votre fournisseur.",
        );
      }
      maxStanding =
        standingRank(prevMax) >= standingRank(incomingStanding) ? prevMax : incomingStanding;
    }
  } catch (err) {
    // Le refus anti-rejeu remonte tel quel (pas de fresh import silencieux).
    if (err instanceof Error && /révoquée|suspendue/.test(err.message)) throw err;
    /* fresh import */
  }
  // Révocation/suspension : on PERSISTE le standing (sinon la révocation ne
  // colle jamais et l'ancien actif reste roi), puis on lève le FR.
  if (chain === "REVOKED" || chain === "SUSPENDED") {
    const v2revoked = buildSecureStateV2({
      envelope,
      hardwareFingerprint: fp,
      firstSeenUtc: firstSeen,
      lastSeenUtc: iso,
      lastVerifyUtc: iso,
      monotonicSeq: seq,
      maxStanding,
    });
    deps.saveState(deps.backend, v2revoked);
    saveAnchorBestEffort(deps, {
      licenseId: envelope.payload.licenseId,
      firstSeenUtc: firstSeen,
      monotonicSeq: seq,
      hardwareFingerprint: fp,
      updatedAt: iso,
    });
    deps.log("WARN", chain === "REVOKED" ? "license.import_revoked" : "license.import_suspended", {
      licenseId: envelope.payload.licenseId,
    });
    throw new Error(
      chain === "REVOKED"
        ? "Cette licence a été révoquée. Contactez votre fournisseur."
        : "Cette licence est suspendue. Contactez votre fournisseur.",
    );
  }
  const integrity = deps.verifyIntegrity(
    key,
    true,
    deps.reportIntegrityMismatch,
    deps.integrityAppRoot,
  );
  if (integrity === "tampered" || integrity === "missing") {
    deps.log("ERROR", "license.import_integrity_failed", { verdict: integrity });
    throw new Error("Intégrité de l'application compromise. Réinstallez Veloria POS.");
  }
  const v2 = buildSecureStateV2({
    envelope,
    hardwareFingerprint: fp,
    firstSeenUtc: firstSeen,
    lastSeenUtc: iso,
    lastVerifyUtc: iso,
    monotonicSeq: seq,
    maxStanding,
  });
  deps.saveState(deps.backend, v2);
  saveAnchorBestEffort(deps, {
    licenseId: envelope.payload.licenseId,
    firstSeenUtc: firstSeen,
    monotonicSeq: seq,
    hardwareFingerprint: fp,
    updatedAt: iso,
  });
  deps.log("INFO", "license.activated", { licenseId: envelope.payload.licenseId });
  return getLicenseStatus(deps);
}

/** Garde des opérations protégées (mutations). Lève un message FR si bloqué. */
export function requireLicensedMutation(deps: LicenseServiceDeps, feature?: string): void {
  const st = getLicenseStatus(deps);
  if (st.state === "ACTIVE" || st.state === "EXPIRING_SOON") {
    if (feature && !st.features.includes(feature)) {
      deps.log("WARN", "license.feature_denied", { feature });
      throw new Error(FEATURE_NOT_LICENSED_MESSAGE);
    }
    return;
  }
  deps.log("WARN", "license.mutation_blocked", { state: st.state });
  if (st.state === "EXPIRED") throw new Error("Licence expirée : importez une licence renouvelée.");
  if (st.state === "REVOKED") {
    throw new Error("Cette licence a été révoquée. Contactez votre fournisseur.");
  }
  if (st.state === "SUSPENDED") {
    throw new Error("Cette licence est suspendue. Contactez votre fournisseur.");
  }
  if (st.state === "CLOCK_ROLLBACK") {
    throw new Error("Horloge système incohérente : vérifiez la date, puis réactivez.");
  }
  if (st.state === "TAMPER_DETECTED" || st.state === "CORRUPTED_STATE") {
    throw new Error("Contrôle de licence impossible : réactivez Veloria POS.");
  }
  throw new Error(LICENSE_REQUIRED_MESSAGE);
}

/** Le shell peut-il s'ouvrir (vs fenêtre d'activation bloquante) ? */
export function canOpenShell(deps: LicenseServiceDeps): boolean {
  const st = getLicenseStatus(deps);
  // EXPIRED = coquille en lecture seule (mutations gardées) ; le reste des
  // états non actifs exige la fenêtre d'activation (données préservées).
  return st.state === "ACTIVE" || st.state === "EXPIRING_SOON" || st.state === "EXPIRED";
}

/**
 * Authorization applicative (§2) : capabilities, jamais le nom du plan.
 * Renderer = confort ; main = décision (vérifiée sur le payload signé).
 */
export function hasPageAccess(deps: LicenseServiceDeps, page: string): boolean {
  const st = getLicenseStatus(deps);
  if (st.state !== "ACTIVE" && st.state !== "EXPIRING_SOON" && st.state !== "EXPIRED") {
    return false;
  }
  // Licence expirée : consultation seule (lecture), jamais d'action.
  if (st.state === "EXPIRED") return st.pages[page] === true;
  return st.pages[page] === true;
}

export function hasFeatureAccess(deps: LicenseServiceDeps, feature: string): boolean {
  const st = getLicenseStatus(deps);
  if (st.state !== "ACTIVE" && st.state !== "EXPIRING_SOON") return false;
  return st.features.includes(feature);
}

/** Garde page (routes + lectures sensibles). Lève un message FR si refusé. */
export function requireLicensedPage(deps: LicenseServiceDeps, page: string): void {
  const st = getLicenseStatus(deps);
  if (st.state !== "ACTIVE" && st.state !== "EXPIRING_SOON" && st.state !== "EXPIRED") {
    deps.log("WARN", "license.page_denied", { page, state: st.state });
    throw new Error(LICENSE_REQUIRED_MESSAGE);
  }
  let allowed: boolean;
  try {
    const stored = deps.loadState(deps.backend);
    allowed =
      stored != null &&
      (stored.envelope.payload.pages === undefined ||
        stored.envelope.payload.pages === null ||
        hasLicensedPage(stored.envelope.payload, page));
  } catch {
    throw new Error("Contrôle de licence impossible : réactivez Veloria POS.");
  }
  // Double source : statut frais + payload signé (jamais le renderer seul).
  if (!allowed || st.pages[page] !== true) {
    deps.log("WARN", "license.page_denied", { page });
    throw new Error(PAGE_NOT_LICENSED_MESSAGE);
  }
}

/** Garde feature (impression, backup, OCR, exports…). Lève un message FR. */
export function requireLicensedFeature(deps: LicenseServiceDeps, feature: string): void {
  const st = getLicenseStatus(deps);
  if (st.state === "EXPIRED") throw new Error("Licence expirée : importez une licence renouvelée.");
  if (st.state === "REVOKED") {
    throw new Error("Cette licence a été révoquée. Contactez votre fournisseur.");
  }
  if (st.state === "SUSPENDED") {
    throw new Error("Cette licence est suspendue. Contactez votre fournisseur.");
  }
  if (st.state !== "ACTIVE" && st.state !== "EXPIRING_SOON") {
    deps.log("WARN", "license.feature_denied", { feature, state: st.state });
    throw new Error(LICENSE_REQUIRED_MESSAGE);
  }
  let allowed: boolean;
  try {
    const stored = deps.loadState(deps.backend);
    allowed = stored != null && hasLicensedFeature(stored.envelope.payload, feature);
  } catch {
    throw new Error("Contrôle de licence impossible : réactivez Veloria POS.");
  }
  if (!allowed || !st.features.includes(feature)) {
    deps.log("WARN", "license.feature_denied", { feature });
    throw new Error(FEATURE_NOT_LICENSED_MESSAGE);
  }
}
