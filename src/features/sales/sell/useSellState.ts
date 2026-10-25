// Veloria PoS — Vente : états + gardes + effets de synchronisation (extrait de SellScreen).
// Hook pur d'état (aucun IPC direct sauf la persistance des brouillons, inchangée).
// Toute la logique (centimes, debounce, anti-course) est reprise à l'identique.
import { useEffect, useRef, useState } from "react";
import { useCartsStore, type ActiveCart, type CartTab } from "../cart-store.ts";
import { useDebouncedTimer } from "@shared/ui/use-debounced-timer.ts";
import {
  MAX_MINOR_SINGLE,
  minorToInput,
  minorToInputTotal,
  parseDzdInputStrict,
  parseDzdInputTotal,
} from "@domain/money/money.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { api } from "@shared/types/ipc-client.ts";
import { toCartDraftTabs } from "./cart-drafts.ts";
import { totalsOf } from "@/application/sales/create-sale.ts";
import type { Customer, EnrichedCustomer, StatementSale } from "../../customers/types.ts";
import type { CustomForm } from "./CustomItemDialog.tsx";
import type { CustomerRow, LastSale, ProformaDoc, SearchRow } from "./sell-types.ts";

export interface SellTotals {
  subtotalMinor: number;
  discountAmountMinor: number;
  totalMinor: number;
  remainingMinor: number;
  paymentStatus: string;
}

