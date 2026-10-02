// Veloria PoS — scripts/release/stamp-electron-pkg.js
// The Electron main/preload bundle is compiled as CommonJS (tsconfig.electron.json),
// while the repo root is `"type": "module"` (Vite/vitest ESM). Node/Electron resolve
// the module format via the NEAREST package.json, so stamp dist-electron/ with
// {"type":"commonjs"} after every electron build. Without this, Electron >= 22
// treats dist-electron/main/main.js as ESM and crashes with
// "exports is not defined in ES module scope" (found during Phase 3 runtime QA).
import fs from "node:fs";
import path from "node:path";

for (const dir of ["dist-electron", "dist-license-manager"]) {
  const out = path.join(process.cwd(), dir, "package.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ type: "commonjs" }, null, 2) + "\n");
  console.log(`OK  ${dir}/package.json stamped {type: commonjs}`);
}
