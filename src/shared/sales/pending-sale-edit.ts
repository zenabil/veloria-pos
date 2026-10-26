// Veloria PoS — Shared: panier de réédition d'une vente annulée.
// L'Historique (module démonté) prépare ce brouillon ; la Caisse le consomme
// une seule fois APRÈS son hydratation des paniers persistés (sinon le
// brouillon serait écrasé). Aucune donnée métier persistée ici.
import { create } from "zustand";

export interface PendingSaleEditLine {
  productId: number | null;
  productName: string;
  unitCode: string;
  originalUnitPriceMinor: number;
  unitPriceMinor: number;
  purchasePriceMinor: number;
  quantity: number;
  billedTotalMinor: number | null;
  packagingId: number | null;
  packagingLabelFr: string | null;
  packagingFactor: number | null;
  packagingSellingPriceMinor: number | null;
  packagingAutoCartonPricing: boolean;
  packagingPriceOverridden: boolean;
  stockQty: number | null;
}

export interface PendingSaleEdit {
  invoiceNumber: string;
  customerId: number | null;
  customerLabel: string;
  deliveryFeeMinor: number;
  lines: PendingSaleEditLine[];
}

interface PendingSaleEditStore {
  draft: PendingSaleEdit | null;
  set: (draft: PendingSaleEdit) => void;
  /** Lit puis efface : un brouillon n'est appliqué qu'une seule fois. */
  take: () => PendingSaleEdit | null;
}

export const usePendingSaleEdit = create<PendingSaleEditStore>((set, get) => ({
  draft: null,
  set: (draft) => set({ draft }),
  take: () => {
    const draft = get().draft;
    if (draft != null) set({ draft: null });
    return draft;
  },
}));
