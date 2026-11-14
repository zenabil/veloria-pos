// Veloria — Licensing: vendor Ed25519 keypair generator (VENDOR MACHINE ONLY).
//
// ÉMISSION D'UNE CLÉ DE VÉRIFICATION (LIC-02 / LIC-04).
//
// CE QUE CE SCRIPT FAIT (et pourquoi c'est important) :
//
//   1. SÉPARATION DES CYCLES DE VIE (LIC-02) :
//      La version précédente écrivait la clé publique DIRECTEMENT dans
//      `resources/license/public.key` — l'ancre de confiance SHIPPÉE. Il
//      suffisait donc de lancer ce script en local pour changer la clé que
//      TOUS les POS clients vont charger la cle suivante. Le cycle de vie de
//      développement et celui de production n'étaient pas séparés.
//
//      Maintenant :
//        - SANS `--production` : la clé est écrite dans
//          `private/vendor-keys/` et dans un emplacement de DÉVELOPPEMENT
//          (`private/dev-keys/public.key`). Elle NE MODIFIE PAS l'ancre
//          embarquée.
//        - AVEC `--production` : la clé est PUBLIÉE dans le jeu de clés
//          (`resources/license/keys.json`) sous un NOUVEL identifiant, et
//          l'ancienne clé est CONSERVÉE dans le jeu (période de
//          recouvrement) — les licences déjà émises restent valides.
//
//   2. ROTATION SANS INVALIDATION (LIC-04) :
//      Le jeu `resources/license/keys.json` associe un `kid` à chaque clé
//      publique de vérification. Une rotation AJOUTE une clé et change
//      `active` ; elle ne REMPLACE rien.
//
//   3. DÉFAUT FAIL-CLOSED : la clé privée est écrite en 0600 (best effort)
//      et n'est JAMAIS écrite dans `resources/` (jamais embarquée).
//
// Usage :
//   node scripts/licensing/keygen.mjs                    # clé de DÉVELOPPEMENT
//   node scripts/licensing/keygen.mjs --production       # clé de PRODUCTION
//   node scripts/licensing/keygen.mjs --production --kid k3
import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const keyDir = path.join(root, "private", "vendor-keys");
const devKeyDir = path.join(root, "private", "dev-keys");
const legacyPubOut = path.join(root, "resources", "license", "public.key");
const keySetPath = path.join(root, "resources", "license", "keys.json");
const production = process.argv.includes("--production");
const force = process.argv.includes("--force");
const kidArg = process.argv.indexOf("--kid");
const kid = kidArg >= 0 ? process.argv[kidArg + 1] : null;

if (!production) {
  console.log("OK  mode DÉVELOPPEMENT : la clé n'est PAS publiée dans resources/license/.");
  console.log("    Pour publier une clé de production : --production (rotation du jeu de clés).");
}

if (production && !kid) {
  console.error(
    "REFUS: --production exige --kid <identifiant> (ex. --kid k2). L'identifiant\n" +
      "       rend la rotation explicite et tracée (et permet de conserver l'ancienne\n" +
      "       clé pendant la période de recouvrement).",
  );
  process.exit(1);
}

if (kid !== null && !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(kid)) {
  console.error("REFUS: --kid invalide (minuscules, chiffres, - et _ ; 1..32 caractères).");
  process.exit(1);
}

if (fs.existsSync(path.join(keyDir, "private.key")) && !force) {
  console.error(
    "REFUS: private/vendor-keys/private.key existe déjà. Relisez docs/licensing/KEY_MANAGEMENT.md (rotation) ou relancez avec --force.",
  );
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pubPem = publicKey.export({ type: "spki", format: "pem" });
const privPem = privateKey.export({ type: "pkcs8", format: "pem" });

fs.mkdirSync(keyDir, { recursive: true });
fs.writeFileSync(path.join(keyDir, "private.key"), privPem, { mode: 0o600 });
fs.writeFileSync(path.join(keyDir, "public.key"), pubPem, { mode: 0o600 });
try {
  fs.chmodSync(path.join(keyDir, "private.key"), 0o600);
} catch {
  /* Windows ACL: voir doc */
}

if (!production) {
  // Développement : la clé vit dans `private/` (jamais embarqué, gitignoré).
  fs.mkdirSync(devKeyDir, { recursive: true });
  fs.writeFileSync(path.join(devKeyDir, "public.key"), pubPem, { mode: 0o600 });
  console.log("OK  keypair Ed25519 de DÉVELOPPEMENT généré.");
  console.log("    privé : private/vendor-keys/private.key (NE JAMAIS committer/diffuser)");
  console.log("    public: private/dev-keys/public.key (NON embarqué)");
  console.log("    L'ancre embarquée (resources/license/) n'a PAS été modifiée — c'est le but.");
  process.exit(0);
}

// Production : publication dans le JEU de clés (jamais le remplacement
// aveugle de `public.key`).
let keySet = { schema: 1, active: kid, keys: {} };
if (fs.existsSync(keySetPath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(keySetPath, "utf-8"));
    if (parsed && typeof parsed === "object" && parsed.keys && typeof parsed.keys === "object") {
      keySet = {
        schema: 1,
        active: typeof parsed.active === "string" ? parsed.active : kid,
        keys: { ...parsed.keys },
      };
    }
  } catch {
    console.error(
      "REFUS: resources/license/keys.json est illisible. Un jeu de clés corrompu ne\n" +
        "       doit JAMAIS être écrasé silencieusement (des licences émises avec\n" +
        "       l'ancienne clé deviendraient invérifiables). Répare le fichier à la main.",
    );
    process.exit(1);
  }
}
if (keySet.keys[kid]) {
  console.error(
    `REFUS: l'identifiant '${kid}' existe déjà dans le jeu de clés. Choisis un autre\n` +
      "       identifiant (ou supprime explicitement l'ancienne clé après la fin de\n" +
      "       la période de recouvrement).",
  );
  process.exit(1);
}
keySet.keys[kid] = pubPem;
keySet.active = kid;
fs.mkdirSync(path.dirname(keySetPath), { recursive: true });
fs.writeFileSync(keySetPath, `${JSON.stringify(keySet, null, 2)}\n`, "utf-8");

// `public.key` restealigné sur la clé ACTIVE (compatibilité 1.0.x : les
// installations existantes ne connaissent que ce fichier). C'est une
// ALIGNEMENT, pas un remplacement : le jeu conserve toutes les clés.
fs.writeFileSync(legacyPubOut, pubPem);

console.log(`OK  keypair Ed25519 de PRODUCTION généré (kid=${kid}).`);
console.log("    privé : private/vendor-keys/private.key (NE JAMAIS committer/diffuser)");
console.log(
  `    jeu   : resources/license/keys.json (${Object.keys(keySet.keys).length} clé(s), active=${kid})`,
);
console.log("    public.key aligné sur la clé active (compatibilité 1.0.x)");
console.log("    Les licences émises avec les clés précédentes restent valibles (recouvrement).");
