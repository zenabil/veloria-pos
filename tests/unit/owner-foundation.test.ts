// Veloria Owner (app propriétaire) — fondations : jetons, formateurs,
// sélecteurs, contrat API et cache local hors natif.
// La fixture ci-dessous vit uniquement dans le test : l'app ne contient
// aucune donnée fictive.
import { describe, expect, it } from "vitest";
import { COLORS, SIZES } from "../../owner/src/tokens";
import {
  formatDateLongFr,
  formatDateShortFr,
  formatMinor,
  formatPercent,
  formatSignedMinor,
  formatTime,
  freshnessLabel,
} from "../../owner/src/format";
import {
  filterProducts,
  findDebtor,
  findJournalEntry,
  findProduct,
  productStatus,
  recentMovements,
  type JournalRow,
  type OwnerSnapshot,
  type Product,
} from "../../owner/src/store";
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

function makeProduct(
  input: Pick<Product, "id" | "ref" | "name" | "quantity" | "minLevel"> & Partial<Product>,
): Product {
  return {
    ean: null,
    subtitle: "Article de test",
    unit: { singular: "flacon", plural: "flacons" },
    valueMinor: 0,
    purchaseUnitMinor: 100,
    saleUnitMinor: 200,
    marginUnitMinor: 100,
    marginPercent: 50,
    sold30: 0,
    perDay: 0,
    autonomyDays: 0,
    suggestedRestock: 0,
    lastInventoryAt: null,
    movements: [],
    ...input,
  };
}

const PRODUCT_LOW = makeProduct({
  id: "p-1",
  ref: "VL-1",
  name: "Produit sous seuil",
  quantity: 2,
  minLevel: 5,
  valueMinor: 400,
  movements: [
    {
      id: "m-1",
      at: "2026-10-30T10:00:00",
      kind: "vente",
      ref: "Vente Ticket #1",
      note: null,
      badge: null,
      qty: -1,
      balance: 2,
    },
    {
      id: "m-2",
      at: "2026-10-29T09:00:00",
      kind: "reception",
      ref: "Réception BL-1",
      note: null,
      badge: null,
      qty: 3,
      balance: 3,
    },
  ],
});
const PRODUCT_OUT = makeProduct({
  id: "p-2",
  ref: "VL-2",
  name: "Produit en rupture",
  quantity: 0,
  minLevel: 3,
  movements: [
    {
      id: "m-3",
      at: "2026-10-30T12:00:00",
      kind: "vente",
      ref: "Vente Ticket #2",
      note: null,
      badge: null,
      qty: -1,
      balance: 0,
    },
  ],
});

const SALE_ROW: JournalRow = {
  id: "j-sale",
  at: "2026-10-30T10:00:00",
  kind: "sale",
  ref: "Ticket #1",
  detail: "Vente de test",
  amountMinor: 1000,
  tx: {
    kind: "sale",
    invoiceNumber: "FC-TEST-1",
    lines: [{ name: "Produit test", qty: 1, unitMinor: 1000, totalMinor: 1000 }],
    subtotalMinor: 1000,
    discountMinor: 0,
    totalMinor: 1000,
    payment: { label: "Espèces", receivedMinor: 1200, changeMinor: 200, creditMinor: 0 },
    cashier: "Opérateur",
    session: "S-1",
  },
};
const PAYMENT_ROW: JournalRow = {
  id: "j-payment",
  at: "2026-10-30T09:00:00",
  kind: "payment",
  ref: "Dépôt caisse",
  detail: "Transfert test",
  amountMinor: -5000,
  tx: {
    kind: "payment",
    label: "Dépôt caisse",
    method: "Versement trésorerie",
    reference: "REF-1",
    amountMinor: 5000,
    operator: "Opérateur",
    note: null,
  },
};

const SNAPSHOT: OwnerSnapshot = {
  version: 1,
  shopName: "Magasin test",
  generatedAt: "2026-10-30T18:00:00",
  day: {
    date: "2026-10-30T00:00:00",
    salesMinor: 1000,
    salesCount: 1,
    returnsMinor: 0,
    returnsCount: 0,
    profitMinor: 500,
    cashMinor: 1200,
    basketMinor: 1000,
    ticketsDelta: null,
    objectiveMinor: null,
    comparison: { previousLabel: "hier", deltaPercent: 0 },
    methods: [],
    journal: [SALE_ROW, PAYMENT_ROW],
  },
  money: {
    audit: { fundsMinor: 0, varianceNetMinor: 0, conformityPercent: 100, activeRegisters: 0 },
    activeSession: null,
    sessions: [],
    expenses: { monthLabel: "Octobre 2026", totalMinor: 0, count: 0, rows: [] },
    debts: {
      totalMinor: 1000,
      overdueMinor: 0,
      count: 1,
      rows: [
        {
          id: "debt-1",
          code: "CLT-1",
          name: "Client test",
          segment: "B2C",
          manager: null,
          phone: "+213000000000",
          totalMinor: 1000,
          overdueMinor: 0,
          limitMinor: null,
          lastPaymentMinor: null,
          lastPaymentAt: null,
          lastPaymentNote: null,
          lateDays: 0,
          aging: { d0to30Minor: 1000, d31to60Minor: 0, d60plusMinor: 0 },
          invoices: [],
        },
      ],
    },
  },
  stock: {
    valueMinor: 400,
    references: 2,
    lowCount: 1,
    outCount: 1,
    deadCount: 0,
    lastInventoryAt: null,
    products: [PRODUCT_LOW, PRODUCT_OUT],
  },
  periods: {
    range: 7,
    totalMinor: 1000,
    tickets: 1,
    basketMinor: 1000,
    marginTotalMinor: 500,
    marginPercent: 50,
    days: [{ date: "2026-10-30T00:00:00", totalMinor: 1000 }],
    categories: [],
    top: [],
  },
  alerts: {
    critical: 0,
    watch: 0,
    ok: 0,
    anomaliesTitle: "0 anomalie active",
    anomaliesDetail: "",
    stock: [],
    debts: [],
    system: [],
  },
};

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
    // Instant EXPLICITE (UTC) : l'affichage se fait en heure d'Alger
    // (UTC+1) et le résultat NE DOIT PAS dépendre du fuseau de la machine
    // (le runner CI est en UTC, le poste vendor en UTC+1).
    expect(formatTime("2026-10-30T16:42:00.000Z")).toBe("17:42");
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
  });
});

