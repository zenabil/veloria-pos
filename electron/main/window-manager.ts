// Veloria PoS — Electron main: window manager (single window, secure defaults).

import { app, BrowserWindow, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { IPC_CHANNELS } from "../ipc/channels";
import { isExternalNavigationAllowed, isSafeExternalUrl } from "../security/security";

let mainWindow: BrowserWindow | null = null;
let recoveryWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function getRecoveryWindow(): BrowserWindow | null {
  return recoveryWindow;
}

/**
 * Icône de la fenêtre : `public/` n'est PAS empaqueté dans l'asar, l'icône
 * est donc exposée via `extraResources/icons` (voir electron-builder.yml).
 * En dev, repli sur `public/icons` du projet.
 */
export function resolveWindowIcon(): string {
  const candidates = [
    path.join(process.resourcesPath, "icons", "icon.ico"),
    path.join(app.getAppPath(), "public", "icons", "icon.ico"),
    path.join(process.cwd(), "public", "icons", "icon.ico"),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* candidat suivant */
    }
  }
  return candidates[0] ?? "";
}

/**
 * Politique de sécurité UNIFIÉE (P1) : appliquée à chaque fenêtre
 * (main/recovery/license/print) sans dépendre de l'ordre de création.
 * Chaque fenêtre déclare explicitement : contextIsolation, nodeIntegration,
 * sandbox, webviewTag, preload, navigation, redirect, permissions, window.open.
 */
function hardenedWebPreferences(preload: string | null): Electron.WebPreferences {
  return {
    ...(preload == null ? {} : { preload }),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webviewTag: false,
  };
}

/** Garde webview globale (aucun <webview> dans Veloria) — une seule fois au chargement du module. */
let webviewGuardInstalled = false;
function installWebviewGuardOnce(): void {
  if (webviewGuardInstalled) return;
  webviewGuardInstalled = true;
  try {
    app.on("web-contents-created", (_event, contents) => {
      contents.on("will-attach-webview" as never, (e: { preventDefault(): void }) => {
        e.preventDefault();
      });
    });
  } catch {
    /* ignore */
  }
}
installWebviewGuardOnce();

function guardWebContents(wc: Electron.WebContents): void {
  wc.on("will-navigate", (event, url) => {
    if (!isExternalNavigationAllowed(url, app.isPackaged)) {
      event.preventDefault();
      if (isSafeExternalUrl(url)) void shell.openExternal(url);
    }
  });
  wc.on("will-redirect", (event, url) => {
    if (!isExternalNavigationAllowed(url, app.isPackaged)) {
      event.preventDefault();
      if (isSafeExternalUrl(url)) void shell.openExternal(url);
    }
  });
}

function denyPermissions(win: BrowserWindow): void {
  try {
    win.webContents.session.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
  } catch {
    /* session indisponible en test */
  }
}

function denyPopups(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
}

/** Applique la politique complète à une fenêtre déjà créée. */
function secureWindow(win: BrowserWindow): void {
  denyPermissions(win);
  guardWebContents(win.webContents);
  denyPopups(win);
}

export function createMainWindow(): BrowserWindow {
  // Garde anti-doublon (ex. réessai depuis la récupération) : jamais deux
  // coquilles — on réutilise la fenêtre vivante au lieu d'en créer une autre.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return mainWindow;
  }
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    title: "Veloria PoS — Point de vente",
    icon: resolveWindowIcon(),
    autoHideMenuBar: true,
    // Chrome personnalisé React : pas de cadre natif, fond transparent pour
    // coins arrondis + ombre en CSS (mêmes flags de sécurité inchangés).
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: hardenedWebPreferences(path.join(__dirname, "..", "preload", "preload.js")),
  });

  // Pousse l'état agrandi/restauré vers le renderer (icône + coins du chrome).
  // Jamais d'envoi vers une fenêtre détruite (pas d'IPC après fermeture).
  const win = mainWindow;
  const pushMaximized = (): void => {
    if (win.isDestroyed()) return;
    try {
      win.webContents.send(IPC_CHANNELS["window.maximizedChanged"], {
        maximized: win.isMaximized(),
      });
    } catch {
      /* renderer pas encore prêt : l'état est relu via window.isMaximized */
    }
  };
  mainWindow.on("maximize", pushMaximized);
  mainWindow.on("unmaximize", pushMaximized);

  // P1: politique unifiée (permissions + navigation/redirect + popups).
  secureWindow(mainWindow);

  const devUrl = process.env["VITE_DEV_SERVER_URL"];
  // M1 RADICAL : contenu distant UNIQUEMENT hors packaged. En prod packagée,
  // une variable d'env résiduelle/malveillante ne doit JAMAIS charger un
  // contenu attaquant dans la fenêtre privilégiée (bridge window.veloria).
  if (devUrl && !app.isPackaged) {
    mainWindow.loadURL(devUrl).catch((err: unknown) => {
      console.error("[Veloria][FATAL] mainWindow.loadURL failed", err);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../dist/index.html")).catch((err: unknown) => {
      console.error("[Veloria][FATAL] mainWindow.loadFile failed", err);
    });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  return mainWindow;
}

