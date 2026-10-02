// Veloria PoS — Shared : minuterie de debounce (recherches serveur).
// Extrait le motif historique recopié dans 14 écrans/dialogues :
// `useRef<number | null>` + `clearTimeout` avant chaque `setTimeout` +
// nettoyage au démontage. Ici : `schedule(delay, fn)` annule la saisie
// précédente puis planifie, `cancel()` annule sans replanifier, et le
// démontage annule automatiquement (aucune fuite de minuterie).
import { useEffect, useRef } from "react";

export interface DebouncedTimer {
  /** Annule la minuterie en cours puis rappelle `fn` après `delayMs` ms. */
  schedule: (delayMs: number, fn: () => void) => void;
  /** Annule la minuterie en cours (aucun rappel planifié ne survit). */
  cancel: () => void;
}

export function useDebouncedTimer(): DebouncedTimer {
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, []);

  const schedule = (delayMs: number, fn: () => void): void => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fn, delayMs);
  };

  const cancel = (): void => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return { schedule, cancel };
}
