// Veloria PoS — Documents purs : échappement HTML (zéro import).
// Extrait de receipt-documents/common.ts (découpage gabarit ≤300 lignes,
// sans changement fonctionnel) : source unique P28.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Échappement texte brut pour conteneur HTML (ticket thermique <pre>) :
 * source centrale unique (P28) — buildReceiptText étant du texte non échappé,
 * thermalHtml passe par ici au lieu d'un replace partiel.
 */
export function escapePreText(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
