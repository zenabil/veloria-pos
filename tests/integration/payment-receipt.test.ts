// Veloria PoS — Tests P1-1 : grand-livre reçu historique (miroir SQLite réel).
// Rejoue la logique de `getCustomerPaymentReceipt` (ventes − paiements ordonnés)
// sur `node:sqlite` : aucune donnée inventée, soldes en centimes.
import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";

function ledgerBalances(
  db: DatabaseSync,
  customerId: number,
  targetPaymentId: number,
): { prevMinor: number; newMinor: number } | null {
  const customer = db
    .prepare(`SELECT initial_balance_minor AS init FROM customers WHERE id = ?`)
    .get(customerId) as { init: number } | undefined;
  if (!customer) return null;
  const sales = db
    .prepare(
      `SELECT id, total_minor AS total, created_at AS at, is_cancelled AS cancelled FROM sales WHERE customer_id = ? ORDER BY id ASC`,
    )
    .all(customerId) as { id: number; total: number; at: string; cancelled: number }[];
  const payments = db
    .prepare(
      `SELECT id, amount_minor AS amount, created_at AS at FROM sale_payments WHERE customer_id = ? ORDER BY id ASC`,
    )
    .all(customerId) as { id: number; amount: number; at: string }[];
  type Evt =
    | { at: string; tie: number; seq: number; kind: "sale"; amount: number }
    | { at: string; tie: number; seq: number; kind: "pay"; id: number; amount: number };
  const evts: Evt[] = [];
  for (const s of sales) {
    if (s.cancelled === 1) continue;
    evts.push({ at: s.at, tie: 0, seq: s.id, kind: "sale", amount: s.total });
  }
  let found = false;
  for (const p of payments) {
    if (p.id === targetPaymentId) found = true;
    evts.push({ at: p.at, tie: 1, seq: p.id, kind: "pay", id: p.id, amount: p.amount });
  }
  if (!found) return null;
  evts.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.tie - b.tie || a.seq - b.seq));
  let balance = customer.init;
  for (const e of evts) {
    if (e.kind === "sale") balance += e.amount;
    else if (e.id === targetPaymentId) return { prevMinor: balance, newMinor: balance - e.amount };
    else balance -= e.amount;
  }
  return null;
}

describe("P1-1 : grand-livre reçu (miroir SQLite)", () => {
  it("reconstitue les soldes depuis les tables réelles", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`CREATE TABLE customers (id INTEGER PRIMARY KEY, initial_balance_minor INTEGER NOT NULL);
        CREATE TABLE sales (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, total_minor INTEGER NOT NULL, is_cancelled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
        CREATE TABLE sale_payments (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, amount_minor INTEGER NOT NULL, created_at TEXT NOT NULL);`);
      db.prepare(`INSERT INTO customers VALUES (1, 0)`).run();
      db.prepare(`INSERT INTO sales VALUES (1, 1, 20000, 0, '2026-01-01T10:00:00')`).run();
      db.prepare(`INSERT INTO sale_payments VALUES (1, 1, 5000, '2026-01-02T10:00:00')`).run();
      db.prepare(`INSERT INTO sale_payments VALUES (2, 1, 7000, '2026-01-03T10:00:00')`).run();
      expect(ledgerBalances(db, 1, 2)).toEqual({ prevMinor: 15000, newMinor: 8000 });
      expect(ledgerBalances(db, 1, 999)).toBeNull();
    } finally {
      db.close();
    }
  });
});
