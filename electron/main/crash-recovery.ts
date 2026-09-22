// Veloria PoS — Electron main: récupération crash (main + renderer).
// Erreur fatale main : log + fermeture DB sûre + message FR (jamais de trace).
// Renderer mort : rechargement quand c'est sain de le faire.

import { app, BrowserWindow } from "electron";
import { getMainWindow, getRecoveryWindow } from "./window-manager";
import { checkpointAndClose } from "../database/sqlite.service";
import { log } from "../services/logger";

export function handleUncaughtException(err: Error): void {
  log("FATAL", "app", "uncaughtException", {
    error: err.message,
    stack: err.stack?.slice(0, 2000),
  });
  try {
    checkpointAndClose();
  } finally {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      void win.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(`<body style="font-family:sans-serif;background:#111;color:#eee;padding:40px"><h1>Veloria PoS — Erreur inattendue</h1><p>L'application va se fermer pour protéger vos données. Relancez-la ; votre base est conservée.</p></body>`)}`,
      );
    }
    // Ne jamais laisser l'app en zombie (DB fermée + IPC en échec) :
    // fermeture programmée après affichage du message.
    const timer = setTimeout(() => {
      try {
        app.exit(1);
      } catch {
        /* sortie best-effort */
      }
    }, 6000);
    // Libère la boucle d'événements (le message reste affiché 6 s).
    if (typeof timer.unref === "function") timer.unref();
  }
}

export function handleRendererGone(details: { reason: string }): void {
  log("ERROR", "app", "renderer.gone", { reason: details.reason });
  if (details.reason === "killed") return;
  // Recharge la fenêtre VIVANTE concernée (principale ou récupération) :
  // jamais de reload sur une fenêtre détruite.
  const wins: (BrowserWindow | null)[] = [getMainWindow(), getRecoveryWindow()];
  for (const win of wins) {
    if (!win || win.isDestroyed()) continue;
    try {
      win.reload();
    } catch {
      /* fenêtre en cours de fermeture : état nominal */
    }
  }
}
