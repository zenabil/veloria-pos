// Veloria Licensing — Vérification d'intégrité binaire (Electron main).
// Manifeste signé par le vendor au build : { files: {rel: sha256}, builtAt,
// appVersion } + signature Ed25519 du canonique. Couvre dist-electron/**,
// dist/**, resources/license/public.key, database/migrations/**,
// resources/ocr/lang/**, public/icons/** (extraResources empaquetés —
// résolus sous resourcesPath, voir resolvePackagedAbs ci-dessous).
// Packagé sans manifeste = TAMPER (le pipeline le génère toujours).
// Non packagé (dev) = ignoré (jamais distribué).

import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { canonicalJson, verifyDetachedSignature } from "./protocol";
import { sha256File } from "./hash";

export type IntegrityVerdict = "ok" | "missing" | "tampered" | "skipped-dev";

export interface IntegrityManifest {
  files: Record<string, string>;
  /** Informatif hors signature (P2 : builds reproductibles). */
  builtAt?: string;
  appVersion: string;
  signature: string;
}

/** Fichiers critiques minimaux exigés dans tout manifeste POS (fail closed). */
export const POS_MANIFEST_CRITICAL: readonly string[] = [
  "dist-electron/main/main.js",
  "dist-electron/preload/preload.js",
  "resources/license/public.key",
];

/**
 * Garde anti-manifeste-vide (P0-4) : un manifeste signé SANS fichiers — ou
 * sans les artefacts critiques — désactiverait la détection d'altération.
 * `false` = refuser (tampered). Pure — testée unitairement.
 */
export function manifestCoversCritical(files: Record<string, string>): boolean {
  const rels = Object.keys(files);
  if (rels.length === 0) return false;
  const set = new Set(rels);
  return POS_MANIFEST_CRITICAL.every((c) => set.has(c));
}

function manifestCandidates(appRoot: string): string[] {
  const out: string[] = [];
  if (appRoot) out.push(path.join(appRoot, "dist-electron", "integrity-manifest.json"));
  out.push(path.join(process.cwd(), "dist-electron", "integrity-manifest.json"));
  return out;
}

/**
 * PERF : le verdict `ok` est mémorisé 60s (horloge murale, pas l'horloge
 * licence — les tests restent déterministes). Seul `ok` est caché : tout
 * verdict `tampered`/`missing` est toujours recalculé frais (fail closed
 * immédiat, jamais de grâce pour un binaire altéré).
 */
const OK_TTL_MS = 60_000;
let okCache: { key: string; atMs: number } | null = null;

function appRoot(): string {
  try {
    return app.getAppPath();
  } catch {
    return process.cwd();
  }
}

/**
 * Résout le chemin réel d'une entrée manifeste en packagé.
 * Disposition electron-builder (voir electron-builder.yml extraResources) :
 * - dist sous l'asar (root = getAppPath).
 * - resources sous resourcesPath sans le préfixe.
 * - database sous resourcesPath/database (extraResources database/migrations).
 * - public/icons sous resourcesPath/icons (extraResources public/icons).
 * En dev : rel inchangé sous la racine.
 */
export function resolvePackagedAbs(rel: string, root: string, resourcesBase: string): string {
  if (rel.startsWith("resources/")) return path.join(resourcesBase, rel.slice("resources/".length));
  if (rel.startsWith("database/")) return path.join(resourcesBase, rel);
  if (rel.startsWith("public/icons/")) {
    return path.join(resourcesBase, "icons", rel.slice("public/icons/".length));
  }
  return path.join(root, rel);
}

/**
 * Vérifie le manifeste signé. `isPackaged=false` → skipped-dev (jamais en prod).
 * Tout écart (fichier manquant, hash différent, signature invalide) → tampered.
 * `appRootOverride` : réservé aux outils opérateur (ex. import headless lancé
 * depuis scripts/, où getAppPath() pointe le script) — jamais utilisé par l'app.
 */
export function verifyIntegrityManifest(
  publicKeyPem: string,
  isPackaged: boolean,
  report?: (rel: string) => void,
  appRootOverride?: string,
): IntegrityVerdict {
  if (!isPackaged) return "skipped-dev";
  const root = appRootOverride ?? appRoot();
  // Fraîcheur : mtime du manifeste (un seul stat) — un rebuild/resign
  // invalide le cache aussitôt ; une altération runtime sans resign expire
  // dans OK_TTL_MS au pire (les verdicts non-ok ne sont jamais cachés).
  let manifestMtime = 0;
  for (const c of manifestCandidates(root)) {
    try {
      const st = fs.statSync(c);
      if (st.mtimeMs > manifestMtime) manifestMtime = st.mtimeMs;
    } catch {
      /* candidat absent */
    }
  }
  const cacheKey = `${publicKeyPem.length}:${publicKeyPem.slice(-32)}@${root}#${manifestMtime}`;
  if (okCache && okCache.key === cacheKey && Date.now() - okCache.atMs < OK_TTL_MS) {
    return "ok";
  }
  let manifest: IntegrityManifest | null = null;
  for (const c of manifestCandidates(root)) {
    try {
      manifest = JSON.parse(fs.readFileSync(c, "utf-8")) as IntegrityManifest;
      break;
    } catch {
      /* candidat suivant */
    }
  }
  if (!manifest || typeof manifest.files !== "object" || typeof manifest.signature !== "string") {
    return "missing";
  }
  // P0-4 : un manifeste signé mais vide (ou sans artefacts critiques) est un
  // refus, jamais un `ok` — sinon un bug de signature désactive la détection.
  if (!manifestCoversCritical(manifest.files)) {
    return "tampered";
  }
  try {
    // P2 : canonique sans `builtAt` (reproductible). Repli legacy : les
    // manifestes signés avant P2 incluaient builtAt dans le corps signé.
    const bodies = [
      { appVersion: manifest.appVersion, files: manifest.files },
      ...(typeof manifest.builtAt === "string"
        ? [{ appVersion: manifest.appVersion, builtAt: manifest.builtAt, files: manifest.files }]
        : []),
    ];
    let verified = false;
    for (const body of bodies) {
      try {
        verifyDetachedSignature(canonicalJson(body), manifest.signature, publicKeyPem);
        verified = true;
        break;
      } catch {
        /* forme suivante */
      }
    }
    if (!verified) return "tampered";
  } catch {
    return "tampered";
  }
  try {
    // extraResources vit hors de l'asar : en packagé sous resourcesPath,
    // en dev sous la racine du dépôt (resourcesPath = binaire Electron).
    let packaged = false;
    try {
      packaged = app.isPackaged;
    } catch {
      packaged = false;
    }
    const resourcesBase = packaged ? process.resourcesPath : root;
    for (const [rel, hash] of Object.entries(manifest.files)) {
      // Disposition réelle (packaged = app.isPackaged RÉEL, pas le flag
      // d'enforcement) : dev = rel inchangé sous la racine ; packagé = voir
      // resolvePackagedAbs (asar vs extraResources sous resourcesPath).
      const abs = packaged ? resolvePackagedAbs(rel, root, resourcesBase) : path.join(root, rel);
      let current: string;
      try {
        current = sha256File(abs);
      } catch {
        try {
          report?.(`${rel} (illisible: ${abs})`);
        } catch {
          /* rapport best effort */
        }
        return "tampered";
      }
      if (current !== hash) {
        try {
          report?.(rel);
        } catch {
          /* rapport best effort */
        }
        return "tampered";
      }
    }
  } catch {
    return "tampered";
  }
  okCache = { key: cacheKey, atMs: Date.now() };
  return "ok";
}
