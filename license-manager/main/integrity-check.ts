// Veloria License Manager — Vérification d'intégrité au démarrage.
// Miroir de electron/licensing/integrity.ts (POS) restreint au périmètre
// manager : dist-license-manager/** + dist-license-manager-renderer/** +
// resources/license/public.key, manifest signé Ed25519 (clé vendor).
// Non-packagé (dev vendor) : skipped-dev. Packagé sans manifeste ou avec
// hash/signature invalide : démarrage refusé (fail-closed).

import { app, dialog } from "electron";
import { createPublicKey, verify } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sha256File } from "../../electron/licensing/hash";

// Miroir local de canonicalJson (protocol.ts + scripts) : ce module ne doit
// dépendre d'aucun runtime POS.
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

function manifestCandidates(): string[] {
  const out: string[] = [];
  try {
    out.push(path.join(__dirname, "..", "..", "integrity-manifest.json"));
  } catch {
    /* ignore */
  }
  try {
    out.push(path.join(app.getAppPath(), "dist-license-manager", "integrity-manifest.json"));
  } catch {
    /* ignore */
  }
  return out;
}

function publicKeyCandidates(): string[] {
  const out: string[] = [];
  try {
    out.push(path.join(process.resourcesPath, "license", "public.key"));
  } catch {
    /* hors packagé */
  }
  try {
    out.push(path.join(app.getAppPath(), "resources", "license", "public.key"));
  } catch {
    /* ignore */
  }
  out.push(path.join(process.cwd(), "resources", "license", "public.key"));
  return out;
}

export type ManagerIntegrityVerdict = "ok" | "skipped-dev" | "missing" | "tampered";

/** Fichiers critiques minimaux exigés dans tout manifeste Manager (fail closed). */
export const MANAGER_MANIFEST_CRITICAL: readonly string[] = [
  "dist-license-manager/license-manager/main/main.js",
  // P2 : le schéma Manager est embarqué ici (pas de database/migrations livré).
  "dist-license-manager/license-manager/db/manager-db.js",
  "dist-license-manager-renderer/index.html",
  "resources/license/public.key",
];

/**
 * Garde anti-manifeste-vide (P0-4, miroir POS) : manifeste signé SANS fichiers
 * ou sans artefacts critiques = refus. Pure — testée unitairement.
 */
export function managerManifestCoversCritical(files: Record<string, string>): boolean {
  const rels = Object.keys(files);
  if (rels.length === 0) return false;
  const set = new Set(rels);
  return MANAGER_MANIFEST_CRITICAL.every((c) => set.has(c));
}

export function checkManagerIntegrity(): { verdict: ManagerIntegrityVerdict; detail: string } {
  let packaged = false;
  try {
    packaged = app.isPackaged === true;
  } catch {
    packaged = false;
  }
  if (!packaged) return { verdict: "skipped-dev", detail: "dev" };
  let manifestPath: string | null = null;
  let manifestRaw = "";
  for (const c of manifestCandidates()) {
    try {
      manifestRaw = fs.readFileSync(c, "utf-8");
      manifestPath = c;
      break;
    } catch {
      /* candidat suivant */
    }
  }
  if (!manifestPath) return { verdict: "missing", detail: "integrity-manifest.json absent" };
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(manifestRaw) as Record<string, unknown>;
  } catch {
    return { verdict: "tampered", detail: "manifeste illisible" };
  }
  const manifestObj = manifest as {
    signature?: unknown;
    appVersion?: unknown;
    files?: unknown;
    app?: unknown;
    builtAt?: unknown;
  };
  const { signature } = manifestObj;
  if (typeof signature !== "string") return { verdict: "tampered", detail: "signature absente" };
  let pubPem: string | null = null;
  for (const c of publicKeyCandidates()) {
    try {
      const pem = fs.readFileSync(c, "utf-8");
      if (pem.includes("BEGIN PUBLIC KEY")) {
        pubPem = pem;
        break;
      }
    } catch {
      /* candidat suivant */
    }
  }
  if (!pubPem) return { verdict: "missing", detail: "clé publique absente" };
  let key;
  try {
    key = createPublicKey(pubPem);
  } catch {
    return { verdict: "tampered", detail: "clé publique invalide" };
  }
  const sig = Buffer.from(signature, "base64url");
  // P2 : canonique sans `builtAt` (reproductible) + repli legacy pré-P2.
  const bodies: Array<Record<string, unknown>> = [
    { appVersion: manifestObj.appVersion, files: manifestObj.files, app: manifestObj.app },
  ];
  if (typeof manifestObj.builtAt === "string") {
    bodies.push({
      appVersion: manifestObj.appVersion,
      builtAt: manifestObj.builtAt,
      files: manifestObj.files,
      app: manifestObj.app,
    });
  }
  let okSig = false;
  for (const body of bodies) {
    try {
      if (verify(null, Buffer.from(canonicalJson(body), "utf8"), key, sig)) {
        okSig = true;
        break;
      }
    } catch {
      /* forme suivante */
    }
  }
  if (!okSig) return { verdict: "tampered", detail: "signature invalide" };
  const files =
    manifestObj.files !== null && typeof manifestObj.files === "object"
      ? (manifestObj.files as Record<string, string>)
      : undefined;
  if (!files || typeof files !== "object") return { verdict: "tampered", detail: "liste vide" };
  // P0-4 : manifeste signé mais vide/incomplet = refus (jamais `ok`).
  if (!managerManifestCoversCritical(files)) {
    return { verdict: "tampered", detail: "manifeste vide ou incomplet" };
  }
  // Base = dossier contenant dist-license-manager/ (racine app, DANS l'asar).
  // MAIS `resources/license/**` vit HORS asar (extraResources) : comme le POS
  // (`resolvePackagedAbs`), ce préfixe se résout vers resourcesPath. Sans ce
  // routage, le contrôle échouait en packagé avec « fichier manquant
  // resources/license/public.key » alors que le fichier est bien livré.
  const base = path.dirname(path.dirname(manifestPath));
  const resolveFileAbs = (rel: string): string => {
    if (rel === "resources/license/public.key" || rel.startsWith("resources/license/")) {
      try {
        return path.join(process.resourcesPath, rel.slice("resources/".length));
      } catch {
        /* repli : base asar (échec explicite plus bas) */
      }
    }
    return path.join(base, rel);
  };
  for (const [rel, expected] of Object.entries(files)) {
    if (rel.includes("..")) return { verdict: "tampered", detail: `chemin interdit ${rel}` };
    // P2 : hachage streaming partagé (mémoire bornée, même condensé).
    let actual: string;
    try {
      actual = sha256File(resolveFileAbs(rel));
    } catch {
      return { verdict: "tampered", detail: `fichier manquant ${rel}` };
    }
    if (actual !== expected) return { verdict: "tampered", detail: `hash modifié ${rel}` };
  }
  return { verdict: "ok", detail: `${Object.keys(files).length} fichiers` };
}

/** Garde de démarrage : en packagé altéré, boîte d'erreur FR puis sortie. */
export function enforceManagerIntegrityOrQuit(): boolean {
  const res = checkManagerIntegrity();
  if (res.verdict === "ok" || res.verdict === "skipped-dev") return true;
  try {
    dialog.showErrorBox(
      "Intégrité compromise",
      `Veloria License Manager : contrôle d'intégrité échoué (${res.detail}). Réinstallez l'outil vendor.`,
    );
  } catch {
    /* pas de dialogue : sortie directe */
  }
  try {
    app.quit();
  } catch {
    /* ignore */
  }
  return false;
}
