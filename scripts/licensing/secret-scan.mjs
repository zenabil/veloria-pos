// Veloria — Licensing: production secret/bypass scan (fail-closed).
// Vérifie que le POS (sources + build) ne contient NI clé privée NI bypass.
// Exécuté automatiquement avant tout packaging (prepackage) et dans package:pos.
// Usage: node scripts/licensing/secret-scan.mjs
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const FAIL = [];
const WARN = [];

// Fichiers interdits : déclarés AVANT walk() — un fichier est scanné s'il a
// une extension texte OU s'il porte un nom interdit quel que soit son
// extension. Sans ce second test, `.env` (sans extname) et `.env.production`
// (extname `.production`) n'entraient JAMAIS dans la liste : la vérification
// FORBIDDEN_FILES plus bas était du code mort (fail-closed en apparence).
const FORBIDDEN_FILES = ["private.key", "vendor-private.key", ".env", ".env.production"];

function isScanned(name) {
  const ext = path.extname(name).toLowerCase();
  return TEXT_EXT.has(ext) || FORBIDDEN_FILES.includes(name);
}

const SCAN_DIRS = [
  "electron",
  "src",
  "public",
  "resources",
  "scripts",
  "dist",
  "dist-electron",
  // BL-04: manager + migrations + tests (clés .vlic/DB jamais scannées).
  // RADICAL (#23) : AUCUNE exclusion — private/ (domicile clé vendor) et
  // .opencode/ sont scannés comme tout le reste (les rapports de maintenance
  // vivent sous docs/, déjà couvert ci-dessous).
  "license-manager",
  "database",
  "tests",
  // S6: étendue portée aux arbres réellement livrés/jetables — APK (mobile),
  // fonctions Edge (cloud), CI (.github), docs, sorties manager, exécution
  // release + exports de design Stitch. Aucun d'eux n'était analysé.
  "mobile",
  // E-54 — l'app PROPRIÉTAIRE était hors périmètre : c'est pourtant elle qui
  // porte la connexion Supabase (e-mail/mot de passe Auth) et son `eas.json`.
  "owner",
  // E-54 — `config/` : les .yml electron-builder et le playwright.config sont
  // embarqués dans le livrable ; un token y atterrit par copier-coller.
  "config",
  "cloud",
  ".github",
  "docs",
  "dist-license-manager",
  "dist-license-manager-renderer",
  "release",
  "docs/archive/stitch/stitch_veloria_client_mobile_app",
  // RADICAL (#23, #38) : arbres historiquement exclus — aucun angle mort.
  // (maintenance-reports/ a déménagé sous docs/reports/maintenance/, déjà
  // couvert par "docs" ; .opencode/ reste adressable — outillage vivant.)
  "private",
  ".opencode",
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
  // RADICAL (#23) : journaux et scripts opérateur scannés (secrets collés
  // dans un .log ou une clé codée en dur dans un .ps1).
  ".log",
  ".ps1",
]);

