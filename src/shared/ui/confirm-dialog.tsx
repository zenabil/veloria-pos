// Veloria PoS — Shared: confirmation non bloquante (remplace window.confirm).
// `confirmAction` (bloquant, style OS) est supprimé : `useConfirm()` affiche une
// modale applicative (Échap = annuler) et résout un booléen. La préférence
// `veloria.confirmDelete` (Paramètres) court-circuite vers `true` comme avant.
// Le provider est monté une fois dans `main.tsx`, autour de l'application.

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button, Modal } from "@shared/ui/primitives.tsx";
import { confirmDeletesEnabled } from "@shared/ui/confirm.ts";
import { playSound } from "@shared/sound/sound.ts";

type ConfirmFn = (message: string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(true));

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}

interface Pending {
  id: number;
  message: string;
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [pending, setPending] = useState<Pending | null>(null);
  const seq = useRef(0);

  const confirm = useCallback<ConfirmFn>((message) => {
    // Préférence désactivée : comportement historique (toujours confirmer).
    if (!confirmDeletesEnabled()) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      seq.current += 1;
      setPending((prev) => {
        // Jamais deux modales : l'ancienne est résolue par `false`.
        if (prev) prev.resolve(false);
        return { id: seq.current, message, resolve };
      });
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    // P5 : confirmation destructive = avertissement sonore (annulation silencieuse).
    if (value) {
      try {
        playSound("warning");
      } catch {
        /* son best effort */
      }
    }
    setPending((prev) => {
      if (prev) prev.resolve(value);
      return null;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? (
        <Modal label="Confirmation" title="Confirmation" onClose={() => settle(false)}>
          <p className="text-sm leading-relaxed whitespace-pre-line text-slate-200">
            {pending.message}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => settle(false)}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button type="button" onClick={() => settle(true)} className="flex-[2]">
              Confirmer
            </Button>
          </div>
        </Modal>
      ) : null}
    </ConfirmContext.Provider>
  );
}
