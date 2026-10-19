// Veloria PoS — Shell types partagés (zéro logique métier).
// Préférences d'interface uniquement (localStorage), jamais la base SQLite.

export type ModuleId =
  | "dashboard"
  | "sell"
  | "products"
  | "customers"
  | "suppliers"
  | "stock"
  | "history"
  | "returns"
  | "expenses"
  | "debts"
  | "reports"
  | "proformas"
  | "templates"
  | "zakat"
  | "settings"
  | "license";

export type ToastKind = "ok" | "err";

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

export type Notify = (message: string, kind?: ToastKind) => void;

export const SIDEBAR_KEY = "veloria.sidebarCollapsed";

export function initialSidebarCollapsed(): boolean {
  // Préférence d'interface uniquement (pas une donnée métier) : jamais la
  // base SQLite.
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}
