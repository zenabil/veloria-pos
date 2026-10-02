// Veloria PoS — Release smoke (run after packaging on clean machine).
import fs from "node:fs";
import path from "node:path";

const dist = path.join(process.cwd(), "dist", "index.html");
const main = path.join(process.cwd(), "dist-electron", "main", "main.js");
const preload = path.join(process.cwd(), "dist-electron", "preload", "preload.js");

let failed = 0;
for (const f of [
  dist,
  main,
  preload,
  "database/migrations/0001_initial_schema.sql",
  "electron-builder.yml",
]) {
  if (fs.existsSync(path.join(process.cwd(), f)) || fs.existsSync(f)) console.log(`OK  ${f}`);
  else {
    console.error(`MISSING ${f}`);
    failed++;
  }
}
// forbid dev URLs in packaged output
if (fs.existsSync(dist)) {
  const html = fs.readFileSync(dist, "utf-8");
  if (/localhost:5173|VITE_DEV_SERVER_URL/.test(html)) {
    console.error("DEV URL leaked into build");
    failed++;
  }
}
// Preload sandboxé : `preloadRequire` ne charge QUE `electron` (pas de
// require relatif). Le preload DOIT donc être bundlé en un seul fichier
// (esbuild, voir build:electron). Régression : "Unable to load preload
// script ... module not found: ../ipc/channels" (CDP, Phase 4).
const preloadJs = path.join(process.cwd(), "dist-electron", "preload", "preload.js");
if (fs.existsSync(preloadJs)) {
  const src = fs.readFileSync(preloadJs, "utf-8");
  if (/require\(["']\.\.?\//.test(src)) {
    console.error("SANDBOX RISK: dist-electron preload.js has relative require()");
    failed++;
  } else console.log("OK  preload is sandbox-safe (no relative require)");
  if (!src.includes("exposeInMainWorld")) {
    console.error("SANDBOX RISK: preload.js missing exposeInMainWorld");
    failed++;
  }
}
// Electron bundle is CommonJS under a `"type": "module"` repo root: the nested
// package.json stamp is what lets Electron boot (regression: "exports is not
// defined in ES module scope").
const epkg = path.join(process.cwd(), "dist-electron", "package.json");
if (fs.existsSync(epkg) && JSON.parse(fs.readFileSync(epkg, "utf-8")).type === "commonjs") {
  console.log("OK  dist-electron/package.json {type: commonjs}");
} else {
  console.error("MISSING dist-electron/package.json {type: commonjs} - run npm run build:electron");
  failed++;
}
// P10: License Manager smoke (même contrats que le POS : entrées, preload
// bundlé sandbox-safe, stamp CommonJS). Exécuté avec --manager ou toujours
// quand les artefacts manager existent.
const mdist = path.join(process.cwd(), "dist-license-manager-renderer", "index.html");
const mmain = path.join(
  process.cwd(),
  "dist-license-manager",
  "license-manager",
  "main",
  "main.js",
);
const mpreload = path.join(
  process.cwd(),
  "dist-license-manager",
  "license-manager",
  "preload",
  "preload.js",
);
const wantManager = process.argv.includes("--manager") || fs.existsSync(mmain);
if (wantManager) {
  for (const f of [mdist, mmain, mpreload]) {
    if (fs.existsSync(f)) console.log(`OK  ${path.relative(process.cwd(), f)}`);
    else {
      console.error(`MISSING ${path.relative(process.cwd(), f)}`);
      failed++;
    }
  }
  if (fs.existsSync(mpreload)) {
    const src = fs.readFileSync(mpreload, "utf-8");
    if (/require\(["']\.\.?\//.test(src)) {
      console.error("SANDBOX RISK: manager preload.js has relative require()");
      failed++;
    } else console.log("OK  manager preload is sandbox-safe (no relative require)");
    if (!src.includes("exposeInMainWorld")) {
      console.error("SANDBOX RISK: manager preload.js missing exposeInMainWorld");
      failed++;
    }
  }
  const mpkg = path.join(process.cwd(), "dist-license-manager", "package.json");
  if (fs.existsSync(mpkg) && JSON.parse(fs.readFileSync(mpkg, "utf-8")).type === "commonjs") {
    console.log("OK  dist-license-manager/package.json {type: commonjs}");
  } else {
    console.error("MISSING dist-license-manager/package.json {type: commonjs}");
    failed++;
  }
  const mmanifest = path.join(process.cwd(), "dist-license-manager", "integrity-manifest.json");
  if (fs.existsSync(mmanifest)) console.log("OK  dist-license-manager/integrity-manifest.json");
  else {
    console.error(
      "MISSING dist-license-manager/integrity-manifest.json - run license:integrity-manager",
    );
    failed++;
  }
}
process.exit(failed === 0 ? 0 : 1);