export type SellState = ReturnType<typeof useSellState>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- retour inféré à dessein (70+ champs) : le type de sortie est `SellState` ci-dessus, toute annotation manuelle divergerait.
export function useSellState(cart: ActiveCart) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [paidText, setPaidText] = useState("");
  const [paidError, setPaidError] = useState("");
  // Frais de livraison du panier actif (centimes, saisie miroir de paidText).
  const [deliveryText, setDeliveryText] = useState("");
  const [deliveryError, setDeliveryError] = useState("");
  // Idempotence (F-01) : un UUID par dialogue d'encaissement, figé à
  // l'ouverture et rejoué en cas de retry/double-clic.
  const [payOperationId, setPayOperationId] = useState<string>(() => newOperationId());
  /**
   * Gardes synchrones anti-double-clic (F-01) : le state `busy` React est
   * asynchrone — deux soumissions dans le même tick verraient toutes deux
   * `busy === false`. Ces refs tranchent de façon synchrone, avant tout await.
   */
  const finalizeGuard = useRef(false);
  const proformaGuard = useRef(false);
  const settleGuard = useRef(false);
  /**
   * M-1 IDEMPOTENCE PROFORMA : un UUID par contenu de panier, figé au premier
   * essai et rejoué en cas de retry — réinitialisé après succès (panier vidé).
   */
  const proformaOpRef = useRef<{ key: string; id: string } | null>(null);
  /** Échéance du crédit (vide = sans échéance), proposée si reste impayé. */
  const [dueDate, setDueDate] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [customForm, setCustomForm] = useState<CustomForm>({ name: "", price: "", qty: "1" });
  /**
   * ADR-114 : produit à unité continue (KG/G/L/ML/CL/M) en attente de la
   * quantité vendue — le dialogue s'ouvre à l'ajout (poids OU montant).
   */
  const [quantityFor, setQuantityFor] = useState<SearchRow | null>(null);
  const [preview, setPreview] = useState<{
    sale: LastSale;
    saleId: number | null;
    text80: string;
  } | null>(null);
  /** Aide raccourcis clavier caisse ([?]) : modale pure, aucun IPC. */
  const [helpOpen, setHelpOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerRow[]>([]);
  // Total serveur de la recherche client : si > résultats affichés (page de 8),
  // la caisse affiche « +N — affinez » au lieu de tronquer en silence.
  const [customerTotal, setCustomerTotal] = useState(0);
  const [customerBalance, setCustomerBalance] = useState<number | null>(null);
  /** Vente à crédit autorisée pour le client sélectionné (null = passage). */
  const [customerCredit, setCustomerCredit] = useState<boolean | null>(null);
  /** Plafond du client sélectionné (centimes, null = inconnu/sans client). */
  const [customerCreditLimit, setCustomerCreditLimit] = useState<number | null>(null);
  /** Dépassement de plafond validé par le vendeur (case à cocher encaissement). */
  const [limitOverride, setLimitOverride] = useState(false);
  const [creditUnknown, setCreditUnknown] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleMethod, setSettleMethod] = useState<"cash" | "cheque" | "transfer">("cash");
  const [settleBusy, setSettleBusy] = useState(false);
  // Idempotence du règlement (migration 0020) : régénéré à chaque ouverture.
  const [settleOperationId, setSettleOperationId] = useState<string>(() => newOperationId());
  const [proformaBusy, setProformaBusy] = useState(false);
  const [proformaDoc, setProformaDoc] = useState<ProformaDoc | null>(null);
  /** Annulation de la dernière vente (sales.cancel idempotent + confirm). */
  const [cancelBusy, setCancelBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimer = useDebouncedTimer();
  const customerTimer = useDebouncedTimer();
  const customerRef = useRef<HTMLInputElement>(null);
  /** A1-P0 : compteur anti-course recherche client (même garde que produits). */
  const customerSearchSeq = useRef(0);
  /** Douchette : horodatage de la dernière frappe + cadence machine (scan sans Entrée). */
  const lastKeyAtRef = useRef(0);
  const scanBurstRef = useRef(false);
  const customPriceRef = useRef<HTMLInputElement>(null);
  /** Compteur anti-course : seule la dernière recherche met à jour la liste. */
  const searchSeq = useRef(0);
  const [customerDrawer, setCustomerDrawer] = useState<{
    customer: EnrichedCustomer;
    sales: StatementSale[];
  } | null>(null);
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [customerEditing, setCustomerEditing] = useState<Customer | null>(null);
  const [drawerBusy, setDrawerBusy] = useState(false);

  // Totaux de l'onglet actif.
  let totals: SellTotals | null = null;
  let totalsErr = "";
  try {
    if (cart.lines.length > 0) {
      totals = totalsOf({
        lines: cart.lines,
        deliveryFeeMinor: cart.deliveryFeeMinor,
        amountPaidMinor: cart.amountPaidMinor,
      });
    }
  } catch (e) {
    totalsErr = frError(e, "Total du panier incalculable : vérifiez les lignes.");
  }
  const totalMinor = totals?.totalMinor ?? 0;

  // Montant saisi : rechargé depuis l'onglet à chaque changement d'onglet.
  const activeId = cart.activeId;
  useEffect(() => {
    const tab = cart.tabs.find((t) => t.id === activeId);
    const minor = tab?.amountPaidMinor ?? 0;
    setPaidText(minor > 0 ? minorToInputTotal(minor) : "");
    const fee = tab?.deliveryFeeMinor ?? 0;
    setDeliveryText(fee > 0 ? minorToInput(fee) : "");
    setPaidError("");
    setDeliveryError("");
    // Changer d'onglet referme aussi la recherche client (contexte différent)
    // + réinitialise l'échéance (RX-17 : pas de fuite inter-paniers).
    setCustomerQuery("");
    setCustomerResults([]);
    setCustomerTotal(0);
    setDueDate("");
  }, [activeId]);

  // P4 : brouillons persistés (SQLite, jamais de LocalStorage métier).
  useEffect(() => {
    let cancelled = false;
    api
      .cartsLoad()
      .then((r) => {
        if (cancelled) return;
        const tabs = ((r as { tabs?: unknown }).tabs ?? []) as CartTab[];
        if (Array.isArray(tabs) && tabs.length > 0) {
          cart.hydrate(tabs);
          const st = useCartsStore.getState();
          const active = st.tabs.find((t) => t.id === st.activeId);
          const minor = active?.amountPaidMinor ?? 0;
          setPaidText(minor > 0 ? minorToInputTotal(minor) : "");
          const fee = active?.deliveryFeeMinor ?? 0;
          setDeliveryText(fee > 0 ? minorToInput(fee) : "");
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let timer: number | null = null;
    const unsub = useCartsStore.subscribe((s) => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        api
          .cartsSave({
            operationId: newOperationId(),
            tabs: toCartDraftTabs(s.tabs),
          })
          .catch(() => undefined);
      }, 800);
    });
    return () => {
      unsub();
      if (timer != null) window.clearTimeout(timer);
    };
  }, []);

  // Synchroniser le montant saisi vers l'onglet actif, borné à [0, total].
  // A-24 : `cart.activeId` entre dans les dépendances — au changement
  // d'onglet, le montant saisi doit être ré-appliqué au NOUVEL onglet actif
  // (sinon la saisie part sur l'onglet précédent).
  useEffect(() => {
    const raw = paidText.trim();
    if (raw === "") {
      setPaidError("");
      cart.setTotals({ amountPaidMinor: 0 });
      return;
    }
    try {
      // Paiement d'un TOTAL : plafond MAX_MINOR_TOTAL, pas celui d'une valeur.
      const parsed = parseDzdInputTotal(raw, "Montant");
      setPaidError("");
      cart.setTotals({ amountPaidMinor: Math.min(parsed, totalMinor) });
    } catch (e) {
      // Saisie invalide : NE PAS transformer en 0 (créerait un crédit
      // involontaire). On conserve la dernière valeur valide et on bloque
      // l'encaissement tant que l'erreur est visible.
      setPaidError(frError(e, "Montant invalide."));
    }
  }, [paidText, totalMinor, cart.activeId]);

  // Frais de livraison saisis vers l'onglet actif, bornés à [0, 1e9] centimes.
  useEffect(() => {
    const raw = deliveryText.trim();
    if (raw === "") {
      setDeliveryError("");
      cart.setTotals({ deliveryFeeMinor: 0 });
      return;
    }
    try {
      const parsed = parseDzdInputStrict(raw, "Livraison");
      setDeliveryError("");
      cart.setTotals({ deliveryFeeMinor: Math.min(parsed, MAX_MINOR_SINGLE) });
    } catch (e) {
      setDeliveryError(frError(e, "Frais de livraison invalides."));
    }
  }, [deliveryText, cart.activeId]);

  const totalQty = cart.lines.reduce((a, l) => a + l.quantity, 0);

  return {
    query,
    setQuery,
    results,
    setResults,
    searching,
    setSearching,
    busy,
    setBusy,
    payOpen,
    setPayOpen,
    paidText,
    setPaidText,
    paidError,
    deliveryError,
    payOperationId,
    setPayOperationId,
    deliveryText,
    setDeliveryText,
    finalizeGuard,
    proformaGuard,
    settleGuard,
    proformaOpRef,
    dueDate,
    setDueDate,
    customOpen,
    setCustomOpen,
    customForm,
    setCustomForm,
    quantityFor,
    setQuantityFor,
    preview,
    setPreview,
    helpOpen,
    setHelpOpen,
    customerQuery,
    setCustomerQuery,
    customerResults,
    setCustomerResults,
    customerTotal,
    setCustomerTotal,
    customerBalance,
    setCustomerBalance,
    customerCredit,
    setCustomerCredit,
    customerCreditLimit,
    setCustomerCreditLimit,
    limitOverride,
    setLimitOverride,
    creditUnknown,
    setCreditUnknown,
    settleOpen,
    setSettleOpen,
    settleAmount,
    setSettleAmount,
    settleMethod,
    setSettleMethod,
    settleBusy,
    setSettleBusy,
    settleOperationId,
    setSettleOperationId,
    proformaBusy,
    setProformaBusy,
    proformaDoc,
    setProformaDoc,
    cancelBusy,
    setCancelBusy,
    searchRef,
    searchTimer,
    customerTimer,
    customerRef,
    customerSearchSeq,
    lastKeyAtRef,
    scanBurstRef,
    customPriceRef,
    searchSeq,
    customerDrawer,
    setCustomerDrawer,
    customerFormOpen,
    setCustomerFormOpen,
    customerEditing,
    setCustomerEditing,
    drawerBusy,
    setDrawerBusy,
    totals,
    totalsErr,
    totalMinor,
    totalQty,
  };
}
