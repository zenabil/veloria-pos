// Veloria PoS — Application: product use cases (renderer orchestration).
import {
  validateProductDraft,
  normalizeUnitCode,
  type ProductDraft,
} from "@domain/product/product-rules.ts";
import { api } from "@shared/types/ipc-client.ts";

export async function createProductUseCase(draft: ProductDraft): Promise<{ id: number }> {
  const normalized: ProductDraft = {
    ...draft,
    name: draft.name.trim(),
    unitCode: normalizeUnitCode(draft.unitCode),
    barcodes: draft.barcodes.map((b) => b.trim()).filter(Boolean),
  };
  validateProductDraft(normalized);
  return (await api.productCreate({
    name: normalized.name,
    categoryId: normalized.categoryId,
    unitCode: normalized.unitCode,
    purchasePriceMinor: normalized.purchasePriceMinor,
    sellingPriceMinor: normalized.sellingPriceMinor,
    quantity: normalized.quantity,
    minStockLevel: normalized.minStockLevel,
    expirationDate: normalized.expirationDate,
    supplierId: normalized.supplierId,
    barcodes: normalized.barcodes,
  })) as { id: number };
}
