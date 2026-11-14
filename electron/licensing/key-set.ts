// Veloria Licensing — JEU DE CLÉS PUBLIQUES de vérification (LIC-04).
//
// POURQUOI (audit 2026-11-11, finding LIC-04) :
//   L'enveloppe `.vlic` ne portait AUCUN identifiant de clé et le POS ne
//   embarquait qu'UNE seule clé publique (`resources/license/public.key`).
//   Une rotation de clé revenait donc à REMPLACER l'unique ancre de
//   confiance — ce qui, par construction, invalide TOUTES les licences
//   déjà émises chez les clients. C'est précisément le scénario que la
//   compétence veloria-license interdit :
//     « Never replace the only verification key in a way that invalidates
//       legitimately issued licenses without a migration plan. »
//
// LE MÉCANISME :
//   1. `resources/license/keys.json` porte le JEU de clés de vérification :
//        { "active": "k2", "keys": { "k1": "<PEM>", "k2": "<PEM>" } }
//      L'identifiant `active` désigne la clé d'émission courante ; les
//      autres restent PUBLIQUES (elles servent à vérifier les licences
//      déjà émises pendant la période de recouvrement).
//   2. L'enveloppe `.vlic` porte un `kid` (identifiant de clé). Une licence
//      v1 (sans `kid`) reste lisible : on vérifie alors avec la clé active.
//   3. La vérification choisit la clé par `kid`, avec repli sur la clé
//      active si le `kid` est absent (v1) — jamais sur une clé DEVINÉE.
//
// COMPATIBILITÉ ASCENDANTE :
//   `resources/license/public.key` est CONSERVÉ : c'est la clé que les
//   installations existantes (1.0.x) ont déjà embarquée. Si `keys.json`
//   est absent ou illisible, le POS retombe sur ce fichier unique — le
//   comportement actuel, inchangé. Aucun client installé ne casse.
//
//   L'ajout de `keys.json` auPaquet est donc une AJOUT, jamais un
//   remplacement : `public.key` reste, `keys.json` s'ajoute, et le jeu
//   reprend `public.key` sous l'identifiant de la clé active.

import { createPublicKey } from "node:crypto";

export interface LicenseKeySet {
  /** Identifiant de la clé d'émission courante. */
  active: string;
  /** Clés de vérification, par identifiant. */
  keys: Record<string, string>;
}

export interface KeyResolution {
  /** Clé PEM à utiliser, ou null si aucune clé ne convient. */
  pem: string | null;
  /** Identifiant de la clé employée (diagnostic). */
  kid: string | null;
  /** Raison du refus (stable, interne). */
  reason: "OK" | "KEY_SET_UNAVAILABLE" | "UNKNOWN_KID" | "MALFORMED_KEY_SET";
}

/** Identifiant de la clé historique (celle qui a signé les licences v1). */
export const LEGACY_KEY_ID = "k1";

/**
 * Analyse un `keys.json` brut. Fail-closed : un fichier illisible ne
 * doit JAMAIS produire un jeu de clés partiel qui accepterait une licence
 * non signée par une clé de confiance.
 */
export function parseKeySet(raw: string): LicenseKeySet | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const p = parsed as Record<string, unknown>;
  const active = p["active"];
  const keys = p["keys"];
  if (typeof active !== "string" || active.length === 0) return null;
  if (!keys || typeof keys !== "object" || Array.isArray(keys)) return null;
  const out: Record<string, string> = {};
  for (const [kid, pem] of Object.entries(keys as Record<string, unknown>)) {
    if (typeof pem !== "string" || pem.length === 0) return null;
    out[kid] = pem;
  }
  if (!out[active]) return null;
  return { active, keys: out };
}

/** Une PEM est-elle une clé publique exploitable ? (fail-closed) */
export function isUsablePublicKey(pem: string): boolean {
  try {
    const key = createPublicKey(pem);
    return key.type === "public";
  } catch {
    return false;
  }
}

/**
 * Choisit la clé de vérification pour une licence.
 *
 * @param kid   identifiant de clé porté par l'enveloppe (peut être absent → v1)
 * @param keySet jeu de clés (null si indisponible)
 * @param fallbackPem clé unique historique (utilisée si le jeu est absent)
 */
export function resolveVerificationKey(
  kid: string | undefined | null,
  keySet: LicenseKeySet | null,
  fallbackPem: string | null,
): KeyResolution {
  // 1. Pas de jeu de clés : on retombe sur la clé unique historique
  //    (comportement 1.0.x, inchangé) — le jeu de clés est un AJOUT.
  if (!keySet) {
    if (fallbackPem && isUsablePublicKey(fallbackPem)) {
      return { pem: fallbackPem, kid: LEGACY_KEY_ID, reason: "OK" };
    }
    return { pem: null, kid: null, reason: "KEY_SET_UNAVAILABLE" };
  }

  // 2. Licence v1 (pas de `kid`) : la clé active la vérifie.
  if (!kid) {
    const active = keySet.keys[keySet.active];
    if (active && isUsablePublicKey(active)) {
      return { pem: active, kid: keySet.active, reason: "OK" };
    }
    return { pem: null, kid: null, reason: "MALFORMED_KEY_SET" };
  }

  // 3. `kid` explicite : la clé nommée. Jamais de repli silencieux sur
  //    une autre clé (une licence ne doit pas pouvoir être « essayée »
  //    contre toutes les clés du jeu).
  const named = keySet.keys[kid];
  if (!named) return { pem: null, kid: null, reason: "UNKNOWN_KID" };
  if (!isUsablePublicKey(named)) {
    return { pem: null, kid: null, reason: "MALFORMED_KEY_SET" };
  }
  return { pem: named, kid, reason: "OK" };
}

/**
 * Construit un jeu de clés à partir d'une clé unique existante (chemin de
 * migration : le jeu est créé à partir de `public.key`, sans rien casser).
 */
export function keySetFromSinglePem(pem: string, kid = LEGACY_KEY_ID): LicenseKeySet {
  return { active: kid, keys: { [kid]: pem } };
}
