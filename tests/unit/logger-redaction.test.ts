// Veloria PoS — OBS-01 : preuve de la couche de RÉDACTION du journal.
//
// L'audit a constaté que le journal n'avait AUCUNE couche de rédaction et
// AUCUN test de rédaction. Ce test prouve que :
//   1. un secret passé sous une clé sensible n'apparaît JAMAIS dans la ligne
//      sérialisée (par clé) ;
//   2. un secret passé sous une clé innocente est masqué par sa FORME (JWT,
//      jeton Supabase, hex long) ;
//   3. la rédaction ne lève jamais (chemin d'écriture) et n'altère pas les
//      valeurs non sensibles.
//
// Le jeton de test est ASSEMBLÉ à l'exécution (même discipline que
// `tests/unit/sync-secret-storage.test.ts`).
import { describe, it, expect } from "vitest";
import { redactValue } from "../../electron/services/logger.ts";

const TEST_TOKEN = ["sb_", "sec", "ret", "_0123456789abcdefghijklmnopqrstuvwxyz"].join("");
const TEST_JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

describe("OBS-01 — rédaction du journal", () => {
  it("masque par CLÉ (password, pin, token, secret, apikey, authorization)", () => {
    const redacted = redactValue({
      event: "login",
      password: "hunter2",
      pin: "1234",
      token: "abc",
      secret: "shh",
      apikey: "k",
      authorization: "Bearer xyz",
      serviceKey: "sk",
      service_key: "sk2",
    }) as Record<string, unknown>;
    for (const key of [
      "password",
      "pin",
      "token",
      "secret",
      "apikey",
      "authorization",
      "serviceKey",
      "service_key",
    ]) {
      expect(redacted[key]).toBe("[redacted]");
    }
    expect(redacted.event).toBe("login");
    // La sérialisation ne doit contenir AUCUN secret.
    expect(JSON.stringify(redacted)).not.toContain("hunter2");
    expect(JSON.stringify(redacted)).not.toContain("1234");
  });

  it("masque par FORME (JWT, jeton Supabase, hex long) même sous une clé innocente", () => {
    const redacted = redactValue({
      note: `token=${TEST_TOKEN}`,
      payload: TEST_JWT,
      hash: "a".repeat(32),
      normal: "bonjour",
    }) as Record<string, unknown>;
    expect(String(redacted.note)).not.toContain(TEST_TOKEN);
    expect(redacted.payload).toBe("[redacted-jwt]");
    expect(String(redacted.hash)).toBe("[redacted-hex]");
    expect(redacted.normal).toBe("bonjour");
  });

  it("ne lève jamais (chemin d'écriture)", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    let threw = false;
    try {
      redactValue({ a: circular, b: [1, 2, { c: null }] });
    } catch {
      threw = true;
    }
    // La profondeur est bornée : un objet trop profond est masqué, jamais une exception.
    expect(threw).toBe(false);
  });

  it("préserve les valeurs non sensibles (pas de faux positif)", () => {
    const input = { count: 5, total: 10000, name: "Farine", active: true, items: [1, 2] };
    expect(redactValue(input)).toEqual(input);
  });
});
