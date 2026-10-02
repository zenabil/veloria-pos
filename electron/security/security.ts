// Veloria PoS — Electron: security helpers (navigation + path allow-lists).
import fs from "node:fs";
import path from "node:path";

/**
 * Navigation externe : AUCUNE origine distante n'est chargée dans la fenêtre
 * privilégiée (preload bridge actif). Contenu local initial chargé via
 * loadFile (ne passe pas par will-navigate) — toute navigation file://
 * ultérieure est donc suspecte et refusée. Seul le serveur de dev Vite
 * (localhost:5173 strict) est autorisé in-app ; tout le reste s'ouvre
 * dans le navigateur du système via shell.openExternal (voir window-manager).
 * Root: deny-by-default, pas de allow-list file:// arbitraire.
 */
export const ALLOWED_EXTERNAL_PREFIXES: readonly string[] = [];

export function isExternalNavigationAllowed(url: string): boolean {
  // EL-02/EL-03: file:// arbitraire refusé — la SPA n'a aucune navigation
  // interne légitime (App.tsx useState, pas de router). Le chargement initial
  // dist/index.html via loadFile ne déclenche pas will-navigate.
  if (url.startsWith("file://")) return false;
  // P13: dev seul (Vite strictPort 5173) — plus aucun port localhost arbitraire.
  if (url.startsWith("http://localhost:5173/") || url === "http://localhost:5173") return true;
  if (url.startsWith("http://127.0.0.1:5173/") || url === "http://127.0.0.1:5173") return true;
  return ALLOWED_EXTERNAL_PREFIXES.some((p) => url.startsWith(p));
}

/**
 * Garde-fou openExternal : seul https vers le navigateur OS (pas de http en
 * clair MITM, pas de file:/data:/blob:).
 */
export function isSafeExternalUrl(url: string): boolean {
  return url.startsWith("https://");
}

/** Restore/relocation file validation (shallow, before SQLite open). */
export function isAllowedDatabaseFile(filePath: string): boolean {
  if (typeof filePath !== "string" || filePath.length === 0 || filePath.length > 2000) return false;
  if (filePath.includes("\0")) return false;
  const lower = filePath.toLowerCase();
  if (path.basename(lower).length === 0) return false;
  return lower.endsWith(".sqlite") || lower.endsWith(".vposdb");
}

/**
 * Filesystem root-cause guard (EL-27/28/29/30/35) : tout chemin utilisateur
 * est normalisé + résolu (symlink parent best-effort via realpathSync) puis
 * confronté à une deny-list système. Remplace les checks `includes("..")` /
 * `endsWith` épars. Les appelants (relocate/export/restore) gardent en plus
 * leurs contrôles métier (dialogue OS, existence, verifyDbFileCopy).
 */
const SYSTEM_DENIED_ROOTS = [
  "c:\\windows",
  "c:\\program files",
  "c:\\program files (x86)",
  "c:\\programdata\\microsoft",
  "c:\\$recycle.bin",
  "c:\\system volume information",
];

// RADICAL-FIX: même deny-list pour TOUT lecteur (D:\Windows, E:\Program Files…)
// + racines Unix/macOS sensibles. Le check principal reste isSystemDeniedPath
// sur chemin résolu en minuscules.
const DENIED_SUFFIXES = [
  "\\windows",
  "\\program files",
  "\\program files (x86)",
  "\\programdata\\microsoft",
  "\\$recycle.bin",
  "\\system volume information",
  "/etc",
  "/bin",
  "/sbin",
  "/usr/bin",
  "/usr/sbin",
  "/system",
];

export function isSystemDeniedPath(resolvedLower: string): boolean {
  if (SYSTEM_DENIED_ROOTS.some((d) => resolvedLower === d || resolvedLower.startsWith(`${d}\\`))) {
    return true;
  }
  // Tout lecteur Windows: X:\Windows, X:\Program Files…
  if (/^[a-z]:\\/i.test(resolvedLower)) {
    const withoutDrive = resolvedLower.slice(2);
    if (DENIED_SUFFIXES.some((s) => withoutDrive === s || withoutDrive.startsWith(`${s}\\`))) {
      return true;
    }
  }
  // Unix/macOS: /etc, /bin… (défense en profondeur, même si cible Windows).
  if (resolvedLower.startsWith("/")) {
    if (DENIED_SUFFIXES.some((s) => resolvedLower === s || resolvedLower.startsWith(`${s}/`))) {
      return true;
    }
  }
  return false;
}

/**
 * Valide un dossier choisi par l'utilisateur (export/relocate) : absolu,
 * non-système, symlink (et parents) résolus. Lève un message FR (jamais de
 * chemin brut). P5: remonte la chaîne des parents existants pour résoudre un
 * symlink parent même si la cible finale n'existe pas encore + refuse les
 * racines de lecteur (C:\, D:\) et les chemins UNC hors allow-list.
 */
export function assertSafeUserFolder(folder: string): string {
  if (typeof folder !== "string" || folder.length === 0 || folder.length > 500) {
    throw new Error("Dossier invalide.");
  }
  if (folder.includes("\0")) throw new Error("Dossier invalide.");
  const normalized = path.normalize(folder);
  if (!path.isAbsolute(normalized)) throw new Error("Dossier invalide.");
  // UNC (\\serveur\partage) : refusé sauf racine explicitement autorisée
  // (aucune par défaut — le dialogue OS reste le chemin recommandé).
  if (normalized.startsWith("\\\\")) throw new Error("Dossier réseau non pris en charge.");
  const lowered = normalized.toLowerCase();
  if (isSystemDeniedPath(lowered)) {
    throw new Error("Dossier système protégé : choisissez un autre dossier.");
  }
  // Racine de lecteur nue (C:\, D:\) : écrire à la racine est refusé.
  if (/^[a-z]:\\$/.test(lowered)) {
    throw new Error("Choisissez un dossier (pas la racine du lecteur).");
  }
  // Symlink : résout la cible si elle existe, sinon le plus proche parent
  // existant (jonction parente détectée même pour un dossier à créer).
  let probe = normalized;
  for (let depth = 0; depth < 32; depth++) {
    try {
      const real = fs.realpathSync(probe);
      if (isSystemDeniedPath(real.toLowerCase())) {
        throw new Error("Dossier système protégé : choisissez un autre dossier.");
      }
      return normalized;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Dossier système")) throw err;
      const parent = path.dirname(probe);
      if (parent === probe) return normalized;
      probe = parent;
    }
  }
  return normalized;
}
