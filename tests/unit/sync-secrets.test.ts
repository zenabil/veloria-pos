// Veloria PoS — Tests R5 : chiffrement au repos des secrets sync.
// Backend mémoire (jamais de DPAPI en test) + compatibilité legacy clair.
import { describe, it, expect } from "vitest";
import {
  decodeSecretWith,
  encodeSecret,
  memorySecretBackend,
} from "../../electron/sync/sync-secrets.ts";

const mem = memorySecretBackend();

describe("R5 : roundtrip backend mémoire", () => {
  it("encode puis décode (préfixe + base64, jamais le clair)", () => {
    const stored = encodeSecret("k".repeat(40), mem);
    expect(stored.startsWith("mem1:")).toBe(true);
    expect(stored).not.toContain("k".repeat(40));
    expect(decodeSecretWith(mem, stored)).toBe("k".repeat(40));
  });
  it("vide → vide (pas de secret à chiffrer)", () => {
    expect(encodeSecret("", mem)).toBe("");
    expect(decodeSecretWith(mem, "")).toBe("");
  });
});

describe("R5 : migration transparente du legacy clair", () => {
  it("clair sans préfixe relu tel quel (puis réchiffré à l'écriture)", () => {
    const legacy = "k".repeat(40);
    expect(decodeSecretWith(mem, legacy)).toBe(legacy);
    // ...et la prochaine écriture le chiffre :
    expect(encodeSecret(decodeSecretWith(mem, legacy), mem).startsWith("mem1:")).toBe(true);
  });
  it("préfixe d'un autre backend = refus FR (fail-closed)", () => {
    // Simule une valeur chiffrée par un backend inconnu :
    expect(() => decodeSecretWith(mem, "dpapi1:AAAA")).toThrow(/illisible/);
  });
  it("corrompu = refus FR, jamais de clair fantôme", () => {
    expect(() => decodeSecretWith(mem, "mem1:%%%")).toThrow(/illisible/);
  });
});
