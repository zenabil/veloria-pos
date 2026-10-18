// Veloria PoS — Electron OCR: service local (aucun réseau, aucune donnée externe).
// Chaîne : fichier mis en scène → (image: normalisation + Tesseract local |
// PDF : couche texte locale) → texte brut. AUCUNE écriture en base ici :
// l'import passe par `stock.intake` après relecture humaine.
// Handlers async dédiés (comme printing/backup), erreurs FR + log technique.

import { BrowserWindow, ipcMain } from "electron";
import { log } from "../services/logger";
import { IPC_CHANNELS } from "../ipc/channels";
import {
  ocrAnalyzeSchema,
  ocrCancelSchema,
  ocrDisposeSchema,
  ocrSelectFileSchema,
} from "../ipc/validators";
import {
  cleanupStaleOcrTemp,
  disposeStagedFile,
  getStagedFile,
  normalizeImageForOcr,
  pickInvoiceFile,
} from "./ocr-files";
import { recognizeImage } from "./ocr-engine";
import { extractPdfText } from "./ocr-pdf";
import { requireLicensedMutation } from "../licensing/license-service";
import { prodLicenseDeps } from "../licensing/prod-deps";
import { enforceRawChannelGates } from "../ipc/raw-guards";

interface OcrJob {
  terminate: (() => Promise<unknown>) | null;
  cancelled: boolean;
}

const jobs = new Map<string, OcrJob>();

/** Lecture anti-rétrécissement TS : le flag est muté par `ocr.cancel` (autre flux). */
function jobCancelled(job: OcrJob): boolean {
  return job.cancelled;
}

function isValidationError(err: unknown): boolean {
  return err instanceof Error && err.name === "ZodError";
}

/**
 * §22 OCR SAFE ERRORS (FR UI only) : le message technique brut (anglais,
 * chemins, stack) ne fuit JAMAIS vers le renderer — il est journalisé côté
 * main par l'appelant. Seuls les cas métier connus ont un message FR précis,
 * tout le reste reçoit le libellé générique FR passé en fallback.
 */
const OCR_KNOWN_FR: ReadonlyArray<[RegExp, string]> = [
  [
    /pages scannées/i,
    "PDF sans texte extractible (pages scannées) : choisissez une image JPG/PNG de la facture.",
  ],
  [/illisible ou sans contenu/i, "Aucun texte détecté : image illisible ou sans contenu."],
];

function failed(err: unknown, fallback: string): { ok: false; code: string; message: string } {
  if (err instanceof Error && err.message === "OCR_CANCELLED") {
    return { ok: false, code: "OCR_CANCELLED", message: "Analyse annulée par l'utilisateur." };
  }
  if (isValidationError(err)) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Demande d'analyse invalide." };
  }
  if (err instanceof Error && err.message) {
    for (const [re, fr] of OCR_KNOWN_FR) {
      if (re.test(err.message)) return { ok: false, code: "OCR_FAILED", message: fr };
    }
  }
  return { ok: false, code: "OCR_FAILED", message: fallback };
}

function licenseDenied(err: unknown): { ok: false; code: string; message: string } {
  const msg = err instanceof Error ? err.message : "Fonction non autorisée par la licence.";
  const code = /n'est pas incluse/i.test(msg) ? "FEATURE_NOT_LICENSED" : "LICENSE_REQUIRED";
  log("WARN", "ocr", "analyze.license_denied", { error: msg });
  return { ok: false, code, message: msg };
}

function sendProgress(
  getMainWindow: () => BrowserWindow | null,
  fileId: string,
  phase: "preparation" | "ocr" | "pdf",
  page: number,
  pages: number,
  progress: number,
): void {
  try {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send(IPC_CHANNELS["ocr.progress"], { fileId, phase, page, pages, progress });
  } catch {
    /* renderer pas prêt : l'appelant reçoit le résultat final */
  }
}

