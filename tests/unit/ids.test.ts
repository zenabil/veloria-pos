// Veloria PoS — Tests : ids (newOperationId, UUIDv7).
// Couvre src/domain/common/ids.ts:25 — format RFC 9562 + unicité : aucune
// idempotency sans operationId frais et unique par cycle de retry.
import { describe, it, expect } from "vitest";
import { newOperationId } from "@domain/common/ids.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function uuidMs(id: string): number {
  const hex = id.replace(/-/g, "");
  let ms = 0;
  for (let i = 0; i < 12; i++) ms = ms * 16 + Number.parseInt(hex[i] as string, 16);
  return ms;
}

describe("newOperationId (ids.ts:25)", () => {
  it("format UUID canonique 8-4-4-4-12 hexadécimal", () => {
    for (let i = 0; i < 25; i++) expect(newOperationId()).toMatch(UUID_RE);
  });

  it("version 7 + variant RFC 9562", () => {
    for (let i = 0; i < 25; i++) {
      const id = newOperationId();
      expect(id[14]).toBe("7");
      expect(["8", "9", "a", "b"]).toContain(id[19]);
    }
  });

  it("unicité : 1000 ids distincts (aucun doublon de cycle)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(newOperationId());
    expect(seen.size).toBe(1000);
  });

  it("horodatage embarqué ≈ maintenant (triable)", () => {
    const before = Date.now();
    const id = newOperationId();
    const after = Date.now();
    const embedded = uuidMs(id);
    expect(embedded).toBeGreaterThanOrEqual(before - 1000);
    expect(embedded).toBeLessThanOrEqual(after + 1000);
  });
});
