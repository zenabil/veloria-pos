// Veloria PoS — Electron main entry (secure, single-instance, crash-safe).

import { app, BrowserWindow } from "electron";
import { createMainWindow, getMainWindow } from "./window-manager";
import { registerIpc } from "../ipc/registry";
import { registerBackupIpc } from "../backup/backup.service";
import { registerPrintingIpc } from "../printing/printing.service";
import { openDatabase, checkpointAndClose, integrityCheck } from "../database/sqlite.service";
import { initLogger, log } from "../services/logger";

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

async function startup(): Promise<void> {
  initLogger();
  log("INFO", "app", "startup.begin", { version: app.getVersion() });
  await app.whenReady();
  try {
    const db = openDatabase();
    log("INFO", "app", "database.ready", db);
    const check = integrityCheck();
    if (check.integrity !== "ok") {
      log("ERROR", "app", "database.integrity_failed", { result: check.integrity });
    }
  } catch (err) {
    log("FATAL", "app", "database.open_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  registerIpc();
  registerBackupIpc();
  registerPrintingIpc(getMainWindow);
  createMainWindow();
  log("INFO", "app", "startup.ready");
}

void startup();

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    try {
      checkpointAndClose();
    } finally {
      app.quit();
    }
  }
});

app.on("before-quit", () => {
  try {
    checkpointAndClose();
  } catch (err) {
    log("ERROR", "app", "shutdown.close_failed", { error: String(err) });
  }
});

process.on("uncaughtException", (err) => {
  log("FATAL", "app", "uncaughtException", {
    error: err.message,
    stack: err.stack?.slice(0, 2000),
  });
  try {
    checkpointAndClose();
  } finally {
    const win = getMainWindow();
    if (win) {
      void win.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(`<body style="font-family:sans-serif;background:#111;color:#eee;padding:40px"><h1>Veloria PoS — Erreur inattendue</h1><p>L'application va se fermer pour protéger vos données. Relancez-la ; votre base est conservée.</p></body>`)}`,
      );
    }
  }
});

// Renderer crash recovery: offer reload.
app.on("render-process-gone", (_e, _wc, details) => {
  log("ERROR", "app", "renderer.gone", { reason: details.reason });
  const win: BrowserWindow | null = getMainWindow();
  if (win && details.reason !== "killed") {
    try {
      win.reload();
    } catch {
      /* noop */
    }
  }
});
