// Veloria — version unique de la suite (POS, License Manager, Client Android).
// Source de vérité : package.json racine (electron-builder l'embarque dans les
// deux installateurs ; le client Android suit via app.json + build.gradle).
//
// Usage :
//   node scripts/release/version.mjs check
//   node scripts/release/version.mjs set 1.0.4 [--code 6]
//
// `set` refuse toute versionCode Android non strictement croissante : Android
// n'installe pas une mise à jour dont le code régresse. La version POS/Manager
// reste le package.json racine (même numéro pour les deux installateurs).
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const ROOT_PKG = path.join(root, "package.json");
const ROOT_LOCK = path.join(root, "package-lock.json");
const MOBILE_PKG = path.join(root, "mobile", "package.json");
const MOBILE_LOCK = path.join(root, "mobile", "package-lock.json");
const MOBILE_APP = path.join(root, "mobile", "app.json");
const MOBILE_GRADLE = path.join(root, "mobile", "android", "app", "build.gradle");
const MOBILE_APP_TSX = path.join(root, "mobile", "src", "App.tsx");
// E-55 — l'app PROPRIÉTAIRE était hors de la porte de version : elle restait à
// 0.1.0 pendant que la suite sortait en 1.0.4 (écart consigné §99/§102, jamais
// fermé). Elle devient cible, comme le client.
const OWNER_PKG = path.join(root, "owner", "package.json");
const OWNER_LOCK = path.join(root, "owner", "package-lock.json");
const OWNER_APP = path.join(root, "owner", "app.json");
const OWNER_GRADLE = path.join(root, "owner", "android", "app", "build.gradle");

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

function fail(message) {
  console.error(`ÉCHEC  ${message}`);
  process.exit(1);
}

function versionCodeOf(gradle) {
  const m = /versionCode\s+(\d+)/.exec(gradle);
  if (!m) fail("versionCode introuvable dans mobile/android/app/build.gradle");
  return Number(m[1]);
}

function versionNameOf(gradle) {
  const m = /versionName\s+"([^"]+)"/.exec(gradle);
  if (!m) fail("versionName introuvable dans mobile/android/app/build.gradle");
  return m[1];
}

function appVersionLiteralOf(source) {
  // ADR-186 : la version du bundle client est la CONSTANTE `APP_VERSION`
  // (source unique : l'écran Compte et la détection de mise à jour lisent la
  // même valeur). Elle remplace l'ancien littéral `appVersion="…"` en JSX.
  const m = /const APP_VERSION = "([^"]*)"/.exec(source);
  if (!m) fail("const APP_VERSION introuvable dans mobile/src/App.tsx");
  return m[1];
}

/**
 * Toutes les cibles qui doivent porter le même numéro.
 *
 * E-56 — les `android/`客户端 et propriétaire sont 100 % gitignorés (`.gitignore`
 * « Expo local (jamais committé) ») : `version:check` les lisait SANS
 * condition, donc un clone propre plantait sur `ENOENT` avec une stack Node
 * nue — la chaîne `verify` (et donc la CI) était rouge PAR CONSTRUCTION, et
 * personne ne le savait faute de dépôt distant. Le fichier est désormais
 * OPTIONNEL : présent (poste vendor) il est exigé ; absent, il est déclaré
 * explicitement ignoré — jamais silencieusement, jamais en crash.
 */
function gradleTargets(file, label) {
  if (!fs.existsSync(file)) {
    console.log(`SKIP ${label} : ${path.relative(root, file)} non versionné (poste vendor seul)`);
    return { name: null, code: null };
  }
  const gradle = fs.readFileSync(file, "utf-8");
  return { name: versionNameOf(gradle), code: versionCodeOf(gradle) };
}

function snapshot() {
  const mobileGradle = gradleTargets(MOBILE_GRADLE, "versionCode client (Android)");
  const ownerGradle = gradleTargets(OWNER_GRADLE, "versionCode owner (Android)");
  return {
    rootPackage: readJson(ROOT_PKG).version,
    rootLock: readJson(ROOT_LOCK).version,
    rootLockWorkspace: readJson(ROOT_LOCK).packages?.[""]?.version ?? null,
    mobilePackage: readJson(MOBILE_PKG).version,
    mobileLock: fs.existsSync(MOBILE_LOCK) ? readJson(MOBILE_LOCK).version : null,
    mobileLockWorkspace: fs.existsSync(MOBILE_LOCK)
      ? (readJson(MOBILE_LOCK).packages?.[""]?.version ?? null)
      : null,
    mobileApp: readJson(MOBILE_APP).expo?.version ?? null,
    mobileGradleName: mobileGradle.name,
    mobileGradleCode: mobileGradle.code,
    mobileAppTsx: appVersionLiteralOf(fs.readFileSync(MOBILE_APP_TSX, "utf-8")),
    ownerPackage: readJson(OWNER_PKG).version,
    ownerLock: fs.existsSync(OWNER_LOCK) ? readJson(OWNER_LOCK).version : null,
    ownerApp: readJson(OWNER_APP).expo?.version ?? null,
    ownerGradleName: ownerGradle.name,
    ownerGradleCode: ownerGradle.code,
  };
}

/** Valeurs comparées au numéro racine (`null` = cible absente, donc ignorée). */
const ALIGNED_KEYS = [
  "rootLock",
  "rootLockWorkspace",
  "mobilePackage",
  "mobileLock",
  "mobileLockWorkspace",
  "mobileApp",
  "mobileGradleName",
  "mobileAppTsx",
  "ownerPackage",
  "ownerLock",
  "ownerApp",
  "ownerGradleName",
];

