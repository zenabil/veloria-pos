// Veloria PoS — scripts/quality/verify-encoding.mjs
// Porte de non-régression : AUCUN caractère de remplacement U+FFFD dans les
// fichiers source (W9 / audit O-01 : 113 caractères perdus dans 20 fichiers
// `electron/ipc/*` par un aller-retour d'encodage — le code compilait, mais
// les commentaires FR étaient illisibles).
//
// Rappel : U+FFFD est le caractère de REMPLACEMENT Unicode. Sa présence
// signale un texte déjà corrompu : on ne l'écrit pas, on répare à la source.
//
// Exclusion documentée : `docs/reports/FULL_AUDIT_2026-10-19.md` cite les
// séquences corrompues telles quelles (preuve du constat O-01) — c'est un
// archipel, pas du code.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

/** Dossiers inspectés (source + documentation de travail). */
const SCAN_DIRS = [
  "electron",
  "src",
  "scripts",
  "tests",
  "database",
  "mobile",
  "license-manager",
  "cloud",
  "docs",
];
/** Fichiers racine inspectés. */
const SCAN_FILES = ["index.html", ".gitignore"];
/** Extensions inspectées (binaire ignoré). */
const EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".md",
  ".html",
  ".json",
  ".css",
  ".sql",
  ".yml",
  ".yaml",
  ".ps1",
  ".txt",
]);
/** Exceptions documentées (preuve historique du constat). */
const ALLOWLIST = new Set(["docs/reports/FULL_AUDIT_2026-10-19.md"]);

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-electron",
  "coverage",
  "graphify-out",
  "release",
  ".opencode",
]);

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const offenders = [];
let scanned = 0;
const candidates = [];
for (const dir of SCAN_DIRS) candidates.push(...walk(path.join(root, dir)));
for (const file of SCAN_FILES) candidates.push(path.join(root, file));

for (const abs of candidates) {
  const rel = path.relative(root, abs).replace(/\\/g, "/");
  if (ALLOWLIST.has(rel)) continue;
  if (!EXTENSIONS.has(path.extname(abs).toLowerCase())) continue;
  let text;
  try {
    text = fs.readFileSync(abs, "utf8");
  } catch {
    continue;
  }
  scanned += 1;
  const count = (text.match(/\uFFFD/g) ?? []).length;
  if (count > 0) offenders.push(`${rel} (${count})`);
}

if (offenders.length > 0) {
  console.error(`FAIL: ${offenders.length} fichier(s) contiennent U+FFFD (encodage corrompu) :`);
  for (const o of offenders) console.error(`  - ${o}`);
  console.error("Réparer à la source (jamais de Set-Content / PowerShell sur du texte UTF-8).");
  process.exit(1);
}
console.log(`OK  encodage : ${scanned} fichiers scannés, 0 caractère U+FFFD.`);
