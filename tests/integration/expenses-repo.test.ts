// Veloria PoS — `expenses.repo` : validation d'argent, idempotence, filtres,
// recherche par numéro, échappement LIKE et statistiques de mois métier.
// Base migrée réelle (node:sqlite) : la porte mesurait ce module à 0 %.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const repoDb = vi.hoisted(() => ({ current: null as DatabaseSync | null }));

vi.mock("../../electron/database/sqlite.service", () => ({
  getDb: () => {
    const raw = repoDb.current;
    if (!raw) throw new Error("Base de test non ouverte.");
    return {
      prepare: (sql: string) => raw.prepare(sql),
      exec: (sql: string) => raw.exec(sql),
      transaction:
        <R>(fn: () => R) =>
        (): R => {
          raw.exec("BEGIN");
          try {
            const out = fn();
            raw.exec("COMMIT");
            return out;
          } catch (err) {
            try {
              raw.exec("ROLLBACK");
            } catch {
              /* déjà annulé */
            }
            throw err;
          }
        },
    };
  },
}));

vi.mock("../../electron/services/logger", () => ({
  log: () => {},
  initLogger: () => "",
  getLogFile: () => "",
}));

import {
  createExpense,
  deleteExpenseAtomic,
  getExpenseStats,
  listExpensesUnified,
  updateExpense,
  type ExpenseUpsert,
} from "../../electron/ipc/handlers/expenses.repo";
import { businessMonthOf } from "../../electron/shared/business-day";

const NOW = "2026-09-15T10:00:00.000Z";

/** `getExpenseStats` compare `expense_date` au mois métier **courant** tel que
 * le calcule SQLite (`strftime('%Y-%m','now','+1 hour')`) : la graine du mois
 * suit donc l'horloge réelle — un instant figé rendrait la mesure fausse au
 * changement de mois (94 % de la suite utilise des instants fixes, ici ce serait
 * un faux négatif). */
const CURRENT_MONTH = businessMonthOf(new Date().toISOString());

