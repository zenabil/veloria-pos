// Veloria PoS - IPC: recuperation + licence (extrait de registry.ts, deplacement pur).

import { dialog, ipcMain } from "electron";
import fs from "node:fs";
import { IPC_CHANNELS } from "./channels";
import * as V from "./validators";
import { log } from "../services/logger";
import { getMainWindow } from "../main/window-manager";
import { getLicenseStatus, importLicenseEnvelope } from "../licensing/license-service";
import { checkpointAndClose } from "../database/sqlite.service";
import { prodLicenseDeps } from "../licensing/prod-deps";
import { formatFingerprintShort, getHardwareFingerprint } from "../licensing/fingerprint";
import { handle } from "./handle";
import { ok, toUserMessage } from "./ipc-errors";

/**
 * Canaux de récupération (base non prête) : réessai en place + sortie.
 * Charge utile vide validée par Zod, comme tous les autres canaux explicites.
 */
export function registerRecoveryIpc(callbacks: {
  onRetry: () => { switched: boolean; userMessage: string };
  onExit: () => void;
}): void {
  ipcMain.handle(IPC_CHANNELS["recovery.retry"], (_event, raw: unknown) => {
    try {
      V.recoveryActionSchema.parse(raw ?? {});
    } catch (err) {
      // L10 : payload invalide → mapping FR + journalisation technique (log),
      // comme le fait handle() pour tous les autres canaux.
      log("WARN", "recovery", "retry.invalid_payload", {
        error: err instanceof Error ? err.message : String(err),
      });
      const user = toUserMessage(err);
      return { ok: false, ...user };
    }
    // échec persistant : message FR déjà prêt en base (jamais de stack vers l'UI ;
    // le détail technique a été journalisé en FATAL par la tentative elle-même).
    // L10 : toute exception imprévue ici (registration, bascule de mode) doit
    // rester FR + journalisée — sinon message brut Electron vers l'opérateur.
    let res: { switched: boolean; userMessage: string };
    try {
      res = callbacks.onRetry();
    } catch (err) {
      log("ERROR", "recovery", "retry.unexpected_failure", {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        ok: false,
        code: "RECOVERY_RETRY_FAILED",
        message: "Réessai impossible. Redémarrez l'application.",
      };
    }
    if (res.switched) return ok({ mode: "main" });
    return { ok: false, code: "DATABASE_UNAVAILABLE", message: res.userMessage };
  });
  ipcMain.handle(IPC_CHANNELS["recovery.exit"], (_event, raw: unknown) => {
    try {
      V.recoveryActionSchema.parse(raw ?? {});
    } catch (err) {
      // L10 : payload invalide → mapping FR + journalisation technique.
      log("WARN", "recovery", "exit.invalid_payload", {
        error: err instanceof Error ? err.message : String(err),
      });
      const user = toUserMessage(err);
      return { ok: false, ...user };
    }
    try {
      checkpointAndClose();
    } catch (err) {
      log("WARN", "recovery", "exit.close_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    // L10 : onExit() (app.quit) ne doit jamais propager une exception brute
    // vers le renderer — log technique + réponse FR.
    try {
      callbacks.onExit();
    } catch (err) {
      log("ERROR", "recovery", "exit.unexpected_failure", {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        ok: false,
        code: "RECOVERY_EXIT_FAILED",
        message: "Sortie impossible. Fermez l'application depuis le système.",
      };
    }
    return ok({ exiting: true });
  });
}

/**
 * Canaux licence (surface minimale, sans base requise) : statut, identifiant
 * matériel d'affichage, import .vlic via dialogue fichier main, re-vérif.
 * Enregistrable en mode activation (fenêtre dédiée) comme en mode nominal.
 * Aucune signature/clé privée ici — vérification seule.
 */
export function registerLicenseIpc(callbacks?: { onActivated?: () => void }): void {
  const deps = prodLicenseDeps();
  handle(IPC_CHANNELS["license.getStatus"], V.licenseActionSchema, () => getLicenseStatus(deps));
  handle(IPC_CHANNELS["license.getHardwareId"], V.licenseActionSchema, () => {
    const { fingerprint, sources } = getHardwareFingerprint();
    // L'empreinte complète (hash, non sensible) est transmise au fournisseur
    // pour l'émission ; l'affichage court reste `hardwareId`.
    return { hardwareId: formatFingerprintShort(fingerprint), fingerprint, sources };
  });
  handle(IPC_CHANNELS["license.importLicense"], V.licenseActionSchema, () => {
    const win = getMainWindow();
    const opts = {
      title: "Importer la licence Veloria POS",
      filters: [{ name: "Licence Veloria (.vlic)", extensions: ["vlic"] }],
      properties: ["openFile" as const],
    };
    const picked = win ? dialog.showOpenDialogSync(win, opts) : dialog.showOpenDialogSync(opts);
    const file = picked?.[0];
    if (!file) return { imported: false, status: getLicenseStatus(deps) };
    let text: string;
    try {
      const stat = fs.statSync(file);
      if (stat.size <= 0 || stat.size > 20000) throw new Error("bad size");
      text = fs.readFileSync(file, "utf-8");
    } catch {
      throw new Error("Fichier de licence illisible.");
    }
    const status = importLicenseEnvelope(deps, text);
    if ((status.state === "ACTIVE" || status.state === "EXPIRING_SOON") && callbacks?.onActivated) {
      callbacks.onActivated();
    }
    return { imported: true, status };
  });
  handle(IPC_CHANNELS["license.validate"], V.licenseActionSchema, () => {
    const status = getLicenseStatus(deps);
    if ((status.state === "ACTIVE" || status.state === "EXPIRING_SOON") && callbacks?.onActivated) {
      callbacks.onActivated();
    }
    return status;
  });
  // Capabilities en lecture seule (§23) : pages + features issues du payload
  // SIGNÉ vérifié. Aucune écriture, aucun paramètre — le renderer ne peut pas
  // s'octroyer de permissions (pas de setLicensePermissions).
}
