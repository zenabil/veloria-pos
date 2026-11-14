// Veloria PoS — HygiÈNE DES SECRETS DE SYNCHRONISATION (BACK-04).
//
// POURQUOI CE MODULE EXISTE
//
// Le secret de service Supabase (`service_role`) est chiffré au repos par
// `safeStorage` (DPAPI sous Windows) : la valeur persistée porte le préfixe
// `dpapi1:` et n'est jamais lisible en clair. C'est le constat CORRIGÉ de
// l'audit 2026-11-11 (SYNC-04 : la clé n'est PAS « en clair dans un document
// local »).
//
// MAIS il reste une RÉSIDUE : une installation antérieure à cette migration
// peut encore avoir un secret LEGACY en clair dans `app_settings`. Ce secret
// est alors recopié tel quel dans CHAQUE sauvegarde (une sauvegarde est une
// copie complète de la base) — et une sauvegarde circule (clé USB, disque
// externe, cloud) beaucoup plus facilement que la base d'origine.
//
// CORRECTIF : au démarrage, tout secret legacy en clair est RÉÉCRIT sous
// forme chiffrée. Une fois ce passage effectué, le contrat de sauvegarde
// (`docs/BACKUP_CONTRACT.md`) peut affirmer — et prouver — qu'une sauvegarde
// Veloria ne contient AUCUN credential en clair.
//
// MODULE PUR (aucun Electron, aucune base) : les dépendances sont injectées
// pour être testables sans état système (la compétence veloria-db impose
// que le domaine ne dépende pas du framework).

import { encodeSecret, type SecretBackend } from "./sync-secrets";

/** Champs du document `client_sync` qui portent un secret. */
export const SECRET_FIELDS = ["serviceKey", "anonKey"] as const;

export interface SecretHygieneDeps {
  /** Row brute `app_settings` (value_json) — `undefined` si absent. */
  read(): { value_json: string } | undefined;
  /** Réécrit la row avec le nouveau JSON et l'horodatage. */
  write(valueJson: string, now: string): void;
  /** Backend de chiffrement (DPAPI en production, mémoire en test). */
  backend: SecretBackend;
  /** Horodatage de la réécriture. */
  now(): string;
}

export interface SecretHygieneResult {
  /** Nombre de secrets ré-encodés (0 = rien à faire). */
  upgraded: number;
  /** true si le chiffrement était indisponible : AUCUNE écriture faite. */
  failed: boolean;
  /** true si la row était illisible (elle est laissée intacte). */
  unreadable: boolean;
}

/**
 * Ré-encode tout secret legacy en clair sous forme chiffrée.
 *
 * fail-closed : si le stockage sécurisé est indisponible, on ne modifie
 * RIEN (une valeur chiffrée par un mauvais backend serait irrécupérable).
 * Idempotent : une valeur déjà chiffrée n'est jamais ré-encodée.
 */
export function reencryptLegacySecrets(deps: SecretHygieneDeps): SecretHygieneResult {
  const row = deps.read();
  if (!row) return { upgraded: 0, failed: false, unreadable: false };
  let parsed: Record<string, unknown>;
  try {
    const raw = JSON.parse(row.value_json) as unknown;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return { upgraded: 0, failed: false, unreadable: true };
    }
    parsed = raw as Record<string, unknown>;
  } catch {
    return { upgraded: 0, failed: false, unreadable: true };
  }
  if (!deps.backend.isAvailable()) {
    return { upgraded: 0, failed: true, unreadable: false };
  }
  let upgraded = 0;
  const next: Record<string, unknown> = { ...parsed };
  for (const field of SECRET_FIELDS) {
    const stored = next[field];
    if (typeof stored !== "string" || stored === "") continue;
    // Déjà chiffré par CE backend : ne rien toucher (jamais de double
    // chiffrement, jamais de secret illisible).
    if (stored.startsWith(`${deps.backend.prefix}:`)) continue;
    try {
      next[field] = encodeSecret(stored, deps.backend);
      upgraded += 1;
    } catch {
      // Stockage sécurisé devenu indisponible en cours de route : on
      // abandonne TOUT (aucune écriture partielle).
      return { upgraded: 0, failed: true, unreadable: false };
    }
  }
  if (upgraded === 0) return { upgraded: 0, failed: false, unreadable: false };
  deps.write(JSON.stringify(next), deps.now());
  return { upgraded, failed: false, unreadable: false };
}
