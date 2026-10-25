// Veloria PoS — Feature: sales carts store (ephemeral UI state only).
// SQLite remains the source of truth; this store holds the in-progress carts.
// Plusieurs paniers coexistent en onglets : ouvrir un nouveau panier ne
// supprime jamais les précédents.
import { create } from "zustand";
import { roundQuantity } from "@domain/common/quantity.ts";
import { isBilledByAmount } from "@domain/sales/sale-rules.ts";
import type { CartLine } from "@/application/sales/create-sale.ts";

export interface CartTab {
  id: number;
  name: string;
  lines: CartLine[];
  customerId: number | null;
  customerLabel: string;
  amountPaidMinor: number;
  paymentMethod: "cash" | "cheque" | "transfer" | null;
  deliveryFeeMinor: number;
  /**
   * Identité d'une tentative d'encaissement pour CE panier. Réutilisée tant
   * que la vente n'a pas abouti (retry/double-clic = même opération), puis
   * effacée avec le panier. Évite un second brouillon d'opération.
   */
  saleOperationId?: string | null;
}

type TotalsPatch = Partial<Pick<CartTab, "amountPaidMinor" | "paymentMethod" | "deliveryFeeMinor">>;

interface CartsStore {
  tabs: CartTab[];
  activeId: number;
  /** Ouvre un nouvel onglet panier (les autres sont conservés). */
  newTab: () => void;
  switchTab: (id: number) => void;
  /** Ferme un onglet ; si c'est le dernier, il est réinitialisé. */
  closeTab: (id: number) => void;
  addLine: (line: CartLine) => void;
  setQty: (key: string, qty: number) => void;
  /** P0-7 : change le prix FACTURÉ (l'original reste la référence remise). */
  setLinePrice: (key: string, finalMinor: number) => void;
  removeLine: (key: string) => void;
  /** Vide l'onglet actif (l'onglet lui-même est conservé). */
  clear: () => void;
  setCustomer: (id: number | null, label: string) => void;
  setTotals: (patch: TotalsPatch) => void;
  setSaleOperationId: (id: string | null) => void;
  /** P4 : remplace les onglets par les brouillons persistés (démarrage). */
  hydrate: (tabs: CartTab[]) => void;
}

/** Vue de l'onglet actif + gestion des onglets (ce que consomme l'écran). */
export type ActiveCart = CartTab & CartsStore;

/** Limites alignées sur le schéma IPC et le domaine (une seule règle). */
export const MAX_CART_LINES = 500;
export const MAX_CART_TABS = 20;

let tabSeq = 0;
let lineSeq = 0;

/**
 * Nom stable du panier : attribué UNE fois à la création (compteur monotone),
 * jamais renommé ensuite. Fermer l'onglet médian ne renomme plus les voisins
 * sous les yeux de l'opérateur (les trous de numérotation sont acceptés).
 */
function nextTabName(): string {
  return `Panier ${tabSeq + 1}`;
}

function makeTab(name: string): CartTab {
  tabSeq += 1;
  return {
    id: tabSeq,
    name,
    lines: [],
    customerId: null,
    customerLabel: "Client de passage",
    amountPaidMinor: 0,
    paymentMethod: "cash",
    deliveryFeeMinor: 0,
    saleOperationId: null,
  };
}

function patchActive(
  tabs: CartTab[],
  activeId: number,
  patch: (tab: CartTab) => CartTab,
): CartTab[] {
  return tabs.map((t) => (t.id === activeId ? patch(t) : t));
}

const firstTab = makeTab(nextTabName());

