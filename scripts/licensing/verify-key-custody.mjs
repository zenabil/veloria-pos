// Veloria — Licensing: garde de CUSTODE DE CLÉ (LIC-02).
//
// PROBLÈME MESURÉ (audit 2026-11-11, finding LIC-02) :
//   La clé privée Ed25519 correspondant à la clé PUBLIQUE embarquée
//   (`resources/license/public.key`) était présente sur la machine de
//   développement. Les empreintes SHA-256 (SPKI DER) des deux moitiés
//   étaient IDENTIQUES : quiconque possède cette clé peut émettre une
//   licence acceptée par TOUS les POS livrés avec cette ancre.
//
//   Les contrôles existants étaient corrects mais incomplets :
//     - `private/` est gitignoré  ✔
//     - la clé n'est PAS suivie par git  ✔
//     - `private/` n'est pas dans le paquet electron-builder  ✔
//     - le secret-scan surveille l'arbre `private/`  ✔
//   Il manquait le contrôle qui compte : un garde de BUILD qui refuse
//   d'embarquer une ancre dont la clé privée est présente sur la machine.
//
// CE QUE CE SCRIPT FAIT :
//   1. Calcule l'empreinte de chaque clé PUBLIQUE embarquée.
//   2. Cherche une clé PRIVÉE dans l'ensemble de l'arbre (hors dépendances).
//   3. Si une clé privée correspond à une ancre embarquée → ÉCHEC
//      (fail-closed). Un artefact ne doit pas être produit à partir d'une
//      ancre compromise.
//
// SORTIE :
//   0 — aucune clé privée correspondante (cas normal)
//   1 — clé privée correspondante trouvée (build refusé)
//   2 — configuration illisible (fail-closed : on ne devine pas)
//
// Usage : node scripts/licensing/verify-key-custody.mjs

import { createPublicKey, createPrivateKey, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

/** Emplacements possibles de la clé PUBLIQUE embarquée. */
const PUBLIC_PATHS = [
  path.join(root, "resources", "license", "public.key"),
  path.join(root, "resources", "license", "keys.json"),
];

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-electron",
  "dist-license-manager",
  "dist-license-manager-renderer",
  "coverage",
  "test-results",
  "release",
  "graphify-out",
  ".expo",
]);

/** Empreinte SHA-256 de la clé PUBLIQUE (forme SPKI DER) — comparable. */
function publicFingerprint(pem) {
  try {
    const key = createPublicKey(pem);
    return createHash("sha256")
      .update(key.export({ type: "spki", format: "der" }))
      .digest("hex");
  } catch {
    return null;
  }
}

/** Empreinte SHA-256 de la clé PRIVÉE (via sa partie publique dérivée). */
function privateFingerprint(pem) {
  try {
    const key = createPrivateKey(pem);
    const pub = createPublicKey(key);
    return createHash("sha256")
      .update(pub.export({ type: "spki", format: "der" }))
      .digest("hex");
  } catch {
    return null;
  }
}

/** Toutes les clés publiques embarquées (public.key + le jeu keys.json). */
function embeddedPublicFingerprints() {
  const out = new Map();
  for (const p of PUBLIC_PATHS) {
    if (!fs.existsSync(p)) continue;
    if (p.endsWith("keys.json")) {
      try {
        const parsed = JSON.parse(fs.readFileSync(p, "utf-8"));
        const keys = parsed?.keys;
        if (keys && typeof keys === "object") {
          for (const [kid, pem] of Object.entries(keys)) {
            if (typeof pem !== "string") continue;
            const fp = publicFingerprint(pem);
            if (fp) out.set(`${path.relative(root, p)}#${kid}`, fp);
          }
        }
      } catch {
        /* fichier illisible : traité plus loin */
      }
    } else {
      try {
        const fp = publicFingerprint(fs.readFileSync(p, "utf-8"));
        if (fp) out.set(path.relative(root, p), fp);
      } catch {
        /* fichier illisible : traité plus loin */
      }
    }
  }
  return out;
}

/** Cherche des fichiers de clé privée dans l'arbre (hors dépendances). */
function findPrivateKeyFiles() {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 6) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (IGNORED_DIRS.has(e.name)) continue;
        walk(path.join(dir, e.name), depth + 1);
      } else {
        const name = e.name.toLowerCase();
        if (name.endsWith(".key") || name.endsWith(".pem") || name.endsWith(".p8")) {
          found.push(path.join(dir, e.name));
        }
      }
    }
  };
  walk(root, 0);
  return found;
}

const embedded = embeddedPublicFingerprints();

if (embedded.size === 0) {
  console.error(
    "KEY-CUSTODY ÉCHEC : aucune clé publique de vérification lisible dans resources/license/.\n" +
      "  Impossible de vérifier la custode — fail-closed (Lancez keygen.mjs --production).",
  );
  process.exit(2);
}

const candidates = new Set(findPrivateKeyFiles());
const offenders = [];
const unreadable = [];

for (const file of candidates) {
  if (!fs.existsSync(file)) continue;
  let text;
  try {
    text = fs.readFileSync(file, "utf-8");
  } catch {
    continue;
  }
  if (!text.includes("PRIVATE KEY")) continue;
  const fp = privateFingerprint(text);
  if (!fp) {
    // Un fichier contenant « PRIVATE KEY » mais non analysable doit être
    // examiné : fail-closed, on ne suppose pas que ce soit anodin.
    unreadable.push(path.relative(root, file));
    continue;
  }
  for (const [origin, pubFp] of embedded) {
    if (pubFp === fp) {
      offenders.push(`${path.relative(root, file)} (ancre embarquée : ${origin})`);
    }
  }
}

if (offenders.length > 0) {
  console.error("KEY-CUSTODY ÉCHEC : clé privée correspondant à une ancre embarquée :");
  for (const o of offenders) console.error(`  - ${o}`);
  console.error(
    "\n  L'ancre de vérification embarquée est COMPROMISE sur cette machine :\n" +
      "  quiconque possède cette clé privée peut émettre une licence acceptée\n" +
      "  par tous les POS livrés avec cette ancre.\n" +
      "  Rotation : docs/licensing/KEY_MANAGEMENT.md (générer une nouvelle clé\n" +
      "  SUR LA MACHINE VENDOR, publier avec --production, conserver l'ancienne clé\n" +
      "  pendant la période de recouvrement).",
  );
  process.exit(1);
}

if (unreadable.length > 0) {
  console.error("KEY-CUSTODY ÉCHEC : fichier(s) contenant « PRIVATE KEY » illisible(s) :");
  for (const u of unreadable) console.error(`  - ${u}`);
  console.error("  Fail-closed : un fichier de clé illisible doit être examiné.");
  process.exit(2);
}

console.log(
  `OK  key-custody (${embedded.size} ancre(s) embarquée(s), aucune clé privée correspondante).`,
);
