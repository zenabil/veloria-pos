// Veloria PoS — Enveloppe `handle()` : LA porte de tous les canaux IPC (licence
// → schéma → operationId → gates crédit/staff → verrou must_change_code →
// réponse ok/FR). Le module était mesuré à 0 % par la porte projet : ce fichier
// prouve que le refus vient du MAIN (pas de l'interface) et garde la régression
// du ZodUUID (session 64 : `schemaRequiresOperationId` avait failli s'éteindre).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";

const captured = vi.hoisted(() => ({
  registry: new Map<string, (_e: unknown, raw: unknown) => Promise<unknown>>(),
}));

const staffHolder = vi.hoisted(() => ({
  userId: null as number | null,
  mustChange: false,
  touchCount: 0,
}));
const licenceHolder = vi.hoisted(() => ({ refusePages: false, refuseFeatures: false }));

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, fn: (_e: unknown, raw: unknown) => Promise<unknown>) => {
      captured.registry.set(channel, fn);
    },
  },
}));

vi.mock("../../electron/services/logger", () => ({
  log: () => {},
  initLogger: () => "",
  getLogFile: () => "",
}));

vi.mock("../../electron/licensing/prod-deps", () => ({ prodLicenseDeps: () => ({}) }));

vi.mock("../../electron/licensing/license-service", () => ({
  requireLicensedMutation: () => {},
  requireLicensedPage: () => {
    if (licenceHolder.refusePages) {
      throw new Error("Fonction non disponible dans votre licence. Contactez votre fournisseur.");
    }
  },
  requireLicensedFeature: () => {
    if (licenceHolder.refuseFeatures) {
      throw new Error("Fonction non disponible dans votre licence. Contactez votre fournisseur.");
    }
  },
}));

vi.mock("../../electron/ipc/handlers/staff-session", () => ({
  getCurrentStaffUser: () => staffHolder.userId,
  touchStaffSession: () => {
    staffHolder.touchCount += 1;
  },
}));

// Mock EN BLOC : `handle` (verrou 0041) et `staff-gates` (permissions) lisent
// tous deux dans ce module. Rôle gestionnaire et permission partout vraies —
// seul le verrou de changement de code est piloté par le test.
vi.mock("../../electron/ipc/handlers/staff.repo", () => ({
  mustChangeCode: () => staffHolder.mustChange,
  getStaffRole: () => "manager",
  userHasPermission: () => true,
}));

import { handle } from "../../electron/ipc/handle";
import { IPC_CHANNELS } from "../../electron/ipc/channels";
import { schemaRequiresOperationId } from "../../electron/ipc/validators.common";
import { registerAppWindow, __resetTrustedSendersForTests } from "../../electron/ipc/sender-guard";

type Outcome = { ok: boolean; code?: string; data?: unknown; message?: string };

/**
 * SEC-01 : la garde de PROVENANCE est désormais dans le tuyau `handle()`.
 * Ces tests doivent donc exercer le cas RÉEL : la requête provient d'une
 * fenêtre enregistrée de l'application. Le cas « origine non autorisée »
 * est couvert séparément (voir « refus de provenance » ci-dessous) et par
 * tests/unit/ipc-sender-guard.test.ts.
 */
const TRUSTED_SENDER_ID = 4242;
const FORGED_SENDER_ID = 9999;

function registerTrustedSender(): void {
  registerAppWindow({
    isDestroyed: () => false,
    webContents: { id: TRUSTED_SENDER_ID },
  } as never);
}

function trustedEvent(): { sender: { id: number } } {
  return { sender: { id: TRUSTED_SENDER_ID } };
}

function forgedEvent(): { sender: { id: number } } {
  return { sender: { id: FORGED_SENDER_ID } };
}

async function call(channel: string, raw: unknown): Promise<Outcome> {
  const fn = captured.registry.get(channel);
  if (!fn) throw new Error(`Canal non enregistré : ${channel}`);
  return (await fn(trustedEvent(), raw)) as Outcome;
}

