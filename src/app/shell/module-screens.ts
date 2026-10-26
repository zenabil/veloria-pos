// Veloria PoS — Écrans shell en lazy (16 chunks séparés).
// La caisse (accueil) reste chargée d'emblée dans App ; mêmes import()
// dynamiques qu'avant le split : chunks et chargements inchangés.
import { lazy, type ComponentType } from "react";
import type { ModuleId, Notify } from "./shell-types.ts";

export type NotifyScreen = ComponentType<{
  notify: Notify;
  /** Modules autorisés à renvoyer l'opérateur vers la caisse (ADR-139). */
  onNavigate?: (module: "sell") => void;
}>;

const ProductsScreen = lazy(() =>
  import("@features/products/ProductsScreen.tsx").then((m) => ({ default: m.ProductsScreen })),
);
const ClientsScreen = lazy(() =>
  import("@features/customers/ClientsScreen.tsx").then((m) => ({ default: m.ClientsScreen })),
);
const SuppliersScreen = lazy(() =>
  import("@features/suppliers/SuppliersScreen.tsx").then((m) => ({ default: m.SuppliersScreen })),
);
const StockScreen = lazy(() =>
  import("@features/stock/StockScreen.tsx").then((m) => ({ default: m.StockScreen })),
);
const HistoryScreen = lazy(() =>
  import("@features/history/HistoryScreen.tsx").then((m) => ({ default: m.HistoryScreen })),
);
const ReturnsScreen = lazy(() =>
  import("@features/returns/ReturnsScreen.tsx").then((m) => ({ default: m.ReturnsScreen })),
);
const ExpensesScreen = lazy(() =>
  import("@features/expenses/ExpensesScreen.tsx").then((m) => ({ default: m.ExpensesScreen })),
);
const DebtsScreen = lazy(() =>
  import("@features/debts/DebtsScreen.tsx").then((m) => ({ default: m.DebtsScreen })),
);
const ReportsScreen = lazy(() =>
  import("@features/reports/ReportsScreen.tsx").then((m) => ({ default: m.ReportsScreen })),
);
const ProformasScreen = lazy(() =>
  import("@features/proformas/ProformasScreen.tsx").then((m) => ({ default: m.ProformasScreen })),
);
const ZakatScreen = lazy(() =>
  import("@features/zakat/ZakatScreen.tsx").then((m) => ({ default: m.ZakatScreen })),
);
const SettingsScreen = lazy(() =>
  import("@features/settings/SettingsScreen.tsx").then((m) => ({ default: m.SettingsScreen })),
);
const DashboardScreen = lazy(() =>
  import("@features/dashboard/DashboardScreen.tsx").then((m) => ({ default: m.DashboardScreen })),
);
const PrintTemplatesScreen = lazy(() =>
  import("@features/print-templates/PrintTemplatesScreen.tsx").then((m) => ({
    default: m.PrintTemplatesScreen,
  })),
);
const LicenseScreen = lazy(() =>
  import("@features/license/LicenseScreen.tsx").then((m) => ({ default: m.LicenseScreen })),
);

/** Tout module sauf la caisse : chaque écran ne reçoit que `notify`. */
export const LAZY_SCREENS: Record<Exclude<ModuleId, "sell">, NotifyScreen> = {
  dashboard: DashboardScreen,
  products: ProductsScreen,
  customers: ClientsScreen,
  suppliers: SuppliersScreen,
  stock: StockScreen,
  history: HistoryScreen,
  returns: ReturnsScreen,
  expenses: ExpensesScreen,
  debts: DebtsScreen,
  reports: ReportsScreen,
  proformas: ProformasScreen,
  templates: PrintTemplatesScreen,
  zakat: ZakatScreen,
  settings: SettingsScreen,
  license: LicenseScreen,
};
