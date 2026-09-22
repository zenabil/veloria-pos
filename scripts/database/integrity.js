// Veloria PoS — scripts/database/integrity.js
// Contrôle d'intégrité hors-ligne (lecture seule, sans dépendances).
// Usage : `npm run db:integrity [-- --db="C:\...\Veloria POS DB.sqlite"]`
// N'ouvre JAMAIS la base en écriture : migrations = démarrage applicatif.
/* eslint-disable @typescript-eslint/explicit-function-return-type -- script JS ops sans types */
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PHYSICAL = "Veloria POS DB.sqlite";

const defaultCandidates = () => {
  const out = [];
  const programData =
    process.env.PROGRAMDATA ?? path.join(process.env.APPDATA ?? "", "..", "ProgramData");
  out.push(path.join(programData, "Veloria PoS", "Data", PHYSICAL));
  if (process.env.APPDATA) {
    out.push(path.join(process.env.APPDATA, "veloria-pos", "Data", PHYSICAL));
    out.push(path.join(process.env.APPDATA, "Veloria PoS", "Data", PHYSICAL));
  }
  return out;
};

const resolveDbPath = () => {
  const arg = process.argv.find((a) => a.startsWith("--db="));
  if (arg) return arg.slice("--db=".length).replace(/^"|"$/g, "");
  // Chemin configuré par l'application (Paramètres > Base de données >
  // Déplacer) : prioritaire, sinon on contrôlerait une copie périmée.
  if (process.env.APPDATA) {
    try {
      const raw = fs.readFileSync(
        path.join(process.env.APPDATA, "Veloria PoS", "config.json"),
        "utf-8",
      );
      const cfg = JSON.parse(raw);
      if (
        typeof cfg.dbPath === "string" &&
        cfg.dbPath.endsWith(".sqlite") &&
        fs.existsSync(cfg.dbPath)
      ) {
        return cfg.dbPath;
      }
    } catch {
      // config absente/illisible : repli sur les emplacements par défaut
    }
  }
  const found = defaultCandidates().find((p) => fs.existsSync(p));
  if (!found) {
    console.error("FAIL: base introuvable. Chemins essayés :");
    for (const p of defaultCandidates()) console.error(`  - ${p}`);
    console.error('Astuce : npm run db:integrity -- --db="C:\\chemin\\Veloria POS DB.sqlite"');
    process.exit(2);
  }
  return found;
};

const dbPath = resolveDbPath();
console.log(`Base : ${dbPath}`);
const db = new DatabaseSync(dbPath, { readOnly: true });

let failed = 0;
const check = (label, fn) => {
  try {
    const detail = fn();
    console.log(`OK  ${label}${detail ? ` — ${detail}` : ""}`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${label} — ${err instanceof Error ? err.message : String(err)}`);
  }
};

check("integrity_check", () => {
  const row = db.prepare("PRAGMA integrity_check").get();
  if (row.integrity_check !== "ok") throw new Error(JSON.stringify(row).slice(0, 300));
  return "ok";
});

check("foreign_key_check", () => {
  const rows = db.prepare("PRAGMA foreign_key_check").all();
  if (rows.length !== 0) throw new Error(`${rows.length} violation(s)`);
  return "0 violation";
});

check("schema_migrations", () => {
  // P2 : seuils dynamiques — lus du dossier embarqué, jamais soudés.
  const dir = path.join(process.cwd(), "database", "migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const versions = files.map((f) => Number((f.match(/^(\d+)_/) ?? [])[1]));
  const maxFile = Math.max(...versions);
  const row = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get();
  if (row.v !== maxFile) {
    throw new Error(`base v${row.v} ≠ embarqué v${maxFile} (${files.length} fichiers)`);
  }
  return `version ${row.v} (${files.length} fichiers)`;
});

check("checksums", () => {
  // P2 : dérive détectée — même algorithme que sqlite.service (sha256 du .sql).
  const dir = path.join(process.cwd(), "database", "migrations");
  const applied = db.prepare("SELECT version, checksum FROM schema_migrations").all();
  let n = 0;
  for (const r of applied) {
    const prefix = `${String(r.version).padStart(4, "0")}_`;
    const file = fs.readdirSync(dir).find((x) => x.startsWith(prefix) && x.endsWith(".sql"));
    if (!file) throw new Error(`migration ${r.version} appliquée mais fichier absent (drift)`);
    const sum = createHash("sha256")
      .update(fs.readFileSync(path.join(dir, file), "utf-8"))
      .digest("hex");
    if (sum !== r.checksum) {
      throw new Error(`migration ${r.version} modifiée après release (checksum)`);
    }
    n++;
  }
  return `${n} checksums`;
});

check("compteurs", () => {
  const s = db.prepare("SELECT COUNT(*) AS c FROM sales").get().c;
  const p = db.prepare("SELECT COUNT(*) AS c FROM products").get().c;
  const c = db.prepare("SELECT COUNT(*) AS c FROM customers").get().c;
  return `${s} vente(s), ${p} produit(s), ${c} client(s)`;
});

db.close();
if (failed > 0) {
  console.error(`INTEGRITY FAILED (${failed} contrôle(s))`);
  process.exit(1);
}
console.log("INTEGRITY VERIFIED");
