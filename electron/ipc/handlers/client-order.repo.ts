// Veloria PoS — Main-process repository : commandes clients (ADR-182, tranche C).
//
// Le POS est le SEUL master de la commande (ADR-053). Ce dépôt lit et écrit
// `client_orders` / `client_order_lines` (migration 0063).
//
// Trois règles tenues ici :
//   1. le renderer ne fait jamais foi sur les prix : le main RELIT le prix de
//      vente du produit (une commande reçue par WhatsApp ne porte qu'un nom,
//      un prix est RELU à la création) ;
//   2. l'état est verrouillé par le TRIGGER SQL (migration 0063) ; le dépôt
//      fait une pré-verification pour un message FR précis, le trigger reste
//      l'arbitre final (fail-closed) ;
//   3. toute écriture est dans UNE transaction, avec `operationId` : un rejeu
//      ne crée pas une seconde commande.
//
// Le jumeau de la machine d'états est ici (l'electron ne peut pas importer
// `src/`) ; la parité avec le domaine et avec le trigger est prouvée par
// `tests/unit/client-order-parity.test.ts` et `tests/database/client-orders.test.ts`.

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { businessDayOf } from "../../shared/business-day";
import { MONEY_MAX_TOTAL_MINOR, QUANTITY_MAX } from "../money-guard";
import { claimIdempotency, peekIdempotency, storeIdempotencyResult } from "./idempotency";

/** États d'une commande — jumeau de `src/domain/order/client-order.ts`. */
export const ORDER_STATUSES = ["nouvelle", "preparing", "ready", "served", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Transitions autorisées — jumeau du trigger `trg_client_orders_status_transition`. */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  nouvelle: ["preparing", "ready", "served", "cancelled"],
  preparing: ["ready", "served", "cancelled"],
  ready: ["served", "cancelled"],
  served: [],
  cancelled: [],
};

/** Préfixe des références de commande (séquence `client_order`). */
export const ORDER_REFERENCE_PREFIX = "CMD";

/** Format de référence `CMD-AAAA-NNNNNN` (jumeau du domaine). */
export function formatOrderReference(prefix: string, year: number, nextValue: number): string {
  const clean = prefix.trim() || ORDER_REFERENCE_PREFIX;
  if (!Number.isInteger(nextValue) || nextValue <= 0) {
    throw new Error("Compteur de commande invalide.");
  }
  return `${clean}-${year}-${String(nextValue).padStart(5, "0")}`;
}

/** Une transition est-elle autorisée ? (jumeau du domaine) */
export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  return ORDER_TRANSITIONS[from].includes(to);
}

export interface ClientOrderLineView {
  id: number;
  productId: number | null;
  productName: string;
  unitCode: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  reservedQuantity: number;
  /**
   * Prix de vente AUJOURD'HUI (relu par le JOIN sur `products`) — `null` si le
   * produit a été supprimé. La commande garde le prix ESTIMÉ du moment de la
   * demande ; la vente encaisse le prix en vigueur. Le commerçant voit l'écart.
   */
  currentPriceMinor: number | null;
  /**
   * Coût d'achat du jour (relu par le même JOIN) : il alimente le snapshot
   * `sale_items.purchase_price_minor` quand l'écran « Commandes » ouvre la
   * caisse. Jamais exposé à l'APK (le coût n'est pas publié).
   */
  currentPurchasePriceMinor: number | null;
}

export interface ClientOrderView {
  id: number;
  reference: string;
  customerId: number;
  customerName: string;
  status: OrderStatus;
  totalMinor: number;
  source: "manual" | "app" | "auto";
  note: string | null;
  cancelReason: string | null;
  saleId: number | null;
  createdAt: string;
  updatedAt: string;
  lines: ClientOrderLineView[];
}

export interface CreateClientOrderInput {
  operationId: string;
  customerId: number;
  /** Lignes demandées : produit + quantité (le PRIX est relu en base). */
  lines: { productId: number; quantity: number }[];
  note?: string | null;
  source?: "manual" | "app" | "auto";
  now: string;
}

/** Arrondi demi-écart (même règle que `multiplyMinorByQuantity`). */
function multiplyMinorByQuantity(unitPriceMinor: number, quantity: number): number {
  return Math.round(unitPriceMinor * quantity);
}