/** Appel avec une origine NON autorisée (compromission du renderer). */
async function callForged(channel: string, raw: unknown): Promise<Outcome> {
  const fn = captured.registry.get(channel);
  if (!fn) throw new Error(`Canal non enregistré : ${channel}`);
  return (await fn(forgedEvent(), raw)) as Outcome;
}

// Canaux réellement gates, choisis pour tester LES GATES et non les permissions.
const PAGE_CHANNEL = IPC_CHANNELS["products.search"];
const FEATURE_CHANNEL = IPC_CHANNELS["reports.summary"];

beforeEach(() => {
  captured.registry.clear();
  staffHolder.userId = 7;
  staffHolder.mustChange = false;
  staffHolder.touchCount = 0;
  licenceHolder.refusePages = false;
  licenceHolder.refuseFeatures = false;
  __resetTrustedSendersForTests();
  registerTrustedSender();
});

describe("handle — provenance de la requête (SEC-01)", () => {
  it("REFUSE une requête dont l'origine n'est PAS une fenêtre de l'application", async () => {
    let executed = false;
    handle("t.forged", null, () => {
      executed = true;
      return "不该到达";
    });
    const out = await callForged("t.forged", {});
    expect(out.ok).toBe(false);
    expect(out.code).toBe("SENDER_NOT_ALLOWED");
    expect(out.message).toBe("Action non autorisée.");
    // La preuve décisive : le handler n'a JAMAIS été exécuté — donc aucun
    // effet de bord (aucune écriture, aucune mutation).
    expect(executed).toBe(false);
  });

  it("REFUSE une requête sans origine (sender absent)", async () => {
    handle("t.none", null, () => 1);
    const fn = captured.registry.get("t.none");
    if (!fn) throw new Error("Canal non enregistré");
    const out = (await fn({ sender: null }, {})) as Outcome;
    expect(out.ok).toBe(false);
    expect(out.code).toBe("SENDER_NOT_ALLOWED");
  });

  it("ACCEPTE une requête provenant d'une fenêtre enregistrée", async () => {
    handle("t.trusted", null, () => "ok");
    expect(await call("t.trusted", {})).toEqual({ ok: true, data: "ok" });
  });
});

describe("handle — tuyau général", () => {
  it("rend ok:true sur les données d'un handler synchrone ou asynchrone", async () => {
    handle("t.sync", null, () => 41);
    handle("t.async", null, () => Promise.resolve("fait"));
    expect(await call("t.sync", {})).toEqual({ ok: true, data: 41 });
    expect(await call("t.async", {})).toEqual({ ok: true, data: "fait" });
    // Chaque appel autorisé prolonge la session (30 min d'inactivité).
    expect(staffHolder.touchCount).toBe(2);
  });

  it("sans schéma, passe le payload tel quel (ici : un objet vide)", async () => {
    const sent = { page: 2 };
    handle("t.echo", null, (input: unknown) => input);
    expect(await call("t.echo", sent)).toEqual({ ok: true, data: sent });
    handle("t.none", null, (input: unknown) => (input === undefined ? "absent" : "présent"));
    expect(await call("t.none", undefined)).toEqual({ ok: true, data: "absent" });
  });

  it("refuse une entrée invalide SANS exécuter le handler", async () => {
    let ran = 0;
    handle("t.bad", z.object({ montant: z.number() }), () => {
      ran += 1;
      return "jamais";
    });
    const res = await call("t.bad", { montant: "pas-un-nombre" });
    expect(ran).toBe(0);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("VALIDATION_ERROR");
    expect(res.message).toBeTruthy();
  });

  it("une exception du handler ressort en message FR + code, jamais en pile", async () => {
    handle("t.throw", null, () => {
      throw new Error("Dépense introuvable.");
    });
    const res = await call("t.throw", {});
    expect(res.ok).toBe(false);
    expect(res.message).toBe("Dépense introuvable.");
    expect(JSON.stringify(res)).not.toMatch(/at .*\.ts:/);
  });
});

