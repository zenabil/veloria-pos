// Veloria PoS — Historique : constructeur SQL pur (sans Electron/SQLite).
// Testable sans runtime natif ; `history.repo.ts` ne fait qu'exécuter.
// Une ligne = kind, entity_id, ref, label, entity_type, entity_name,
// amount_minor?, method?, status (FR), created_at, stock_before/delta/after?,
// details_json? (noms des entités supprimées).

import { assertOrderClause } from "./sql-guard";

export const HISTORY_KINDS = [
  "sale",
  "purchase",
  "payment_in",
  "payment_out",
  "stock_in",
  "stock_out",
  "stock_correct",
  "stock_inventory",
  "product_create",
  "product_update",
  "product_delete",
  "customer_create",
  "customer_update",
  "customer_delete",
  "supplier_create",
  "supplier_update",
  "supplier_delete",
] as const;

export type HistoryKind = (typeof HISTORY_KINDS)[number];

export type HistoryOpFilter =
  | "all"
  | "sale"
  | "purchase"
  | "payment_in"
  | "payment_out"
  | "stock_in"
  | "stock_out"
  | "stock_correct"
  | "stock_inventory"
  | "product_create"
  | "product_update"
  | "product_delete"
  | "customer_create"
  | "customer_update"
  | "customer_delete"
  | "supplier_create"
  | "supplier_update"
  | "supplier_delete";

export type HistorySort = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

export interface HistoryFilters {
  op: HistoryOpFilter;
  from: string | null;
  to: string | null;
  query: string;
  sort: HistorySort;
  page: number;
  pageSize: number;
}

const BASE_COLUMNS = `kind, entity_id, ref, label, entity_type, entity_name, amount_minor, method, status, created_at, stock_before, stock_delta, stock_after, details_json, actor_id`;

function saleBranch(): string {
  return `SELECT 'sale' AS kind, s.id AS entity_id, s.invoice_number AS ref,
    'Vente ' || s.invoice_number || ' · ' || COALESCE(c.search_name, 'passage') AS label,
    'sale' AS entity_type, s.invoice_number AS entity_name,
    s.total_minor AS amount_minor, s.payment_method AS method,
    CASE WHEN s.is_cancelled = 1 THEN 'Annulée' ELSE 'Validée' END AS status,
    s.created_at AS created_at,
    NULL AS stock_before, NULL AS stock_delta, NULL AS stock_after, NULL AS details_json,
    s.staff_user_id AS actor_id
  FROM sales s LEFT JOIN customers c ON c.id = s.customer_id`;
}

function purchaseBranch(): string {
  return `SELECT 'purchase' AS kind, si.id AS entity_id,
    COALESCE(si.invoice_number, 'BON-' || printf('%05d', si.id)) AS ref,
    'Achat ' || COALESCE(si.invoice_number, 'BON-' || printf('%05d', si.id)) || ' · ' || COALESCE(s.name, 'comptant') AS label,
    'intake' AS entity_type, COALESCE(s.name, 'Comptant') AS entity_name,
    si.total_minor AS amount_minor, NULL AS method,
    CASE si.status WHEN 'committed' THEN 'Validée' WHEN 'draft' THEN 'Brouillon' ELSE 'Annulée' END AS status,
    si.created_at AS created_at,
    NULL AS stock_before, NULL AS stock_delta, NULL AS stock_after, NULL AS details_json,
    si.staff_user_id AS actor_id
  FROM stock_intakes si LEFT JOIN suppliers s ON s.id = si.supplier_id`;
}

