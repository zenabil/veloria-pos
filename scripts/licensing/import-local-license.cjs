// Veloria — Licensing (opérateur vendor) : importe un .vlic dans l'état RÉEL
// du POS (userData Veloria PoS, DPAPI) puis affiche le statut vérifié.
// Exécution : npx electron ./scripts/licensing/import-local-license.cjs <fichier.vlic>
// Flag --allow-expired (tests E2E uniquement) : persiste aussi un état EXPIRED
// signature-valide (l'application, elle, refuse l'import d'une expirée).
// P2 : le contournement vit dans test-only-allow-expired.cjs (isolé, jamais
// dans le chemin nominal) et exige env VELORIA_E2E=1 (helpers.ts E2E).
// Même code que l'application (license-service + secure-state), sans GUI.
// CommonJS volontaire : l'ESM suspend app.whenReady() sur ce runtime.
const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const args = process.argv.slice(2);
const userDataFlag = args.find((a) => a.startsWith("--user-data-dir="));
const allowExpired = args.includes("--allow-expired");
const file = args.find((a) => !a.startsWith("--"));
if (!file || !file.endsWith(".vlic")) {
  console.error(
    "Usage: import-local-license.cjs <fichier.vlic> [--user-data-dir=<dir>] [--allow-expired]",
  );
  process.exit(1);
}
// P2 : le contournement EXPIRED n'existe qu'en E2E (jamais en manuel/prod).
if (allowExpired && process.env.VELORIA_E2E !== "1") {
  console.error("ÉCHEC: --allow-expired exige l'environnement de test (VELORIA_E2E=1).");
  process.exit(1);
}

app.setPath(
  "userData",
  userDataFlag
    ? userDataFlag.slice("--user-data-dir=".length)
    : path.join(app.getPath("appData"), "Veloria PoS"),
);

app.whenReady().then(() => {
  let code = 0;
  try {
    const { prodLicenseDeps } = require(
      path.join(root, "dist-electron", "licensing", "prod-deps.js"),
    );
    const svc = require(path.join(root, "dist-electron", "licensing", "license-service.js"));
    // Racine explicite : getAppPath() pointerait le dossier du script.
    const deps = prodLicenseDeps(process.cwd());
    const text = fs.readFileSync(file, "utf-8");
    const imported = allowExpired
      ? require("./test-only-allow-expired.cjs").importAllowingExpired(deps, svc, text, root)
      : svc.importLicenseEnvelope(deps, text);
    const status = svc.getLicenseStatus(deps);
    console.log(
      JSON.stringify({
        importState: imported.state,
        status: {
          state: status.state,
          licenseId: status.licenseId,
          edition: status.edition,
          licenseType: status.licenseType,
          expiresAt: status.expiresAt,
          daysLeft: status.daysLeft,
          features: status.features,
        },
      }),
    );
    if (status.state !== "ACTIVE" && status.state !== "EXPIRING_SOON") code = 1;
  } catch (err) {
    console.error(`ÉCHEC: ${err instanceof Error ? err.message : String(err)}`);
    code = 1;
  } finally {
    // app.exit (et non quit) : propage le code (quit sort toujours 0).
    app.exit(code);
  }
});
