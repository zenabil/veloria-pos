// Veloria PoS — A-03 (P1) : `newOperationId` est UNIQUE et jamais un repli
// constant.
//
// Avant : trois copies locales de la fonction dans les écrans Équipe
// (`UsersAdmin`, `ChangeCodeCard`, `StaffRecover`) avec un repli
// « 00000000-0000-4000-8000-000000000000 » si `crypto.randomUUID` était
// absent. Dans ce cas, TOUTES les opérations d'équipe partageaient le même
// `operationId` ⇒ `idempotency_keys` confondait des opérations distinctes
// en rejeux (création de gérant, permissions, activation, changement de code,
// secours) et les PERDUVAIT en silence.
//
// La source unique est le domaine (`src/domain/common/ids.ts` — UUIDv7 via
// `crypto.getRandomValues`, disponible dans tout contexte).
import { describe, it, expect } from "vitest";
import { newOperationId } from "@domain/common/ids.ts";

describe("A-03 : operationId unique (source unique du domaine)", () => {
  it("1000 identifiants sont tous distincts", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i += 1) ids.add(newOperationId());
    expect(ids.size).toBe(1000);
  });

  it("jamais le repli constant (UUID zéro)", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(newOperationId()).not.toBe("00000000-0000-4000-8000-000000000000");
    }
  });

  it("format UUID valide (v4/v7 : version + variante)", () => {
    for (let i = 0; i < 50; i += 1) {
      const id = newOperationId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    }
  });

  it("préfixe temporel monotone (UUIDv7 : les relectures restent lisibles)", async () => {
    const a = newOperationId();
    // UUIDv7 : le TIMESTAMP est dans les 48 premiers bits ⇒ l'ordre n'est
    // garanti qu'entre deux millisecondes distinctes (dans la même ms, c'est
    // la partie aléatoire qui départage).
    await new Promise((r) => setTimeout(r, 5));
    const b = newOperationId();
    expect(a.slice(0, 8) <= b.slice(0, 8)).toBe(true);
  });
});
