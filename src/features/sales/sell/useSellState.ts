// Veloria PoS — Vente : états + gardes + effets de synchronisation (extrait de SellScreen).
// Hook pur d'état (aucun IPC direct sauf la persistance des brouillons, inchangée).
// Toute la logique (centimes, debounce, anti-course) est reprise à l'identique.
import { useEffect, useRef, useState } from "react";
import { isSoundEnabled } from "@shared/sound/sound.ts";
import { useCartsStore, type ActiveCart, type CartTab } from "../cart-store.ts";
import { useDebouncedTimer } from "@shared/ui/use-debounced-timer.ts";
import { minorToInput } from "@domain/money/money.ts";
import { strictOrNeg } from "@shared/money/parse.ts";
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

export function useSellState(cart: ActiveCart) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [paidText, setPaidText] = useState("");
  // Idempotence (F-01) : un UUID par dialogue d'encaissement, figé à
  // l'ouverture et rejoué en cas de retry/double-clic.
  const [payOperationId, setPayOperationId] = useState<string>(() => newOperationId());
  // P5 : interrupteur son local (miroir de la préférence SQLite).
  const [soundOn, setSoundOn] = useState<boolean>(() => isSoundEnabled());
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
  const [preview, setPreview] = useState<{ sale: LastSale; text80: string; htmlA4: string } | null>(
    null,
  );
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerRow[]>([]);
  const [customerBalance, setCustomerBalance] = useState<number | null>(null);
  /** Vente à crédit autorisée pour le client sélectionné (null = passage). */
  const [customerCredit, setCustomerCredit] = useState<boolean | null>(null);
  const [creditUnknown, setCreditUnknown] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleMethod, setSettleMethod] = useState<"cash" | "cheque" | "transfer">("cash");
  const [settleBusy, setSettleBusy] = useState(false);
  // Idempotence du règlement (migration 0020) : régénéré à chaque ouverture.
  const [settleOperationId, setSettleOperationId] = useState<string>(() => newOperationId());
  const [proformaBusy, setProformaBusy] = useState(false);
  const [proformaDoc, setProformaDoc] = useState<ProformaDoc | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimer = useDebouncedTimer();
  const customerTimer = useDebouncedTimer();
  const customerRef = useRef<HTMLInputElement>(null);
  /** A1-P0 : compteur anti-course recherche client (même garde que produits). */
  const customerSearchSeq = useRef(0);
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
        deliveryFeeMinor: 0,
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
    setPaidText(minor > 0 ? minorToInput(minor) : "");
    // Changer d'onglet referme aussi la recherche client (contexte différent)
    // + réinitialise l'échéance (RX-17 : pas de fuite inter-paniers).
    setCustomerQuery("");
    setCustomerResults([]);
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
          setPaidText(minor > 0 ? minorToInput(minor) : "");
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
  useEffect(() => {
    // P1-5 : strict (bornes H-1, jamais NaN) ; invalide → 0 (pas de saisie).
    const parsed = strictOrNeg(paidText.trim() === "" ? "0" : paidText, "Montant");
    const safe = Math.min(Math.max(parsed, 0), totalMinor);
    cart.setTotals({ amountPaidMinor: safe });
  }, [paidText, totalMinor]);

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
    payOperationId,
    setPayOperationId,
    soundOn,
    setSoundOn,
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
    preview,
    setPreview,
    customerQuery,
    setCustomerQuery,
    customerResults,
    setCustomerResults,
    customerBalance,
    setCustomerBalance,
    customerCredit,
    setCustomerCredit,
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
    searchRef,
    searchTimer,
    customerTimer,
    customerRef,
    customerSearchSeq,
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
