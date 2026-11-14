// Veloria PoS — scripts/release/verify-artifact.js
//
// Porte de PUBLICATION (fail-closed) : un livrable ne peut être publié que
// s'il satisfait TOUTES les conditions ci-dessous. Elle est appelée après
// electron-builder et après `release:checksums`.
//
// Ce que la porte refuse (et pourquoi) :
//   1. SIGNATURE ABSENTE  — un binaire non signé déclenche SmartScreen et est
//      bloqué par la politique Mark-of-the-Web sur les postes gérés. Publier
//      un tel binaire est un risque commercial ET un risque de confiance.
//      La porte le REFUSE (fail-closed), avec une instruction claire.
//
//   2. EMPREINTE PÉRIMÉE  — le SHA256SUMS.txt doit correspondre au fichier
//      réellement produit. Un manifeste qui désigne un autre build (mesuré
//      le 2026-11-07 sur les APK) est pire que pas de manifeste.
//
//   3. RÉVISION ABSENTE   — le binaire doit porter la révision source : sans
//      elle, un rapport de support n'est pas traçable.
//
// L'exception `VELORIA_ALLOW_UNSIGNED=1` existe pour les constructions de
// TEST internes (développement, CI d'intégration) : elle n'autorise que le
// point 1 (signature), jamais les points 2 et 3. Un artefact de test reste
// ainsi MANIFESTÉ et TRAÇABLE.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const releaseDir = path.join(root, "release");
const allowUnsigned = process.env["VELORIA_ALLOW_UNSIGNED"] === "1";

function fail(message) {
  console.error(`RELEASE-VERIFY ÉCHEC : ${message}`);
  process.exit(1);
}

if (!fs.existsSync(releaseDir)) fail("dossier release/ absent — empaquetez d'abord.");

// Les livrables produits par electron-builder (les .exe) et les APK.
const DELIVERABLE_EXT = /\.(exe|apk)$/i;
const artifacts = fs
  .readdirSync(releaseDir)
  .filter((f) => DELIVERABLE_EXT.test(f))
  .sort();
if (artifacts.length === 0) fail("aucun .exe/.apk dans release/ — empaquetez d'abord.");

// --- 2. Empreinte : le manifeste DOIT correspondre au fichier produit ------
const manifestPath = path.join(releaseDir, "SHA256SUMS.txt");
if (!fs.existsSync(manifestPath)) {
  fail("release/SHA256SUMS.txt absent — lancez `npm run release:checksums`.");
}
const manifest = new Map(
  fs
    .readFileSync(manifestPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      const m = line.match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
      return m ? [m[2].trim(), m[1].toLowerCase()] : null;
    })
    .filter(Boolean),
);

const results = [];
for (const f of artifacts) {
  const expected = manifest.get(f);
  if (!expected) {
    fail(`${f} : absent de release/SHA256SUMS.txt — régénérez le manifeste.`);
  }
  const actual = crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(releaseDir, f)))
    .digest("hex");
  if (actual !== expected) {
    fail(
      `${f} : empreinte PÉRIMÉE (manifeste ${expected.slice(0, 16)}…, fichier ${actual.slice(0, 16)}…) — régénérez le manifeste.`,
    );
  }
  results.push({ file: f, sha256: actual });
}

// --- 3. Révision source dans le binaire --------------------------------------
// electron-builder `buildMetadata` écrit app/build-info.json dans extraResources.
function readBuildInfo() {
  const candidates = [
    path.join(releaseDir, "win-unpacked", "resources", "build-info.json"),
    path.join(releaseDir, "win-unpacked", "resources", "app", "build-info.json"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        return JSON.parse(fs.readFileSync(c, "utf8"));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const buildInfo = readBuildInfo();
if (!buildInfo) {
  fail(
    "build-info.json absent de l'artefact (release/win-unpacked/resources/) — la révision source n'est pas tracable.",
  );
}
if (typeof buildInfo["commit"] !== "string" || buildInfo["commit"].length < 7) {
  fail("build-info.json sans commit exploitable — la révision source n'est pas tracable.");
}
if (typeof buildInfo["version"] !== "string" || buildInfo["version"].length === 0) {
  fail("build-info.json sans version.");
}

// --- 1. Signature Authenticode ------------------------------------------------
const unsigned = [];
for (const f of artifacts) {
  if (!f.toLowerCase().endsWith(".exe")) continue; // les APK ne sont pas signés Authenticode
  let status = "Unknown";
  try {
    const out = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `(Get-AuthenticodeSignature -LiteralPath '${path.join(releaseDir, f).replace(/'/g, "''")}').Status`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    status = out.trim();
  } catch {
    status = "Unknown";
  }
  if (status !== "Valid") unsigned.push(`${f} (${status})`);
}

if (unsigned.length > 0) {
  if (allowUnsigned) {
    console.log(
      `WARN RELEASE-VERIFY : ${unsigned.length} livrable(s) NON signé(s) — ACCEPTÉ (VELORIA_ALLOW_UNSIGNED=1, build de TEST) : ${unsigned.join(", ")}`,
    );
  } else {
    fail(
      `livrable(s) non signé(s) : ${unsigned.join(", ")}. ` +
        "Publier un binaire non signé déclenche SmartScreen et est bloqué par la politique Mark-of-the-Web sur les postes gérés. " +
        "Configurez CSC_LINK / CSC_KEY_PASSWORD (certificat Authenticode) OU, pour un build de TEST interne uniquement, lancez avec VELORIA_ALLOW_UNSIGNED=1.",
    );
  }
}

// --- Verdict ------------------------------------------------------------------
console.log(`OK  release-verify (${artifacts.length} livrable(s) vérifiés) :`);
for (const r of results) {
  console.log(`    ${r.sha256.slice(0, 16)}…  ${r.file}`);
}
console.log(`    version=${buildInfo["version"]} commit=${String(buildInfo["commit"]).slice(0, 12)}`);
if (unsigned.length > 0) console.log(`    ATTENTION : ${unsigned.length} non signé(s) (build de TEST).`);
