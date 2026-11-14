// Veloria PoS — SYNC-02 : politique de rejeu et de quarantaine (pure).
//
// L'audit a constaté que la file de sortie n'avait NI compteur de tentative,
// NI taxonomie, NI backoff : une ligne rejetée était rejouée à CHAQUE tick
// sans jamais s'arrêter. Ce module porte la DÉCISION ; la base porte l'ÉTAT.
// Le test prouve que la décision est déterministe et conforme au contrat de
// la compétence `veloria-sync` (« Outbox and failure taxonomy »).
import { describe, it, expect } from "vitest";
import {
  SYNC_MAX_ATTEMPTS,
  SYNC_BACKOFF_BASE_MS,
  SYNC_BACKOFF_CAP_MS,
  classifySyncFailure,
  isRetryable,
  backoffDelayMs,
  isQuarantined,
  nextAttemptAt,
  decideRetry,
} from "../../electron/sync/retry-policy";

describe("SYNC-02 — taxonomie des échecs", () => {
  it("réseau (status null) = transitoire", () => {
    expect(classifySyncFailure(null, "")).toBe("transient");
  });
  it("408 / 429 / 5xx = transitoire", () => {
    for (const s of [408, 429, 500, 502, 503, 504]) {
      expect(classifySyncFailure(s, "")).toBe("transient");
    }
  });
  it("401 / 403 = auth (action opérateur)", () => {
    expect(classifySyncFailure(401, "")).toBe("auth");
    expect(classifySyncFailure(403, "")).toBe("auth");
  });
  it("404 / PGRST205 / table absente = schema (configuration)", () => {
    expect(classifySyncFailure(404, "")).toBe("schema");
    expect(classifySyncFailure(400, "PGRST205: Could not find the table 'public.x'")).toBe(
      "schema",
    );
    expect(classifySyncFailure(400, 'relation "client_access" does not exist')).toBe("schema");
  });
  it("400 avec détail de validation = validation (ligne condamnée)", () => {
    expect(classifySyncFailure(400, "violates not-null constraint")).toBe("validation");
    expect(classifySyncFailure(409, "duplicate key value violates unique constraint")).toBe(
      "validation",
    );
  });
  it("seules les transitoires sont rejouables", () => {
    expect(isRetryable("transient")).toBe(true);
    for (const k of ["auth", "schema", "validation", "permanent"] as const) {
      expect(isRetryable(k)).toBe(false);
    }
  });
});

describe("SYNC-02 — backoff exponentiel borné", () => {
  it("croît de façon exponentielle", () => {
    const d1 = backoffDelayMs(1, 0.5);
    const d2 = backoffDelayMs(2, 0.5);
    const d3 = backoffDelayMs(3, 0.5);
    expect(d2).toBeGreaterThan(d1);
    expect(d3).toBeGreaterThan(d2);
    // facteur 2 par tentative
    expect(d2 / d1).toBeCloseTo(2, 1);
  });
  it("est plafonné à SYNC_BACKOFF_CAP_MS", () => {
    const big = backoffDelayMs(100, 0.5);
    expect(big).toBeLessThanOrEqual(SYNC_BACKOFF_CAP_MS * 1.2 + 1);
  });
  it("le jitter reste dans la bande ±20 %", () => {
    const base = backoffDelayMs(2, 0.5);
    for (let j = 0; j <= 1; j += 0.1) {
      const d = backoffDelayMs(2, j);
      expect(d).toBeGreaterThanOrEqual(Math.round(base * 0.8) - 1);
      expect(d).toBeLessThanOrEqual(Math.round(base * 1.2) + 1);
    }
  });
  it("jitter 0.5 est déterministe (délai exact)", () => {
    expect(backoffDelayMs(1, 0.5)).toBe(Math.round(SYNC_BACKOFF_BASE_MS * 1.0));
  });
  it("nextAttemptAt produit un instant ISO postérieur", () => {
    const now = "2026-11-13T10:00:00.000Z";
    const next = nextAttemptAt(now, 1, 0.5);
    expect(next > now).toBe(true);
    expect(Number.isFinite(Date.parse(next))).toBe(true);
  });
});

describe("SYNC-02 — quarantaine", () => {
  it("une ligne est quarantaine à partir de SYNC_MAX_ATTEMPTS", () => {
    expect(isQuarantined(SYNC_MAX_ATTEMPTS - 1)).toBe(false);
    expect(isQuarantined(SYNC_MAX_ATTEMPTS)).toBe(true);
    expect(isQuarantined(SYNC_MAX_ATTEMPTS + 5)).toBe(true);
  });
  it("un rejet auth/schema/validation/permanent isole immédiatement", () => {
    for (const kind of ["auth", "schema", "validation", "permanent"] as const) {
      const d = decideRetry({ attempts: 0, kind, nowIso: "2026-11-13T10:00:00.000Z" });
      expect(d.quarantined).toBe(true);
      expect(d.retryable).toBe(false);
      expect(d.nextAttemptAt).toBeNull();
    }
  });
  it("une transitoire sous le budget est reprogrammée (pas quarantaine)", () => {
    const d = decideRetry({
      attempts: 0,
      kind: "transient",
      nowIso: "2026-11-13T10:00:00.000Z",
      jitter: 0.5,
    });
    expect(d.quarantined).toBe(false);
    expect(d.retryable).toBe(true);
    expect(d.attempts).toBe(1);
    expect(d.nextAttemptAt).not.toBeNull();
  });
  it("une transitoire qui épuise le budget est quarantaine", () => {
    const d = decideRetry({
      attempts: SYNC_MAX_ATTEMPTS - 1,
      kind: "transient",
      nowIso: "2026-11-13T10:00:00.000Z",
    });
    expect(d.attempts).toBe(SYNC_MAX_ATTEMPTS);
    expect(d.quarantined).toBe(true);
    expect(d.nextAttemptAt).toBeNull();
  });
  it("decideRetry est déterministe (même entrée → même sortie)", () => {
    const a = decideRetry({
      attempts: 2,
      kind: "transient",
      nowIso: "2026-11-13T10:00:00.000Z",
      jitter: 0.3,
    });
    const b = decideRetry({
      attempts: 2,
      kind: "transient",
      nowIso: "2026-11-13T10:00:00.000Z",
      jitter: 0.3,
    });
    expect(a).toEqual(b);
  });
});
