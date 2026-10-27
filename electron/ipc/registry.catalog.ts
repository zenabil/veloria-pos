// Veloria PoS - IPC: catalogue produits + categories (extrait de registry.ts, deplacement pur).

import { IPC_CHANNELS } from "./channels";
import * as V from "./validators";
import { randomUUID } from "node:crypto";
import * as Products from "./handlers/products.repo";
import * as Packagings from "./handlers/packagings.repo";
import { getCurrentStaffUser } from "./handlers/staff-session";
import { handle } from "./handle";

export function registerCatalogChannels(): void {
  // products
  handle(IPC_CHANNELS["products.search"], V.productSearchSchema, (input) =>
    Products.searchProducts({
      query: input.query,
      categoryId: input.categoryId ?? null,
      stockFilter: input.stockFilter,
      includeArchived: input.includeArchived,
      page: input.page,
      pageSize: input.pageSize,
    }),
  );
  handle(IPC_CHANNELS["products.restore"], V.idempotentIdSchema, (input) => {
    Products.restoreProduct(input.id, new Date().toISOString(), input.operationId);
    return { restored: true };
  });
  handle(IPC_CHANNELS["products.getByBarcode"], V.barcodeSchema, (input) => ({
    product: Products.getProductByBarcode(input.barcode.trim()),
  }));
  handle(IPC_CHANNELS["products.matchBatch"], V.productsMatchBatchSchema, (input) => ({
    results: Products.matchProductsBatch(
      input.items.map((i) => ({ barcode: i.barcode ?? null, name: i.name })),
    ),
  }));
  handle(IPC_CHANNELS["products.barcodes"], V.idSchema, (input) => ({
    rows: Products.getProductBarcodes(input.id),
  }));
  handle(IPC_CHANNELS["products.create"], V.productCreateSchema, (input) => {
    const now = new Date().toISOString();
    const id = Products.createProduct({
      uuid: randomUUID(),
      operationId: input.operationId,
      name: input.name,
      categoryId: input.categoryId ?? null,
      unitCode: input.unitCode,
      purchasePriceMinor: input.purchasePriceMinor,
      sellingPriceMinor: input.sellingPriceMinor,
      quantity: input.quantity,
      minStockLevel: input.minStockLevel,
      maxStockLevel: input.maxStockLevel,
      expirationDate: input.expirationDate ?? null,
      supplierId: input.supplierId ?? null,
      barcodes: input.barcodes,
      now,
    });
    return { id };
  });
  handle(IPC_CHANNELS["products.update"], V.productUpdateSchema, (input) => {
    Products.updateProduct({
      id: input.id,
      name: input.name,
      categoryId: input.categoryId ?? null,
      unitCode: input.unitCode,
      purchasePriceMinor: input.purchasePriceMinor,
      sellingPriceMinor: input.sellingPriceMinor,
      quantity: input.quantity,
      minStockLevel: input.minStockLevel,
      maxStockLevel: input.maxStockLevel,
      expirationDate: input.expirationDate ?? null,
      supplierId: input.supplierId ?? null,
      barcodes: input.barcodes,
      now: new Date().toISOString(),
      operationId: input.operationId ?? null,
      staffUserId: getCurrentStaffUser(),
    });
    return { updated: true };
  });
  handle(IPC_CHANNELS["products.archive"], V.idempotentIdSchema, (input) => {
    Products.archiveProduct(input.id, new Date().toISOString(), input.operationId);
    return { archived: true };
  });
  handle(IPC_CHANNELS["products.delete"], V.idempotentIdSchema, (input) => {
    Products.deleteProductAtomic(input.id, new Date().toISOString(), input.operationId);
    return { deleted: true };
  });
  handle(IPC_CHANNELS["products.suppliers"], V.idSchema, (input) => ({
    rows: Products.getProductSuppliers(input.id),
  }));
  handle(IPC_CHANNELS["products.setSuppliers"], V.productSuppliersSchema, (input) =>
    Products.setProductSuppliersAtomic(
      input.productId,
      input.supplierIds,
      new Date().toISOString(),
      input.operationId ?? null,
    ),
  );

  // conditionnements produit (cartons)
  handle(IPC_CHANNELS["products.packagings.list"], V.packagingListSchema, (input) => ({
    rows: Packagings.listProductPackagings(input.productId),
  }));
  handle(IPC_CHANNELS["products.packagings.save"], V.packagingSaveSchema, (input) =>
    Packagings.saveProductPackagingAtomic({
      operationId: input.operationId,
      productId: input.productId,
      labelFr: input.labelFr,
      factor: input.factor,
      sellingPriceMinor: input.sellingPriceMinor,
      purchasePriceMinor: input.purchasePriceMinor,
      autoCartonPricing: input.autoCartonPricing,
      cartonBarcodes: input.cartonBarcodes,
      now: new Date().toISOString(),
      staffUserId: getCurrentStaffUser(),
    }),
  );
  handle(IPC_CHANNELS["products.packagings.delete"], V.packagingDeleteSchema, (input) =>
    Packagings.deleteProductPackagingAtomic({
      operationId: input.operationId,
      productId: input.productId,
      now: new Date().toISOString(),
      staffUserId: getCurrentStaffUser(),
    }),
  );

  // categories (filtre catalogue)
  handle(IPC_CHANNELS["categories.list"], V.emptyPayloadSchema, () => ({
    rows: Products.listCategories(),
  }));
  handle(IPC_CHANNELS["categories.create"], V.categoryCreateSchema, (input) => ({
    id: Products.createCategory(input.name, new Date().toISOString(), input.operationId ?? null),
  }));
}
