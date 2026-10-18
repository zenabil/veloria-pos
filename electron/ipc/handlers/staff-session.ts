// Veloria PoS — Main: session interne courante (mémoire uniquement, jamais en base).
// Le renderer ne s'octroie rien : chaque IPC sensible relit la session ici.
// R2 RADICAL : inactivité bornée — une session oubliée sur un poste partagé
// s'invalide seule (défaut 30 min, cf. STAFF_SESSION_TIMEOUT_MS).

/** Inactivité maximale avant invalidation automatique de la session (30 min). */
export const STAFF_SESSION_TIMEOUT_MS = 30 * 60_000;

let currentUserId: number | null = null;
let lastActivityAt: number | null = null;

export function setCurrentStaffUser(userId: number | null): void {
  currentUserId = userId;
  lastActivityAt = userId == null ? null : Date.now();
}

/** Rafraîchit l'horodatage d'activité (appelé par handle() après gates OK). */
export function touchStaffSession(): void {
  if (currentUserId != null) lastActivityAt = Date.now();
}

export function getCurrentStaffUser(): number | null {
  if (currentUserId == null) return null;
  if (lastActivityAt != null && Date.now() - lastActivityAt > STAFF_SESSION_TIMEOUT_MS) {
    currentUserId = null;
    lastActivityAt = null;
    return null;
  }
  return currentUserId;
}
