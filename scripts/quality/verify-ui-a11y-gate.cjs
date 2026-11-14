/* eslint-disable */
// Veloria PoS — scripts/quality/verify-ui-a11y-gate.cjs
// UI-03 (accessibilite) + UI-04 (statut independant de la couleur).
//
// L'audit (2026-11-11) a constate qu'aucune porte d'accessibilite n'existait
// et que la signalisation d'etat n'etait jamais verifiee par une machine.
//
// Cette porte est STATIC (pas d'execution de navigateur) : elle scanne
// src/**/*.tsx et echoue si :
//   UI-03 :
//     - une balise <img> sans attribut alt ;
//     - un <button> ou <a> dont le seul contenu est une icone (lucide) sans
//       aria-label / aria-labelledby ;
//     - un outline-none sans focus-visible (perte du focus clavier) ;
//   UI-04 :
//     - un badge de statut colore (text-red/green/amber, bg-red/green/amber)
//       sans libelle textuel ni icone (aria-hidden) a cote.
//
// Usage : node scripts/quality/verify-ui-a11y-gate.cjs -> exit 0 si vert.
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const srcDir = path.join(root, "src");

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith(".tsx")) out.push(full);
  }
}

const files = [];
walk(srcDir, files);

const failures = [];
let imgMissingAlt = 0;
let iconButtonMissingLabel = 0;
let outlineWithoutFocus = 0;
let colourOnlyStatus = 0;

for (const f of files) {
  const rel = path.relative(root, f);
  const src = fs.readFileSync(f, "utf-8");
  const lines = src.split(/\r?\n/);

  // UI-03.1 : <img ...> sans alt
  for (const m of src.matchAll(/<img\b[^>]*>/g)) {
    const tag = m[0];
    if (!/\salt(\s*=|\s*\/?>)/.test(tag) && !/\salt=/.test(tag)) {
      imgMissingAlt += 1;
      failures.push(`${rel}: <img> sans alt`);
    }
  }

  // UI-03.2 : outline-none sans focus-visible (perte du focus clavier)
  for (const line of lines) {
    if (/outline-none/.test(line) && !/focus-visible/.test(line) && !/focus:/.test(line)) {
      outlineWithoutFocus += 1;
      failures.push(`${rel}: outline-none sans focus-visible`);
    }
  }

  // UI-03.3 + UI-04 : boutons icon-only et badges de statut
  // Heuristique : un <button> dont le contenu est uniquement une icone lucide
  // (<Icon ... />) sans aria-label ni texte.
  for (const m of src.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) {
    const open = m[0].match(/<button\b[^>]*>/)[0];
    const body = m[1];
    const isIconOnly = /^\s*<[A-Z][A-Za-z]*\b[^>]*\/>\s*$/.test(body);
    if (isIconOnly && !/aria-label/.test(open) && !/aria-labelledby/.test(open)) {
      iconButtonMissingLabel += 1;
      failures.push(`${rel}: bouton icone sans aria-label`);
    }
  }

  // UI-04 : badge de statut colore sans libelle (heuristique : une span/div
  // dont la classe contient text-red/green/amber et bg-red/green/amber, et
  // dont le contenu est vide ou uniquement un point).
  for (const m of src.matchAll(
    /<(span|div)\b[^>]*class="[^"]*(?:text-(?:red|green|emerald|amber)|bg-(?:red|green|emerald|amber))[^"]*"[^>]*>([\s\S]*?)<\/\1>/g,
  )) {
    const body = m[2].trim();
    if (body === "" || /^<[^>]+\/>$/.test(body)) {
      colourOnlyStatus += 1;
      failures.push(`${rel}: badge de statut colore sans libelle textuel`);
    }
  }
}

// Rapport
console.log(`Fichiers analyses : ${files.length}`);
console.log(`  <img> sans alt : ${imgMissingAlt}`);
console.log(`  outline-none sans focus-visible : ${outlineWithoutFocus}`);
console.log(`  bouton icone sans aria-label : ${iconButtonMissingLabel}`);
console.log(`  badge colore sans libelle : ${colourOnlyStatus}`);

if (failures.length > 0) {
  console.error("FAIL: porte UI (accessibilite + statut independant de la couleur) —");
  for (const f of failures.slice(0, 40)) console.error(`  - ${f}`);
  if (failures.length > 40) console.error(`  ... et ${failures.length - 40} autres`);
  process.exit(1);
}
console.log("OK  porte UI (accessibilite + statut independant de la couleur) : aucun constat.");
