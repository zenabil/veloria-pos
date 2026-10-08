// Veloria PoS — Electron: imprimante configuree (decoupage printing.service, zero changement).

import type { BrowserWindow } from "electron";
import { getDb } from "../database/sqlite.service";
import { claimOptional, peekOptional, storeOptional } from "../ipc/handlers/idempotency";
import { log } from "../services/logger";
import type { ThermalWidth } from "./receipt-documents";

export function saveSelectedPrinterName(
  name: string | null,
  now: string,
  operationId?: string | null,
): void {
  const fast = peekOptional<{ saved: boolean }>(operationId, "printer.save");
  if (fast) return;
  const db = getDb();
  const tx = db.transaction(() => {
    claimOptional(operationId, "printer.save", now);
    db.prepare(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES ('printer', ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    ).run(JSON.stringify({ name }), now);
    storeOptional(operationId, { saved: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      operationId &&
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekOptional<{ saved: boolean }>(operationId, "printer.save");
      if (retry) return;
    }
    throw err;
  }
}

/** Imprimante configurée (Paramètres) ou null = imprimante par défaut du système. */
// P07: panne n'arrête jamais la caisse, mais journalisée (plus de catch muet).
export function getSelectedPrinterName(): string | null {
  try {
    const row = getDb()
      .prepare(`SELECT value_json FROM app_settings WHERE key = 'printer'`)
      .get() as { value_json: string } | undefined;
    if (!row) return null;
    const parsed = JSON.parse(row.value_json) as { name?: string | null };
    return typeof parsed.name === "string" && parsed.name.length > 0 ? parsed.name : null;
  } catch (err) {
    log("WARN", "printing", "printerSettings.unreadable", { error: String(err) });
    return null;
  }
}

export function printOptions(): { silent: boolean; deviceName?: string } {
  const deviceName = getSelectedPrinterName();
  let silent = true;
  try {
    const row = getDb()
      .prepare(`SELECT value_json FROM app_settings WHERE key = 'printing'`)
      .get() as { value_json: string } | undefined;
    if (row) silent = (JSON.parse(row.value_json) as { silent?: boolean }).silent !== false;
  } catch (err) {
    log("WARN", "printing", "printingSettings.unreadable", { error: String(err) });
  }
  return deviceName ? { silent, deviceName } : { silent };
}

/** Largeur thermique configurée (Paramètres → Impression, défaut 80mm). */
export function getThermalWidth(): ThermalWidth {
  try {
    const row = getDb()
      .prepare(`SELECT value_json FROM app_settings WHERE key = 'printing'`)
      .get() as { value_json: string } | undefined;
    if (!row) return "80mm";
    const parsed = JSON.parse(row.value_json) as { thermalWidth?: unknown };
    return parsed.thermalWidth === "58mm" ? "58mm" : "80mm";
  } catch (err) {
    log("WARN", "printing", "thermalWidth.unreadable", { error: String(err) });
    return "80mm";
  }
}

/**
 * PRINTING FAIL-CLOSED (§20) : si une imprimante est CONFIGURÉE par
 * l'opérateur mais introuvable (renommée/débranchée), on REFUSE avec un
 * message FR explicite au lieu d'imprimer silencieusement ailleurs.
 * Sans imprimante configurée, l'imprimante par défaut du système reste le
 * choix explicite (aucun changement pour les postes standards).
 */
export async function assertConfiguredPrinterAvailable(
  getMainWindow: () => BrowserWindow | null,
): Promise<void> {
  const configured = getSelectedPrinterName();
  if (!configured) return;
  const win = getMainWindow();
  if (!win) throw new Error("Fenêtre d'impression indisponible.");
  let names: string[];
  try {
    const list = await win.webContents.getPrintersAsync();
    names = list.map((p) => p.name);
  } catch {
    throw new Error(`Imprimante « ${configured} » inaccessible : vérifiez l'imprimante.`);
  }
  if (!names.includes(configured)) {
    throw new Error(
      `Imprimante « ${configured} » introuvable : rebranchez-la ou choisissez-en une autre dans Paramètres.`,
    );
  }
}