function paymentInBranch(): string {
  // E-33 : un encaissement rattaché à une vente ANNULÉE n'est jamais un
  // encaissement (l'annulation le supprime désormais — `cancelSaleAtomic`) :
  // le filtre `is_cancelled` reste nevertheless en défense en profondeur pour
  // les lignes historiques (ventes annulées avant le correctif).
  return `SELECT 'payment_in' AS kind, sp.id AS entity_id,
    COALESCE(s.invoice_number, 'Encaissement') AS ref,
    'Paiement ' || COALESCE(c.search_name, 'client') || COALESCE(' (' || s.invoice_number || ')', '') AS label,
    'customer' AS entity_type, COALESCE(c.search_name, '—') AS entity_name,
    sp.amount_minor AS amount_minor, sp.method AS method, 'Encaissé' AS status,
    sp.created_at AS created_at,
    NULL AS stock_before, NULL AS stock_delta, NULL AS stock_after, NULL AS details_json,
    sp.staff_user_id AS actor_id
  FROM sale_payments sp LEFT JOIN sales s ON s.id = sp.sale_id LEFT JOIN customers c ON c.id = sp.customer_id
  WHERE sp.sale_id IS NULL OR COALESCE(s.is_cancelled, 0) = 0`;
}

function paymentOutBranch(): string {
  return `SELECT 'payment_out' AS kind, sp.id AS entity_id,
    COALESCE(sp.reference, 'Paiement') AS ref,
    'Paiement ' || COALESCE(s.name, 'fournisseur') AS label,
    'supplier' AS entity_type, COALESCE(s.name, '—') AS entity_name,
    sp.amount_minor AS amount_minor, sp.method AS method, 'Payé' AS status,
    sp.created_at AS created_at,
    NULL AS stock_before, NULL AS stock_delta, NULL AS stock_after, NULL AS details_json,
    sp.staff_user_id AS actor_id
  FROM supplier_payments sp LEFT JOIN suppliers s ON s.id = sp.supplier_id`;
}

