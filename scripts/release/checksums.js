// Veloria PoS — scripts/release/checksums.js
// Génère release/SHA256SUMS.txt (spec 26 : hashes vérifiables par l'ops).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const dir = path.join(process.cwd(), "release");
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".exe"))
  .sort();
if (files.length === 0) {
  console.error("FAIL: aucun .exe dans release/ — packagez d'abord.");
  process.exit(1);
}
const lines = files.map((f) => {
  const sum = crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(dir, f)))
    .digest("hex");
  console.log(`${sum}  ${f}`);
  return `${sum}  ${f}`;
});
fs.writeFileSync(path.join(dir, "SHA256SUMS.txt"), lines.join("\n") + "\n");
console.log("OK  release/SHA256SUMS.txt");
