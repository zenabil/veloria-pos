// Veloria PoS — Garde « POS 100 % français » (ADR-051) : aucun littéral
// arabe (ni « € ») dans `src/` ni dans `electron/`.
//
// POURQUOI UN SCRIPT ET NON UNE RÈGLE ESLINT : le sélecteur
// `Literal[value=/[€\u0600-\u06FF]/]` de `no-restricted-syntax` ne peut pas
// exprimer une classe de caractères NON ASCII dans l'`esquery` d'ESLint : le
// sélecteur devient silencieusement INERTE (aucune erreur, aucune
// correspondance). Vérifié le 2026-10-19 : `src/domain/ocr/numbers.ts`, qui
// contient `دج` (ligne 22), passait `eslint` avec exit 0.
//
// Ce script fait le contrôle RÉEL (regex JavaScript) et échoue en
// « fail-closed ». Exception unique et documentée : le module OCR, dont la
// regex de reconnaissance DOIT contenir le symbole « دج ».
//
// Usage : `npm run verify:fr` (ajouté aux portes et au CI).
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["src", "electron"];
const EXTS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".html", ".css"]);
// Exclusion unique et documentée (le recognizer OCR doit filtrer « دج »).
const ALLOW = new Set(["src/domain/ocr/numbers.ts"]);
// W6 : la workshop impression est ENTRÉE (ADR-097 + commit `ae4e410`) ⇒ les
// deux fichiers qui étaient en attente (« ticket de règlement ») sont
// corrigés et la dérogation temporaire est retirée : plus aucune liste
// d'attente, la garde FR redevient pleine.
// Arabe (blocs + supplément + formes de présentation) et « € ».
// Testé par CODEPOINT (et non par une classe de caractères littérale) : les
// caractères arabes littéraux seraient des espaces « irréguliers » pour la
// règle eslint `no-irregular-whitespace`, et les échappements `\u` sont
//fragiles à copier. Les codes sont donc explicites.
const FORBIDDEN_RANGES = [
  [0x0600, 0x06ff], // Arabic
  [0x0750, 0x077f], // Arabic Supplement
  [0x08a0, 0x08ff], // Arabic Extended-A
  [0xfb50, 0xfdff], // Arabic Presentation Forms-A
  [0xfe70, 0xfeff], // Arabic Presentation Forms-B
];
const EURO_CODEPOINT = 0x20ac;

function hasForbiddenChar(text) {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === EURO_CODEPOINT) return true;
    for (const [lo, hi] of FORBIDDEN_RANGES) {
      if (code >= lo && code <= hi) return true;
    }
  }
  return false;
}
// Fichiers ignorés (artefacts générés).
const IGNORED_DIRS = new Set(["node_modules", "dist", "dist-electron", "release", "coverage"]);

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(e.name)) continue;
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp, acc);
    else if (EXTS.has(path.extname(e.name))) acc.push(fp);
  }
  return acc;
}

const hits = [];
let scanned = 0;
for (const dir of SCAN_DIRS) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const fp of walk(abs)) {
    const rel = path.relative(ROOT, fp).replace(/\\/g, "/");
    if (ALLOW.has(rel)) continue;
    scanned += 1;
    const text = fs.readFileSync(fp, "utf8");
    text.split("\n").forEach((line, i) => {
      if (hasForbiddenChar(line)) {
        hits.push({ file: rel, line: i + 1, text: line.trim().slice(0, 120) });
      }
    });
  }
}

if (hits.length > 0) {
  console.error("ÉCHEC: littéral arabe ou « € » hors mobile/ (ADR-051) :");
  for (const h of hits) console.error(`  ${h.file}:${h.line}  ${h.text}`);
  process.exit(1);
}
// E-54 — plancher de non-vacuité : une porte qui scanne 0 fichier est une
// porte cassée, pas une porte verte (dossier renommé, glob inversé).
if (scanned < 300) {
  console.error(`ÉCHEC: garde FR — seulement ${scanned} fichiers scannés (seuil 300).`);
  process.exit(1);
}
console.log(
  `OK  garde FR : ${scanned} fichiers scannés (src/ + electron/), 0 littéral arabe ni « € ».`,
);
console.log(`    exception documentée : ${[...ALLOW].join(", ")} (module OCR).`);
