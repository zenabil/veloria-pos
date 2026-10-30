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
  const m = /appVersion="([^"]*)"/.exec(source);
  if (!m) fail("appVersion introuvable dans mobile/src/App.tsx");
  return m[1];
}

/** Toutes les cibles qui doivent porter le même numéro. */
function snapshot() {
  const gradle = fs.readFileSync(MOBILE_GRADLE, "utf-8");
  const appJson = readJson(MOBILE_APP);
  return {
    rootPackage: readJson(ROOT_PKG).version,
    rootLock: readJson(ROOT_LOCK).version,
    rootLockWorkspace: readJson(ROOT_LOCK).packages?.[""]?.version ?? null,
    mobilePackage: readJson(MOBILE_PKG).version,
    mobileLock: readJson(MOBILE_LOCK).version,
    mobileLockWorkspace: readJson(MOBILE_LOCK).packages?.[""]?.version ?? null,
    mobileApp: appJson.expo?.version ?? null,
    mobileGradleName: versionNameOf(gradle),
    mobileGradleCode: versionCodeOf(gradle),
    mobileAppTsx: appVersionLiteralOf(fs.readFileSync(MOBILE_APP_TSX, "utf-8")),
  };
}

function check() {
  const s = snapshot();
  if (!SEMVER.test(s.rootPackage)) fail(`version racine invalide : ${s.rootPackage}`);
  const mismatches = [];
  for (const key of [
    "rootLock",
    "rootLockWorkspace",
    "mobilePackage",
    "mobileLock",
    "mobileLockWorkspace",
    "mobileApp",
    "mobileGradleName",
    "mobileAppTsx",
  ]) {
    if (s[key] !== s.rootPackage) mismatches.push(`${key}=${String(s[key])}`);
  }
  if (!Number.isInteger(s.mobileGradleCode) || s.mobileGradleCode <= 0) {
    mismatches.push(`versionCode=${String(s.mobileGradleCode)}`);
  }
  if (mismatches.length > 0) {
    fail(`versions désalignées sur ${s.rootPackage} : ${mismatches.join(", ")}`);
  }
  console.log(
    `OK  version ${s.rootPackage} alignée (POS + License Manager = package.json, Android code ${s.mobileGradleCode})`,
  );
}

function bumpLock(file, version) {
  const lock = readJson(file);
  lock.version = version;
  if (lock.packages?.[""] != null) lock.packages[""].version = version;
  writeJson(file, lock);
}

function set(newVersion, explicitCode) {
  if (!SEMVER.test(newVersion)) fail(`version invalide « ${newVersion} » (attendu x.y.z)`);
  const current = snapshot();
  const gradle = fs.readFileSync(MOBILE_GRADLE, "utf-8");
  const sameMobileVersion = current.mobileApp === newVersion;
  const currentCode = current.mobileGradleCode;
  const code = explicitCode ?? (sameMobileVersion ? currentCode : currentCode + 1);
  if (!Number.isInteger(code) || code <= 0) fail(`versionCode invalide : ${String(code)}`);
  if (code < currentCode) {
    fail(`versionCode ${code} < ${currentCode} : Android refuserait la mise à jour`);
  }

  const pkg = readJson(ROOT_PKG);
  pkg.version = newVersion;
  writeJson(ROOT_PKG, pkg);
  bumpLock(ROOT_LOCK, newVersion);

  const mobilePkg = readJson(MOBILE_PKG);
  mobilePkg.version = newVersion;
  writeJson(MOBILE_PKG, mobilePkg);
  bumpLock(MOBILE_LOCK, newVersion);

  // Remplacement ciblé (pas de réécriture JSON complète) : app.json est formaté
  // par Prettier avec des tableaux compacts ; un JSON.stringify le ferait
  // échouer à `format:check`.
  if (readJson(MOBILE_APP).expo?.version !== newVersion) {
    const appSource = fs.readFileSync(MOBILE_APP, "utf-8");
    const nextApp = appSource.replace(
      /("version"\s*:\s*")[^"]*(")/,
      `$1${newVersion}$2`,
    );
    fs.writeFileSync(MOBILE_APP, nextApp);
  }

  const nextGradle = gradle
    .replace(/versionCode\s+\d+/, `versionCode ${code}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "${newVersion}"`);
  fs.writeFileSync(MOBILE_GRADLE, nextGradle);

  const appTsx = fs
    .readFileSync(MOBILE_APP_TSX, "utf-8")
    .replace(/appVersion="[^"]*"/, `appVersion="${newVersion}"`);
  fs.writeFileSync(MOBILE_APP_TSX, appTsx);

  console.log(`OK  version ${newVersion} écrite`);
  console.log(`    POS + License Manager : ${newVersion} (package.json racine)`);
  console.log(`    Client Android       : ${newVersion} (code ${code})`);
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
