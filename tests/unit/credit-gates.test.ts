// Veloria PoS — `enforceCreditGates` : la porte qui décide si une vente à crédit,
// un paiement partiel, une conversion de devis ou un retour consomme une
// CAPABILITY de licence. Deux audits y ont laissé des correctifs (A1/A2 :
// lecture « best effort » → fail-closed, total de porte recalculé par la RÈGLE
// UNIQUE du main). Ce fichier verrouille ces deux propriétés ; le module était
// mesuré à 7,9 %.
import { describe, it, expect, beforeEach, vi } from "vitest";

type Answer = (sql: string, params: unknown[]) => unknown;

const dbHolder = vi.hoisted(() => ({
  answer: null as Answer | null,
  fail: false,
}));

vi.mock("../../electron/database/sqlite.service", () => ({
  getDb: () => ({
    prepare: (sql: string) => ({
      get: (...params: unknown[]) => {
        if (dbHolder.fail) throw new Error("SQLITE_BUSY: database is locked");
        const fn = dbHolder.answer;
        return fn ? fn(sql, params) : undefined;
      },
    }),
  }),
}));

// `exactOptionalPropertyTypes` est activé dans le tsconfig racine : une lecture
// potentiellement `undefined` doit être déclarée `| undefined`, pas seulement `?`.
const logs = vi.hoisted(() => [] as { event: string; error?: string | undefined }[]);
vi.mock("../../electron/services/logger", () => ({
  log: (_l: string, _c: string, event: string, extra?: { error?: string }) => {
    logs.push({ event, error: extra?.error });
  },
  initLogger: () => "",
  getLogFile: () => "",
}));

const asked = vi.hoisted(() => [] as string[]);
vi.mock("../../electron/licensing/license-service", () => ({
  requireLicensedFeature: (_deps: unknown, feature: string) => {
    asked.push(feature);
  },
}));

import { enforceCreditGates } from "../../electron/ipc/credit-gates";
import { IPC_CHANNELS } from "../../electron/ipc/channels";

const DEPS = {} as never;

function gate(channel: string, input: unknown): void {
  enforceCreditGates(channel, input, DEPS);
}

beforeEach(() => {
  asked.length = 0;
  logs.length = 0;
  dbHolder.fail = false;
  dbHolder.answer = null;
});

describe("credit-gates — sales.create", () => {
  it("crédit intégral (rien payé) : debt-management seul", () => {
    gate(IPC_CHANNELS["sales.create"], {
      totalMinor: 100_0000,
      amountPaidMinor: 0,
    });
    expect(asked).toEqual(["debt-management"]);
  });

  it("paiement partiel : debt-management PUIS partial-payments", () => {
    gate(IPC_CHANNELS["sales.create"], {
      totalMinor: 100_0000,
      amountPaidMinor: 40_0000,
    });
    expect(asked).toEqual(["debt-management", "partial-payments"]);
  });

  it("comptant intégral : aucune capability", () => {
    gate(IPC_CHANNELS["sales.create"], { totalMinor: 100_0000, amountPaidMinor: 100_0000 });
    expect(asked).toEqual([]);
  });

  it("sans total déclaré, le total de porte suit les prix FACTURÉS (A2/P0-7)", () => {
    // 3 × (original 10,00 → facturé 8,00) = 24,00 + livraison 0,50 = 24,50.
    // Payé 24,50 : comptant intégral au prix facturé. Avec l'ancienne
    // arithmète maison (prix ORIGINE 30,00 + 0,50 = 30,50) la porte aurait
    // exigé deux capabilities à tort.
    gate(IPC_CHANNELS["sales.create"], {
      amountPaidMinor: 2450,
      deliveryFeeMinor: 50,
      lines: [
        {
          originalUnitPriceMinor: 1000,
          unitPriceMinor: 800,
          quantity: 3,
        },
      ],
    });
    expect(asked).toEqual([]);
  });

  it("ligne de mode « Montant » : le facturé saisi commande la porte", () => {
    // 2 × 5,00 = 10,00 facturé ; payé 6,00 → crédit + partiel.
    gate(IPC_CHANNELS["sales.create"], {
      amountPaidMinor: 600,
      lines: [{ unitPriceMinor: 500, quantity: 2, billedTotalMinor: 1000 }],
    });
    expect(asked).toEqual(["debt-management", "partial-payments"]);
  });

  it("ligne illisible : la porte LÈVE au lieu de laisser passer sans total", () => {
    expect(() =>
      gate(IPC_CHANNELS["sales.create"], {
        amountPaidMinor: 10,
        lines: [{ unitPriceMinor: Number.NaN, quantity: 2 }],
      }),
    ).toThrow(/invali|incohérent/);
    expect(asked).toEqual([]);
  });
});

describe("credit-gates — proformas.convert", () => {
  it("conversion à crédit partiel : les deux capabilities selon le total de base", () => {
    dbHolder.answer = (sql, params) =>
      sql.includes("proforma_invoices") && params[0] === 7 ? { total_minor: 90_0000 } : undefined;
    gate(IPC_CHANNELS["proformas.convert"], { proformaId: 7, amountPaidMinor: 30_0000 });
    expect(asked).toEqual(["debt-management", "partial-payments"]);
  });

  it("conversion soldée : aucune capability", () => {
    dbHolder.answer = () => ({ total_minor: 90_0000 });
    gate(IPC_CHANNELS["proformas.convert"], { proformaId: 7, amountPaidMinor: 90_0000 });
    expect(asked).toEqual([]);
  });

  it("base verrouillée : FAIL-CLOSED en FR (A1), jamais un crédit sans gate", () => {
    dbHolder.fail = true;
    expect(() =>
      gate(IPC_CHANNELS["proformas.convert"], { proformaId: 7, amountPaidMinor: 10_0000 }),
    ).toThrow(/Vérification de la licence impossible/);
    expect(logs.map((l) => l.event)).toContain("license.gate_proforma_total_read_failed");
  });
});

describe("credit-gates — returns.create", () => {
  it("retour sur vente portant dette : debt-management", () => {
    dbHolder.answer = (sql) =>
      sql.includes("outstanding_balance_minor") ? { debt: 5_0000 } : undefined;
    gate(IPC_CHANNELS["returns.create"], { kind: "customer", saleId: 12 });
    expect(asked).toEqual(["debt-management"]);
  });

  it("retour sur vente au comptant (dette nulle) : aucune capability", () => {
    dbHolder.answer = () => ({ debt: 0 });
    gate(IPC_CHANNELS["returns.create"], { kind: "customer", saleId: 12 });
    expect(asked).toEqual([]);
  });

  it("lecture de dette impossible : fail-closed FR", () => {
    dbHolder.fail = true;
    expect(() => gate(IPC_CHANNELS["returns.create"], { kind: "customer", saleId: 12 })).toThrow(
      /Vérification de la licence impossible/,
    );
    expect(logs.map((l) => l.event)).toContain("license.gate_debt_read_failed");
  });

  it("un retour fournisseur ne lit pas la dette client", () => {
    dbHolder.fail = true;
    expect(() =>
      gate(IPC_CHANNELS["returns.create"], { kind: "supplier", supplierId: 3 }),
    ).not.toThrow();
    expect(asked).toEqual([]);
  });
});

describe("credit-gates — canaux hors porte", () => {
  it("laissent passer sans toucher la base", () => {
    dbHolder.fail = true;
    expect(() => gate(IPC_CHANNELS["stock.overview"], {})).not.toThrow();
    expect(() => gate("produit.danger", { amountPaidMinor: 1, totalMinor: 999_999 })).not.toThrow();
    expect(asked).toEqual([]);
  });
});