/**
 * Fenêtre de récupération (base non prête) : contenu statique français généré
 * par le main (aucune coquille applicative, aucun appel métier). Créée une
 * seule fois puis rechargée à chaque nouvel échec (réessai infructueux).
 */
export function showRecoveryWindow(html: string): BrowserWindow {
  if (recoveryWindow) {
    recoveryWindow
      .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      .catch((err: unknown) => {
        console.error("[Veloria][FATAL] recoveryWindow.loadURL failed", err);
      });
    recoveryWindow.focus();
    return recoveryWindow;
  }
  recoveryWindow = new BrowserWindow({
    width: 720,
    height: 640,
    minWidth: 600,
    minHeight: 560,
    title: "Veloria PoS — Récupération",
    icon: resolveWindowIcon(),
    autoHideMenuBar: true,
    backgroundColor: "#0b0f14",
    webPreferences: hardenedWebPreferences(path.join(__dirname, "..", "preload", "preload.js")),
  });
  recoveryWindow
    .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    .catch((err: unknown) => {
      console.error("[Veloria][FATAL] recoveryWindow.loadURL failed", err);
    });
  // P1: même politique que la fenêtre principale.
  secureWindow(recoveryWindow);

  recoveryWindow.on("closed", () => {
    recoveryWindow = null;
  });
  return recoveryWindow;
}

/**
 * Fenêtre d'activation (licence requise) : même durcissement que la
 * récupération (contenu data: statique + preload bridge, sans coquille).
 */
let licenseWindow: BrowserWindow | null = null;

export function getLicenseWindow(): BrowserWindow | null {
  return licenseWindow;
}

export function showLicenseWindow(html: string): BrowserWindow {
  if (licenseWindow && !licenseWindow.isDestroyed()) {
    licenseWindow
      .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      .catch((err: unknown) => {
        console.error("[Veloria][FATAL] licenseWindow.loadURL failed", err);
      });
    licenseWindow.focus();
    return licenseWindow;
  }
  licenseWindow = new BrowserWindow({
    width: 640,
    height: 620,
    minWidth: 560,
    minHeight: 540,
    title: "Veloria PoS — Activation",
    icon: resolveWindowIcon(),
    autoHideMenuBar: true,
    backgroundColor: "#0b0f14",
    webPreferences: hardenedWebPreferences(path.join(__dirname, "..", "preload", "preload.js")),
  });
  licenseWindow
    .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    .catch((err: unknown) => {
      console.error("[Veloria][FATAL] licenseWindow.loadURL failed", err);
    });
  // P1: même politique que la fenêtre principale.
  secureWindow(licenseWindow);
  licenseWindow.on("closed", () => {
    licenseWindow = null;
  });
  try {
    licenseWindow.webContents.session.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
  } catch {
    /* session indisponible en test */
  }
  return licenseWindow;
}

export function closeLicenseWindow(): void {
  try {
    licenseWindow?.close();
  } catch {
    /* fermeture déjà en cours : état nominal */
  } finally {
    licenseWindow = null;
  }
}

export function closeRecoveryWindow(): void {
  try {
    recoveryWindow?.close();
  } catch {
    /* fermeture déjà en cours : état nominal */
  } finally {
    recoveryWindow = null;
  }
}