/** Magasin brut (sans React) : utilisé par les tests unitaires via getState(). */
export const useCartsStore = create<CartsStore>((set) => ({
  tabs: [firstTab],
  activeId: firstTab.id,
  newTab: () =>
    set((s) => {
      if (s.tabs.length >= MAX_CART_TABS) return {};
      const tab = makeTab(nextTabName());
      return { tabs: [...s.tabs, tab], activeId: tab.id };
    }),
  switchTab: (id) => set((s) => (s.tabs.some((t) => t.id === id) ? { activeId: id } : {})),
  closeTab: (id) =>
    set((s) => {
      if (s.tabs.length <= 1) {
        const fresh = makeTab(nextTabName());
        return { tabs: [fresh], activeId: fresh.id };
      }
      // Noms stables : on retire l'onglet sans toucher aux autres.
      const tabs = s.tabs.filter((t) => t.id !== id);
      // tabs ne peut pas être vide ici (on avait ≥ 2 onglets) : le voisin
      // de gauche devient l'actif (repli sur le premier).
      const fallback = tabs[Math.max(0, s.tabs.findIndex((t) => t.id === id) - 1)] ?? tabs[0];
      const activeId = s.activeId === id ? (fallback?.id ?? s.activeId) : s.activeId;
      return { tabs, activeId };
    }),
  addLine: (line) =>
    set((s) => ({
      tabs: patchActive(s.tabs, s.activeId, (t) => {
        const key = line.key || `l${(lineSeq += 1)}`;
        // P0-7 : l'original défaut = prix catalogue à l'ajout ; deux prix
        // facturés différents du même produit = deux lignes distinctes.
        const incoming: CartLine = {
          ...line,
          key,
          originalUnitPriceMinor: line.originalUnitPriceMinor || line.unitPriceMinor,
        };
        const existing = t.lines.find(
          (l) =>
            l.productId != null &&
            l.productId === incoming.productId &&
            l.unitPriceMinor === incoming.unitPriceMinor &&
            (l.originalUnitPriceMinor || l.unitPriceMinor) === incoming.originalUnitPriceMinor &&
            // Le conditionnement fait partie de l'identité de ligne : un prix
            // carton/manuel ne fusionne jamais avec un autre réglage.
            (l.packagingId ?? null) === (incoming.packagingId ?? null) &&
            (l.packagingFactor ?? null) === (incoming.packagingFactor ?? null) &&
            (l.packagingSellingPriceMinor ?? null) ===
              (incoming.packagingSellingPriceMinor ?? null) &&
            (l.packagingAutoCartonPricing === true) ===
              (incoming.packagingAutoCartonPricing === true) &&
            (l.packagingPriceOverridden === true) ===
              (incoming.packagingPriceOverridden === true) &&
            // Mode « Montant » (ADR-131/132) : une ligne facturée au montant
            // SAISI n'est JAMAIS fusionnée (ni avec une autre ligne à montant
            // saisi, ni avec une ligne au prix unitaire) : le montant facturé
            // est unique par ligne, la fusion additionnerait les poids mais
            // garderait un seul montant (perte de recette) et rendrait la
            // ligne incohérente (montant ≠ prix × quantité).
            l.billedTotalMinor == null &&
            incoming.billedTotalMinor == null,
        );
        if (existing) {
          return {
            ...t,
            lines: t.lines.map((l) =>
              l.key === existing.key
                ? {
                    ...l,
                    quantity: roundQuantity(l.quantity + line.quantity),
                    stockQty: line.stockQty ?? l.stockQty ?? null,
                  }
                : l,
            ),
          };
        }
        if (t.lines.length >= MAX_CART_LINES) return t;
        return { ...t, lines: [...t.lines, incoming] };
      }),
    })),
  setLinePrice: (key, finalMinor) =>
    set((s) => ({
      tabs: patchActive(s.tabs, s.activeId, (t) => ({
        ...t,
        lines: t.lines.map((l) =>
          // ADR-132 : ligne facturée au MONTANT SAISI = prix VERROUILLÉ.
          // Modifier le prix rendrait le montant saisi incohérent avec
          // prix × quantité (ligne invendable). Le caissier supprime la
          // ligne et la ressaisit.
          l.key === key && !isBilledByAmount(l)
            ? {
                ...l,
                originalUnitPriceMinor: l.originalUnitPriceMinor || l.unitPriceMinor,
                unitPriceMinor: finalMinor,
                // Prix manuel = règle carton désactivée (badge « Prix manuel »).
                packagingPriceOverridden:
                  l.packagingId != null ? true : (l.packagingPriceOverridden ?? null),
              }
            : l,
        ),
      })),
    })),
  setQty: (key, qty) =>
    set((s) => ({
      tabs: patchActive(s.tabs, s.activeId, (t) => ({
        ...t,
        // P1-3 : arrondi unifié ici (3 décimales) — tous les appelants
        // (boutons, saisie, clavier) passent par la même règle ; ≤ 0 = retrait.
        // ADR-132 : ligne facturée au MONTANT SAISI = quantité VERROUILLÉE
        // (le poids retiré du stock est celui calculé à la saisie).
        lines: t.lines
          .map((l) => {
            if (l.key !== key || isBilledByAmount(l)) return l;
            const next = roundQuantity(qty);
            // Le stock affiché est la borne caisse ; le main reste juge final.
            if (l.stockQty != null && next > l.stockQty) return l;
            return { ...l, quantity: next };
          })
          .filter((l) => l.quantity > 0),
      })),
    })),
  removeLine: (key) =>
    set((s) => ({
      tabs: patchActive(s.tabs, s.activeId, (t) => ({
        ...t,
        lines: t.lines.filter((l) => l.key !== key),
      })),
    })),
  clear: () =>
    set((s) => ({
      tabs: patchActive(s.tabs, s.activeId, (t) => ({
        ...t,
        lines: [],
        amountPaidMinor: 0,
        paymentMethod: "cash",
        deliveryFeeMinor: 0,
        customerId: null,
        customerLabel: "Client de passage",
        saleOperationId: null,
      })),
    })),
  setCustomer: (id, label) =>
    set((s) => ({
      tabs: patchActive(s.tabs, s.activeId, (t) => ({
        ...t,
        customerId: id,
        customerLabel: label,
      })),
    })),
  setTotals: (patch) =>
    set((s) => ({
      tabs: patchActive(s.tabs, s.activeId, (t) => ({ ...t, ...patch })),
    })),
  setSaleOperationId: (id) =>
    set((s) => ({
      tabs: patchActive(s.tabs, s.activeId, (t) => ({ ...t, saleOperationId: id })),
    })),
  hydrate: (tabs) =>
    set(() => {
      // P4 : lignes validées défensivement (brouillon corrompu = ignoré) ;
      // compteurs recalés pour ne jamais recoller des clés/noms existants.
      const clean = tabs
        .filter((t) => Number.isInteger(t.id) && t.id > 0 && Array.isArray(t.lines))
        .slice(0, MAX_CART_TABS)
        .map((t) => ({
          id: t.id,
          name:
            typeof t.name === "string" && t.name.length > 0
              ? t.name.slice(0, 40)
              : `Panier ${t.id}`,
          lines: t.lines
            .filter(
              (l) =>
                typeof l.key === "string" &&
                typeof l.productName === "string" &&
                Number.isFinite(l.quantity) &&
                l.quantity > 0,
            )
            .slice(0, MAX_CART_LINES),
          customerId: t.customerId ?? null,
          customerLabel: t.customerLabel || "Client de passage",
          amountPaidMinor:
            Number.isInteger(t.amountPaidMinor) && t.amountPaidMinor >= 0 ? t.amountPaidMinor : 0,
          paymentMethod: t.paymentMethod ?? null,
          deliveryFeeMinor:
            Number.isInteger(t.deliveryFeeMinor) && t.deliveryFeeMinor >= 0
              ? t.deliveryFeeMinor
              : 0,
          // Le brouillon reprend l'identité d'encaissement éventuelle : un
          // retry après crash rejoue la même vente au lieu d'en créer une 2e.
          saleOperationId:
            typeof t.saleOperationId === "string" && t.saleOperationId.length > 0
              ? t.saleOperationId
              : null,
        }))
        .filter((t) => t.lines.length > 0);
      if (clean.length === 0) return {};
      let maxTab = tabSeq;
      for (const t of clean) {
        if (t.id > maxTab) maxTab = t.id;
        for (const l of t.lines) {
          const m = /^l(\d+)$/.exec(l.key);
          if (m && Number(m[1]) > lineSeq) lineSeq = Number(m[1]);
        }
      }
      tabSeq = maxTab;
      const first = clean[0];
      return { tabs: clean, activeId: first ? first.id : 1 };
    }),
}));

/** Onglet actif + actions + liste des onglets. */
export function useCart(): ActiveCart {
  const store = useCartsStore();
  const active = store.tabs.find((t) => t.id === store.activeId) ?? store.tabs[0];
  if (!active) throw new Error("Aucun panier actif (état inattendu).");
  return {
    ...active,
    tabs: store.tabs,
    activeId: store.activeId,
    newTab: store.newTab,
    switchTab: store.switchTab,
    closeTab: store.closeTab,
    addLine: store.addLine,
    setQty: store.setQty,
    setLinePrice: store.setLinePrice,
    removeLine: store.removeLine,
    hydrate: store.hydrate,
    clear: store.clear,
    setCustomer: store.setCustomer,
    setTotals: store.setTotals,
    setSaleOperationId: store.setSaleOperationId,
  };
}
