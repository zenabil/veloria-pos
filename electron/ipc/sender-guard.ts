// Veloria PoS — Electron: garde de provenance IPC (SEC-01 / ELEC-04).
//
// RAPPEL DU RISQUE (audit 2026-11-11, finding SEC-01) :
//   Le wrapper central `handle()` recevait l'événement IPC et le JETAIT
//   (`_event`). Aucun des 199 handlers ne vérifiait `event.sender`. Or le
//   preload expose les 201 canaux à TOUT renderer : uncompromission du
//   renderer (XSS sur une donnée client rendue, ou dépendance compromise)
//   héritait de TOUTE opération privilégiée que la session courante
//   autorisait — y compris la gestion des rôles staff, la réinitialisation
//   de la base, la restauration d'une sauvegarde ou l'import d'une licence.
//
// RÉFLEXE (veloria-electron) : « Verify the sender frame belongs to the
// expected application origin/window before processing privileged requests. »
//
// LE CONTRÔLE :
//   Une requête IPC n'est acceptée que si son `sender` est l'une des
//   fenêtres de l'APPLICATION, enregistrées explicitement. Toute autre
//   origine (une autre webContents, un frame non autorisé, un `null`) est
//   refusée avec un code stable.
//
//   L'ORIGINE EST ENREGISTRÉE, PAS DEVINÉE :
//   - `registerAppWindow()` est appelé au moment où l'application crée sa
//     fenêtre (fenêtre principale, récupération, activation) ;
//   - `unregisterAppWindow()` est appelé à sa fermeture.
//   Ainsi la liste des origines légitimes ne peut pas être élargie par un
//   document : elle est pilotée par le main, qui est le seul code fiable.
//
// LES FENÊTRES D'IMPRESSION (printing.templates.ts, printing.pdf.ts) :
//   Elles sont créées SANS preload (fenêtres cachées, document autonome) :
//   elles n'ont donc AUCUN pont IPC et ne s'inscrivent pas — c'est
//   exactement le comportement voulu (surface d'impression sans privilèges).
//
// LE VÉRIFICATEUR DE SENDER (GATE-04 / SEC-04) :
//   La preuve négative est dans tests/unit/ipc-sender-guard.test.ts.

import { BrowserWindow, WebContents } from "electron";
import { log } from "../services/logger";

/** webContents.id des fenêtres de l'application (fenêtre principale + fenêtres système). */
const trustedSenders = new Set<number>();

/**
 * Enregistre une fenêtre de l'application comme origine IPC autorisée.
 * À appeler au moment de la création de la fenêtre.
 */
export function registerAppWindow(win: BrowserWindow | null | undefined): void {
  if (!win || win.isDestroyed()) return;
  trustedSenders.add(win.webContents.id);
}

/** Retire une fenêtre de la liste des origines autorisées (à la fermeture). */
export function unregisterAppWindow(win: BrowserWindow | null | undefined): void {
  if (!win) return;
  try {
    trustedSenders.delete(win.webContents.id);
  } catch {
    /* fenêtre déjà détruite : rien à retirer */
  }
}

/** Le sender est-il une fenêtre enregistrée de l'application ? */
export function isTrustedSender(sender: WebContents | null | undefined): boolean {
  if (!sender) return false;
  try {
    return trustedSenders.has(sender.id);
  } catch {
    return false;
  }
}

/** Réponse FR stable pour un refus de provenance. */
export const SENDER_DENIED = {
  ok: false as const,
  code: "SENDER_NOT_ALLOWED",
  message: "Action non autorisée.",
};

/**
 * Vérifie la provenance d'une requête IPC.
 * Renvoie `null` si l'origine est autorisée, sinon la réponse de refus.
 *
 * Le refus est SILENCIEUX côté métier : la requête n'atteint JAMAIS le
 * handler (aucune écriture, aucun effet de bord). Un journal technique est
 * écrit pour le diagnostic.
 */
export function checkSender(event: {
  sender: WebContents | null;
}): { ok: false; code: string; message: string } | null {
  if (isTrustedSender(event.sender)) return null;
  const senderId = event.sender?.id ?? -1;
  log("WARN", "ipc", "handler.bad_sender", {
    sender_id: senderId,
    trusted_count: trustedSenders.size,
  });
  return SENDER_DENIED;
}

/**
 * Vide la table des origines (tests unitaires : isolation complète entre
 * deux cas). L'export est réservé aux tests — le code applicatif ne doit
 * jamais l'appeler.
 */
export function __resetTrustedSendersForTests(): void {
  trustedSenders.clear();
}

/** Nombre d'origines enregistrées (diagnostic / tests). */
export function trustedSenderCount(): number {
  return trustedSenders.size;
}
