// Veloria PoS — Electron: export PDF (decoupage printing.service, zero changement).

import { dialog } from "electron";
import type { BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { log } from "../services/logger";
import { assertSafeUserFolder } from "../security/security";

// L3 : détection des messages d'exception TECHNIQUES (jamais affichables) —
// errno Node (EACCES/ENOSPC…), chemins disque, stack JS, tournures anglaises.
const PDF_TECHNICAL_RAW = /\bE[A-Z]{3,}:|[A-Za-z]:[\\/]|\/(?:home|Users|tmp|var|usr|mnt)\//;
const PDF_TECHNICAL_EN =
  /\b(failed|cannot|unable|unexpected|not allowed|is not a function|of undefined|undefined is not|permission denied|forbidden|unauthorized)\b|:\d+\b|\bat \S+\s*\(/i;

/**
 * L3 — EXPORT PDF : jamais d'exception brute vers l'opérateur (AGENTS §6).
 * Le détail technique (errno, stack, chemin) est déjà journalisé par
 * l'appelant (`log("ERROR", "printing", "pdf.*")`) ; seuls les messages
 * métier DÉJÀ rédigés en français (« Chemin de fichier PDF invalide. »,
 * garde dossier sûr) sont transmis tels quels — sinon repli FR générique.
 */
export function pdfExportFailed(err: unknown): { ok: false; code: string; message: string } {
  const msg = err instanceof Error ? err.message : "";
  if (msg && !PDF_TECHNICAL_RAW.test(msg) && !PDF_TECHNICAL_EN.test(msg)) {
    return { ok: false, code: "PDF_EXPORT_FAILED", message: msg };
  }
  return {
    ok: false,
    code: "PDF_EXPORT_FAILED",
    message: "Export PDF impossible. Réessayez ou choisissez un autre dossier.",
  };
}

/** Nom de fichier PDF sûr dérivé du nº de facture (`FAC-2026-00001` → tel quel). */
export function safeInvoiceFileName(invoice: string, suffix: string): string {
  const clean = invoice.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60) || "document";
  return `${clean}-${suffix}.pdf`;
}

/**
 * Export PDF (requête 4) : même pipeline de rendu que l'impression, sortie
 * `printToPDF` au lieu d'imprimante. Sans `filePath` explicite : dialogue
 * natif d'enregistrement (dossier Documents, nom pré-rempli). Avec
 * `filePath` (tests/automatisation) : validé strictement — absolu,
 * extension .pdf, dossier parent via `assertSafeUserFolder` (fail-closed,
 * jamais d'écriture hors dossier sûr).
 */
export async function exportDocumentPdf(
  getMainWindow: () => BrowserWindow | null,
  args: {
    html: string;
    waitMs: number;
    defaultName: string;
    explicitPath: string | null;
    pageSize: "A4" | { width: number; height: number };
  },
): Promise<{ saved: boolean; path: string | null }> {
  const { BrowserWindow: BW } = await import("electron");
  let target: string | null = null;
  if (args.explicitPath) {
    const p = path.normalize(args.explicitPath);
    if (!path.isAbsolute(p) || !p.toLowerCase().endsWith(".pdf")) {
      throw new Error("Chemin de fichier PDF invalide.");
    }
    // Dossier parent validé (système/réseau/racine refusés) avant écriture.
    assertSafeUserFolder(path.dirname(p));
    target = p;
  } else {
    const win = getMainWindow();
    const saveOpts = {
      title: "Exporter en PDF",
      defaultPath: args.defaultName,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    };
    const chosen = win
      ? await dialog.showSaveDialog(win, saveOpts)
      : await dialog.showSaveDialog(saveOpts);
    if (chosen.canceled || !chosen.filePath) return { saved: false, path: null };
    target = chosen.filePath;
  }
  const pdfWin = new BW({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });
  try {
    try {
      pdfWin.webContents.session.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
    } catch {
      /* session indisponible en test */
    }
    pdfWin.webContents.on("will-navigate", (event) => event.preventDefault());
    pdfWin.webContents.on("will-redirect", (event) => event.preventDefault());
    pdfWin.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    const loaded = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, Math.max(args.waitMs, 1500));
      pdfWin.webContents.once("did-finish-load", () => {
        clearTimeout(timer);
        setTimeout(resolve, Math.min(args.waitMs, 300));
      });
    });
    await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(args.html)}`);
    await loaded;
    const data =
      args.pageSize === "A4"
        ? await pdfWin.webContents.printToPDF({ pageSize: "A4", printBackground: true })
        : await pdfWin.webContents.printToPDF({
            pageSize: args.pageSize,
            printBackground: true,
          });
    fs.writeFileSync(target, data);
    log("INFO", "printing", "pdf.exported", { file: target, bytes: data.length });
    return { saved: true, path: target };
  } finally {
    pdfWin.destroy();
  }
}
