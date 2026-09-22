// Veloria PoS — Main-process repository: réglages explicites (clés connues uniquement).
// Pas de get/set générique : chaque clé a son schéma Zod côté registry.

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";

export interface InventorySettings {
  allowNegativeStock: boolean;
  defaultMinStock: number;
}

export interface SalesSettings {
  defaultPaymentMethod: "cash" | "cheque" | "transfer";
  allowCreditSales: boolean;
  autoPrintInvoice: boolean;
}

export interface InvoiceSettings {
  showLogo: boolean;
  showCustomerBalance: boolean;
  showPreviousBalance: boolean;
  footerText: string;
  thankYouMessage: string;
}

export interface PrintingSettings {
  silent: boolean;
}

export interface ProductsSettings {
  defaultUnit: string;
}

export interface CustomersSettings {
  defaultCreditLimitMinor: number;
}

export interface SuppliersSettings {
  defaultPaymentMethod: "cash" | "cheque" | "transfer";
}

export interface SoundSettings {
  enabled: boolean;
}

function readKey<T>(key: string, fallback: T): T {
  const db = getDb();
  const row = db.prepare(`SELECT value_json FROM app_settings WHERE key = ?`).get(key) as
    | { value_json: string }
    | undefined;
  if (!row) return fallback;
  try {
    const parsed = JSON.parse(row.value_json) as Partial<T>;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

function writeKey(key: string, value: unknown, now: string): void {
  const db = getDb();
  // P8: réglages tracés (offre/restriction licence + politique stock).
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    ).run(key, JSON.stringify(value), now);
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'settings.saved', 'settings', ?, ?, ?, ?)`,
    ).run(randomUUID(), key, randomUUID(), JSON.stringify({}), now);
  });
  (tx as unknown as () => void)();
}

export function getInventorySettings(): InventorySettings {
  return readKey<InventorySettings>("inventory", { allowNegativeStock: false, defaultMinStock: 0 });
}

export function saveInventorySettings(value: InventorySettings, now: string): void {
  writeKey("inventory", value, now);
}

export function getSalesSettings(): SalesSettings {
  return readKey<SalesSettings>("sales", {
    defaultPaymentMethod: "cash",
    allowCreditSales: true,
    autoPrintInvoice: false,
  });
}

export function saveSalesSettings(value: SalesSettings, now: string): void {
  writeKey("sales", value, now);
}

export function getInvoiceSettings(): InvoiceSettings {
  return readKey<InvoiceSettings>("invoice", {
    showLogo: true,
    showCustomerBalance: true,
    showPreviousBalance: true,
    footerText: "",
    thankYouMessage: "",
  });
}

export function saveInvoiceSettings(value: InvoiceSettings, now: string): void {
  writeKey("invoice", value, now);
}

export function getPrintingSettings(): PrintingSettings {
  return readKey<PrintingSettings>("printing", { silent: true });
}

export function savePrintingSettings(value: PrintingSettings, now: string): void {
  writeKey("printing", value, now);
}

export function getProductsSettings(): ProductsSettings {
  return readKey<ProductsSettings>("products", { defaultUnit: "PIECE" });
}

export function saveProductsSettings(value: ProductsSettings, now: string): void {
  writeKey("products", value, now);
}

export function getCustomersSettings(): CustomersSettings {
  return readKey<CustomersSettings>("customers", { defaultCreditLimitMinor: 0 });
}

export function saveCustomersSettings(value: CustomersSettings, now: string): void {
  writeKey("customers", value, now);
}

export function getSuppliersSettings(): SuppliersSettings {
  return readKey<SuppliersSettings>("suppliers", { defaultPaymentMethod: "cash" });
}

export function saveSuppliersSettings(value: SuppliersSettings, now: string): void {
  writeKey("suppliers", value, now);
}

export function getSoundSettings(): SoundSettings {
  // P5 : sons discrets activés par défaut (coupés en un clic, voir Réglages).
  return readKey<SoundSettings>("sound", { enabled: true });
}

export function saveSoundSettings(value: SoundSettings, now: string): void {
  writeKey("sound", value, now);
}

export interface ZakatParams {
  ratePercent: number;
  nisabMinor: number;
  hawlDate: string | null;
  nisabMethod: string;
}

export function saveZakatParams(value: ZakatParams, now: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO app_settings (key, value_json, updated_at) VALUES ('zakat', ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
  ).run(JSON.stringify(value), now);
}
