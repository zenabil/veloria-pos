// Veloria PoS — Garde R1 (conseil llm-council) : inventaire gelé des schémas
// exigeant `operationId` (mutations monétaires) vs exception documentée LWW
// (mises à jour last-write-wins, brouillons, réglages). Toute évolution de ces
// listes exige un ADR (compat IPC) — le test échoue sinon.
import { describe, it, expect } from "vitest";
import { schemaRequiresOperationId } from "../../electron/ipc/validators.common";
import * as Sales from "../../electron/ipc/validators.sales";
import * as Stock from "../../electron/ipc/validators.stock";
import * as Customers from "../../electron/ipc/validators.customers";
import * as Finance from "../../electron/ipc/validators.finance";
import * as Catalog from "../../electron/ipc/validators.catalog";
import * as Settings from "../../electron/ipc/validators.settings";
import * as Documents from "../../electron/ipc/validators.documents";

// Mutations monétaires/stock : operationId REQUIS (exactement-une-fois).
const REQUIRED = [
  ["sales", Sales.saleCreateSchema],
  ["stock", Stock.stockAdjustSchema],
  ["stock", Stock.stockIntakeSchema],
  ["stock", Stock.inventoryApplySchema],
  ["stock", Stock.supplierCreateSchema],
  ["stock", Stock.supplierPaySchema],
  ["stock", Stock.purchaseCreateSchema],
  ["stock", Stock.purchaseReceiveSchema],
  ["customers", Customers.customerCreateSchema],
  ["customers", Customers.clientAccessActivateSchema],
  ["finance", Finance.recordPaymentSchema],
  ["finance", Finance.expenseCreateSchema],
  ["finance", Finance.closingCreateSchema],
  ["finance", Finance.zakatCalculationSchema],
  ["catalog", Catalog.productCreateSchema],
  ["catalog", Catalog.productsImportSchema],
  ["documents", Documents.returnCreateSchema],
  ["documents", Documents.returnRefundSchema],
  ["documents", Documents.proformaCreateSchema],
  ["documents", Documents.proformaConvertSchema],
] as const;

// Exception LWW documentée (ADR-074) : mises à jour/brouillons/réglages,
// rejouables par nature — compat legacy, `peekOptional` no-op volontaire.
const OPTIONAL_EXCEPTION = [
  ["catalog", Catalog.productUpdateSchema],
  ["catalog", Catalog.categoryCreateSchema],
  ["catalog", Catalog.productSuppliersSchema],
  ["customers", Customers.customerUpdateSchema],
  ["stock", Stock.supplierUpdateSchema],
  ["finance", Finance.saleDueDateSchema],
  ["finance", Finance.zakatParamsSchema],
  ["finance", Finance.companyUpdateSchema],
  ["finance", Finance.expenseUpdateSchema],
  ["sales", Sales.cartsSaveSchema],
  ["documents", Documents.proformaUpdateSchema],
  ["settings", Settings.inventorySettingsSchema],
  ["settings", Settings.salesSettingsSchema],
  ["settings", Settings.invoiceSettingsSchema],
  ["settings", Settings.printingSettingsSchema],
  ["settings", Settings.productsSettingsSchema],
  ["settings", Settings.customersSettingsSchema],
  ["settings", Settings.suppliersSettingsSchema],
  ["settings", Settings.soundSettingsSchema],
  ["settings", Settings.settingsSaveSchema],
] as const;

describe("operationId R1 : inventaire gelé requis vs exception LWW", () => {
  it("mutations monétaires exigent operationId", () => {
    for (const [ns, schema] of REQUIRED) {
      expect(schemaRequiresOperationId(schema), ns).toBe(true);
    }
  });
  it("exception LWW reste optionnelle (gelée, ADR-074)", () => {
    for (const [ns, schema] of OPTIONAL_EXCEPTION) {
      expect(schemaRequiresOperationId(schema), ns).toBe(false);
    }
  });
});
