// Veloria PoS - IPC: stock + fournisseurs + commandes (extrait de registry.ts, deplacement pur).

import { IPC_CHANNELS } from "./channels";
import * as V from "./validators";
import * as Inventory from "./handlers/inventory.repo";
import * as Suppliers from "./handlers/suppliers.repo";
import * as Purchase from "./handlers/purchases.repo";
import { handle } from "./handle";

export function registerStockChannels(): void {
  // ---- Phase 6 : stock ----
  handle(IPC_CHANNELS["stock.overview"], V.emptyPayloadSchema, () => Inventory.getStockOverview());
  handle(IPC_CHANNELS["stock.ledger"], V.idSchema, (input) => ({
    rows: Inventory.getLedger(input.id, 100),
  }));
  handle(IPC_CHANNELS["stock.adjust"], V.stockAdjustSchema, (input) =>
    Inventory.adjustStockAtomic({
      productId: input.productId,
      newQuantity: input.newQuantity,
      reason: input.reason,
      reference: input.reference ?? null,
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["stock.products"], V.stockProductsSchema, (input) =>
    Inventory.listStockProducts(input.query, input.page, input.pageSize, {
      categoryId: input.categoryId ?? null,
      stockStatus: input.stockStatus,
      movementType: input.movementType,
      sort: input.sort,
    }),
  );
  handle(IPC_CHANNELS["stock.movements"], V.stockMovementsSchema, (input) =>
    Inventory.listMovements(input.productId, input.page, input.pageSize, {
      from: input.from ?? null,
      to: input.to ?? null,
      types: input.types,
    }),
  );
  handle(IPC_CHANNELS["stock.inventory"], V.inventoryApplySchema, (input) =>
    Inventory.applyInventoryAtomic({
      items: input.items,
      reason: input.reason,
      reference: input.reference ?? null,
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["stock.intake"], V.stockIntakeSchema, (input) =>
    Inventory.receiveStockAtomic({
      supplierId: input.supplierId ?? null,
      invoiceNumber: input.invoiceNumber ?? null,
      invoiceDate: input.invoiceDate,
      shippingMinor: input.shippingMinor,
      notes: input.notes ?? null,
      lines: input.lines.map((l) => ({
        productId: l.productId ?? null,
        productName: l.productName,
        quantityReceived: l.quantityReceived,
        quantityDamaged: l.quantityDamaged,
        purchasePriceMinor: l.purchasePriceMinor,
        sellingPriceMinor: l.sellingPriceMinor ?? null,
      })),
      // Clé d'idempotence générée côté renderer (un UUID par facture) : rejouer
      // le même IPC retourne la réception existante sans double stock/dette.
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["stock.intakes"], V.paginationSchema, (input) =>
    Inventory.listIntakes(input.page, input.pageSize),
  );

  // ---- Phase 6 : fournisseurs ----
  handle(IPC_CHANNELS["suppliers.search"], V.supplierSearchSchema, (input) =>
    Suppliers.searchSuppliers(input.query, input.page, input.pageSize, {
      statusFilter: input.statusFilter,
      paymentFilter: input.paymentFilter,
      sort: input.sort,
    }),
  );
  handle(IPC_CHANNELS["suppliers.create"], V.supplierCreateSchema, (input) => ({
    id: Suppliers.createSupplier({
      operationId: input.operationId,
      name: input.name,
      code: input.code ?? null,
      contact: input.contact ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      taxNumber: input.taxNumber ?? null,
      commercialRegister: input.commercialRegister ?? null,
      notes: input.notes ?? null,
      isActive: input.isActive,
      now: new Date().toISOString(),
    }),
  }));
  handle(IPC_CHANNELS["suppliers.update"], V.supplierUpdateSchema, (input) => {
    Suppliers.updateSupplier({
      id: input.id,
      name: input.name,
      code: input.code ?? null,
      contact: input.contact ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      taxNumber: input.taxNumber ?? null,
      commercialRegister: input.commercialRegister ?? null,
      notes: input.notes ?? null,
      isActive: input.isActive,
      now: new Date().toISOString(),
      operationId: input.operationId ?? null,
    });
    return { updated: true };
  });
  handle(IPC_CHANNELS["suppliers.delete"], V.idempotentIdSchema, (input) => {
    Suppliers.deleteSupplierAtomic(input.id, new Date().toISOString(), input.operationId);
    return { deleted: true };
  });
  handle(IPC_CHANNELS["suppliers.deleteMany"], V.supplierDeleteManySchema, (input) =>
    Suppliers.deleteSuppliersAtomic(input.ids, new Date().toISOString(), input.operationId),
  );
  handle(IPC_CHANNELS["suppliers.pay"], V.supplierPaySchema, (input) => {
    const { paymentId } = Suppliers.recordSupplierPaymentAtomic({
      operationId: input.operationId,
      supplierId: input.supplierId,
      amountMinor: input.amountMinor,
      method: input.method,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      paymentDate: input.paymentDate,
      now: new Date().toISOString(),
    });
    return { paid: true, paymentId };
  });
  handle(IPC_CHANNELS["suppliers.statement"], V.idSchema, (input) =>
    Suppliers.getSupplierStatement(input.id),
  );
  handle(IPC_CHANNELS["suppliers.products"], V.idSchema, (input) =>
    Suppliers.getSupplierProducts(input.id),
  );
  handle(IPC_CHANNELS["suppliers.stats"], V.emptyPayloadSchema, () => Suppliers.getSupplierStats());

  // ---- P3 : bons de commande fournisseurs ----
  handle(IPC_CHANNELS["purchase.create"], V.purchaseCreateSchema, (input) =>
    Purchase.createPurchaseOrderAtomic({
      supplierId: input.supplierId,
      expectedDate: input.expectedDate ?? null,
      notes: input.notes ?? null,
      lines: input.lines.map((l) => ({
        productId: l.productId ?? null,
        productName: l.productName,
        unitCode: l.unitCode,
        quantityOrdered: l.quantityOrdered,
        unitCostMinor: l.unitCostMinor,
      })),
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
  handle(IPC_CHANNELS["purchase.list"], V.purchaseListSchema, (input) =>
    Purchase.listPurchaseOrders({
      supplierId: input.supplierId ?? null,
      status: input.status ?? null,
      page: input.page,
      pageSize: input.pageSize,
    }),
  );
  handle(IPC_CHANNELS["purchase.detail"], V.idSchema, (input) =>
    Purchase.getPurchaseOrder(input.id),
  );
  handle(IPC_CHANNELS["purchase.order"], V.idempotentIdSchema, (input) => {
    Purchase.orderPurchaseOrder(input.id, input.operationId, new Date().toISOString());
    return { ordered: true };
  });
  handle(IPC_CHANNELS["purchase.cancel"], V.idempotentIdSchema, (input) => {
    Purchase.cancelPurchaseOrder(input.id, input.operationId, new Date().toISOString());
    return { cancelled: true };
  });
  handle(IPC_CHANNELS["purchase.receive"], V.purchaseReceiveSchema, (input) =>
    Purchase.receivePurchaseOrderAtomic({
      id: input.id,
      lines: input.lines.map((l) => ({
        itemId: l.itemId,
        quantityReceived: l.quantityReceived,
      })),
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
}
