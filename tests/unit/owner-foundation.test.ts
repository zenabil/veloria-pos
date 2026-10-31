// Veloria Owner (app propriétaire) — fondations : jetons, formateurs,
// filtres de stock, contrat API et cache local hors natif.
import { describe, expect, it } from "vitest";
import { COLORS, SIZES } from "../../owner/src/tokens";
import {
  formatDateLongFr,
  formatDateShortFr,
  formatDelta,
  formatMinor,
  formatPercent,
  formatSignedMinor,
  formatTime,
  freshnessLabel,
} from "../../owner/src/format";
import { filterProducts, findDebtor, findProduct, productStatus } from "../../owner/src/store";
import { DEMO_SNAPSHOT } from "../../owner/src/demo";
import {
  assertLoginFields,
  fetchOwnerSnapshot,
  isSnapshotShape,
  OwnerError,
  signInWithPassword,
} from "../../owner/src/api";
import {
  clearSnapshot,
  clearSession,
  loadSession,
  loadSnapshot,
  saveSession,
  saveSnapshot,
} from "../../owner/src/cache";

describe("jetons propriétaire", () => {
  it("identité Veloria : bleu nuit + or + cible tactile 48", () => {
    expect(COLORS.headerBg).toBe("#051424");
    expect(COLORS.primary).toBe("#fbbf24");
    expect(SIZES.touchMin).toBe(48);
  });
});

describe("formateurs français", () => {
  it("centimes → « 12 500,00 DZD », jamais de flottant", () => {
    expect(formatMinor(1250000)).toBe("12 500,00 DZD");
    expect(formatMinor(0)).toBe("0,00 DZD");
    expect(() => formatMinor(12.5)).toThrow();
    expect(() => formatMinor(Number.NaN)).toThrow();
  });
  it("montants signés du journal", () => {
    expect(formatSignedMinor(680000)).toBe("+6 800,00 DZD");
    expect(formatSignedMinor(-120000)).toBe("-1 200,00 DZD");
  });
  it("dates longues/courtes/heures (calendrier réel)", () => {
    expect(formatDateLongFr("2026-10-30T00:00:00")).toBe("Vendredi 30 octobre 2026");
    expect(formatDateShortFr("2026-10-30T00:00:00")).toBe("Ven. 30 oct.");
    expect(formatTime("2026-10-30T17:42:00")).toBe("17:42");
    expect(formatDateLongFr("nope")).toBe("—");
  });
  it("fraîcheur : minutes, heures, date de repli", () => {
    const now = new Date(2026, 9, 30, 18, 6).getTime();
    expect(freshnessLabel("2026-10-30T17:54:00", now)).toBe("Mis à jour il y a 12 min");
    expect(freshnessLabel("2026-10-30T15:00:00", now)).toBe("Mis à jour il y a 3 h");
    expect(freshnessLabel("2026-10-29T08:00:00", now)).toContain("Mis à jour le 29/10/2026");
    expect(freshnessLabel("nope")).toBe("Synchronisation inconnue");
  });
  it("pourcentages à la française", () => {
    expect(formatPercent(8.2)).toBe("8,2 %");
    expect(formatDelta(8.2)).toBe("+8,2 %");
    expect(formatDelta(-3.5)).toBe("-3,5 %");
  });
});

