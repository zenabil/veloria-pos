// Veloria PoS — Licensing: hachage streaming partagé (zéro dépendance).
// P2 : source unique du SHA-256 64 KiB-chunked (backup.service, integrity.ts,
// integrity-check manager). Mémoire bornée même sur gros bundles/WASM.
// Node builtins uniquement — importable par le main POS comme par le Manager.
import { createHash } from "node:crypto";
import fs from "node:fs";

export function sha256File(p: string): string {
  const h = createHash("sha256");
  const fd = fs.openSync(p, "r");
  try {
    const buf = Buffer.alloc(64 * 1024);
    let n = fs.readSync(fd, buf, 0, buf.length, null);
    while (n > 0) {
      h.update(n >= buf.length ? buf : buf.subarray(0, n));
      n = fs.readSync(fd, buf, 0, buf.length, null);
    }
  } finally {
    fs.closeSync(fd);
  }
  return h.digest("hex");
}
