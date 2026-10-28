// Veloria PoS — Main-process repository: réglages explicites (clés connues uniquement).
// Pas de get/set générique : chaque clé a son schéma Zod côté registry.

import { randomUUID } from "node:crypto";
import { getDb } from "../../database/sqlite.service";
import { auditOperationId, claimOptional, peekOptional, storeOptional } from "./idempotency";
import { log } from "../../services/logger";

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
    { value_json: string } | undefined;
  if (!row) return fallback;
  try {
    const parsed = JSON.parse(row.value_json) as Partial<T>;
    return { ...fallback, ...parsed };
  } catch {
    // #36 : réglage corrompu — repli sur les défauts, mais JAMAIS silencieux
    // (un défaut invisible peut changer la politique caisse/stock).
    log("WARN", "settings", "row.corrupted", { key });
    return fallback;
  }
}

function writeKey(key: string, value: unknown, now: string, operationId?: string | null): void {
  const db = getDb();
  const fast = peekOptional<{ saved: boolean }>(operationId, `settings.save:${key}`);
  if (fast) return;
  // P8: réglages tracés (offre/restriction licence + politique stock).
  const tx = db.transaction(() => {
    claimOptional(operationId, `settings.save:${key}`, now);
    db.prepare(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    ).run(key, JSON.stringify(value), now);
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'settings.saved', 'settings', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      key,
      auditOperationId(operationId, "settings.saved", key, value),
      JSON.stringify({}),
      now,
    );
    storeOptional(operationId, { saved: true });
  });
  try {
    tx();
  } catch (err) {
    if (
      operationId &&
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekOptional<{ saved: boolean }>(operationId, `settings.save:${key}`);
      if (retry) return;
    }
    throw err;
  }
}

export function getInventorySettings(): InventorySettings {
  return readKey<InventorySettings>("inventory", { allowNegativeStock: false, defaultMinStock: 0 });
}

export function saveInventorySettings(
  value: InventorySettings,
  now: string,
  operationId?: string | null,
): void {
  writeKey("inventory", value, now, operationId);
}

export function getSalesSettings(): SalesSettings {
  return readKey<SalesSettings>("sales", {
    defaultPaymentMethod: "cash",
    allowCreditSales: true,
    autoPrintInvoice: false,
  });
}

export function saveSalesSettings(
  value: SalesSettings,
  now: string,
  operationId?: string | null,
): void {
  writeKey("sales", value, now, operationId);
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

export function saveInvoiceSettings(
  value: InvoiceSettings,
  now: string,
  operationId?: string | null,
): void {
  writeKey("invoice", value, now, operationId);
}

export function getPrintingSettings(): PrintingSettings {
  return readKey<PrintingSettings>("printing", { silent: true });
}

export function savePrintingSettings(
  value: PrintingSettings,
  now: string,
  operationId?: string | null,
): void {
  writeKey("printing", value, now, operationId);
}

export function getProductsSettings(): ProductsSettings {
  return readKey<ProductsSettings>("products", { defaultUnit: "PIECE" });
}

export function saveProductsSettings(
  value: ProductsSettings,
  now: string,
  operationId?: string | null,
): void {
  writeKey("products", value, now, operationId);
}

export function getCustomersSettings(): CustomersSettings {
  return readKey<CustomersSettings>("customers", { defaultCreditLimitMinor: 0 });
}

export function saveCustomersSettings(
  value: CustomersSettings,
  now: string,
  operationId?: string | null,
): void {
  writeKey("customers", value, now, operationId);
}

export function getSuppliersSettings(): SuppliersSettings {
  return readKey<SuppliersSettings>("suppliers", { defaultPaymentMethod: "cash" });
}

export function saveSuppliersSettings(
  value: SuppliersSettings,
  now: string,
  operationId?: string | null,
): void {
  writeKey("suppliers", value, now, operationId);
}

export function getSoundSettings(): SoundSettings {
  // P5 : sons discrets activés par défaut (coupés en un clic, voir Réglages).
  return readKey<SoundSettings>("sound", { enabled: true });
}

export function saveSoundSettings(
  value: SoundSettings,
  now: string,
  operationId?: string | null,
): void {
  writeKey("sound", value, now, operationId);
}

export interface ZakatParams {
  ratePercent: number;
  nisabMinor: number;
  hawlDate: string | null;
  nisabMethod: string;
}

export function saveZakatParams(
  value: ZakatParams,
  now: string,
  operationId?: string | null,
): void {
  const db = getDb();
  const fast = peekOptional<{ saved: boolean }>(operationId, "settings.save:zakat");
  if (fast) return;
  const tx = db.transaction(() => {
    claimOptional(operationId, "settings.save:zakat", now);
    db.prepare(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES ('zakat', ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    ).run(JSON.stringify(value), now);
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'settings.saved', 'settings', 'zakat', ?, ?, ?)`,
    ).run(
      randomUUID(),
      auditOperationId(operationId, "settings.saved", "zakat", value),
      JSON.stringify({}),
      now,
    );
    storeOptional(operationId, { saved: true });
  });
  try {
    tx();
  } catch (err) {
    if (
      operationId &&
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekOptional<{ saved: boolean }>(operationId, "settings.save:zakat");
      if (retry) return;
    }
    throw err;
  }
}