describe("sélecteurs de la liasse", () => {
  it("statut produit : rupture, sous seuil, disponible", () => {
    const low = findProduct(SNAPSHOT, "p-1");
    const out = findProduct(SNAPSHOT, "p-2");
    const ok = makeProduct({
      id: "p-3",
      ref: "VL-3",
      name: "Produit disponible",
      quantity: 9,
      minLevel: 5,
    });
    expect(low && productStatus(low)).toBe("low");
    expect(out && productStatus(out)).toBe("out");
    expect(productStatus(ok)).toBe("ok");
  });
  it("filtres stock + recherche référence/nom", () => {
    const products = SNAPSHOT.stock.products;
    expect(filterProducts(products, "out", "").map((p) => p.id)).toEqual(["p-2"]);
    expect(filterProducts(products, "low", "").map((p) => p.id)).toEqual(["p-1"]);
    expect(filterProducts(products, "all", "VL-1").map((p) => p.id)).toEqual(["p-1"]);
    expect(filterProducts(products, "all", "rupture").map((p) => p.id)).toEqual(["p-2"]);
    expect(filterProducts(products, "all", "zzz")).toEqual([]);
  });
  it("flux des mouvements : tri décroissant, limite respectée", () => {
    const feed = recentMovements(SNAPSHOT, 2);
    expect(feed).toHaveLength(2);
    expect(feed.map((r) => r.movement.id)).toEqual(["m-3", "m-1"]);
    expect(recentMovements(SNAPSHOT, 100)).toHaveLength(3);
  });
  it("client débiteur retrouvé par identifiant", () => {
    expect(findDebtor(SNAPSHOT, "debt-1")?.name).toBe("Client test");
    expect(findDebtor(SNAPSHOT, "inconnu")).toBeNull();
  });
  it("détails de transaction cohérents avec le journal", () => {
    for (const row of SNAPSHOT.day.journal) {
      expect(findJournalEntry(SNAPSHOT, row.id)?.id).toBe(row.id);
      expect(row.tx.kind).toBe(row.kind);
      if (row.tx.kind === "sale") {
        const lines = row.tx.lines.reduce((acc, l) => acc + l.totalMinor, 0);
        expect(lines).toBe(row.tx.subtotalMinor);
        expect(row.tx.totalMinor).toBe(row.amountMinor);
        expect(row.tx.payment.receivedMinor - row.tx.payment.changeMinor).toBe(
          row.tx.totalMinor - row.tx.payment.creditMinor,
        );
      }
      if (row.tx.kind === "return") {
        expect(row.tx.totalMinor).toBe(-row.amountMinor);
        expect(row.tx.refund.amountMinor).toBe(row.tx.totalMinor);
      }
      if (row.tx.kind === "payment" || row.tx.kind === "expense") {
        expect(row.tx.amountMinor).toBe(-row.amountMinor);
      }
    }
    expect(findJournalEntry(SNAPSHOT, "inconnu")).toBeNull();
  });
  it("forme de liasse : fixture valide, objet vide refusé", () => {
    expect(isSnapshotShape(SNAPSHOT)).toBe(true);
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
    init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
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
  it("liasse : lecture PostgREST, jeton obligatoire, 401 → UNAUTHORIZED, vide → SERVER_ERROR", async () => {
    let seenUrl = "";
    let seenMethod = "";
    const okFetch: MockFetch = (url, init) => {
      seenUrl = url;
      seenMethod = init.method;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([{ payload: SNAPSHOT, generated_at: "x" }]),
        text: () => Promise.resolve(""),
      });
    };
    await expect(fetchOwnerSnapshot("", okFetch)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const r = await fetchOwnerSnapshot("tok-1", okFetch);
    expect(r.generatedAt).toBe("x");
    expect(seenMethod).toBe("GET");
    expect(seenUrl).toContain("/rest/v1/owner_snapshots");
    expect(seenUrl).toContain("shop_key=eq.veloria");
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
    const empty: MockFetch = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
        text: () => Promise.resolve(""),
      });
    await expect(fetchOwnerSnapshot("tok-1", empty)).rejects.toMatchObject({
      code: "SERVER_ERROR",
    });
  });
});

describe("cache local propriétaire", () => {
  it("liasse relisible puis purgée à la déconnexion", () => {
    clearSnapshot();
    expect(loadSnapshot().snapshot).toBeNull();
    saveSnapshot(SNAPSHOT, "2026-10-30T18:00:00");
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
      lastLoginAt: "2026-10-30T18:00:00",
    });
    expect((await loadSession())?.email).toBe("direction@veloria.dz");
    await clearSession();
    expect(await loadSession()).toBeNull();
  });
});
