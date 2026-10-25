// Veloria PoS - IPC: retours + proformas (extrait de registry.ts, deplacement pur).

import { IPC_CHANNELS } from "./channels";
import * as V from "./validators";
import * as Returns from "./handlers/returns.repo";
import * as Proformas from "./handlers/proformas.repo";
import { getCurrentStaffUser } from "./handlers/staff-session";
import { enqueueSaleRefresh } from "../sync/sync.service";
import { handle } from "./handle";

export function registerDocumentsChannels(): void {
  // returns (repository : handlers/returns.repo.ts — 1 tx atomique)
  handle(IPC_CHANNELS["returns.create"], V.returnCreateSchema, (input) => {
    const now = new Date().toISOString();
    const createdAt = input.returnDate ? `${input.returnDate}T00:00:00.000Z` : now;
    if (input.kind === "supplier") {
      if (input.intakeId == null) throw new Error("Bon d'achat requis pour un retour fournisseur.");
      return Returns.createSupplierReturnAtomic({
        operationId: input.operationId,
        intakeId: input.intakeId,
        items: input.items.map((i) => ({
          productId: i.productId ?? null,
          quantity: i.quantity,
          condition: i.condition,
        })),
        recoverMinor: input.refundMinor,
        recoverMethod: input.refundMinor > 0 ? (input.refundMethod ?? null) : null,
        reason: input.reason,
        notes: input.notes ?? null,
        createdAt,
        now,
        staffUserId: getCurrentStaffUser(),
      });
    }
    if (input.saleId == null) throw new Error("Vente d'origine requise pour un retour client.");
    const result = Returns.createReturnAtomic({
      operationId: input.operationId,
      originalSaleId: input.saleId,
      items: input.items.map((i) => ({
        productId: i.productId ?? null,
        quantity: i.quantity,
        restocked: i.restocked,
        condition: i.condition,
        unitFactor: i.unitFactor,
      })),
      refundMinor: input.refundMinor,
      creditMinor: input.creditMinor,
      refundMethod: input.refundMinor > 0 ? (input.refundMethod ?? null) : null,
      reason: input.reason,
      notes: input.notes ?? null,
      createdAt,
      now,
      // R2 (0046) : le retour porte son auteur.
      staffUserId: getCurrentStaffUser(),
    });
    // Le retour change le solde/les documents du client : rafraîchir le miroir APK.
    enqueueSaleRefresh(input.saleId);
    return result;
  });
  handle(IPC_CHANNELS["returns.list"], V.returnListSchema, (input) =>
    Returns.listReturnsUnified(input.query, input.page, input.pageSize, {
      typeFilter: input.typeFilter,
      statusFilter: input.statusFilter,
      from: input.from ?? null,
      to: input.to ?? null,
      sort: input.sort,
    }),
  );
  handle(IPC_CHANNELS["returns.detail"], V.returnTargetSchema, (input) =>
    Returns.getReturnDetail(input.kind, input.id),
  );
  handle(IPC_CHANNELS["returns.saleItems"], V.idSchema, (input) =>
    Returns.getReturnableSaleItems(input.id),
  );
  handle(IPC_CHANNELS["returns.intakeItems"], V.idSchema, (input) =>
    Returns.getReturnableIntakeItems(input.id),
  );
  handle(IPC_CHANNELS["returns.refund"], V.returnRefundSchema, (input) => {
    Returns.recordReturnRefundAtomic({
      kind: input.kind,
      id: input.id,
      amountMinor: input.amountMinor,
      method: input.method,
      now: new Date().toISOString(),
      operationId: input.operationId,
    });
    return { refunded: true };
  });
  handle(IPC_CHANNELS["returns.cancel"], V.returnCancelSchema, (input) => {
    Returns.cancelReturnAtomic({
      kind: input.kind,
      id: input.id,
      now: new Date().toISOString(),
      operationId: input.operationId,
    });
    return { cancelled: true };
  });
  handle(IPC_CHANNELS["returns.stats"], V.emptyPayloadSchema, () => Returns.getReturnsStats());

  // Printing IPC is owned by electron/printing/printing.service.ts
  // (registerPrintingIpc). Do NOT register printing.* channels here:
  // ipcMain.handle throws on duplicate registration and aborts startup
  // before createMainWindow (found during Phase 3 runtime QA).

  // ---- Phase 7 : proformas ----
  handle(IPC_CHANNELS["proformas.create"], V.proformaCreateSchema, (input) =>
    Proformas.createProformaAtomic({
      customerId: input.customerId ?? null,
      lines: input.lines.map((l) => ({
        productId: l.productId ?? null,
        productName: l.productName,
        unitPriceMinor: l.unitPriceMinor,
        quantity: l.quantity,
        billedTotalMinor: l.billedTotalMinor ?? null,
      })),
      discountMinor: input.discountMinor,
      deliveryMinor: input.deliveryMinor,
      dueDate: input.dueDate ?? null,
      notes: input.notes ?? null,
      terms: input.terms ?? null,
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["proformas.list"], V.proformaListSchema, (input) =>
    Proformas.listProformas(input.status ?? null, input.page, input.pageSize, {
      query: input.query,
      customer: input.customerId ?? null,
      from: input.from ?? null,
      to: input.to ?? null,
      sort: input.sort,
    }),
  );
  handle(IPC_CHANNELS["proformas.status"], V.proformaStatusSchema, (input) => {
    Proformas.setProformaStatus(
      input.id,
      input.to,
      new Date().toISOString(),
      input.operationId ?? null,
    );
    return { updated: true };
  });
  handle(IPC_CHANNELS["proformas.convert"], V.proformaConvertSchema, (input) =>
    Proformas.convertProformaToSaleAtomic({
      proformaId: input.proformaId,
      amountPaidMinor: input.amountPaidMinor,
      paymentMethod: input.paymentMethod ?? null,
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["proformas.update"], V.proformaUpdateSchema, (input) => {
    Proformas.updateProformaAtomic({
      id: input.id,
      customerId: input.customerId ?? null,
      lines: input.lines.map((l) => ({
        productId: l.productId ?? null,
        productName: l.productName,
        unitPriceMinor: l.unitPriceMinor,
        quantity: l.quantity,
        billedTotalMinor: l.billedTotalMinor ?? null,
      })),
      discountMinor: input.discountMinor,
      deliveryMinor: input.deliveryMinor,
      dueDate: input.dueDate ?? null,
      notes: input.notes ?? null,
      terms: input.terms ?? null,
      now: new Date().toISOString(),
      operationId: input.operationId ?? null,
    });
    return { updated: true };
  });
  handle(IPC_CHANNELS["proformas.delete"], V.idempotentIdSchema, (input) => {
    Proformas.deleteProformaAtomic(input.id, new Date().toISOString(), input.operationId);
    return { deleted: true };
  });
  handle(IPC_CHANNELS["proformas.detail"], V.idSchema, (input) =>
    Proformas.getProformaDetail(input.id),
  );
  handle(IPC_CHANNELS["proformas.stats"], V.emptyPayloadSchema, () => Proformas.getProformaStats());
}
