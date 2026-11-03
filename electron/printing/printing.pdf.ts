// Veloria PoS — Electron: export PDF (decoupage printing.service, zero changement).

import { app, dialog } from "electron";
import type { BrowserWindow } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { log } from "../services/logger";
import { assertSafeUserFolder } from "../security/security";
import { measureContentPx, micronsToInches, thermalPageSize } from "./printing.page-size";
import type { ThermalWidth } from "./receipt-documents";

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
 * E-50 — racines où un chemin de sortie PEUT être imposé par l'appelant (flux
 * d'automatisation) : le dossier de données de l'application et le dossier
 * temporaire du système. Ailleurs, seule la boîte d'enregistrement décide.
 *
 * Comparaison sur `realpath` : un `..` ne traverse pas la barrière, et une
 * jonction vers `C:\Windows` est écartée par le chemin réel. Insensible à la
 * casse (Windows). Un dossier pas encore créé remonte à son premier ancêtre réel.
 */
function realpathWithFallback(target: string): string | null {
  let probe = target;
  for (let depth = 0; depth < 32; depth++) {
    try {
      return fs.realpathSync(probe);
    } catch {
      const parent = path.dirname(probe);
      if (parent === probe) return null;
      probe = parent;
    }
  }
  return null;
}

function stripTrailingSep(value: string): string {
  return value.replace(/[\\/]+$/, "");
}

function isUnderApprovedRoot(dir: string): boolean {
  const resolved = realpathWithFallback(dir);
  if (resolved === null) return false;
  const target = stripTrailingSep(resolved).toLowerCase();
  let roots: string[];
  try {
    roots = [app.getPath("userData"), os.tmpdir()];
  } catch {
    return false;
  }
  const separator = path.sep.toLowerCase();
  for (const root of roots) {
    const realRoot = realpathWithFallback(root);
    if (realRoot === null) continue;
    const prefix = stripTrailingSep(realRoot).toLowerCase();
    if (prefix === "") continue;
    if (target === prefix || target.startsWith(prefix + separator)) return true;
  }
  return false;
}

/**
 * Export PDF (requête 4) : même pipeline de rendu que l'impression, sortie
 * `printToPDF` au lieu d'imprimante. Sans `filePath` : dialogue natif
 * d'enregistrement (nom pré-rempli). Avec `filePath` (automatisation/tests) :
 * E-50 — confinement en **liste blanche**, plus seulement en liste noire.
 *
 * L'ancien garde n'était qu'un refus des dossiers système (`deny-list`) : le
 * renderer pouvait fournir n'importe quel chemin absolu d'un dossier
 * utilisateur et `writeFileSync` **écrasait silencieusement** tout `.pdf`
 * existant (document comptable, export d'un tiers), sans jamais passer par le
 * choix de l'opérateur. Désormais le chemin fourni doit être SOUS un des
 * racines légitimes de l'application (dossier de l'utilisateur, dossier de
 * sauvegarde, dossier temporaire système) — sinon dialogue natif.
 */
export async function exportDocumentPdf(
  getMainWindow: () => BrowserWindow | null,
  args: {
    html: string;
    waitMs: number;
    defaultName: string;
    explicitPath: string | null;
    pageSize: "A4" | { width: number; height: number };
    thermalWidth?: ThermalWidth | undefined;
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
    const dir = assertSafeUserFolder(path.dirname(p));
    if (!isUnderApprovedRoot(dir)) {
      throw new Error(
        "Export PDF direct réservé aux dossiers de l'application : utilisez la boîte d'enregistrement.",
      );
    }
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
    // Ticket : hauteur du contenu mesurée (repli = pageSize fourni).
    const measured = args.thermalWidth ? await measureContentPx(pdfWin.webContents) : 0;
    const size =
      args.thermalWidth && measured > 0
        ? thermalPageSize(args.thermalWidth, measured)
        : args.pageSize;
    const data =
      size === "A4"
        ? await pdfWin.webContents.printToPDF({ pageSize: "A4", printBackground: true })
        : await pdfWin.webContents.printToPDF({
            // ATTENTION : `printToPDF` attend des POUCES (pageSize ET marges),
            // contrairement à `webContents.print` qui attend des microns.
            pageSize: {
              width: micronsToInches(size.width),
              height: micronsToInches(size.height),
            },
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            printBackground: true,
          });
    fs.writeFileSync(target, data);
    log("INFO", "printing", "pdf.exported", { file: target, bytes: data.length });
    return { saved: true, path: target };
  } finally {
    pdfWin.destroy();
  }
}
