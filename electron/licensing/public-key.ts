// Veloria Licensing — Chargement de la clé PUBLIQUE (vérification seule).
// Source unique : resources/license/public.key (packagé) avec replis dev.
// Échec fermé (fail-closed) : sans clé, aucune activation n'est possible.
// AUCUNE variable d'environnement, AUCUN chemin configurable : un attaquant
// local ne doit pas pouvoir substituer sa propre clé par configuration.

import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

let cached: string | null = null;

function candidates(): string[] {
  const out: string[] = [];
  // EL-11: en production packagée, SEULE resourcesPath (pas de fallback cwd
  // substituable). Les replis dev ne sont proposés qu'en non-packagé.
  let packaged = false;
  try {
    packaged = app.isPackaged;
  } catch {
    packaged = false;
  }
  try {
    out.push(path.join(process.resourcesPath, "license", "public.key"));
  } catch {
    /* hors runtime packagé */
  }
  if (packaged) return out;
  try {
    out.push(path.join(app.getAppPath(), "resources", "license", "public.key"));
  } catch {
    /* ignore */
  }
  out.push(path.join(process.cwd(), "resources", "license", "public.key"));
  return out;
}

/** Clé publique PEM. Lève LICENSE_KEY_UNAVAILABLE (jamais de détail). */
export function getEmbeddedPublicKey(): string {
  if (cached) return cached;
  for (const c of candidates()) {
    try {
      const pem = fs.readFileSync(c, "utf-8");
      if (pem.includes("BEGIN PUBLIC KEY")) {
        cached = pem;
        return pem;
      }
    } catch {
      /* candidat suivant */
    }
  }
  throw new Error("LICENSE_KEY_UNAVAILABLE");
}
