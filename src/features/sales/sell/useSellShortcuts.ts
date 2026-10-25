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
  openHelp: () => void;
  bump: (d: 1 | -1) => void;
}

/**
 * +/− doivent agir sur la dernière ligne même quand le focus est dans la
 * recherche/scan. On ne les avale que dans les AUTRES champs éditables
 * (client, quantité, livraison…) où ils font partie de la saisie normale.
 */
export function shouldIgnoreBump(active: { tagName: string } | null, search: unknown): boolean {
  return (
    active != null && active !== search && ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName)
  );
}

export interface ScanKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
  isComposing: boolean;
}

/**
 * Douchette clavier : une frappe du jeu scan hors champ ramène le focus en
 * recherche (pur, testé). Espace exclu (activation des boutons au clavier,
 * WCAG 2.1.1) ; Entrée exclue par sa longueur ; modificateurs, répétition et
 * composition IME exclus. Le caractère n'est jamais avalé : il atterrit dans
 * le champ refocalisé. Arbitrage documenté : sur un bouton focalisé, une
 * frappe scan déplace le focus (priorité douchette en caisse).
 */
export function shouldRefocusSearch(
  key: ScanKey,
  activeTagName: string | null,
  modalOpen: boolean,
): boolean {
  if (modalOpen) return false;
  if (key.ctrlKey || key.metaKey || key.altKey || key.repeat || key.isComposing) return false;
  if (key.key.length !== 1 || key.key === " ") return false;
  if (!/^[0-9A-Za-z\-_.]$/.test(key.key)) return false;
  return activeTagName == null || !["INPUT", "SELECT", "TEXTAREA"].includes(activeTagName);
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
      // Aide raccourcis ([?] ou F12) : jamais dans un champ (le « ? » reste
      // saisissable en recherche — produit « quoi ? »).
      if (e.key === "?" || e.key === "F12") {
        const active = document.activeElement;
        if (active && ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName)) return;
        e.preventDefault();
        keyActions.current?.openHelp();
        return;
      }
      // +/− sont RÉSERVÉS à la quantité de la dernière ligne, y compris quand
      // le focus est dans la recherche/scan : la caisse est clavier-first et
      // un scan laisse le focus dans ce champ. On n'avale donc jamais ces
      // touches dans la recherche ; les autres champs (client, quantité,
      // livraison, formulaires) conservent la saisie normale.
      if (e.key === "+" || e.key === "=" || e.code === "NumpadAdd") {
        if (shouldIgnoreBump(document.activeElement, searchRef.current)) return;
        e.preventDefault();
        keyActions.current?.bump(1);
        return;
      }
      if (e.key === "-" || e.code === "NumpadSubtract") {
        if (shouldIgnoreBump(document.activeElement, searchRef.current)) return;
        e.preventDefault();
        keyActions.current?.bump(-1);
        return;
      }
      // Douchette clavier : si le focus n'est dans aucun champ (clic ailleurs,
      // modale fermée), une frappe du jeu scan ramène le focus en recherche
      // SANS l'avaler — les chiffres du scan atterrissent dans le champ.
      // Espace exclu (activation boutons), voir shouldRefocusSearch.
      if (
        shouldRefocusSearch(
          {
            key: e.key,
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
            altKey: e.altKey,
            repeat: e.repeat,
            isComposing: e.isComposing,
          },
          document.activeElement?.tagName ?? null,
          false,
        )
      ) {
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyActions, searchRef]);
}
