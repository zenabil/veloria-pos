// Veloria PoS - IPC: noyau nominal SANS base (extrait de registry.ts, deplacement pur).
// Voir doc H1 sur registerCoreIpc (idempotence gardee ici avec le flag).

import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { IPC_CHANNELS } from "./channels";
import * as V from "./validators";
import { log } from "../services/logger";
import {
  checkpoint,
  checkpointAndClose,
  getDb,
  reopenWithRetry,
  verifyDbFileCopy,
} from "../database/sqlite.service";
import {
  getConfiguredDbPath,
  getDataFolder,
  LOGICAL_DB_NAME,
  persistDbPath,
  PHYSICAL_DB_FILENAME,
} from "../database/database-path.service";
import { assertSafeUserFolder, isAllowedDatabaseFile } from "../security/security";
import { openLogsFolder, openPathSafe, pickFolder } from "../services/file-ui";
import { handle } from "./handle";

/**
 * Noyau IPC enregistrable SANS base ouverte (mode récupération) : lecture du
 * chemin, redémarrage, déplacement vérifié, dossiers — jamais de requêtes
 * métier. Le mode nominal appelle registerIpc() qui inclut ce noyau.
 *
 * IDEMPOTENT (H1) : `ipcMain.handle` lève « second handler » sur un doublon.
 * Le mode récupération enregistre ce noyau, puis la Réessayer réussie appelle
 * registerIpc() → registerCoreIpc() une 2e fois : l'exception s'échappait par
 * recovery.retry (sans try/catch) et renvoyait l'utilisateur à l'écran de
 * récupération à vie. La garde vit ICI (et plus seulement dans main.ts) pour
 * protéger tous les chemins d'appel.
 */
let coreIpcRegistered = false;

export function registerCoreIpc(): void {
  if (coreIpcRegistered) return;
  coreIpcRegistered = true;
  // app
  handle(IPC_CHANNELS["app.restart"], V.emptyPayloadSchema, () => {
    try {
      checkpointAndClose();
    } catch {
      /* best effort before relaunch */
    }
    app.relaunch();
    app.exit(0);
    return { restarting: true };
  });
  handle(IPC_CHANNELS["database.location"], V.emptyPayloadSchema, () => ({
    logicalName: LOGICAL_DB_NAME,
    fileName: PHYSICAL_DB_FILENAME,
    path: getConfiguredDbPath(),
    folder: getDataFolder(),
  }));
  handle(IPC_CHANNELS["system.openDataFolder"], V.emptyPayloadSchema, () => {
    openPathSafe(getDataFolder(), [getDataFolder()]);
    return { opened: true };
  });
  handle(IPC_CHANNELS["system.openLogsFolder"], V.emptyPayloadSchema, () => openLogsFolder());
  handle(IPC_CHANNELS["system.selectFolder"], V.emptyPayloadSchema, () => ({
    folder: pickFolder(),
  }));
  // Déplacement vérifié (copie → contrôle → bascule) : utilisable en récupération
  // pour pointer vers un dossier sain sans toucher au schéma ni aux données.
  // RADICAL-FIX: idempotent par operationId optionnel — retry même UUID = résultat
  // rejoué sans 2e copie (double-clic sûr).
  handle(IPC_CHANNELS["database.relocate"], V.relocateSchema, (input) => {
    const opId =
      typeof input.operationId === "string" && input.operationId.length > 0
        ? input.operationId
        : null;
    if (opId) {
      try {
        const row = getDb()
          .prepare(`SELECT result_json FROM idempotency_keys WHERE operation_id = ?`)
          .get(opId) as { result_json: string } | undefined;
        if (row && row.result_json !== "{}") {
          try {
            const parsed = JSON.parse(row.result_json) as { moved: boolean; path: string };
            if (typeof parsed.path === "string") return parsed;
          } catch {
            /* résultat corrompu : réexécuter */
          }
        }
      } catch {
        /* base non ouvrable : continuer */
      }
    }
    // EL-28: validation racine centralisée (absolu + anti-système + symlink),
    // au lieu du seul includes("..").
    const safeFolder = assertSafeUserFolder(input.folder);
    const current = getConfiguredDbPath();
    if (!fs.existsSync(current)) {
      throw new Error("Base actuelle introuvable : déplacement impossible.");
    }
    const target = path.join(safeFolder, PHYSICAL_DB_FILENAME);
    if (!isAllowedDatabaseFile(target)) {
      throw new Error("Dossier de destination invalide.");
    }
    if (path.normalize(target).toLowerCase() === path.normalize(current).toLowerCase()) {
      return { moved: true, path: current };
    }
    // Écraser silencieusement une base existante = perte de données : refus.
    if (fs.existsSync(target)) {
      throw new Error("La destination contient déjà une base. Choisissez un dossier vide.");
    }
    try {
      getDb().pragma("wal_checkpoint(TRUNCATE)");
    } catch (err) {
      log("WARN", "database", "relocate.checkpoint_fallback", {
        error: err instanceof Error ? err.message : String(err),
      });
      checkpoint();
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(current, target);
    // P03: après un TRUNCATE réussi le WAL est vide ; si des compagnons
    // résiduels subsistent côté source (crash antérieur), les copier aussi
    // pour ne perdre aucune frame, puis vérifier la copie complète.
    for (const suffix of ["-wal", "-shm", "-journal"] as const) {
      const src = `${current}${suffix}`;
      try {
        if (fs.existsSync(src)) fs.copyFileSync(src, `${target}${suffix}`);
      } catch (err) {
        log("WARN", "database", "relocate.companion_skipped", {
          suffix,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    verifyDbFileCopy(target);
    checkpointAndClose();
    // Config persistée APRÈS reopen réussi : en cas d'échec, on restaure
    // l'ancien chemin et on rouvre l'ancienne base (jamais d'état cassé).
    const previous = current;
    persistDbPath(target);
    try {
      const reopened = reopenWithRetry("database.relocated");
      log("INFO", "database", "database.relocated", { from: previous, to: target });
      const result = { moved: true, path: reopened.path };
      if (opId) {
        try {
          getDb()
            .prepare(
              `INSERT OR IGNORE INTO idempotency_keys (operation_id, op_type, result_json, created_at) VALUES (?, 'database.relocate', ?, ?)`,
            )
            .run(opId, JSON.stringify(result), new Date().toISOString());
        } catch (err) {
          log("WARN", "database", "relocate.idempotency_store_failed", {
            error: String(err),
          });
        }
      }
      return result;
    } catch (err) {
      log("ERROR", "database", "database.relocate_reopen_failed", { error: String(err) });
      persistDbPath(previous);
      // P0-2 : l'ancienne base doit rouvrir — réessais, puis échec FORT (jamais
      // de db=null silencieux) avec message FR orientant vers la récupération.
      try {
        reopenWithRetry("database.relocate_rollback");
      } catch (fatalErr) {
        log("ERROR", "database", "database.relocate_rollback_failed", {
          error: String(fatalErr),
        });
        throw new Error(
          "Déplacement annulé mais la base n'a pas pu être rouverte. Redémarrez l'application ou réessayez depuis l'écran de récupération.",
          { cause: fatalErr },
        );
      }
      throw new Error("Déplacement annulé : l'ancienne base a été conservée.", { cause: err });
    }
  });
}
