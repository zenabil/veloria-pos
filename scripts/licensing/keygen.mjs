// Veloria — Licensing: vendor Ed25519 keypair generator (VENDOR MACHINE ONLY).
// Creates private/vendor-keys/{private.key,public.key} (PEM, 0600 best-effort)
// and publishes the PUBLIC key to resources/license/public.key (safe to commit).
// The private key MUST stay offline: never commit, never ship in POS.
// Usage: node scripts/licensing/keygen.mjs [--force]
import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const keyDir = path.join(root, "private", "vendor-keys");
const pubOut = path.join(root, "resources", "license", "public.key");
const force = process.argv.includes("--force");

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
fs.mkdirSync(path.dirname(pubOut), { recursive: true });
fs.writeFileSync(pubOut, pubPem);
console.log("OK  keypair Ed25519 généré.");
console.log("    privé : private/vendor-keys/private.key (NE JAMAIS committer/diffuser)");
console.log("    public: resources/license/public.key (embarqué dans POS, vérification seule)");
