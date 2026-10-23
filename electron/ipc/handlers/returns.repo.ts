// Veloria PoS — Main-process repository: retours clients + fournisseurs.
// Création (lignes + stock + soldes + audit = 1 tx), remboursements
// complémentaires, annulation gardée (retour vierge uniquement).

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { claimIdempotency, peekIdempotency, storeIdempotencyResult } from "./idempotency";
import { assertOrderClause } from "./sql-guard";
import { debtStatusSql } from "./debt-status";
import {
  consumptionsOfSale,
  consumeLayers,
  createLayer,
  deductIntakeLayers,
  restoreToLayers,
} from "./fifo";

export interface ReturnItemInput {
  productId: number | null;
  quantity: number;
  restocked: boolean;
  condition: "good" | "defective";
}

export type ReturnKind = "customer" | "supplier";
export type ReturnStatusFilter =
  | "all"
  | "validated"
  | "partially_refunded"
  | "refunded"
  | "cancelled";
export type ReturnTypeFilter = "all" | "customer" | "supplier";
export type ReturnSort = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

const txt = (v: unknown): string => (typeof v === "string" ? v : "");

function returnStatus(total: number, settled: number): string {
  if (total > 0 && settled >= total) return "refunded";
  if (settled > 0) return "partially_refunded";
  return "validated";
}

/**
 * Plan de restauration FIFO d'un retour client : on rend aux couches d'origine
 * (les plus anciennes consommées d'abord). `remainder` = part sans traçabilité
 * (ventes antérieures à FIFO) → nouvelle couche au coût snapshot de la vente.
 */
function planRestore(
  consumptions: { layerId: number | null; quantity: number; unitCostMinor: number }[],
  qty: number,
  skipQty = 0,
): { slices: { layerId: number; quantity: number; unitCostMinor: number }[]; remainder: number } {
  // DB-08: skipQty = quantité déjà planifiée pour ce produit dans CETTE
  // transaction (2 lignes même produit) — jamais de double-restauration.
  const slices: { layerId: number; quantity: number; unitCostMinor: number }[] = [];
  let skipTh = Math.round(skipQty * 1000);
  let needTh = Math.round(qty * 1000);
  for (const c of consumptions) {
    let availTh = Math.round(Number(c.quantity) * 1000);
    if (c.layerId == null) continue;
    if (skipTh > 0) {
      const skip = Math.min(skipTh, availTh);
      availTh -= skip;
      skipTh -= skip;
      if (availTh <= 0) continue;
    }
    if (needTh <= 0) break;
    const takeTh = Math.min(needTh, availTh);
    if (takeTh > 0) {
      slices.push({
        layerId: c.layerId,
        quantity: takeTh / 1000,
        unitCostMinor: Number(c.unitCostMinor),
      });
      needTh -= takeTh;
    }
  }
  return { slices, remainder: needTh / 1000 };
}

/**
 * Alloue un numéro de retour AVANT l'INSERT depuis number_sequences
 * (0024, clés return_customer/RET-C et return_supplier/RET-S) — comme les
 * factures (sale_invoice). Appelée DANS la transaction créatrice : pas de
 * sous-transaction, SELECT + UPDATE atomiques avec le reste.
 */
export function allocateReturnNumber(kind: ReturnKind, now: string): string {
  const db = getDb();
  const key = kind === "supplier" ? "return_supplier" : "return_customer";
  const row = db
    .prepare(`SELECT prefix, next_value FROM number_sequences WHERE sequence_key = ?`)
    .get(key) as { prefix: string; next_value: number } | undefined;
  if (!row) throw new Error("Séquence de numérotation introuvable.");
  const p = row.prefix || (kind === "supplier" ? "RET-S" : "RET-C");
  const number = `${p}-${String(row.next_value).padStart(5, "0")}`;
  db.prepare(
    `UPDATE number_sequences SET next_value = next_value + 1, updated_at = ? WHERE sequence_key = ?`,
  ).run(now, key);
  return number;
}

function bumpReturnSequence(kind: ReturnKind, now: string): void {
  const db = getDb();
  const key = kind === "supplier" ? "return_supplier" : "return_customer";
  try {
    db.prepare(
      `UPDATE number_sequences SET next_value = next_value + 1, updated_at = ? WHERE sequence_key = ?`,
    ).run(now, key);
  } catch {
    /* avancement best-effort */
  }
}

export interface CustomerReturnResult {
  id: number;
  number: string;
  totalReturnMinor: number;
  /**
   * Excédent d'avoir : l'avoir demandé dépasse le solde dû par le client
   * (trigger 0023 : le solde ne peut pas devenir négatif) ⇒ ce reliquat est
   * un CRÉDIT CLIENT en cours, porté par le retour (credit_to_customer_minor).
   */
  creditExcessMinor: number;
}

export interface ReturnResult {
  id: number;
  number: string;
  totalReturnMinor: number;
}

