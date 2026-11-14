// Veloria PoS — scripts/quality/verify-release-config.mjs
//
// Garde de CONFIGURATION de release (REL-02, REL-04, REL-05).
//
// electron-builder lit un YAML : une clé mal orthographiée est IGNORÉE
// silencieusement, et un `false` laissé par erreur est un trou de sécurité
// qui ne se voit qu'au moment d'appliquer une mise à jour. Cette porte rend
// ces deux classes d'erreur VISIBLES, sans dépendre d'un build.
//
// Ce qu'elle refuse :
//   1. `verifyUpdateCodeSignature: false` — la vérification de signature des
//      mises à jour ne doit JAMAIS être désactivée (veloria-release :
//      "Never disable signature or integrity verification merely to make an
//      update succeed"). Le projet a déjà subi un retour en arrière de ce
//      type sur `signAndEditExecutable` (ADR-070).
//   2. `signAndEditExecutable: false` — même famille (ADR-070).
//   3. Une clé de premier niveau INCONNUE dans le YAML electron-builder :
//      elle serait ignorée silencieusement (c'est exactement ce qui est
//      arrivé à `buildMetadata`, qui est macOS-only sous electron-builder 26).
//   4. L'absence de la trace de build (`build-info.json` en extraResources)
//      — sans elle, un livrable n'est pas traçable.
//
// La liste des clés AUTORISées est explicitée ici : c'est elle qui remplace
// la validation silencieuse d'electron-builder par une validation explicite.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const CONFIGS = ["config/electron-builder/pos.yml", "config/electron-builder/manager.yml"];

// Clés electron-builder autorisées à la racine (electron-builder 26.x).
// Toute autre clé racine = configuration mal orthographiée ou obsolète.
const ALLOWED_ROOT_KEYS = new Set([
  "appId",
  "productName",
  "copyright",
  "directories",
  "files",
  "extraResources",
  "asar",
  "asarUnpack",
  "npmRebuild",
  "win",
  "nsis",
  "portable",
  "artifactName",
  "publish",
  "afterSign",
  "afterPack",
  "beforePack",
  "electronLanguages",
  "compression",
  "generateUpdatesFilesForAllChannels",
  "detectUpdateChannel",
  "protocols",
  "fileAssociations",
  "extraMetadata",
  "buildDependenciesFromSource",
  "nodeGypRebuild",
  "buildVersion",
  "appCategoryType",
  "shortcutName",
  "executableName",
]);

// Sous-blocs dont on veut contrôler l'intégralité des clés.
const ALLOWED_NESTED = {
  win: new Set([
    "target",
    "icon",
    "legalTrademarks",
    "verifyUpdateCodeSignature",
    "signAndEditExecutable",
    "sign",
    "publisherName",
    "rfc3161TimeStampServer",
    "executableName",
    "artifactName",
    "requestedExecutionLevel",
    "fileAssociations",
  ]),
  nsis: new Set([
    "oneClick",
    "allowToChangeInstallationDirectory",
    "perMachine",
    "installerLanguages",
    "installerIcon",
    "uninstallerIcon",
    "installerHeader",
    "installerSidebar",
    "createDesktopShortcut",
    "createStartMenuShortcut",
    "menuCategory",
    "shortcutName",
    "uninstallDisplayName",
    "deleteAppDataOnUninstall",
    "warningsAsErrors",
    "artifactName",
    "displayLanguageSelector",
  ]),
  portable: new Set(["artifactName"]),
  directories: new Set(["output", "buildResources"]),
};

const FAIL = [];

function fail(file, message) {
  FAIL.push(`${file} :: ${message}`);
}

for (const rel of CONFIGS) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    fail(rel, "configuration electron-builder absente");
    continue;
  }
  const src = fs.readFileSync(abs, "utf8");
  const lines = src.split(/\r?\n/);

  // --- 1/2. drapeaux de signature ------------------------------------------
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (/^verifyUpdateCodeSignature:\s*false\b/.test(trimmed)) {
      fail(
        rel,
        `ligne ${i + 1} : verifyUpdateCodeSignature: false — la vérification de signature des ` +
          "mises à jour ne doit jamais être désactivée (ADR-070, même famille que signAndEditExecutable).",
      );
    }
    if (/^signAndEditExecutable:\s*false\b/.test(trimmed)) {
      fail(
        rel,
        `ligne ${i + 1} : signAndEditExecutable: false — réintroduit le contournement TEMP-BUILD ` +
          "réverti par ADR-070.",
      );
    }
  });

  // --- 3. clés racine inconnues ---------------------------------------------
  let inExtra = false;
  let extraIndent = 0;
  lines.forEach((line, i) => {
    if (line.trim().length === 0 || line.trim().startsWith("#")) return;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      inExtra = false;
      const key = line.trim().split(":")[0];
      if (key.length === 0) return;
      if (!ALLOWED_ROOT_KEYS.has(key)) {
        fail(
          rel,
          `ligne ${i + 1} : clé racine « ${key} » inconnue d'electron-builder 26 — elle serait ` +
            "IGNORÉE silencieusement (cf. « buildMetadata », macOS-only).",
        );
      }
      return;
    }
    if (inExtra && indent <= extraIndent) inExtra = false;
    if (/^extraResources:\s*$/.test(line.trim())) {
      inExtra = true;
      extraIndent = indent;
    }
  });

  // --- 3bis. clés inconnues dans win / nsis / portable -----------------------
  let section = null;
  lines.forEach((line, i) => {
    if (line.trim().length === 0 || line.trim().startsWith("#")) return;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      section = null;
      return;
    }
    const key = line.trim().split(":")[0];
    if (indent === 2 && ALLOWED_NESTED[section] === undefined) {
      // nouvelle section de premier sous-niveau (win:, nsis:, portable:…)
      const m = line.trim().match(/^([A-Za-z][A-Za-z0-9_]*):/);
      if (m) {
        section = m[1];
      }
      return;
    }
    if (indent === 4 && section && ALLOWED_NESTED[section] && !ALLOWED_NESTED[section].has(key)) {
      fail(
        rel,
        `ligne ${i + 1} : clé « ${key} » inconnue sous « ${section}: » — ignorée silencieusement ` +
          "par electron-builder.",
      );
    }
  });

  // --- 4. trace de build embarquée ------------------------------------------
  if (/\bfrom:\s*scripts\/release\/build-info\.json\b/.test(src) === false) {
    fail(
      rel,
      "la trace de build (scripts/release/build-info.json) n'est pas embarquée : un livrable " +
        "ne serait pas traçable (REL-04).",
    );
  }
}

if (FAIL.length > 0) {
  console.error("RELEASE-CONFIG ÉCHEC :");
  for (const f of FAIL) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`OK  release-config (${CONFIGS.length} configurations electron-builder contrôlées).`);