/** Alloue la référence DANS la transaction (compteur `number_sequences`). */
function allocateOrderReference(now: string): string {
  const db = getDb();
  const row = db
    .prepare(`SELECT prefix, next_value FROM number_sequences WHERE sequence_key = 'client_order'`)
    .get() as { prefix: string; next_value: number } | undefined;
  if (!row) throw new Error("Séquence de commande introuvable.");
  // Année du JOUR MÉTIER (Africa/Algiers), comme les factures (E-35).
  const year = Number(businessDayOf(now).slice(0, 4)) || new Date().getFullYear();
  const reference = formatOrderReference(row.prefix, year, row.next_value);
  db.prepare(
    `UPDATE number_sequences SET next_value = next_value + 1, updated_at = ? WHERE sequence_key = 'client_order'`,
  ).run(now);
  return reference;
}

/**
 * Crée une commande (transaction unique).
 *
 * Le prix de chaque ligne est RELU dans `products` : la commande captée par
 * WhatsApp ne fait foi que pour le PRODUIT et la QUANTITÉ. Si le prix a
 * changé depuis, c'est le prix du jour qui s'applique — c'est aussi ce que
 * la vente encaissée appliquera.
 */
export function createClientOrderAtomic(input: CreateClientOrderInput): {
  id: number;
  reference: string;
  totalMinor: number;
  lineCount: number;
} {
  const replay = peekIdempotency<{
    id: number;
    reference: string;
    totalMinor: number;
    lineCount: number;
  }>(input.operationId, "orders.create");
  if (replay) return replay;

  const db = getDb();
  if (input.lines.length === 0) throw new Error("Commande vide : ajoutez au moins un produit.");
  if (input.lines.length > 200) {
    throw new Error("Trop de lignes pour une commande (200 maximum).");
  }

  const tx = db.transaction(() => {
    claimIdempotency(input.operationId, "orders.create", input.now);
    // Client : il doit exister et ne pas être archivé (une commande orpheline
    // ne peut pas être livrée ni rattachée à une dette).
    const customer = db
      .prepare(`SELECT id, first_name, last_name, deleted_at FROM customers WHERE id = ?`)
      .get(input.customerId) as
      { id: number; first_name: string; last_name: string; deleted_at: string | null } | undefined;
    if (!customer) throw new Error("Client introuvable.");
    if (customer.deleted_at != null) throw new Error("Client archivé : commande impossible.");

    // Produits + prix RELUS (le renderer ne fait jamais foi).
    const ids = [...new Set(input.lines.map((l) => l.productId))];
    const placeholders = ids.map(() => "?").join(", ");
    const products = db
      .prepare(
        `SELECT id, name, unit_code, selling_price_minor, is_active, deleted_at
         FROM products WHERE id IN (${placeholders})`,
      )
      .all(...ids) as {
      id: number;
      name: string;
      unit_code: string;
      selling_price_minor: number;
      is_active: number;
      deleted_at: string | null;
    }[];
    const byId = new Map(products.map((p) => [Number(p.id), p]));

    const lines = input.lines.map((line) => {
      const product = byId.get(line.productId);
      if (!product) throw new Error("Produit introuvable dans la commande.");
      if (Number(product.is_active) !== 1 || product.deleted_at != null) {
        throw new Error(`« ${product.name} » n'est plus proposé à la vente.`);
      }
      const price = Number(product.selling_price_minor);
      if (!Number.isInteger(price) || price <= 0) {
        throw new Error(`« ${product.name} » n'a pas de prix de vente valide.`);
      }
      const quantity = Number(line.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > QUANTITY_MAX) {
        throw new Error(`Quantité invalide pour « ${product.name} ».`);
      }
      const lineTotal = multiplyMinorByQuantity(price, quantity);
      if (lineTotal > MONEY_MAX_TOTAL_MINOR) {
        throw new Error(`Montant de ligne trop élevé pour « ${product.name} ».`);
      }
      return {
        productId: Number(product.id),
        productName: product.name,
        unitCode: product.unit_code,
        quantity,
        unitPriceMinor: price,
        lineTotalMinor: lineTotal,
      };
    });

    const totalMinor = lines.reduce((sum, l) => sum + l.lineTotalMinor, 0);
    if (totalMinor > MONEY_MAX_TOTAL_MINOR) {
      throw new Error("Total de commande trop élevé.");
    }

    const reference = allocateOrderReference(input.now);
    const inserted = db
      .prepare(
        `INSERT INTO client_orders (uuid, reference, customer_id, status, total_minor, source, note, created_at, updated_at, operation_id)
         VALUES (?, ?, ?, 'nouvelle', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        reference,
        input.customerId,
        totalMinor,
        input.source ?? "manual",
        input.note ?? null,
        input.now,
        input.now,
        input.operationId,
      );
    const orderId = Number(inserted.lastInsertRowid);
    const insertLine = db.prepare(
      `INSERT INTO client_order_lines (order_id, product_id, product_name_snapshot, unit_code, quantity, unit_price_minor, line_total_minor, reserved_quantity, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const line of lines) {
      insertLine.run(
        orderId,
        line.productId,
        line.productName,
        line.unitCode,
        line.quantity,
        line.unitPriceMinor,
        line.lineTotalMinor,
        line.quantity,
        input.now,
      );
    }
    const result = {
      id: orderId,
      reference,
      totalMinor,
      lineCount: lines.length,
    };
    storeIdempotencyResult(input.operationId, result);
    return result;
  });

  try {
    return tx();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{
        id: number;
        reference: string;
        totalMinor: number;
        lineCount: number;
      }>(input.operationId, "orders.create");
      if (retry) return retry;
    }
    throw err;
  }
}

