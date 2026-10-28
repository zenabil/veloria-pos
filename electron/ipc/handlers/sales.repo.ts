// Veloria PoS — Main-process: sale creation transaction (atomic).
// Boundary: sale + items + payment + stock movements + product qty + customer balance + audit = 1 tx.

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { formatInvoiceNumber } from "./numbers";
import { debtStatusSql } from "./debt-status";
import {
  auditOperationId,
  claimIdempotency,
  claimOptional,
  peekIdempotency,
  peekOptional,
  storeIdempotencyResult,
  storeOptional,
} from "./idempotency";
import {
  consumeLayers,
  consumptionsOfSale,
  createLayer,
  latestUnitCost,
  restoreToLayers,
} from "./fifo";
import { log } from "../../services/logger";

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

export function listSalesHistory(
  page: number,
  pageSize: number,
  query = "",
  staffUserId: number | null = null,
): { rows: unknown[]; total: number } {
  const db = getDb();
  const q = query.trim().replace(/\s+/g, "");
  // R2 (0046) : périmètre auteur — null = gérant (tout), sinon mes ventes.
  // Les lignes historiques sans auteur (NULL) sont invisibles aux utilisateurs.
  const conds: string[] = [];
  const params: unknown[] = [];
  if (q) {
    conds.push(`REPLACE(s.invoice_number, ' ', '') LIKE ? ESCAPE '\\'`);
    params.push(`%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  }
  if (staffUserId != null) {
    conds.push(`s.staff_user_id = ?`);
    params.push(staffUserId);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM sales s ${where}`).get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT s.*, c.search_name AS customer_name FROM sales s LEFT JOIN customers c ON c.id = s.customer_id ${where} ORDER BY s.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  return { rows, total };
}

export function getSaleDetail(
  id: number,
  staffUserId: number | null = null,
): {
  sale: unknown;
  items: unknown[];
  payments: unknown[];
} {
  const db = getDb();
  const sale = db.prepare(`SELECT * FROM sales WHERE id = ?`).get(id) as
    Record<string, unknown> | undefined;
  if (!sale) throw new Error("Vente introuvable.");
  // R2 (0046) : un utilisateur ne rouvre que ses ventes (le gérant = null = tout).
  // Les ventes historiques sans auteur (NULL) sont réservées au gérant.
  if (staffUserId != null && sale["staff_user_id"] !== staffUserId) {
    throw new Error("Action non autorisée pour cet utilisateur.");
  }
  const items = db.prepare(`SELECT * FROM sale_items WHERE sale_id = ?`).all(id);
  const payments = db.prepare(`SELECT * FROM sale_payments WHERE sale_id = ?`).all(id);
  return { sale, items, payments };
}

/** Report d'échéance d'une créance (vente non annulée). */
export function updateSaleDueDate(
  id: number,
  dueDate: string | null,
  now: string,
  operationId?: string | null,
): void {
  const db = getDb();
  const fast = peekOptional<{ updated: boolean }>(operationId, "sales.setDueDate");
  if (fast) return;
  // A1-P0 : lecture + écriture DANS la tx avec garde WHERE (TOCTOU annulation
  // concurrente : une annulation entre SELECT et UPDATE ne doit pas écrire).
  const tx = db.transaction(() => {
    claimOptional(operationId, "sales.setDueDate", now);
    const sale = db.prepare(`SELECT is_cancelled FROM sales WHERE id = ?`).get(id) as
      { is_cancelled: number } | undefined;
    if (!sale) throw new Error("Vente introuvable.");
    if (sale.is_cancelled === 1) throw new Error("Vente annulée : échéance non modifiable.");
    const r = db
      .prepare(`UPDATE sales SET due_date = ?, updated_at = ? WHERE id = ? AND is_cancelled = 0`)
      .run(dueDate, now, id);
    if (Number(r.changes) !== 1) throw new Error("Vente annulée : échéance non modifiable.");
    // P8: échéance tracée (pilotage des créances) — audit déterministe.
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'sale.due_date', 'sale', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(id),
      auditOperationId(operationId, "sale.due_date", id, { dueDate }),
      JSON.stringify({ dueDate }),
      now,
    );
    storeOptional(operationId, { updated: true });
  });
  try {
    tx();
  } catch (err) {
    if (
      operationId &&
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekOptional<{ updated: boolean }>(operationId, "sales.setDueDate");
      if (retry) return;
    }
    throw err;
  }
}

export interface SaleLineInput {
  productId: number | null;
  productName: string;
  unitCode: string;
  /** Prix d'origine catalogue (référence remise P0-7). */
  originalUnitPriceMinor: number;
  /** Prix facturé (après changement éventuel via le dialogue prix). */
  unitPriceMinor: number;
  /** Coût de référence caisse ; le COGS FIFO réel l'écrase après consommation. */
  purchasePriceMinor: number;
  quantity: number;
  /**
   * Montant facturé EXACT de la ligne (mode « Montant » ADR-114) — `null`/
   * absent = prix × quantité. Validé AVANT toute écriture (borne d'arrondi
   * de la quantité : le renderer ne peut pas gonfler un total).
   */
  billedTotalMinor?: number | null;
  /** Conditionnement appliqué (null = unité de base). */
  packagingId?: number | null;
  /** Nombre d'unités de base par unité de ligne (1 = pièce). */
  unitFactor?: number;
}

export interface CreateSaleInput {
  operationId: string;
  uuid: string;
  invoiceNumber: string;
  customerId: number | null;
  /** Dépassement de plafond validé par le vendeur (accord explicite, tracé). Défaut = false. */
  limitOverrideApproved?: boolean;
  subtotalMinor: number;
  discountType: string;
  discountValueMinor: number;
  discountAmountMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  remainingMinor: number;
  paymentStatus: string;
  paymentMethod: string | null;
  dueDate: string | null;
  lines: SaleLineInput[];
  lineTotals: number[];
  /**
   * Répartition de la remise sur les lignes (centimes, entiers ≥ 0).
   * Optionnel : par défaut la remise de ligne = (original − facturé) × qté.
   * FOURNI par la conversion d'un DEVIS, dont la remise est GLOBALE : la
   * répartition est alors exacte (Σ = discountAmountMinor) et le prix unitaire
   * reste le prix du devis (le ticket affiche une ligne « Remise »).
   */
  lineDiscounts?: number[];
  now: string;
  allowNegativeStock: boolean;
  /**
   * Conversion INTERNE d'un devis : le facteur et le prix carton viennent de
   * `proforma_items` (snapshot validé à la création du devis), jamais du
   * renderer. Le main ne relit donc pas le conditionnement courant — un devis
   * reste convertible même si le tarif carton a changé depuis. Ce champ n'est
   * pas exposé par le schéma IPC.
   */
  trustedPackagingSnapshot?: boolean;
  /** Auteur de la vente (session main, 0046) — NULL = historique pré-0046. */
  staffUserId?: number | null;
}