describe("handle — opération identifiée (P1-6)", () => {
  it("refuse un operationId vide, sans effet de bord", async () => {
    let ran = 0;
    handle("t.op", z.object({ operationId: z.string() }), () => {
      ran += 1;
      return "ok";
    });
    const res = await call("t.op", { operationId: "   " });
    expect(res.ok).toBe(false);
    expect(res.message).toBe("Opération non identifiée : veuillez réessayer l'action.");
    expect(ran).toBe(0);
    expect(await call("t.op", { operationId: "3f1a2b4c-0000-4000-8000-000000000001" })).toEqual({
      ok: true,
      data: "ok",
    });
    expect(ran).toBe(1);
  });

  it("détecte l'exigence à travers ZodUUID, jamais à travers optional/nullable/défaut", () => {
    // Régression session 64 : `z.uuid()` n'est PAS un ZodString → sans la
    // correction, l'exigence se désactivait silencieusement en production.
    expect(schemaRequiresOperationId(z.object({ operationId: z.string() }))).toBe(true);
    expect(schemaRequiresOperationId(z.object({ operationId: z.uuid() }))).toBe(true);
    expect(schemaRequiresOperationId(z.object({ operationId: z.string().optional() }))).toBe(false);
    expect(schemaRequiresOperationId(z.object({ operationId: z.string().nullable() }))).toBe(false);
    expect(schemaRequiresOperationId(z.object({ operationId: z.string().default("") }))).toBe(
      false,
    );
    expect(schemaRequiresOperationId(z.object({ note: z.string() }))).toBe(false);
    expect(schemaRequiresOperationId(null)).toBe(false);
  });
});

describe("handle — gates de licence", () => {
  it("un canal page-gated refusé tombe avant exécution, message de licence", async () => {
    licenceHolder.refusePages = true;
    let ran = 0;
    handle(PAGE_CHANNEL, null, () => {
      ran += 1;
      return "non";
    });
    const res = await call(PAGE_CHANNEL, {});
    expect(ran).toBe(0);
    expect(res.message).toMatch(/licence/);
  });

  it("un canal feature-gated refusé tombe de même", async () => {
    licenceHolder.refuseFeatures = true;
    let ran = 0;
    handle(FEATURE_CHANNEL, null, () => {
      ran += 1;
      return "non";
    });
    const res = await call(FEATURE_CHANNEL, {});
    expect(ran).toBe(0);
    expect(res.message).toMatch(/licence/);
  });

  it("laisse passer quand la licence accepte", async () => {
    handle(PAGE_CHANNEL, null, () => " rendu");
    handle(FEATURE_CHANNEL, null, () => " rendu");
    expect(await call(PAGE_CHANNEL, {})).toEqual({ ok: true, data: " rendu" });
    expect(await call(FEATURE_CHANNEL, {})).toEqual({ ok: true, data: " rendu" });
  });
});

describe("handle — verrou must_change_code côté main", () => {
  it("refuse toute action hors liste blanche tant que le code n'est pas changé", async () => {
    staffHolder.mustChange = true;
    handle("t.locked", null, () => "non");
    const res = await call("t.locked", {});
    expect(res.ok).toBe(false);
    expect(res.message).toBe("Veuillez d'abord changer votre code d'accès.");
  });

  it("autorise exceptionnellement changement de code, lecture de session et sortie", async () => {
    staffHolder.mustChange = true;
    for (const channel of [
      IPC_CHANNELS["staff.changeCode"],
      IPC_CHANNELS["staff.session"],
      IPC_CHANNELS["staff.logout"],
    ]) {
      handle(channel, null, () => "libre");
      const res = await call(channel, {});
      expect(res.ok).toBe(true);
    }
  });

  it("ne verrouille pas tant qu'aucune session staff n'est ouverte", async () => {
    staffHolder.userId = null;
    staffHolder.mustChange = true;
    handle("t.anon", null, () => "ok");
    expect(await call("t.anon", {})).toEqual({ ok: true, data: "ok" });
  });
});
