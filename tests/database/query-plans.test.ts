// Veloria PoS — W8 (audit F-06) : les chemins chauds doivent être INDEXÉS.
//
// La porte ne se contente pas de vérifier que les index EXISTENT : elle
// demande à SQLite le plan d'exécution réel (EXPLAIN QUERY PLAN) des requêtes
// de production et exige que l'index soit UTILISÉ («USING INDEX»). Un index
// inutilisé (ou une colonne non indexable) fait échouer la porte.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type SupportedValue = SQLInputValue;

function openMigrated(dir: string): DatabaseSync {
  const db = new DatabaseSync(path.join(dir, "plans.sqlite"));
  db.exec("PRAGMA foreign_keys = ON;");
  const migDir = path.join(process.cwd(), "database", "migrations");
  for (const f of fs
    .readdirSync(migDir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
  }
  return db;
}

/** Plan d'exécution d'une requête (texte concaténé). */
function plan(db: DatabaseSync, sql: string, params: SupportedValue[] = []): string {
  const rows = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as {
    detail: string;
  }[];
  return rows.map((r) => r.detail).join(" | ");
}

describe("W8 : les requêtes chaudes utilisent un index", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-plans-"));
    db = openMigrated(tmp);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      /* déjà fermée */
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("dettes clients : index sur (is_cancelled, remaining_balance_minor)", () => {
    const p = plan(
      db,
      `SELECT COUNT(DISTINCT s.customer_id) AS debtors, COALESCE(SUM(s.remaining_balance_minor), 0) AS debt
       FROM sales s WHERE s.is_cancelled = 0 AND s.remaining_balance_minor > 0 AND s.customer_id IS NOT NULL`,
    );
    expect(p).toMatch(/USING (COVERING )?INDEX/i);
    expect(p).toMatch(/idx_sales_open_debt/);
  });

  it("dettes fournisseurs : index sur suppliers(outstanding_balance_minor)", () => {
    const p = plan(
      db,
      `SELECT COUNT(*) AS debtors, COALESCE(SUM(outstanding_balance_minor), 0) AS debt
       FROM suppliers WHERE outstanding_balance_minor > 0`,
    );
    expect(p).toMatch(/USING (COVERING )?INDEX/i);
    expect(p).toMatch(/idx_suppliers_debt/);
  });

  it("échéances du jour : index sur sales(due_date)", () => {
    const p = plan(
      db,
      `SELECT COUNT(*) AS c FROM sales
       WHERE is_cancelled = 0 AND remaining_balance_minor > 0
       AND due_date IS NOT NULL AND due_date >= date('now') AND due_date < date('now','+1 day')`,
    );
    expect(p).toMatch(/USING (COVERING )?INDEX/i);
    expect(p).not.toMatch(/SCAN sales/i);
  });

  it("unicité téléphone : la colonne générée est indexée (recherche par égalité)", () => {
    // Le contrôle d'unicité (E-28) filtre par ÉGALITÉ ⇒ l'index est
    // utilisé (avant : parcours de toute la table).
    const p = plan(db, `SELECT id FROM customers WHERE phone_digits = '0550123456'`);
    expect(p).toMatch(/USING (COVERING )?INDEX/i);
    expect(p).toMatch(/idx_customers_phone_digits/);
  });

  it("la recherche client n'exécute plus les 8 REPLACE() par ligne", () => {
    // La recherche reste un LIKE '%…%' (non indexable sans FTS) : le gain
    // vient de la colonne GÉNÉRÉE (normalisation faite à l'écriture, pas à
    // chaque lecture de la table).
    const source = fs.readFileSync(
      path.join(process.cwd(), "electron/ipc/handlers/customers.repo.ts"),
      "utf-8",
    );
    expect(source).toContain("phone_digits");
    expect(source).not.toMatch(/REPLACE\(REPLACE\(REPLACE\(REPLACE\(/);
  });

  it("historique : filtrage direct sur created_at (index par branche)", () => {
    for (const table of ["sale_payments", "supplier_payments", "stock_movements"]) {
      const p = plan(db, `SELECT id FROM ${table} WHERE created_at >= '2026-01-01'`);
      expect(p, table).toMatch(/USING (COVERING )?INDEX/i);
      expect(p, table).not.toMatch(new RegExp(`SCAN ${table}`, "i"));
    }
  });

  it("stock : tri par nom insensible à la casse (index NOCASE)", () => {
    const p = plan(db, `SELECT id FROM products ORDER BY name COLLATE NOCASE ASC`);
    expect(p).toMatch(/idx_products_name_nocase/);
  });

  it("les index de la migration 0050 existent tous", () => {
    const expected = [
      "idx_sales_open_debt",
      "idx_suppliers_debt",
      "idx_customers_settle",
      "idx_stock_intakes_supplier_status",
      "idx_sale_payments_created",
      "idx_supplier_payments_created",
      "idx_stock_intakes_created",
      "idx_stock_movements_created",
      "idx_products_name_nocase",
      "idx_customers_phone_digits",
    ];
    for (const name of expected) {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
        .get(name);
      expect(row, `index manquant : ${name}`).toBeTruthy();
    }
  });
});
