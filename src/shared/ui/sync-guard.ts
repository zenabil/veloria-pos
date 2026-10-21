// Veloria PoS — Shared : garde synchrone anti-double-clic.
//
// A-02 (P1) : un `useState` React est ASYNCHRONE — deux appels dans le même
// tick liraient tous deux `busy === false` ⇒ la même action partait deux fois
// (réinitialisation de la base, export de sauvegarde, push du miroir…). La
// caisse avait déjà la bonne réponse (`useSellState.ts` : des `useRef`), les
// réglages ne l'avaient pas.
//
// Cette porte est volontairement un OUTIL PUR (testable sans React) : le hook
// s'en sert, et le test unitaire vérifie la sémantique « un seul passage ».

export interface SyncGuard {
  /** Tente d'entrer : `true` si le passage est accordé (et verrouillé). */
  tryEnter(): boolean;
  /** Libère le verrou (fin de l'action). */
  exit(): void;
  /** Verrouillé en cours ? (état synchrone, sans rendu). */
  locked(): boolean;
}

/** Crée une garde synchrone : au plus un « entrant » à la fois. */
export function createSyncGuard(): SyncGuard {
  let locked = false;
  return {
    tryEnter(): boolean {
      if (locked) return false;
      locked = true;
      return true;
    },
    exit(): void {
      locked = false;
    },
    locked(): boolean {
      return locked;
    },
  };
}