export function createReturnAtomic(args: {
  operationId: string;
  originalSaleId: number;
  items: ReturnItemInput[];
  refundMinor: number;
  creditMinor: number;
  refundMethod: string | null;
  reason: string;
  notes: string | null;
  createdAt: string;
  now: string;
  /** Auteur du retour (session main, 0046). */
  staffUserId?: number | null;
}): CustomerReturnResult {
  const db = getDb();
  const fast = peekIdempotency<CustomerReturnResult>(args.operationId, "returns.create");
  if (fast) return fast;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "returns.create", args.now);
    const sale = db.prepare(`SELECT * FROM sales WHERE id = ?`).get(args.originalSaleId) as
      | {
          invoice_number: string;
          customer_id: number | null;
          total_minor: number;
          amount_paid_minor: number;
          remaining_balance_minor: number;
        }
      | undefined;
    if (!sale) throw new Error("Vente d'origine introuvable.");
    let totalReturn = 0;
    // DB-04/DB-08: cumul demandé par produit DANS cette requête (2 lignes même
    // produit) + cumul déjà planifié pour la restauration — jamais 2× les
    // mêmes couches, éligibilité sur le TOTAL vendu (SUM, pas LIMIT 1).
    const requestedByProduct = new Map<string, number>();
    const plannedRestoreByProduct = new Map<string, number>();
    const keyOf = (pid: number | null): string => (pid == null ? "null" : `p${pid}`);
    const prepared: {
      productId: number | null;
      name: string;
      qty: number;
      unitPrice: number;
      purchase: number;
      restocked: boolean;
      condition: string;
      lineTotal: number;
    }[] = [];
    for (const item of args.items) {
      // Total vendu agrégé sur TOUTES les lignes (doublons autorisés en schéma).
      const soldAgg = db
        .prepare(
          `SELECT COALESCE(SUM(quantity),0) AS qty, MIN(product_name_snapshot) AS pname FROM sale_items WHERE sale_id = ? AND (product_id IS ? OR product_id = ?)`,
        )
        .get(args.originalSaleId, item.productId, item.productId) as
        | { qty: number; pname: string | null }
        | undefined;
      const soldQty = Number(soldAgg?.qty ?? 0);
      if (!(soldQty > 0)) throw new Error("Ligne de vente introuvable pour ce retour.");
      // Prix/coût de référence : première ligne (valeur documentée ; l'UI
      // fusionne même produit+prix donc cas nominal non ambigu).
      const sold = db
        .prepare(
          `SELECT product_id, product_name_snapshot, unit_price_minor, purchase_price_minor, quantity FROM sale_items WHERE sale_id = ? AND (product_id IS ? OR product_id = ?) ORDER BY id ASC LIMIT 1`,
        )
        .get(args.originalSaleId, item.productId, item.productId) as
        | {
            product_id: number | null;
            product_name_snapshot: string;
            unit_price_minor: number;
            purchase_price_minor: number;
            quantity: number;
          }
        | undefined;
      if (!sold) throw new Error("Ligne de vente introuvable pour ce retour.");
      const already = (
        db
          .prepare(
            `SELECT COALESCE(SUM(ri.quantity),0) AS q FROM return_items ri JOIN returns r ON r.id = ri.return_id WHERE r.original_sale_id = ? AND r.status != 'cancelled' AND (ri.product_id IS ? OR ri.product_id = ?)`,
          )
          .get(args.originalSaleId, item.productId, item.productId) as { q: number }
      ).q;
      // Éligible sur le TOTAL (SUM) moins déjà-retourné moins déjà-demandé
      // dans cette requête (2 lignes même produit).
      const inRequest = requestedByProduct.get(keyOf(item.productId)) ?? 0;
      const eligible = Number(soldQty) - Number(already) - inRequest;
      if (!(item.quantity > 0)) throw new Error("Quantité retournée invalide.");
      if (item.quantity > eligible) {
        throw new Error(
          `Quantité retournée supérieure à l'éligible (${eligible}) pour « ${sold.product_name_snapshot} ».`,
        );
      }
      requestedByProduct.set(keyOf(item.productId), inRequest + item.quantity);
      if (
        !Number.isSafeInteger(sold.unit_price_minor) ||
        sold.unit_price_minor < 0 ||
        sold.unit_price_minor > 1_000_000_000
      )
        throw new Error("Prix unitaire invalide.");
      const lineTotal = Math.round(sold.unit_price_minor * item.quantity);
      if (!Number.isSafeInteger(lineTotal) || lineTotal < 0 || lineTotal > 100_000_000_000)
        throw new Error("Montant de ligne invalide.");
      totalReturn += lineTotal;
      prepared.push({
        productId: sold.product_id,
        name: sold.product_name_snapshot,
        qty: item.quantity,
        unitPrice: sold.unit_price_minor,
        purchase: sold.purchase_price_minor,
        restocked: item.restocked,
        condition: item.condition,
        lineTotal,
      });
    }
    if (prepared.length === 0) throw new Error("Aucune ligne à retourner.");
    if (args.refundMinor + args.creditMinor > totalReturn) {
      throw new Error("Remboursement + avoir supérieurs à la valeur du retour.");
    }
    // Un avoir sans client (vente au passage) serait silencieusement perdu :
    // refus explicite (l'avoir réduit la dette d'un client identifié).
    if (args.creditMinor > 0 && sale.customer_id == null) {
      throw new Error("Avoir impossible : la vente d'origine est au passage (sans client).");
    }
    if (args.refundMinor > 0 && args.refundMethod == null) {
      throw new Error("Moyen de remboursement requis.");
    }
    // P0/0024: numéro pré-alloué AVANT l'INSERT (séquence) — l'INSERT
    // porte return_number (jamais NULL), plus de UPDATE post-INSERT.
    const number = allocateReturnNumber("customer", args.now);
    const r = db
      .prepare(
        `INSERT INTO returns (uuid, return_number, original_sale_id, original_invoice_number, customer_id, total_return_value_minor, amount_refunded_minor, credit_to_customer_minor, refund_method, reason, notes, status, staff_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        number,
        args.originalSaleId,
        sale.invoice_number,
        sale.customer_id,
        totalReturn,
        args.refundMinor,
        args.creditMinor,
        args.refundMethod,
        args.reason || null,
        args.notes?.trim() || null,
        returnStatus(totalReturn, args.refundMinor + args.creditMinor),
        args.staffUserId ?? null,
        args.createdAt,
        args.now,
      );
    const returnId = Number(r.lastInsertRowid);
    // W8 (J-01/N14) : les consommations FIFO de la vente d'origine sont
    // lues UNE SEULE FOIS (avant la boucle) — la lecture était dans la
    // boucle ⇒ une requête par ligne de retour (N+1).
    const saleConsumptions = consumptionsOfSale(args.originalSaleId);
    for (const p of prepared) {
      let before: number | null = null;
      let after: number | null = null;
      // FIFO : la quantité réintégrée retourne dans ses couches d'origine
      // (coût d'origine préservé, jamais un coût d'achat récent arbitraire).
      let restoredUnit = p.purchase;
      if (p.restocked && p.productId != null) {
        const prod = db.prepare(`SELECT quantity FROM products WHERE id = ?`).get(p.productId) as {
          quantity: number;
        };
        before = Number(prod.quantity);
        after = before + p.qty;
        db.prepare(
          `UPDATE products SET quantity = ?, stock_status = CASE WHEN ? <= 0 THEN 'out_of_stock' WHEN ? <= min_stock_level THEN 'low_stock' ELSE 'in_stock' END, updated_at = ? WHERE id = ?`,
        ).run(after, after, after, args.now, p.productId);
        const plan = planRestore(
          saleConsumptions.filter((c) => c.productId === p.productId),
          p.qty,
          plannedRestoreByProduct.get(keyOf(p.productId)) ?? 0,
        );
        plannedRestoreByProduct.set(
          keyOf(p.productId),
          (plannedRestoreByProduct.get(keyOf(p.productId)) ?? 0) + p.qty,
        );
        restoreToLayers(plan.slices.map((s) => ({ layerId: s.layerId, quantity: s.quantity })));
        let cost = plan.slices.reduce(
          (a, s) => a + Math.round(Number(s.unitCostMinor) * Number(s.quantity)),
          0,
        );
        if (plan.remainder > 0) {
          // Vente antérieure à FIFO : couche de restauration au coût snapshot.
          createLayer({
            productId: p.productId,
            qty: plan.remainder,
            unitCostMinor: Math.max(0, Math.round(p.purchase)),
            reason: "return_restore",
            now: args.now,
          });
          cost += Math.round(p.purchase * plan.remainder);
        }
        restoredUnit = p.qty > 0 ? Math.round(cost / p.qty) : Math.round(p.purchase);
        db.prepare(
          `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, unit_cost_minor, related_entity_type, related_entity_id, reason, reference, staff_user_id, created_at)
           VALUES (?, ?, 'return_in', ?, ?, ?, 'return', ?, 'Retour client', ?, ?, ?)`,
        ).run(
          randomUUID(),
          p.productId,
          p.qty,
          after,
          restoredUnit,
          String(returnId),
          number,
          args.staffUserId ?? null,
          args.now,
        );
      }
      db.prepare(
        `INSERT INTO return_items (return_id, product_id, product_name_snapshot, quantity, unit_price_minor, purchase_price_minor, restocked, condition, stock_before, stock_after, line_total_minor)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        returnId,
        p.productId,
        p.name,
        p.qty,
        p.unitPrice,
        p.purchase,
        p.restocked ? 1 : 0,
        p.condition,
        before,
        after,
        p.lineTotal,
      );
    }
    // AVOIR : le solde du client ne peut pas devenir négatif (trigger 0023
    // `trg_customers_outstanding_nonneg` → ABORT + message technique brut).
    // L'avoir demandé est plafonné au solde réellement dû ; lExcédent reste un
    // CRÉDIT CLIENT (avoir en cours) porté par le retour lui-même
    // (`returns.credit_to_customer_minor`), tracé dans l'audit.
    // SOURCE DE VÉRITÉ (E-24) : le retour réduit AUSSI le sien de vente
    // (`sales.remaining_balance_minor`) ⇒ le solde du compte et le reste des
    // documents ne peuvent plus diverger (UI : « Dette actuelle » vs
    // « Reste des documents »).
    let creditExcessMinor = 0;
    if (args.creditMinor > 0 && sale.customer_id != null) {
      const cust = db
        .prepare(`SELECT outstanding_balance_minor FROM customers WHERE id = ?`)
        .get(sale.customer_id) as { outstanding_balance_minor: number } | undefined;
      const outstanding = Number(cust?.outstanding_balance_minor ?? 0);
      const applied = Math.min(args.creditMinor, Math.max(0, outstanding));
      creditExcessMinor = args.creditMinor - applied;
      // Le sien de vente porte le reste à payer APRÈS avoir : même source de
      // vérité que le compte client (sinon deux chiffres pour un même client).
      // L'avoir vaut encaissement pour le sien : `amount_paid_minor` augmente,
      // `remaining_balance_minor` baisse (CHECK 0001:152 respecté).
      const saleRest = Number(sale.remaining_balance_minor);
      if (saleRest > 0) {
        const appliedOnSale = Math.min(applied, saleRest);
        const paid = Number(sale.amount_paid_minor);
        const total = Number(sale.total_minor);
        const newPaid = paid + appliedOnSale;
        const newRest = total - newPaid;
        const newStatus = newRest <= 0 ? "paid" : newPaid > 0 ? "partial" : "unpaid";
        db.prepare(
          `UPDATE sales SET amount_paid_minor = ?, remaining_balance_minor = ?, payment_status = ?, updated_at = ? WHERE id = ?`,
        ).run(newPaid, newRest, newStatus, args.now, args.originalSaleId);
      }
      if (applied > 0) {
        // E-30 : le statut du client est recalculé APRÈS le mouvement de la
        // vente (le statut « en retard » dépend du reste dû de la vente :
        // il doit être lu dans l'état FINAL de la transaction).
        db.prepare(
          `UPDATE customers SET outstanding_balance_minor = outstanding_balance_minor - ?,
            debt_status = ${debtStatusSql("outstanding_balance_minor - ?", "id")},
            is_over_limit = CASE WHEN credit_limit_minor > 0 AND outstanding_balance_minor - ? > credit_limit_minor THEN 1 ELSE 0 END,
            updated_at = ? WHERE id = ?`,
        ).run(applied, applied, applied, applied, args.now, sale.customer_id);
      }
    }
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at, actor_user_id) VALUES (?, 'return.created', 'return', ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(returnId),
      args.operationId,
      JSON.stringify({
        sale: args.originalSaleId,
        total: totalReturn,
        refunded: args.refundMinor,
        credit: args.creditMinor,
        // Excédent d'avoir : crédit client en cours (le solde ne peut pas
        // devenir négatif — trigger 0023).
        creditExcess: creditExcessMinor,
      }),
      args.now,
      args.staffUserId ?? null,
    );
    const result = {
      id: returnId,
      number,
      totalReturnMinor: totalReturn,
      // > 0 : l'avoir dépasse le solde du client ⇒ crédit restant à imputer.
      creditExcessMinor,
    };
    storeIdempotencyResult(args.operationId, result);
    return result;
  });
  try {
    return (tx as unknown as () => CustomerReturnResult)();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<CustomerReturnResult>(args.operationId, "returns.create");
      if (retry) return retry;
    }
    // Course sur le numéro (deux retours concurrents) : la séquence a été
    // annulée avec la transaction, on l'avance une fois en autocommit puis on
    // rejoue une seule fois (miroir des factures).
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: returns\.return_number/i.test(err.message)
    ) {
      bumpReturnSequence("customer", args.now);
      try {
        return (tx as unknown as () => CustomerReturnResult)();
      } catch (retryErr) {
        if (
          retryErr instanceof Error &&
          /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(retryErr.message)
        ) {
          const retry = peekIdempotency<CustomerReturnResult>(args.operationId, "returns.create");
          if (retry) return retry;
        }
        throw retryErr;
      }
    }
    throw err;
  }
}

