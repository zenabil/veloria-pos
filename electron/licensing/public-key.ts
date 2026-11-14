// Veloria Licensing — Chargement des clés PUBLIQUES de vérification (LIC-04).
//
// Source unique : `resources/license/` (packagé).
//   - `public.key`  : la clé historique (clé unique). CONSERVÉE — c'est
//                     l'ancre de confiance des installations 1.0.x.
//   - `keys.json`   : le JEU de clés (optionnel). Quand il est présent,
//                     il permet la rotation SANS invalider les licences
//                     déjà émises (voir key-set.ts).
//
// Échec fermé (fail-closed) : sans clé exploitable, aucune activation n'est
// possible. AUCUNE variable d'environnement, AUCUN chemin configurable : un
// attaquant local ne doit pas pouvoir substituer sa propre clé par
// configuration.

import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { isUsablePublicKey, keySetFromSinglePem, parseKeySet, type LicenseKeySet } from "./key-set";

let cachedLegacyPem: string | null = null;
let cachedKeySet: LicenseKeySet | null = null;
let cachedKeySetLoaded = false;

/** Racine des ressources de licence (packagée en priorité). */
function licenseResourceDirs(): string[] {
  const out: string[] = [];
  try {
    out.push(path.join(process.resourcesPath, "license"));
  } catch {
    /* hors runtime packagé */
  }
  let packaged = false;
  try {
    packaged = app.isPackaged;
  } catch {
    packaged = false;
  }
  // EL-11 : en production packagée, SEULE resourcesPath (pas de fallback cwd
  // substituable). Les replis dev ne sont proposés qu'en non-packagé.
  if (packaged) return out;
  try {
    out.push(path.join(app.getAppPath(), "resources", "license"));
  } catch {
    /* ignore */
  }
  out.push(path.join(process.cwd(), "resources", "license"));
  return out;
}

/** Clé publique PEM historique. Lève LICENSE_KEY_UNAVAILABLE (jamais de détail). */
export function getEmbeddedPublicKey(): string {
  if (cachedLegacyPem) return cachedLegacyPem;
  for (const dir of licenseResourceDirs()) {
    try {
      const pem = fs.readFileSync(path.join(dir, "public.key"), "utf-8");
      if (pem.includes("BEGIN PUBLIC KEY")) {
        cachedLegacyPem = pem;
        return pem;
      }
    } catch {
      /* candidat suivant */
    }
  }
  throw new Error("LICENSE_KEY_UNAVAILABLE");
}

/**
 * Jeu de clés de vérification, ou `null` s'il n'est pas disponible.
 *
 * `null` n'est PAS une erreur : le POS retombe alors sur la clé unique
 * historique (`public.key`) — le comportement historique, inchangé. C'est ce
 * qui rend l'ajout du jeu de clés STRICTEMENT ADDITIF : une installation
 * existante (sans `keys.json`) continue de fonctionner à l'identique.
 */
export function getEmbeddedKeySet(): LicenseKeySet | null {
  if (cachedKeySetLoaded) return cachedKeySet;
  cachedKeySetLoaded = true;
  for (const dir of licenseResourceDirs()) {
    try {
      const raw = fs.readFileSync(path.join(dir, "keys.json"), "utf-8");
      const set = parseKeySet(raw);
      if (set) {
        // Un `kid` absent de `public.key` : on l'AJOUTE au jeu pour que la
        // clé historique reste vérifiable (une licence v1 signée par elle).
        const legacy = safeLegacyPem();
        if (legacy && !set.keys["k1"]) {
          set.keys["k1"] = legacy;
        }
        cachedKeySet = set;
        return set;
      }
    } catch {
      /* fichier absent ou illisible : on garde le comportement historique */
    }
  }
  // Pas de `keys.json` : on fabrique un jeu à partir de la clé unique, ce
  // qui rend le chemin de code identique dans les deux cas.
  try {
    const legacy = getEmbeddedPublicKey();
    cachedKeySet = keySetFromSinglePem(legacy);
    return cachedKeySet;
  } catch {
    cachedKeySet = null;
    return null;
  }
}

function safeLegacyPem(): string | null {
  try {
    const pem = getEmbeddedPublicKey();
    return isUsablePublicKey(pem) ? pem : null;
  } catch {
    return null;
  }
}
