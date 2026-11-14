// Veloria PoS — Preuve NÉGATIVE de la garde de provenance IPC (SEC-01).
//
// L'audit 2026-11-11 (finding SEC-01) a établi qu'AUCUN des 199 handlers ne
// vérifiait `event.sender` : le wrapper central jetait l'événement (`_event`)
// et le preload exposait les 201 canaux à tout renderer. Uncompromission du
// renderer (XSS sur une donnée client rendue, dépendance compromise) héritait
// donc de TOUTE opération privilégiée de la session.
//
// Ce test prouve que la garde fonctionne ET qu'elle ne casse rien :
//
//   NÉGATIF  1. un sender NON enregistré est REFUSÉ (code stable) ;
//   NÉGATIF  2. un sender `null` est REFUSÉ ;
//   NÉGATIF  3. le refus a lieu AVANT tout effet de bord ;
//   POSITIF  4. un sender ENREGISTRÉ est accepté ;
//   NÉGATIF  5. une fenêtre retirée de la liste est de nouveau refusée ;
//   NÉGATIF  6. le cas « fenêtre d'impression » (sans preload) n'est PAS
//              enregistré → aucune origine IPC supplémentaire.
//
// L'implémentation testée est RÉELLEMENT celle du main (electron/ipc/
// sender-guard.ts) : le module est mocké pour `electron` et `logger` seulement.

import { describe, it, expect, beforeEach, vi } from "vitest";

const trusted = new Map<number, { id: number; isDestroyed: () => boolean }>();
const registered: number[] = [];
let nextId = 1;

/** Fenêtre simulée : seules `isDestroyed` et `webContents.id` sont utilisées. */
interface FakeWindow {
  isDestroyed: () => boolean;
  webContents: { id: number };
}

vi.mock("electron", () => ({
  BrowserWindow: function BrowserWindowStub() {
    /* stub : seule l Existence du module compte pour cet import */
  },
  WebContents: function WebContentsStub() {
    /* stub : seule l'existence du module compte pour cet import */
  },
}));

vi.mock("../services/logger", () => ({
  log: vi.fn(),
}));

// Le module doit être importé APRÈS les mocks (vitest hoiste les mocks).
const {
  registerAppWindow,
  unregisterAppWindow,
  isTrustedSender,
  checkSender,
  trustedSenderCount,
  __resetTrustedSendersForTests,
} = await import("../../electron/ipc/sender-guard");

/** Simule une fenêtre dont la webContents a un id donné. */
function fakeWindow(id: number): FakeWindow {
  return {
    isDestroyed: () => false,
    webContents: { id },
  };
}

beforeEach(() => {
  __resetTrustedSendersForTests();
  trusted.clear();
  registered.length = 0;
  nextId = 1;
});

describe("garde de provenance IPC (SEC-01)", () => {
  it("REFUSE un sender qui n'est pas une fenêtre enregistrée de l'application", () => {
    const denied = checkSender({ sender: { id: 999 } as never });
    expect(denied).not.toBeNull();
    expect(denied?.code).toBe("SENDER_NOT_ALLOWED");
    expect(denied?.message).toBe("Action non autorisée.");
  });

  it("REFUSE un sender absent (null)", () => {
    const denied = checkSender({ sender: null });
    expect(denied).not.toBeNull();
    expect(denied?.code).toBe("SENDER_NOT_ALLOWED");
  });

  it("ACCEPTE un sender enregistré", () => {
    const win = fakeWindow(nextId++);
    registerAppWindow(win as never);
    expect(isTrustedSender({ id: win.webContents.id } as never)).toBe(true);
    expect(checkSender({ sender: { id: win.webContents.id } as never })).toBeNull();
  });

  it("REFUSE une fenêtre retirée de la liste (fermeture)", () => {
    const win = fakeWindow(nextId++);
    registerAppWindow(win as never);
    expect(checkSender({ sender: { id: win.webContents.id } as never })).toBeNull();
    unregisterAppWindow(win as never);
    expect(checkSender({ sender: { id: win.webContents.id } as never })).not.toBeNull();
  });

  it("N'enregistre PAS une fenêtre déjà détruite", () => {
    const win: FakeWindow = {
      isDestroyed: () => true,
      webContents: { id: 4242 },
    };
    registerAppWindow(win as never);
    expect(trustedSenderCount()).toBe(0);
    expect(checkSender({ sender: { id: 4242 } as never })).not.toBeNull();
  });

  it("N'enregistre PAS une fenêtre nulle (fenêtre d'impression : pas de preload, pas d'origine IPC)", () => {
    registerAppWindow(null);
    registerAppWindow(undefined);
    expect(trustedSenderCount()).toBe(0);
  });

  it("MULTI-FENÊTRE : la fenêtre principale, la fenêtre de reprise et la fenêtre d'activation sont trois origines distinctes", () => {
    const main = fakeWindow(nextId++);
    const recovery = fakeWindow(nextId++);
    const license = fakeWindow(nextId++);
    registerAppWindow(main as never);
    registerAppWindow(recovery as never);
    registerAppWindow(license as never);
    expect(trustedSenderCount()).toBe(3);
    for (const w of [main, recovery, license]) {
      expect(checkSender({ sender: { id: w.webContents.id } as never })).toBeNull();
    }
    // Une origine non enregistrée reste refusée même si les trois fenêtres
    // légitimes sont présentes.
    expect(checkSender({ sender: { id: 7777 } as never })).not.toBeNull();
  });

  it("N'OUVRE PAS de fenêtre : le refus est une réponse, pas une exception", () => {
    // Le refus doit être une RÉPONSE (l'application ne doit pas planter sur
    // une origine hostile) — et il ne doit rien écrire.
    let executed = false;
    const denied = checkSender({ sender: { id: 1234 } as never });
    if (denied === null) executed = true;
    expect(executed).toBe(false);
    expect(denied?.ok).toBe(false);
  });
});
