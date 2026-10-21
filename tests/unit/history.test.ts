// Veloria PoS — Tests : historique (bâtisseur SQL, helpers UI, validateurs Zod).
import { describe, it, expect } from "vitest";
import { HISTORY_KINDS, buildHistoryQuery } from "../../electron/ipc/handlers/history-query.ts";
import {
  KIND_LABELS,
  OP_FILTERS,
  kindTone,
  rowKey,
  splitDateTime,
  type HistoryRow,
} from "@features/history/types.ts";
import { historyDetailSchema, historyListSchema } from "../../electron/ipc/validators.ts";

function row(over: Partial<HistoryRow> = {}): HistoryRow {
  return {
    kind: "sale",
    entity_id: 1,
    ref: "FAC-2026-00001",
    label: "Vente FAC-2026-00001",
    entity_type: "sale",
    entity_name: "FAC-2026-00001",
    amount_minor: 1000,
    method: null,
    status: "Validée",
    created_at: "2026-09-16T10:30:00.000Z",
    stock_before: null,
    stock_delta: null,
    stock_after: null,
    ...over,
  };
}

describe("History query builder", () => {
  it("covers the 17 kinds", () => {
    expect(HISTORY_KINDS.length).toBe(17);
    const q = buildHistoryQuery({
      op: "all",
      from: null,
      to: null,
      query: "",
      sort: "date_desc",
      page: 1,
      pageSize: 20,
    });
    for (const table of [
      "FROM sales",
      "FROM stock_intakes",
      "FROM sale_payments",
      "FROM supplier_payments",
      "FROM stock_movements",
      "FROM audit_log",
      "FROM customers",
      "FROM suppliers",
    ]) {
      expect(q.sql.includes(table), table).toBe(true);
    }
    expect(q.sql.includes("UNION ALL")).toBe(true);
    expect(q.params).toEqual([20, 0]);
  });

  it("restricts branches per operation filter", () => {
    const q = buildHistoryQuery({
      op: "sale",
      from: null,
      to: null,
      query: "",
      sort: "date_desc",
      page: 1,
      pageSize: 20,
    });
    expect(q.sql.includes("FROM sales")).toBe(true);
    expect(q.sql.includes("FROM stock_intakes")).toBe(false);
    expect(q.sql.includes("UNION ALL")).toBe(false);
  });

  it("covers catalogue filters (product/customer/supplier)", () => {
    for (const op of ["product_create", "customer_delete", "supplier_update"] as const) {
      const parsed = historyListSchema.parse({ op });
      expect(parsed.op).toBe(op);
      const q = buildHistoryQuery({
        op,
        from: null,
        to: null,
        query: "",
        sort: "date_desc",
        page: 1,
        pageSize: 20,
      });
      expect(q.sql.includes("UNION ALL")).toBe(false);
      expect(q.sql.includes("FROM sales")).toBe(false);
    }
    const customers = buildHistoryQuery({
      op: "customer_create",
      from: null,
      to: null,
      query: "",
      sort: "date_desc",
      page: 1,
      pageSize: 20,
    });
    expect(customers.sql.includes("FROM customers")).toBe(true);
  });

  it("binds date range, search and pagination in order", () => {
    const q = buildHistoryQuery({
      op: "all",
      from: "2026-09-01",
      to: "2026-09-30",
      query: "FAC",
      sort: "amount_desc",
      page: 2,
      pageSize: 20,
    });
    // W8 (F-06) : les bornes de date sont désormais des TIMESTAMPS
    // comparés directement à `created_at` (indexable) au lieu de
    // `substr(created_at,1,10)` (non indexable). La borne haute est
    // EXCLUSIVE : le jour `to` (2026-09-30) reste entièrement inclus.
    expect(q.params.slice(0, 5)).toEqual([
      "2026-09-01T00:00:00.000Z",
      "2026-10-01T00:00:00.000Z",
      "%FAC%",
      "%FAC%",
      "%FAC%",
    ]);
    expect(q.params.slice(-2)).toEqual([20, 20]);
    expect(q.countParams).toEqual([
      "2026-09-01T00:00:00.000Z",
      "2026-10-01T00:00:00.000Z",
      "%FAC%",
      "%FAC%",
      "%FAC%",
    ]);
    expect(q.sql.includes("amount_minor DESC")).toBe(true);
    expect(q.sql.includes("substr(")).toBe(false);
  });
});

describe("History UI helpers", () => {
  it("labels the 17 kinds in French", () => {
    expect(HISTORY_KINDS.every((k) => KIND_LABELS[k].length > 0)).toBe(true);
    expect(KIND_LABELS["payment_in"]).toBe("Paiement client");
    expect(OP_FILTERS.length).toBe(18);
    expect(kindTone("sale")).toBe("green");
    expect(kindTone("product_delete")).toBe("red");
  });

  it("keys rows and splits datetimes", () => {
    expect(rowKey(row({ kind: "sale", entity_id: 3 }))).toBe("sale:3");
    expect(splitDateTime("2026-09-16T10:30:00.000Z")).toEqual({
      date: "2026-09-16",
      time: "10h30",
    });
  });
});

describe("History Zod schemas", () => {
  it("validates list filters", () => {
    // P06: pageSize aligné à 200 max (comme les autres listes).
    const parsed = historyListSchema.parse({ op: "sale", sort: "amount_desc", pageSize: 200 });
    expect(parsed.page).toBe(1);
    expect(() => historyListSchema.parse({ op: "nope" })).toThrow();
    expect(() => historyListSchema.parse({ pageSize: 201 })).toThrow();
  });

  it("validates detail kinds", () => {
    expect(historyDetailSchema.parse({ kind: "supplier_delete", id: 2 }).id).toBe(2);
    expect(() => historyDetailSchema.parse({ kind: "order", id: 1 })).toThrow();
  });
});
