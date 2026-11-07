// Veloria PoS — scripts/release/checksums.js
// Génère release/SHA256SUMS.txt (spec 26 : hashes vérifiables par l'ops).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const dir = path.join(process.cwd(), "release");
// Les APK sont des livrables au même titre que les .exe : les exclure laissait
// `SHA256SUMS.txt` muet sur les deux tiers de la distribution, et les sidecars
// `*.apk.sha256` écrits à la main finissaient par désigner une autre build
// (mesuré 2026-11-07 : `706f1371…` publié pour un fichier `dcb11601…`).
const DELIVERABLE_EXT = /\.(exe|apk)$/i;
const files = fs
  .readdirSync(dir)
  .filter((f) => DELIVERABLE_EXT.test(f))
  .sort();
if (files.length === 0) {
  console.error("FAIL: aucun .exe/.apk dans release/ — packagez d'abord.");
  process.exit(1);
}
const lines = files.map((f) => {
  const sum = crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(dir, f)))
    .digest("hex");
  // Sidecars régénérés ici : plus jamais une empreinte périmée à côté d'un
  // livrable neuf (c'est elle qui a fait douter d'un APK correct).
  fs.writeFileSync(path.join(dir, `${f}.sha256`), `${sum} *${f}\n`);
  console.log(`${sum}  ${f}`);
  return `${sum}  ${f}`;
});
fs.writeFileSync(path.join(dir, "SHA256SUMS.txt"), lines.join("\n") + "\n");
console.log("OK  release/SHA256SUMS.txt");
