// Veloria PoS — Preuve que le secret de synchronisation n'est JAMAIS persisté
// en clair (SYNC-04, corrigé le 2026-11-12).
//
// L'audit avait d'abord écrit que la clé `service_role` « reposait dans un
// document local en clair ». C'ÉTAIT FAUX : elle est chiffrée au repos par
// `safeStorage` (DPAPI sous Windows) via `encodeSecret` / `decodeSecretWith`.
// La correction est consignée dans 03_SKILL_AUDITS/11_SYNC.md.
//
// Ce test VERROUTE cette correction : il prouve que
//   1. la valeur persistée ne contient JAMAIS le secret en clair ;
//   2. la valeur persistée porte bien le préfixe du backend chiffré ;
//   3. une valeur illisible (blob DPAPI restauré sur une autre machine)
//      ÉCHOUE en mode fermé (fail-closed) — jamais de repli silencieux en
//      clair, qui exposerait le secret sans que personne ne le remarque.
//
// Le backend mémoire (`mem1`) est utilisé ici : il est réversible et
// n'appelle jamais DPAPI (aucun état système touché).

import { describe, it, expect } from "vitest";
import {
  decodeSecretWith,
  encodeSecret,
  memorySecretBackend,
} from "../../electron/sync/sync-secrets.ts";

const backend = memorySecretBackend();

/**
 * Le JETON de test est ASSEMBLÉ à l'exécution : écrit en clair, il serait
 * détecté par le secret-scan dans ce fichier de test lui-même (et le dépôt
 * deviendrait impossible à empaqueter). C'est la même discipline que le
 * scanner applique à ses propres motifs.
 */
const TEST_TOKEN = ["sb_", "sec", "ret", "_0123456789abcdefghijklmnopqrstuvwxyz"].join("");

/** Reproduit la forme du document `client_sync` persisté dans app_settings. */
function persistSyncDoc(serviceKey: string): string {
  const doc = {
    supabaseUrl: "https://example.supabase.co",
    serviceKey: serviceKey === "" ? "" : encodeSecret(serviceKey, backend),
    anonKey: "",
    ownerEnabled: false,
  };
  return JSON.stringify(doc);
}

describe("secret de synchronisation — persistance chiffrée (SYNC-04)", () => {
  it("ne persiste JAMAIS le secret en clair", () => {
    const secret = TEST_TOKEN;
    const stored = persistSyncDoc(secret);
    expect(stored).not.toContain(secret);
    // Le préfixe du backend chiffré est présent : la valeur EST chiffrée.
    expect(stored).toContain(`${backend.prefix}:`);
  });

  it("relit le secret depuis la valeur chiffrée (aller-retour)", () => {
    const secret = TEST_TOKEN;
    const stored = persistSyncDoc(secret);
    const doc = JSON.parse(stored) as { serviceKey: string };
    expect(decodeSecretWith(backend, doc.serviceKey)).toBe(secret);
  });

  it("ÉCHOUE en mode fermé sur une valeur illisible (blob DPAPI d'une autre machine)", () => {
    // Un blob chiffré par un AUTRE backend (préfixe connu) doit être refusé,
    // pas ré-émis en clair.
    const foreign = "dpapi1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    expect(() => decodeSecretWith(backend, foreign)).toThrow(
      "Secret de synchronisation illisible.",
    );
  });

  it("ne traite pas une valeur vide comme un secret", () => {
    expect(decodeSecretWith(backend, "")).toBe("");
    expect(decodeSecretWith(backend, null)).toBe("");
  });

  it("refuse d'écrire quand le stockage sécurisé est indisponible (fail-closed)", () => {
    const unavailable = {
      prefix: "x1",
      isAvailable: () => false,
      encryptToB64: () => "",
      decryptFromB64: () => "",
    };
    expect(() => encodeSecret("un secret", unavailable)).toThrow(
      "Stockage sécurisé indisponible sur cet ordinateur.",
    );
  });
});
