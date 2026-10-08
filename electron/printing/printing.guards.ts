// Veloria PoS — Electron: gardes d'impression (decoupage printing.service, zero changement).
// Validation FR, garde licence, garde export PDF.

import { log } from "../services/logger";
import { prodLicenseDeps } from "../licensing/prod-deps";
import { requireLicensedFeature, requireLicensedPage } from "../licensing/license-service";

export function validationError(): { ok: false; code: string; message: string } {
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    message: "Document d'impression invalide.",
  };
}

export function isValidationError(err: unknown): boolean {
  return err instanceof Error && err.name === "ZodError";
}

export function unavailable(message: string): { ok: false; code: string; message: string } {
  return { ok: false, code: "PRINTER_UNAVAILABLE", message };
}

/**
 * Garde capabilities d'impression (§11) : vérifiée dans le main sur le
 * payload signé. Au moins une page de `pages` suffit ; `feature` requise.
 * Retourne null si autorisé, sinon un outcome FR (jamais d'exception brute).
 */
export function guardPrint(
  feature: string,
  pages: readonly string[],
): { ok: false; code: string; message: string } | null {
  try {
    const deps = prodLicenseDeps();
    let pageOk = false;
    let lastErr: unknown = null;
    for (const page of pages) {
      try {
        requireLicensedPage(deps, page);
        pageOk = true;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!pageOk) {
      throw lastErr instanceof Error
        ? lastErr
        : new Error("Fonction non disponible dans votre licence. Contactez votre fournisseur.");
    }
    requireLicensedFeature(deps, feature);
    return null;
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : "Fonction protégée : activez Veloria POS avec une licence valide.";
    const code = /n'est pas incluse/i.test(msg)
      ? "FEATURE_NOT_LICENSED"
      : /non disponible dans votre licence/i.test(msg)
        ? "PAGE_NOT_LICENSED"
        : "LICENSE_REQUIRED";
    log("WARN", "printing", "license.denied", { error: msg });
    return { ok: false, code, message: msg };
  }
}

/** Double garde export : format (papier) + `pdf-export` (capability dédiée). */
export function guardPdfExport(
  formatFeature: string,
  pages: readonly string[],
): { ok: false; code: string; message: string } | null {
  const denied = guardPrint(formatFeature, pages);
  if (denied) return denied;
  try {
    requireLicensedFeature(prodLicenseDeps(), "pdf-export");
    return null;
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Cette fonction n'est pas incluse dans votre licence.";
    log("WARN", "printing", "pdf.license_denied", { error: msg });
    return {
      ok: false,
      code: /n'est pas incluse/i.test(msg) ? "FEATURE_NOT_LICENSED" : "LICENSE_REQUIRED",
      message: msg,
    };
  }
}
