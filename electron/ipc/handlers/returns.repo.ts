// Veloria PoS — Main-process repository: retours clients + fournisseurs.
// Création (lignes + stock + soldes + audit = 1 tx), remboursements
// complémentaires, annulation gardée (retour vierge uniquement).

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { log } from "../../services/logger";
import { claimIdempotency, peekIdempotency, storeIdempotencyResult } from "./idempotency";
import { assertOrderClause } from "./sql-guard";
import { MONEY_MAX_SINGLE_MINOR, MONEY_MAX_TOTAL_MINOR } from "../money-guard";
import { debtStatusSql } from "./debt-status";
import { businessDaySql } from "../../shared/business-day";
import {
  consumptionsOfSale,
  consumeLayers,
  createLayer,
  deductIntakeLayers,
  restoreToLayers,
} from "./fifo";
import { deriveReturnStatus, netReturnLineValue, splitReturnSettlement } from "./return-settlement";

export interface ReturnItemInput {
  /** Ligne vendue exacte (prix net après remise) — optionnel pour compat. */
  saleItemId?: number | null;
  productId: number | null;
  /** Quantité dans l'unité de la ligne vendue (carton ou pièce). */
  quantity: number;
  restocked: boolean;
  condition: "good" | "defective";
  /** Facteur de la ligne vendue (1 = pièce, >1 = carton complet). */
  unitFactor?: number;
}

export type ReturnKind = "customer" | "supplier";
export type ReturnStatusFilter =
  "all" | "validated" | "partially_refunded" | "refunded" | "cancelled";
export type ReturnTypeFilter = "all" | "customer" | "supplier";
export type ReturnSort = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

interface ReturnSaleLineRow {
  id: number;
  product_id: number | null;
  product_name_snapshot: string;
  unit_price_minor: number;
  purchase_price_minor: number;
  quantity: number;
  line_total_minor: number;
  category_id: number | null;
  unit_factor: number;
}

const txt = (v: unknown): string => (typeof v === "string" ? v : "");
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

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
  } catch (err) {
    // A8 (audit 2026-10-27) : best-effort ASSUMÉ, mais le `catch {}` muet
    // rendait l'échec invisible — or le réessai du appel suivant rejouera la
    // MEME séquence et échouera encore sur l'UNIQUE(return_number).
    log("ERROR", "returns", "sequence.bump_failed", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * A3 (audit 2026-10-27) — journal des couches débitées par un retour
 * fournisseur, lu et VALIDÉ **avant** toute écriture d'annulation.
 *
 * - `null` : aucun journal (retour antérieur à 0023) ⇒ le repli « legacy » est
 *   légitime.
 * - contenu présent mais mal formé : LÈVE un message FR. L'ancien `catch {}`
 *   permettait un demi-miroir : `restoreToLayers` levait-il en cours de boucle
 *   (trigger 0023) que les couches déjà rendues restaient écrites, puis le repli
 *   rendait la MÊME quantité une seconde fois ⇒ couches et stock gonflés, sans
 *   aucune trace. Un illisible se refuse, il ne se contourne pas.
 */
function readLayerTrace(raw: unknown): Map<number, { layerId: number; quantity: number }[]> | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const malformed = new Error("Annulation impossible : journal des couches illisible.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw malformed;
  }
  if (!Array.isArray(parsed)) throw malformed;
  const trace = new Map<number, { layerId: number; quantity: number }[]>();
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) throw malformed;
    const e = entry as { productId?: unknown; deductions?: unknown };
    if (e.productId === null || e.productId === undefined) continue;
    if (typeof e.productId !== "number" || !Array.isArray(e.deductions)) throw malformed;
    const slices: { layerId: number; quantity: number }[] = [];
    for (const d of e.deductions) {
      if (typeof d !== "object" || d === null) throw malformed;
      const { layerId, quantity } = d as { layerId?: unknown; quantity?: unknown };
      if (typeof layerId !== "number" || typeof quantity !== "number" || !(quantity > 0)) {
        throw malformed;
      }
      slices.push({ layerId, quantity });
    }
    // Deux entrées du même produit (2 lignes d'une même réception) : le
    // journal est restauré UNE fois, les parts sont donc agrégées.
    const previous = trace.get(e.productId);
    trace.set(e.productId, previous ? [...previous, ...slices] : slices);
  }
  return trace;
}