function check() {
  const s = snapshot();
  if (!SEMVER.test(s.rootPackage)) fail(`version racine invalide : ${s.rootPackage}`);
  const mismatches = [];
  for (const key of ALIGNED_KEYS) {
    if (s[key] === null) continue;
    if (s[key] !== s.rootPackage) mismatches.push(`${key}=${String(s[key])}`);
  }
  for (const [label, code] of [
    ["client", s.mobileGradleCode],
    ["owner", s.ownerGradleCode],
  ]) {
    if (code === null) continue;
    if (!Number.isInteger(code) || code <= 0) mismatches.push(`versionCode ${label}=${String(code)}`);
  }
  if (mismatches.length > 0) {
    fail(`versions désalignées sur ${s.rootPackage} : ${mismatches.join(", ")}`);
  }
  console.log(
    `OK  version ${s.rootPackage} alignée (POS + License Manager = package.json, Client + Owner, Android code client ${String(s.mobileGradleCode)} / owner ${String(s.ownerGradleCode)}).`,
  );
}

function bumpLock(file, version) {
  const lock = readJson(file);
  lock.version = version;
  if (lock.packages?.[""] != null) lock.packages[""].version = version;
  writeJson(file, lock);
}

/** Réécriture ciblée d'un `build.gradle` Android (present-only : non versionné). */
function applyGradle(file, newVersion, code) {
  if (!fs.existsSync(file)) {
    console.log(`SKIP ${path.relative(root, file)} absent (poste vendor seul)`);
    return null;
  }
  const gradle = fs.readFileSync(file, "utf-8");
  const next = gradle
    .replace(/versionCode\s+\d+/, `versionCode ${code}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "${newVersion}"`);
  fs.writeFileSync(file, next);
  return code;
}

/** `app.json` : remplacement ciblé, jamais de réécriture JSON (format Prettier). */
function applyAppJson(file, newVersion) {
  if (!fs.existsSync(file)) return;
  if (readJson(file).expo?.version === newVersion) return;
  const appSource = fs.readFileSync(file, "utf-8");
  fs.writeFileSync(file, appSource.replace(/("version"\s*:\s*")[^"]*(")/, `$1${newVersion}$2`));
}

function set(newVersion, explicitCode) {
  if (!SEMVER.test(newVersion)) fail(`version invalide « ${newVersion} » (attendu x.y.z)`);
  const current = snapshot();
  const sameMobileVersion = current.mobileApp === newVersion;
  const currentCode = current.mobileGradleCode ?? 0;
  const code = explicitCode ?? (sameMobileVersion ? currentCode : currentCode + 1);
  if (!Number.isInteger(code) || code <= 0) fail(`versionCode invalide : ${String(code)}`);
  if (current.mobileGradleCode !== null && code < current.mobileGradleCode) {
    fail(`versionCode ${code} < ${current.mobileGradleCode} : Android refuserait la mise à jour`);
  }
  // E-55/E-56 : le code owner suit la même loi de croissance (jamais régressif).
  const ownerCode = current.ownerGradleCode === null ? null : current.ownerGradleCode + 1;

  const pkg = readJson(ROOT_PKG);
  pkg.version = newVersion;
  writeJson(ROOT_PKG, pkg);
  bumpLock(ROOT_LOCK, newVersion);

  for (const [target, lock] of [
    [MOBILE_PKG, MOBILE_LOCK],
    [OWNER_PKG, OWNER_LOCK],
  ]) {
    if (!fs.existsSync(target)) continue;
    const json = readJson(target);
    json.version = newVersion;
    writeJson(target, json);
    if (fs.existsSync(lock)) bumpLock(lock, newVersion);
  }

  applyAppJson(MOBILE_APP, newVersion);
  applyAppJson(OWNER_APP, newVersion);
  applyGradle(MOBILE_GRADLE, newVersion, code);
  if (ownerCode !== null) applyGradle(OWNER_GRADLE, newVersion, ownerCode);

  if (fs.existsSync(MOBILE_APP_TSX)) {
    const appTsx = fs
      .readFileSync(MOBILE_APP_TSX, "utf-8")
      .replace(/const APP_VERSION = "[^"]*"/, `const APP_VERSION = "${newVersion}"`);
    fs.writeFileSync(MOBILE_APP_TSX, appTsx);
  }

  console.log(`OK  version ${newVersion} écrite`);
  console.log(`    POS + License Manager : ${newVersion} (package.json racine)`);
  console.log(`    Client Android       : ${newVersion} (code ${code})`);
  console.log(
    `    Owner Android        : ${newVersion}${ownerCode === null ? " (gradle absent)" : ` (code ${ownerCode})`}`,
  );
  check();
}

const [, , command, value, ...rest] = process.argv;
if (command === "check") {
  check();
} else if (command === "set") {
  if (!value) fail("usage : node scripts/release/version.mjs set <x.y.z> [--code N]");
  let explicitCode;
  const codeIndex = rest.indexOf("--code");
  if (codeIndex >= 0) {
    const raw = rest[codeIndex + 1];
    explicitCode = Number(raw);
    if (!Number.isInteger(explicitCode)) fail(`--code invalide : ${String(raw)}`);
  }
  set(value, explicitCode);
} else {
  fail("usage : node scripts/release/version.mjs <check|set> [version] [--code N]");
}
