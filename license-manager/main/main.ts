// Veloria License Manager — Entrée outil vendor (processus isolé du POS).
// Dossier de données DÉDIÉ (jamais celui du POS) + instance unique.

import { app } from "electron";
import path from "node:path";
import { createManagerWindow, getManagerWindow } from "./window-manager";
import { registerManagerIpc } from "../ipc/registry";
import { closeManagerDb, openManagerDb } from "../db/manager-db";
import { enforceManagerIntegrityOrQuit } from "./integrity-check";

try {
  app.setPath("userData", path.join(app.getPath("appData"), "Veloria License Manager"));
} catch {
  /* repli : userData par défaut */
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = getManagerWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  void startup();
  app.on("window-all-closed", () => {
    try {
      closeManagerDb();
    } catch {
      /* ignore */
    }
    if (process.platform !== "darwin") app.quit();
  });
}

let ipcRegistered = false;

async function startup(): Promise<void> {
  await app.whenReady();
  // P10: outil vendor = fail-closed comme le POS (dev non-packagé : skip).
  if (!enforceManagerIntegrityOrQuit()) return;
  openManagerDb();
  if (!ipcRegistered) {
    registerManagerIpc();
    ipcRegistered = true;
  }
  createManagerWindow();
}