export function allocateInvoiceNumber(prefix: string, now: string): string {
  const db = getDb();
  // Appelée DANS la transaction createSale (même connexion) : pas de
  // sous-transaction, juste SELECT + UPDATE atomiques avec le reste.
  const row = db
    .prepare(`SELECT prefix, next_value FROM number_sequences WHERE sequence_key = 'sale_invoice'`)
    .get() as {
    prefix: string;
    next_value: number;
  };
  const p = prefix.trim() || row.prefix || "FAC";
  // P15: année issue de la date métier `now` (ISO) plutôt que de l'horloge
  // système brute — déterministe et testable.
  const year = Number(String(now).slice(0, 4)) || new Date().getFullYear();
  const num = formatInvoiceNumber(p, year, row.next_value);
  db.prepare(
    `UPDATE number_sequences SET next_value = next_value + 1, updated_at = ? WHERE sequence_key = 'sale_invoice'`,
  ).run(now);
  return num;
}

/**
 * Contrôle PRÉALABLE des lignes de vente (fail-closed, FR) — miroir de la
 * règle du domaine (`computeLineDiscount`) :
 * - prix d'origine et prix facturé : entiers ≥ 0 ;
 * - montant facturé saisi (mode « Montant ») : entier > 0 et à portée de
 *   l'arrondi de la quantité (le renderer ne peut pas gonfler un total) ;
 * - remise de ligne SIGNÉE bornée (majoration admise — migration 0051).
 * Appelé AVANT l'INSERT de la vente : un refus arrive donc en message FR
 * (jamais un CHECK SQL brut).
 *
 * `lineTotals` / `lineDiscounts` : les valeurs EFFECTIVES qui seront écrites
 * (conversion d'un devis) — sinon elles sont recalculées ici.
 */
export function validateSaleLines(
  lines: SaleLineInput[],
  lineTotals?: number[],
  lineDiscounts?: number[],
): void {
  lines.forEach((line, i) => {
    if (!Number.isInteger(line.originalUnitPriceMinor) || line.originalUnitPriceMinor < 0) {
      throw new Error(`Prix d'origine invalide pour « ${line.productName} ».`);
    }
    if (!Number.isInteger(line.unitPriceMinor) || line.unitPriceMinor < 0) {
      throw new Error(`Prix facturé invalide pour « ${line.productName} ».`);
    }
    const factor = line.unitFactor ?? 1;
    if (!Number.isInteger(factor) || factor <= 0) {
      throw new Error(`Facteur de conditionnement invalide pour « ${line.productName} ».`);
    }
    if (factor > 1 && line.billedTotalMinor != null) {
      throw new Error(`Ligne carton incompatible avec un montant saisi : « ${line.productName} ».`);
    }
    if (
      line.packagingId != null &&
      (!Number.isInteger(line.packagingId) || line.packagingId <= 0)
    ) {
      throw new Error(`Conditionnement invalide pour « ${line.productName} ».`);
    }
    // Montant saisi : validé même quand le total effectif est fourni.
    billedTotalOfLine(line);
    const charged = lineTotals?.[i] ?? billedTotalOfLine(line);
    if (!Number.isSafeInteger(charged) || charged < 0) {
      throw new Error(`Montant facturé invalide pour « ${line.productName} ».`);
    }
    const originalTotal = Math.round(line.originalUnitPriceMinor * line.quantity);
    const discount = lineDiscounts ? (lineDiscounts[i] ?? 0) : originalTotal - charged;
    if (!Number.isSafeInteger(discount) || Math.abs(discount) > 100_000_000_000) {
      throw new Error(`Remise de ligne invalide pour « ${line.productName} ».`);
    }
    if (discount > originalTotal + 1) {
      throw new Error(`Remise de ligne supérieure au total pour « ${line.productName} ».`);
    }
  });
}

/** Montant facturé de la ligne (miroir `priceLine`) : saisi ou prix × qté. */
function billedTotalOfLine(line: SaleLineInput): number {
  const billed = line.billedTotalMinor;
  if (billed == null) return Math.round(line.unitPriceMinor * line.quantity);
  if (!Number.isSafeInteger(billed) || billed <= 0) {
    throw new Error(`Montant facturé invalide pour « ${line.productName} ».`);
  }
  const reference = Math.round(line.unitPriceMinor * line.quantity);
  const tolerance = Math.ceil(line.unitPriceMinor * 0.0005) + 1;
  if (Math.abs(billed - reference) > tolerance) {
    throw new Error(`Montant facturé incohérent pour « ${line.productName} ».`);
  }
  return billed;
}