// Motifs assemblés par concaténation : le token complet n'apparaît jamais en
// littéral ici (le scanner ne se détecte pas lui-même) mais matche en cible.
// BL-05: variantes insensibles à la casse + séparateurs -/_ + dotenv/import.meta.
//
// DEUX FAMILLES, DEUX PÉRIMÈTRES (radical-fix GATE-01, 2026-11-11) :
//   1. SECRET_PATTERNS  — FUITE DE MATÉRIEL (clé privée, jeton de service,
//      rôle JWT privilégié). SCANNÉS PARTOUT, y compris `.md`/`.txt` : une clé
//      planquée dans de la documentation reste une fuite.
//   2. BYPASS_CODE_PATTERNS — INTERRUPTION PROGRAMMATIQUE (un interrupteur
//      d'activation dans le code). SCANNÉS DANS LE CODE SEULEMENT.
//      Un interrupteur est une CONSTRUCTION DE CODE ; de la prose qui nomme un
//      interrupteur (une question d'abus dans un threat-model, un ADR) n'en
//      est pas un. C'est exactement le motif qui faisait échouer le scan sur
//      les références de sécurité en anglais du bundle Veloria Engineering
//      Skills v2.0.0 — du contenu légitime, pas un contournement.
//      La famille reste ACTIVE sur les `.ts`/`.tsx`/`.js`… : un vrai
//      interrupteur en code source reste détecté (preuve négative dans
//      tests/unit/secret-scan-bypass.test.ts).
// NOTE : ce fichier est lui-même scanné. Aucun motif ne doit y apparaître en
// littéral (les motifs sont assemblés par concaténation, ET les commentaires
// ci-dessous évitent d'écrire la séquence interdite en clair).
const SECRET_PATTERNS = [
  new RegExp(`-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE ${"KE" + "Y"}-----`),
  new RegExp(`-----BEGIN ENCRYPTED PRIVATE ${"KE" + "Y"}-----`),
  new RegExp("PuTTY-User-" + "Key-File"),
  // E-54 — classe de fuite RÉELLE de ce projet (miroir Supabase) : la clé de
  // service et les jetons d'API plateforme. Motifs assemblés par concaténation
  // pour que le scanner ne se signale pas lui-même.
  new RegExp(`["']sb_${"sec" + "ret"}[_A-Za-z0-9-]{8,}`),
  // `service_role` + sa valeur : la clé peut être NOTÉE (`"service_role": "…"`,
  // forme JSON — le plus courant pour un secret de configuration) ou NU
  // (`service_role: "…"`, YAML / TS). L'ancienne forme exigeait l'absence de
  // guillemet après le nom et ne voyait donc PAS la forme JSON — l'endroit
  // exact où un jeton se cache. Les deux formes sont désormais couvertes.
  new RegExp(`${"service" + "_role"}["']?\\s*[:=]\\s*["'][A-Za-z0-9_-]{20,}`),
];

/** Motifs d'interruption LICENCE : détection de CODE, pas de PROSE. */
const BYPASS_CODE_PATTERNS = [
  new RegExp("BYPASS" + "[-_]?" + "LICENSE", "i"),
  new RegExp("SKIP" + "[-_]?" + "ACTIVATION", "i"),
  new RegExp("DISABLE" + "[-_]?" + "LICENSE", "i"),
  new RegExp("DISABLE" + "[-_]?" + "ACTIVATION", "i"),
  new RegExp("DEV" + "_MODE_" + "UNLOCK", "i"),
  new RegExp("DEBUG" + "[-_]?" + "LICENSE", "i"),
  new RegExp("SKIP" + "[-_]?" + "LICENSE" + "[-_]?" + "CHECK", "i"),
];

/**
 * Extensions où une interruption programmatique est un DÉFAUT de sécurité.
 * Un `.md`/`.txt` n'en fait PAS partie : c'est de la documentation (contrats,
 * ADR, threat-model checklists) qui peut légitimement nommer un contournement
 * pour l'interdire. Les Secrets (famille 1) y restent détectés.
 */
const CODE_EXT = new Set([
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
  ".sql",
  ".ps1",
  ".log",
  ".key",
  ".pem",
  ".vlic",
  ".sqlite",
  ".vposdb",
]);

/**
 * E-54 — un JWT `eyJ…` n'est PAS un secret en soi : la clé `anon` de Supabase
 * est publique par conception (elle est dans l'APK). Ce qui doit faire échec,
 * c'est un jeton dont le payload déclare un rôle PRIVILÉGIÉ. Le contrôle est
 * donc sémantique : on décode le segment 2 et on lit `role`, au lieu de
 * refuser tout jeton (ce qui rendrait le garde inutilisable et ignoré).
 */
const PRIVILEGED_JWT_ROLES = new Set([
  "service" + "_role",
  "supabase_admin",
  "supabase_auth_admin",
  "supabase_storage_admin",
  "authenticator",
]);

function privilegedJwtHits(text) {
  const hits = [];
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g)) {
    const payload = m[0].split(".")[1];
    let role = null;
    try {
      const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      role = typeof json?.["ro" + "le"] === "string" ? json["ro" + "le"] : null;
    } catch {
      /* jeton non décodable : hors sujet (les motifs bruts couvrent le reste) */
    }
    if (role !== null && PRIVILEGED_JWT_ROLES.has(role))
      hits.push(`${m[0].slice(0, 24)}… :: role=${role}`);
  }
  return hits;
}

