// Veloria PoS — scripts/release/update-manifest.mjs
//
// ADR-186 : construit `release/update-manifest.json`, le manifeste de mise à
// jour lu par le POS (processus principal) et par le client Android.
//
// Il est publié comme ASSET d'une release GitHub, lu ensuite à une URL FIXE :
//   https://github.com/<owner>/<repo>/releases/latest/download/update-manifest.json
// (jamais l'API GitHub : limitée à 60 requêtes/h par IP, un parc de clients
// Android la saturerait).
//
// IMPORTANT : ce script n'est PAS dans la chaîne `package:win`. Un build
// local ou une CI sans dépôt distant doit rester possible ; c'est la
// PRÉPARATION D'UNE RELEASE qui produit le manifeste.
//
// Usage :
//   VELORIA_RELEASE_BASE_URL="https://github.com/<owner>/<repo>/releases/tag/v1.0.5" \
//   node scripts/release/update-manifest.mjs
//
// L'URL de base est OBLIGATOIRE : sans elle, les liens de téléchargement
// seraient devinés (fail-closed, on ne publie pas un manifeste mensonger).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const RELEASE_DIR = path.join(process.cwd(), "release");
const MANIFEST_NAME = "update-manifest.json";
const BASE_URL_ENV = "VELORIA_RELEASE_BASE_URL";

/** Correspondance des livrables (mêmes noms que `config/electron-builder/pos.yml`). */
const ASSET_PATTERNS = [
  ["winSetup", /^Veloria-PoS-Setup-.*\.exe$/i],
  ["winPortable", /^Veloria-PoS-Portable-.*\.exe$/i],
  // APK du CLIENT (Veloria Client). L'APK du PROPRIÉTAIRE est un produit
  // distinct, avec son propre cycle de distribution : il ne doit JAMAIS être
  // confondu avec celui du client (mesuré : le tri alphabétique choisissait
  // « Veloria-Owner-…apk » comme APK du client).
  ["apk", /^Veloria-Client-.*\.apk$/i],
];

/** Sépare la page de release (…/releases/tag/vX) de l'URL de téléchargement. */
export function downloadUrlFor(releasePage, assetName) {
  return `${releasePage.replace(/\/tag\//, "/download/")}/${encodeURIComponent(assetName)}`;
}

/** Chemins RELATIFS à `release/` (POSIX), récursifs (les APK vivent dans
 *  `release/apk/`) — les dossiers techniques sont ignorés. */
export function listFilesRecursively(root, base = "") {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(path.join(root, base), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === "win-unpacked" || entry.name === "win-unpacked.tmp") continue;
      out.push(...listFilesRecursively(root, rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}

/**
 * Associe chaque livrable à sa clé de manifeste.
 * `files` : chemins RELATIFS à `release/` (POSIX), ex. `apk/client.apk`.
 * Le `name` publié est le NOM DU FICHIER seul (les assets d'une release
 * GitHub sont plats) ; le chemin relatif sert à retrouver le fichier.
 */
export function detectAssets(files) {
  const assets = {};
  for (const [key, pattern] of ASSET_PATTERNS) {
    const match = files.filter((f) => pattern.test(path.posix.basename(f))).sort();
    if (match.length > 0) assets[key] = match[match.length - 1];
  }
  return assets;
}

/** Calcule le manifeste à partir de faits déjà collectés (fonction pure). */
export function buildUpdateManifest({
  suiteVersion,
  androidVersionCode,
  releasePage,
  notes,
  assets,
}) {
  const manifest = {
    schema: 1,
    suiteVersion,
    publishedAt: new Date().toISOString(),
  };
  if (Number.isInteger(androidVersionCode) && androidVersionCode > 0) {
    manifest.androidVersionCode = androidVersionCode;
  }
  if (typeof notes === "string" && notes.trim().length > 0) {
    manifest.notes = notes.trim();
  }
  manifest.releasePage = releasePage;
  manifest.assets = {};
  for (const [key, relativePath] of Object.entries(assets)) {
    const abs = path.join(RELEASE_DIR, relativePath);
    const buffer = fs.readFileSync(abs);
    const name = path.posix.basename(relativePath);
    manifest.assets[key] = {
      name,
      sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
      size: buffer.length,
      downloadUrl: downloadUrlFor(releasePage, name),
    };
  }
  return manifest;
}

function readSuiteVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  return String(pkg.version ?? "");
}

/** `versionCode` Android (croissant, ADR-161) — absent = pas de clé. */
function readAndroidVersionCode() {
  try {
    const app = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "mobile", "app.json"), "utf8"),
    );
    const code = app?.android?.versionCode;
    return Number.isInteger(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

function readNotes() {
  const fromEnv = process.env["VELORIA_RELEASE_NOTES"];
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) return fromEnv;
  const file = path.join(RELEASE_DIR, "release-notes.txt");
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  return "";
}

export function main() {
  const releasePage = (process.env[BASE_URL_ENV] ?? "").trim();
  if (releasePage === "") {
    console.error(
      `FAIL  ${BASE_URL_ENV} manquant — URL de la release GitHub requise ` +
        `(ex. https://github.com/<owner>/<repo>/releases/tag/v1.0.5).`,
    );
    process.exit(1);
  }
  if (!releasePage.startsWith("https://")) {
    console.error(`FAIL  ${BASE_URL_ENV} doit être en https.`);
    process.exit(1);
  }
  if (!fs.existsSync(RELEASE_DIR)) {
    console.error("FAIL  dossier release/ absent — lancez d'abord `npm run package:win`.");
    process.exit(1);
  }
  const files = listFilesRecursively(RELEASE_DIR);
  const assets = detectAssets(files);
  if (Object.keys(assets).length === 0) {
    console.error("FAIL  aucun livrable (.exe/.apk) dans release/ — packagez d'abord.");
    process.exit(1);
  }
  const suiteVersion = readSuiteVersion();
  if (!/^\d+\.\d+\.\d+$/.test(suiteVersion)) {
    console.error(`FAIL  version de suite illisible : « ${suiteVersion} ».`);
    process.exit(1);
  }
  const manifest = buildUpdateManifest({
    suiteVersion,
    androidVersionCode: readAndroidVersionCode(),
    releasePage,
    notes: readNotes(),
    assets,
  });
  const out = path.join(RELEASE_DIR, MANIFEST_NAME);
  fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`OK  release/${MANIFEST_NAME} (version ${manifest.suiteVersion})`);
  for (const [key, asset] of Object.entries(manifest.assets)) {
    console.log(`    ${key} : ${asset.name} (${asset.sha256.slice(0, 12)}…)`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