export function createSaleAtomic(input: CreateSaleInput): {
  saleId: number;
  invoiceNumber: string;
} {
  const db = getDb();
  // Idempotency: retry with same operationId returns existing sale.
  // Fast path hors transaction + garde anti-course : si deux appels concurrents
  // passent le SELECT, l'UNIQUE(operation_id) tranche et le perdant relit
  // la vente existante au lieu de lever une erreur technique.
  const findExisting = (): { saleId: number; invoiceNumber: string } | undefined => {
    const existing = db
      .prepare(`SELECT id, invoice_number FROM sales WHERE operation_id = ?`)
      .get(input.operationId) as
      | {
          id: number;
          invoice_number: string;
        }
      | undefined;
    if (existing) return { saleId: existing.id, invoiceNumber: existing.invoice_number };
    return undefined;
  };
  const fast = findExisting();
  if (fast) return fast;

  // Vente à crédit : autorisation + plafond DANS la transaction (lecture fraîche,
  // garde anti-course ; le trigger SQL `trg_sales_credit_allowed` tranche en dernier ressort).
  if (input.remainingMinor > 0 && input.customerId == null) {
    throw new Error("Vente à crédit : choisissez un client autorisé au crédit.");
  }

  // CONTRÔLE PRÉALABLE DES LIGNES (fail-closed, AVANT toute écriture) :
  // l'INSERT de la vente précède la boucle des lignes dans la transaction —
  // sans ce pré-contrôle, une ligne invalide (remise hors bornes, montant
  // facturé incohérent) était refusée par le CHECK SQL de la base
  // (« CHECK constraint failed: discount_amount_minor >= 0 ») : le message
  // technique arrivait à l'écran au lieu du message FR, et le garde-fou
  // principal de la remise (ligne 0031) ne jouait pas son rôle.
  validateSaleLines(input.lines, input.lineTotals, input.lineDiscounts);

  const tx = db.transaction(() => {
    // Client archivé : une vente sur une fiche archivée rendrait les
    // rapports/relances incohérents. Vérifié pour TOUTE vente avec client,
    // pas seulement le crédit.
    if (input.customerId != null) {
      const customer = db
        .prepare(`SELECT deleted_at FROM customers WHERE id = ?`)
        .get(input.customerId) as { deleted_at: string | null } | undefined;
      if (!customer) throw new Error("Client introuvable.");
      if (customer.deleted_at != null) {
        throw new Error("Client archivé : vente impossible.");
      }
    }
    // PLAFOND-BLOQUANT (règle radicale) : autorisation + plafond relus ICI,
    // dans la transaction (pas de TOCTOU) — solde + reste > plafond (> 0)
    // = refus, sauf accord vendeur explicite (limitOverrideApproved, tracé).
    if (input.remainingMinor > 0) {
      const salesCfg = db
        .prepare(`SELECT value_json FROM app_settings WHERE key = 'sales'`)
        .get() as { value_json: string } | undefined;
      let creditOpen = true;
      try {
        if (salesCfg) {
          creditOpen =
            (JSON.parse(salesCfg.value_json) as { allowCreditSales?: boolean }).allowCreditSales !==
            false;
        }
      } catch {
        /* défaut : crédit autorisé (drapeau client tranche) */
      }
      if (!creditOpen) {
        throw new Error("Ventes à crédit désactivées dans les paramètres.");
      }
      if (input.customerId == null) {
        throw new Error("Vente à crédit : choisissez un client autorisé au crédit.");
      }
      const c = db
        .prepare(
          `SELECT credit_allowed, credit_limit_minor, outstanding_balance_minor FROM customers WHERE id = ?`,
        )
        .get(input.customerId) as
        | { credit_allowed: number; credit_limit_minor: number; outstanding_balance_minor: number }
        | undefined;
      if (!c) throw new Error("Client introuvable.");
      if (Number(c.credit_allowed) !== 1) {
        throw new Error("Vente à crédit refusée : ce client n'est pas autorisé au crédit.");
      }
      const limit = Number(c.credit_limit_minor);
      const outstanding = Number(c.outstanding_balance_minor);
      if (limit > 0 && outstanding + input.remainingMinor > limit && !input.limitOverrideApproved) {
        throw new Error(
          "Plafond de crédit dépassé : vente à crédit refusée (solde + reste > plafond). Accord vendeur requis.",
        );
      }
    }
    // FIX-P1-02 (fail-closed MONEY-ROOT) : seul le type "none" est accepté —
    // la remise vit dans les LIGNES (P0-7) et le schéma 0001:153 impose
    // `total = subtotal − discount_amount_minor + delivery`. Un "percent"
    // stockerait un taux flottant (ex. 2.5) dans la colonne INTEGER
    // discount_value_minor : refus explicite FR avant toute écriture
    // (rollback trivial). Une remise GLOBALE (devis) est répartie sur les
    // lignes par l'appelant (lineDiscounts) : Σ lignes = discount_amount_minor
    // ⇒ le CHECK tient et le ticket affiche une ligne « Remise » (forme (b) du
    // validateur d'impression, déjà supportée).
    if (input.discountType !== "none") {
      throw new Error("Type de remise non pris en charge (remises par lignes uniquement).");
    }
    // Total recalculé ICI (fail-closed) : le total stocké ne peut pas diverger
    // du sous-total, des remises et de la livraison (miroir du CHECK 0001:153).
    const expectedTotal = input.subtotalMinor - input.discountAmountMinor + input.deliveryFeeMinor;
    if (input.totalMinor !== expectedTotal) {
      throw new Error("Total de vente incohérent.");
    }
    // Répartition de remise : Σ lignes = discount_amount_minor (invariant de
    // traçabilité P0-7). Fail-closed : une répartition incohérente ne doit
    // jamais écrire une vente dont le total ne se recompose pas.
    if (input.lineDiscounts) {
      const sumLineDiscounts = input.lineDiscounts.reduce((a, d) => a + d, 0);
      if (sumLineDiscounts !== input.discountAmountMinor) {
        throw new Error("Répartition de la remise incohérente.");
      }
    }
    // 1. stock availability check (unless explicitly allowed) — préchargé en
    // UNE requête (WHERE id IN) avant la boucle : verrou d'écriture plus court
    // pour les grands paniers, jamais de SELECT dans le for.
    // CONDITIONNEMENT : la vérification est agrégée PAR PRODUIT en unités de
    // base AVANT toute écriture (un carton = facteur unités), jamais ligne à
    // ligne — deux lignes du même produit ne doivent pas passer séparément.
    const wantedIds = [
      ...new Set(input.lines.filter((l) => l.productId != null).map((l) => l.productId as number)),
    ];
    const qtyById = new Map<number, number>();
    const categoryById = new Map<number, number | null>();
    const activeById = new Map<number, boolean>();
    const sellingById = new Map<number, number>();
    if (wantedIds.length > 0) {
      const placeholders = wantedIds.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT id, quantity, category_id, is_active, selling_price_minor FROM products WHERE id IN (${placeholders})`,
        )
        .all(...wantedIds) as {
        id: number;
        quantity: number;
        category_id: number | null;
        is_active: number;
        selling_price_minor: number;
      }[];
      for (const r of rows) {
        qtyById.set(Number(r.id), Number(r.quantity));
        activeById.set(Number(r.id), Number(r.is_active) === 1);
        categoryById.set(Number(r.id), r.category_id == null ? null : Number(r.category_id));
        sellingById.set(Number(r.id), Number(r.selling_price_minor));
      }
    }
    // Packaging relu en DB : le renderer ne fait jamais foi sur le facteur ni
    // sur le prix carton.
    const packagingIds = [
      ...new Set(
        input.lines.filter((l) => l.packagingId != null).map((l) => l.packagingId as number),
      ),
    ];
    const packagingById = new Map<
      number,
      {
        productId: number;
        factor: number;
        sellingPriceMinor: number;
        auto: boolean;
        active: boolean;
      }
    >();
    if (packagingIds.length > 0) {
      const placeholders = packagingIds.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT id, product_id, factor, selling_price_minor, auto_carton_pricing, is_active FROM product_packagings WHERE id IN (${placeholders})`,
        )
        .all(...packagingIds) as {
        id: number;
        product_id: number;
        factor: number;
        selling_price_minor: number;
        auto_carton_pricing: number;
        is_active: number;
      }[];
      for (const r of rows) {
        packagingById.set(Number(r.id), {
          productId: Number(r.product_id),
          factor: Number(r.factor),
          sellingPriceMinor: Number(r.selling_price_minor),
          auto: Number(r.auto_carton_pricing) === 1,
          active: Number(r.is_active) === 1,
        });
      }
    }
    const wantedBaseById = new Map<number, number>();
    for (const line of input.lines) {
      const factor = line.unitFactor ?? 1;
      const baseQty = round3(line.quantity * factor);
      if (line.productId == null) {
        if (line.packagingId != null || factor !== 1) {
          throw new Error(`Article libre sans conditionnement : « ${line.productName} ».`);
        }
        continue;
      }
      const q = qtyById.get(line.productId);
      if (q === undefined) throw new Error("Produit introuvable.");
      if (activeById.get(line.productId) !== true) {
        throw new Error(`Produit archivé : « ${line.productName} » — vente impossible.`);
      }
      if (line.packagingId != null) {
        const pack = packagingById.get(line.packagingId);
        // Même une conversion de devis exige une ligne de conditionnement
        // existante : la FK historique garantit que la snapshot reste lisible.
        if (!pack) {
          throw new Error(`Conditionnement introuvable pour « ${line.productName} ».`);
        }
        if (pack.productId !== line.productId) {
          throw new Error(`Conditionnement incohérent pour « ${line.productName} ».`);
        }
        if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
          throw new Error(`Nombre de cartons invalide pour « ${line.productName} ».`);
        }
        if (!input.trustedPackagingSnapshot) {
          if (!pack.active) {
            throw new Error(
              `Conditionnement indisponible pour « ${line.productName} » : retirez la ligne du panier.`,
            );
          }
          if (pack.factor !== factor) {
            throw new Error(
              `Taille du carton modifiée pour « ${line.productName} » : rafraîchissez le panier.`,
            );
          }
          if (!pack.auto) {
            throw new Error(`Tarif carton désactivé pour « ${line.productName} ».`);
          }
          if (line.unitPriceMinor !== pack.sellingPriceMinor) {
            throw new Error(
              `Tarif carton modifié pour « ${line.productName} » : rafraîchissez le panier.`,
            );
          }
          const expectedOriginal = round3((sellingById.get(line.productId) ?? 0) * pack.factor);
          if (line.originalUnitPriceMinor !== expectedOriginal) {
            throw new Error(
              `Prix du produit modifié pour « ${line.productName} » : rafraîchissez le panier.`,
            );
          }
        }
      } else if (factor !== 1) {
        throw new Error(`Facteur de conditionnement incohérent pour « ${line.productName} ».`);
      }
      const next = round3((wantedBaseById.get(line.productId) ?? 0) + baseQty);
      if (next > 1_000_000) {
        throw new Error(`Quantité totale trop élevée pour « ${line.productName} ».`);
      }
      wantedBaseById.set(line.productId, next);
    }
    for (const [pid, wantedBase] of wantedBaseById) {
      const available = qtyById.get(pid) ?? 0;
      if (wantedBase > available) {
        const name = input.lines.find((l) => l.productId === pid)?.productName ?? "?";
        throw new Error(`Stock insuffisant pour « ${name} ».`);
      }
    }
    // 2. invoice number: allocate if not provided (même transaction)
    let invoice = input.invoiceNumber;
    if (!invoice) {
      const company = db
        .prepare(`SELECT invoice_prefix FROM company_profile WHERE id = 1`)
        .get() as { invoice_prefix: string | null } | undefined;
      invoice = allocateInvoiceNumber(company?.invoice_prefix ?? "", input.now);
    }
    // 3. insert sale (0045 : accord dépassement figé sur la vente)
    const r = db
      .prepare(
        `INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, discount_type, discount_value_minor, discount_amount_minor, delivery_fee_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, payment_method, due_date, operation_id, is_cancelled, credit_limit_override, staff_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      )
      .run(
        input.uuid,
        invoice,
        input.customerId,
        input.subtotalMinor,
        input.discountType,
        // MONEY-ROOT (FIX-P1-02) : la garde ci-dessus garantit "none" ici —
        // montant entier arrondi, jamais de taux flottant.
        Math.round(input.discountValueMinor),
        // Σ remises de LIGNES : la remise globale d'un devis est répartie par
        // l'appelant (lineDiscounts) et son Σ est reporté ici (CHECK 0001:153).
        input.discountAmountMinor,
        input.deliveryFeeMinor,
        input.totalMinor,
        input.amountPaidMinor,
        input.remainingMinor,
        input.paymentStatus,
        input.paymentMethod,
        input.dueDate,
        input.operationId,
        input.limitOverrideApproved ? 1 : 0,
        input.staffUserId ?? null,
        input.now,
        input.now,
      );
    const saleId = Number(r.lastInsertRowid);
    // 4. items + FIFO consumption + stock movements + product qty
    // FIFO : chaque ligne consomme les couches les plus anciennes ; le coût
    // figé (cogs_minor) ne bougera plus jamais, même si les achats futurs
    // changent les coûts. Le prix de vente reste indépendant (unit_price_minor).
    // P0-7 : remise recalculée ici (original − final) × qty — jamais de valeur
    // remise venue du renderer ; vente sous coût FIFO → audit explicite.
    const belowCostLines: {
      productId: number | null;
      name: string;
      final: number;
      purchase: number;
    }[] = [];
    // Majorations (prix facturé > prix d'origine) : traces d'audit — la
    // remise de ligne devient négative (migration 0051) et le caissier doit
    // pouvoir justifier l'écart au prix catalogue.
    const raisedLines: {
      productId: number | null;
      name: string;
      final: number;
      original: number;
    }[] = [];
    input.lines.forEach((line, i) => {
      if (!Number.isInteger(line.originalUnitPriceMinor) || line.originalUnitPriceMinor < 0) {
        throw new Error(`Prix d'origine invalide pour « ${line.productName} ».`);
      }
      const charged = input.lineTotals[i] ?? 0;
      const categoryId = line.productId != null ? (categoryById.get(line.productId) ?? null) : null;
      const originalTotal = Math.round(line.originalUnitPriceMinor * line.quantity);
      // Remise de ligne : (original − facturé) × qté par défaut ; sinon la
      // répartition fournie par l'appelant (remise globale d'un devis).
      // Remise SIGNÉE (migration 0051) : négative = majoration (prix relevé
      // au-dessus du catalogue) ou facture au montant saisi (ADR-114).
      const lineDiscount = input.lineDiscounts
        ? (input.lineDiscounts[i] ?? 0)
        : originalTotal - charged;
      if (!Number.isSafeInteger(lineDiscount) || Math.abs(lineDiscount) > 100_000_000_000) {
        throw new Error(`Remise de ligne invalide pour « ${line.productName} ».`);
      }
      if (lineDiscount > originalTotal + 1) {
        throw new Error(`Remise de ligne supérieure au total pour « ${line.productName} ».`);
      }
      if (line.unitPriceMinor > line.originalUnitPriceMinor) {
        raisedLines.push({
          productId: line.productId,
          name: line.productName,
          final: line.unitPriceMinor,
          original: line.originalUnitPriceMinor,
        });
      }
      const factor = line.unitFactor ?? 1;
      const baseQty = round3(line.quantity * factor);
      const itemIns = db
        .prepare(
          `INSERT INTO sale_items (sale_id, product_id, product_name_snapshot, unit_code, original_unit_price_minor, unit_price_minor, purchase_price_minor, quantity, line_total_minor, discount_minor, category_id, packaging_id, unit_factor)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          saleId,
          line.productId,
          line.productName,
          line.unitCode,
          line.originalUnitPriceMinor,
          line.unitPriceMinor,
          line.purchasePriceMinor,
          line.quantity,
          charged,
          lineDiscount,
          categoryId,
          line.packagingId ?? null,
          factor,
        );
      const saleItemId = Number(itemIns.lastInsertRowid);
      if (line.productId != null) {
        // Survente autorisée : la part sans couche utilise le dernier coût connu
        // (dernière couche, sinon snapshot produit) — coût explicite, jamais vide.
        const fallback =
          latestUnitCost(line.productId) ??
          Math.max(0, Math.round(line.purchasePriceMinor / factor));
        const { cogsMinor } = consumeLayers({
          productId: line.productId,
          qty: baseQty,
          now: input.now,
          oversell: false,
          fallbackUnitCostMinor: fallback,
          record: { saleId, saleItemId },
        });
        // Sous-coût : comparé au COGS FIFO RÉEL de la ligne (le dernier prix
        // d'achat ignore les couches plus anciennes), après consommation.
        const cogsPerSaleUnit = line.quantity > 0 ? Math.round(cogsMinor / line.quantity) : 0;
        if (cogsMinor > 0 && charged < cogsMinor) {
          belowCostLines.push({
            productId: line.productId,
            name: line.productName,
            final: line.quantity > 0 ? Math.round(charged / line.quantity) : line.unitPriceMinor,
            purchase: cogsPerSaleUnit,
          });
        }
        // Snapshot de coût = COGS FIFO de la ligne : retours, annulations et
        // lectures historiques restent alignés sur la sortie réelle.
        db.prepare(
          `UPDATE sale_items SET cogs_minor = ?, purchase_price_minor = ? WHERE id = ?`,
        ).run(cogsMinor, cogsPerSaleUnit, saleItemId);
        const avgUnit = baseQty > 0 ? Math.round(cogsMinor / baseQty) : 0;
        // Quantité courante issue du préchargé (mis à jour ligne à ligne) :
        // aucun SELECT dans la boucle.
        const cur = qtyById.get(line.productId);
        if (cur === undefined) throw new Error("Produit introuvable.");
        const after = round3(cur - baseQty);
        // Garde quantité 0037 : même en survente autorisée, un stock négatif
        // est interdit — échec fermé AVANT l'UPDATE (le trigger reste le
        // dernier rempart, y compris contre le SQL direct).
        if (after < 0) {
          throw new Error(
            `Stock insuffisant pour « ${line.productName} » (survente refusée : stock négatif interdit).`,
          );
        }
        db.prepare(
          `UPDATE products SET quantity = ?, stock_status = CASE WHEN ? <= 0 THEN 'out_of_stock' WHEN ? <= min_stock_level THEN 'low_stock' ELSE 'in_stock' END, updated_at = ? WHERE id = ?`,
        ).run(after, after, after, input.now, line.productId);
        qtyById.set(line.productId, after);
        db.prepare(
          `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, unit_cost_minor, related_entity_type, related_entity_id, reason, staff_user_id, created_at)
           VALUES (?, ?, 'sale_out', ?, ?, ?, 'sale', ?, 'Vente', ?, ?)`,
        ).run(
          randomUUID(),
          line.productId,
          -baseQty,
          after,
          avgUnit,
          String(saleId),
          input.staffUserId ?? null,
          input.now,
        );
      }
    });
    // 5. payment row (if paid > 0)
    if (input.amountPaidMinor > 0) {
      db.prepare(
        `INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method, payment_date, staff_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        randomUUID(),
        saleId,
        input.customerId,
        input.amountPaidMinor,
        input.paymentMethod ?? "cash",
        input.now,
        input.staffUserId ?? null,
        input.now,
      );
    }
    // 6. customer balance (materialized, atomic + garde plafond anti-course :
    // sans accord vendeur, deux ventes concurrentes ne peuvent pas franchir
    // le plafond ensemble — changes==0 = refus explicite FR).
    if (input.customerId != null && input.remainingMinor !== 0) {
      const upd = db
        .prepare(
          `UPDATE customers SET outstanding_balance_minor = outstanding_balance_minor + ?, debt_status = ${debtStatusSql("outstanding_balance_minor + ?", "id")}, is_over_limit = CASE WHEN credit_limit_minor > 0 AND outstanding_balance_minor + ? > credit_limit_minor THEN 1 ELSE 0 END, updated_at = ? WHERE id = ? AND (? = 1 OR credit_limit_minor <= 0 OR outstanding_balance_minor + ? <= credit_limit_minor)`,
        )
        .run(
          input.remainingMinor,
          input.remainingMinor,
          input.remainingMinor,
          input.remainingMinor,
          input.now,
          input.customerId,
          input.limitOverrideApproved ? 1 : 0,
          input.remainingMinor,
        );
      if (Number(upd.changes) !== 1) {
        throw new Error(
          "Plafond de crédit dépassé : vente à crédit refusée (solde + reste > plafond). Accord vendeur requis.",
        );
      }
    }
    // 7. audit (avec lignes sous coût éventuelles — confirmation explicite caisse).
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at, actor_user_id) VALUES (?, 'sale.created', 'sale', ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(saleId),
      input.operationId,
      JSON.stringify({
        invoice,
        total: input.totalMinor,
        paid: input.amountPaidMinor,
        discount: input.discountAmountMinor,
        belowCostLines,
        raisedLines,
        limitOverride: input.limitOverrideApproved ? 1 : 0,
      }),
      input.now,
      input.staffUserId ?? null,
    );
    return { saleId, invoiceNumber: invoice };
  });
  try {
    return tx();
  } catch (err) {
    // Course rejouée : l'autre transaction a inséré le même operationId.
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: sales\.operation_id/i.test(err.message)
    ) {
      // #36 : doublon concurrent — relecture tracée, pas d'avalage.
      log("WARN", "sales", "operation_race_replayed", {
        operationId: input.operationId,
      });
      const retry = findExisting();
      if (retry) return retry;
    }
    // Course sur le numéro de facture (deux ventes concurrentes) : la séquence
    // a été annulée avec la transaction, on l'avance une fois en autocommit
    // puis on rejoue une seule fois (évite l'erreur visible « déjà utilisé »).
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: sales\.invoice_number/i.test(err.message)
    ) {
      log("WARN", "sales", "invoice_race_retry", {
        operationId: input.operationId,
      });
      try {
        db.prepare(
          `UPDATE number_sequences SET next_value = next_value + 1, updated_at = ? WHERE sequence_key = 'sale_invoice'`,
        ).run(input.now);
      } catch {
        /* avancement best-effort */
      }
      try {
        return tx();
      } catch (retryErr) {
        if (
          retryErr instanceof Error &&
          /UNIQUE constraint failed: sales\.operation_id/i.test(retryErr.message)
        ) {
          const retry = findExisting();
          if (retry) return retry;
        }
        throw retryErr;
      }
    }
    throw err;
  }
}

