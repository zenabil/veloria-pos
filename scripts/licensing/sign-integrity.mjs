// Veloria — Licensing: signature du manifeste d'intégrité (MACHINE VENDOR).
// Après `build` + `build:electron`, hache dist-electron/** + dist/** +
// resources/license/public.key puis signe le canonique avec la clé PRIVÉE.
// Le POS packagé vérifie ce manifeste au démarrage (TAMPER_DETECTED sinon).
// Usage: npm run license:integrity (inclus dans package:pos)
import { createHash, sign } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const privCandidates = [path.join(root, "private", "vendor-keys", "private.key")];
const outManifest = path.join(root, "dist-electron", "integrity-manifest.json");

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  const entries = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

function walk(dir, base, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = path.relative(base, p).replace(/\\/g, "/");
    if (e.isDirectory()) {
      walk(p, base, out);
    } else if (e.isFile() && rel !== "dist-electron/integrity-manifest.json") {
      // Les déclarations de types (*.d.ts, *.tsbuildinfo) ne sont jamais
      // chargées à l'exécution et ne sont pas garanties dans l'asar :
      // les signer produisait de faux TAMPER à l'activation (ex.
      // dist-electron/backup/backup.service.d.ts illisible en packagé).
      // Seuls les fichiers exécutables/embarqués (.js, .html, assets,
      // public.key) sont couverts — impact sécurité nul.
      if (rel.endsWith(".d.ts") || rel.endsWith(".tsbuildinfo")) continue;
      // ADR-051 : sorties electron-builder sous dist/ (jamais des entrées) —
      // `builder-debug.yml` / `builder-effective-config.yaml` sont RÉÉCRITS à
      // chaque packaging, `win-unpacked/` + `*.exe` sont des PRODUITS : les
      // signer invalidait le manifeste au build suivant (faux TAMPER
      // systématique en packagé, fichier `dist/builder-debug.yml`).
      if (
        rel === "dist/builder-debug.yml" ||
        rel === "dist/builder-effective-config.yaml" ||
        rel.startsWith("dist/win-unpacked/") ||
        (rel.startsWith("dist/") && rel.endsWith(".exe") && !rel.slice(5).includes("/"))
      )
        continue;
      out.push(rel);
    }
  }
}

// `--if-key-present` : mode « re-signature opportuniste » réservé aux hooks
// automatiques (`posttypecheck` ADR-042, `build:electron`). Sans clé (CI,
// poste dev sans clé vendor), signer est impossible et RAS — il n'y a rien à
// re-signer. Les scripts `package*` appellent `license:integrity` SANS ce
// flag : le packaging reste strict (échec sans clé), et le POS packagé échoue
// fermé (TAMPER) si le manifeste venait à manquer.
const ifKeyPresent = process.argv.includes("--if-key-present");

let priv = null;
for (const c of privCandidates) {
  try {
    const pem = fs.readFileSync(c, "utf-8");
    if (pem.includes("PRIVATE KEY")) {
      priv = pem;
      break;
    }
  } catch {
    /* suivant */
  }
}
if (!priv) {
  if (ifKeyPresent) {
    console.log(
      "SKIP integrity: clé vendor absente (private/vendor-keys/private.key) — re-signature sautée (hook automatique).",
    );
    process.exit(0);
  }
  console.error("ÉCHEC: clé privée vendor introuvable (private/vendor-keys/private.key).");
  process.exit(1);
}
let appVersion = "0.0.0";
try {
  appVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8")).version;
} catch {
  /* défaut */
}

const rels = [];
for (const d of ["dist-electron", "dist"]) {
  const abs = path.join(root, d);
  if (fs.existsSync(abs)) walk(abs, root, rels);
}
const pubKey = path.join(root, "resources", "license", "public.key");
if (fs.existsSync(pubKey)) rels.push("resources/license/public.key");
// BL-03: migrations + assets OCR + icônes (extraResources empaquetés hors
// dist/*) — toute altération post-build est détectée (TAMPER).
for (const extra of ["database/migrations", "resources/ocr/lang", "public/icons"]) {
  const abs = path.join(root, extra);
  if (fs.existsSync(abs)) walk(abs, root, rels);
}
rels.sort();

// P0-4 : un manifeste vide (ou sans artefacts critiques) désactiverait la
// détection d'altération — le build ÉCHOUE au lieu de signer du vide.
if (rels.length === 0) {
  console.error("ÉCHEC: manifeste vide — aucun fichier à signer, build refusé.");
  process.exit(1);
}
for (const c of [
  "dist-electron/main/main.js",
  "dist-electron/preload/preload.js",
  "resources/license/public.key",
]) {
  if (!rels.includes(c)) {
    console.error(`ÉCHEC: artefact critique absent du manifeste — ${c}, build refusé.`);
    process.exit(1);
  }
}

const files = {};
for (const rel of rels) {
  const h = createHash("sha256");
  h.update(fs.readFileSync(path.join(root, rel)));
  files[rel] = h.digest("hex");
}
// P2 : builds reproductibles — `builtAt` est INFORMATIF (hors signature) :
// le canonique signé { appVersion, files } est stable à code identique.
const builtAt = new Date().toISOString();
const body = { appVersion, files };
const signature = sign(null, Buffer.from(canonicalJson(body), "utf8"), priv).toString("base64url");
fs.writeFileSync(outManifest, JSON.stringify({ ...body, builtAt, signature }, null, 2));
console.log(`OK  integrity-manifest signé (${rels.length} fichiers, v${appVersion}).`);
