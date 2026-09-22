// Veloria PoS — Shared: préférence de confirmation (UI uniquement).
// Stockée en localStorage (préférence d'interface, pas une donnée métier) :
// `veloria.confirmDelete === "0"` désactive les demandes de confirmation.
// La modale elle-même vit dans `confirm-dialog.tsx` (`useConfirm`, non bloquant).

const CONFIRM_KEY = "veloria.confirmDelete";

export function confirmDeletesEnabled(): boolean {
  try {
    return window.localStorage.getItem(CONFIRM_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setConfirmDeletesEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(CONFIRM_KEY, enabled ? "1" : "0");
  } catch {
    /* préférence non persistée */
  }
}
