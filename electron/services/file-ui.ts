// Veloria PoS — Electron: UI filesystem helpers (validated paths only).
// Regroupe les accès fichiers exposés à l'UI : sélecteur de dossier, ouverture
// sécurisée (allow-list), dossier des journaux. Jamais de chemin brut.

import fs from "node:fs";
import path from "node:path";
import { app, dialog, shell } from "electron";
import { getLogFile } from "./logger";
import { readLogoDataUrlFromFile, storeLogoFile } from "./logo";

export function pickFolder(): string | null {
  const res = dialog.showOpenDialogSync({ properties: ["openDirectory", "createDirectory"] });
  if (!res || res.length === 0) return null;
  const first = res.at(0);
  if (first === undefined) return null;
  return first;
}

/**
 * Sélecteur de logo (PNG/JPEG ≤ 400 Ko) : le fichier est COPIÉ dans
 * <userData>/logos et seul ce chemin est retourné (jamais le chemin source).
 * Annulation = `{ path: null, dataUrl: null }` (pas d'erreur).
 * Fichier invalide = exception à message FR (mappée par le registry).
 */
export function pickLogo(): { path: string | null; dataUrl: string | null } {
  const res = dialog.showOpenDialogSync({
    properties: ["openFile"],
    filters: [{ name: "Images (PNG/JPEG)", extensions: ["png", "jpg", "jpeg"] }],
  });
  if (!res || res.length === 0) return { path: null, dataUrl: null };
  const source = res.at(0);
  if (source === undefined) return { path: null, dataUrl: null };
  const dest = storeLogoFile(source, path.join(app.getPath("userData"), "logos"));
  return { path: dest, dataUrl: readLogoDataUrlFromFile(dest) };
}

export function openPathSafe(target: string, allowedRoots: string[]): void {
  // P4: comparaison sur chemins RÉSOLUS (realpath symlink/jonction),
  // insensible à la casse Windows, refus UNC non listé.
  const resolved = resolveBestEffort(target);
  const ok = allowedRoots.some((r) => {
    const root = resolveBestEffort(r);
    if (process.platform === "win32") {
      return (
        resolved.toLowerCase() === root.toLowerCase() ||
        resolved.toLowerCase().startsWith(root.toLowerCase() + path.sep)
      );
    }
    return resolved === root || resolved.startsWith(root + path.sep);
  });
  if (!ok) throw new Error("Chemin non autorisé.");
  void shell.openPath(resolved);
}

/** Résout le réel (symlink/jonction) best-effort, sinon le normalisé. */
function resolveBestEffort(p: string): string {
  try {
    return fs.realpathSync(path.normalize(p));
  } catch {
    return path.normalize(p);
  }
}

/** Ouvre le dossier des journaux (userData/logs) dans l'explorateur. */
export function openLogsFolder(): { opened: boolean; folder: string } {
  // P4: confiné au dossier de logs applicatif (realpath + égalité stricte),
  // jamais cwd/logs arbitraire : repli userData/logs si état inattendu.
  const file = getLogFile();
  let folder = file ? path.dirname(file) : path.join(app.getPath("userData"), "logs");
  folder = resolveBestEffort(folder);
  const expected = resolveBestEffort(path.join(app.getPath("userData"), "logs"));
  const same =
    process.platform === "win32"
      ? folder.toLowerCase() === expected.toLowerCase()
      : folder === expected;
  if (!same) {
    throw new Error("Dossier des journaux indisponible.");
  }
  fs.mkdirSync(folder, { recursive: true });
  void shell.openPath(folder);
  return { opened: true, folder };
}
