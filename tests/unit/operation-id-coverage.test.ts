// Veloria PoS — Garde R1 (conseil llm-council) : inventaire gelé des schémas
// exigeant `operationId` (mutations monétaires) vs exception documentée LWW
// (mises à jour last-write-wins, brouillons, réglages). Toute évolution de ces
// listes exige un ADR (compat IPC) — le test échoue sinon.
//
// W4 / I-02 (audit 2026-10-19) : la garde ne prouvait PAS son exhaustivité
// (42 schémas classés sur 120). Un schéma financier NOUVEL exigant un
// `operationId` et oublié dans la liste passait inaperçu. La classification
// est désormais COMPLÈTE : les 121 schémas du main sont classés, et chaque
// schéma non listé est vérifié « n'exige PAS operationId ».
import { describe, it, expect } from "vitest";
import * as V from "../../electron/ipc/validators";
import { schemaRequiresOperationId } from "../../electron/ipc/validators.common";

/**
 * Mutations monétaires/stock/équipe : operationId REQUIS (exactement-une-fois).
 * Liste GELÉE (43 schémas) — toute évolution = ADR.
 */
const REQUIRED_NAMES: readonly string[] = [
  "announcementSaveSchema",
  "backupRestoreSchema",
  "cashSessionCloseSchema",
  "cashSessionCountSchema",
  "cashSessionOpenSchema",
  "clientAccessActivateSchema",
  "closingCreateSchema",
  "closingReopenSchema",
  "customerCreateSchema",
  "customersImportSchema",
  "databaseResetSchema",
  "expenseCreateSchema",
  "expenseDeleteSchema",
  "idempotentIdSchema",
  "inventoryApplySchema",
  "ownerAccountSaveSchema",
  "packagingDeleteSchema",
  "packagingSaveSchema",
  "productCreateSchema",
  "productsImportSchema",
  "proformaConvertSchema",
  "proformaCreateSchema",
  "purchaseCreateSchema",
  "purchaseReceiveSchema",
  "recordPaymentSchema",
  "relocateSchema",
  "returnCancelSchema",
  "returnCreateSchema",
  "returnRefundSchema",
  "saleCreateSchema",
  "staffChangeCodeSchema",
  "staffCreateSchema",
  "staffRecoverSchema",
  "staffRegenRecoverySchema",
  "staffSetActiveSchema",
  "staffSetPermissionsSchema",
  "stockAdjustSchema",
  "stockIntakeSchema",
  "supplierCreateSchema",
  "supplierDeleteManySchema",
  "supplierPaySchema",
  "syncConfigSchema",
  "syncEnqueueSchema",
  "syncOwnerPushSchema",
  "syncPushNowSchema",
  "templateActivateSchema",
  "templateRemoveSchema",
  "templateResetSchema",
  "templateSaveSchema",
  "templateTestPrintSchema",
  "zakatCalculationSchema",
];

/**
 * Exception LWW documentée (ADR-074) : mises à jour/brouillons/réglages,
 * rejouables par nature — compat legacy, `peekOptional` no-op volontaire.
 */
const OPTIONAL_EXCEPTION_NAMES: readonly string[] = [
  "productUpdateSchema",
  "categoryCreateSchema",
  "productSuppliersSchema",
  "customerUpdateSchema",
  "supplierUpdateSchema",
  "saleDueDateSchema",
  "zakatParamsSchema",
  "companyUpdateSchema",
  "expenseUpdateSchema",
  "cartsSaveSchema",
  "proformaUpdateSchema",
  "inventorySettingsSchema",
  "salesSettingsSchema",
  "invoiceSettingsSchema",
  "printingSettingsSchema",
  "productsSettingsSchema",
  "customersSettingsSchema",
  "suppliersSettingsSchema",
  "soundSettingsSchema",
  "settingsSaveSchema",
];

/** Tous les schémas exportés par le baril de validation du main. */
const ALL_SCHEMA_NAMES: readonly string[] = Object.keys(V)
  .filter((k) => k.endsWith("Schema"))
  .sort();

/** Nombre total de schémas gelé (121 = 43 REQUIRED + 78 sans operationId). */
// ADR-130 (2026-10-21) : 121 → 122 (customersImportSchema : import CSV
// clients — mutation de lot, operationId REQUIS).
// ADR-136 (2026-10-25) : 122 → 125 (3 schémas packaging).
// ADR-153 (2026-10-28, dead-code lot A) : 125 → 124 (`templateGetSchema`
// retiré avec le canal mort `templates.get`).
// ADR-170 (2026-11-02) : 125 → 129 (sessions de caisse : open/count/close
// exigent `operationId`, `cashSessionListSchema` est une lecture sans jeton).
// ADR-171 (2026-11-02) : 129 → 130 (`syncOwnerPushSchema` — publication de la
// liasse de supervision propriétaire, mutation sortante `operationId` REQUIS).
const FROZEN_SCHEMA_TOTAL = 130;

function schemaOf(name: string): unknown {
  return (V as unknown as Record<string, unknown>)[name];
}

describe("operationId R1 : inventaire gelé requis vs exception LWW", () => {
  it("mutations monétaires exigent operationId", () => {
    for (const name of REQUIRED_NAMES) {
      expect(schemaRequiresOperationId(schemaOf(name)), name).toBe(true);
    }
  });

  it("exception LWW reste optionnelle (gelée, ADR-074)", () => {
    for (const name of OPTIONAL_EXCEPTION_NAMES) {
      expect(schemaRequiresOperationId(schemaOf(name)), name).toBe(false);
    }
  });

  it("I-02 : classification COMPLÈTE (aucun schéma forgotten)", () => {
    // 1. Les listes ne contiennent que des schémas existants.
    for (const name of [...REQUIRED_NAMES, ...OPTIONAL_EXCEPTION_NAMES]) {
      expect(ALL_SCHEMA_NAMES, `nom de schéma inexistant : ${name}`).toContain(name);
    }
    // 2. Pas de doublon entre REQUIRED et OPTIONAL.
    const overlap = REQUIRED_NAMES.filter((n) => OPTIONAL_EXCEPTION_NAMES.includes(n));
    expect(overlap).toEqual([]);
    // 3. Le total des schémas du main est gelé.
    expect(ALL_SCHEMA_NAMES.length).toBe(FROZEN_SCHEMA_TOTAL);
    // 4. Tout schéma NON listé comme REQUIRED n'exige PAS operationId :
    //    un nouveau schéma financier sans operationId échoue ICI.
    const required = new Set(REQUIRED_NAMES);
    const unexpected = ALL_SCHEMA_NAMES.filter(
      (name) => !required.has(name) && schemaRequiresOperationId(schemaOf(name)),
    );
    expect(
      unexpected,
      `schémas exigeant operationId hors liste : ${unexpected.join(", ")}`,
    ).toEqual([]);
    // 5. Réciproquement : tout schéma listé REQUIRED exige bien operationId.
    const missing = REQUIRED_NAMES.filter((name) => !schemaRequiresOperationId(schemaOf(name)));
    expect(missing, `schémas listés REQUIRED mais optionnels : ${missing.join(", ")}`).toEqual([]);
  });
});
