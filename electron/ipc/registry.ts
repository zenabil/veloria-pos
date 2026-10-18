// Veloria PoS — Electron: IPC registry (typed, validated, error-safe).
// Composition mince : le noyau vit dans registry.core.ts, la recuperation et
// la licence dans registry.recovery.ts, chaque domaine dans registry.*.ts.
// Les guards vivent dans handle.ts / license-gates.ts / credit-gates.ts,
// les erreurs FR dans ipc-errors.ts. Aucun channel ni payload modifie.
import { registerCoreIpc } from "./registry.core";
import { registerLicenseIpc, registerRecoveryIpc } from "./registry.recovery";
import { registerCatalogChannels } from "./registry.catalog";
import { registerSalesChannels } from "./registry.sales";
import { registerCustomersChannels } from "./registry.customers";
import { registerFinanceChannels } from "./registry.finance";
import { registerStockChannels } from "./registry.stock";
import { registerStaffChannels } from "./registry.staff";
import { registerDocumentsChannels } from "./registry.documents";
import { registerSystemChannels } from "./registry.system";

export { registerCoreIpc, registerLicenseIpc, registerRecoveryIpc };

export function registerIpc(): void {
  registerCoreIpc();
  registerSystemChannels();
  registerCatalogChannels();
  registerCustomersChannels();
  registerSalesChannels();
  registerFinanceChannels();
  registerStockChannels();
  registerStaffChannels();
  registerDocumentsChannels();
}
