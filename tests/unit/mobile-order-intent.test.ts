// Veloria Client (APK) — Envoi d'une intention de commande (ADR-182, tranche F).
//
// C'est la PREMIÈRE écriture depuis le téléphone. Ce que le test prouve :
//   1. la charge envoyée est la bonne (URL de la fonction, en-têtes anon,
//      téléphone + PIN + `operationId` + lignes + total) ;
//   2. le rejeu est idempotent côté serveur (`duplicate`) ;
//   3. une erreur d'authentification est distinguée d'une panne réseau
//      (l'APK affiche un message FR, jamais une exception brute).
import { describe, expect, it } from "vitest";

import { sendOrderIntent, SyncError } from "../../mobile/src/api.ts";

const LINES = [{ productId: 11, quantity: 2, unitCode: "PIECE" }];

interface TestInit {
  method: string;
  headers: Record<string, string>;
  body: string;
}

function baseArgs(
  fetchImpl: (url: string, init: TestInit) => Promise<unknown>,
): Parameters<typeof sendOrderIntent>[0] {
  return {
    baseUrl: "https://demo.supabase.co/",
    anonKey: "sb_publishable_demo",
    phone: "0550123456",
    pin: "123456",
    operationId: "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
    lines: LINES,
    totalMinor: 170_000,
    note: "après 16 h",
    fetchImpl: fetchImpl as never,
  };
}

describe("intention de commande — envoi", () => {
  it("poste la commande sur la fonction Edge avec la bonne charge", async () => {
    let called = "";
    let body = "";
    let headers: Record<string, string> = {};
    const result = await sendOrderIntent(
      baseArgs((url: string, init: TestInit) => {
        called = url;
        body = init.body;
        headers = init.headers;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ok: true, data: { accepted: true, duplicate: false } }),
          text: () => Promise.resolve(""),
        });
      }),
    );
    expect(called).toBe("https://demo.supabase.co/functions/v1/client-order");
    expect(headers["apikey"]).toBe("sb_publishable_demo");
    const payload = JSON.parse(body) as {
      phone: string;
      pin: string;
      operationId: string;
      lines: { productId: number; quantity: number }[];
      totalMinor: number;
      note: string;
    };
    expect(payload.phone).toBe("0550123456");
    expect(payload.pin).toBe("123456");
    expect(payload.operationId).toBe("3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f");
    expect(payload.lines).toEqual(LINES);
    expect(payload.totalMinor).toBe(170_000);
    expect(payload.note).toBe("après 16 h");
    expect(result.accepted).toBe(true);
    expect(result.duplicate).toBe(false);
  });

  it("un rejeu est accepté SANS doublon", async () => {
    const result = await sendOrderIntent(
      baseArgs(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ok: true, data: { accepted: true, duplicate: true } }),
          text: () => Promise.resolve(""),
        }),
      ),
    );
    expect(result.duplicate).toBe(true);
  });

  it("distingue l'erreur d'authentification de la panne réseau", async () => {
    await expect(
      sendOrderIntent(
        baseArgs(() =>
          Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ ok: false, code: "AUTH_ERROR" }),
            text: () => Promise.resolve(""),
          }),
        ),
      ),
    ).rejects.toThrow(SyncError);
    await expect(
      sendOrderIntent(baseArgs(() => Promise.reject(new Error("network down")))),
    ).rejects.toThrow(/hors connexion/i);
  });

  it("une réponse inattendue est refusée (jamais un faux succès)", async () => {
    await expect(
      sendOrderIntent(
        baseArgs(() =>
          Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ ok: false }),
            text: () => Promise.resolve(""),
          }),
        ),
      ),
    ).rejects.toThrow(/inattendue/i);
  });
});
