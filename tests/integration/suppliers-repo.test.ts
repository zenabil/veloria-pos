// Veloria PoS — `suppliers.repo` : CRUD, code automatique, idempotence, dette,
// paiement atomique (dette − montant + audit + paiement en UNE transaction),
// verrous de suppression et recherche paginée. Base migrée réelle (node:sqlite) ;
// la porte mesurait ce module à 0 %.
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
  createSupplier,
  deleteSupplierAtomic,
  deleteSuppliersAtomic,
  getSupplierStats,
  recordSupplierPaymentAtomic,
  searchSuppliers,
  updateSupplier,
  type SupplierUpsert,
} from "../../electron/ipc/handlers/suppliers.repo";
import { createExpense } from "../../electron/ipc/handlers/expenses.repo";

const NOW = "2026-09-15T10:00:00.000Z";

const OP = (seed: string): string => {
  const hex = createHash("sha256").update(`veloria-supplier-${seed}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

function sup(name: string, overrides: Partial<SupplierUpsert> = {}): SupplierUpsert {
  return {
    name,
    code: null,
    contact: null,
    phone: "0550000000",
    email: null,
    address: null,
    taxNumber: null,
    commercialRegister: null,
    notes: null,
    isActive: true,
    ...overrides,
  };
}

function raw(): DatabaseSync {
  const db = repoDb.current;
  if (!db) throw new Error("Base de test non ouverte.");
  return db;
}

function count(table: string): number {
  return Number((raw().prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c);
}

function setDebt(id: number, minor: number): void {
  raw().prepare(`UPDATE suppliers SET outstanding_balance_minor = ? WHERE id = ?`).run(minor, id);
}

function debt(id: number): number {
  return Number(
    (
      raw()
        .prepare(`SELECT outstanding_balance_minor AS b FROM suppliers WHERE id = ?`)
        .get(id) as {
        b: number;
      }
    ).b,
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

describe("suppliers.repo — création et validations", () => {
  beforeEach(() => {
    repoDb.current = openMigrated();
  });

  it("attribue un code FOU-##### et écrit la ligne d'audit", () => {
    const id = createSupplier({ ...sup("Grossiste Nord"), operationId: OP("c1"), now: NOW });
    const rows = searchSuppliers("", 1, 10).rows as { code: string; name: string }[];
    expect(rows.map((r) => r.code)).toEqual([`FOU-${String(id).padStart(5, "0")}`]);
    expect(count("audit_log")).toBe(1);
  });

  it("refuse nom court, email invalide et code trop long", () => {
    expect(() => createSupplier({ ...sup("G"), operationId: OP("c2"), now: NOW })).toThrow(
      /Nom de fournisseur requis/,
    );
    expect(() =>
      createSupplier({
        ...sup("Bon nom", { email: "pas-un-email" }),
        operationId: OP("c3"),
        now: NOW,
      }),
    ).toThrow(/Email fournisseur invalide/);
    expect(() =>
      createSupplier({
        ...sup("Bon nom", { code: "X".repeat(21) }),
        operationId: OP("c4"),
        now: NOW,
      }),
    ).toThrow(/Code fournisseur trop long/);
    expect(count("suppliers")).toBe(0);
  });

  it("refuse un code saisi déjà utilisé", () => {
    createSupplier({ ...sup("Premier", { code: "FOU-DUP" }), operationId: OP("c5"), now: NOW });
    expect(() =>
      createSupplier({ ...sup("Second", { code: "FOU-DUP" }), operationId: OP("c6"), now: NOW }),
    ).toThrow(/déjà utilisé/);
    expect(count("suppliers")).toBe(1);
  });

  it("rejoue le même operationId sans doublon", () => {
    const args = { ...sup("Rejeu"), operationId: OP("c7"), now: NOW };
    const first = createSupplier(args);
    expect(createSupplier(args)).toBe(first);
    expect(count("suppliers")).toBe(1);
    expect(count("audit_log")).toBe(1);
  });

  it("honore isActive=false (fournisseur inactif)", () => {
    createSupplier({ ...sup("Dormant", { isActive: false }), operationId: OP("c8"), now: NOW });
    expect(searchSuppliers("", 1, 10, { statusFilter: "inactive" }).total).toBe(1);
    expect(searchSuppliers("", 1, 10, { statusFilter: "active" }).total).toBe(0);
  });
});

describe("suppliers.repo — dette, paiement, modification", () => {
  beforeEach(() => {
    repoDb.current = openMigrated();
  });

  it("le paiement atomique solde la dette et écrit paiement + audit", () => {
    const id = createSupplier({ ...sup("Créancier"), operationId: OP("p1"), now: NOW });
    setDebt(id, 30_0000);
    const r = recordSupplierPaymentAtomic({
      operationId: OP("p2"),
      supplierId: id,
      amountMinor: 12_0000,
      method: "cash",
      reference: "REC-1",
      notes: null,
      paymentDate: "2026-09-15",
      now: NOW,
    });
    expect(Number.isInteger(r.paymentId)).toBe(true);
    expect(debt(id)).toBe(18_0000);
    expect(count("supplier_payments")).toBe(1);
    // Rejouement du même jeton : une seule écriture, dette inchangée.
    const again = recordSupplierPaymentAtomic({
      operationId: OP("p2"),
      supplierId: id,
      amountMinor: 12_0000,
      method: "cash",
      reference: "REC-1",
      notes: null,
      paymentDate: "2026-09-15",
      now: NOW,
    });
    expect(again).toEqual(r);
    expect(debt(id)).toBe(18_0000);
    expect(count("supplier_payments")).toBe(1);
  });

  it("refuse montant nul, dépassement de dette et fournisseur inconnu", () => {
    const id = createSupplier({ ...sup("Rigoureux"), operationId: OP("p3"), now: NOW });
    setDebt(id, 5_0000);
    const pay = (amountMinor: number, supplierId = id, seed = "x"): { paymentId: number } =>
      recordSupplierPaymentAtomic({
        operationId: OP(`p4-${seed}`),
        supplierId,
        amountMinor,
        method: "cash",
        reference: null,
        notes: null,
        paymentDate: "2026-09-15",
        now: NOW,
      });
    expect(() => pay(0, id, "zero")).toThrow(/Montant de paiement invalide/);
    expect(() => pay(5_0000.5, id, "float")).toThrow(/Montant de paiement invalide/);
    expect(() => pay(6_0000, id, "over")).toThrow(/dépasse la dette/);
    expect(() => pay(1_0000, 9999, "ghost")).toThrow(/Fournisseur introuvable/);
    expect(debt(id)).toBe(5_0000);
  });

  it("met à jour un fournisseur et refuse un id inconnu", () => {
    const id = createSupplier({ ...sup("Ancien nom"), operationId: OP("u1"), now: NOW });
    updateSupplier({
      ...sup("Nouveau nom", { phone: "0661112233" }),
      id,
      now: NOW,
      operationId: OP("u2"),
    });
    const rows = searchSuppliers("Nouveau", 1, 10).rows as { name: string; phone: string }[];
    expect(rows[0]?.name).toBe("Nouveau nom");
    expect(rows[0]?.phone).toBe("0661112233");
    expect(() =>
      updateSupplier({ ...sup("Truc"), id: 999, now: NOW, operationId: OP("u3") }),
    ).toThrow(/Fournisseur introuvable/);
  });

  it("garde le paiement dans le relevé et les statistiques", () => {
    const id = createSupplier({ ...sup("Relevé"), operationId: OP("s1"), now: NOW });
    setDebt(id, 20_0000);
    recordSupplierPaymentAtomic({
      operationId: OP("s2"),
      supplierId: id,
      amountMinor: 20_0000,
      method: "transfer",
      reference: "VIR-77",
      notes: null,
      paymentDate: "2026-09-16",
      now: NOW,
    });
    const listed = searchSuppliers("Relevé", 1, 10).rows as {
      total_paid_minor: number;
      outstanding_balance_minor: number;
    }[];
    expect(listed[0]?.total_paid_minor).toBe(20_0000);
    expect(listed[0]?.outstanding_balance_minor).toBe(0);
    const stats = getSupplierStats();
    expect(stats.totalSuppliers).toBe(1);
    expect(stats.activeSuppliers).toBe(1);
    expect(stats.totalDebtMinor).toBe(0);
  });
});

describe("suppliers.repo — verrous de suppression et lots", () => {
  beforeEach(() => {
    repoDb.current = openMigrated();
  });

  it("refuse la suppression d'un solde non soldé", () => {
    const id = createSupplier({ ...sup("Débiteur"), operationId: OP("d1"), now: NOW });
    setDebt(id, 7_0000);
    expect(() => deleteSupplierAtomic(id, NOW, OP("d2"))).toThrow(/solde de .* non soldé/);
    expect(count("suppliers")).toBe(1);
  });

  it("refuse la suppression liés à un paiement ou à une dépense", () => {
    const paid = createSupplier({ ...sup("Payé"), operationId: OP("d3"), now: NOW });
    setDebt(paid, 3_0000);
    recordSupplierPaymentAtomic({
      operationId: OP("d4"),
      supplierId: paid,
      amountMinor: 3_0000,
      method: "cash",
      reference: null,
      notes: null,
      paymentDate: "2026-09-15",
      now: NOW,
    });
    expect(() => deleteSupplierAtomic(paid, NOW, OP("d5"))).toThrow(/paiements enregistrés/);

    const spent = createSupplier({ ...sup("Dépensé"), operationId: OP("d6"), now: NOW });
    createExpense({
      description: "Location entrepôt",
      category: "Local",
      amountMinor: 1_0000,
      expenseDate: "2026-09-15",
      supplierId: spent,
      paymentMethod: "cash",
      status: "paid",
      reference: null,
      notes: null,
      operationId: OP("d7"),
      now: NOW,
    });
    expect(() => deleteSupplierAtomic(spent, NOW, OP("d8"))).toThrow(/dépenses sont liées/);
  });

  it("supprime un fournisseur libre et rejoue silencieusement le jeton", () => {
    const id = createSupplier({ ...sup("Libre"), operationId: OP("d9"), now: NOW });
    deleteSupplierAtomic(id, NOW, OP("d10"));
    expect(count("suppliers")).toBe(0);
    expect(() => deleteSupplierAtomic(id, NOW, OP("d10"))).not.toThrow();
    expect(() => deleteSupplierAtomic(id, NOW, OP("d11"))).toThrow(/Fournisseur introuvable/);
  });

  it("lot : vide refusé, >100 refusé, idempotent au jeton", () => {
    const a = createSupplier({ ...sup("Lot A"), operationId: OP("b1"), now: NOW });
    const b = createSupplier({ ...sup("Lot B"), operationId: OP("b2"), now: NOW });
    expect(() => deleteSuppliersAtomic([], NOW, OP("b3"))).toThrow(/Aucun fournisseur sélectionné/);
    expect(() =>
      deleteSuppliersAtomic(
        Array.from({ length: 101 }, (_, i) => i + 1),
        NOW,
        OP("b4"),
      ),
    ).toThrow(/Sélection trop large/);
    expect(deleteSuppliersAtomic([a, b, a], NOW, OP("b5"))).toEqual({ deleted: 2 });
    expect(count("suppliers")).toBe(0);
    // Rejouement : le même résultat, sans nouvelle suppression.
    expect(deleteSuppliersAtomic([a, b], NOW, OP("b5"))).toEqual({ deleted: 2 });
  });
});

describe("suppliers.repo — recherche et tri", () => {
  beforeEach(() => {
    repoDb.current = openMigrated();
    const a = createSupplier({
      ...sup("Alpha", { code: "FOU-A", phone: "0551111111" }),
      operationId: OP("r1"),
      now: NOW,
    });
    createSupplier({
      ...sup("bêta", { code: "FOU-B", phone: "0552222222" }),
      operationId: OP("r2"),
      now: NOW,
    });
    createSupplier({
      ...sup("Gamma", { code: "FOU-G", isActive: false }),
      operationId: OP("r3"),
      now: NOW,
    });
    setDebt(a, 9_0000);
  });

  it("cherche par nom, code et téléphone, échappement LIKE compris", () => {
    expect(searchSuppliers("alpha", 1, 10).total).toBe(1);
    expect(searchSuppliers("FOU-G", 1, 10).total).toBe(1);
    expect(searchSuppliers("0552", 1, 10).total).toBe(1);
    expect(searchSuppliers("%", 1, 10).total).toBe(0);
  });

  it("filtre la dette et trie par nom (insensible à la casse) ou par dette", () => {
    expect(searchSuppliers("", 1, 10, { paymentFilter: "with_debt" }).total).toBe(1);
    expect(searchSuppliers("", 1, 10, { paymentFilter: "settled" }).total).toBe(2);
    const byName = searchSuppliers("", 1, 10, { sort: "name_asc" }).rows as { name: string }[];
    expect(byName.map((r) => r.name)).toEqual(["Alpha", "bêta", "Gamma"]);
    const byDebt = searchSuppliers("", 1, 10, { sort: "debt_desc" }).rows as { name: string }[];
    expect(byDebt[0]?.name).toBe("Alpha");
    const desc = searchSuppliers("", 1, 10, { sort: "name_desc" }).rows as { name: string }[];
    expect(desc[0]?.name).toBe("Gamma");
  });

  it("page sans perdre le total", () => {
    const p1 = searchSuppliers("", 1, 2);
    const p2 = searchSuppliers("", 2, 2);
    expect(p1.total).toBe(3);
    expect(p1.rows.length).toBe(2);
    expect(p2.rows.length).toBe(1);
  });
});