export interface SupplierReturnItemInput {
  productId: number | null;
  quantity: number;
  condition: "good" | "defective";
}

export function createSupplierReturnAtomic(args: {
  operationId: string;
  intakeId: number;
  items: SupplierReturnItemInput[];
  recoverMinor: number;
  recoverMethod: string | null;
  reason: string;
  notes: string | null;
  createdAt: string;
  now: string;
}): ReturnResult {
  const db = getDb();
  const fast = peekIdempotency<ReturnResult>(args.operationId, "returns.create_supplier");
  if (fast) return fast;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "returns.create_supplier", args.now);
    const intake = db.prepare(`SELECT * FROM stock_intakes WHERE id = ?`).get(args.intakeId) as
      | { invoice_number: string | null; supplier_id: number | null; status: string }
      | undefined;
    if (!intake) throw new Error("Bon d'achat d'origine introuvable.");
    if (intake.status === "cancelled") throw new Error("Bon d'achat annulé : retour impossible.");
    let totalReturn = 0;
    // FIX-P1-01 : cumul demandé par produit DANS cette requête (miroir du
    // retour client : 2 lignes même produit ne doivent pas dépasser l'éligible).
    const requestedByProduct = new Map<string, number>();
    const keyOf = (pid: number | null): string => (pid == null ? "null" : `p${pid}`);
    const prepared: {
      productId: number | null;
      name: string;
      qty: number;
      unitPrice: number;
      purchase: number;
      condition: string;
      lineTotal: number;
    }[] = [];
    for (const item of args.items) {
      const bought = db
        .prepare(
          `SELECT product_id, product_name_snapshot, purchase_price_minor, quantity_received FROM stock_intake_items WHERE stock_intake_id = ? AND (product_id IS ? OR product_id = ?) LIMIT 1`,
        )
        .get(args.intakeId, item.productId, item.productId) as
        | {
            product_id: number | null;
            product_name_snapshot: string;
            purchase_price_minor: number;
            quantity_received: number;
          }
        | undefined;
      if (!bought) throw new Error("Ligne d'achat introuvable pour ce retour.");
      const already = (
        db
          .prepare(
            `SELECT COALESCE(SUM(sri.quantity),0) AS q FROM supplier_return_items sri JOIN supplier_returns sr ON sr.id = sri.supplier_return_id WHERE sr.stock_intake_id = ? AND sr.status != 'cancelled' AND (sri.product_id IS ? OR sri.product_id = ?)`,
          )
          .get(args.intakeId, item.productId, item.productId) as { q: number }
      ).q;
      const eligible =
        Number(bought.quantity_received) -
        Number(already) -
        (requestedByProduct.get(keyOf(item.productId)) ?? 0);
      if (!(item.quantity > 0)) throw new Error("Quantité retournée invalide.");
      if (item.quantity > eligible) {
        throw new Error(
          `Quantité retournée supérieure à l'éligible (${eligible}) pour « ${bought.product_name_snapshot} ».`,
        );
      }
      requestedByProduct.set(
        keyOf(item.productId),
        (requestedByProduct.get(keyOf(item.productId)) ?? 0) + item.quantity,
      );
      const lineTotal = (() => {
        if (
          !Number.isSafeInteger(bought.purchase_price_minor) ||
          bought.purchase_price_minor < 0 ||
          bought.purchase_price_minor > 1_000_000_000
        )
          throw new Error("Prix d'achat invalide.");
        const out = Math.round(bought.purchase_price_minor * item.quantity);
        if (!Number.isSafeInteger(out) || out < 0 || out > 100_000_000_000)
          throw new Error("Montant de ligne invalide.");
        return out;
      })();
      totalReturn += lineTotal;
      prepared.push({
        productId: bought.product_id,
        name: bought.product_name_snapshot,
        qty: item.quantity,
        unitPrice: bought.purchase_price_minor,
        purchase: bought.purchase_price_minor,
        condition: item.condition,
        lineTotal,
      });
    }
    if (prepared.length === 0) throw new Error("Aucune ligne à retourner.");
    if (args.recoverMinor > totalReturn) {
      throw new Error("Montant récupéré supérieur à la valeur du retour.");
    }
    if (args.recoverMinor > 0 && args.recoverMethod == null) {
      throw new Error("Moyen de récupération requis.");
    }
    // P0/0024: numéro pré-alloué AVANT l'INSERT (séquence).
    const number = allocateReturnNumber("supplier", args.now);
    const r = db
      .prepare(
        `INSERT INTO supplier_returns (uuid, return_number, stock_intake_id, intake_invoice_number, supplier_id, total_return_value_minor, amount_recovered_minor, recovery_method, reason, notes, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        number,
        args.intakeId,
        intake.invoice_number,
        intake.supplier_id,
        totalReturn,
        args.recoverMinor,
        args.recoverMethod,
        args.reason || null,
        args.notes?.trim() || null,
        returnStatus(totalReturn, args.recoverMinor),
        args.createdAt,
        args.now,
      );
    const returnId = Number(r.lastInsertRowid);
    // DB-09: journal exact des couches débitées (miroir déterministe à l'annulation).
    const layersTrace: {
      productId: number | null;
      deductions: { layerId: number; quantity: number }[];
    }[] = [];
    for (const p of prepared) {
      let before: number | null = null;
      let after: number | null = null;
      if (p.productId != null) {
        const prod = db.prepare(`SELECT quantity FROM products WHERE id = ?`).get(p.productId) as {
          quantity: number;
        };
        before = Number(prod.quantity);
        after = before - p.qty;
        if (after < 0) {
          throw new Error(`Stock insuffisant pour retourner « ${p.name} » (${before} dispo).`);
        }
        // FIFO : la quantité repart des couches de CETTE facture d'achat
        // (jamais d'une couche arbitraire). Refus si déjà vendue/ajustée.
        const deductions = deductIntakeLayers({
          productId: p.productId,
          intakeId: args.intakeId,
          qty: p.qty,
        });
        layersTrace.push({ productId: p.productId, deductions });
        db.prepare(
          `UPDATE products SET quantity = ?, stock_status = CASE WHEN ? <= 0 THEN 'out_of_stock' WHEN ? <= min_stock_level THEN 'low_stock' ELSE 'in_stock' END, updated_at = ? WHERE id = ?`,
        ).run(after, after, after, args.now, p.productId);
        db.prepare(
          `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, unit_cost_minor, related_entity_type, related_entity_id, reason, reference, created_at)
           VALUES (?, ?, 'adjust_out', ?, ?, ?, 'supplier_return', ?, 'Retour fournisseur', ?, ?)`,
        ).run(
          randomUUID(),
          p.productId,
          -p.qty,
          after,
          p.purchase,
          String(returnId),
          number,
          args.now,
        );
      }
      db.prepare(
        `INSERT INTO supplier_return_items (supplier_return_id, product_id, product_name_snapshot, quantity, unit_price_minor, purchase_price_minor, line_total_minor, condition, stock_before, stock_after)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        returnId,
        p.productId,
        p.name,
        p.qty,
        p.unitPrice,
        p.purchase,
        p.lineTotal,
        p.condition,
        before,
        after,
      );
    }
    // La dette envers le fournisseur diminue de la valeur retournée
    // (soustraction exacte : un excédent devient un avoir explicite).
    // DB-09: persiste le journal des couches (colonnes 0023, best-effort sur
    // bases pré-0023 où la colonne peut manquer → catch silencieux + fallback
    // ASC legacy à l'annulation).
    try {
      db.prepare(`UPDATE supplier_returns SET layers_json = ? WHERE id = ?`).run(
        JSON.stringify(layersTrace),
        returnId,
      );
    } catch {
      /* base pré-0023 : annulation par fallback */
    }
    if (intake.supplier_id != null) {
      db.prepare(
        `UPDATE suppliers SET outstanding_balance_minor = outstanding_balance_minor - ? WHERE id = ?`,
      ).run(totalReturn, intake.supplier_id);
    }
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'supplier_return.created', 'supplier_return', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(returnId),
      args.operationId,
      JSON.stringify({ intake: args.intakeId, total: totalReturn }),
      args.now,
    );
    const result = { id: returnId, number, totalReturnMinor: totalReturn };
    storeIdempotencyResult(args.operationId, result);
    return result;
  });
  try {
    return (tx as unknown as () => ReturnResult)();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<ReturnResult>(args.operationId, "returns.create_supplier");
      if (retry) return retry;
    }
    // Course sur le numéro (miroir des retours clients / factures).
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: supplier_returns\.return_number/i.test(err.message)
    ) {
      bumpReturnSequence("supplier", args.now);
      try {
        return (tx as unknown as () => ReturnResult)();
      } catch (retryErr) {
        if (
          retryErr instanceof Error &&
          /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(retryErr.message)
        ) {
          const retry = peekIdempotency<ReturnResult>(args.operationId, "returns.create_supplier");
          if (retry) return retry;
        }
        throw retryErr;
      }
    }
    throw err;
  }
}

