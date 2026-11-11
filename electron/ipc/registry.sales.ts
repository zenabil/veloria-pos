// Veloria PoS - IPC: ventes + paniers (extrait de registry.ts, deplacement pur).

import { IPC_CHANNELS } from "./channels";
import * as V from "./validators";
import { randomUUID } from "node:crypto";
import * as Sales from "./handlers/sales.repo";
import * as Carts from "./handlers/carts.repo";
import { getCurrentStaffUser } from "./handlers/staff-session";
import { getStaffRole } from "./handlers/staff.repo";
import { enqueueSaleRefresh } from "../sync/sync.service";
import { handle } from "./handle";
import { priceLine } from "./money-guard";

/** Périmètre auteur 0046 : null = gérant (tout), sinon id de l'utilisateur. */
function staffScope(): number | null {
  const id = getCurrentStaffUser();
  if (id == null) return null;
  return getStaffRole(id) === "manager" ? null : id;
}

export function registerSalesChannels(): void {
  // sales
  handle(IPC_CHANNELS["sales.create"], V.saleCreateSchema, (input) => {
    // Totaux recalculés côté main en arithmétique entière (défense en profondeur ;
    // le renderer valide déjà via le domaine, les CHECK SQL tranchent).
    // P0-7 : la remise vit dans les lignes — subtotal aux prix d'ORIGINE,
    // remise = Σ(original − final) × qty (même règle que sale-rules).
    const now = new Date().toISOString();
    // R7 RADICAL : arithmétique entière via money-guard (source unique main,
    // parité prouvée avec le domaine — plus de littéraux 1e9/1e11 ici).
    const priced = input.lines.map((l) => {
      const p = priceLine({
        unitPriceMinor: l.unitPriceMinor,
        originalUnitPriceMinor: l.originalUnitPriceMinor,
        quantity: l.quantity,
        // ADR-114 (mode « Montant ») : montant facturé exact de la ligne.
        billedTotalMinor: l.billedTotalMinor ?? null,
      });
      return { line: l, ...p };
    });
    const subtotal = priced.reduce((a, p) => a + p.original, 0);
    const discountAmount = priced.reduce((a, p) => a + p.discount, 0);
    const chargedTotals = priced.map((p) => p.charged);
    const total = subtotal - discountAmount + input.deliveryFeeMinor;
    // I-04 : garde explicite FR — sans elle, le CHECK SQL rejette en brut
    // générique (« erreur inattendue ») au lieu d'expliquer le dépassement.
    if (!Number.isSafeInteger(input.amountPaidMinor) || input.amountPaidMinor < 0) {
      throw new Error("Montant payé invalide.");
    }
    if (input.amountPaidMinor > total) {
      throw new Error("Le montant payé dépasse le total de la vente.");
    }
    const remaining = total - input.amountPaidMinor;
    const status =
      total === 0
        ? "paid"
        : remaining === 0
          ? "paid"
          : input.amountPaidMinor === 0
            ? "unpaid"
            : "partial";
    const result = Sales.createSaleAtomic({
      operationId: input.operationId,
      uuid: randomUUID(),
      invoiceNumber: "",
      customerId: input.customerId ?? null,
      limitOverrideApproved: input.limitOverrideApproved,
      subtotalMinor: subtotal,
      // P0-7 : vente sans remise globale — la remise est portée par les lignes
      // (discount_amount_minor = Σ remises de lignes, colonnes conservées).
      discountType: "none",
      discountValueMinor: 0,
      discountAmountMinor: discountAmount,
      deliveryFeeMinor: input.deliveryFeeMinor,
      totalMinor: total,
      amountPaidMinor: input.amountPaidMinor,
      remainingMinor: remaining,
      paymentStatus: status,
      paymentMethod: input.paymentMethod ?? (input.amountPaidMinor > 0 ? "cash" : null),
      dueDate: input.dueDate ?? null,
      lines: input.lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        unitCode: l.unitCode,
        originalUnitPriceMinor: l.originalUnitPriceMinor,
        unitPriceMinor: l.unitPriceMinor,
        purchasePriceMinor: l.purchasePriceMinor,
        quantity: l.quantity,
        billedTotalMinor: l.billedTotalMinor ?? null,
        packagingId: l.packagingId ?? null,
        unitFactor: l.unitFactor,
      })),
      lineTotals: chargedTotals,
      now,
      // ADR-182 : commande client servie par cette vente (la liaison se fait
      // DANS la transaction de la vente).
      clientOrderId: input.clientOrderId ?? null,
      // Stock négatif interdit par la base (0037) : paramètre historique figé.
      allowNegativeStock: false,
      // R2 (0046) : la vente porte son auteur (filtrage tableau/historique/rapports).
      staffUserId: getCurrentStaffUser(),
    });
    // Miroir APK (best-effort) : la vente réussie pousse les listes ET le
    // détail de la facture (page détail APK). `enqueueCustomerRefresh` seul
    // laissait toute nouvelle facture sans cliché de détail dans le miroir.
    if (input.customerId != null) enqueueSaleRefresh(result.saleId);
    return result;
  });
  handle(
    IPC_CHANNELS["sales.history"],
    V.paginationSchema.extend({ query: V.productSearchSchema.shape.query }),
    (input) => Sales.listSalesHistory(input.page, input.pageSize, input.query, staffScope()),
  );
  handle(IPC_CHANNELS["sales.cancel"], V.idempotentIdSchema, (input) => {
    Sales.cancelSaleAtomic(input.id, new Date().toISOString(), input.operationId);
    enqueueSaleRefresh(input.id);
    return { cancelled: true };
  });
  // ADR-139 : « Modifier » = annuler + renvoyer le panier de réédition.
  handle(IPC_CHANNELS["sales.reopen"], V.idempotentIdSchema, (input) => {
    const draft = Sales.reopenSaleAtomic(
      input.id,
      new Date().toISOString(),
      input.operationId,
      staffScope(),
    );
    enqueueSaleRefresh(input.id);
    return draft;
  });
  handle(IPC_CHANNELS["sales.get"], V.idSchema, (input) =>
    Sales.getSaleDetail(input.id, staffScope()),
  );
  handle(IPC_CHANNELS["sales.setDueDate"], V.saleDueDateSchema, (input) => {
    Sales.updateSaleDueDate(
      input.id,
      input.dueDate ?? null,
      new Date().toISOString(),
      input.operationId ?? null,
    );
    return { updated: true };
  });

  // P4 : brouillons paniers — lectures/écritures TOUJOURS ouvertes (brouillons
  // éphémères : un poste expiré restaure son travail et peut se réactiver ;
  // la VENTE elle-même reste gardée par sales.create).
  // RADICAL-FIX: operationId optionnel honoré (retry = no-op, pas de double DELETE+INSERT).
  handle(IPC_CHANNELS["carts.save"], V.cartsSaveSchema, (input) =>
    Carts.saveCartDraftsAtomic(
      input.tabs.map((t) => ({
        ...t,
        customerId: t.customerId ?? null,
        paymentMethod: t.paymentMethod ?? null,
      })),
      new Date().toISOString(),
      input.operationId ?? null,
    ),
  );
  handle(IPC_CHANNELS["carts.load"], V.emptyPayloadSchema, () => ({
    tabs: Carts.loadCartDrafts(),
  }));
}
