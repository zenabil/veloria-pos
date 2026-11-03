// Veloria PoS — Electron : commande d'impression avec échéance (garde E-49).
// Séparé de `printing.templates` (cap de découpage : 300 lignes par gabarit).
import type { WebContents } from "electron";

/** Options réellement acceptées par `webContents.print` (Electron 45). */
type PrintArgs = Parameters<WebContents["print"]>[0];

/**
 * Échéance max d'une commande au pilote. Volontairement large : une impression
 * lente (spouleur froid, imprimante réseau) doit finir par passer ; seules les
 * tentatives réellement bloquées sont coupées.
 */
const PRINT_WATCHDOG_MS = 45_000;

/**
 * E-49 (radical) — `webContents.print` NE RAPPELLE PAS son callback quand le
 * spouleur ou le pilote se bloque (file hors ligne, port USB qui disparaît).
 * Sans échéance, l'`await` ne se résolvait jamais, le `finally
 * printWin.destroy()` ne s'exécutait jamais : invoke IPC pendu POUR TOUJOURS +
 * une fenêtre cachée qui fuit à chaque tentative. Le pilote n'est pas réparé
 * ici ; la caisse, si (message FR, fenêtre détruite par l'appelant).
 */
export function printWithWatchdog(contents: WebContents, options: PrintArgs): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const watchdog = setTimeout(() => {
      reject(new Error("Imprimante sans réponse : vérifiez le pilote et la file d'attente."));
    }, PRINT_WATCHDOG_MS);
    contents.print(options, (success, err) => {
      clearTimeout(watchdog);
      if (!success) reject(new Error(err || "print failed"));
      else resolve();
    });
  });
}