export function registerOcrIpc(getMainWindow: () => BrowserWindow | null): void {
  try {
    cleanupStaleOcrTemp();
  } catch {
    /* meilleur effort */
  }

  ipcMain.handle(IPC_CHANNELS["ocr.selectFile"], async (_e, raw: unknown) => {
    try {
      // Sélection = usage de la fonction OCR (garde main, jamais le renderer).
      requireLicensedMutation(prodLicenseDeps(), "ocr");
    } catch (err) {
      return licenseDenied(err);
    }
    try {
      const input = ocrSelectFileSchema.parse(raw ?? {});
      // R1 RADICAL : import facture = permission stock (comme stock.intake).
      const staffDenied = enforceRawChannelGates(IPC_CHANNELS["ocr.selectFile"], input);
      if (staffDenied) return staffDenied;
      const picked = pickInvoiceFile();
      if (picked === null) return { ok: true, data: { cancelled: true as const } };
      const { file, previewDataUrl } = picked;
      let pageCount: number | null = null;
      if (file.kind === "pdf") {
        // Métadonnées immédiates : un PDF illisible est rejeté dès la sélection.
        try {
          pageCount = (await extractPdfText(file.stagedPath)).pageCount;
        } catch (err) {
          disposeStagedFile(file.fileId);
          throw err;
        }
      }
      return {
        ok: true,
        data: {
          cancelled: false as const,
          fileId: file.fileId,
          name: file.name,
          size: file.size,
          kind: file.kind,
          pageCount,
          previewDataUrl,
        },
      };
    } catch (err) {
      log("ERROR", "ocr", "select.failed", { error: String(err) });
      return failed(err, "Sélection du document impossible.");
    }
  });

  ipcMain.handle(IPC_CHANNELS["ocr.analyze"], async (_e, raw: unknown) => {
    try {
      // Fonction sous licence « ocr » (vérifiée côté main, jamais le renderer).
      requireLicensedMutation(prodLicenseDeps(), "ocr");
    } catch (err) {
      return licenseDenied(err);
    }
    let input: { fileId: string; languages: readonly string[] };
    try {
      input = ocrAnalyzeSchema.parse(raw ?? {});
    } catch (err) {
      log("ERROR", "ocr", "analyze.invalid", { error: String(err) });
      return failed(err, "Demande d'analyse invalide.");
    }
    // R1 RADICAL : analyse CPU/WASM = permission stock.
    const staffDenied = enforceRawChannelGates(IPC_CHANNELS["ocr.analyze"], input);
    if (staffDenied) return staffDenied;
    const job: OcrJob = { terminate: null, cancelled: false };
    // Single-flight par document : une seconde analyse concurrente du même
    // fichier écraserait le job (fuite worker) et doublerait le CPU/WASM.
    // EL-37: plafond global (2 analyses simultanées max) — N fileIds distincts
    // ne doivent pas épingler le CPU 180s chacun (DoS local).
    if (jobs.size >= 2 && !jobs.has(input.fileId)) {
      return {
        ok: false,
        code: "OCR_BUSY",
        message: "Analyse en cours : patientez la fin du traitement.",
      };
    }
    if (jobs.has(input.fileId)) {
      return {
        ok: false,
        code: "OCR_FAILED",
        message: "Analyse déjà en cours pour ce document.",
      };
    }
    jobs.set(input.fileId, job);
    try {
      const file = getStagedFile(input.fileId);
      if (file.kind === "pdf") {
        sendProgress(getMainWindow, input.fileId, "pdf", 0, 1, 0);
        const info = await extractPdfText(file.stagedPath);
        if (job.cancelled) throw new Error("OCR_CANCELLED");
        const usable = info.pages.filter((p) => p.hasText);
        if (usable.length === 0) {
          throw new Error(
            "PDF sans texte extractible (pages scannées) : choisissez une image JPG/PNG de la facture.",
          );
        }
        sendProgress(getMainWindow, input.fileId, "pdf", 1, 1, 1);
        return {
          ok: true,
          data: {
            fileId: input.fileId,
            kind: "pdf" as const,
            pageCount: info.pageCount,
            text: info.pages
              .map((p) => `[Page ${p.index}/${info.pageCount}]\n${p.text}`)
              .join("\n\n"),
            engineConfidence: null,
          },
        };
      }
      sendProgress(getMainWindow, input.fileId, "preparation", 0, 1, 0);
      const imagePath = normalizeImageForOcr(input.fileId);
      if (job.cancelled) throw new Error("OCR_CANCELLED");
      const { text, confidence } = await recognizeImage(imagePath, input.languages, {
        onProgress: (ratio) => sendProgress(getMainWindow, input.fileId, "ocr", 1, 1, ratio),
        registerWorker: (terminate) => {
          job.terminate = terminate;
          if (job.cancelled) void terminate().catch(() => undefined);
        },
      });
      if (jobCancelled(job)) throw new Error("OCR_CANCELLED");
      if (text.trim().length < 3) {
        throw new Error("Aucun texte détecté : image illisible ou sans contenu.");
      }
      sendProgress(getMainWindow, input.fileId, "ocr", 1, 1, 1);
      return {
        ok: true,
        data: {
          fileId: input.fileId,
          kind: "image" as const,
          pageCount: 1,
          text,
          engineConfidence: Math.round(confidence),
        },
      };
    } catch (err) {
      log("ERROR", "ocr", "analyze.failed", {
        fileId: input.fileId,
        error: err instanceof Error ? err.message : String(err),
      });
      return failed(err, "Analyse OCR impossible.");
    } finally {
      jobs.delete(input.fileId);
    }
  });

  ipcMain.handle(IPC_CHANNELS["ocr.cancel"], (_e, raw: unknown) => {
    // EL-23: cohérence FEATURE_GATED ocr — annulation/nettoyage exigent la
    // même capability que select/analyze (fileId opaque + Zod en plus).
    try {
      requireLicensedMutation(prodLicenseDeps(), "ocr");
    } catch (err) {
      return licenseDenied(err);
    }
    try {
      const input = ocrCancelSchema.parse(raw ?? {});
      // R1 RADICAL : cycle de vie du job = même permission que l'analyse
      // (un sans-permission ne peut ni lancer ni saboter le job d'autrui).
      const staffDenied = enforceRawChannelGates(IPC_CHANNELS["ocr.cancel"], input);
      if (staffDenied) return staffDenied;
      const job = jobs.get(input.fileId);
      if (!job) return { ok: true, data: { cancelled: false } };
      job.cancelled = true;
      if (job.terminate !== null) void job.terminate().catch(() => undefined);
      return { ok: true, data: { cancelled: true } };
    } catch (err) {
      log("ERROR", "ocr", "cancel.failed", { error: String(err) });
      return failed(err, "Annulation impossible.");
    }
  });

  ipcMain.handle(IPC_CHANNELS["ocr.dispose"], (_e, raw: unknown) => {
    try {
      requireLicensedMutation(prodLicenseDeps(), "ocr");
    } catch (err) {
      return licenseDenied(err);
    }
    try {
      const input = ocrDisposeSchema.parse(raw ?? {});
      const staffDenied = enforceRawChannelGates(IPC_CHANNELS["ocr.dispose"], input);
      if (staffDenied) return staffDenied;
      const job = jobs.get(input.fileId);
      if (job) {
        job.cancelled = true;
        if (job.terminate !== null) void job.terminate().catch(() => undefined);
        jobs.delete(input.fileId);
      }
      disposeStagedFile(input.fileId);
      return { ok: true, data: { disposed: true } };
    } catch (err) {
      log("ERROR", "ocr", "dispose.failed", { error: String(err) });
      return failed(err, "Nettoyage impossible.");
    }
  });
}
