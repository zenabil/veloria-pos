// Veloria PoS — Shared: garde anti-course des chargements (séquence).
// Les IPC Electron n'ont pas de signal d'annulation : on ignore les réponses
// périmées par numéro de séquence (même motif historique que Stock, Clients,
// History — ici sous forme de hook unifié P1-1/P1-2).
import { useRef } from "react";

export function useLoadSeq(): {
  /** Démarre un chargement et rend son numéro (à capturer avant l'await). */
  next: () => number;
  /** true si aucun chargement plus récent n'a démarré depuis. */
  isCurrent: (seq: number) => boolean;
} {
  const ref = useRef(0);
  const next = (): number => {
    ref.current += 1;
    return ref.current;
  };
  const isCurrent = (seq: number): boolean => seq === ref.current;
  return { next, isCurrent };
}
