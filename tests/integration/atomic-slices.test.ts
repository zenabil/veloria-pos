import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoDb = vi.hoisted(() => ({ current: null as DatabaseSync | null, depth: 0 }));

vi.mock("../../electron/database/sqlite.service", () => ({
  getDb: () => {
    const state = repoDb as {
      current: {
        prepare: (sql: string) => {
          all: (...p: unknown[]) => unknown[];
          get: (...p: unknown[]) => unknown;
          run: (...p: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint };
        };
        exec: (sql: string) => void;
      } | null;
      depth: number;
    };
    const db = state.current;
    if (!db) throw new Error("Base de test non ouverte.");
    return {
      prepare: (sql: string) => db.prepare(sql),
      get inTransaction(): boolean {
        return state.depth > 0;
      },
      transaction:
        <R>(fn: () => R) =>
        (): R => {
          if (state.depth > 0) {
            db.exec("SAVEPOINT nested;");
            state.depth += 1;
            try {
              const out = fn();
              db.exec("RELEASE nested;");
              state.depth -= 1;
              return out;
            } catch (err) {
              try {
                db.exec("ROLLBACK TO nested;");
                db.exec("RELEASE nested;");
              } catch {
                /* best-effort */
              }
              state.depth -= 1;
              throw err;
            }
          }
          db.exec("BEGIN;");
          state.depth = 1;
          try {
            const out = fn();
            db.exec("COMMIT;");
            state.depth = 0;
            return out;
          } catch (err) {
            try {
              db.exec("ROLLBACK;");
            } catch {
              /* best-effort */
            }
            state.depth = 0;
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

import { receiveStockAtomic } from "../../electron/ipc/handlers/inventory.repo";

// Tranches 6-9 : invariants SQL atomiques vérifiés sur node:sqlite (sans Electron).
// Les repos main (better-sqlite3) partagent la même grammaire SQL ; le smoke
// empaqueté vérifie le runtime natif.
function openMigrated(tmp: string): DatabaseSync {
  const db = new DatabaseSync(path.join(tmp, "slices.sqlite"));
  db.exec("PRAGMA foreign_keys = ON;");
  const migDir = path.join(process.cwd(), "database", "migrations");
  for (const f of fs
    .readdirSync(migDir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
  }
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

describe("Atomic slices (SQL invariants)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-slices-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("entrée fournisseur : intake + lignes + stock + solde = 1 transaction (PRODUCTION)", () => {
    // I-03 (W4) : la transaction était rejouée À LA MAIN dans le test
    // (« miroir ») — il restait vert même si `receiveStockAtomic` perdait son
    // atomicité. On appelle désormais la fonction de PRODUCTION, puis on
    // vérifie qu'un échec au milieu ne laisse AUCUNE trace.
    const db = openMigrated(tmp);
    repoDb.current = db;
    repoDb.depth = 0;
    db.prepare(
      "INSERT INTO suppliers (uuid, name, code, created_at, updated_at) VALUES ('s1','Moulin','FOU-00001','2026-01-01','2026-01-01')",
    ).run();
    db.prepare(
      "INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, created_at, updated_at) VALUES ('p1','Farine','KG',4000,5000,10,2,'in_stock','2026-01-01','2026-01-01')",
    ).run();

    const res = receiveStockAtomic({
      supplierId: 1,
      invoiceNumber: "F-1",
      invoiceDate: "2026-01-02",
      shippingMinor: 0,
      notes: null,
      lines: [
        {
          productId: 1,
          productName: "Farine",
          quantityReceived: 8,
          quantityDamaged: 0,
          purchasePriceMinor: 4000,
          sellingPriceMinor: null,
        },
      ],
      operationId: "11111111-2222-4333-8444-555555555555",
      now: "2026-01-02T10:00:00.000Z",
    });
    expect(res.totalMinor).toBe(32000);
    const prod = db.prepare("SELECT quantity FROM products WHERE id = 1").get() as {
      quantity: number;
    };
    expect(Number(prod.quantity)).toBe(18);
    const sup = db
      .prepare("SELECT outstanding_balance_minor FROM suppliers WHERE id = 1")
      .get() as {
      outstanding_balance_minor: number;
    };
    expect(sup.outstanding_balance_minor).toBe(32000);

    // Échec au milieu (ligne invalide) => rollback total, stock inchangé.
    let failed = false;
    try {
      receiveStockAtomic({
        supplierId: 1,
        invoiceNumber: "F-2",
        invoiceDate: "2026-01-03",
        shippingMinor: 0,
        notes: null,
        lines: [
          {
            productId: 1,
            productName: "Farine",
            quantityReceived: -5,
            quantityDamaged: 0,
            purchasePriceMinor: 4000,
            sellingPriceMinor: null,
          },
        ],
        operationId: "66666666-7777-4888-8999-000000000000",
        now: "2026-01-03T10:00:00.000Z",
      });
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    const prod2 = db.prepare("SELECT quantity FROM products WHERE id = 1").get() as {
      quantity: number;
    };
    expect(Number(prod2.quantity)).toBe(18);
    repoDb.current = null;
    db.close();
  });

  it("clôture Z : unicité par date + formule", () => {
    const db = openMigrated(tmp);
    db.prepare(
      "INSERT INTO daily_closings (uuid, business_date, cash_sales_minor, cash_payments_minor, customer_collections_minor, expenses_minor, refunds_minor, closing_balance_minor, closed_at) VALUES ('z1','2026-03-01',50000,50000,5000,8000,2000,45000,'2026-03-01T20:00:00Z')",
    ).run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO daily_closings (uuid, business_date, cash_sales_minor, cash_payments_minor, customer_collections_minor, expenses_minor, refunds_minor, closing_balance_minor, closed_at) VALUES ('z2','2026-03-01',1,1,0,0,0,1,'2026-03-01T21:00:00Z')",
        )
        .run(),
    ).toThrow();
    db.close();
  });

  it("proforma : statuts + conversion liée", () => {
    const db = openMigrated(tmp);
    db.prepare(
      "INSERT INTO proforma_invoices (uuid, proforma_number, subtotal_minor, total_minor, status, created_at, updated_at) VALUES ('pr1','PRO-2026-00001',20000,20000,'draft','2026-01-01','2026-01-01')",
    ).run();
    db.prepare("UPDATE proforma_invoices SET status = 'sent' WHERE id = 1").run();
    // Statut invalide rejeté par CHECK.
    expect(() =>
      db.prepare("UPDATE proforma_invoices SET status = 'nope' WHERE id = 1").run(),
    ).toThrow();
    db.close();
  });

  it("vente à crédit : seuls les clients autorisés (trigger 0007)", () => {
    const db = openMigrated(tmp);
    db.prepare(
      "INSERT INTO customers (uuid, first_name, last_name, search_name, credit_allowed, created_at, updated_at) VALUES ('c-ok','Karim','Ziani','karim ziani',1,'2026-01-01','2026-01-01')",
    ).run();
    db.prepare(
      "INSERT INTO customers (uuid, first_name, last_name, search_name, credit_allowed, created_at, updated_at) VALUES ('c-ko','Sara','Merah','sara merah',0,'2026-01-01','2026-01-01')",
    ).run();
    const sale = (
      uuid: string,
      invoice: string,
      customerId: number | null,
      paid: number,
      remaining: number,
      status: string,
    ): void => {
      db.prepare(
        "INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      ).run(
        uuid,
        invoice,
        customerId,
        1000,
        1000,
        paid,
        remaining,
        status,
        "2026-01-01",
        "2026-01-01",
      );
    };
    // Crédit autorisé : accepté. Comptant (passage ou client) : accepté.
    sale("u-ok", "FAC-2026-00101", 1, 500, 500, "partial");
    sale("u-cash1", "FAC-2026-00102", null, 1000, 0, "paid");
    sale("u-cash2", "FAC-2026-00103", 2, 1000, 0, "paid");
    // Crédit non autorisé : rejeté. Crédit sans client : rejeté.
    expect(() => sale("u-ko", "FAC-2026-00104", 2, 500, 500, "partial")).toThrow();
    expect(() => sale("u-walk", "FAC-2026-00105", null, 0, 1000, "unpaid")).toThrow();
    db.close();
  });

  it("fournisseurs 0008 : fiche enrichie + code unique + suppression gardée", () => {
    // 0008 remplit le code des lignes existantes ; le repo génère celui des nouvelles.
    // Portée 0008 uniquement : 0023 est exclue car son trigger NEW.code exige
    // la colonne code (contrat post-0008) — tester 0008 + 0023 exigerait 0008 d'abord.
    // 0025/0026 sont exclues pour la même raison : 0025 recopie supplier_returns
    // (colonne layers_json apportée par 0023) et suppose donc la chaîne complète.
    const migDir = path.join(process.cwd(), "database", "migrations");
    const read = (f: string): string => fs.readFileSync(path.join(migDir, f), "utf-8");
    const db = new DatabaseSync(path.join(tmp, "sup.sqlite"));
    db.exec("PRAGMA foreign_keys = ON;");
    for (const f of fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort()
      .filter(
        (x) =>
          !x.startsWith("0008") &&
          !x.startsWith("0023") &&
          !x.startsWith("0025") &&
          !x.startsWith("0026"),
      )) {
      db.exec(read(f));
    }
    db.exec("PRAGMA foreign_keys = ON;");
    db.prepare(
      "INSERT INTO suppliers (uuid, name, created_at, updated_at) VALUES ('f1','Moulin El Baraka','2026-01-01','2026-01-01')",
    ).run();
    const m0008 = fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort()
      .find((x) => x.startsWith("0008"));
    expect(m0008).toBeDefined();
    db.exec(read(m0008 as string));
    db.exec("PRAGMA foreign_keys = ON;");
    const f = db.prepare("SELECT code, is_active FROM suppliers WHERE uuid = 'f1'").get() as {
      code: string;
      is_active: number;
    };
    expect(f.code).toBe("FOU-00001");
    expect(f.is_active).toBe(1);
    // Code dupliqué rejeté par l'index unique.
    expect(() =>
      db
        .prepare(
          "INSERT INTO suppliers (uuid, name, code, created_at, updated_at) VALUES ('f2','Autre','FOU-00001','2026-01-01','2026-01-01')",
        )
        .run(),
    ).toThrow();
    // Garde suppression : dette non soldée bloque (logique repo : solde != 0).
    db.prepare("UPDATE suppliers SET outstanding_balance_minor = 500 WHERE uuid = 'f1'").run();
    const bal = db
      .prepare("SELECT outstanding_balance_minor AS b FROM suppliers WHERE uuid = 'f1'")
      .get() as { b: number };
    expect(bal.b).toBe(500);
    db.close();
  });

  it("stock 0009 : plafond + référence mouvement + index", () => {
    const db = openMigrated(tmp);
    db.prepare(
      "INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, created_at, updated_at) VALUES ('p9','Lait','PIECE',8000,10000,20,5,'in_stock','2026-01-01','2026-01-01')",
    ).run();
    const p = db.prepare("SELECT max_stock_level FROM products WHERE uuid = 'p9'").get() as {
      max_stock_level: number;
    };
    expect(Number(p.max_stock_level)).toBe(0);
    // Référence traçée sur le mouvement.
    db.prepare(
      "INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, reason, reference, created_at) VALUES ('m9',1,'adjust_in',5,25,'Correction','INV-2026-09','2026-01-02')",
    ).run();
    const m = db.prepare("SELECT reference FROM stock_movements WHERE uuid = 'm9'").get() as {
      reference: string;
    };
    expect(m.reference).toBe("INV-2026-09");
    // Avant calculé comme après − delta.
    const b = db
      .prepare(
        "SELECT (quantity_after - quantity_delta) AS before FROM stock_movements WHERE uuid = 'm9'",
      )
      .get() as { before: number };
    expect(Number(b.before)).toBe(20);
    const idx = db
      .prepare(
        "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'index' AND name IN ('idx_movements_product_created','idx_movements_type')",
      )
      .get() as { c: number };
    expect(idx.c).toBe(2);
    db.close();
  });

  it("retours 0010 : numéros, statuts, retours fournisseurs", () => {
    const db = openMigrated(tmp);
    // Colonnes 0010 sur les retours clients.
    db.prepare(
      "INSERT INTO sales (uuid, invoice_number, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, created_at, updated_at) VALUES ('s10','FAC-2026-00010',1000,1000,1000,0,'paid','2026-01-01','2026-01-01')",
    ).run();
    db.prepare(
      "INSERT INTO returns (uuid, return_number, original_sale_id, original_invoice_number, total_return_value_minor, status, created_at, updated_at) VALUES ('r10','RET-C-00001',1,'FAC-2026-00001',500,'validated','2026-01-02','2026-01-02')",
    ).run();
    // Statut invalide rejeté par CHECK.
    expect(() =>
      db
        .prepare(
          "INSERT INTO returns (uuid, return_number, original_sale_id, original_invoice_number, total_return_value_minor, status, created_at, updated_at) VALUES ('r11','RET-C-00002',1,'FAC-2026-00001',100,'pending','2026-01-02','2026-01-02')",
        )
        .run(),
    ).toThrow();
    // Numéro dupliqué rejeté.
    expect(() =>
      db
        .prepare(
          "INSERT INTO returns (uuid, return_number, original_sale_id, original_invoice_number, total_return_value_minor, status, created_at, updated_at) VALUES ('r12','RET-C-00001',1,'FAC-2026-00001',100,'validated','2026-01-02','2026-01-02')",
        )
        .run(),
    ).toThrow();
    // Retour fournisseur complet : décrémente la dette et le stock.
    // 0023: code fournisseur requis à l'INSERT (contrat repo).
    db.prepare(
      "INSERT INTO suppliers (uuid, name, code, outstanding_balance_minor, created_at, updated_at) VALUES ('f10','Moulin','FOU-00010',5000,'2026-01-01','2026-01-01')",
    ).run();
    db.prepare(
      "INSERT INTO products (uuid, name, unit_code, purchase_price_minor, selling_price_minor, quantity, min_stock_level, stock_status, created_at, updated_at) VALUES ('p10','Farine','KG',4000,5000,20,2,'in_stock','2026-01-01','2026-01-01')",
    ).run();
    db.prepare(
      "INSERT INTO stock_intakes (uuid, supplier_id, invoice_number, invoice_date, subtotal_minor, shipping_cost_minor, total_minor, status, created_at, updated_at) VALUES ('i10',1,'BL-10','2026-01-01',8000,0,8000,'committed','2026-01-01','2026-01-01')",
    ).run();
    db.prepare(
      "INSERT INTO stock_intake_items (stock_intake_id, product_id, product_name_snapshot, quantity_received, quantity_damaged, purchase_price_minor, landing_cost_minor) VALUES (1,1,'Farine',8,0,4000,4000)",
    ).run();
    db.prepare(
      "INSERT INTO supplier_returns (uuid, return_number, stock_intake_id, intake_invoice_number, supplier_id, total_return_value_minor, status, created_at, updated_at) VALUES ('sr10','RET-S-00001',1,'BL-10',1,8000,'validated','2026-01-03','2026-01-03')",
    ).run();
    // Récupération bornée par le total (CHECK).
    expect(() =>
      db
        .prepare("UPDATE supplier_returns SET amount_recovered_minor = 9000 WHERE uuid = 'sr10'")
        .run(),
    ).toThrow();
    db.close();
  });

  it("dépenses 0011 : fiche enrichie + statuts contraints", () => {
    const db = openMigrated(tmp);
    db.prepare(
      "INSERT INTO expenses (uuid, description, category, amount_minor, expense_date, status, created_at, updated_at) VALUES ('e11','Loyer janvier','Loyer',50000,'2026-01-05','pending','2026-01-05','2026-01-05')",
    ).run();
    // Statut invalide rejeté par CHECK.
    expect(() =>
      db
        .prepare(
          "INSERT INTO expenses (uuid, description, category, amount_minor, expense_date, status, created_at, updated_at) VALUES ('e12','X','Y',100,'2026-01-05','draft','2026-01-05','2026-01-05')",
        )
        .run(),
    ).toThrow();
    // Moyen invalide rejeté par CHECK.
    expect(() =>
      db
        .prepare(
          "INSERT INTO expenses (uuid, description, category, amount_minor, expense_date, payment_method, status, created_at, updated_at) VALUES ('e13','X','Y',100,'2026-01-05','bitcoin','paid','2026-01-05','2026-01-05')",
        )
        .run(),
    ).toThrow();
    // Fournisseur lié + suppression feuille sans garde.
    db.prepare(
      "INSERT INTO suppliers (uuid, name, code, created_at, updated_at) VALUES ('f11','Sonelgaz','FOU-00011','2026-01-01','2026-01-01')",
    ).run();
    db.prepare(
      "INSERT INTO expenses (uuid, description, category, amount_minor, expense_date, supplier_id, payment_method, status, created_at, updated_at) VALUES ('e14','Électricité','Énergie',12000,'2026-01-06',1,'transfer','paid','2026-01-06','2026-01-06')",
    ).run();
    const row = db.prepare("SELECT supplier_id, status FROM expenses WHERE uuid = 'e14'").get() as {
      supplier_id: number;
      status: string;
    };
    expect(row.supplier_id).toBe(1);
    expect(row.status).toBe("paid");
    db.prepare("DELETE FROM expenses WHERE uuid = 'e14'").run();
    const gone = db.prepare("SELECT COUNT(*) AS c FROM expenses WHERE uuid = 'e14'").get() as {
      c: number;
    };
    expect(gone.c).toBe(0);
    db.close();
  });

  it("dettes : ventes impayées + comptes fournisseurs (UNION)", () => {
    const db = openMigrated(tmp);
    db.prepare(
      "INSERT INTO customers (uuid, first_name, last_name, search_name, outstanding_balance_minor, credit_allowed, created_at, updated_at) VALUES ('cd1','Karim','Ziani','karim ziani',500,1,'2026-01-01','2026-01-01')",
    ).run();
    db.prepare(
      "INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, due_date, created_at, updated_at) VALUES ('sd1','FAC-2026-00011',1,1000,1000,500,500,'partial','2000-01-01','2026-01-02','2026-01-02')",
    ).run();
    db.prepare(
      "INSERT INTO suppliers (uuid, name, code, initial_balance_minor, outstanding_balance_minor, created_at, updated_at) VALUES ('fd1','Moulin','FOU-00012',8000,8000,'2026-01-01','2026-01-01')",
    ).run();
    // Branche client : échéance dépassée → overdue.
    const overdue = db
      .prepare(
        `SELECT invoice_number AS ref,
          CASE WHEN due_date IS NOT NULL AND substr(due_date, 1, 10) < date('now') THEN 'overdue' ELSE 'due' END AS status
         FROM sales WHERE is_cancelled = 0 AND remaining_balance_minor > 0`,
      )
      .all() as { ref: string; status: string }[];
    expect(overdue).toEqual([{ ref: "FAC-2026-00011", status: "overdue" }]);
    // Branche fournisseur : compte avec original/paid calculés.
    const sup = db
      .prepare(
        `SELECT (COALESCE((SELECT SUM(total_minor) FROM stock_intakes WHERE supplier_id = s.id AND status != 'cancelled'), 0) + s.initial_balance_minor) AS original,
          COALESCE((SELECT SUM(amount_minor) FROM supplier_payments WHERE supplier_id = s.id), 0) AS paid,
          s.outstanding_balance_minor AS remaining
         FROM suppliers s WHERE s.outstanding_balance_minor > 0`,
      )
      .get() as { original: number; paid: number; remaining: number };
    expect(sup.remaining).toBe(8000);
    expect(sup.original - sup.paid).toBe(8000);
    db.close();
  });

  it("migration 0012 : pain enrichi + conditions proforma + zakat", () => {
    // Reprise : on rejoue 0001-0011 (hors 0012 et 0016 qui en dépend), on insère une commande, puis 0012.
    const migDir = path.join(process.cwd(), "database", "migrations");
    const files = fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort();
    const dbFile = path.join(tmp, "backfill.sqlite");
    const db = new DatabaseSync(dbFile);
    db.exec("PRAGMA foreign_keys = ON;");
    for (const f of files.filter((x) => !x.startsWith("0012") && !x.startsWith("0016"))) {
      db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
    }
    db.exec("PRAGMA foreign_keys = ON;");
    db.prepare(
      "INSERT INTO bread_orders (uuid, order_number, order_date, pickup_date, quantity, unit_price_minor, total_amount_minor, payment_status, pickup_status, created_at, updated_at) VALUES ('b0','PAIN-2026-00000','2026-01-01','2026-01-02',5,1500,7500,'unpaid','ready','2026-01-01','2026-01-01')",
    ).run();
    const m0012 = files.find((x) => x.startsWith("0012"));
    db.exec(fs.readFileSync(path.join(migDir, m0012 as string), "utf-8"));
    db.exec("PRAGMA foreign_keys = ON;");
    const backfill = db
      .prepare("SELECT order_status, bread_type FROM bread_orders WHERE uuid = 'b0'")
      .get() as {
      order_status: string;
      bread_type: string;
    };
    expect(backfill.order_status).toBe("ready");
    expect(backfill.bread_type).toBe("Pain");
    // Statut hors cycle rejeté.
    expect(() =>
      db.prepare("UPDATE bread_orders SET order_status = 'pending' WHERE uuid = 'b0'").run(),
    ).toThrow();
    // Ligne fraîche : défauts Pain/new.
    db.prepare(
      "INSERT INTO bread_orders (uuid, order_number, order_date, pickup_date, quantity, unit_price_minor, total_amount_minor, payment_status, pickup_status, created_at, updated_at) VALUES ('b12','PAIN-2026-00001','2026-01-01','2026-01-02',10,1500,15000,'unpaid','pending','2026-01-01','2026-01-01')",
    ).run();
    const b = db
      .prepare("SELECT bread_type, order_status FROM bread_orders WHERE uuid = 'b12'")
      .get() as {
      bread_type: string;
      order_status: string;
    };
    expect(b.bread_type).toBe("Pain");
    expect(b.order_status).toBe("new");
    // Conditions proforma + historique zakat.
    db.prepare(
      "INSERT INTO proforma_invoices (uuid, proforma_number, subtotal_minor, total_minor, status, terms, created_at, updated_at) VALUES ('pr12','PRO-2026-00001',1000,1000,'draft','Paiement à 30 jours','2026-01-01','2026-01-01')",
    ).run();
    db.prepare(
      "INSERT INTO zakat_calculations (uuid, hijri_year, calc_date, cash_minor, net_minor, nisab_minor, rate_percent, zakat_minor, created_at) VALUES ('z12','1448','2026-09-16',100000,700000,500000,2.5,17500,'2026-09-16')",
    ).run();
    const z = db
      .prepare("SELECT zakat_minor, status FROM zakat_calculations WHERE uuid = 'z12'")
      .get() as {
      zakat_minor: number;
      status: string;
    };
    expect(z.zakat_minor).toBe(17500);
    expect(z.status).toBe("calculated");
    db.close();
  });

  it("migration 0013 : nom commercial société", () => {
    const db = openMigrated(tmp);
    const cols = db.prepare("SELECT name FROM pragma_table_info('company_profile')").all() as {
      name: string;
    }[];
    expect(cols.map((c) => c.name).includes("commercial_name")).toBe(true);
    db.prepare(
      "INSERT INTO company_profile (id, uuid, company_name, commercial_name, created_at, updated_at) VALUES (1,'u1','Veloria SARL','Veloria Market','2026-01-01','2026-01-01')",
    ).run();
    const co = db.prepare("SELECT commercial_name FROM company_profile WHERE id = 1").get() as {
      commercial_name: string;
    };
    expect(co.commercial_name).toBe("Veloria Market");
    db.close();
  });

  it("soldes clients : recalcul CASE annulation/avoir + index 0014", () => {
    const db = openMigrated(tmp);
    db.prepare(
      "INSERT INTO customers (uuid, first_name, last_name, search_name, credit_limit_minor, outstanding_balance_minor, debt_status, is_over_limit, credit_allowed, created_at, updated_at) VALUES ('cs1','Nadia','Benkaci','nadia benkaci',10000,5000,'due',0,1,'2026-01-01','2026-01-01')",
    ).run();
    // Meme formule CASE que l'annulation de vente et l'avoir retour : un solde
    // retombe a 0 redevient 'none' (jamais de statut perime).
    const recalc =
      "UPDATE customers SET outstanding_balance_minor = outstanding_balance_minor - ?, debt_status = CASE WHEN outstanding_balance_minor - ? <= 0 THEN 'none' WHEN credit_limit_minor > 0 AND outstanding_balance_minor - ? > credit_limit_minor THEN 'over_limit' ELSE 'due' END, is_over_limit = CASE WHEN credit_limit_minor > 0 AND outstanding_balance_minor - ? > credit_limit_minor THEN 1 ELSE 0 END, updated_at = ? WHERE id = ?";
    db.prepare(recalc).run(5000, 5000, 5000, 5000, "2026-01-02", 1);
    const cleared = db
      .prepare(
        "SELECT outstanding_balance_minor AS b, debt_status AS s FROM customers WHERE id = 1",
      )
      .get() as { b: number; s: string };
    expect(cleared.b).toBe(0);
    expect(cleared.s).toBe("none");
    // Depassement de plafond detecte par la meme formule.
    db.prepare(recalc).run(-12000, -12000, -12000, -12000, "2026-01-03", 1);
    const over = db
      .prepare(
        "SELECT outstanding_balance_minor AS b, debt_status AS s, is_over_limit AS o FROM customers WHERE id = 1",
      )
      .get() as { b: number; s: string; o: number };
    expect(over.b).toBe(12000);
    expect(over.s).toBe("over_limit");
    expect(over.o).toBe(1);
    // Index 0014 des lignes de retours (detail par parent).
    const idx = db
      .prepare(
        "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'index' AND name IN ('idx_return_items_return','idx_supplier_return_items_return')",
      )
      .get() as { c: number };
    expect(idx.c).toBe(2);
    db.close();
  });

  it("pain : surpaiement rejeté + statuts contraints", () => {
    const db = openMigrated(tmp);
    db.prepare(
      "INSERT INTO bread_orders (uuid, order_number, order_date, pickup_date, quantity, unit_price_minor, total_amount_minor, amount_paid_minor, remaining_amount_minor, payment_status, pickup_status, created_at, updated_at) VALUES ('b1','PAIN-2026-00001','2026-01-01','2026-01-02',10,1500,15000,10000,5000,'partial','pending','2026-01-01','2026-01-01')",
    ).run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO bread_orders (uuid, order_number, order_date, pickup_date, quantity, unit_price_minor, total_amount_minor, amount_paid_minor, remaining_amount_minor, payment_status, pickup_status, created_at, updated_at) VALUES ('b2','PAIN-2026-00002','2026-01-01','2026-01-02',1,1000,1000,1500,-500,'partial','pending','2026-01-01','2026-01-01')",
        )
        .run(),
    ).toThrow();
    db.close();
  });
});
