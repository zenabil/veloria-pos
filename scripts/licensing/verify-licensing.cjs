// Veloria — Licensing : vérification post-rotation de la CHAÎNE DE CLÉS
// (LECTURE SEULE, aucun effet de bord).
// Contrôle : (1) paire du dépôt cohérente, (2) resources/license/public.key
// = paire du dépôt (clé réellement embarquée dans le POS), (3) clé privée
// STOCKÉE par le Manager = paire du dépôt, (4) la licence locale (.vlic)
// vérifie contre la clé embarquée.
// Motif : incident 2026-10-17 — rotation de clé SANS ré-import dans le
// Manager → toutes les licences émises ensuite refusées par le POS
// (« Licence invalide : signature non reconnue »), et licence locale émise
// avec une clé antérieure devenue invérifiable.
// Usage : npm run verify:licensing (ou npx electron ./scripts/licensing/verify-licensing.cjs)
// CommonJS volontaire : même runtime Electron que les autres scripts licensing.
const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { createPublicKey, createHash } = require("node:crypto");

const root = process.cwd();
// Même userData que le Manager packagé (productName) : la clé stockée vit là.
app.setPath("userData", path.join(app.getPath("appData"), "Veloria License Manager"));

/** Empreinte courte d'un PEM privé (dérivée en publique) ou public. */
function keyShortHash(pem) {
  return createHash("sha256")
    .update(createPublicKey(pem).export({ type: "spki", format: "pem" }).trim())
    .digest("hex")
    .slice(0, 16);
}

/** Empreinte courte d'un fichier de clé publique (texte PEM). */
function fileShortHash(file) {
  return createHash("sha256")
    .update(fs.readFileSync(file, "utf-8").trim())
    .digest("hex")
    .slice(0, 16);
}

app.whenReady().then(() => {
  let failed = 0;
  let warned = 0;
  const ok = (m) => console.log(`OK    ${m}`);
  const warn = (m) => {
    warned++;
    console.log(`WARN  ${m}`);
  };
  const fail = (m) => {
    failed++;
    console.error(`FAIL  ${m}`);
  };

  try {
    const privPath = path.join(root, "private", "vendor-keys", "private.key");
    const repoPubPath = path.join(root, "private", "vendor-keys", "public.key");
    const embeddedPath = path.join(root, "resources", "license", "public.key");

    // 1) Paire du dépôt (source d'émission du vendor).
    let repoHash = null;
    if (fs.existsSync(privPath)) {
      try {
        repoHash = keyShortHash(fs.readFileSync(privPath, "utf-8"));
        ok(`clé privée dépôt lisible (empreinte ${repoHash})`);
      } catch {
        fail("clé privée dépôt illisible (PEM invalide)");
      }
      if (repoHash && fs.existsSync(repoPubPath)) {
        const repoPubHash = fileShortHash(repoPubPath);
        if (repoPubHash === repoHash) ok("private/vendor-keys/public.key = paire du dépôt");
        else fail(`public.key du dépôt (${repoPubHash}) ≠ clé privée (${repoHash})`);
      } else if (repoHash) {
        warn("private/vendor-keys/public.key absent");
      }
    } else {
      warn(
        "clé privée dépôt absente (private/vendor-keys/private.key) — contrôles de paire sautés",
      );
    }

    // 2) Clé embarquée dans le POS (extraResources → resourcesPath/license).
    if (fs.existsSync(embeddedPath)) {
      const embHash = fileShortHash(embeddedPath);
      if (repoHash && embHash !== repoHash) {
        fail(
          `resources/license/public.key (${embHash}) ≠ paire du dépôt (${repoHash}) — le POS livré refusera les licences émises`,
        );
      } else {
        ok(`resources/license/public.key présent (empreinte ${embHash})`);
      }
    } else {
      fail("resources/license/public.key ABSENT — le POS packagé refusera toute activation");
    }

    // 3) Clé privée stockée par le Manager (DPAPI) — le signataire réel.
    const mgrSigning = path.join(root, "dist-license-manager", "license-manager", "signing.js");
    if (!fs.existsSync(mgrSigning)) {
      warn("build Manager absent — contrôle de la clé stockée sauté (npm run build:manager)");
    } else {
      try {
        const mgr = require(mgrSigning);
        const stored = mgr.readVendorPrivateKey();
        if (!stored) {
          warn("aucune clé privée stockée par le Manager (import via l'écran Manager requis)");
        } else {
          const storedHash = keyShortHash(stored);
          if (repoHash && storedHash !== repoHash) {
            fail(
              `clé stockée Manager (${storedHash}) ≠ paire du dépôt (${repoHash}) — ré-importez la clé dans le Manager`,
            );
          } else {
            ok(`clé stockée Manager = paire du dépôt (empreinte ${storedHash})`);
          }
        }
      } catch (err) {
        warn(`lecture de la clé stockée impossible : ${err instanceof Error ? err.message : err}`);
      }
    }

    // 4) Licence locale : doit vérifier contre la clé embarquée.
    const localVlic = path.join(root, "private", "Veloria-POS-LOCAL.vlic");
    const protoPath = path.join(root, "dist-electron", "licensing", "protocol.js");
    const fpPath = path.join(
      root,
      "dist-license-manager",
      "electron",
      "licensing",
      "fingerprint.js",
    );
    if (!fs.existsSync(localVlic)) {
      warn("pas de licence locale (private/Veloria-POS-LOCAL.vlic)");
    } else if (
      !fs.existsSync(protoPath) ||
      !fs.existsSync(fpPath) ||
      !fs.existsSync(embeddedPath)
    ) {
      warn("builds/clé absents — vérification de la licence locale sautée");
    } else {
      try {
        const protocol = require(protoPath);
        const { fingerprint } = require(fpPath).getHardwareFingerprint();
        const state = protocol.verifyLicenseChain({
          signed: protocol.decodeVlic(fs.readFileSync(localVlic, "utf-8")),
          publicKeyPem: fs.readFileSync(embeddedPath, "utf-8"),
          expectedProductId: protocol.LICENSE_PRODUCT_ID,
          actualHardwareFingerprint: fingerprint,
          nowMs: Date.now(),
        });
        if (
          state === "INVALID_SIGNATURE" ||
          state === "INVALID_PRODUCT" ||
          state === "CORRUPTED_STATE"
        ) {
          fail(
            `licence locale : ${state} — ré-émettez avec la clé courante (npx electron ./scripts/licensing/issue-local-license.cjs)`,
          );
        } else if (state === "INVALID_HARDWARE") {
          warn("licence locale liée à un autre matériel (INVALID_HARDWARE)");
        } else {
          ok(`licence locale vérifiée contre la clé embarquée : ${state}`);
        }
      } catch (err) {
        fail(`licence locale illisible : ${err instanceof Error ? err.message : err}`);
      }
    }
  } catch (err) {
    fail(`erreur inattendue : ${err instanceof Error ? err.message : err}`);
  }

  console.log(
    failed === 0
      ? `VÉRIFICATION LICENSING OK (${warned} avertissement(s))`
      : `VÉRIFICATION LICENSING ÉCHEC (${failed} erreur(s))`,
  );
  app.exit(failed === 0 ? 0 : 1);
});
