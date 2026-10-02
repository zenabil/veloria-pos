// Veloria — Licensing (opérateur vendor) : émet une licence pour CE poste.
// Exécution : npx electron ./scripts/licensing/issue-local-license.cjs [--out=<dir|fichier.vlic>] [--months=<1-60>] [--features=a,b,c] [--pages=all|a,b,c]
// Utilise le VRAI code Manager (registre + signature) + VRAIE clé vendor +
// VRAIE empreinte locale. Usage : tests d'activation sur machine vendor
// UNIQUEMENT (jamais en CI/prod). Sans fenêtre (aucun BrowserWindow :
// l'UI n'est jamais créée, seul le runtime main tourne pour app paths + natif).
// P2 : --out (défaut : Bureau), --months (défaut 12), --features (DÉFAUT : liste
// ci-dessous — explicite, jamais silencieuse) + pré-contrôles dist (message FR
// clair au lieu d'une pile `require` cryptique).
// ADR-033+ : --pages (DÉFAUT : all = les 17 pages à true). OBLIGATOIRE depuis le
// cutoff LEGACY_PAGES_CUTOFF_ISO (2026-09-01) : une licence neuve SANS `pages`
// est fail-closed (tous les modules refusés). Jamais d'octroi silencieux.
// CommonJS volontaire : l'ESM suspend app.whenReady() sur ce runtime.
const { app } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = process.cwd();
const cliArgs = process.argv.slice(2);
function flagValue(name) {
  const hit = cliArgs.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}
const DEFAULT_FEATURES = ["advanced-reports", "multi-printer", "ocr"];

app.setPath("userData", path.join(app.getPath("appData"), "Veloria License Manager"));

function preflight() {
  // P2 : builds requis AVANT tout require (sinon pile cryptique).
  const needed = [
    ["dist-license-manager", path.join("license-manager", "db", "manager-db.js")],
    ["dist-license-manager", path.join("license-manager", "ipc", "licenses.js")],
    ["dist-license-manager", path.join("license-manager", "signing.js")],
    ["dist-license-manager", path.join("electron", "licensing", "fingerprint.js")],
    ["dist-electron", path.join("licensing", "protocol.js")],
    ["dist-electron", path.join("licensing", "catalog.js")],
  ];
  const missing = needed
    .map(([base, rel]) => path.join(root, base, rel))
    .filter((p) => !fs.existsSync(p));
  if (missing.length > 0) {
    console.error(
      `ÉCHEC: build manquant (${missing.length} fichier(s)). Lancez d'abord : npm run build:manager && npm run build:electron`,
    );
    process.exit(1);
  }
  const keyPath = path.join(root, "private", "vendor-keys", "private.key");
  if (!fs.existsSync(keyPath)) {
    console.error("ÉCHEC: clé privée vendor introuvable (private/vendor-keys/private.key).");
    process.exit(1);
  }
}

