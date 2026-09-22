// Veloria — Licensing: manifeste d'intégrité du LICENSE MANAGER (MACHINE VENDOR).
// Miroir de sign-integrity.mjs (POS) : hache dist-license-manager/** +
// dist-license-manager-renderer/** + resources/license/public.key puis signe
// le canonique avec la clé PRIVÉE. Le Manager packagé vérifie ce manifeste au
// démarrage (quitte en cas d'altération, voir main.ts).
// Usage: npm run license:integrity-manager (inclus dans package:manager)
import { createHash, sign } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const privCandidates = [path.join(root, "private", "vendor-keys", "private.key")];
const outManifest = path.join(root, "dist-license-manager", "integrity-manifest.json");

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
    } else if (
      e.isFile() &&
      rel !== "dist-license-manager/integrity-manifest.json" &&
      !rel.endsWith(".d.ts") &&
      !rel.endsWith(".tsbuildinfo")
    ) {
      out.push(rel);
    }
  }
}

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
for (const d of ["dist-license-manager", "dist-license-manager-renderer"]) {
  const abs = path.join(root, d);
  if (fs.existsSync(abs)) walk(abs, root, rels);
}
const pubKey = path.join(root, "resources", "license", "public.key");
if (fs.existsSync(pubKey)) rels.push("resources/license/public.key");
rels.sort();

// P0-4 (miroir POS) : manifeste vide ou incomplet = build refusé.
if (rels.length === 0) {
  console.error("ÉCHEC: manifeste manager vide — aucun fichier à signer, build refusé.");
  process.exit(1);
}
// P2 : le schéma Manager est embarqué dans manager-db.js (pas de dossier
// migrations livré) — ce module compilé est donc critique, comme le main.
for (const c of [
  "dist-license-manager/license-manager/main/main.js",
  "dist-license-manager/license-manager/db/manager-db.js",
  "dist-license-manager-renderer/index.html",
  "resources/license/public.key",
]) {
  if (!rels.includes(c)) {
    console.error(`ÉCHEC: artefact critique absent du manifeste manager — ${c}, build refusé.`);
    process.exit(1);
  }
}

const files = {};
for (const rel of rels) {
  const h = createHash("sha256");
  h.update(fs.readFileSync(path.join(root, rel)));
  files[rel] = h.digest("hex");
}
// P2 : builds reproductibles — `builtAt` informatif hors signature.
const builtAt = new Date().toISOString();
const body = { appVersion, files, app: "veloria-license-manager" };
const signature = sign(null, Buffer.from(canonicalJson(body), "utf8"), priv).toString("base64url");
fs.writeFileSync(outManifest, JSON.stringify({ ...body, builtAt, signature }, null, 2));
console.log(`OK  manager integrity-manifest signé (${rels.length} fichiers, v${appVersion}).`);
