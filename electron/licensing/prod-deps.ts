// Veloria Licensing — Câblage production (Electron main).
// Point unique de construction des dépendances réelles du LicenseService.
// Les tests injectent leurs propres dépendances (jamais ce module).

import { log } from "../services/logger";
import { formatFingerprintShort, getHardwareFingerprint } from "./fingerprint";
import { getEmbeddedKeySet, getEmbeddedPublicKey } from "./public-key";
import { resolveVerificationKey } from "./key-set";
import { loadSecureState, saveSecureState, safeStorageBackend } from "./secure-state";
import { loadAnchorFromDb, saveAnchorToDb } from "./license-anchor";
import { verifyIntegrityManifest } from "./integrity";
import type { LicenseServiceDeps } from "./license-service";

/** Clé historique lue sans lever (le repli de la résolution). */
function safeEmbeddedLegacyPem(): string | null {
  try {
    return getEmbeddedPublicKey();
  } catch {
    return null;
  }
}

export function prodLicenseDeps(appRootOverride?: string): LicenseServiceDeps {
  const backend = safeStorageBackend();
  // H-3: independent anchor in business SQLite (best-effort; DB may be closed
  // in recovery — anchor then reads as null, secure-state checks still apply).
  const getDbSafe = (): {
    prepare(sql: string): { get(...p: unknown[]): unknown; run(...p: unknown[]): unknown };
  } | null => {
    try {
      // Lazy require: avoids cycle (database service never imports licensing).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getDb } = require("../database/sqlite.service") as {
        getDb: () => {
          prepare(sql: string): { get(...p: unknown[]): unknown; run(...p: unknown[]): unknown };
        };
      };
      return getDb();
    } catch {
      return null;
    }
  };
  return {
    integrityAppRoot: appRootOverride,
    nowMs: () => Date.now(),
    getPublicKeyPem: () => getEmbeddedPublicKey(),
    // LIC-04 : la clé qui vérifie est DÉSIGNÉE par le `kid` de l'enveloppe
    // dans le jeu de clés. Sans `kid` (licence v1), la clé active est
    // employée ; un `kid` inconnu est REFUSÉ (jamais « essayé » contre les
    // autres clés).
    resolveVerificationKey: (kid) =>
      resolveVerificationKey(kid, getEmbeddedKeySet(), safeEmbeddedLegacyPem()),
    getFingerprint: () => getHardwareFingerprint().fingerprint,
    formatShort: (f: string) => formatFingerprintShort(f),
    loadState: (b) => loadSecureState(b),
    saveState: (b, s) => saveSecureState(b, s),
    backend,
    loadAnchor: () => {
      const db = getDbSafe();
      if (!db) return null;
      return loadAnchorFromDb(() => db);
    },
    saveAnchor: (anchor) => {
      const db = getDbSafe();
      if (!db) return;
      saveAnchorToDb(() => db, anchor, new Date().toISOString());
    },
    verifyIntegrity: (key, packaged, report, rootOverride) =>
      verifyIntegrityManifest(
        key,
        packaged,
        (rel) => {
          try {
            report?.(rel);
          } catch {
            /* rapport best effort */
          }
          log("WARN", "license", "integrity.mismatch", { file: rel });
        },
        rootOverride ?? appRootOverride,
      ),
    log: (level, event, data) => log(level, "license", event, data),
  };
}