const BYPASS_ENV = [
  /process\.env\[["'](?:BYPASS|SKIP|DEBUG)[A-Z_]*LICENSE/i,
  /process\.env\.(?:BYPASS|SKIP|DEBUG)[A-Z_]*LICENSE/i,
  /import\.meta\.env\.(?:BYPASS|SKIP|DEBUG)[A-Z_]*LICENSE/i,
];

/**
 * Motif « prose » d'interruption : il est tolérant à l'espace (donc il matche
 * de la PROSE anglaise), donc il ne peut pas être appliqué à la documentation :
 * le bundle Veloria Engineering Skills contient une question d'abus qui nomme
 * un contournement de licence — c'est une consigne de revue, pas un
 * contournement. Il reste appliqué au CODE (voir CODE_EXT) — où un vrai
 * interrupteur doit être trouvé.
 */
const BYPASS_PROSE = /\b(?:bypass|disable|skip)[-_ ]?licen[sc]e\b/i;

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
    } else if (isScanned(e.name)) {
      out.push(p);
    }
  }
}

const files = [];
for (const d of SCAN_DIRS) walk(path.join(root, d), files);
// Fichiers à la RACINE eux aussi (`.env`/clés au niveau projet — le plus
// probable de tous — plus package.json, *.yml, *.md embarquables).
// package-lock.json exclu : artefact npm pur, sans contenu applicatif.
for (const e of fs.readdirSync(root, { withFileTypes: true })) {
  if (!e.isFile()) continue;
  if (e.name === "package-lock.json") continue;
  if (isScanned(e.name)) files.push(path.join(root, e.name));
}

// Domicile légitime unique de la clé vendor (gitignoré, jamais empaqueté —
// voir electron-builder.yml : seul resources/license/public.key est livré).
// keygen.mjs la crée ici, sign-integrity.mjs la lit ici : la signaler comme
// « fichier interdit » rendait `package` impossible sur machine vendor.
// Tout autre private.key reste interdit (contrôle n°2 ci-dessous).
const VENDOR_DOMICILE = new Set(
  [
    path.join("private", "vendor-keys", "private.key"),
    path.join("private", "vendor-keys", "public.key"),
  ].map((p) => path.join(root, p)),
);

// 1. Contenu interdit.
for (const f of files) {
  if (VENDOR_DOMICILE.has(f)) continue;
  let text = "";
  try {
    text = fs.readFileSync(f, "utf8");
  } catch {
    continue;
  }
  const rel = path.relative(root, f);
  // Famille 1 — fuite de matériel : PARTOUT (.md/.txt compris).
  for (const re of SECRET_PATTERNS) {
    if (re.test(text)) FAIL.push(`${rel} :: ${re}`);
  }
  // Famille 2 — interruption programmatique : CODE SEULEMENT.
  // (La prose qui nomme un contournement — un threat-model checklist, un ADR —
  //  n'est pas un défaut de sécurité.)
  const isCode = CODE_EXT.has(path.extname(f).toLowerCase());
  if (isCode) {
    for (const re of [...BYPASS_CODE_PATTERNS, ...BYPASS_ENV]) {
      if (re.test(text)) FAIL.push(`${rel} :: ${re}`);
    }
    if (BYPASS_PROSE.test(text)) FAIL.push(`${rel} :: ${BYPASS_PROSE}`);
  }
  // E-54 — rôles JWT privilégiés (le jeton `anon` public n'est PAS une faute).
  for (const hit of privilegedJwtHits(text)) FAIL.push(`${rel} :: ${hit}`);
}

// 2. Fichiers interdits dans l'arbre POS (clés, env, artefacts debug).
// FORBIDDEN_FILES est déclaré en tête (isScanned) : `.env` n'a pas
// d'extension, il fallait l'ajouter à la collecte AVANT ce contrôle.
for (const f of files) {
  if (VENDOR_DOMICILE.has(f)) continue;
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
// E-54 — une porte qui ne regarde RIEN doit échouer, pas sourire : sans ce
// plancher, un `SCAN_DIRS` vidé ou un chemin mal orthographié donnait un
// « aucun secret » parfaitement vert sur zéro fichier.
if (files.length < 600) {
  FAIL.push(
    `secret-scan :: seulement ${files.length} fichiers analysés (seuil 600) — périmètre cassé`,
  );
}
if (FAIL.length > 0) {
  console.error("SECRET-SCAN ÉCHEC :");
  for (const f of FAIL) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`OK  secret-scan (${files.length} fichiers analysés, aucun secret/bypass/map).`);