/** Liste des commandes (file du commerçant), du plus récent au plus ancien. */
export function listClientOrders(filter?: {
  status?: OrderStatus | null;
  customerId?: number | null;
  limit?: number;
}): ClientOrderView[] {
  const db = getDb();
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter?.status) {
    where.push("o.status = ?");
    params.push(filter.status);
  }
  if (filter?.customerId != null) {
    where.push("o.customer_id = ?");
    params.push(filter.customerId);
  }
  const limit = Math.min(Math.max(filter?.limit ?? 100, 1), 500);
  const rows = db
    .prepare(
      `SELECT o.id, o.reference, o.customer_id, c.first_name, c.last_name, o.status,
              o.total_minor, o.source, o.note, o.cancel_reason, o.sale_id,
              o.created_at, o.updated_at
       FROM client_orders o
       JOIN customers c ON c.id = o.customer_id
       ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT ?`,
    )
    .all(...params, limit) as {
    id: number;
    reference: string;
    customer_id: number;
    first_name: string;
    last_name: string;
    status: string;
    total_minor: number;
    source: string;
    note: string | null;
    cancel_reason: string | null;
    sale_id: number | null;
    created_at: string;
    updated_at: string;
  }[];
  return rows.map((r) => ({
    id: Number(r.id),
    reference: r.reference,
    customerId: Number(r.customer_id),
    customerName: `${r.first_name} ${r.last_name}`.trim(),
    status: r.status as OrderStatus,
    totalMinor: Number(r.total_minor),
    source: r.source as "manual" | "app" | "auto",
    note: r.note,
    cancelReason: r.cancel_reason,
    saleId: r.sale_id == null ? null : Number(r.sale_id),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lines: listClientOrderLines(Number(r.id)),
  }));
}

/** Lignes d'une commande (prix du jour relu par jointure). */
export function listClientOrderLines(orderId: number): ClientOrderLineView[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT l.id, l.product_id, l.product_name_snapshot, l.unit_code, l.quantity,
              l.unit_price_minor, l.line_total_minor, l.reserved_quantity,
              p.selling_price_minor AS current_price_minor,
              p.purchase_price_minor AS current_purchase_price_minor
       FROM client_order_lines l
       LEFT JOIN products p ON p.id = l.product_id
       WHERE l.order_id = ? ORDER BY l.id ASC`,
    )
    .all(orderId) as {
    id: number;
    product_id: number | null;
    product_name_snapshot: string;
    unit_code: string;
    quantity: number;
    unit_price_minor: number;
    line_total_minor: number;
    reserved_quantity: number;
    current_price_minor: number | null;
    current_purchase_price_minor: number | null;
  }[];
  return rows.map((r) => ({
    id: Number(r.id),
    productId: r.product_id == null ? null : Number(r.product_id),
    productName: r.product_name_snapshot,
    unitCode: r.unit_code,
    quantity: Number(r.quantity),
    unitPriceMinor: Number(r.unit_price_minor),
    lineTotalMinor: Number(r.line_total_minor),
    reservedQuantity: Number(r.reserved_quantity),
    currentPriceMinor: r.current_price_minor == null ? null : Number(r.current_price_minor),
    currentPurchasePriceMinor:
      r.current_purchase_price_minor == null ? null : Number(r.current_purchase_price_minor),
  }));
}

/** Une commande + ses lignes (null = introuvable). */
export function getClientOrder(orderId: number): ClientOrderView | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT o.id, o.reference, o.customer_id, c.first_name, c.last_name, o.status,
              o.total_minor, o.source, o.note, o.cancel_reason, o.sale_id,
              o.created_at, o.updated_at
       FROM client_orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.id = ?`,
    )
    .get(orderId) as
    | {
        id: number;
        reference: string;
        customer_id: number;
        first_name: string;
        last_name: string;
        status: string;
        total_minor: number;
        source: string;
        note: string | null;
        cancel_reason: string | null;
        sale_id: number | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    id: Number(row.id),
    reference: row.reference,
    customerId: Number(row.customer_id),
    customerName: `${row.first_name} ${row.last_name}`.trim(),
    status: row.status as OrderStatus,
    totalMinor: Number(row.total_minor),
    source: row.source as "manual" | "app" | "auto",
    note: row.note,
    cancelReason: row.cancel_reason,
    saleId: row.sale_id == null ? null : Number(row.sale_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lines: listClientOrderLines(Number(row.id)),
  };
}