export interface ReturnsListOptions {
  typeFilter?: ReturnTypeFilter;
  statusFilter?: ReturnStatusFilter;
  from?: string | null;
  to?: string | null;
  sort?: ReturnSort;
}

/** Liste unifiée retours clients + fournisseurs (références, parties, soldes). */
export function listReturnsUnified(
  query: string,
  page: number,
  pageSize: number,
  opts: ReturnsListOptions = {},
): { rows: unknown[]; total: number } {
  const db = getDb();
  const type = opts.typeFilter ?? "all";
  const status = opts.statusFilter ?? "all";
  const sort = opts.sort ?? "date_desc";
  const branches: string[] = [];
  if (type === "all" || type === "customer") {
    branches.push(`SELECT 'customer' AS kind, r.id AS entity_id, r.return_number AS number,
      r.created_at AS created_at, r.original_invoice_number AS ref,
      COALESCE(c.search_name, 'Passage') AS party_name,
      r.total_return_value_minor AS total_minor,
      (r.amount_refunded_minor + r.credit_to_customer_minor) AS settled_minor,
      r.status AS status,
      (SELECT COALESCE(SUM(quantity), 0) FROM return_items WHERE return_id = r.id AND restocked = 1) AS stock_qty
    FROM returns r LEFT JOIN customers c ON c.id = r.customer_id`);
  }
  if (type === "all" || type === "supplier") {
    branches.push(`SELECT 'supplier' AS kind, sr.id AS entity_id, sr.return_number AS number,
      sr.created_at AS created_at,
      COALESCE(sr.intake_invoice_number, 'BON-' || printf('%05d', sr.stock_intake_id)) AS ref,
      COALESCE(s.name, '—') AS party_name,
      sr.total_return_value_minor AS total_minor,
      sr.amount_recovered_minor AS settled_minor,
      sr.status AS status,
      (SELECT COALESCE(SUM(quantity), 0) FROM supplier_return_items WHERE supplier_return_id = sr.id) AS stock_qty
    FROM supplier_returns sr LEFT JOIN suppliers s ON s.id = sr.supplier_id`);
  }
  const union = branches.join("\nUNION ALL\n");
  const conds: string[] = [];
  const params: unknown[] = [];
  if (status !== "all") {
    conds.push(`status = ?`);
    params.push(status);
  }
  if (opts.from) {
    conds.push(`substr(created_at, 1, 10) >= ?`);
    params.push(opts.from);
  }
  if (opts.to) {
    conds.push(`substr(created_at, 1, 10) <= ?`);
    params.push(opts.to);
  }
  const q = query.trim();
  if (q) {
    conds.push(`(number LIKE ? ESCAPE '\\' OR ref LIKE ? ESCAPE '\\' OR party_name LIKE ?)`);
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    params.push(like, like, like);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
  const order =
    sort === "date_asc"
      ? `created_at ASC`
      : sort === "amount_desc"
        ? `total_minor DESC, created_at DESC`
        : sort === "amount_asc"
          ? `total_minor ASC, created_at DESC`
          : `created_at DESC`;
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM (\n${union}\n) ${where}`).get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT * FROM (\n${union}\n) ${where} ORDER BY ${assertOrderClause(order)} LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  return { rows, total };
}

export function getReturnsStats(): {
  totalReturns: number;
  customerReturns: number;
  supplierReturns: number;
  totalAmountMinor: number;
} {
  const db = getDb();
  const c = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(total_return_value_minor), 0) AS s FROM returns WHERE status != 'cancelled'`,
    )
    .get() as {
    n: number;
    s: number;
  };
  const s = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(total_return_value_minor), 0) AS s FROM supplier_returns WHERE status != 'cancelled'`,
    )
    .get() as {
    n: number;
    s: number;
  };
  return {
    totalReturns: c.n + s.n,
    customerReturns: c.n,
    supplierReturns: s.n,
    totalAmountMinor: c.s + s.s,
  };
}

export function getReturnableSaleItems(saleId: number): {
  sale: unknown;
  customerName: string | null;
  items: unknown[];
} {
  const db = getDb();
  const sale = db.prepare(`SELECT * FROM sales WHERE id = ?`).get(saleId) as
    | Record<string, unknown>
    | undefined;
  if (!sale) throw new Error("Vente introuvable.");
  if (sale["is_cancelled"] === 1) throw new Error("Vente annulée : retour impossible.");
  const items = db
    .prepare(`SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id`)
    .all(saleId) as Record<string, unknown>[];
  const out = items.map((it) => {
    const already = (
      db
        .prepare(
          `SELECT COALESCE(SUM(ri.quantity),0) AS q FROM return_items ri JOIN returns r ON r.id = ri.return_id WHERE r.original_sale_id = ? AND r.status != 'cancelled' AND (ri.product_id IS ? OR ri.product_id = ?)`,
        )
        .get(saleId, it["product_id"], it["product_id"]) as { q: number }
    ).q;
    const barcodes =
      it["product_id"] != null
        ? (
            db
              .prepare(
                `SELECT barcode FROM product_barcodes WHERE product_id = ? ORDER BY is_primary DESC, id`,
              )
              .all(it["product_id"]) as { barcode: string }[]
          ).map((b) => b.barcode)
        : [];
    const primary = barcodes.length > 0 ? (barcodes[0] ?? null) : null;
    return {
      ...it,
      already_returned: Number(already),
      eligible: Number(it["quantity"]) - Number(already),
      product_primary_barcode: primary,
      product_barcodes: barcodes,
      product_barcode: primary,
      barcode: primary,
      primary_barcode: primary,
      barcodes,
    };
  });
  const cust =
    sale["customer_id"] != null
      ? (db.prepare(`SELECT search_name FROM customers WHERE id = ?`).get(sale["customer_id"]) as
          | { search_name: string }
          | undefined)
      : undefined;
  return { sale, customerName: cust?.search_name ?? null, items: out };
}

export function getReturnableIntakeItems(intakeId: number): {
  intake: unknown;
  supplierName: string | null;
  items: unknown[];
} {
  const db = getDb();
  const intake = db.prepare(`SELECT * FROM stock_intakes WHERE id = ?`).get(intakeId) as
    | Record<string, unknown>
    | undefined;
  if (!intake) throw new Error("Bon d'achat introuvable.");
  if (intake["status"] === "cancelled") throw new Error("Bon d'achat annulé : retour impossible.");
  const items = db
    .prepare(`SELECT * FROM stock_intake_items WHERE stock_intake_id = ? ORDER BY id`)
    .all(intakeId) as Record<string, unknown>[];
  const out = items.map((it) => {
    const already = (
      db
        .prepare(
          `SELECT COALESCE(SUM(sri.quantity),0) AS q FROM supplier_return_items sri JOIN supplier_returns sr ON sr.id = sri.supplier_return_id WHERE sr.stock_intake_id = ? AND sr.status != 'cancelled' AND (sri.product_id IS ? OR sri.product_id = ?)`,
        )
        .get(intakeId, it["product_id"], it["product_id"]) as { q: number }
    ).q;
    const barcodes =
      it["product_id"] != null
        ? (
            db
              .prepare(
                `SELECT barcode FROM product_barcodes WHERE product_id = ? ORDER BY is_primary DESC, id`,
              )
              .all(it["product_id"]) as { barcode: string }[]
          ).map((b) => b.barcode)
        : [];
    const primary = barcodes.length > 0 ? (barcodes[0] ?? null) : null;
    return {
      ...it,
      already_returned: Number(already),
      eligible: Number(it["quantity_received"]) - Number(already),
      product_primary_barcode: primary,
      product_barcodes: barcodes,
      product_barcode: primary,
      barcode: primary,
      primary_barcode: primary,
      barcodes,
    };
  });
  const sup =
    intake["supplier_id"] != null
      ? (db.prepare(`SELECT name FROM suppliers WHERE id = ?`).get(intake["supplier_id"]) as
          | { name: string }
          | undefined)
      : undefined;
  return { intake, supplierName: sup?.name ?? null, items: out };
}

export function getReturnDetail(
  kind: ReturnKind,
  id: number,
): {
  header: unknown;
  items: unknown[];
  party: unknown;
} {
  const db = getDb();
  if (kind === "customer") {
    const header = db.prepare(`SELECT * FROM returns WHERE id = ?`).get(id);
    if (!header) throw new Error("Retour introuvable.");
    const items = db.prepare(`SELECT * FROM return_items WHERE return_id = ? ORDER BY id`).all(id);
    const h = header as Record<string, unknown>;
    const party =
      h["customer_id"] != null
        ? db.prepare(`SELECT * FROM customers WHERE id = ?`).get(h["customer_id"])
        : null;
    return { header, items, party };
  }
  const header = db.prepare(`SELECT * FROM supplier_returns WHERE id = ?`).get(id);
  if (!header) throw new Error("Retour introuvable.");
  const items = db
    .prepare(`SELECT * FROM supplier_return_items WHERE supplier_return_id = ? ORDER BY id`)
    .all(id);
  const h = header as Record<string, unknown>;
  const party =
    h["supplier_id"] != null
      ? db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(h["supplier_id"])
      : null;
  return { header, items, party };
}

export function recordReturnRefundAtomic(args: {
  kind: ReturnKind;
  id: number;
  amountMinor: number;
  method: string | null;
  now: string;
  operationId: string;
}): void {
  const db = getDb();
  if (peekIdempotency<{ refunded: boolean }>(args.operationId, "returns.refund")) return;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "returns.refund", args.now);
    if (args.kind === "customer") {
      const r = db.prepare(`SELECT * FROM returns WHERE id = ?`).get(args.id) as
        | Record<string, unknown>
        | undefined;
      if (!r) throw new Error("Retour introuvable.");
      if (r["status"] === "cancelled") throw new Error("Retour annulé : remboursement impossible.");
      const settled = Number(r["amount_refunded_minor"]) + Number(r["credit_to_customer_minor"]);
      const total = Number(r["total_return_value_minor"]);
      if (!Number.isInteger(args.amountMinor) || args.amountMinor <= 0) {
        throw new Error("Montant de remboursement invalide.");
      }
      if (settled + args.amountMinor > total) {
        throw new Error("Remboursement supérieur au solde du retour.");
      }
      if (args.method == null) throw new Error("Moyen de remboursement requis.");
      const next = settled + args.amountMinor;
      db.prepare(
        `UPDATE returns SET amount_refunded_minor = amount_refunded_minor + ?, refund_method = ?, status = ?, updated_at = ? WHERE id = ?`,
      ).run(args.amountMinor, args.method, returnStatus(total, next), args.now, args.id);
    } else {
      const r = db.prepare(`SELECT * FROM supplier_returns WHERE id = ?`).get(args.id) as
        | Record<string, unknown>
        | undefined;
      if (!r) throw new Error("Retour introuvable.");
      if (r["status"] === "cancelled") throw new Error("Retour annulé : récupération impossible.");
      const settled = Number(r["amount_recovered_minor"]);
      const total = Number(r["total_return_value_minor"]);
      if (!Number.isInteger(args.amountMinor) || args.amountMinor <= 0) {
        throw new Error("Montant de récupération invalide.");
      }
      if (settled + args.amountMinor > total) {
        throw new Error("Récupération supérieure au solde du retour.");
      }
      if (args.method == null) throw new Error("Moyen de récupération requis.");
      const next = settled + args.amountMinor;
      db.prepare(
        `UPDATE supplier_returns SET amount_recovered_minor = amount_recovered_minor + ?, recovery_method = ?, status = ?, updated_at = ? WHERE id = ?`,
      ).run(args.amountMinor, args.method, returnStatus(total, next), args.now, args.id);
    }
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'return.refunded', 'return', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      `${args.kind}:${args.id}`,
      args.operationId,
      JSON.stringify({ amount: args.amountMinor, method: args.method }),
      args.now,
    );
    storeIdempotencyResult(args.operationId, { refunded: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      return;
    }
    throw err;
  }
}

export function cancelReturnAtomic(args: {
  kind: ReturnKind;
  id: number;
  now: string;
  operationId: string;
}): void {
  const db = getDb();
  if (peekIdempotency<{ cancelled: boolean }>(args.operationId, "returns.cancel")) return;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "returns.cancel", args.now);
    if (args.kind === "customer") {
      const r = db.prepare(`SELECT * FROM returns WHERE id = ?`).get(args.id) as
        | Record<string, unknown>
        | undefined;
      if (!r) throw new Error("Retour introuvable.");
      if (r["status"] === "cancelled") throw new Error("Retour déjà annulé.");
      if (Number(r["amount_refunded_minor"]) > 0 || Number(r["credit_to_customer_minor"]) > 0) {
        throw new Error("Annulation impossible : remboursement ou avoir déjà effectué.");
      }
      const items = db
        .prepare(`SELECT * FROM return_items WHERE return_id = ?`)
        .all(args.id) as Record<string, unknown>[];
      for (const it of items) {
        if (Number(it["restocked"]) === 1 && it["product_id"] != null) {
          const prod = db
            .prepare(`SELECT quantity FROM products WHERE id = ?`)
            .get(it["product_id"]) as {
            quantity: number;
          };
          const after = Number(prod.quantity) - Number(it["quantity"]);
          if (after < 0) {
            throw new Error(
              `Annulation impossible : stock insuffisant pour « ${txt(it["product_name_snapshot"]) || "?"} ».`,
            );
          }
          db.prepare(
            `UPDATE products SET quantity = ?, stock_status = CASE WHEN ? <= 0 THEN 'out_of_stock' WHEN ? <= min_stock_level THEN 'low_stock' ELSE 'in_stock' END, updated_at = ? WHERE id = ?`,
          ).run(after, after, after, args.now, it["product_id"]);
          // FIFO : la quantité ressort à nouveau (ordre ancien-d'abord) pour
          // préserver l'invariant couches = stock (retours vierges uniquement).
          consumeLayers({
            productId: Number(it["product_id"]),
            qty: Number(it["quantity"]),
            now: args.now,
            oversell: false,
            fallbackUnitCostMinor: 0,
          });
          db.prepare(
            `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, related_entity_type, related_entity_id, reason, reference, created_at)
             VALUES (?, ?, 'adjust_out', ?, ?, ?, 'return_cancel', ?, 'Annulation retour', ?, ?)`,
          ).run(
            randomUUID(),
            it["product_id"],
            -Number(it["quantity"]),
            after,
            String(args.id),
            txt(r["return_number"]),
            args.now,
          );
        }
      }
      db.prepare(`UPDATE returns SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(
        args.now,
        args.id,
      );
    } else {
      const r = db.prepare(`SELECT * FROM supplier_returns WHERE id = ?`).get(args.id) as
        | Record<string, unknown>
        | undefined;
      if (!r) throw new Error("Retour introuvable.");
      if (r["status"] === "cancelled") throw new Error("Retour déjà annulé.");
      if (Number(r["amount_recovered_minor"]) > 0) {
        throw new Error("Annulation impossible : récupération déjà effectuée.");
      }
      const items = db
        .prepare(`SELECT * FROM supplier_return_items WHERE supplier_return_id = ?`)
        .all(args.id) as Record<string, unknown>[];
      for (const it of items) {
        if (it["product_id"] != null) {
          const prod = db
            .prepare(`SELECT quantity FROM products WHERE id = ?`)
            .get(it["product_id"]) as {
            quantity: number;
          };
          const after = Number(prod.quantity) + Number(it["quantity"]);
          db.prepare(
            `UPDATE products SET quantity = ?, stock_status = CASE WHEN ? <= 0 THEN 'out_of_stock' WHEN ? <= min_stock_level THEN 'low_stock' ELSE 'in_stock' END, updated_at = ? WHERE id = ?`,
          ).run(after, after, after, args.now, it["product_id"]);
          // DB-09: reversal miroir exact via layers_json (0023). Fallback
          // legacy (première couche ASC) uniquement si journal absent
          // (retours créés avant 0023).
          let restoredExact = false;
          try {
            const traceRaw = r["layers_json"];
            if (typeof traceRaw === "string" && traceRaw.length > 0) {
              const trace = JSON.parse(traceRaw) as {
                productId: number | null;
                deductions: { layerId: number; quantity: number }[];
              }[];
              const entry = trace.find((t) => t.productId === it["product_id"]);
              if (entry && entry.deductions.length > 0) {
                restoreToLayers(
                  entry.deductions.map((d) => ({ layerId: d.layerId, quantity: d.quantity })),
                );
                restoredExact = true;
              }
            }
          } catch {
            restoredExact = false;
          }
          if (!restoredExact) {
            // FIFO : la quantité revient dans les couches de la facture d'origine
            // (les plus anciennes d'abord) ; à défaut (facture antérieure à FIFO),
            // couche 'legacy' au coût snapshot pour garder couches = stock.
            // A1-P0 : garde anti-ABORT trigger 0023 — on ne restaure jamais
            // au-delà de (original − remaining) ; l'excédent part en couche
            // 'legacy' au lieu de faire échouer toute l'annulation en brut SQL.
            const intakeLayers = db
              .prepare(
                `SELECT id, remaining_quantity, original_quantity FROM inventory_layers WHERE product_id = ? AND stock_intake_id = ? ORDER BY id ASC`,
              )
              .all(it["product_id"], r["stock_intake_id"]) as {
              id: number;
              remaining_quantity: number;
              original_quantity: number;
            }[];
            if (intakeLayers.length > 0) {
              let need = Number(it["quantity"]);
              for (const layer of intakeLayers) {
                if (!(need > 0)) break;
                const capacity = Number(layer.original_quantity) - Number(layer.remaining_quantity);
                if (!(capacity > 0)) continue;
                const take = Math.min(need, capacity);
                db.prepare(
                  `UPDATE inventory_layers SET remaining_quantity = remaining_quantity + ? WHERE id = ?`,
                ).run(take, layer.id);
                need -= take;
              }
              if (need > 0) {
                createLayer({
                  productId: Number(it["product_id"]),
                  intakeId: Number(r["stock_intake_id"]),
                  qty: need,
                  unitCostMinor: Math.max(0, Math.round(Number(it["purchase_price_minor"] ?? 0))),
                  reason: "legacy",
                  now: args.now,
                });
              }
            } else {
              createLayer({
                productId: Number(it["product_id"]),
                intakeId: Number(r["stock_intake_id"]),
                qty: Number(it["quantity"]),
                unitCostMinor: Math.max(0, Math.round(Number(it["purchase_price_minor"] ?? 0))),
                reason: "legacy",
                now: args.now,
              });
            }
          }
          db.prepare(
            `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, related_entity_type, related_entity_id, reason, reference, created_at)
             VALUES (?, ?, 'adjust_in', ?, ?, ?, 'return_cancel', ?, 'Annulation retour', ?, ?)`,
          ).run(
            randomUUID(),
            it["product_id"],
            Number(it["quantity"]),
            after,
            String(args.id),
            txt(r["return_number"]),
            args.now,
          );
        }
      }
      // Restaure la dette fournisseur diminuée à la création.
      if (r["supplier_id"] != null) {
        db.prepare(
          `UPDATE suppliers SET outstanding_balance_minor = outstanding_balance_minor + ? WHERE id = ?`,
        ).run(Number(r["total_return_value_minor"]), r["supplier_id"]);
      }
      db.prepare(
        `UPDATE supplier_returns SET status = 'cancelled', updated_at = ? WHERE id = ?`,
      ).run(args.now, args.id);
    }
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'return.cancelled', 'return', ?, ?, ?, ?)`,
    ).run(randomUUID(), `${args.kind}:${args.id}`, args.operationId, JSON.stringify({}), args.now);
    storeIdempotencyResult(args.operationId, { cancelled: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      return;
    }
    throw err;
  }
}
