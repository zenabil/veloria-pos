// Veloria PoS — Electron main: cycle de vie (fenêtres, arrêt gracieux).
// Fermeture WAL (checkpoint) avant chaque sortie : aucune écriture perdue.

import { app } from "electron";
import { checkpointAndClose } from "../database/sqlite.service";
import { log } from "../services/logger";

export function registerLifecycle(): void {
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
}