/**
 * Change l'état d'une commande (transaction unique, `operationId`).
 * Le TRIGGER SQL reste l'arbitre final : la pré-verification ne sert qu'à
 * donner un message FR précis.
 */
export function setClientOrderStatusAtomic(args: {
  orderId: number;
  status: OrderStatus;
  cancelReason?: string | null;
  operationId: string;
  now: string;
}): { id: number; status: OrderStatus } {
  const replay = peekIdempotency<{ id: number; status: OrderStatus }>(
    args.operationId,
    "orders.setStatus",
  );
  if (replay) return replay;
  const db = getDb();
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "orders.setStatus", args.now);
    const row = db
      .prepare(`SELECT id, status FROM client_orders WHERE id = ?`)
      .get(args.orderId) as { id: number; status: string } | undefined;
    if (!row) throw new Error("Commande introuvable.");
    const from = row.status as OrderStatus;
    if (!canTransitionOrder(from, args.status)) {
      throw new Error(
        from === "served"
          ? "Commande déjà livrée : elle ne peut plus changer d'état."
          : from === "cancelled"
            ? "Commande annulée : elle ne peut plus changer d'état."
            : "Transition de commande impossible.",
      );
    }
    if (args.status === "cancelled" && !(args.cancelReason ?? "").trim()) {
      throw new Error("Indiquez pourquoi la commande est annulée.");
    }
    if (args.status === "served") {
      throw new Error(
        "Une commande est livrée par la vente encaissée : encaissez la vente pour la lier.",
      );
    }
    db.prepare(
      `UPDATE client_orders SET status = ?, cancel_reason = ?, updated_at = ? WHERE id = ?`,
    ).run(
      args.status,
      args.status === "cancelled" ? (args.cancelReason ?? "").trim() : null,
      args.now,
      args.orderId,
    );
    const result = { id: args.orderId, status: args.status };
    storeIdempotencyResult(args.operationId, result);
    return result;
  });
  try {
    return tx();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ id: number; status: OrderStatus }>(
        args.operationId,
        "orders.setStatus",
      );
      if (retry) return retry;
    }
    throw err;
  }
}

/**
 * Lie une commande à la vente encaissée — APPELÉ DANS LA TRANSACTION DE LA
 * VENTE (jamais seul) : la commande et la vente naissent ou meurent
 * ensemble. La vente porte le vrai montant ; la commande garde son total
 * estimé (c'est l'historique de la demande).
 */
export function linkClientOrderToSaleInTransaction(args: {
  orderId: number;
  saleId: number;
  customerId: number | null;
  now: string;
}): void {
  const db = getDb();
  const row = db
    .prepare(`SELECT id, customer_id, status, sale_id FROM client_orders WHERE id = ?`)
    .get(args.orderId) as
    { id: number; customer_id: number; status: string; sale_id: number | null } | undefined;
  if (!row) throw new Error("Commande introuvable.");
  if (row.customer_id !== args.customerId) {
    throw new Error("La commande n'appartient pas à ce client.");
  }
  if (row.sale_id != null) {
    // Déjà liée : le rejeu ne doit pas changer l'historique.
    if (row.sale_id === args.saleId) return;
    throw new Error("Commande déjà liée à une autre vente.");
  }
  db.prepare(
    `UPDATE client_orders SET status = 'served', sale_id = ?, updated_at = ? WHERE id = ?`,
  ).run(args.saleId, args.now, args.orderId);
}
