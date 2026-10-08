// Veloria License Manager — Fenêtre unique (outil vendor, mêmes flags sûrs).
import { app, BrowserWindow, shell } from "electron";
import fs from "node:fs";
import path from "node:path";

let mainWindow: BrowserWindow | null = null;

/**
 * Icône de la fenêtre : exposée via `extraResources/icons`
 * (voir electron-builder.license-manager.yml). En dev, repli `public/icons`.
 */
export function resolveManagerIcon(): string {
  const candidates = [
    path.join(process.resourcesPath, "icons", "manager-icon.ico"),
    path.join(app.getAppPath(), "public", "icons", "manager-icon.ico"),
    path.join(process.cwd(), "public", "icons", "manager-icon.ico"),
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

export function getManagerWindow(): BrowserWindow | null {
  return mainWindow;
}

export function createManagerWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return mainWindow;
  }
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: "Veloria License Manager",
    icon: resolveManagerIcon(),
    autoHideMenuBar: true,
    backgroundColor: "#0b0f14",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const devUrl = process.env["VITE_MANAGER_URL"];
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, "..", "..", "..", "dist-license-manager-renderer", "index.html"),
    );
  }
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  try {
    mainWindow.webContents.session.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
  } catch {
    /* session indisponible en test */
  }
  return mainWindow;
}
