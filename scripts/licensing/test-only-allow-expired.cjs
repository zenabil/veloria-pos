// Veloria — Licensing TEST-ONLY : contournement d'import EXPIRED.
// DANGER : persiste un état EXPIRED signature-valide (l'application, elle,
// REFUSE l'import d'une expirée). Usage STRICTEMENT réservé aux tests E2E
// (helpers.ts, flag --allow-expired + env VELORIA_E2E=1). Ne JAMAIS appeler en
// production/opération manuelle : isolé ici (hors import-local-license.cjs)
// pour que le contournement ne se mélange jamais au chemin nominal.
// CommonJS volontaire (même runtime que l'appelant).
const path = require("node:path");

function importAllowingExpired(deps, svc, text, root) {
  const protocol = require(path.join(root, "dist-electron", "licensing", "protocol.js"));
  const envelope = protocol.decodeVlic(text);
  const key = deps.getPublicKeyPem();
  const fp = deps.getFingerprint();
  const now = deps.nowMs();
  const chain = protocol.verifyLicenseChain({
    signed: envelope,
    publicKeyPem: key,
    expectedProductId: protocol.LICENSE_PRODUCT_ID,
    actualHardwareFingerprint: fp,
    nowMs: now,
  });
  if (chain !== "ACTIVE" && chain !== "EXPIRING_SOON" && chain !== "EXPIRED") {
    throw new Error(`État non importable en test : ${chain}.`);
  }
  const iso = new Date(now).toISOString();
  deps.saveState(deps.backend, {
    version: 1,
    envelope,
    hardwareFingerprint: fp,
    lastSeenUtc: iso,
    lastVerifyUtc: iso,
  });
  return svc.getLicenseStatus(deps);
}

module.exports = { importAllowingExpired };
