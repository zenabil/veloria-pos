// Veloria PoS — Caisse : raccourcis clavier (P4, extrait de SellScreen).
// F1 article libre, F3 recherche, F10 paiement, F4 proforma, F5 client,
// F6/F8 onglets, F9 vider, +/− quantité dernière ligne.
import { useEffect, type RefObject } from "react";
import { isAnyModalOpen } from "@shared/ui/use-busy.ts";

export interface SellKeyActions {
  openCustom: () => void;
  openPay: () => void;
  createProforma: () => Promise<void>;
  newTab: () => void;
  clearCart: () => void;
  closeTab: () => void;
  focusClient: () => void;
  bump: (d: 1 | -1) => void;
}

export function useSellShortcuts(
  keyActions: RefObject<SellKeyActions | null>,
  searchRef: RefObject<HTMLInputElement | null>,
): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isAnyModalOpen()) return;
      if (e.key === "F1") {
        e.preventDefault();
        keyActions.current?.openCustom();
        return;
      }
      if (e.key === "F3") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "F10") {
        e.preventDefault();
        keyActions.current?.openPay();
        return;
      }
      if (e.key === "F4") {
        e.preventDefault();
        void keyActions.current?.createProforma();
        return;
      }
      if (e.key === "F5") {
        e.preventDefault();
        keyActions.current?.focusClient();
        return;
      }
      if (e.key === "F6") {
        e.preventDefault();
        keyActions.current?.newTab();
        return;
      }
      if (e.key === "F8") {
        e.preventDefault();
        keyActions.current?.closeTab();
        return;
      }
      if (e.key === "F9") {
        e.preventDefault();
        keyActions.current?.clearCart();
        return;
      }
      if (e.key === "+" || e.key === "=" || e.code === "NumpadAdd") {
        const active = document.activeElement;
        if (active && ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName)) return;
        e.preventDefault();
        keyActions.current?.bump(1);
        return;
      }
      if (e.key === "-" || e.code === "NumpadSubtract") {
        const active = document.activeElement;
        if (active && ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName)) return;
        e.preventDefault();
        keyActions.current?.bump(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyActions, searchRef]);
}
