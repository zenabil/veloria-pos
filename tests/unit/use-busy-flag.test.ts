// Veloria PoS — A-02 (P1) : garde anti-double-clic SYNCHRONE.
//
// Avant : `useBusyFlag` (13 sections de réglages, dont `database.reset`)
// testait un `useState` React — asynchrone ⇒ deux clics dans le MÊME tick
// voyaient tous deux `busy === false` ⇒ deux envois de la même action
// (réinitialisation de la base, export de sauvegarde, push du miroir).
//
// La garde est un outil PUR (`createSyncGuard`) : elle est testable sans
// React, et le hook l'utilise telle quelle.
import { describe, it, expect } from "vitest";
import { createSyncGuard } from "@shared/ui/sync-guard.ts";

describe("A-02 : garde synchrone anti-double-clic", () => {
  it("un seul entrant à la fois (deux appels dans le même tick)", () => {
    const guard = createSyncGuard();
    expect(guard.tryEnter()).toBe(true);
    expect(guard.tryEnter()).toBe(false);
    expect(guard.tryEnter()).toBe(false);
    expect(guard.locked()).toBe(true);
  });

  it("après sortie, une nouvelle action est acceptée", () => {
    const guard = createSyncGuard();
    expect(guard.tryEnter()).toBe(true);
    guard.exit();
    expect(guard.locked()).toBe(false);
    expect(guard.tryEnter()).toBe(true);
  });

  it("la sortie est idempotente (un exit de trop ne déverrouille pas deux fois)", () => {
    const guard = createSyncGuard();
    guard.tryEnter();
    guard.exit();
    guard.exit();
    expect(guard.tryEnter()).toBe(true);
    expect(guard.tryEnter()).toBe(false);
  });

  it("deux gardes indépendantes ne se bloquent pas", () => {
    const a = createSyncGuard();
    const b = createSyncGuard();
    expect(a.tryEnter()).toBe(true);
    expect(b.tryEnter()).toBe(true);
  });

  it("séquence réelle : deux doubles-clics ⇒ une seule action", async () => {
    const guard = createSyncGuard();
    let calls = 0;
    const task = async (): Promise<void> => {
      calls += 1;
      await Promise.resolve();
    };
    const run = async (): Promise<void> => {
      if (!guard.tryEnter()) return;
      try {
        await task();
      } finally {
        guard.exit();
      }
    };
    await Promise.all([run(), run()]);
    expect(calls).toBe(1);
    // Une action suivante est de nouveau possible.
    await run();
    expect(calls).toBe(2);
  });
});
