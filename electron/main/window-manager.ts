// Veloria PoS — Electron main: window manager (single window, secure defaults).

import { BrowserWindow, shell } from "electron";
import path from "node:path";

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

const ALLOWED_EXTERNAL = ["https://veloria.local", "https://opencode.ai"];

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    title: "Veloria PoS — Point de vente",
    icon: path.join(__dirname, "../../public/icons/icon.ico"),
    backgroundColor: "#0b0f14",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devUrl = process.env["VITE_DEV_SERVER_URL"];
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  }

  // Restrictive navigation: only local content; external allow-list via OS browser.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (
      !url.startsWith("file://") &&
      !url.startsWith("http://localhost") &&
      !ALLOWED_EXTERNAL.some((a) => url.startsWith(a))
    ) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  return mainWindow;
}