export function cancelSaleAtomic(saleId: number, now: string, operationId: string): void {
  const db = getDb();
  const fast = peekIdempotency<{ cancelled: boolean }>(operationId, "sales.cancel");
  if (fast) return;
  const tx = db.transaction(() => {
    claimIdempotency(operationId, "sales.cancel", now);
    const sale = db.prepare(`SELECT * FROM sales WHERE id = ?`).get(saleId) as
      Record<string, unknown> | undefined;
    if (!sale) throw new Error("Vente introuvable.");
    if (sale["is_cancelled"] === 1) throw new Error("Vente déjà annulée.");
    const liveReturns = db
      .prepare(
        `SELECT COUNT(*) AS n FROM returns WHERE original_sale_id = ? AND status != 'cancelled'`,
      )
      .get(saleId) as { n: number };
    if (Number(liveReturns.n) > 0) {
      throw new Error("Vente avec retours : annulez d'abord les retours.");
    }
    const items = db.prepare(`SELECT * FROM sale_items WHERE sale_id = ?`).all(saleId) as {
      id: number;
      product_id: number | null;
      quantity: number;
      purchase_price_minor: number;
      unit_factor: number;
    }[];
    // Annulation : le stock physique revient ET les couches consommées sont
    // restaurées à l'identique (l'historique des autres ventes reste intact).
    // Ventes antérieures à FIFO (sans traçabilité) ou part survendue : une
    // couche 'legacy' au coût snapshot préserve l'invariant couches = stock.
    const consumed = consumptionsOfSale(saleId);
    // restore stock — quantités préchargées (WHERE id IN), aucun SELECT
    // dans la boucle.
    const cancelIds = [
      ...new Set(items.filter((i) => i.product_id != null).map((i) => i.product_id as number)),
    ];
    const cancelQty = new Map<number, number>();
    if (cancelIds.length > 0) {
      const placeholders = cancelIds.map(() => "?").join(",");
      const rows = db
        .prepare(`SELECT id, quantity FROM products WHERE id IN (${placeholders})`)
        .all(...cancelIds) as { id: number; quantity: number }[];
      for (const r of rows) cancelQty.set(Number(r.id), Number(r.quantity));
    }
    for (const it of items) {
      if (it.product_id != null) {
        const factor =
          Number.isInteger(it.unit_factor) && Number(it.unit_factor) > 0
            ? Number(it.unit_factor)
            : 1;
        const baseQty = round3(Number(it.quantity) * factor);
        const cur = cancelQty.get(it.product_id);
        if (cur === undefined) throw new Error("Produit introuvable.");
        const after = round3(cur + baseQty);
        db.prepare(
          `UPDATE products SET quantity = ?, stock_status = CASE WHEN ? <= 0 THEN 'out_of_stock' WHEN ? <= min_stock_level THEN 'low_stock' ELSE 'in_stock' END, updated_at = ? WHERE id = ?`,
        ).run(after, after, after, now, it.product_id);
        cancelQty.set(it.product_id, after);
        const slices = consumed.filter(
          (c) => c.productId === it.product_id && c.saleItemId === it.id,
        );
        const restoredQty = slices
          .filter((c) => c.layerId != null)
          .reduce((a, c) => a + Number(c.quantity), 0);
        restoreToLayers(
          slices
            .filter((c) => c.layerId != null)
            .map((c) => ({ layerId: c.layerId as number, quantity: Number(c.quantity) })),
        );
        const missing = round3(baseQty - restoredQty);
        const purchasePerBase = Math.max(0, Math.round(Number(it.purchase_price_minor) / factor));
        if (missing > 0) {
          createLayer({
            productId: it.product_id,
            qty: missing,
            unitCostMinor: purchasePerBase,
            reason: "legacy",
            now,
          });
        }
        const restoredCost = slices.reduce(
          (a, c) => a + Math.round(Number(c.unitCostMinor) * Number(c.quantity)),
          0,
        );
        const avgUnit =
          baseQty > 0
            ? Math.round(
                (restoredCost + Math.round(purchasePerBase * Math.max(0, missing))) / baseQty,
              )
            : 0;
        db.prepare(
          `INSERT INTO stock_movements (uuid, product_id, movement_type, quantity_delta, quantity_after, unit_cost_minor, related_entity_type, related_entity_id, reason, created_at)
           VALUES (?, ?, 'sale_cancel_in', ?, ?, ?, 'sale', ?, 'Annulation vente', ?)`,
        ).run(randomUUID(), it.product_id, baseQty, after, avgUnit, String(saleId), now);
      }
    }
    // reverse customer balance by remaining (unpaid part) + recalcul du statut
    // (même règle que la création : un solde retombé à 0 redevient 'none').
    const remaining = Number(sale["remaining_balance_minor"] ?? 0);
    const customerId = sale["customer_id"] as number | null;
    // ENCAISSEMENT ANNULÉ (E-25) : la promesse UI est « le stock sera restauré
    // ET l'encaissement annulé ». Les lignes de paiement de la vente sont donc
    // supprimées (l'encaissement n'a jamais eu lieu) et la vente est remise à
    // zéro encaissé / reste = total pour une vente à crédit autorisée. Le
    // solde client ci-dessus n'est PAS touché par ce mouvement : le paiement
    // avait déjà réduit le solde de `amount_paid`, et le reliquat non encaissé
    // (remaining) est restitué ici.
    const paidMinor = Number(sale["amount_paid_minor"] ?? 0);
    if (paidMinor > 0) {
      db.prepare(`DELETE FROM sale_payments WHERE sale_id = ?`).run(saleId);
    }
    const totalMinor = Number(sale["total_minor"] ?? 0);
    // Le garde SQL 0051 interdit une créance (`remaining > 0`) sans client
    // `credit_allowed = 1`. Pour une vente sans client (ou client non autorisé),
    // le miroir « 0 encaissé / reste = total » était refusé par le trigger :
    // la vente annulée est donc soldée (aucune créance possible), et les
    // paiements restent supprimés. Ventes à crédit : miroir E-25 inchangé.
    const creditAllowed =
      customerId != null
        ? Number(
            (
              db.prepare(`SELECT credit_allowed FROM customers WHERE id = ?`).get(customerId) as
                { credit_allowed: number } | undefined
            )?.credit_allowed ?? 0,
          ) === 1
        : false;
    if (creditAllowed) {
      db.prepare(
        `UPDATE sales SET is_cancelled = 1, cancelled_at = ?, amount_paid_minor = 0, remaining_balance_minor = ?, payment_status = 'unpaid', updated_at = ? WHERE id = ?`,
      ).run(now, totalMinor, now, saleId);
    } else {
      db.prepare(
        `UPDATE sales SET is_cancelled = 1, cancelled_at = ?, amount_paid_minor = ?, remaining_balance_minor = 0, payment_status = 'paid', updated_at = ? WHERE id = ?`,
      ).run(now, totalMinor, now, saleId);
    }
    if (customerId != null && remaining !== 0) {
      // E-30 : le statut du client est recalculé APRÈS l'annulation de la
      // vente (une vente annulée n'est plus « ouverte » : le client ne peut
      // pas rester « en retard » sur une vente annulée).
      db.prepare(
        `UPDATE customers SET outstanding_balance_minor = outstanding_balance_minor - ?,
          debt_status = ${debtStatusSql("outstanding_balance_minor - ?", "id")},
          is_over_limit = CASE WHEN credit_limit_minor > 0 AND outstanding_balance_minor - ? > credit_limit_minor THEN 1 ELSE 0 END,
          updated_at = ? WHERE id = ?`,
      ).run(remaining, remaining, remaining, remaining, now, customerId);
    }
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'sale.cancelled', 'sale', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(saleId),
      operationId,
      JSON.stringify({ invoice: sale["invoice_number"] }),
      now,
    );
    storeIdempotencyResult(operationId, { cancelled: true });
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

// ---------------------------------------------------------------------------
// ADR-139 — « Modifier une vente » = annuler + rééditer (jamais de mutation
// d'une facture historique : stock, couches FIFO, soldes et paiements passent
// par l'annulation existante, puis les lignes sont rechargées dans un panier).
// ---------------------------------------------------------------------------

export interface SaleReopenLine {
  productId: number | null;
  productName: string;
  unitCode: string;
  originalUnitPriceMinor: number;
  unitPriceMinor: number;
  purchasePriceMinor: number;
  quantity: number;
  billedTotalMinor: number | null;
  packagingId: number | null;
  packagingLabelFr: string | null;
  packagingFactor: number | null;
  packagingSellingPriceMinor: number | null;
  packagingAutoCartonPricing: boolean;
  packagingPriceOverridden: boolean;
  stockQty: number | null;
}

export interface SaleReopenDraft {
  invoiceNumber: string;
  customerId: number | null;
  customerLabel: string;
  deliveryFeeMinor: number;
  lines: SaleReopenLine[];
}

interface ReopenProductRow {
  id: number;
  name: string;
  unit_code: string;
  quantity: number;
  selling_price_minor: number;
  is_active: number;
  fifo_next: number | null;
}

/** Lignes actuelles d'une vente → panier caisse (cartons + pièces). */
function buildReopenDraft(
  db: ReturnType<typeof getDb>,
  sale: Record<string, unknown>,
): SaleReopenDraft {
  const saleId = Number(sale["id"]);
  const items = db
    .prepare(`SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id ASC`)
    .all(saleId) as Record<string, unknown>[];
  if (items.length === 0) throw new Error("Vente sans ligne : rien à rééditer.");
  const productIds = [
    ...new Set(
      items
        .map((i) => i["product_id"])
        .filter((v): v is number => typeof v === "number" && Number.isInteger(v)),
    ),
  ];
  const products = new Map<number, ReopenProductRow>();
  if (productIds.length > 0) {
    const rows = db
      .prepare(
        `SELECT p.id, p.name, p.unit_code, p.quantity, p.selling_price_minor, p.is_active,
           (SELECT l.unit_cost_minor FROM inventory_layers l
             WHERE l.product_id = p.id AND l.remaining_quantity > 0
             ORDER BY l.id ASC LIMIT 1) AS fifo_next
         FROM products p WHERE p.id IN (${productIds.map(() => "?").join(",")})`,
      )
      .all(...productIds) as ReopenProductRow[];
    for (const r of rows) products.set(Number(r.id), r);
  }
  for (const it of items) {
    if (it["product_id"] == null) continue;
    const p = products.get(Number(it["product_id"]));
    if (!p) throw new Error(`Produit introuvable pour « ${String(it["product_name_snapshot"])} ».`);
    if (Number(p.is_active) !== 1) {
      throw new Error(`Produit « ${p.name} » archivé : réactivez-le avant de modifier la vente.`);
    }
  }
  // Prix unitaire de base connu via une ligne pièce du même produit (pour
  // reconstruire le tarif carton sans dépendre du prix catalogue actuel).
  const piecePrice = new Map<number, number>();
  for (const it of items) {
    const factor = Number(it["unit_factor"] ?? 1);
    if (it["product_id"] != null && factor <= 1) {
      const pid = Number(it["product_id"]);
      if (!piecePrice.has(pid)) piecePrice.set(pid, Number(it["unit_price_minor"]));
    }
  }
  const packagingIds = [
    ...new Set(
      items
        .map((i) => i["packaging_id"])
        .filter((v): v is number => typeof v === "number" && Number.isInteger(v)),
    ),
  ];
  const packagings = new Map<number, { label_fr: string; factor: number }>();
  if (packagingIds.length > 0) {
    const rows = db
      .prepare(
        `SELECT id, label_fr, factor FROM product_packagings WHERE id IN (${packagingIds.map(() => "?").join(",")})`,
      )
      .all(...packagingIds) as { id: number; label_fr: string; factor: number }[];
    for (const r of rows) packagings.set(Number(r.id), r);
  }
  // L'annulation restaure le stock APRÈS la projection : le panier doit voir
  // la quantité disponible finale (sinon une vente ayant vidé le stock
  // réapparaîtrait « en rupture » et bloquerait toute augmentation).
  const restoredByProduct = new Map<number, number>();
  for (const it of items) {
    if (it["product_id"] == null) continue;
    const pid = Number(it["product_id"]);
    const factorRaw = Number(it["unit_factor"] ?? 1);
    const factor = Number.isInteger(factorRaw) && factorRaw > 0 ? factorRaw : 1;
    restoredByProduct.set(
      pid,
      round3((restoredByProduct.get(pid) ?? 0) + Number(it["quantity"]) * factor),
    );
  }
  const lines: SaleReopenLine[] = items.map((it) => {
    const pid = it["product_id"] == null ? null : Number(it["product_id"]);
    const prod = pid == null ? undefined : products.get(pid);
    const qty = Number(it["quantity"]);
    const factorRaw = Number(it["unit_factor"] ?? 1);
    const factor = Number.isInteger(factorRaw) && factorRaw > 0 ? factorRaw : 1;
    const unit = Number(it["unit_price_minor"]);
    const original = Number(it["original_unit_price_minor"]) || unit;
    const total = Number(it["line_total_minor"]);
    const fifo = prod?.fifo_next == null ? null : Number(prod.fifo_next);
    // `sale_items.purchase_price_minor` = COGS par UNITÉ VENDUE (carton ou
    // pièce) : le ramener par unité de base pour le panier.
    const purchasePerBase =
      fifo ?? Math.max(0, Math.round(Number(it["purchase_price_minor"]) / factor));
    const base: Omit<SaleReopenLine, "quantity" | "billedTotalMinor"> = {
      productId: pid,
      productName: String(it["product_name_snapshot"]),
      // L'unité de base du produit (la ligne carton reste portée par les
      // métadonnées packaging, comme dans la caisse).
      unitCode: prod?.unit_code ?? String(it["unit_code"]),
      originalUnitPriceMinor: original,
      unitPriceMinor: unit,
      purchasePriceMinor: purchasePerBase,
      packagingId: null,
      packagingLabelFr: null,
      packagingFactor: null,
      packagingSellingPriceMinor: null,
      packagingAutoCartonPricing: false,
      packagingPriceOverridden: false,
      stockQty: prod
        ? round3(Number(prod.quantity) + (restoredByProduct.get(pid as number) ?? 0))
        : null,
    };
    if (factor > 1 && it["packaging_id"] != null) {
      // Ligne carton vendue (quantité = cartons) : le panier raisonne en
      // unités de base + métadonnées carton, comme la caisse.
      const pack = packagings.get(Number(it["packaging_id"]));
      let basePrice =
        piecePrice.get(pid as number) ?? (prod ? Number(prod.selling_price_minor) : 0);
      const packTotal = Math.round(basePrice * factor);
      // ADR-141 : plus de plancher (facteur−1) — un tarif de gros réel peut
      // être sous ce seuil. On garantit seulement que le carton reste moins
      // cher que le plein au prix pièce pour que la projection le rejoue.
      if (unit >= packTotal) {
        // Tarif carton historique supérieur au plein actuel : choisir un prix
        // pièce qui rend le tarif carton applicable tout en conservant le total.
        basePrice = Math.max(1, Math.floor(unit / factor) + 1);
      }
      return {
        ...base,
        quantity: round3(qty * factor),
        originalUnitPriceMinor: basePrice,
        unitPriceMinor: basePrice,
        billedTotalMinor: null,
        packagingId: Number(it["packaging_id"]),
        packagingLabelFr: pack?.label_fr ?? `Carton de ${factor}`,
        packagingFactor: factor,
        packagingSellingPriceMinor: unit,
        packagingAutoCartonPricing: true,
      };
    }
    // Mode « Montant » (ADR-114) : le total facturé différait de prix × qté.
    const billed = total === Math.round(unit * qty) ? null : total;
    return { ...base, quantity: qty, billedTotalMinor: billed };
  });
  const customerId = sale["customer_id"] == null ? null : Number(sale["customer_id"]);
  let customerLabel = "Client de passage";
  if (customerId != null) {
    const c = db.prepare(`SELECT search_name FROM customers WHERE id = ?`).get(customerId) as
      { search_name: string } | undefined;
    customerLabel = c?.search_name ?? customerLabel;
  }
  return {
    invoiceNumber: String(sale["invoice_number"]),
    customerId,
    customerLabel,
    deliveryFeeMinor: Number(sale["delivery_fee_minor"] ?? 0),
    lines,
  };
}

/**
 * Annule la vente puis renvoie son panier de réédition. Transaction unique :
 * une erreur (retours, produit archivé, etc.) ne laisse ni annulation ni
 * écriture partielle. Rejouer le même operationId renvoie le même panier.
 */
export function reopenSaleAtomic(
  saleId: number,
  now: string,
  operationId: string,
  staffUserId: number | null = null,
): SaleReopenDraft {
  const db = getDb();
  const fast = peekIdempotency<SaleReopenDraft>(operationId, "sales.reopen");
  if (fast) return fast;
  const tx = db.transaction(() => {
    claimIdempotency(operationId, "sales.reopen", now);
    const sale = db.prepare(`SELECT * FROM sales WHERE id = ?`).get(saleId) as
      Record<string, unknown> | undefined;
    if (!sale) throw new Error("Vente introuvable.");
    // Même périmètre auteur que la lecture du détail (0046) : un utilisateur
    // ne réédite que ses ventes (gérant = null = tout).
    if (staffUserId != null && sale["staff_user_id"] !== staffUserId) {
      throw new Error("Action non autorisée pour cet utilisateur.");
    }
    if (sale["is_cancelled"] === 1) throw new Error("Vente déjà annulée.");
    // Projection AVANT annulation : un produit archivé doit refuser sans
    // annuler la vente (l'annulation exige ses propres écritures).
    const draft = buildReopenDraft(db, sale);
    cancelSaleAtomic(saleId, now, `${operationId}:cancel`);
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'sale.reopened', 'sale', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      String(saleId),
      operationId,
      JSON.stringify({ invoice: sale["invoice_number"], lines: draft.lines.length }),
      now,
    );
    storeIdempotencyResult(operationId, draft);
    return draft;
  });
  try {
    return tx();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<SaleReopenDraft>(operationId, "sales.reopen");
      if (retry) return retry;
    }
    throw err;
  }
}