describe("sélecteurs de la liasse", () => {
  it("statut produit : rupture, sous seuil, disponible", () => {
    const serum = findProduct(DEMO_SNAPSHOT, "p-serum-412");
    const creme = findProduct(DEMO_SNAPSHOT, "p-creme-215");
    const nuit = findProduct(DEMO_SNAPSHOT, "p-nuit-100");
    expect(serum && productStatus(serum)).toBe("low");
    expect(creme && productStatus(creme)).toBe("out");
    expect(nuit && productStatus(nuit)).toBe("ok");
  });
  it("filtres stock + recherche référence/nom", () => {
    const products = DEMO_SNAPSHOT.stock.products;
    expect(filterProducts(products, "out", "").every((p) => p.quantity <= 0)).toBe(true);
    expect(
      filterProducts(products, "low", "").every((p) => p.quantity > 0 && p.quantity <= p.minLevel),
    ).toBe(true);
    expect(filterProducts(products, "all", "VL-412").map((p) => p.id)).toEqual(["p-serum-412"]);
    expect(filterProducts(products, "all", "brume").map((p) => p.id)).toEqual(["p-brume-109"]);
    expect(filterProducts(products, "all", "zzz")).toEqual([]);
  });
  it("client débiteur retrouvé par identifiant", () => {
    expect(findDebtor(DEMO_SNAPSHOT, "debt-oran")?.name).toBe("SARL Oran Parfums");
    expect(findDebtor(DEMO_SNAPSHOT, "inconnu")).toBeNull();
  });
  it("cohérence de la liasse de démonstration", () => {
    const day = DEMO_SNAPSHOT.day;
    const sumMethods = day.methods.reduce((acc, m) => acc + m.totalMinor, 0);
    expect(sumMethods).toBe(day.salesMinor);
    expect(DEMO_SNAPSHOT.money.debts.overdueMinor).toBeLessThanOrEqual(
      DEMO_SNAPSHOT.money.debts.totalMinor,
    );
    expect(
      DEMO_SNAPSHOT.stock.products.every((p) => (p.quantity === 0 ? p.valueMinor === 0 : true)),
    ).toBe(true);
    expect(isSnapshotShape(DEMO_SNAPSHOT)).toBe(true);
    expect(isSnapshotShape({})).toBe(false);
  });
});

describe("API propriétaire (fetch injecté)", () => {
  interface MockRes {
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
  }
  type MockFetch = (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
  ) => Promise<MockRes>;
  const okAuth: MockFetch = () =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ access_token: "tok-1", expires_at: 1900000000 }),
      text: () => Promise.resolve(""),
    });

  it("validation locale avant réseau", async () => {
    expect(() => assertLoginFields("pas-un-email", "motdepasse")).toThrow(OwnerError);
    expect(() => assertLoginFields("direction@veloria.dz", "court")).toThrow(OwnerError);
    await expect(
      signInWithPassword("direction@veloria.dz", "motdepasse", okAuth),
    ).resolves.toMatchObject({ accessToken: "tok-1" });
  });
  it("401 → AUTH_ERROR, timeout → OFFLINE_ERROR", async () => {
    const unauthorized: MockFetch = () =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(""),
      });
    await expect(
      signInWithPassword("direction@veloria.dz", "motdepasse", unauthorized),
    ).rejects.toMatchObject({ code: "AUTH_ERROR" });
    const hanging: MockFetch = () => new Promise<MockRes>(() => {});
    await expect(
      signInWithPassword("direction@veloria.dz", "motdepasse", hanging, "", "", 20),
    ).rejects.toMatchObject({ code: "OFFLINE_ERROR" });
  });
  it("liasse : jeton obligatoire, 401 → UNAUTHORIZED, réponse malformée → SERVER_ERROR", async () => {
    const okFetch: MockFetch = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ ok: true, data: { snapshot: DEMO_SNAPSHOT, generatedAt: "x" } }),
        text: () => Promise.resolve(""),
      });
    await expect(fetchOwnerSnapshot("", okFetch)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const r = await fetchOwnerSnapshot("tok-1", okFetch);
    expect(r.generatedAt).toBe("x");
    const unauthorized: MockFetch = () =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(""),
      });
    await expect(fetchOwnerSnapshot("tok-1", unauthorized)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    const malformed: MockFetch = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true, data: {} }),
        text: () => Promise.resolve(""),
      });
    await expect(fetchOwnerSnapshot("tok-1", malformed)).rejects.toMatchObject({
      code: "SERVER_ERROR",
    });
  });
});

describe("cache local propriétaire", () => {
  it("liasse relisible puis purgée à la déconnexion", () => {
    clearSnapshot();
    expect(loadSnapshot().snapshot).toBeNull();
    saveSnapshot(DEMO_SNAPSHOT, "2026-10-30T18:00:00");
    expect(loadSnapshot().generatedAt).toBe("2026-10-30T18:00:00");
    expect(isSnapshotShape(loadSnapshot().snapshot)).toBe(true);
    clearSnapshot();
    expect(loadSnapshot().snapshot).toBeNull();
  });
  it("session : e-mail conservé, purge explicite", async () => {
    await clearSession();
    expect(await loadSession()).toBeNull();
    await saveSession({
      email: "direction@veloria.dz",
      accessToken: null,
      demo: true,
      lastLoginAt: "2026-10-30T18:00:00",
    });
    expect((await loadSession())?.email).toBe("direction@veloria.dz");
    await clearSession();
    expect(await loadSession()).toBeNull();
  });
});
