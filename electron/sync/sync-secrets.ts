// Veloria PoS — Sync: chiffrement au repos des secrets (R5 RADICAL).
// Cause racine M3 : `serviceKey` Supabase (privilège total) reposait en
// clair dans `app_settings.value_json` — toute lecture du fichier DB
// (dossier PROGRAMDATA, sauvegarde .vposdb, export) donnait un accès cloud
// persistant. Correctif radical : chiffrement via `safeStorage` (DPAPI sous
// Windows, même mécanisme que `licensing/secure-state.ts`), avec migration
// transparente : les valeurs legacy en clair (sans préfixe) sont lues
// telles quelles puis réchiffrées à la prochaine écriture (zéro migration
// SQL, zéro downtime — `writeDoc` encode toujours, `readDoc` décode).
// Format stocké : `<prefixe>:<base64>` ; sans préfixe = legacy clair.
// Backend injectable pour les tests (jamais de DPAPI en test).

import { safeStorage } from "electron";

export interface SecretBackend {
  /** Préfixe de stockage de ce backend (ex. "dpapi1", "mem1"). */
  readonly prefix: string;
  isAvailable(): boolean;
  /** Clair → base64 (sans préfixe ; l'appelant ajoute `${prefix}:`). */
  encryptToB64(plain: string): string;
  /** base64 → clair. Lève si illisible. */
  decryptFromB64(stored: string): string;
}

function b64encode(raw: string): string {
  return Buffer.from(raw, "utf8").toString("base64");
}

function b64decode(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf8");
}

export function safeStorageSecretBackend(): SecretBackend {
  return {
    prefix: "dpapi1",
    isAvailable: () => {
      try {
        return safeStorage.isEncryptionAvailable();
      } catch {
        return false;
      }
    },
    encryptToB64: (plain: string) => safeStorage.encryptString(plain).toString("base64"),
    decryptFromB64: (stored: string) => safeStorage.decryptString(Buffer.from(stored, "base64")),
  };
}

/** Backend mémoire (tests uniquement) : réversible, jamais en production. */
export function memorySecretBackend(): SecretBackend {
  return {
    prefix: "mem1",
    isAvailable: () => true,
    encryptToB64: (plain: string) => b64encode(`mem:${plain}`),
    decryptFromB64: (stored: string) => {
      const text = b64decode(stored);
      if (!text.startsWith("mem:")) throw new Error("Secret illisible.");
      return text.slice(4);
    },
  };
}

/** Clair → valeur stockable (`préfixe:base64`), vide → vide. */
export function encodeSecret(plain: string, backend: SecretBackend): string {
  if (plain === "") return "";
  if (!backend.isAvailable()) {
    throw new Error("Stockage sécurisé indisponible sur cet ordinateur.");
  }
  return `${backend.prefix}:${backend.encryptToB64(plain)}`;
}

/**
 * Valeur stockée → clair. Legacy sans préfixe = clair (migration
 * transparente). Préfixe inconnu ou illisible = erreur FR (fail-closed,
 * jamais de secret corrompu silencieusement réutilisé).
 */
export function decodeSecretWith(backend: SecretBackend, stored: unknown): string {
  if (typeof stored !== "string" || stored === "") return "";
  const idx = stored.indexOf(":");
  // Legacy : aucun préfixe reconnu → clair historique.
  if (idx <= 0) return stored;
  const prefix = stored.slice(0, idx);
  const body = stored.slice(idx + 1);
  if (prefix !== backend.prefix) {
    // Autre backend ou legacy contenant ":" : en prod (dpapi) un "mem1:"
    // n'existe jamais ; un clair legacy avec ":" reste utilisable tel quel
    // UNIQUEMENT s'il ne ressemble pas à un secret encodé connu.
    if (prefix === "dpapi1" || prefix === "mem1") {
      throw new Error("Secret de synchronisation illisible.");
    }
    return stored;
  }
  try {
    return backend.decryptFromB64(body);
  } catch {
    throw new Error("Secret de synchronisation illisible.");
  }
}
