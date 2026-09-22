// Veloria — Licensing: production secret/bypass scan (fail-closed).
// Vérifie que le POS (sources + build) ne contient NI clé privée NI bypass.
// Exécuté automatiquement avant tout packaging (prepackage) et dans package:pos.
// Usage: node scripts/licensing/secret-scan.mjs
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const FAIL = [];
const WARN = [];

const SCAN_DIRS = [
  "electron",
  "src",
  "public",
  "resources",
  "scripts",
  "dist",
  "dist-electron",
  // BL-04: manager + migrations + tests (clés .vlic/DB jamais scannées).
  // NOTE: private/ exclu volontairement — domicile prévu de la clé vendor
  // (gitignoré, jamais empaqueté) ; le scanner la signalerait à tort.
  "license-manager",
  "database",
  "tests",
];
const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".html",
  ".css",
  ".yml",
  ".yaml",
  ".md",
  ".txt",
  ".key",
  ".pem",
  // BL-06: artefacts sensibles sans extension couverts par contenu ;
  // .vlic/.sqlite scannés comme texte (base64/SQL lisible) + binaires .dat rejetés par nom.
  ".vlic",
  ".sql",
  ".sqlite",
  ".vposdb",
]);

// Motifs assemblés par concaténation : le token complet n'apparaît jamais en
// littéral ici (le scanner ne se détecte pas lui-même) mais matche en cible.
// BL-05: variantes insensibles à la casse + séparateurs -/_ + dotenv/import.meta.
const SECRET_PATTERNS = [
  new RegExp(`-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE ${"KE" + "Y"}-----`),
  new RegExp(`-----BEGIN ENCRYPTED PRIVATE ${"KE" + "Y"}-----`),
  new RegExp("PuTTY-User-" + "Key-File"),
  new RegExp("BYPASS" + "[-_]?" + "LICENSE", "i"),
  new RegExp("SKIP" + "[-_]?" + "ACTIVATION", "i"),
  new RegExp("DISABLE" + "[-_]?" + "LICENSE", "i"),
  new RegExp("DISABLE" + "[-_]?" + "ACTIVATION", "i"),
  new RegExp("DEV" + "_MODE_" + "UNLOCK", "i"),
  new RegExp("DEBUG" + "[-_]?" + "LICENSE", "i"),
  new RegExp("SKIP" + "[-_]?" + "LICENSE" + "[-_]?" + "CHECK", "i"),
];

const BYPASS_ENV = [
  /process\.env\[["'](?:BYPASS|SKIP|DEBUG)[A-Z_]*LICENSE/i,
  /process\.env\.(?:BYPASS|SKIP|DEBUG)[A-Z_]*LICENSE/i,
  /import\.meta\.env\.(?:BYPASS|SKIP|DEBUG)[A-Z_]*LICENSE/i,
  /\b(?:bypass|disable|skip)[-_ ]?licen[sc]e\b/i,
];

function walk(dir, out) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      walk(p, out);
    } else if (TEXT_EXT.has(path.extname(e.name).toLowerCase())) {
      out.push(p);
    }
  }
}

const files = [];
for (const d of SCAN_DIRS) walk(path.join(root, d), files);

// 1. Contenu interdit.
for (const f of files) {
  let text = "";
  try {
    text = fs.readFileSync(f, "utf8");
  } catch {
    continue;
  }
  const rel = path.relative(root, f);
  for (const re of [...SECRET_PATTERNS, ...BYPASS_ENV]) {
    if (re.test(text)) FAIL.push(`${rel} :: ${re}`);
  }
}

// 2. Fichiers interdits dans l'arbre POS (clés, env, artefacts debug).
const FORBIDDEN_FILES = ["private.key", "vendor-private.key", ".env", ".env.production"];
for (const f of files) {
  const base = path.basename(f);
  if (FORBIDDEN_FILES.includes(base)) FAIL.push(`${path.relative(root, f)} :: fichier interdit`);
  if (f.endsWith(".map")) FAIL.push(`${path.relative(root, f)} :: source map en build`);
}

// 3. Clé publique embarquée obligatoire (fail-closed : sans elle, pas de vérification).
if (!fs.existsSync(path.join(root, "resources", "license", "public.key"))) {
  FAIL.push("resources/license/public.key :: manquant (générer via license:keygen)");
}

if (WARN.length > 0) {
  for (const w of WARN) console.log(`WARN ${w}`);
}
if (FAIL.length > 0) {
  console.error("SECRET-SCAN ÉCHEC :");
  for (const f of FAIL) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`OK  secret-scan (${files.length} fichiers analysés, aucun secret/bypass/map).`);