function movementBranch(kind: string, labelWords: string, extraWhere: string): string {
  // RADICAL-FIX: allow-list stricte — jamais d'interpolation depuis l'entrée IPC.
  // `kind` vient de littéraux internes (branchesFor), `extraWhere` de constantes.
  if (!HISTORY_KINDS.includes(kind as (typeof HISTORY_KINDS)[number])) {
    throw new Error("Type d'historique invalide.");
  }
  if (/[;'-]{2}|--|\/\*/.test(extraWhere)) {
    throw new Error("Filtre d'historique invalide.");
  }
  return `SELECT '${kind}' AS kind, m.id AS entity_id,
    COALESCE(m.reference, '${labelWords}') AS ref,
    '${labelWords} · ' || COALESCE(p.name, 'produit') AS label,
    'product' AS entity_type, COALESCE(p.name, '—') AS entity_name,
    NULL AS amount_minor, NULL AS method, 'Enregistré' AS status,
    m.created_at AS created_at,
    (m.quantity_after - m.quantity_delta) AS stock_before, m.quantity_delta AS stock_delta, m.quantity_after AS stock_after,
    NULL AS details_json, m.staff_user_id AS actor_id
  FROM stock_movements m LEFT JOIN products p ON p.id = m.product_id
  WHERE ${extraWhere}`;
}

function auditBranch(
  kind: string,
  event: string,
  entity: "product" | "customer" | "supplier",
  labelWords: string,
): string {
  // RADICAL-FIX: allow-list — appelants internes uniquement (littéraux branchesFor).
  if (!HISTORY_KINDS.includes(kind as (typeof HISTORY_KINDS)[number])) {
    throw new Error("Type d'historique invalide.");
  }
  if (!/^[a-z]+\.[a-z_]+$/.test(event)) {
    throw new Error("Événement d'historique invalide.");
  }
  const table =
    entity === "product" ? "products" : entity === "customer" ? "customers" : "suppliers";
  const nameExpr = entity === "customer" ? "e.search_name" : "e.name";
  return `SELECT '${kind}' AS kind, a.id AS entity_id, '${labelWords}' AS ref,
    '${labelWords} · ' || COALESCE(${nameExpr}, '—') AS label,
    '${entity}' AS entity_type, ${nameExpr} AS entity_name,
    NULL AS amount_minor, NULL AS method,
    CASE WHEN '${kind}' LIKE '%delete' THEN 'Supprimé' ELSE 'Enregistré' END AS status,
    a.created_at AS created_at,
    NULL AS stock_before, NULL AS stock_delta, NULL AS stock_after, a.details_json AS details_json,
    a.actor_user_id AS actor_id
  FROM audit_log a LEFT JOIN ${table} e ON e.id = CAST(a.entity_id AS INTEGER)
  WHERE a.event_type = '${event}'`;
}

function tableCreateBranch(
  kind: string,
  table: string,
  nameExpr: string,
  labelWords: string,
): string {
  // RADICAL-FIX: tables autorisées uniquement (jamais de nom depuis l'IPC).
  if (!["customers", "suppliers", "products"].includes(table)) {
    throw new Error("Table d'historique invalide.");
  }
  if (!HISTORY_KINDS.includes(kind as (typeof HISTORY_KINDS)[number])) {
    throw new Error("Type d'historique invalide.");
  }
  return `SELECT '${kind}' AS kind, t.id AS entity_id, '${labelWords}' AS ref,
    '${labelWords} · ' || ${nameExpr} AS label,
    '${table}' AS entity_type, ${nameExpr} AS entity_name,
    NULL AS amount_minor, NULL AS method, 'Enregistré' AS status,
    t.created_at AS created_at,
    NULL AS stock_before, NULL AS stock_delta, NULL AS stock_after, NULL AS details_json,
    NULL AS actor_id
  FROM ${table} t`;
}

function branchesFor(op: HistoryOpFilter): string[] {
  const all = [
    saleBranch(),
    purchaseBranch(),
    paymentInBranch(),
    paymentOutBranch(),
    movementBranch(
      "stock_in",
      "Entrée stock",
      "((m.movement_type = 'intake_in' AND (m.related_entity_type IS NULL OR m.related_entity_type != 'product_create')) OR m.movement_type IN ('sale_cancel_in','return_in') OR (m.movement_type = 'adjust_in' AND m.related_entity_type = 'return_cancel'))",
    ),
    movementBranch(
      "stock_out",
      "Sortie stock",
      "(m.movement_type IN ('sale_out','damage_out') OR (m.movement_type = 'adjust_out' AND m.related_entity_type IN ('supplier_return','return_cancel')))",
    ),
    movementBranch(
      "stock_correct",
      "Correction stock",
      "m.movement_type IN ('adjust_in','adjust_out') AND (m.related_entity_type IS NULL OR m.related_entity_type = 'adjustment')",
    ),
    movementBranch(
      "stock_inventory",
      "Inventaire",
      "m.movement_type IN ('adjust_in','adjust_out') AND m.related_entity_type = 'inventory'",
    ),
    auditBranch("product_create", "product.created", "product", "Création produit"),
    auditBranch("product_update", "product.updated", "product", "Modification produit"),
    auditBranch("product_delete", "product.deleted", "product", "Suppression produit"),
    tableCreateBranch("customer_create", "customers", "t.search_name", "Création client"),
    auditBranch("customer_update", "customer.updated", "customer", "Modification client"),
    `SELECT 'customer_delete' AS kind, t.id AS entity_id, 'Suppression client' AS ref,
      'Suppression client · ' || t.search_name AS label,
      'customers' AS entity_type, t.search_name AS entity_name,
      NULL AS amount_minor, NULL AS method, 'Archivé' AS status,
      t.deleted_at AS created_at,
      NULL AS stock_before, NULL AS stock_delta, NULL AS stock_after, NULL AS details_json,
      NULL AS actor_id
    FROM customers t WHERE t.deleted_at IS NOT NULL`,
    tableCreateBranch("supplier_create", "suppliers", "t.name", "Création fournisseur"),
    auditBranch("supplier_update", "supplier.updated", "supplier", "Modification fournisseur"),
    `SELECT 'supplier_delete' AS kind, a.id AS entity_id, 'Suppression fournisseur' AS ref,
      'Suppression fournisseur' AS label,
      'supplier' AS entity_type, e.name AS entity_name,
      NULL AS amount_minor, NULL AS method, 'Supprimé' AS status,
      a.created_at AS created_at,
      NULL AS stock_before, NULL AS stock_delta, NULL AS stock_after, a.details_json AS details_json,
      a.actor_user_id AS actor_id
    FROM audit_log a LEFT JOIN suppliers e ON e.id = CAST(a.entity_id AS INTEGER)
    WHERE a.event_type IN ('supplier.deleted','supplier.deleted_many')`,
  ];
  if (op === "all") return all;
  const map: Record<Exclude<HistoryOpFilter, "all">, number[]> = {
    sale: [0],
    purchase: [1],
    payment_in: [2],
    payment_out: [3],
    stock_in: [4],
    stock_out: [5],
    stock_correct: [6],
    stock_inventory: [7],
    product_create: [8],
    product_update: [9],
    product_delete: [10],
    customer_create: [11],
    customer_update: [12],
    customer_delete: [13],
    supplier_create: [14],
    supplier_update: [15],
    supplier_delete: [16],
  };
  return map[op].map((i) => all[i] as string);
}

function orderBy(sort: HistorySort): string {
  if (sort === "date_asc") return `created_at ASC, kind ASC`;
  if (sort === "amount_desc") return `amount_minor IS NULL, amount_minor DESC, created_at DESC`;
  if (sort === "amount_asc") return `amount_minor IS NULL, amount_minor ASC, created_at DESC`;
  return `created_at DESC, kind ASC`;
}

/** Jour suivant d'une date métier « AAAA-MM-JJ » (borne haute exclusive). */
function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return day;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Requête paginée + comptage (mêmes filtres). Params : [from?, to?, like?] + [limit, offset]. */
/** R2 (0046) : staffUserId null = gérant (tout) ; sinon seules les lignes
 *  dont actor_id = l'utilisateur (les lignes sans auteur sont invisibles). */
export function buildHistoryQuery(
  f: HistoryFilters,
  staffUserId: number | null = null,
): {
  sql: string;
  countSql: string;
  params: unknown[];
  countParams: unknown[];
} {
  const union = branchesFor(f.op).join("\nUNION ALL\n");
  const conds: string[] = [];
  const params: unknown[] = [];
  if (f.from) {
    // W8 (F-06) : la borne basse devient une comparaison DIRECTE sur
    // `created_at` (indexable) au lieu de `substr(created_at,1,10)` (qui
    // interdisait tout index ⇒ parcours de table à chaque appel).
    conds.push(`created_at >= ?`);
    params.push(`${f.from}T00:00:00.000Z`);
  }
  if (f.to) {
    // Borne haute EXCLUSIVE : jour suivant inclus (le jour `to` entier
    // reste dans la fenêtre).
    conds.push(`created_at < ?`);
    params.push(`${nextDay(f.to)}T00:00:00.000Z`);
  }
  const q = f.query.trim();
  if (q) {
    conds.push(`(ref LIKE ? ESCAPE '\\' OR label LIKE ? ESCAPE '\\' OR entity_name LIKE ?)`);
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    params.push(like, like, like);
  }
  if (staffUserId != null) {
    conds.push(`actor_id = ?`);
    params.push(staffUserId);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
  const order = orderBy(f.sort);
  return {
    sql: `SELECT ${BASE_COLUMNS} FROM (\n${union}\n) ${where} ORDER BY ${assertOrderClause(order)} LIMIT ? OFFSET ?`,
    countSql: `SELECT COUNT(*) AS c FROM (\n${union}\n) ${where}`,
    params: [...params, f.pageSize, (f.page - 1) * f.pageSize],
    countParams: params,
  };
}
