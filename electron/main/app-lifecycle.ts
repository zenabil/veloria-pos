// Veloria PoS — Electron main: cycle de vie (fenêtres, arrêt gracieux).
// Fermeture WAL (checkpoint) avant chaque sortie : aucune écriture perdue.

import { app } from "electron";
import { checkpointAndClose } from "../database/sqlite.service";
import { stopAutoBackupTimer } from "../backup/backup.service";
import { stopSyncTimer } from "../sync/sync.service";
import { disposeAllStagedFiles } from "../ocr/ocr-files";
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
    // L7/L8 : libération propre à l'arrêt — timers périodiques (synchro +
    // sauvegarde auto) et copies OCR mis en scène. Best-effort, jamais bloquant.
    try {
      stopSyncTimer();
      stopAutoBackupTimer();
      const discarded = disposeAllStagedFiles();
      if (discarded > 0) {
        log("INFO", "ocr", "temp.files_discarded_on_quit", { count: discarded });
      }
    } catch (err) {
      log("WARN", "app", "shutdown.cleanup_failed", { error: String(err) });
    }
    try {
      checkpointAndClose();
    } catch (err) {
      log("ERROR", "app", "shutdown.close_failed", { error: String(err) });
    }
  });
}
