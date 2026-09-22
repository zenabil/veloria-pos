// Veloria PoS — Main-process repository: historique unifié (page Historique).
// Lecture seule : UNION multi-tables (bâtie par history-query.ts) + relevés
// normalisés par opération. Aucune mutation ici.

import { getDb } from "../../database/sqlite.service";
import { getSaleDetail } from "./sales.repo";
import { buildHistoryQuery, type HistoryFilters, type HistoryKind } from "./history-query";

export type { HistoryFilters, HistoryKind };

export function listHistory(f: HistoryFilters): { rows: unknown[]; total: number } {
  const db = getDb();
  const q = buildHistoryQuery(f);
  const total = (db.prepare(q.countSql).get(...q.countParams) as { c: number }).c;
  const rows = db.prepare(q.sql).all(...q.params) as Record<string, unknown>[];
  // Noms des entités supprimées (audit details_json), sans dépendre de JSON1.
  for (const r of rows) {
    const rawDetails = rawText(r["details_json"]);
    if ((r["entity_name"] == null || r["entity_name"] === "") && rawDetails != null) {
      try {
        const d = JSON.parse(rawDetails) as { name?: unknown };
        if (typeof d.name === "string" && d.name.trim() !== "") {
          r["entity_name"] = d.name;
          const head =
            String(rawText(r["label"]) ?? "")
              .split("·")[0]
              ?.trim() ?? "";
          r["label"] = `${head} · ${d.name}`;
        }
      } catch {
        /* libellé générique conservé */
      }
    }
  }
  return { rows, total };
}

export function getHistoryStats(
  from: string | null,
  to: string | null,
): {
  totalOperations: number;
  salesCount: number;
  salesAmountMinor: number;
  purchasesCount: number;
  purchasesAmountMinor: number;
  paymentsAmountMinor: number;
} {
  const db = getDb();
  const range = (col: string): { cond: string; params: unknown[] } => {
    const conds: string[] = [];
    const params: unknown[] = [];
    if (from) {
      conds.push(`substr(${col}, 1, 10) >= ?`);
      params.push(from);
    }
    if (to) {
      conds.push(`substr(${col}, 1, 10) <= ?`);
      params.push(to);
    }
    return { cond: conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "", params };
  };
  const count = (table: string, col = "created_at"): number => {
    const r = range(col);
    return (
      db.prepare(`SELECT COUNT(*) AS c FROM ${table} ${r.cond}`).get(...r.params) as { c: number }
    ).c;
  };
  const sum = (table: string, col: string, dateCol = "created_at"): number => {
    const r = range(dateCol);
    return (
      db
        .prepare(`SELECT COALESCE(SUM(${col}), 0) AS s FROM ${table} ${r.cond}`)
        .get(...r.params) as {
        s: number;
      }
    ).s;
  };
  const rs = range("created_at");
  const ops =
    (db.prepare(`SELECT COUNT(*) AS c FROM sales ${rs.cond}`).get(...rs.params) as { c: number })
      .c +
    count("stock_intakes") +
    count("sale_payments") +
    count("supplier_payments") +
    count("stock_movements") +
    count("audit_log");
  const payIn = sum("sale_payments", "amount_minor");
  return {
    totalOperations: ops,
    salesCount: count("sales"),
    salesAmountMinor: sum("sales", "total_minor"),
    purchasesCount: count("stock_intakes"),
    purchasesAmountMinor: sum("stock_intakes", "total_minor"),
    paymentsAmountMinor: payIn + sum("supplier_payments", "amount_minor"),
  };
}

export interface HistoryDetail {
  kind: HistoryKind;
  title: string;
  reference: string;
  createdAt: string;
  status: string;
  user: string;
  info: { label: string; value: string }[];
  entity: { type: string; name: string; id: number } | null;
  financial: { amount: number; method: string | null; extra: string | null } | null;
  stock: { before: number; delta: number; after: number } | null;
  ticketSaleId: number | null;
}