/** `operationId` UUID complet, haché ENTIER (un tronc ferait replay entre cas). */
const OP = (seed: string): string => {
  const hex = createHash("sha256").update(`veloria-expense-${seed}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

function base(overrides: Partial<ExpenseUpsert> = {}): ExpenseUpsert {
  return {
    description: "Achat cartons",
    category: "Fournitures",
    amountMinor: 12_5000,
    expenseDate: "2026-09-10",
    supplierId: null,
    paymentMethod: "cash",
    status: "paid",
    reference: null,
    notes: null,
    ...overrides,
  };
}

function count(table: string): number {
  const raw = repoDb.current;
  if (!raw) throw new Error("Base de test non ouverte.");
  return Number((raw.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c);
}

function firstSupplier(): number {
  const raw = repoDb.current;
  if (!raw) throw new Error("Base de test non ouverte.");
  // La base EXIGE un code fournisseur (trigger des migrations « Code
  // fournisseur requis. ») : une graine brute doit le fournir, comme le fait
  // `createSupplier` via le séquentiel FOU-#####.
  raw
    .prepare(
      `INSERT INTO suppliers (uuid, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .run("11111111-1111-4111-8111-111111111111", "FOU-00001", "Grossiste Nord", NOW, NOW);
  return Number(
    (raw.prepare(`SELECT id FROM suppliers WHERE name = 'Grossiste Nord'`).get() as { id: number })
      .id,
  );
}

function openMigrated(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  const migDir = path.join(process.cwd(), "database", "migrations");
  for (const f of fs
    .readdirSync(migDir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
  }
  db.exec("PRAGMA foreign_keys=ON;");
  return db;
}

describe("expenses.repo — création et argent", () => {
  beforeEach(() => {
    repoDb.current = openMigrated();
  });

  it("insère la dépense avec sa ligne d'audit", () => {
    const id = createExpense({ ...base(), operationId: OP("ok"), now: NOW });
    expect(Number.isInteger(id)).toBe(true);
    expect(count("expenses")).toBe(1);
    expect(count("audit_log")).toBe(1);
    const rows = listExpensesUnified("", 1, 10).rows as { amount_minor: number }[];
    expect(rows[0]?.amount_minor).toBe(12_5000);
  });

  it("refuse description trop courte, catégorie vide, montant non entier ou nul", () => {
    expect(() =>
      createExpense({ ...base({ description: "A" }), operationId: OP("d1"), now: NOW }),
    ).toThrow(/Description de dépense requise/);
    expect(() =>
      createExpense({ ...base({ category: " " }), operationId: OP("d2"), now: NOW }),
    ).toThrow(/Catégorie requise/);
    expect(() =>
      createExpense({ ...base({ amountMinor: 0 }), operationId: OP("d3"), now: NOW }),
    ).toThrow(/Montant de dépense invalide/);
    expect(() =>
      createExpense({ ...base({ amountMinor: 12_5000.5 }), operationId: OP("d4"), now: NOW }),
    ).toThrow(/Montant de dépense invalide/);
    expect(count("expenses")).toBe(0);
  });

  it("exige un moyen de paiement quand le statut est payé", () => {
    expect(() =>
      createExpense({
        ...base({ status: "paid", paymentMethod: null }),
        operationId: OP("pm"),
        now: NOW,
      }),
    ).toThrow(/Moyen de paiement requis/);
    // `pending` sans moyen : légitime (dépense à régler).
    const id = createExpense({
      ...base({ status: "pending", paymentMethod: null }),
      operationId: OP("pm2"),
      now: NOW,
    });
    expect(Number.isInteger(id)).toBe(true);
  });

  it("refuse un fournisseur inconnu avant toute écriture", () => {
    expect(() =>
      createExpense({ ...base({ supplierId: 4242 }), operationId: OP("sup"), now: NOW }),
    ).toThrow(/Fournisseur introuvable/);
    expect(count("expenses")).toBe(0);
  });

  it("rejoue le même operationId sans créer de doublon", () => {
    const args = { ...base(), operationId: OP("idem"), now: NOW };
    const first = createExpense(args);
    const again = createExpense(args);
    expect(again).toBe(first);
    expect(count("expenses")).toBe(1);
    expect(count("audit_log")).toBe(1);
  });

  it("accepte un fournisseur réel et le rend dans la liste", () => {
    const supplierId = firstSupplier();
    createExpense({
      ...base({ supplierId, reference: "FAC-9" }),
      operationId: OP("withSup"),
      now: NOW,
    });
    const rows = listExpensesUnified("", 1, 10).rows as { supplier_name: string }[];
    expect(rows[0]?.supplier_name).toBe("Grossiste Nord");
  });
});

describe("expenses.repo — modification et suppression", () => {
  beforeEach(() => {
    repoDb.current = openMigrated();
  });

  it("met à jour les champs et garde une seule ligne d'audit par opération", () => {
    const id = createExpense({ ...base(), operationId: OP("u0"), now: NOW });
    updateExpense({
      ...base({
        description: "Cartons cannelés",
        amountMinor: 9_9900,
        status: "pending",
        paymentMethod: null,
      }),
      id,
      now: NOW,
      operationId: OP("u1"),
    });
    const rows = listExpensesUnified("", 1, 10).rows as {
      description: string;
      amount_minor: number;
      status: string;
    }[];
    expect(rows[0]?.description).toBe("Cartons cannelés");
    expect(rows[0]?.amount_minor).toBe(9_9900);
    expect(rows[0]?.status).toBe("pending");
    expect(count("audit_log")).toBe(2);
    // Rejouement du même jeton : aucun effet de bord.
    updateExpense({
      ...base({
        description: "Cartons cannelés",
        amountMinor: 9_9900,
        status: "pending",
        paymentMethod: null,
      }),
      id,
      now: NOW,
      operationId: OP("u1"),
    });
    expect(count("audit_log")).toBe(2);
  });

  it("refuse une dépense inexistante en mise à jour", () => {
    expect(() => updateExpense({ ...base(), id: 999, now: NOW, operationId: OP("u404") })).toThrow(
      /Dépense introuvable/,
    );
  });

  it("supprime avec jeton : second appel est un succès silencieux", () => {
    const id = createExpense({ ...base(), operationId: OP("del0"), now: NOW });
    deleteExpenseAtomic(id, NOW, OP("del1"));
    expect(count("expenses")).toBe(0);
    expect(() => deleteExpenseAtomic(id, NOW, OP("del1"))).not.toThrow();
    expect(count("audit_log")).toBe(2);
  });

  it("suppression sans jeton : comportement historique (2e appel = introuvable)", () => {
    const id = createExpense({ ...base(), operationId: OP("del2"), now: NOW });
    deleteExpenseAtomic(id, NOW, null);
    expect(count("expenses")).toBe(0);
    expect(() => deleteExpenseAtomic(id, NOW, null)).toThrow(/Dépense introuvable/);
  });
});

describe("expenses.repo — recherche, filtres, statistiques", () => {
  beforeEach(() => {
    repoDb.current = openMigrated();
    createExpense({
      ...base({
        description: "Loyer local",
        category: "Loyer",
        amountMinor: 40_0000,
        expenseDate: `${CURRENT_MONTH}-03`,
      }),
      operationId: OP("s1"),
      now: NOW,
    });
    createExpense({
      ...base({
        description: "Cartons",
        category: "Fournitures",
        amountMinor: 5_0000,
        expenseDate: "2020-01-05",
        status: "pending",
        paymentMethod: null,
      }),
      operationId: OP("s2"),
      now: NOW,
    });
    createExpense({
      ...base({
        description: "100% jus",
        category: "Boissons",
        amountMinor: 15_0000,
        expenseDate: "2020-02-05",
        paymentMethod: "transfer",
      }),
      operationId: OP("s3"),
      now: NOW,
    });
  });

  it("filtre par statut et par moyen", () => {
    expect(listExpensesUnified("", 1, 10, { statusFilter: "pending" }).total).toBe(1);
    expect(listExpensesUnified("", 1, 10, { methodFilter: "transfer" }).total).toBe(1);
    expect(listExpensesUnified("", 1, 10, { category: "Loyer" }).total).toBe(1);
    expect(listExpensesUnified("", 1, 10).total).toBe(3);
  });

  it("trouve par numéro court DEP-<id> et par texte", () => {
    const all = listExpensesUnified("", 1, 10, { sort: "date_asc" }).rows as { id: number }[];
    const target = all[0]?.id as number;
    const byNum = listExpensesUnified(`DEP-${target}`, 1, 10).rows as { id: number }[];
    expect(byNum.map((r) => r.id)).toEqual([target]);
    expect(listExpensesUnified("loyer", 1, 10).total).toBe(1);
    expect(listExpensesUnified("carTons", 1, 10).total).toBe(1);
  });

  it("traite % et _ littéralement dans la recherche", () => {
    // Sans échappement, « % » correspondrait aux trois lignes.
    expect(listExpensesUnified("100% jus", 1, 10).total).toBe(1);
    expect(listExpensesUnified("%", 1, 10).total).toBe(1);
    expect(listExpensesUnified("_oyer", 1, 10).total).toBe(0);
  });

  it("borne la période sur la colonne date-seule et trie les montants", () => {
    expect(listExpensesUnified("", 1, 10, { from: "2020-02-01", to: "2020-12-31" }).total).toBe(1);
    const desc = listExpensesUnified("", 1, 10, { sort: "amount_desc" }).rows as {
      amount_minor: number;
    }[];
    expect(desc[0]?.amount_minor).toBe(40_0000);
    expect(desc[2]?.amount_minor).toBe(5_0000);
    const asc = listExpensesUnified("", 1, 10, { sort: "amount_asc" }).rows as {
      amount_minor: number;
    }[];
    expect(asc[0]?.amount_minor).toBe(5_0000);
  });

  it("page sans perdre le total", () => {
    const p1 = listExpensesUnified("", 1, 2, { sort: "amount_desc" });
    const p2 = listExpensesUnified("", 2, 2, { sort: "amount_desc" });
    expect(p1.total).toBe(3);
    expect(p1.rows.length).toBe(2);
    expect(p2.rows.length).toBe(1);
  });

  it("statistiques : total, payé, en attente, mois métier, catégories triées", () => {
    const stats = getExpenseStats();
    expect(stats.totalMinor).toBe(60_0000);
    expect(stats.paidMinor).toBe(55_0000);
    expect(stats.pendingMinor).toBe(5_0000);
    // Seule la dépense du mois courant (date « aujourd'hui ») entre dans « ce mois ».
    expect(stats.monthlyMinor).toBe(40_0000);
    expect(stats.categories).toEqual(["Boissons", "Fournitures", "Loyer"]);
  });
});
