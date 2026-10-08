// Veloria PoS - IPC: retours + proformas + pain (extrait de registry.ts, deplacement pur).

import { IPC_CHANNELS } from "./channels";
import * as V from "./validators";
import * as Returns from "./handlers/returns.repo";
import * as Proformas from "./handlers/proformas.repo";
import * as Bread from "./handlers/bread.repo";
import { handle } from "./handle";

export function registerDocumentsChannels(): void {
  // returns (repository : handlers/returns.repo.ts �?" 1 tx atomique)
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
      });
    }
    if (input.saleId == null) throw new Error("Vente d'origine requise pour un retour client.");
    return Returns.createReturnAtomic({
      operationId: input.operationId,
      originalSaleId: input.saleId,
      items: input.items.map((i) => ({
        productId: i.productId ?? null,
        quantity: i.quantity,
        restocked: i.restocked,
        condition: i.condition,
      })),
      refundMinor: input.refundMinor,
      creditMinor: input.creditMinor,
      refundMethod: input.refundMinor > 0 ? (input.refundMethod ?? null) : null,
      reason: input.reason,
      notes: input.notes ?? null,
      createdAt,
      now,
    });
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

  // ---- Phase 9 : pain (simplifié + récurrence quotidienne) ----
  handle(IPC_CHANNELS["bread.create"], V.breadCreateSchema, (input) =>
    Bread.createBreadOrderAtomic({
      customerId: input.customerId ?? null,
      customName: input.customName ?? null,
      customPhone: input.customPhone ?? null,
      breadType: input.breadType,
      orderName: input.orderName ?? null,
      isRecurring: input.isRecurring,
      pickupDate: input.pickupDate,
      pickupTime: input.pickupTime ?? null,
      quantity: input.quantity,
      unitPriceMinor: input.unitPriceMinor,
      amountPaidMinor: input.amountPaidMinor,
      paymentMethod: input.paymentMethod ?? null,
      notes: input.notes ?? null,
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["bread.list"], V.breadListSchema, (input) =>
    Bread.listBreadOrders(input.pickupDate ?? null, input.page, input.pageSize, {
      query: input.query,
      status: input.status ?? null,
      customer: input.customer,
      recurring: input.recurring,
      orderFrom: input.orderFrom ?? null,
      orderTo: input.orderTo ?? null,
      pickupFrom: input.pickupFrom ?? null,
      pickupTo: input.pickupTo ?? null,
      sort: input.sort,
    }),
  );
  handle(IPC_CHANNELS["bread.pay"], V.breadPaySchema, (input) => {
    Bread.recordBreadPayment(
      input.id,
      input.amountMinor,
      input.method ?? null,
      new Date().toISOString(),
      input.operationId,
    );
    return { paid: true };
  });
  handle(IPC_CHANNELS["bread.update"], V.breadUpdateSchema, (input) => {
    Bread.updateBreadOrder({
      id: input.id,
      customerId: input.customerId ?? null,
      customName: input.customName ?? null,
      customPhone: input.customPhone ?? null,
      breadType: input.breadType,
      orderName: input.orderName ?? null,
      isRecurring: input.isRecurring,
      pickupDate: input.pickupDate,
      pickupTime: input.pickupTime ?? null,
      notes: input.notes ?? null,
      operationId: input.operationId,
      now: new Date().toISOString(),
    });
    return { updated: true };
  });
  handle(IPC_CHANNELS["bread.status"], V.breadStatusSchema, (input) => {
    Bread.setBreadOrderStatus(input.id, input.to, new Date().toISOString(), input.operationId);
    return { updated: true };
  });
  handle(IPC_CHANNELS["bread.stats"], V.emptyPayloadSchema, () => Bread.getBreadStats());
  handle(IPC_CHANNELS["bread.detail"], V.idSchema, (input) => Bread.getBreadOrder(input.id));
  handle(IPC_CHANNELS["bread.transfer"], V.breadTransferSchema, (input) => {
    Bread.transferBreadToCustomerAccount(input.id, new Date().toISOString(), input.operationId);
    return { transferred: true };
  });
  handle(IPC_CHANNELS["bread.updateQty"], V.breadUpdateQtySchema, (input) => {
    Bread.updateBreadQuantity(
      input.id,
      input.quantity,
      new Date().toISOString(),
      input.operationId,
    );
    return { updated: true };
  });
  handle(IPC_CHANNELS["bread.convert"], V.idempotentIdSchema, (input) =>
    Bread.convertBreadToSaleAtomic({
      breadId: input.id,
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
}
