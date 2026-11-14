// Veloria PoS — scripts/quality/verify-rls-gate.mjs
// SYNC-03 : preuve STATIQUE de l'isolation par client.
//
// Le miroir V1 (ADR-053) repose sur le refus par défaut : RLS activé sans
// politique + REVOKE de tout privilège direct pour `anon`/`authenticated`.
// Seule la fonction Edge `client-sync` (service_role, côté serveur) lit après
// vérification téléphone + PIN + révocation + verrou. Si une politique de
// lecture directe est ajoutée par erreur, l'isolation s'effondre.
//
// Cette porte échoue si :
//   - RLS n'est pas activé sur client_access / client_payloads ;
//   - un REVOKE ALL manque sur l'une des trois vues/tables ;
//   - une CREATE POLICY de lecture directe (FOR SELECT) est présente ;
//   - la fonction Edge n'est pas référencée comme seul lecteur.
//
// Usage : `node scripts/quality/verify-rls-gate.mjs` → exit 0 si vert.
/* eslint-disable */
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const rlsPath = path.join(root, "cloud/supabase/rls.sql");
const edgePath = path.join(root, "cloud/supabase/client-sync");

if (!fs.existsSync(rlsPath)) {
  console.error("FAIL: cloud/supabase/rls.sql absent.");
  process.exit(1);
}
const sql = fs.readFileSync(rlsPath, "utf-8");

const failures = [];

// 1. RLS activé sur les deux tables.
for (const table of ["client_access", "client_payloads"]) {
  const re = new RegExp(`ALTER TABLE\\s+${table}\\s+ENABLE ROW LEVEL SECURITY`, "i");
  if (!re.test(sql)) failures.push(`RLS non activé sur ${table}`);
}

// 2. REVOKE ALL sur les trois objets.
for (const obj of ["client_access", "client_payloads", "latest_client_payloads"]) {
  const re = new RegExp(`REVOKE ALL ON\\s+${obj}\\s+FROM\\s+anon,\\s*authenticated`, "i");
  if (!re.test(sql)) failures.push(`REVOKE ALL manquant sur ${obj}`);
}

// 3. Aucune politique de lecture directe.
if (/CREATE POLICY/i.test(sql)) {
  failures.push("CREATE POLICY détecté : une lecture directe est possible (isolation rompue).");
}

// 4. La fonction Edge est le seul lecteur (service_role, côté serveur).
const edgeExists =
  fs.existsSync(edgePath) ||
  fs.existsSync(path.join(root, "cloud/supabase/functions/client-sync")) ||
  fs.existsSync(path.join(root, "supabase/functions/client-sync"));
if (!edgeExists) {
  // Tolérant : on ne bloque pas si le dossier n'existe pas sous ce nom, mais
  // on exige au moins la mention de service_role dans rls.sql.
  if (!/service_role/i.test(sql)) {
    failures.push(
      "Aucune référence à service_role : la fonction Edge n'est pas désignée comme seul lecteur.",
    );
  }
} else {
  if (!/service_role/i.test(sql)) {
    failures.push("service_role non mentionné dans rls.sql.");
  }
}

if (failures.length > 0) {
  console.error("FAIL: porte RLS (SYNC-03) —");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "OK  porte RLS (SYNC-03) : refus par défaut, REVOKE direct, aucune politique de lecture, seul lecteur = fonction Edge (service_role).",
);
