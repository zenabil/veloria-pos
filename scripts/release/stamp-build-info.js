// Veloria PoS — scripts/release/stamp-build-info.js
//
// Écrit `scripts/release/build-info.json` — la trace de build (REL-04).
// Contenu : version applicative, révision source, horodatage, environnement.
//
// La révision est lue depuis `.git/HEAD` + `.git/refs/...` DIRECTEMENT (le
// binaire `git` n'est pas garanti sur la machine de build, et l'audit l'a
// constaté absent). Si aucune révision n'est lisible, on écrit `unknown` et
// la porte `release:verify` REFUSE le livrable : mieux vaut un build refusé
// qu'un livrable non traçable.
//
// `scripts/release/build-info.json` est un artefact GÉNÉRÉ : il est ignoré par
// git (voir .gitignore) et réécrit à chaque build.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const outFile = path.join(root, "scripts", "release", "build-info.json");

function readGitRevision() {
  try {
    const gitDir = path.join(root, ".git");
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    if (head.startsWith("ref:")) {
      const ref = head.slice(4).trim();
      const refFile = path.join(gitDir, ref.replace(/[\\/]/g, path.sep));
      if (fs.existsSync(refFile)) return fs.readFileSync(refFile, "utf8").trim();
      // ref empaquetée dans packed-refs
      const packed = path.join(gitDir, "packed-refs");
      if (fs.existsSync(packed)) {
        const line = fs
          .readFileSync(packed, "utf8")
          .split(/\r?\n/)
          .find((l) => l.endsWith(` ${ref}`));
        if (line) return line.split(" ")[0].trim();
      }
      return "unknown";
    }
    if (/^[0-9a-f]{40}$/i.test(head)) return head;
    return "unknown";
  } catch {
    return "unknown";
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const revision = readGitRevision();

// Empreinte de l'arbre source (des sources embarquées) : permet de dire
// exactement CE QUI a été packagé, même si la révision est illisible.
function treeDigest() {
  const hash = crypto.createHash("sha256");
  const roots = ["src", "electron", "database/migrations"];
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|mjs|cjs|sql)$/.test(e.name)) files.push(p);
    }
  };
  for (const r of roots) {
    const abs = path.join(root, r);
    if (fs.existsSync(abs)) walk(abs);
  }
  files.sort();
  for (const f of files) {
    hash.update(path.relative(root, f).split(path.sep).join("/"));
    hash.update(fs.readFileSync(f));
  }
  return hash.digest("hex");
}

const info = {
  version: pkg.version,
  commit: revision,
  builtAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  sourceTreeSha256: treeDigest(),
};

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(info, null, 2)}\n`, "utf8");

// electron-builder lit la version depuis l'environnement : on l'exporte pour
// les scripts appelants (le script est aussi invoqué via npm run).
process.env["VELORIA_BUILD_VERSION"] = pkg.version;

console.log(`OK  build-info.json écrit (version=${info.version} commit=${info.commit.slice(0, 12)}).`);
