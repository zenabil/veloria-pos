import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  archiveCustomer,
  createCustomer,
  normCustomerSearch,
  searchCustomers,
} from "../../electron/ipc/handlers/customers.repo";

// Régression : des clients « disparaissaient » des interfaces alors qu'ils
// existaient en base (archivés, accents, téléphone espacé, tri page seule).
// Premier test SQL direct de searchCustomers (zéro couverture avant).
const repoDb = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("../../electron/database/sqlite.service", () => ({
  getDb: () => {
    const db = repoDb.current as {
      prepare: (sql: string) => {
        get: (...params: unknown[]) => unknown;
        all: (...params: unknown[]) => unknown;
        run: (...params: unknown[]) => unknown;
      };
      exec: (sql: string) => void;
    } | null;
    if (!db) throw new Error("Base de test non ouverte.");
    return {
      prepare: (sql: string) => db.prepare(sql),
      transaction:
        <R>(fn: () => R) =>
        (): R => {
          db.exec("BEGIN");
          try {
            const out = fn();
            db.exec("COMMIT");
            return out;
          } catch (err) {
            db.exec("ROLLBACK");
            throw err;
          }
        },
    };
  },
}));

const NOW = "2026-10-17T10:00:00.000Z";

describe("customers.search : visibilité + normalisation + tri serveur", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-cust47-"));
    db = new DatabaseSync(path.join(tmp, "c47.sqlite"));
    db.exec("PRAGMA foreign_keys = ON;");
    const migDir = path.join(process.cwd(), "database", "migrations");
    for (const f of fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
    }
    db.exec("PRAGMA foreign_keys = ON;");
    repoDb.current = db;
  });

  afterEach(() => {
    repoDb.current = null;
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function makeClient(firstName: string, lastName: string, phone: string | null = null): number {
    return createCustomer({
      operationId: randomUUID(),
      firstName,
      lastName,
      phone,
      address: null,
      creditLimitMinor: 0,
      initialBalanceMinor: 0,
      settlementDay: null,
      isBreadClient: false,
      creditAllowed: false,
      notes: null,
      now: NOW,
    });
  }

  function names(res: { rows: unknown[] }): string[] {
    return (res.rows as { first_name: string; last_name: string }[]).map(
      (r) => `${r.first_name} ${r.last_name}`,
    );
  }

  it("migration 0047 : colonne search_norm + backfill normalisé", () => {
    const cols = db.prepare("SELECT name FROM pragma_table_info('customers')").all() as {
      name: string;
    }[];
    expect(cols.map((c) => c.name)).toContain("search_norm");
    db.prepare(
      "INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES ('legacy47','Bélaïd','Bennai','bélaïd bennai','2026-01-01','2026-01-01')",
    ).run();
    // Ligne historique (search_norm NULL, antérieure à 0047) : rejouer les
    // UPDATE de 0047 la normalise — même chemin que le backfill migration.
    const sql47 = fs.readFileSync(
      path.join(process.cwd(), "database", "migrations", "0047_customer_search_norm.sql"),
      "utf-8",
    );
    for (const stmt of sql47.split(";")) {
      if (/UPDATE\s+customers\s+SET/i.test(stmt)) db.exec(stmt);
    }
    const row = db.prepare("SELECT search_norm FROM customers WHERE uuid = 'legacy47'").get() as {
      search_norm: string;
    };
    expect(row.search_norm).toBe("belaid bennai");
  });

  it("insensible aux accents : « belaid » retrouve « Bélaïd Bennai »", () => {
    makeClient("Bélaïd", "Bennai");
    expect(names(searchCustomers("belaid", 1, 20))).toContain("Bélaïd Bennai");
    expect(names(searchCustomers("bélaïd", 1, 20))).toContain("Bélaïd Bennai");
    expect(names(searchCustomers("BENNAI", 1, 20))).toContain("Bélaïd Bennai");
  });

  it("téléphone espacé retrouvé avec chiffres seuls", () => {
    makeClient("Amine", "Benali", "0550 12 34 56");
    expect(names(searchCustomers("0550123456", 1, 20))).toContain("Amine Benali");
    expect(names(searchCustomers("0550 12", 1, 20))).toContain("Amine Benali");
  });

  it("archivé : invisible par défaut, visible via filtres", () => {
    const id = makeClient("Karim", "Archivé");
    archiveCustomer(id, NOW, randomUUID());
    expect(names(searchCustomers("karim", 1, 20))).not.toContain("Karim Archivé");
    expect(names(searchCustomers("karim", 1, 20, true))).toContain("Karim Archivé");
    expect(names(searchCustomers("karim", 1, 20, false, "all", true))).toContain("Karim Archivé");
  });

  it("filtre dette : le client soldé quitte « with_debt » sans disparaître", () => {
    const id = makeClient("Sara", "Dette");
    db.prepare("UPDATE customers SET outstanding_balance_minor = 10000 WHERE id = ?").run(id);
    expect(names(searchCustomers("sara", 1, 20, false, "with_debt"))).toContain("Sara Dette");
    db.prepare("UPDATE customers SET outstanding_balance_minor = 0 WHERE id = ?").run(id);
    expect(names(searchCustomers("sara", 1, 20, false, "with_debt"))).not.toContain("Sara Dette");
    expect(names(searchCustomers("sara", 1, 20, false, "no_debt"))).toContain("Sara Dette");
  });

  it("tri serveur global : debt_desc ordonne toutes les pages", () => {
    const a = makeClient("Client", "Faible");
    const b = makeClient("Client", "Forte");
    const c = makeClient("Client", "Nulle");
    db.prepare("UPDATE customers SET outstanding_balance_minor = 100 WHERE id = ?").run(a);
    db.prepare("UPDATE customers SET outstanding_balance_minor = 90000 WHERE id = ?").run(b);
    db.prepare("UPDATE customers SET outstanding_balance_minor = 0 WHERE id = ?").run(c);
    const p1 = names(searchCustomers("client", 1, 2, false, "all", false, "debt_desc"));
    const p2 = names(searchCustomers("client", 2, 2, false, "all", false, "debt_desc"));
    expect([...p1, ...p2]).toEqual(["Client Forte", "Client Faible", "Client Nulle"]);
  });

  it("tri achats : purchases_desc suit les ventes non annulées", () => {
    const a = makeClient("Acheteur", "Gros");
    const b = makeClient("Acheteur", "Petit");
    // Ventes comptant (soldées) : comptent dans les achats sans garde crédit.
    db.prepare(
      "INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES (?, 'F-47-1', ?, 50000, 50000, 50000, 0, 'paid', ?, ?)",
    ).run(randomUUID(), a, NOW, NOW);
    db.prepare(
      "INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES (?, 'F-47-2', ?, 1000, 1000, 1000, 0, 'paid', ?, ?)",
    ).run(randomUUID(), b, NOW, NOW);
    const ordered = names(
      searchCustomers("acheteur", 1, 20, false, "all", false, "purchases_desc"),
    );
    expect(ordered).toEqual(["Acheteur Gros", "Acheteur Petit"]);
  });

  it("pagination : total réel + page 2", () => {
    for (let i = 1; i <= 5; i++) makeClient(`Pagin${i}`, "Test");
    const res = searchCustomers("pagin", 1, 2);
    expect(res.total).toBe(5);
    expect(names(res)).toHaveLength(2);
    expect(names(searchCustomers("pagin", 3, 2))).toHaveLength(1);
  });

  it("normCustomerSearch : miroir documenté de la migration 0047", () => {
    expect(normCustomerSearch("  Bélaïd   BENNAI ")).toBe("belaid bennai");
    expect(normCustomerSearch("Sœur Ælia")).toBe("soeur aelia");
    expect(normCustomerSearch("Øyvind\u00A0Bendjelloul")).toBe("oyvind bendjelloul");
  });

  it("LIKE échappé : % _ \\ traités comme littéraux (jamais de wildcard)", () => {
    makeClient("Jean", "100%");
    makeClient("Micheline", "Souligné_");
    makeClient("Paul", "Barre\\");
    expect(names(searchCustomers("100%", 1, 20))).toEqual(["Jean 100%"]);
    expect(names(searchCustomers("_", 1, 20))).toEqual(["Micheline Souligné_"]);
    expect(names(searchCustomers("\\", 1, 20))).toEqual(["Paul Barre\\"]);
  });

  it("tri hors whitelist : repli sûr sur le tri par défaut (pas d'erreur SQL)", () => {
    makeClient("Zed", "Alpha");
    makeClient("Abe", "Beta");
    const res = searchCustomers("", 1, 20, false, "all", false, "DROP TABLE" as never);
    expect(res.total).toBe(2);
    expect(names(res)).toEqual(["Abe Beta", "Zed Alpha"]);
  });

  it("backfill 0047 idempotent : un rejeu ne modifie plus rien", () => {
    makeClient("Bélaïd", "Bennai");
    const sql47 = fs.readFileSync(
      path.join(process.cwd(), "database", "migrations", "0047_customer_search_norm.sql"),
      "utf-8",
    );
    const snapshot = (): string =>
      JSON.stringify(db.prepare("SELECT id, search_norm FROM customers ORDER BY id").all());
    const replay = (): void => {
      for (const stmt of sql47.split(";")) {
        if (/UPDATE\s+customers\s+SET/i.test(stmt)) db.exec(stmt);
      }
    };
    replay();
    const settled = snapshot();
    replay();
    expect(snapshot()).toBe(settled);
  });

  it("espaces & ø : le backfill 0047 produit la même forme que le repo (NBSP, Ø)", () => {
    db.prepare(
      "INSERT INTO customers (uuid, first_name, last_name, search_name, created_at, updated_at) VALUES ('nbsp47','Øyvind','Bendjelloul','Øyvind\u00A0Bendjelloul','2026-01-01','2026-01-01')",
    ).run();
    const sql47 = fs.readFileSync(
      path.join(process.cwd(), "database", "migrations", "0047_customer_search_norm.sql"),
      "utf-8",
    );
    for (const stmt of sql47.split(";")) {
      if (/UPDATE\s+customers\s+SET/i.test(stmt)) db.exec(stmt);
    }
    const row = db.prepare("SELECT search_norm FROM customers WHERE uuid = 'nbsp47'").get() as {
      search_norm: string;
    };
    expect(row.search_norm).toBe(normCustomerSearch("Øyvind\u00A0Bendjelloul"));
    expect(row.search_norm).toBe("oyvind bendjelloul");
    expect(names(searchCustomers("oyvind bendjelloul", 1, 20))).toContain("Øyvind Bendjelloul");
  });
});