app.whenReady().then(() => {
  let code = 0;
  try {
    preflight();
    const { openManagerDb } = require(
      path.join(root, "dist-license-manager", "license-manager", "db", "manager-db.js"),
    );
    const { insertLicenseRecord, addMonths } = require(
      path.join(root, "dist-license-manager", "license-manager", "ipc", "licenses.js"),
    );
    const { buildSignedLicense } = require(
      path.join(root, "dist-license-manager", "license-manager", "signing.js"),
    );
    const fp = require(
      path.join(root, "dist-license-manager", "electron", "licensing", "fingerprint.js"),
    );
    const protocol = require(path.join(root, "dist-electron", "licensing", "protocol.js"));
    const catalog = require(path.join(root, "dist-electron", "licensing", "catalog.js"));

    const { fingerprint } = fp.getHardwareFingerprint();
    const priv = fs.readFileSync(path.join(root, "private", "vendor-keys", "private.key"), "utf-8");
    if (!priv.includes("PRIVATE KEY")) throw new Error("Clé vendor illisible.");
    const monthsRaw = flagValue("--months");
    const months = monthsRaw === null ? 12 : Number(monthsRaw);
    if (!Number.isInteger(months) || months < 1 || months > 60) {
      throw new Error("--months invalide (entier 1-60).");
    }
    const featuresRaw = flagValue("--features");
    const features =
      featuresRaw === null
        ? [...DEFAULT_FEATURES]
        : featuresRaw
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
    if (features.length === 0) throw new Error("--features vide (ex. --features=ocr).");
    // Capabilities pages explicites (fail-closed après le cutoff) : --pages=all
    // (défaut) ou liste restreinte --pages=sales,products,stock.
    const pagesRaw = flagValue("--pages");
    const allIds = catalog.LICENSE_PAGES;
    let pages;
    if (pagesRaw === null || pagesRaw === "all") {
      pages = Object.fromEntries(allIds.map((p) => [p, true]));
    } else {
      const wanted = pagesRaw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (wanted.length === 0) throw new Error("--pages vide (ex. --pages=sales,products).");
      for (const w of wanted) {
        if (!allIds.includes(w)) throw new Error(`--pages inconnue : ${w}.`);
      }
      pages = Object.fromEntries(allIds.map((p) => [p, wanted.includes(p)]));
    }
    const today = new Date().toISOString().slice(0, 10);
    const expires = addMonths(today, months);
    const customerRef = "Activation locale — poste vendor (démonstration)";
    const { payload, vlic } = buildSignedLicense(
      {
        customerRef,
        edition: "professional",
        licenseType: "term",
        hardwareFingerprint: fingerprint,
        startsAt: `${today}T00:00:00.000Z`,
        expiresAt: `${expires}T00:00:00.000Z`,
        features,
        pages,
      },
      priv,
    );
    const db = openManagerDb();
    const now = new Date().toISOString();
    const id = insertLicenseRecord(db, {
      licenseId: payload.licenseId,
      customerRef,
      edition: "professional",
      licenseType: "term",
      hardwareFingerprint: fingerprint,
      startsAt: `${today}T00:00:00.000Z`,
      expiresAt: `${expires}T00:00:00.000Z`,
      features,
      pages,
      envelopeVlic: vlic,
      notes: "Émise par issue-local-license.cjs (test E2E local).",
      now,
    });
    // P2 : destination explicite --out=<dir|fichier> (défaut : Bureau).
    const outRaw = flagValue("--out");
    const dest =
      outRaw !== null && outRaw.endsWith(".vlic")
        ? outRaw
        : path.join(
            outRaw ?? path.join(os.homedir(), "Desktop"),
            `Veloria-POS-${payload.licenseId}.vlic`,
          );
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, vlic, "utf-8");
    // Contre-vérification immédiate avec la CLÉ PUBLIQUE EMBARQUÉE du POS :
    const embedded = fs.readFileSync(
      path.join(root, "resources", "license", "public.key"),
      "utf-8",
    );
    const state = protocol.verifyLicenseChain({
      signed: protocol.decodeVlic(vlic),
      publicKeyPem: embedded,
      expectedProductId: protocol.LICENSE_PRODUCT_ID,
      actualHardwareFingerprint: fingerprint,
      nowMs: Date.now(),
    });
    console.log(
      JSON.stringify({ id, licenseId: payload.licenseId, file: dest, verifyEmbeddedKey: state }),
    );
    if (state !== "ACTIVE" && state !== "EXPIRING_SOON") code = 1;
  } catch (err) {
    console.error(`ÉCHEC: ${err instanceof Error ? err.message : String(err)}`);
    code = 1;
  } finally {
    try {
      const { closeManagerDb } = require(
        path.join(root, "dist-license-manager", "license-manager", "db", "manager-db.js"),
      );
      closeManagerDb();
    } catch {
      /* ignore */
    }
    app.exit(code);
  }
});
