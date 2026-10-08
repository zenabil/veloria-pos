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
  | "bread"
  | "proformas"
  | "templates"
  | "zakat"
  | "settings"
  | "license";

export type PrintMode = "80mm" | "A4";

export type ToastKind = "ok" | "err";

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

export type Notify = (message: string, kind?: ToastKind) => void;

export const PRINT_MODE_KEY = "veloria.printMode";
export const SIDEBAR_KEY = "veloria.sidebarCollapsed";
export const THEME_KEY = "veloria.theme";

export type Theme = "dark" | "light";

export function initialTheme(): Theme {
  // Préférence d'interface uniquement (pas une donnée métier).
  try {
    return window.localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function initialPrintMode(): PrintMode {
  // Préférence d'interface uniquement (pas une donnée métier).
  try {
    return window.localStorage.getItem(PRINT_MODE_KEY) === "A4" ? "A4" : "80mm";
  } catch {
    return "80mm";
  }
}

export function initialSidebarCollapsed(): boolean {
  // Préférence d'interface uniquement (pas une donnée métier) : même
  // mécanisme local que le mode d'impression, jamais la base SQLite.
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}