export interface CustomerReturnResult {
  id: number;
  number: string;
  totalReturnMinor: number;
  /** Part imputée automatiquement à la dette du client. */
  creditAppliedMinor: number;
  /** Espèces effectivement remboursées. */
  cashRefundMinor: number;
  /**
   * Crédit qui n'a pas pu être affecté à une vente ouverte (journée close,
   * dette d'ouverture) : il reste porté par le compte client.
   */
  unallocatedCreditMinor: number;
  /** Solde client après imputation (null = vente au passage). */
  customerOutstandingAfterMinor: number | null;
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
  /** Espèces demandées : plafonnées au retour − dette imputée. */
  refundMinor: number;
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
          is_cancelled: number;
        }
      | undefined;
    if (!sale) throw new Error("Vente d'origine introuvable.");
    if (sale.is_cancelled === 1) throw new Error("Vente annulée : retour impossible.");
    let totalReturn = 0;
    // DB-04/DB-08: cumul demandé par produit DANS cette requête (2 lignes même
    // produit) + cumul déjà planifié pour la restauration — jamais 2× les
    // mêmes couches, éligibilité sur le TOTAL vendu en UNITÉS DE BASE.
    const requestedByProduct = new Map<string, number>();
    const plannedRestoreByProduct = new Map<string, number>();
    // Ligne vendue exacte : éligibilité ET valeur nette (après remise) par
    // ligne, pour éviter le prix de la première ligne du produit.
    const requestedBySaleItem = new Map<number, number>();
    const requestedValueBySaleItem = new Map<number, number>();
    // A17 : cumul des valeurs déjà sollicitées pour ce produit DANS la requête
    // (le plafond agrégé ne marche que si les 2 lignes se voient).
    const requestedValueByProduct = new Map<string, number>();
    const keyOf = (pid: number | null): string => (pid == null ? "null" : `p${pid}`);
    const prepared: {
      saleItemId: number | null;
      productId: number | null;
      name: string;
      qty: number;
      unitFactor: number;
      baseQty: number;
      unitPrice: number;
      purchase: number;
      restocked: boolean;
      condition: string;
      lineTotal: number;
      categoryId: number | null;
      cogsMinor: number;
    }[] = [];
    for (const item of args.items) {
      let unitFactor = item.unitFactor ?? 1;
      if (!Number.isInteger(unitFactor) || unitFactor <= 0) {
        throw new Error("Facteur de conditionnement du retour invalide.");
      }
      // Ligne exacte fournie par l'UI ; sinon ancienne sélection produit+unité
      // (compatibilité des appels antérieurs).
      let sold: ReturnSaleLineRow | undefined;
      if (item.saleItemId != null) {
        sold = db
          .prepare(
            `SELECT id, product_id, product_name_snapshot, unit_price_minor, purchase_price_minor, quantity, line_total_minor, category_id, unit_factor FROM sale_items WHERE id = ? AND sale_id = ?`,
          )
          .get(item.saleItemId, args.originalSaleId) as ReturnSaleLineRow | undefined;
        if (!sold) throw new Error("Ligne de vente introuvable pour ce retour.");
        const lineFactor = Number(sold.unit_factor);
        if (!Number.isInteger(lineFactor) || lineFactor <= 0) {
          throw new Error("Conditionnement de la ligne vendue invalide.");
        }
        if (item.unitFactor != null && item.unitFactor !== lineFactor) {
          throw new Error("Conditionnement de retour incohérent avec la ligne vendue.");
        }
        unitFactor = lineFactor;
        if (item.productId != null && sold.product_id !== item.productId) {
          throw new Error("Produit du retour incohérent avec la ligne vendue.");
        }
      } else {
        // Chemin « sans ligne exacte » (le contrat rend `saleItemId` optionnel).
        // Prix/coût de référence : la ligne vendue DANS LA MÊME UNITÉ (carton ou
        // pièce) — jamais le prix d'une autre unité du même produit. Sa valeur
        // est plafonnée par `productCap` ci-dessous (A17, audit 2026-10-27).
        sold = db
          .prepare(
            `SELECT id, product_id, product_name_snapshot, unit_price_minor, purchase_price_minor, quantity, line_total_minor, category_id, unit_factor FROM sale_items WHERE sale_id = ? AND (product_id IS ? OR product_id = ?) AND unit_factor = ? ORDER BY id ASC LIMIT 1`,
          )
          .get(args.originalSaleId, item.productId, item.productId, unitFactor) as
          ReturnSaleLineRow | undefined;
        if (!sold) throw new Error("Ligne de vente introuvable pour ce retour.");
      }
      if (unitFactor > 1 && !Number.isInteger(item.quantity)) {
        throw new Error("Retour partiel d'un carton impossible (cartons complets uniquement).");
      }
      if (!(item.quantity > 0)) throw new Error("Quantité retournée invalide.");
      const productId = sold.product_id;
      // Total vendu agrégé sur TOUTES les lignes, converti en unités de base,
      // avec sa VALEUR nette (plafond agrégé du chemin sans ligne exacte, A17).
      const soldAgg = db
        .prepare(
          `SELECT COALESCE(SUM(quantity * unit_factor),0) AS qty, COALESCE(SUM(line_total_minor),0) AS v FROM sale_items WHERE sale_id = ? AND (product_id IS ? OR product_id = ?)`,
        )
        .get(args.originalSaleId, productId, productId) as { qty: number; v: number } | undefined;
      const soldBase = Number(soldAgg?.qty ?? 0);
      const soldNetValue = Number(soldAgg?.v ?? 0);
      if (!(soldBase > 0)) throw new Error("Ligne de vente introuvable pour ce retour.");
      const alreadyAgg = db
        .prepare(
          `SELECT COALESCE(SUM(ri.quantity * ri.unit_factor),0) AS q, COALESCE(SUM(ri.line_total_minor),0) AS v FROM return_items ri JOIN returns r ON r.id = ri.return_id WHERE r.original_sale_id = ? AND r.status != 'cancelled' AND (ri.product_id IS ? OR ri.product_id = ?)`,
        )
        .get(args.originalSaleId, productId, productId) as { q: number; v: number };
      const alreadyBase = Number(alreadyAgg.q);
      const alreadyNetValue = Number(alreadyAgg.v);
      const baseQty = Math.round(item.quantity * unitFactor * 1000) / 1000;
      // Éligible sur le TOTAL (SUM) moins déjà-retourné moins déjà-demandé
      // dans cette requête (2 lignes même produit).
      const inRequestBase = requestedByProduct.get(keyOf(productId)) ?? 0;
      const eligibleBase = Number(soldBase) - Number(alreadyBase) - inRequestBase;
      if (baseQty > eligibleBase) {
        throw new Error(
          `Quantité retournée supérieure à l'éligible (${eligibleBase} unités de base) pour « ${sold.product_name_snapshot} ».`,
        );
      }
      // Ligne précise : jamais plus que la quantité restante de CETTE ligne.
      let alreadyLineValue = 0;
      let maxLineValue = Number.POSITIVE_INFINITY;
      if (item.saleItemId != null) {
        const alreadyLine = db
          .prepare(
            `SELECT COALESCE(SUM(ri.quantity),0) AS q, COALESCE(SUM(ri.line_total_minor),0) AS v
             FROM return_items ri JOIN returns r ON r.id = ri.return_id
             WHERE r.original_sale_id = ? AND r.status != 'cancelled' AND ri.sale_item_id = ?`,
          )
          .get(args.originalSaleId, item.saleItemId) as { q: number; v: number };
        const inRequestLine = requestedBySaleItem.get(item.saleItemId) ?? 0;
        const lineEligible = Number(sold.quantity) - Number(alreadyLine.q) - inRequestLine;
        if (Math.round(item.quantity * 1000) > Math.round(lineEligible * 1000)) {
          throw new Error(
            `Quantité retournée supérieure à l'éligible de la ligne (${lineEligible}) pour « ${sold.product_name_snapshot} ».`,
          );
        }
        requestedBySaleItem.set(item.saleItemId, inRequestLine + item.quantity);
        alreadyLineValue = Number(alreadyLine.v);
        if (!Number.isSafeInteger(alreadyLineValue) || alreadyLineValue < 0) {
          throw new Error("Valeur déjà retournée invalide pour cette ligne.");
        }
      }
      requestedByProduct.set(keyOf(productId), inRequestBase + baseQty);
      if (
        !Number.isSafeInteger(sold.unit_price_minor) ||
        sold.unit_price_minor < 0 ||
        sold.unit_price_minor > MONEY_MAX_SINGLE_MINOR
      )
        throw new Error("Prix unitaire invalide.");
      // Valeur NETTE de la ligne (après remise) au prorata de la quantité
      // retournée : jamais le prix catalogue avant remise. Règle unique du main
      // partagée avec l'aperçu caisse (A20, audit 2026-10-27).
      const soldQty = Number(sold.quantity);
      const soldLineTotal = Number(sold.line_total_minor);
      const proportional = netReturnLineValue({
        soldLineTotalMinor: soldLineTotal,
        soldQuantity: soldQty,
        returnedQuantity: item.quantity,
      });
      // Plafonds de valeur (A17, audit 2026-10-27). Deux guards distinctes :
      // 1) `maxLineValue` — la valeur nette de LA ligne vendue, déjà retournée/
      //    sollicitée déduite ; 2) `productCap` — la valeur nette du PRODUIT dans
      //    la vente. Le chemin « sans ligne exacte » valorisait tout sur la
      //    première ligne du produit : avec deux lignes à remises différentes, le
      //    cumul dépassait la valeur réellement vendue (crédit/espèces surévalués).
      //    Le plafond agrégé le refuse désormais, quel que soit le chemin.
      const inRequestProductValue = requestedValueByProduct.get(keyOf(productId)) ?? 0;
      const productCap = Math.max(0, soldNetValue - alreadyNetValue - inRequestProductValue);
      if (item.saleItemId != null) {
        const inRequestValue = requestedValueBySaleItem.get(item.saleItemId) ?? 0;
        maxLineValue = Math.max(0, soldLineTotal - alreadyLineValue - inRequestValue);
        requestedValueBySaleItem.set(
          item.saleItemId,
          inRequestValue + Math.min(proportional, maxLineValue, productCap),
        );
      }
      const lineTotal = Math.min(proportional, maxLineValue, productCap);
      requestedValueByProduct.set(keyOf(productId), inRequestProductValue + lineTotal);
      if (!Number.isSafeInteger(lineTotal) || lineTotal < 0 || lineTotal > MONEY_MAX_TOTAL_MINOR)
        throw new Error("Montant de ligne invalide.");
      totalReturn += lineTotal;
      prepared.push({
        saleItemId: item.saleItemId ?? null,
        productId,
        name: sold.product_name_snapshot,
        qty: item.quantity,
        unitFactor,
        baseQty,
        unitPrice: sold.unit_price_minor,
        purchase: sold.purchase_price_minor,
        restocked: item.restocked,
        condition: item.condition,
        lineTotal,
        categoryId: sold.category_id,
        cogsMinor: 0,
      });
    }
    if (prepared.length === 0) throw new Error("Aucune ligne à retourner.");
    // Politique propriétaire : la valeur du retour éteint d'abord la dette du
    // client ; les espèces ne couvrent que l'excédent (jamais un remboursement
    // en espèces d'un montant encore dû).
    const customer =
      sale.customer_id == null
        ? undefined
        : (db
            .prepare(`SELECT outstanding_balance_minor FROM customers WHERE id = ?`)
            .get(sale.customer_id) as { outstanding_balance_minor: number } | undefined);
    if (sale.customer_id != null && !customer) throw new Error("Client introuvable.");
    const outstandingBefore = customer ? Number(customer.outstanding_balance_minor) : 0;
    const settlement = splitReturnSettlement({
      totalReturnMinor: totalReturn,
      outstandingMinor: outstandingBefore,
      requestedRefundMinor: args.refundMinor,
    });
    if (settlement.cashRefundMinor > 0 && args.refundMethod == null) {
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
        settlement.cashRefundMinor,
        settlement.creditAppliedMinor,
        settlement.cashRefundMinor > 0 ? args.refundMethod : null,
        args.reason || null,
        args.notes?.trim() || null,
        deriveReturnStatus(totalReturn, settlement.cashRefundMinor + settlement.creditAppliedMinor),
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
        after = Math.round((before + p.baseQty) * 1000) / 1000;
        db.prepare(
          `UPDATE products SET quantity = ?, stock_status = CASE WHEN ? <= 0 THEN 'out_of_stock' WHEN ? <= min_stock_level THEN 'low_stock' ELSE 'in_stock' END, updated_at = ? WHERE id = ?`,
        ).run(after, after, after, args.now, p.productId);
        const plan = planRestore(
          saleConsumptions.filter((c) => c.productId === p.productId),
          p.baseQty,
          plannedRestoreByProduct.get(keyOf(p.productId)) ?? 0,
        );
        plannedRestoreByProduct.set(
          keyOf(p.productId),
          (plannedRestoreByProduct.get(keyOf(p.productId)) ?? 0) + p.baseQty,
        );
        restoreToLayers(plan.slices.map((s) => ({ layerId: s.layerId, quantity: s.quantity })));
        let cost = plan.slices.reduce(
          (a, s) => a + Math.round(Number(s.unitCostMinor) * Number(s.quantity)),
          0,
        );
        const purchasePerBase = Math.max(
          0,
          Math.round(p.purchase / (p.unitFactor > 1 ? p.unitFactor : 1)),
        );
        if (plan.remainder > 0) {
          // Vente antérieure à FIFO : couche de restauration au coût snapshot
          // ramené à l'unité de base.
          createLayer({
            productId: p.productId,
            qty: plan.remainder,
            unitCostMinor: purchasePerBase,
            reason: "return_restore",
            now: args.now,
          });
          cost += Math.round(purchasePerBase * plan.remainder);
        }
        restoredUnit = p.baseQty > 0 ? Math.round(cost / p.baseQty) : purchasePerBase;
        p.cogsMinor = cost;
        db.prepare(
          `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, unit_cost_minor, related_entity_type, related_entity_id, reason, reference, staff_user_id, created_at)
           VALUES (?, ?, 'return_in', ?, ?, ?, 'return', ?, 'Retour client', ?, ?, ?)`,
        ).run(
          randomUUID(),
          p.productId,
          p.baseQty,
          after,
          restoredUnit,
          String(returnId),
          number,
          args.staffUserId ?? null,
          args.now,
        );
      }
      db.prepare(
        `INSERT INTO return_items (return_id, sale_item_id, product_id, product_name_snapshot, quantity, unit_price_minor, purchase_price_minor, restocked, condition, stock_before, stock_after, line_total_minor, category_id, cogs_minor, unit_factor)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        returnId,
        p.saleItemId,
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
        p.categoryId,
        p.cogsMinor,
        p.unitFactor,
      );
    }
    // ── Imputation automatique sur la dette ────────────────────────────────
    // La valeur du retour éteint la dette : la vente d'origine en priorité,
    // puis les autres ventes ouvertes du client (les plus anciennes). Une
    // vente d'une journée déjà clôturée n'est JAMAIS modifiée (trigger 0048) :
    // sa part devient un crédit non affecté porté par le compte client.
    let unallocatedCredit = 0;
    const allocations: { saleId: number | null; amountMinor: number }[] = [];
    if (settlement.creditAppliedMinor > 0 && sale.customer_id != null) {
      let remainingCredit = settlement.creditAppliedMinor;
      const candidates = db
        .prepare(
          `SELECT s.id, s.remaining_balance_minor
           FROM sales s
           WHERE s.customer_id = ? AND s.is_cancelled = 0 AND s.remaining_balance_minor > 0
             AND NOT EXISTS (
               SELECT 1 FROM daily_closings dc
               WHERE dc.business_date = ${businessDaySql("s.created_at")}
             )
           ORDER BY CASE WHEN s.id = ? THEN 0 ELSE 1 END, s.created_at ASC, s.id ASC`,
        )
        .all(sale.customer_id, args.originalSaleId) as {
        id: number;
        remaining_balance_minor: number;
      }[];
      for (const row of candidates) {
        if (remainingCredit <= 0) break;
        const take = Math.min(remainingCredit, Number(row.remaining_balance_minor));
        if (!(take > 0)) continue;
        let updated = 0;
        try {
          const upd = db
            .prepare(
              `UPDATE sales SET
                 amount_paid_minor = amount_paid_minor + ?,
                 remaining_balance_minor = remaining_balance_minor - ?,
                 credit_applied_minor = credit_applied_minor + ?,
                 payment_status = CASE
                   WHEN remaining_balance_minor - ? = 0 THEN 'paid'
                   WHEN amount_paid_minor + ? = 0 THEN 'unpaid'
                   ELSE 'partial'
                 END,
                 updated_at = ?
               WHERE id = ? AND remaining_balance_minor >= ?`,
            )
            .run(take, take, take, take, take, args.now, row.id, take);
          updated = Number(upd.changes);
        } catch (err) {
          // Course avec une clôture : la vente est devenue immuable. Sa part
          // passera en crédit non affecté au lieu de faire échouer le retour.
          if (err instanceof Error && /Journée déjà clôturée/i.test(err.message)) continue;
          throw err;
        }
        if (updated !== 1) {
          throw new Error("Imputation de crédit impossible : la vente a changé. Réessayez.");
        }
        db.prepare(
          `INSERT INTO customer_credit_allocations (uuid, return_id, customer_id, sale_id, amount_minor, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(randomUUID(), returnId, sale.customer_id, row.id, take, args.now);
        allocations.push({ saleId: row.id, amountMinor: take });
        remainingCredit -= take;
      }
      if (remainingCredit > 0) {
        // Aucune vente ouverte imputable (journée close / dette d'ouverture).
        db.prepare(
          `INSERT INTO customer_credit_allocations (uuid, return_id, customer_id, sale_id, amount_minor, created_at)
           VALUES (?, ?, ?, NULL, ?, ?)`,
        ).run(randomUUID(), returnId, sale.customer_id, remainingCredit, args.now);
        allocations.push({ saleId: null, amountMinor: remainingCredit });
        unallocatedCredit = remainingCredit;
      }
      // E-30 : statut recalculé APRÈS les mouvements de ventes (échéances).
      const custUpd = db
        .prepare(
          `UPDATE customers SET outstanding_balance_minor = outstanding_balance_minor - ?,
            debt_status = ${debtStatusSql("outstanding_balance_minor - ?", "id")},
            is_over_limit = CASE WHEN credit_limit_minor > 0 AND outstanding_balance_minor - ? > credit_limit_minor THEN 1 ELSE 0 END,
            updated_at = ?
          WHERE id = ? AND outstanding_balance_minor >= ?`,
        )
        .run(
          settlement.creditAppliedMinor,
          settlement.creditAppliedMinor,
          settlement.creditAppliedMinor,
          settlement.creditAppliedMinor,
          args.now,
          sale.customer_id,
          settlement.creditAppliedMinor,
        );
      if (Number(custUpd.changes) !== 1) {
        throw new Error("Solde client incohérent : imputation impossible. Réessayez.");
      }
    }
    const customerOutstandingAfter =
      customer == null ? null : outstandingBefore - settlement.creditAppliedMinor;
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at, actor_user_id) VALUES (?, 'return.created', 'return', ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(returnId),
      args.operationId,
      JSON.stringify({
        sale: args.originalSaleId,
        total: totalReturn,
        refunded: settlement.cashRefundMinor,
        creditApplied: settlement.creditAppliedMinor,
        unallocatedCredit,
        customerOutstandingBefore: customer == null ? null : outstandingBefore,
        customerOutstandingAfter,
        allocations,
      }),
      args.now,
      args.staffUserId ?? null,
    );
    const result: CustomerReturnResult = {
      id: returnId,
      number,
      totalReturnMinor: totalReturn,
      creditAppliedMinor: settlement.creditAppliedMinor,
      cashRefundMinor: settlement.cashRefundMinor,
      unallocatedCreditMinor: unallocatedCredit,
      customerOutstandingAfterMinor: customerOutstandingAfter,
    };
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
        return tx();
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
  /** Ligne d'achat exacte : son prix unitaire fait foi pour la valeur rendue. */
  intakeItemId?: number | null;
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
  /** Auteur du retour (session main, 0046/0052). */
  staffUserId?: number | null;
}): ReturnResult {
  const db = getDb();
  const fast = peekIdempotency<ReturnResult>(args.operationId, "returns.create_supplier");
  if (fast) return fast;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "returns.create_supplier", args.now);
    const intake = db.prepare(`SELECT * FROM stock_intakes WHERE id = ?`).get(args.intakeId) as
      { invoice_number: string | null; supplier_id: number | null; status: string } | undefined;
    if (!intake) throw new Error("Bon d'achat d'origine introuvable.");
    if (intake.status === "cancelled") throw new Error("Bon d'achat annulé : retour impossible.");
    let totalReturn = 0;
    // FIX-P1-01 : cumul demandé par produit DANS cette requête (miroir du
    // retour client : 2 lignes même produit ne doivent pas dépasser l'éligible).
    const requestedStockByProduct = new Map<string, number>();
    const requestedDamagedByProduct = new Map<string, number>();
    // A17 : valeur déjà sollicitée pour ce produit DANS la présente requête.
    const requestedValueByProduct = new Map<string, number>();
    const keyOf = (pid: number | null): string => (pid == null ? "null" : `p${pid}`);
    const prepared: {
      productId: number | null;
      name: string;
      qty: number;
      /** Part réellement sortie du stock (unités de base). */
      stockQty: number;
      /** Part abîmée non stockée rendue au fournisseur (unités de base). */
      damagedQty: number;
      unitPrice: number;
      purchase: number;
      condition: string;
      lineTotal: number;
    }[] = [];
    for (const item of args.items) {
      if (!(item.quantity > 0)) throw new Error("Quantité retournée invalide.");
      // Chemin « sans ligne exacte » (`intakeItemId` optionnel au contrat) : la
      // première ligne de la réception sert de référence de prix, et la valeur
      // est plafonnée par `productCap` (A17, audit 2026-10-27).
      const bought = (
        item.intakeItemId != null
          ? db
              .prepare(
                `SELECT product_id, product_name_snapshot, purchase_price_minor, quantity_received, quantity_damaged, unit_factor
                 FROM stock_intake_items
                 WHERE id = ? AND stock_intake_id = ? AND (product_id IS ? OR product_id = ?)`,
              )
              .get(item.intakeItemId, args.intakeId, item.productId, item.productId)
          : db
              .prepare(
                `SELECT product_id, product_name_snapshot, purchase_price_minor, quantity_received, quantity_damaged, unit_factor
                 FROM stock_intake_items
                 WHERE stock_intake_id = ? AND (product_id IS ? OR product_id = ?) ORDER BY id LIMIT 1`,
              )
              .get(args.intakeId, item.productId, item.productId)
      ) as
        | {
            product_id: number | null;
            product_name_snapshot: string;
            purchase_price_minor: number;
            quantity_received: number;
            quantity_damaged: number;
            unit_factor: number;
          }
        | undefined;
      if (!bought) throw new Error("Ligne d'achat introuvable pour ce retour.");
      const boughtLines = db
        .prepare(
          `SELECT quantity_received, quantity_damaged, unit_factor, line_total_minor FROM stock_intake_items WHERE stock_intake_id = ? AND (product_id IS ? OR product_id = ?)`,
        )
        .all(args.intakeId, bought.product_id, bought.product_id) as {
        quantity_received: number;
        quantity_damaged: number;
        unit_factor: number;
        line_total_minor: number;
      }[];
      // Ce qui a été PAYÉ pour ce produit sur cette facture (fret inclus) :
      // plafond agrégé du chemin sans ligne exacte (A17).
      const paidValueTotal = boughtLines.reduce((a, l) => a + Number(l.line_total_minor), 0);
      const damagedTotal = round3(boughtLines.reduce((a, l) => a + Number(l.quantity_damaged), 0));
      const netTotal = round3(
        boughtLines.reduce((a, l) => {
          const f = Number(l.unit_factor) > 0 ? Number(l.unit_factor) : 1;
          return a + Number(l.quantity_received) * f - Number(l.quantity_damaged);
        }, 0),
      );
      const already = db
        .prepare(
          `SELECT COALESCE(SUM(sri.quantity),0) AS total,
                  COALESCE(SUM(sri.quantity_stock),0) AS stock,
                  COALESCE(SUM(sri.quantity_damaged),0) AS damaged,
                  COALESCE(SUM(sri.line_total_minor),0) AS paid
           FROM supplier_return_items sri
           JOIN supplier_returns sr ON sr.id = sri.supplier_return_id
           WHERE sr.stock_intake_id = ? AND sr.status != 'cancelled'
             AND (sri.product_id IS ? OR sri.product_id = ?)`,
        )
        .get(args.intakeId, bought.product_id, bought.product_id) as {
        total: number;
        stock: number;
        damaged: number;
        paid: number;
      };
      const key = keyOf(item.productId);
      let stockEligible = 0;
      if (bought.product_id != null) {
        const layers = db
          .prepare(
            `SELECT COALESCE(SUM(remaining_quantity),0) AS q, COUNT(*) AS n
             FROM inventory_layers WHERE stock_intake_id = ? AND product_id = ?`,
          )
          .get(args.intakeId, bought.product_id) as { q: number; n: number };
        stockEligible =
          Number(layers.n) > 0
            ? Math.max(0, round3(Number(layers.q)))
            : Math.max(0, round3(netTotal - Number(already.stock)));
      }
      stockEligible = Math.max(0, round3(stockEligible - (requestedStockByProduct.get(key) ?? 0)));
      const damagedEligible = Math.max(
        0,
        round3(damagedTotal - Number(already.damaged) - (requestedDamagedByProduct.get(key) ?? 0)),
      );
      const eligible = round3(stockEligible + damagedEligible);
      if (round3(item.quantity) > eligible) {
        throw new Error(
          `Quantité retournée supérieure à l'éligible (${eligible} unités de base) pour « ${bought.product_name_snapshot} ».`,
        );
      }
      const stockQty = Math.min(round3(item.quantity), stockEligible);
      const damagedQty = Math.max(0, round3(item.quantity - stockQty));
      requestedStockByProduct.set(key, round3((requestedStockByProduct.get(key) ?? 0) + stockQty));
      requestedDamagedByProduct.set(
        key,
        round3((requestedDamagedByProduct.get(key) ?? 0) + damagedQty),
      );
      const lineTotal = (() => {
        if (
          !Number.isSafeInteger(bought.purchase_price_minor) ||
          bought.purchase_price_minor < 0 ||
          bought.purchase_price_minor > MONEY_MAX_SINGLE_MINOR
        )
          throw new Error("Prix d'achat invalide.");
        const out = Math.round(bought.purchase_price_minor * item.quantity);
        if (!Number.isSafeInteger(out) || out < 0 || out > MONEY_MAX_TOTAL_MINOR)
          throw new Error("Montant de ligne invalide.");
        // A17 (audit 2026-10-27) : plafond agrégé par produit. Le chemin « sans
        // ligne exacte » applique le prix de la PREMIÈRE ligne à des quantités
        // agrégées : sans ce plafond, le cumul rendu pouvait dépasser ce qui a
        // réellement été payé pour ce produit sur cette facture.
        const inRequestValue = requestedValueByProduct.get(key) ?? 0;
        const productCap = Math.max(0, paidValueTotal - Number(already.paid) - inRequestValue);
        const capped = Math.min(out, productCap);
        requestedValueByProduct.set(key, inRequestValue + capped);
        return capped;
      })();
      totalReturn += lineTotal;
      prepared.push({
        productId: bought.product_id,
        name: bought.product_name_snapshot,
        qty: round3(item.quantity),
        stockQty,
        damagedQty,
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
        `INSERT INTO supplier_returns (uuid, return_number, stock_intake_id, intake_invoice_number, supplier_id, total_return_value_minor, amount_recovered_minor, recovery_method, reason, notes, status, staff_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        deriveReturnStatus(totalReturn, args.recoverMinor),
        args.staffUserId ?? null,
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
        after = before - p.stockQty;
        if (after < 0) {
          throw new Error(`Stock insuffisant pour retourner « ${p.name} » (${before} dispo).`);
        }
        if (p.stockQty > 0) {
          // FIFO : la quantité repart des couches de CETTE facture d'achat
          // (jamais d'une couche arbitraire). Refus si déjà vendue/ajustée.
          const deductions = deductIntakeLayers({
            productId: p.productId,
            intakeId: args.intakeId,
            qty: p.stockQty,
          });
          // Une seule entrée par produit : l'annulation restaure le journal
          // une fois, même si la réception/le retour porte 2 lignes.
          const traceEntry = layersTrace.find((t) => t.productId === p.productId);
          if (traceEntry) traceEntry.deductions.push(...deductions);
          else layersTrace.push({ productId: p.productId, deductions });
          db.prepare(
            `UPDATE products SET quantity = ?, stock_status = CASE WHEN ? <= 0 THEN 'out_of_stock' WHEN ? <= min_stock_level THEN 'low_stock' ELSE 'in_stock' END, updated_at = ? WHERE id = ?`,
          ).run(after, after, after, args.now, p.productId);
          db.prepare(
            `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, unit_cost_minor, related_entity_type, related_entity_id, reason, reference, created_at)
             VALUES (?, ?, 'adjust_out', ?, ?, ?, 'supplier_return', ?, 'Retour fournisseur', ?, ?)`,
          ).run(
            randomUUID(),
            p.productId,
            -p.stockQty,
            after,
            p.purchase,
            String(returnId),
            number,
            args.now,
          );
        }
      }
      db.prepare(
        `INSERT INTO supplier_return_items (supplier_return_id, product_id, product_name_snapshot, quantity, quantity_stock, quantity_damaged, unit_price_minor, purchase_price_minor, line_total_minor, condition, stock_before, stock_after)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        returnId,
        p.productId,
        p.name,
        p.qty,
        p.stockQty,
        p.damagedQty,
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
    // DB-09 + A4 (audit 2026-10-27) : le journal des couches est écrit SANS
    // filet. La colonne existe depuis 0023 et `verify:migrations` applique les
    // 56 migrations : le `catch {}` « base pré-0023 » était une branche morte
    // qui perdait le journal en silence et poussait l'annulation vers un repli
    // non miroir (voir A3 dans cancelReturnAtomic).
    db.prepare(`UPDATE supplier_returns SET layers_json = ? WHERE id = ?`).run(
      JSON.stringify(layersTrace),
      returnId,
    );
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
    return tx();
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
        return tx();
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
      (SELECT COALESCE(SUM(quantity * unit_factor), 0) FROM return_items WHERE return_id = r.id AND restocked = 1) AS stock_qty
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
      (SELECT COALESCE(SUM(quantity_stock), 0) FROM supplier_return_items WHERE supplier_return_id = sr.id) AS stock_qty
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
    conds.push(`${businessDaySql("created_at")} >= ?`);
    params.push(opts.from);
  }
  if (opts.to) {
    conds.push(`${businessDaySql("created_at")} <= ?`);
    params.push(opts.to);
  }
  const q = query.trim();
  if (q) {
    // A5 (audit 2026-10-27) : le motif est échappé pour `%`, `_` et `\`, donc
    // les TROIS prédicats doivent déclarer la même clause ESCAPE. Sans elle,
    // SQLite traite `\` comme un caractère littéral : « 100% » ne remontait
    // plus rien (ou pire, les `_` de `Passage` devenaient des jokers).
    conds.push(
      `(number LIKE ? ESCAPE '\\' OR ref LIKE ? ESCAPE '\\' OR party_name LIKE ? ESCAPE '\\')`,
    );
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

/**
 * A7 (audit 2026-10-27) : codes-barres de PLUSIEURS produits en UNE requête.
 * La lecture était faite par ligne d'article ⇒ une requête par article (le même
 * N+1 que W8 J-01 avait corrigé à la création). `ORDER BY is_primary DESC, id`
 * étant global, le premier code de chaque produit reste bien son primaire.
 */
function barcodesByProducts(productIds: number[]): Map<number, string[]> {
  if (productIds.length === 0) return new Map();
  const placeholders = productIds.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT product_id AS pid, barcode FROM product_barcodes WHERE product_id IN (${placeholders}) ORDER BY is_primary DESC, id`,
    )
    .all(...productIds) as { pid: number; barcode: string }[];
  const map = new Map<number, string[]>();
  for (const row of rows) {
    const list = map.get(Number(row.pid));
    if (list) list.push(row.barcode);
    else map.set(Number(row.pid), [row.barcode]);
  }
  return map;
}

/** Liste des identifiants produit non nuls, dédupliqués. */
function productIdsOf(rows: Record<string, unknown>[]): number[] {
  const ids = new Set<number>();
  for (const row of rows) {
    if (row["product_id"] != null) ids.add(Number(row["product_id"]));
  }
  return [...ids];
}

export function getReturnableSaleItems(saleId: number): {
  sale: unknown;
  customerName: string | null;
  /** Solde dû actuel : l'UI affiche l'imputation automatique avant validation. */
  customerOutstandingMinor: number | null;
  items: unknown[];
} {
  const db = getDb();
  const sale = db.prepare(`SELECT * FROM sales WHERE id = ?`).get(saleId) as
    Record<string, unknown> | undefined;
  if (!sale) throw new Error("Vente introuvable.");
  if (sale["is_cancelled"] === 1) throw new Error("Vente annulée : retour impossible.");
  const items = db
    .prepare(`SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id`)
    .all(saleId) as Record<string, unknown>[];
  // Éligibilité en UNITÉS DE BASE : le stock et les retours raisonnent en
  // pièces, même quand la ligne vendue est un carton.
  const keyOf = (pid: unknown): string => (pid == null ? "null" : `p${Number(pid)}`);
  const soldBase = new Map<string, number>();
  for (const it of items) {
    const factor = Number(it["unit_factor"] ?? 1) > 0 ? Number(it["unit_factor"] ?? 1) : 1;
    const k = keyOf(it["product_id"]);
    soldBase.set(
      k,
      Math.round(((soldBase.get(k) ?? 0) + Number(it["quantity"]) * factor) * 1000) / 1000,
    );
  }
  const alreadyRows = db
    .prepare(
      `SELECT ri.product_id AS pid, COALESCE(SUM(ri.quantity * ri.unit_factor),0) AS q
       FROM return_items ri JOIN returns r ON r.id = ri.return_id
       WHERE r.original_sale_id = ? AND r.status != 'cancelled'
       GROUP BY ri.product_id`,
    )
    .all(saleId) as { pid: number | null; q: number }[];
  const alreadyBase = new Map<string, number>();
  for (const r of alreadyRows) {
    alreadyBase.set(keyOf(r.pid), Number(r.q));
  }
  // Éligibilité PAR LIGNE (nouveaux retours) : une ligne ne peut pas être
  // retournée deux fois même si le produit a plusieurs lignes.
  const alreadyLineRows = db
    .prepare(
      `SELECT ri.sale_item_id AS sid, COALESCE(SUM(ri.quantity),0) AS q
       FROM return_items ri JOIN returns r ON r.id = ri.return_id
       WHERE r.original_sale_id = ? AND r.status != 'cancelled' AND ri.sale_item_id IS NOT NULL
       GROUP BY ri.sale_item_id`,
    )
    .all(saleId) as { sid: number; q: number }[];
  const alreadyLine = new Map<number, number>();
  for (const r of alreadyLineRows) {
    alreadyLine.set(Number(r.sid), Number(r.q));
  }
  // A7 : une seule requête de codes-barres pour toute la vente.
  const barcodesByProduct = barcodesByProducts(productIdsOf(items));
  const out = items.map((it) => {
    const factor = Number(it["unit_factor"] ?? 1) > 0 ? Number(it["unit_factor"] ?? 1) : 1;
    const k = keyOf(it["product_id"]);
    const remainingBase = Math.max(
      0,
      Math.round(((soldBase.get(k) ?? 0) - (alreadyBase.get(k) ?? 0)) * 1000) / 1000,
    );
    const productEligible =
      factor > 1
        ? Math.min(Number(it["quantity"]), Math.floor(remainingBase / factor + 1e-9))
        : Math.min(Number(it["quantity"]), remainingBase);
    const lineEligible = Math.max(
      0,
      Number(it["quantity"]) - (alreadyLine.get(Number(it["id"])) ?? 0),
    );
    const eligible = Math.max(0, Math.min(productEligible, lineEligible));
    const already = Math.max(0, Number(it["quantity"]) - eligible);
    const barcodes =
      it["product_id"] != null ? (barcodesByProduct.get(Number(it["product_id"])) ?? []) : [];
    const primary = barcodes.length > 0 ? (barcodes[0] ?? null) : null;
    return {
      ...it,
      already_returned: Number(already),
      eligible,
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
      ? (db
          .prepare(`SELECT search_name, outstanding_balance_minor FROM customers WHERE id = ?`)
          .get(sale["customer_id"]) as
          { search_name: string; outstanding_balance_minor: number } | undefined)
      : undefined;
  return {
    sale,
    customerName: cust?.search_name ?? null,
    customerOutstandingMinor: cust ? Number(cust.outstanding_balance_minor) : null,
    items: out,
  };
}

export function getReturnableIntakeItems(intakeId: number): {
  intake: unknown;
  supplierName: string | null;
  items: unknown[];
} {
  const db = getDb();
  const intake = db.prepare(`SELECT * FROM stock_intakes WHERE id = ?`).get(intakeId) as
    Record<string, unknown> | undefined;
  if (!intake) throw new Error("Bon d'achat introuvable.");
  if (intake["status"] === "cancelled") throw new Error("Bon d'achat annulé : retour impossible.");
  const items = db
    .prepare(
      `SELECT ii.*, p.unit_code AS unit_code, pk.label_fr AS packaging_label_fr
       FROM stock_intake_items ii
       LEFT JOIN products p ON p.id = ii.product_id
       LEFT JOIN product_packagings pk ON pk.id = ii.packaging_id
       WHERE ii.stock_intake_id = ? ORDER BY ii.id`,
    )
    .all(intakeId) as Record<string, unknown>[];
  // A7 (audit 2026-10-27) : les trois lectures qui étaient faites PAR ARTICLE
  // (déjà retourné, couches FIFO restantes, codes-barres) deviennent trois
  // requêtes agrégées pour toute la réception. `GROUP BY product_id` regroupe
  // aussi les lignes libres (product_id NULL), comme le faisait le
  // `(product_id IS ? OR product_id = ?)` répété.
  const alreadyRows = db
    .prepare(
      `SELECT sri.product_id AS pid,
              COALESCE(SUM(sri.quantity),0) AS total,
              COALESCE(SUM(sri.quantity_stock),0) AS stock,
              COALESCE(SUM(sri.quantity_damaged),0) AS damaged
       FROM supplier_return_items sri
       JOIN supplier_returns sr ON sr.id = sri.supplier_return_id
       WHERE sr.stock_intake_id = ? AND sr.status != 'cancelled'
       GROUP BY sri.product_id`,
    )
    .all(intakeId) as { pid: number | null; total: number; stock: number; damaged: number }[];
  const alreadyByProduct = new Map<
    number | null,
    { total: number; stock: number; damaged: number }
  >();
  for (const row of alreadyRows) {
    const pid = row.pid == null ? null : Number(row.pid);
    alreadyByProduct.set(pid, {
      total: Number(row.total),
      stock: Number(row.stock),
      damaged: Number(row.damaged),
    });
  }
  const layerRows = db
    .prepare(
      `SELECT product_id AS pid, COALESCE(SUM(remaining_quantity),0) AS q, COUNT(*) AS n
       FROM inventory_layers WHERE stock_intake_id = ? GROUP BY product_id`,
    )
    .all(intakeId) as { pid: number; q: number; n: number }[];
  const layersByProduct = new Map<number, { q: number; n: number }>();
  for (const row of layerRows) {
    layersByProduct.set(Number(row.pid), { q: Number(row.q), n: Number(row.n) });
  }
  const barcodesByProduct = barcodesByProducts(productIdsOf(items));
  const emptyAlready = { total: 0, stock: 0, damaged: 0 };
  const out = items.map((it) => {
    const productId = it["product_id"] == null ? null : Number(it["product_id"]);
    const factorRaw = Number(it["unit_factor"] ?? 1);
    const factor = Number.isInteger(factorRaw) && factorRaw > 0 ? factorRaw : 1;
    const purchasedBase = round3(Number(it["quantity_received"]) * factor);
    const damaged = round3(Number(it["quantity_damaged"]));
    const net = round3(purchasedBase - damaged);
    // Retours déjà enregistrés : total repris par le fournisseur + part
    // réellement sortie du stock (les abîmées ne sortent jamais du stock).
    const already = alreadyByProduct.get(productId) ?? emptyAlready;
    // Éligibilité STOCK = couches FIFO encore présentes dans CETTE réception
    // (une vente/ajustement a pu consommer la marchandise). Repli historique
    // (facture antérieure aux couches) : quantité nette moins déjà retournée.
    let stockEligible = 0;
    if (productId != null) {
      const layers = layersByProduct.get(productId);
      stockEligible =
        layers && layers.n > 0
          ? Math.max(0, round3(layers.q))
          : Math.max(0, round3(net - already.stock));
    }
    // Les pièces abîmées n'ont jamais été mises en stock : elles restent
    // retournables au fournisseur tant qu'elles n'ont pas déjà été retournées.
    const damagedEligible = Math.max(0, round3(damaged - Number(already.damaged)));
    const barcodes = productId != null ? (barcodesByProduct.get(productId) ?? []) : [];
    const primary = barcodes.length > 0 ? (barcodes[0] ?? null) : null;
    return {
      ...it,
      unit_factor: factor,
      quantity_net: net,
      stock_eligible: stockEligible,
      damaged_eligible: damagedEligible,
      already_returned: round3(Number(already.total)),
      // Éligible = stock disponible + abîmées encore non retournées.
      eligible: round3(stockEligible + damagedEligible),
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
          { name: string } | undefined)
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
        Record<string, unknown> | undefined;
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
      ).run(args.amountMinor, args.method, deriveReturnStatus(total, next), args.now, args.id);
    } else {
      const r = db.prepare(`SELECT * FROM supplier_returns WHERE id = ?`).get(args.id) as
        Record<string, unknown> | undefined;
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
      ).run(args.amountMinor, args.method, deriveReturnStatus(total, next), args.now, args.id);
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
    tx();
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
        Record<string, unknown> | undefined;
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
          const factor =
            Number.isInteger(Number(it["unit_factor"])) && Number(it["unit_factor"]) > 0
              ? Number(it["unit_factor"])
              : 1;
          const baseQty = Math.round(Number(it["quantity"]) * factor * 1000) / 1000;
          const prod = db
            .prepare(`SELECT quantity FROM products WHERE id = ?`)
            .get(it["product_id"]) as {
            quantity: number;
          };
          const after = Math.round((Number(prod.quantity) - baseQty) * 1000) / 1000;
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
            qty: baseQty,
            now: args.now,
            oversell: false,
            fallbackUnitCostMinor: 0,
          });
          db.prepare(
            `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, related_entity_type, related_entity_id, reason, reference, created_at)
             VALUES (?, ?, 'adjust_out', ?, ?, 'return_cancel', ?, 'Annulation retour', ?, ?)`,
          ).run(
            randomUUID(),
            it["product_id"],
            -baseQty,
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
        Record<string, unknown> | undefined;
      if (!r) throw new Error("Retour introuvable.");
      if (r["status"] === "cancelled") throw new Error("Retour déjà annulé.");
      if (Number(r["amount_recovered_minor"]) > 0) {
        throw new Error("Annulation impossible : récupération déjà effectuée.");
      }
      const items = db
        .prepare(`SELECT * FROM supplier_return_items WHERE supplier_return_id = ?`)
        .all(args.id) as Record<string, unknown>[];
      // Le journal est agrégé par produit : il est restauré UNE fois, même
      // quand le retour contient deux lignes du même produit (cartons+pièces).
      // A3 : lu et validé AVANT la première écriture — un journal illisible
      // refuse l'annulation (rollback total) au lieu de basculer en repli.
      const layerTrace = readLayerTrace(r["layers_json"]);
      const traceRestored = new Set<number>();
      for (const it of items) {
        // Seule la part réellement sortie du stock revient (les abîmées
        // n'ont jamais été stockées).
        const stockQty =
          it["quantity_stock"] == null ? Number(it["quantity"]) : Number(it["quantity_stock"]);
        if (it["product_id"] != null && stockQty > 0) {
          const prod = db
            .prepare(`SELECT quantity FROM products WHERE id = ?`)
            .get(it["product_id"]) as {
            quantity: number;
          };
          const after = Number(prod.quantity) + stockQty;
          db.prepare(
            `UPDATE products SET quantity = ?, stock_status = CASE WHEN ? <= 0 THEN 'out_of_stock' WHEN ? <= min_stock_level THEN 'low_stock' ELSE 'in_stock' END, updated_at = ? WHERE id = ?`,
          ).run(after, after, after, args.now, it["product_id"]);
          // DB-09: reversal miroir exact via layers_json (0023). Le repli
          // legacy (première couche ASC) n'est pris que lorsque le journal est
          // ABSENT (retours créés avant 0023) — jamais sur un journal illisible,
          // qui a déjà fait refuser l'annulation en `readLayerTrace`.
          const tracePid = Number(it["product_id"]);
          let restoredExact = traceRestored.has(tracePid);
          if (!restoredExact) {
            const deductions = layerTrace?.get(tracePid);
            if (deductions && deductions.length > 0) {
              restoreToLayers(deductions);
              restoredExact = true;
              traceRestored.add(tracePid);
            }
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
              let need = stockQty;
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
                qty: stockQty,
                unitCostMinor: Math.max(0, Math.round(Number(it["purchase_price_minor"] ?? 0))),
                reason: "legacy",
                now: args.now,
              });
            }
          }
          db.prepare(
            `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, related_entity_type, related_entity_id, reason, reference, created_at)
             VALUES (?, ?, 'adjust_in', ?, ?, 'return_cancel', ?, 'Annulation retour', ?, ?)`,
          ).run(
            randomUUID(),
            it["product_id"],
            stockQty,
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
    tx();
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
