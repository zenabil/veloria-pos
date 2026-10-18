// Veloria PoS — Garde R2 (conseil llm-council) : la clause ORDER BY assemblée
// n'accepte que des identifiants simples — toute injection est rejetée (FR).
import { describe, it, expect } from "vitest";
import { assertOrderClause } from "../../electron/ipc/handlers/sql-guard";

const PRODUCTION_CLAUSES = [
  // finance.repo.ts
  "remaining_minor DESC, created_at DESC",
  "created_at DESC",
  "due_date IS NULL, due_date ASC, created_at DESC",
  // ex-bread.repo.ts (supprimé ADR-109 — vecteurs conservés pour la garde)
  "b.pickup_date DESC, b.id DESC",
  "b.id DESC",
  "b.total_amount_minor DESC, b.id DESC",
  "b.pickup_date ASC, b.id ASC",
  // history-query.ts
  "created_at ASC, kind ASC",
  "amount_minor IS NULL, amount_minor DESC, created_at DESC",
  "amount_minor IS NULL, amount_minor ASC, created_at DESC",
  "created_at DESC, kind ASC",
  // expenses.repo.ts
  "e.expense_date ASC, e.id ASC",
  "e.amount_minor DESC, e.expense_date DESC",
  "e.amount_minor ASC, e.expense_date DESC",
  "e.expense_date DESC, e.id DESC",
  // inventory.repo.ts
  "p.name COLLATE NOCASE DESC",
  "p.quantity ASC, p.name COLLATE NOCASE ASC",
  "p.quantity DESC, p.name COLLATE NOCASE ASC",
  "stock_value_minor DESC, p.name COLLATE NOCASE ASC",
  // suppliers.repo.ts
  "s.name COLLATE NOCASE DESC",
  "total_purchases_minor DESC, s.name COLLATE NOCASE ASC",
  "s.outstanding_balance_minor DESC, s.name COLLATE NOCASE ASC",
  "last_intake_at DESC, s.name COLLATE NOCASE ASC",
  // proformas.repo.ts
  "p.id ASC",
  "p.total_minor DESC, p.id DESC",
  "p.total_minor ASC, p.id DESC",
  "p.id DESC",
  // returns.repo.ts
  "created_at ASC",
  "total_minor DESC, created_at DESC",
  "total_minor ASC, created_at DESC",
];

const ATTACKS = [
  "id; DROP TABLE sales",
  "id DESC --",
  "id DESC /*",
  "1=1",
  "(SELECT 1)",
  "sleep(1)",
  "created_at",
  "",
  "created_at desc",
  "created_at DESC ",
  " created_at DESC",
  "created_at  DESC",
  "Créated_at DESC",
];

describe("sql-guard R2 : clause ORDER BY fail-closed", () => {
  it("accepte toutes les clauses de production (8 requêtes listées)", () => {
    for (const clause of PRODUCTION_CLAUSES) {
      expect(assertOrderClause(clause)).toBe(clause);
    }
  });
  it("rejette les injections et les clauses mal formées (message FR)", () => {
    for (const attack of ATTACKS) {
      expect(() => assertOrderClause(attack)).toThrow("Tri invalide.");
    }
  });
});
