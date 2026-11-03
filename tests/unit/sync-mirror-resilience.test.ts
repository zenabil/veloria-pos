// Veloria PoS — E-41/E-42/E-43 : la file miroir ne se gèle plus, ne se
// condamne plus par erreur de configuration, et respecte sa cadence en échec.
// Logique PURE (sync.protocol) : le comportement HTTP est prouvé dans
// tests/integration/sync-push-resilience.test.ts.
import { describe, it, expect } from "vitest";
import {
  classifyMirrorRejection,
  isPushDue,
  isOwnerPushDue,
  partitionOutboxRows,
  SYNC_DEFAULTS,
  type OutboxMirrorRow,
  type SyncConfig,
} from "../../electron/sync/sync.protocol";

const row = (operationId: string, payloadJson: string): OutboxMirrorRow => ({
  operation_id: operationId,
  customer_id: 1,
  kind: "customer_snapshot",
  payload_json: payloadJson,
  created_at: "2026-11-03T08:00:00.000Z",
});

describe("partitionOutboxRows (E-41)", () => {
  it("écarte la ligne localement illisible SANS arrêter les autres", () => {
    const rows = [row("a", '{"demo":1}'), row("b", "{oops"), row("c", '{"demo":3}')];
    const out = partitionOutboxRows(rows);
    expect(out.valid.map((r) => r.operation_id)).toEqual(["a", "c"]);
    expect(out.corruptedOperationIds).toEqual(["b"]);
  });

  it("une ligne `null` ou vide n'est pas un cliché poussable", () => {
    expect(partitionOutboxRows([row("n", "null")]).corruptedOperationIds).toEqual(["n"]);
    expect(partitionOutboxRows([row("e", '""')]).corruptedOperationIds).toEqual(["e"]);
  });

  it("une file saine traverse intégralement", () => {
    const rows = [row("a", '{"demo":1}'), row("b", '{"demo":2}')];
    const out = partitionOutboxRows(rows);
    expect(out.corruptedOperationIds).toEqual([]);
    expect(out.valid).toHaveLength(2);
  });
});

describe("classifyMirrorRejection (E-42)", () => {
  const FK_DETAIL =
    '{"code":"23503","message":"insert or update on table \\"client_payloads\\" violates foreign key constraint"}';

  it("une table absente est un problème de CONFIGURATION, jamais une ligne coupable", () => {
    expect(
      classifyMirrorRejection(
        404,
        '{"code":"42P01","message":"relation \\"public.client_payloads\\" does not exist"}',
      ),
    ).toBe("table");
    expect(
      classifyMirrorRejection(400, '{"code":"PGRST205","message":"Could not find the table"}'),
    ).toBe("table");
  });

  it("une contrainte étrangère reste une ligne à écarter", () => {
    expect(classifyMirrorRejection(409, FK_DETAIL)).toBe("row");
    expect(classifyMirrorRejection(400, '{"message":"invalid input syntax for type json"}')).toBe(
      "row",
    );
  });

  it("401/403/5xx restent temporaires : la file ne se condamne pas", () => {
    for (const status of [401, 403, 429, 500, 502, 503]) {
      expect(classifyMirrorRejection(status, "nope"), `status ${status}`).toBe("transient");
    }
  });
});

describe("cadence avec lastAttemptAt (E-43)", () => {
  const cfg: SyncConfig = {
    ...SYNC_DEFAULTS,
    enabled: true,
    supabaseUrl: "https://x",
    serviceKey: "k",
    intervalMinutes: 15,
    ownerEnabled: true,
    ownerIntervalMinutes: 60,
  };
  const T = Date.parse("2026-11-03T10:00:00.000Z");
  const iso = (ms: number): string => new Date(ms).toISOString();

  it("un échec récent retarde la prochaine tentative", () => {
    // Aucun succès, mais une tentative il y a 2 minutes : PAS dû.
    expect(isPushDue(cfg, null, T, iso(T - 2 * 60_000))).toBe(false);
    // 15 minutes : dû, à la borne exactement.
    expect(isPushDue(cfg, null, T, iso(T - 15 * 60_000))).toBe(true);
  });

  it("sans tentative enregistrée, la poussée reste immédiate (démarrage)", () => {
    expect(isPushDue(cfg, null, T, null)).toBe(true);
    expect(isPushDue(cfg, null, T)).toBe(true);
  });

  it("le plus récent des deux horodatages gouverne", () => {
    expect(isPushDue(cfg, iso(T - 60 * 60_000), T, iso(T - 60_000))).toBe(false);
    expect(isPushDue(cfg, iso(T - 60_000), T, iso(T - 60 * 60_000))).toBe(false);
  });

  it("la liasse propriétaire suit la même règle", () => {
    expect(isOwnerPushDue(cfg, null, T, iso(T - 5 * 60_000))).toBe(false);
    expect(isOwnerPushDue(cfg, null, T, iso(T - 60 * 60_000))).toBe(true);
  });
});
