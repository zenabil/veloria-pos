// Veloria PoS - IPC: ventes + paniers (extrait de registry.ts, deplacement pur).

import { IPC_CHANNELS } from "./channels";
import * as V from "./validators";
import { randomUUID } from "node:crypto";
import * as Sales from "./handlers/sales.repo";
import * as Carts from "./handlers/carts.repo";
import { getDb } from "../database/sqlite.service";
import { enqueueCustomerRefresh } from "../sync/sync.service";
import { handle } from "./handle";

export function registerSalesChannels(): void {
  // sales
  handle(IPC_CHANNELS["sales.create"], V.saleCreateSchema, (input) => {
    // Totaux recalculés côté main en arithmétique entière (défense en profondeur ;
    // le renderer valide déjà via le domaine, les CHECK SQL tranchent).
    // P0-7 : la remise vit dans les lignes �?" subtotal aux prix d'ORIGINE,
    // remise = Σ(original �^' final) �- qty (même règle que sale-rules).
    const now = new Date().toISOString();
    const priced = input.lines.map((l) => {
      // Garde-fou arithmétique entière (miroir du domaine money.ts, sans import
      // croisé main/renderer) : prix borné, quantité bornée, total plafonné.
      if (
        !Number.isSafeInteger(l.unitPriceMinor) ||
        l.unitPriceMinor < 0 ||
        l.unitPriceMinor > 1_000_000_000
      )
        throw new Error("Prix unitaire invalide.");
      if (
        !Number.isSafeInteger(l.originalUnitPriceMinor) ||
        l.originalUnitPriceMinor < 0 ||
        l.originalUnitPriceMinor > 1_000_000_000
      )
        throw new Error("Prix d'origine invalide.");
      if (!Number.isFinite(l.quantity) || l.quantity <= 0 || l.quantity > 1_000_000)
        throw new Error("Quantité invalide.");
      const charged = Math.round(l.unitPriceMinor * l.quantity);
      const original = Math.round(l.originalUnitPriceMinor * l.quantity);
      if (!Number.isSafeInteger(charged) || charged < 0 || charged > 100_000_000_000)
        throw new Error("Montant de ligne invalide.");
      if (!Number.isSafeInteger(original) || original < 0 || original > 100_000_000_000)
        throw new Error("Montant de ligne invalide.");
      return { line: l, charged, original, discount: original - charged };
    });
    const subtotal = priced.reduce((a, p) => a + p.original, 0);
    const discountAmount = priced.reduce((a, p) => a + p.discount, 0);
    const chargedTotals = priced.map((p) => p.charged);
    const total = subtotal - discountAmount + input.deliveryFeeMinor;
    const remaining = total - input.amountPaidMinor;
    const status =
      total === 0
        ? "paid"
        : remaining === 0
          ? "paid"
          : input.amountPaidMinor === 0
            ? "unpaid"
            : "partial";
    const settings = { allowNegativeStock: false };
    try {
      const row = getDb()
        .prepare(`SELECT value_json FROM app_settings WHERE key = 'inventory'`)
        .get() as { value_json: string } | undefined;
      if (row)
        settings.allowNegativeStock =
          (JSON.parse(row.value_json) as { allowNegativeStock?: boolean }).allowNegativeStock ===
          true;
    } catch {
      /* default */
    }
    const result = Sales.createSaleAtomic({
      operationId: input.operationId,
      uuid: randomUUID(),
      invoiceNumber: "",
      customerId: input.customerId ?? null,
      subtotalMinor: subtotal,
      // P0-7 : vente sans remise globale �?" la remise est portée par les lignes
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
      })),
      lineTotals: chargedTotals,
      now,
      allowNegativeStock: settings.allowNegativeStock,
    });
    // Miroir APK (best-effort) : la vente réussie rafraîchit la file du client
    // (jamais d'exception vers la caisse �?" loggé et ignoré dans le service).
    if (input.customerId != null) enqueueCustomerRefresh(input.customerId);
    return result;
  });
  handle(
    IPC_CHANNELS["sales.history"],
    V.paginationSchema.extend({ query: V.productSearchSchema.shape.query }),
    (input) => Sales.listSalesHistory(input.page, input.pageSize, input.query),
  );
  handle(IPC_CHANNELS["sales.cancel"], V.idempotentIdSchema, (input) => {
    Sales.cancelSaleAtomic(input.id, new Date().toISOString(), input.operationId);
    return { cancelled: true };
  });
  handle(IPC_CHANNELS["sales.get"], V.idSchema, (input) => Sales.getSaleDetail(input.id));
  handle(IPC_CHANNELS["sales.setDueDate"], V.saleDueDateSchema, (input) => {
    Sales.updateSaleDueDate(
      input.id,
      input.dueDate ?? null,
      new Date().toISOString(),
      input.operationId ?? null,
    );
    return { updated: true };
  });

  // P4 : brouillons paniers �?" lectures/écritures TOUJOURS ouvertes (brouillons
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