type Row = Record<string, unknown>;
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(typeof v === "string" ? v : NaN);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => {
  if (v == null) return "—";
  if (typeof v === "string") return v === "" ? "—" : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "—";
};
const rawText = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export function getHistoryDetail(kind: HistoryKind, id: number): HistoryDetail {
  const db = getDb();
  const base = {
    kind,
    user: "Caisse",
    entity: null as HistoryDetail["entity"],
    financial: null as HistoryDetail["financial"],
    stock: null as HistoryDetail["stock"],
    ticketSaleId: null as number | null,
  };
  if (kind === "sale") {
    const d = getSaleDetail(id) as { sale: Row; items: Row[]; payments: Row[] };
    const sale = d.sale;
    const cust =
      sale["customer_id"] != null
        ? (db.prepare(`SELECT search_name FROM customers WHERE id = ?`).get(sale["customer_id"]) as
            | { search_name: string }
            | undefined)
        : undefined;
    return {
      ...base,
      title: `Vente ${str(sale["invoice_number"])}`,
      reference: str(sale["invoice_number"]),
      createdAt: str(sale["created_at"]),
      status: sale["is_cancelled"] === 1 ? "Annulée" : "Validée",
      info: [
        { label: "Facture", value: str(sale["invoice_number"]) },
        { label: "Client", value: cust?.search_name ?? "Client de passage" },
        { label: "Articles", value: String(d.items.length) },
        { label: "Statut paiement", value: str(sale["payment_status"]) },
      ],
      entity: { type: "Vente", name: str(sale["invoice_number"]), id },
      financial: {
        amount: num(sale["total_minor"]),
        method: typeof sale["payment_method"] === "string" ? sale["payment_method"] : null,
        extra: `Payé ${num(sale["amount_paid_minor"])} · Reste ${num(sale["remaining_balance_minor"])}`,
      },
      ticketSaleId: id,
    };
  }
  if (kind === "purchase") {
    const intake = db.prepare(`SELECT * FROM stock_intakes WHERE id = ?`).get(id) as
      | Row
      | undefined;
    if (!intake) throw new Error("Achat introuvable.");
    const sup =
      intake["supplier_id"] != null
        ? (db.prepare(`SELECT name FROM suppliers WHERE id = ?`).get(intake["supplier_id"]) as
            | { name: string }
            | undefined)
        : undefined;
    const items = db
      .prepare(`SELECT * FROM stock_intake_items WHERE stock_intake_id = ?`)
      .all(id) as Row[];
    return {
      ...base,
      title: `Achat ${str(intake["invoice_number"]) || `BON-${id}`}`,
      reference: str(intake["invoice_number"]),
      createdAt: str(intake["created_at"]),
      status:
        intake["status"] === "committed"
          ? "Validée"
          : intake["status"] === "draft"
            ? "Brouillon"
            : "Annulée",
      info: [
        { label: "Fournisseur", value: sup?.name ?? "Comptant" },
        { label: "Lignes", value: String(items.length) },
        { label: "Notes", value: str(intake["notes"]) },
      ],
      entity: { type: "Achat", name: sup?.name ?? "Comptant", id },
      financial: { amount: num(intake["total_minor"]), method: null, extra: null },
    };
  }
  if (kind === "payment_in" || kind === "payment_out") {
    const table = kind === "payment_in" ? "sale_payments" : "supplier_payments";
    const pay = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Row | undefined;
    if (!pay) throw new Error("Paiement introuvable.");
    if (kind === "payment_in") {
      const cust =
        pay["customer_id"] != null
          ? (db
              .prepare(`SELECT search_name FROM customers WHERE id = ?`)
              .get(pay["customer_id"]) as { search_name: string } | undefined)
          : undefined;
      const sale =
        pay["sale_id"] != null
          ? (db.prepare(`SELECT invoice_number FROM sales WHERE id = ?`).get(pay["sale_id"]) as
              | { invoice_number: string }
              | undefined)
          : undefined;
      return {
        ...base,
        title: `Paiement client ${num(pay["amount_minor"])}`,
        reference: sale?.invoice_number ?? "Encaissement",
        createdAt: str(pay["created_at"]),
        status: "Encaissé",
        info: [
          { label: "Client", value: cust?.search_name ?? "—" },
          { label: "Vente liée", value: sale?.invoice_number ?? "Compte client" },
          { label: "Référence", value: str(pay["reference"]) },
        ],
        entity: { type: "Client", name: cust?.search_name ?? "—", id: num(pay["customer_id"]) },
        financial: { amount: num(pay["amount_minor"]), method: str(pay["method"]), extra: null },
      };
    }
    const sup =
      pay["supplier_id"] != null
        ? (db.prepare(`SELECT name FROM suppliers WHERE id = ?`).get(pay["supplier_id"]) as
            | { name: string }
            | undefined)
        : undefined;
    return {
      ...base,
      title: `Paiement fournisseur ${num(pay["amount_minor"])}`,
      reference: str(pay["reference"]),
      createdAt: str(pay["created_at"]),
      status: "Payé",
      info: [
        { label: "Fournisseur", value: sup?.name ?? "—" },
        { label: "Référence", value: str(pay["reference"]) },
      ],
      entity: { type: "Fournisseur", name: sup?.name ?? "—", id: num(pay["supplier_id"]) },
      financial: { amount: num(pay["amount_minor"]), method: str(pay["method"]), extra: null },
    };
  }
  if (
    kind === "stock_in" ||
    kind === "stock_out" ||
    kind === "stock_correct" ||
    kind === "stock_inventory"
  ) {
    const m = db.prepare(`SELECT * FROM stock_movements WHERE id = ?`).get(id) as Row | undefined;
    if (!m) throw new Error("Mouvement introuvable.");
    const prod = db
      .prepare(`SELECT name, unit_code FROM products WHERE id = ?`)
      .get(m["product_id"]) as { name: string; unit_code: string } | undefined;
    const before = num(m["quantity_after"]) - num(m["quantity_delta"]);
    const reasonText = rawText(m["reason"]);
    return {
      ...base,
      title: reasonText ?? "Mouvement stock",
      reference: str(m["reference"]),
      createdAt: str(m["created_at"]),
      status: "Enregistré",
      info: [
        { label: "Produit", value: prod?.name ?? "—" },
        { label: "Motif", value: str(m["reason"]) },
      ],
      entity: { type: "Produit", name: prod?.name ?? "—", id: num(m["product_id"]) },
      financial: null,
      stock: { before, delta: num(m["quantity_delta"]), after: num(m["quantity_after"]) },
    };
  }
  // Fiches (audit ou lignes) : instantané actuel si la fiche existe encore.
  const auditEvent: Record<string, string> = {
    product_update: "product.updated",
    product_delete: "product.deleted",
    customer_update: "customer.updated",
    supplier_update: "supplier.updated",
    supplier_delete: "supplier.deleted",
  };
  const tableOf: Record<string, string> = {
    product_create: "products",
    product_update: "products",
    product_delete: "products",
    customer_create: "customers",
    customer_update: "customers",
    customer_delete: "customers",
    supplier_create: "suppliers",
    supplier_update: "suppliers",
    supplier_delete: "suppliers",
  };
  const table = tableOf[kind] ?? "products";
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Row | undefined;
  let audit: Row | undefined;
  const event = auditEvent[kind];
  if (event) {
    const rows = db
      .prepare(
        `SELECT * FROM audit_log WHERE event_type = ? AND entity_id = ? ORDER BY id DESC LIMIT 1`,
      )
      .all(event, String(id)) as Row[];
    audit = rows[0];
  }
  const createdAt = str(audit?.["created_at"] ?? row?.["created_at"] ?? row?.["deleted_at"]);
  const rowName = rawText(row?.["name"]) ?? rawText(row?.["search_name"]);
  const name =
    rowName ??
    (() => {
      const rawDetails = rawText(audit?.["details_json"]) ?? "{}";
      try {
        const d = JSON.parse(rawDetails) as { name?: unknown };
        return typeof d.name === "string" && d.name !== "" ? d.name : "—";
      } catch {
        return "—";
      }
    })();
  const titles: Record<string, string> = {
    product_create: "Création produit",
    product_update: "Modification produit",
    product_delete: "Suppression produit",
    customer_create: "Création client",
    customer_update: "Modification client",
    customer_delete: "Suppression client",
    supplier_create: "Création fournisseur",
    supplier_update: "Modification fournisseur",
    supplier_delete: "Suppression fournisseur",
  };
  if (!row && !audit) throw new Error("Élément introuvable.");
  return {
    ...base,
    title: `${titles[kind] ?? kind} · ${name}`,
    reference: "—",
    createdAt,
    status: kind.endsWith("_delete")
      ? kind === "customer_delete"
        ? "Archivé"
        : "Supprimé"
      : "Enregistré",
    info: [{ label: "Fiche", value: name }],
    entity: {
      type: table === "products" ? "Produit" : table === "customers" ? "Client" : "Fournisseur",
      name,
      id,
    },
  };
}
