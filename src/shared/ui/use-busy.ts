// Veloria PoS — Shared: garde anti-empilement des raccourcis clavier.
// Chaque écran ignore ses raccourcis quand une fenêtre modale est ouverte.

/** Vrai si une fenêtre modale est ouverte (garde anti-empilement des raccourcis). */
export function isAnyModalOpen(): boolean {
  return document.querySelector('[role="dialog"]') != null;
}
