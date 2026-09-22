// Veloria PoS — Écran : Vente (caisse « Nova », clavier d'abord).
// Recherche + code-barres + article libre + client + paniers multiples
// + encaissement + aperçu + impression (80mm/A4).
import { useEffect, useRef, useState } from "react";
import { HandCoins, Printer, Search, User, Volume2, VolumeX, X } from "lucide-react";
import { isSoundEnabled, persistSoundEnabled, playSound } from "@shared/sound/sound.ts";
import { useCart, useCartsStore, type CartTab } from "./cart-store.ts";
import { CartPanel } from "./sell/CartPanel.tsx";
import { CustomItemDialog } from "./sell/CustomItemDialog.tsx";
import { PayDialog } from "./sell/PayDialog.tsx";
import { SettleDialog } from "./sell/SettleDialog.tsx";
import { useSellShortcuts, type SellKeyActions } from "./sell/useSellShortcuts.ts";
import { proformaOperationKey } from "./proforma-op.ts";
import { api } from "@shared/types/ipc-client.ts";
import { callChecked, paymentAckSchema, saleResultSchema } from "@shared/types/ipc-contracts.ts";
import { useAppSettings, type SalesSettings } from "@shared/settings/use-app-settings.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { formatDzd, parseDzdInputStrict } from "@domain/money/money.ts";
import { strictOrNeg } from "@shared/money/parse.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { computeLineTotal } from "@domain/sales/sale-rules.ts";
import { roundQuantity } from "@domain/common/quantity.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { formatCustomerCode } from "@shared/formatters/format.ts";
import { useCompany } from "@shared/company/use-company.ts";
import { ClientDetailsDrawer, ClientFormDialog } from "../customers/ClientDialogs.tsx";
import {
  enrichCustomer,
  type Customer,
  type CustomerStatement,
  type EnrichedCustomer,
  type StatementSale,
} from "../customers/types.ts";
import { buildSalePayload, totalsOf } from "@/application/sales/create-sale.ts";
import type { PrintMode } from "@/app/shell/App.tsx";
import {
  Badge,
  Button,
  Card,
  Field,
  Modal,
  SectionTitle,
  TextInput,
} from "@shared/ui/primitives.tsx";

interface SearchRow {
  id: number;
  name: string;
  selling_price_minor: number;
  purchase_price_minor: number;
  quantity: number;
  unit_code: string;
  primary_barcode: string | null;
}

interface CustomerRow {
  id: number;
  first_name: string;
  last_name: string;
  outstanding_balance_minor: number;
  credit_allowed: number;
}

interface PreviewLine {
  name: string;
  qty: number;
  unit: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
  ref: string;
}

interface LastSale {
  invoice: string;
  date: string;
  lines: PreviewLine[];
  subtotalMinor: number;
  discountMinor: number;
  deliveryMinor: number;
  totalMinor: number;
  paidMinor: number;
  customerLabel: string;
  /** Nom imprimé sur le ticket, figé au moment de la vente. */
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCode: string;
  paymentMethod: "cash" | "cheque" | "transfer" | null;
  balances?: { prev: number; current: number } | undefined;
}
import type { Notify } from "@shared/ui/primitives.tsx";

// Libellés des moyens de paiement : source unique partagée (format.ts).

export function SellScreen({
  notify,
  printMode,
}: {
  notify: Notify;
  printMode: PrintMode;
}): React.JSX.Element {
  const cart = useCart();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [paidText, setPaidText] = useState("");
  // Idempotence (F-01) : un UUID par dialogue d'encaissement, figé à
  // l'ouverture et rejoué en cas de retry/double-clic — le main retrouve la
  // vente existante au lieu de la dupliquer. Régénéré après chaque succès.
  const [payOperationId, setPayOperationId] = useState<string>(() => newOperationId());
  // P5 : interrupteur son local (miroir de la préférence SQLite, voir Réglages → Sons).
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
   * M-1 IDEMPOTENCE PROFORMA (même principe que F-01 vente) : un UUID par
   * contenu de panier, figé au premier essai et rejoué en cas de retry après
   * échec/timeout — le main retrouve le devis existant (idempotency_keys)
   * au lieu de dupliquer. Réinitialisé après succès (panier vidé).
   */
  const proformaOpRef = useRef<{ key: string; id: string } | null>(null);
  /** Échéance du crédit (vide = sans échéance), proposée si reste impayé. */
  const [dueDate, setDueDate] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [customForm, setCustomForm] = useState({ name: "", price: "" });
  // Fiche entreprise : source unique partagée (imprimés caisse + devis).
  const { company } = useCompany();
  // Confirmation non bloquante (modale applicative).
  const confirmAsync = useConfirm();
  const [preview, setPreview] = useState<{ sale: LastSale; text80: string; htmlA4: string } | null>(
    null,
  );
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerRow[]>([]);
  const [customerBalance, setCustomerBalance] = useState<number | null>(null);
  /** Vente à crédit autorisée pour le client sélectionné (null = passage). */
  const [customerCredit, setCustomerCredit] = useState<boolean | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleMethod, setSettleMethod] = useState<"cash" | "cheque" | "transfer">("cash");
  const [settleBusy, setSettleBusy] = useState(false);
  // Idempotence du règlement (migration 0020) : régénéré à chaque ouverture.
  const [settleOperationId, setSettleOperationId] = useState<string>(() => newOperationId());
  const [proformaBusy, setProformaBusy] = useState(false);
  const [proformaDoc, setProformaDoc] = useState<{
    number: string;
    date: string;
    text80: string;
    htmlA4: string;
    payload: Record<string, unknown>;
  } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<number | null>(null);
  const customerTimer = useRef<number | null>(null);
  const customerRef = useRef<HTMLInputElement>(null);
  const customPriceRef = useRef<HTMLInputElement>(null);
  const { value: salesSettings } = useAppSettings<SalesSettings>("sales");
  const defaultMethod = salesSettings?.defaultPaymentMethod ?? "cash";
  /** Compteur anti-course : seule la dernière recherche met à jour la liste. */
  const searchSeq = useRef(0);
  /** Actions clavier : ref vers les dernières closures (écouteur monté une fois). */
  const keyActions = useRef<SellKeyActions | null>(null);
  // P4 : raccourcis montés une fois (sell/useSellShortcuts).
  useSellShortcuts(keyActions, searchRef);

  // Focus initial au montage uniquement.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Nettoyage des minuteurs (recherche debounce) au démontage.
  useEffect(() => {
    return () => {
      if (searchTimer.current != null) window.clearTimeout(searchTimer.current);
      if (customerTimer.current != null) window.clearTimeout(customerTimer.current);
    };
  }, []);

  // Solde + autorisation crédit du client sélectionné (lecture seule, avant encaissement).
  async function fetchCustomerCredit(id: number): Promise<{
    balance: number | null;
    allowed: boolean | null;
  }> {
    try {
      const st = (await api.customerStatement({ id })) as {
        customer: { outstanding_balance_minor: number; credit_allowed: number };
      };
      return {
        balance: st.customer.outstanding_balance_minor,
        allowed: st.customer.credit_allowed === 1,
      };
    } catch {
      return { balance: null, allowed: null };
    }
  }

  async function fetchBalance(id: number): Promise<number | null> {
    return (await fetchCustomerCredit(id)).balance;
  }

  useEffect(() => {
    if (cart.customerId == null) {
      setCustomerBalance(null);
      setCustomerCredit(null);
      return;
    }
    let cancelled = false;
    void fetchCustomerCredit(cart.customerId).then(({ balance, allowed }) => {
      if (cancelled) return;
      setCustomerBalance(balance);
      setCustomerCredit(allowed);
    });
    return () => {
      cancelled = true;
    };
  }, [cart.customerId]);

  function openSettle(): void {
    if (cart.customerId == null || customerBalance == null || customerBalance <= 0) {
      notify("Aucune dette à régler pour ce client.", "err");
      return;
    }
    setSettleAmount((customerBalance / 100).toString().replace(".", ","));
    setSettleMethod("cash");
    setSettleOperationId(newOperationId());
    setSettleOpen(true);
  }

  async function settleDebt(): Promise<void> {
    if (cart.customerId == null || settleBusy || settleGuard.current) return;
    // P1-5 : strict (bornes H-1, jamais NaN) — erreur FR mappée.
    let amountMinor = 0;
    try {
      amountMinor = parseDzdInputStrict(settleAmount.trim() === "" ? "0" : settleAmount, "Montant");
    } catch (e) {
      notify(frError(e, "Montant invalide."), "err");
      return;
    }
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      notify("Montant invalide.", "err");
      return;
    }
    if (customerBalance != null && amountMinor > customerBalance) {
      notify("Le montant dépasse la dette du client.", "err");
      return;
    }
    settleGuard.current = true;
    setSettleBusy(true);
    try {
      // P2 : accusé validé (jamais de cast).
      await callChecked(
        (a) =>
          a.customers.recordPayment({
            operationId: settleOperationId,
            customerId: cart.customerId,
            saleId: null,
            amountMinor,
            method: settleMethod,
          }),
        paymentAckSchema,
      );
      notify(`Paiement de ${formatDzd(amountMinor)} enregistré.`, "ok");
      // P5 : encaissement = caisse.
      playSound("cash");
      setSettleOpen(false);
      setSettleOperationId(newOperationId());
      setCustomerBalance(await fetchBalance(cart.customerId));
    } catch (e) {
      notify(frError(e, "Règlement impossible."), "err");
    } finally {
      settleGuard.current = false;
      setSettleBusy(false);
    }
  }

  // Totaux de l'onglet actif (calculés avant les effets qui les consomment).
  let totals: {
    subtotalMinor: number;
    discountAmountMinor: number;
    totalMinor: number;
    remainingMinor: number;
    paymentStatus: string;
  } | null = null;
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
    totalsErr = frError(e, "");
  }

  // Montant saisi : rechargé depuis l'onglet à chaque changement d'onglet.
  // (Uniquement sur activeId : recharger sur chaque frappe casserait la
  // saisie décimale FR pendant que l'opérateur tape.)
  const activeId = cart.activeId;
  useEffect(() => {
    const tab = cart.tabs.find((t) => t.id === activeId);
    const minor = tab?.amountPaidMinor ?? 0;
    setPaidText(minor > 0 ? (minor / 100).toString().replace(".", ",") : "");
    // Changer d'onglet referme aussi la recherche client (contexte différent)
    // + réinitialise l'échéance (RX-17 : pas de fuite inter-paniers).
    setCustomerQuery("");
    setCustomerResults([]);
    setDueDate("");
  }, [activeId]);

  // P4 : brouillons persistés (SQLite, jamais de LocalStorage métier).
  // Restaure une fois au montage ; sauvegarde en différé 800 ms (pas à
  // chaque frappe : le store change à chaque caractère saisi).
  useEffect(() => {
    let cancelled = false;
    api
      .cartsLoad()
      .then((r) => {
        if (cancelled) return;
        const tabs = ((r as { tabs?: unknown }).tabs ?? []) as CartTab[];
        if (Array.isArray(tabs) && tabs.length > 0) cart.hydrate(tabs);
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
            tabs: s.tabs.map((t) => ({
              tabId: t.id,
              name: t.name,
              lines: t.lines.map((l) => ({
                key: l.key,
                productId: l.productId,
                productName: l.productName,
                unitCode: l.unitCode,
                originalUnitPriceMinor: l.originalUnitPriceMinor,
                unitPriceMinor: l.unitPriceMinor,
                purchasePriceMinor: l.purchasePriceMinor,
                quantity: l.quantity,
              })),
              customerId: t.customerId,
              customerLabel: t.customerLabel,
              amountPaidMinor: t.amountPaidMinor,
              paymentMethod: t.paymentMethod,
            })),
          })
          .catch(() => undefined);
      }, 800);
    });
    return () => {
      unsub();
      if (timer != null) window.clearTimeout(timer);
    };
  }, []);

  // Synchroniser le montant saisi vers l'onglet actif, borné à [0, total] :
  // le domaine rejette tout montant hors de cet intervalle, et un reçu
  // supérieur au total correspond à de la monnaie à rendre (affichée dans
  // la fenêtre d'encaissement, jamais stockée ni facturée).
  const totalMinor = totals?.totalMinor ?? 0;
  useEffect(() => {
    // P1-5 : strict (bornes H-1, jamais NaN) ; invalide → 0 (pas de saisie).
    const parsed = strictOrNeg(paidText.trim() === "" ? "0" : paidText, "Montant");
    const safe = Math.min(Math.max(parsed, 0), totalMinor);
    cart.setTotals({ amountPaidMinor: safe });
  }, [paidText, totalMinor]);

  function onQueryChange(q: string): void {
    setQuery(q);
    if (searchTimer.current != null) window.clearTimeout(searchTimer.current);
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = window.setTimeout(() => {
      void runSearch(trimmed);
    }, 220);
  }

  async function runSearch(trimmed: string): Promise<void> {
    const seq = (searchSeq.current += 1);
    try {
      // Code-barres exact d'abord (chemin indexé), puis recherche texte.
      if (/^[0-9A-Za-z\-_.]{4,}$/.test(trimmed)) {
        const hit = (await api.productByBarcode({ barcode: trimmed })) as {
          product: SearchRow | null;
        };
        if (seq !== searchSeq.current) return;
        if (hit.product) {
          addProduct(hit.product);
          setQuery("");
          setResults([]);
          setSearching(false);
          return;
        }
      }
      const res = (await api.productSearch({ query: trimmed, page: 1, pageSize: 12 })) as {
        rows: SearchRow[];
      };
      // Réponse périmée (une recherche plus récente est partie) : ignorée.
      if (seq !== searchSeq.current) return;
      setResults(res.rows);
    } catch (err) {
      if (seq !== searchSeq.current) return;
      notify(frError(err, "Recherche impossible."), "err");
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }

  function addProduct(p: SearchRow): void {
    cart.addLine({
      key: `${p.id}-${Date.now()}`,
      productId: p.id,
      productName: p.name,
      unitCode: p.unit_code,
      originalUnitPriceMinor: p.selling_price_minor,
      unitPriceMinor: p.selling_price_minor,
      purchasePriceMinor: p.purchase_price_minor,
      quantity: 1,
    });
    // P5 : bip d'ajout (discret, coupable en un clic en tête).
    playSound("blip");
    // Seul l'ajout depuis la recherche refocalise le champ de recherche.
    searchRef.current?.focus();
  }

  function addCustomProduct(): void {
    const name = customForm.name.trim();
    if (name.length === 0) {
      notify("Nom du produit requis.", "err");
      return;
    }
    if (customForm.price.trim() === "") {
      notify("Prix unitaire requis.", "err");
      customPriceRef.current?.focus();
      return;
    }
    // P1-5 : strict (bornes H-1, jamais NaN) — erreur FR mappée + focus.
    let unitPriceMinor = 0;
    try {
      unitPriceMinor = parseDzdInputStrict(customForm.price, "Prix unitaire");
    } catch (e) {
      notify(frError(e, "Prix unitaire invalide (montant > 0)."), "err");
      customPriceRef.current?.focus();
      return;
    }
    if (!Number.isInteger(unitPriceMinor) || unitPriceMinor <= 0) {
      notify("Prix unitaire invalide (montant > 0).", "err");
      customPriceRef.current?.focus();
      return;
    }
    // Article libre hors catalogue : pas de stock décrémenté (productId null).
    cart.addLine({
      key: `libre-${Date.now()}`,
      productId: null,
      productName: name,
      unitCode: "PIECE",
      originalUnitPriceMinor: unitPriceMinor,
      unitPriceMinor,
      purchasePriceMinor: 0,
      quantity: 1,
    });
    setCustomOpen(false);
    setCustomForm({ name: "", price: "" });
    playSound("blip");
  }

  function searchCustomers(q: string): void {
    setCustomerQuery(q);
    if (customerTimer.current != null) window.clearTimeout(customerTimer.current);
    if (q.trim().length < 2) {
      setCustomerResults([]);
      return;
    }
    customerTimer.current = window.setTimeout(() => {
      void runCustomerSearch(q.trim());
    }, 200);
  }

  async function runCustomerSearch(trimmed: string): Promise<void> {
    try {
      const res = (await api.customerSearch({ query: trimmed, page: 1, pageSize: 8 })) as {
        rows: CustomerRow[];
      };
      setCustomerResults(res.rows);
    } catch {
      setCustomerResults([]);
    }
  }

  function selectCustomer(c: CustomerRow | null): void {
    if (c == null) {
      cart.setCustomer(null, "Client de passage");
      setCustomerCredit(null);
    } else {
      cart.setCustomer(c.id, `${c.first_name} ${c.last_name}`.trim());
      // Valeur immédiate (relevée par le relevé juste après, anti-course inclus).
      setCustomerCredit(c.credit_allowed === 1);
    }
    setCustomerQuery("");
    setCustomerResults([]);
  }

  // Détail client direct depuis la caisse (requête 1) : fiche + factures +
  // aperçu/impression, sans quitter la vente (panier conservé).
  const [customerDrawer, setCustomerDrawer] = useState<{
    customer: EnrichedCustomer;
    sales: StatementSale[];
  } | null>(null);
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [customerEditing, setCustomerEditing] = useState<Customer | null>(null);
  const [drawerBusy, setDrawerBusy] = useState(false);

  async function openCustomerDetails(): Promise<void> {
    if (cart.customerId == null || drawerBusy) return;
    setDrawerBusy(true);
    try {
      const st = (await api.customerStatement({ id: cart.customerId })) as CustomerStatement;
      setCustomerDrawer({ customer: enrichCustomer(st.customer, st), sales: st.sales });
    } catch (e) {
      notify(frError(e, "Fiche client indisponible."), "err");
    } finally {
      setDrawerBusy(false);
    }
  }

  async function refreshCustomerDrawer(): Promise<void> {
    if (cart.customerId == null) return;
    try {
      const st = (await api.customerStatement({ id: cart.customerId })) as CustomerStatement;
      setCustomerDrawer({ customer: enrichCustomer(st.customer, st), sales: st.sales });
      const credit = await fetchCustomerCredit(cart.customerId);
      setCustomerBalance(credit.balance);
      setCustomerCredit(credit.allowed);
    } catch {
      /* tiroir déjà affiché : on garde les données visibles */
    }
  }

  function printPayload(
    sale: LastSale,
    balances?: { prev: number; current: number },
  ): Record<string, unknown> {
    return {
      company: company.name,
      companyPhone: company.phone,
      companyAddress: company.address,
      companyCity: company.city,
      companyEmail: company.email,
      companyRc: company.rc,
      companyNif: company.nif,
      customerName: sale.customerName,
      customerPhone: sale.customerPhone,
      customerAddress: sale.customerAddress,
      customerCode: sale.customerCode,
      paymentMethod: sale.paymentMethod,
      invoice: sale.invoice,
      date: sale.date,
      lines: sale.lines,
      subtotalMinor: sale.subtotalMinor,
      discountMinor: sale.discountMinor,
      deliveryMinor: sale.deliveryMinor,
      totalMinor: sale.totalMinor,
      paidMinor: sale.paidMinor,
      prevBalanceMinor: balances?.prev,
      currentBalanceMinor: balances?.current,
    };
  }

  function openPay(): void {
    if (cart.lines.length === 0 || totals == null) {
      notify("Panier vide : ajoutez au moins un article.", "err");
      return;
    }
    setPaidText((totals.totalMinor / 100).toString().replace(".", ","));
    setDueDate("");
    setPayOperationId(newOperationId());
    setPayOpen(true);
  }

  function bumpLastQty(delta: 1 | -1): void {
    const last = cart.lines[cart.lines.length - 1];
    if (!last) return;
    cart.setQty(last.key, roundQuantity(last.quantity + delta));
  }

  async function createProforma(): Promise<void> {
    if (cart.lines.length === 0 || !totals || proformaBusy || proformaGuard.current) return;
    proformaGuard.current = true;
    setProformaBusy(true);
    // M-1: clé stable du contenu — même panier réessayé = même operationId.
    const proformaKey = proformaOperationKey(cart.customerId, cart.lines);
    if (proformaOpRef.current?.key !== proformaKey) {
      proformaOpRef.current = { key: proformaKey, id: newOperationId() };
    }
    const proformaOperationId = (proformaOpRef.current as { key: string; id: string }).id;
    try {
      const res = (await api.proformaCreate({
        operationId: proformaOperationId,
        customerId: cart.customerId,
        lines: cart.lines.map((l) => ({
          productId: l.productId,
          productName: l.productName,
          unitPriceMinor: l.unitPriceMinor,
          quantity: l.quantity,
        })),
        discountMinor: 0,
        deliveryMinor: 0,
        notes: null,
      })) as { number: string };
      const payload: Record<string, unknown> = {
        company: company.name,
        companyPhone: company.phone,
        companyAddress: company.address,
        companyCity: company.city,
        companyEmail: company.email,
        customerName: cart.customerId != null ? cart.customerLabel : "",
        customerPhone: "",
        customerAddress: "",
        customerCode: "",
        invoice: res.number,
        date: new Date().toLocaleString("fr-FR"),
        lines: cart.lines.map((l) => ({
          name: l.productName,
          qty: l.quantity,
          unit: l.unitCode,
          unitPriceMinor: l.unitPriceMinor,
          lineTotalMinor: computeLineTotal(l.unitPriceMinor, l.quantity),
          ref: l.productId != null ? String(l.productId).padStart(5, "0") : "—",
        })),
        subtotalMinor: totals.subtotalMinor,
        discountMinor: totals.discountAmountMinor,
        deliveryMinor: 0,
        totalMinor: totals.totalMinor,
        paidMinor: 0,
      };
      if (cart.customerId != null) {
        try {
          const st = (await api.customerStatement({ id: cart.customerId })) as {
            customer: { phone: string | null; address: string | null };
          };
          payload["customerPhone"] = st.customer.phone ?? "";
          payload["customerAddress"] = st.customer.address ?? "";
          payload["customerCode"] = formatCustomerCode(cart.customerId);
        } catch {
          /* devis sans coordonnées plutôt que pas de devis */
        }
      }
      try {
        const pv = (await api.proformaPreview(payload)) as {
          text80: string;
          htmlA4: string;
        };
        setProformaDoc({
          number: res.number,
          date: payload["date"] as string,
          text80: pv.text80,
          htmlA4: pv.htmlA4,
          payload,
        });
      } catch {
        notify(`Proforma ${res.number} créée (aperçu indisponible).`, "ok");
      }
      // P5 : devis créé = succès.
      playSound("success");
      clearSaleForm();
      // Succès : le panier est vidé, l'opération est terminée.
      proformaOpRef.current = null;
    } catch (e) {
      // Échec : on garde proformaOpRef (même panier → même operationId au retry).
      notify(frError(e, "Proforma impossible."), "err");
    } finally {
      proformaGuard.current = false;
      setProformaBusy(false);
    }
  }

  async function printProforma(): Promise<void> {
    if (!proformaDoc) return;
    try {
      await api.proformaPrintA4(proformaDoc.payload);
      notify(`Devis ${proformaDoc.number} envoyé (A4).`, "ok");
    } catch (e) {
      notify(frError(e, "Impression du devis impossible."), "err");
    }
  }

  function openNewTab(): void {
    // Paniers multiples : le panier en cours est conservé, un nouvel
    // onglet vide devient l'onglet actif (moyen par défaut des réglages).
    cart.newTab();
    cart.setTotals({ paymentMethod: defaultMethod });
    setCustomerQuery("");
    setCustomerResults([]);
    notify("Nouveau panier.", "ok");
  }

  /** Vide l'onglet actif (avec confirmation s'il contient des articles). */
  function clearActiveCart(): void {
    if (cart.lines.length > 0) {
      void (async () => {
        if (!(await confirmAsync(`Vider « ${cart.name} » ? Les articles seront perdus.`))) return;
        clearSaleForm();
        playSound("clear");
        notify("Panier vidé.", "ok");
      })();
      return;
    }
    clearSaleForm();
    playSound("clear");
    notify("Panier vidé.", "ok");
  }

  keyActions.current = {
    openCustom: () => setCustomOpen(true),
    openPay,
    createProforma,
    newTab: openNewTab,
    clearCart: clearActiveCart,
    closeTab: () => closeTab(cart.activeId),
    focusClient: () => customerRef.current?.focus(),
    bump: bumpLastQty,
  };

  function closeTab(id: number): void {
    const tab = cart.tabs.find((t) => t.id === id);
    if (tab && tab.lines.length > 0) {
      void (async () => {
        if (!(await confirmAsync(`Fermer « ${tab.name} » ? Les articles seront perdus.`))) return;
        cart.closeTab(id);
        playSound("click");
      })();
      return;
    }
    cart.closeTab(id);
    playSound("click");
  }

  async function finalize(): Promise<void> {
    if (cart.lines.length === 0 || !totals || busy || finalizeGuard.current) return;
    // RX-17: échéance calendaire réelle (le main retranche via businessDate,
    // mais l'UX refuse tôt en FR au lieu de tenter un commit voué à l'échec).
    if (totals.remainingMinor > 0 && dueDate !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      notify("Échéance invalide : format AAAA-MM-JJ.", "err");
      return;
    }
    finalizeGuard.current = true;
    setPayOpen(false);
    setBusy(true);
    try {
      const snapshot = {
        lines: cart.lines.map((l) => ({
          name: l.productName,
          qty: l.quantity,
          unit: l.unitCode,
          unitPriceMinor: l.unitPriceMinor,
          lineTotalMinor: computeLineTotal(l.unitPriceMinor, l.quantity),
          ref: l.productId != null ? String(l.productId).padStart(5, "0") : "—",
        })),
        subtotalMinor: totals.subtotalMinor,
        discountMinor: totals.discountAmountMinor,
        deliveryMinor: 0,
        totalMinor: totals.totalMinor,
        paidMinor: cart.amountPaidMinor,
        customerLabel: cart.customerLabel,
        customerName: cart.customerId != null ? cart.customerLabel : "",
        customerPhone: "",
        customerAddress: "",
        customerCode: "",
        paymentMethod: cart.paymentMethod ?? defaultMethod,
      };
      // Solde précédent lu AVANT commit (puis courant = précédent + reste).
      // RX-01: autorisation crédit RELUE ici (pas l'état optimiste) — le main
      // retranche de toute façon (trigger 0007), mais l'UX refuse tôt en FR.
      let prevBalance: number | null = null;
      let freshCredit: boolean | null = null;
      if (cart.customerId != null) {
        try {
          const st = (await api.customerStatement({ id: cart.customerId })) as {
            customer: {
              outstanding_balance_minor: number;
              phone: string | null;
              address: string | null;
              credit_allowed: number;
            };
          };
          prevBalance = st.customer.outstanding_balance_minor;
          snapshot.customerPhone = st.customer.phone ?? "";
          snapshot.customerAddress = st.customer.address ?? "";
          snapshot.customerCode = formatCustomerCode(cart.customerId);
          freshCredit = st.customer.credit_allowed === 1;
          setCustomerCredit(freshCredit);
          setCustomerBalance(prevBalance);
        } catch {
          /* aperçu sans soldes plutôt que pas de vente */
        }
      }
      // P2 : résultat validé (jamais de cast) — dérive main/renderer = erreur FR.
      const res = await callChecked(
        (a) =>
          a.sales.create(
            buildSalePayload({
              operationId: payOperationId,
              lines: cart.lines,
              deliveryFeeMinor: 0,
              amountPaidMinor: cart.amountPaidMinor,
              customerId: cart.customerId,
              customerCreditAllowed: freshCredit ?? customerCredit ?? false,
              dueDate: totals.remainingMinor > 0 && dueDate !== "" ? dueDate : null,
              paymentMethod: cart.paymentMethod ?? defaultMethod,
            }),
          ),
        saleResultSchema,
      );
      notify(`Vente ${res.invoiceNumber} enregistrée.`, "ok");
      // P5 : arpège de succès (vente = événement signature de la caisse).
      playSound("success");
      const sale: LastSale = {
        ...snapshot,
        invoice: res.invoiceNumber,
        date: new Date().toLocaleString("fr-FR"),
      };
      sale.balances =
        prevBalance != null
          ? { prev: prevBalance, current: prevBalance + totals.remainingMinor }
          : undefined;
      try {
        const pv = (await api.printPreview(printPayload(sale, sale.balances))) as {
          text80: string;
          htmlA4: string;
        };
        setPreview({ sale, text80: pv.text80, htmlA4: pv.htmlA4 });
        if (salesSettings?.autoPrintInvoice === true) {
          try {
            if (printMode === "A4") await api.printA4(printPayload(sale, sale.balances));
            else await api.printReceipt(printPayload(sale, sale.balances));
            notify("Impression auto envoyée.", "ok");
          } catch {
            notify("Impression auto impossible.", "err");
          }
        }
      } catch {
        notify("Aperçu indisponible.", "err");
      }
      clearSaleForm();
      setResults([]);
    } catch (e) {
      notify(frError(e, "Échec de la vente."), "err");
    } finally {
      finalizeGuard.current = false;
      setBusy(false);
    }
  }

  async function print(): Promise<void> {
    if (!preview) return;
    try {
      if (printMode === "A4") await api.printA4(printPayload(preview.sale, preview.sale.balances));
      else await api.printReceipt(printPayload(preview.sale, preview.sale.balances));
      playSound("print");
      notify(printMode === "A4" ? "Facture A4 envoyée." : "Ticket envoyé.", "ok");
    } catch (e) {
      notify(frError(e, "Impression impossible."), "err");
    }
  }

  function clearSaleForm(): void {
    cart.clear();
    cart.setTotals({ paymentMethod: defaultMethod });
    setPaidText("");
    setDueDate("");
    setCustomerQuery("");
    setCustomerResults([]);
    setCustomerCredit(null);
  }

  const totalQty = cart.lines.reduce((a, l) => a + l.quantity, 0);

  function tabTotal(t: CartTab): number | null {
    if (t.lines.length === 0) return null;
    try {
      return totalsOf({
        lines: t.lines,
        deliveryFeeMinor: 0,
        amountPaidMinor: 0,
      }).totalMinor;
    } catch {
      return null;
    }
  }

  // Monnaie à rendre (reçu > total) : calculée sur la saisie brute,
  // jamais stockée ni facturée (le montant enregistré est borné au total).
  const rawPaidMinor = strictOrNeg(paidText.trim() === "" ? "0" : paidText, "Montant");
  const changeMinor =
    payOpen && totals && Number.isFinite(rawPaidMinor) && rawPaidMinor > totals.totalMinor
      ? rawPaidMinor - totals.totalMinor
      : 0;

  // Vente à crédit réservée aux clients autorisés : le reste impayé exige
  // un client choisi avec `credit_allowed = 1` (règle appliquée aussi côté main).
  const creditBlocked =
    payOpen &&
    totals != null &&
    totals.remainingMinor > 0 &&
    !(cart.customerId != null && customerCredit === true);
  const creditBlockedMsg =
    cart.customerId == null
      ? "Vente à crédit : choisissez un client autorisé au crédit."
      : "Vente à crédit refusée : ce client n'est pas autorisé au crédit.";

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Barre de recherche + client */}
      <div className="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
        <Card className="p-4">
          <Field label="Recherche produit [F3]">
            <div className="relative">
              <Search
                size={17}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <TextInput
                ref={searchRef}
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && results.length > 0) {
                    const first = results[0];
                    if (first) {
                      addProduct(first);
                      setQuery("");
                      setResults([]);
                    }
                  }
                }}
                placeholder="Nom, code-barres… (Entrée = premier résultat)"
                aria-label="Recherche produit"
                className="pl-10"
              />
            </div>
          </Field>
          {searching ? (
            <p className="mt-2 text-xs text-slate-500" role="status">
              Recherche…
            </p>
          ) : null}
          {results.length > 0 ? (
            <ul className="mt-2 max-h-56 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      addProduct(r);
                      setQuery("");
                      setResults([]);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-amber-400/10"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{r.name}</span>
                      <span className="block text-xs text-slate-500">
                        Stock : {r.quantity} · {r.unit_code}
                        {r.primary_barcode ? ` · ${r.primary_barcode}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-bold tabular-nums text-amber-300">
                      {formatDzd(r.selling_price_minor)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => setCustomOpen(true)}
              title="Article libre [F1]"
            >
              + Article libre [F1]
            </Button>
            <Button
              variant="ghost"
              onClick={() => void createProforma()}
              disabled={proformaBusy || cart.lines.length === 0}
              title="Créer un devis avec aperçu [F4]"
            >
              {proformaBusy ? "Devis…" : "Proforma [F4]"}
            </Button>
          </div>
        </Card>

        <Card className="p-4">
          <Field label="Client">
            <div className="relative">
              <User
                size={17}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <TextInput
                value={customerQuery}
                onChange={(e) => searchCustomers(e.target.value)}
                placeholder="Rechercher un client… (min. 2 lettres)"
                aria-label="Rechercher un client"
                title="Rechercher un client [F5]"
                ref={customerRef}
                className="pl-10"
              />
            </div>
          </Field>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {cart.customerId == null ? (
              <Badge tone="grey">{cart.customerLabel}</Badge>
            ) : (
              <button
                type="button"
                onClick={() => void openCustomerDetails()}
                title="Ouvrir la fiche client (factures, aperçu, impression)"
                aria-label={`Ouvrir la fiche de ${cart.customerLabel}`}
                className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-400/20"
              >
                {cart.customerLabel} · Fiche
              </button>
            )}
            {cart.customerId != null ? (
              <Badge tone={customerCredit === true ? "green" : "grey"}>
                {customerCredit === true ? "Crédit autorisé" : "Comptant uniquement"}
              </Badge>
            ) : null}
            {customerBalance != null ? (
              <span className="text-xs tabular-nums text-slate-400">
                Solde : {formatDzd(customerBalance)}
              </span>
            ) : null}
            {cart.customerId != null && (customerBalance ?? 0) > 0 ? (
              <button
                type="button"
                onClick={openSettle}
                title="Régler la dette du client"
                className="inline-flex items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-400/20"
              >
                <HandCoins size={13} aria-hidden="true" /> Régler
              </button>
            ) : null}
            {cart.customerId != null ? (
              <button
                type="button"
                onClick={() => selectCustomer(null)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white"
              >
                <X size={13} aria-hidden="true" /> Passage
              </button>
            ) : null}
          </div>
          {customerResults.length > 0 ? (
            <ul className="mt-2 max-h-32 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10">
              {customerResults.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => selectCustomer(c)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-amber-400/10"
                  >
                    <span className="truncate font-semibold">
                      {c.first_name} {c.last_name}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge tone={c.credit_allowed === 1 ? "green" : "grey"}>
                        {c.credit_allowed === 1 ? "Crédit" : "Comptant"}
                      </Badge>
                      <span className="text-xs tabular-nums text-slate-400">
                        {formatDzd(c.outstanding_balance_minor)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>

      {/* Onglets paniers : chaque panier garde ses articles et son client.
          F6 ouvre un nouvel onglet sans toucher aux autres, F8 ferme l'actif. */}
      <div
        className="flex items-center gap-2 overflow-x-auto pb-1"
        role="tablist"
        aria-label="Paniers en cours"
      >
        {cart.tabs.map((t) => {
          const selected = t.id === cart.activeId;
          const total = tabTotal(t);
          return (
            <div
              key={t.id}
              role="tab"
              aria-selected={selected}
              aria-label={`${t.name} · ${t.lines.length} article(s)`}
              className={
                selected
                  ? "flex shrink-0 items-center gap-2 rounded-xl border border-amber-400/50 bg-amber-400/10 py-1.5 pl-3 pr-1.5"
                  : "flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-1.5 pl-3 pr-1.5"
              }
            >
              <button
                type="button"
                onClick={() => cart.switchTab(t.id)}
                title={`Ouvrir ${t.name}`}
                className="flex items-center gap-2 text-sm"
              >
                <span
                  className={
                    selected ? "font-extrabold text-amber-200" : "font-semibold text-slate-300"
                  }
                >
                  {t.name}
                </span>
                <Badge tone={selected ? "amber" : "grey"}>{t.lines.length}</Badge>
                {total != null ? (
                  <span className="text-xs font-bold tabular-nums text-slate-300">
                    {formatDzd(total)}
                  </span>
                ) : null}
              </button>
              {cart.tabs.length > 1 ? (
                <button
                  type="button"
                  onClick={() => closeTab(t.id)}
                  aria-label={`Fermer ${t.name}`}
                  title={`Fermer ${t.name} [F8 = onglet actif]`}
                  className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-red-500/15 hover:text-red-300"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          );
        })}
        <Button
          variant="secondary"
          onClick={openNewTab}
          title="Nouveau panier [F6]"
          className="shrink-0"
        >
          + Panier [F6]
        </Button>
        {/* P5 : coupure son locale (persistée, voir Réglages → Sons). */}
        <Button
          variant="ghost"
          onClick={() => {
            const next = !soundOn;
            setSoundOn(next);
            void persistSoundEnabled(next);
          }}
          title={soundOn ? "Couper les sons" : "Activer les sons"}
          aria-pressed={soundOn}
          className="shrink-0"
        >
          {soundOn ? (
            <Volume2 size={16} aria-hidden="true" />
          ) : (
            <VolumeX size={16} aria-hidden="true" />
          )}
        </Button>
      </div>

      {/* Panier + totaux */}
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[1.5fr_1fr]">
        <CartPanel
          cart={cart}
          totalQty={totalQty}
          clearActiveCart={clearActiveCart}
          confirmAsync={confirmAsync}
          notify={notify}
        />

        <div className="flex min-h-0 flex-col gap-4 overflow-auto">
          <Card className="space-y-3 p-5">
            <SectionTitle title="Total" hint="Montants en dinars (DZD)" />
            {totalsErr ? (
              <p role="alert" className="text-sm font-semibold text-red-300">
                {totalsErr}
              </p>
            ) : null}
            <dl className="space-y-1.5 rounded-xl bg-black/25 p-4 text-sm">
              <div className="flex justify-between text-slate-300">
                <dt>
                  {cart.lines.length} article{cart.lines.length > 1 ? "s" : ""} ·{" "}
                  {Math.round(totalQty * 1000) / 1000} unité(s)
                </dt>
                <dd className="tabular-nums">{formatDzd(totals?.subtotalMinor ?? 0)}</dd>
              </div>
              {totals != null && totals.discountAmountMinor > 0 ? (
                <div className="flex justify-between font-semibold text-emerald-300">
                  <dt>Remise</dt>
                  <dd className="tabular-nums">−{formatDzd(totals.discountAmountMinor)}</dd>
                </div>
              ) : null}
              {totals != null && totals.discountAmountMinor < 0 ? (
                <div className="flex justify-between font-semibold text-sky-300">
                  <dt>Majoration</dt>
                  <dd className="tabular-nums">+{formatDzd(-totals.discountAmountMinor)}</dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between border-t border-white/10 pt-2">
                <dt className="text-base font-extrabold">Total à payer</dt>
                <dd className="text-3xl font-extrabold tabular-nums tracking-tight text-amber-300">
                  {formatDzd(totals?.totalMinor ?? 0)}
                </dd>
              </div>
            </dl>
            <Button
              onClick={openPay}
              disabled={cart.lines.length === 0 || totals == null || totalsErr !== ""}
              className="w-full py-3 text-base"
            >
              Encaisser [F10]
            </Button>
          </Card>

          {preview ? (
            <Card className="space-y-3 p-5">
              <SectionTitle
                title={`Dernière vente · ${preview.sale.invoice}`}
                hint={preview.sale.date}
                action={
                  <Button
                    variant="secondary"
                    onClick={() => void print()}
                    title="Imprimer le ticket"
                  >
                    <Printer size={16} aria-hidden="true" /> Imprimer
                  </Button>
                }
              />
              {printMode === "A4" ? (
                <iframe
                  sandbox=""
                  srcDoc={preview.htmlA4}
                  title={`Aperçu facture ${preview.sale.invoice}`}
                  className="h-72 w-full rounded-xl border border-white/10 bg-white"
                />
              ) : (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-4 font-mono text-xs leading-relaxed text-slate-200">
                  {preview.text80}
                </pre>
              )}
            </Card>
          ) : null}
        </div>
      </div>

      {/* Encaissement en 3 étapes (P4 : sell/PayDialog) */}
      {payOpen && totals ? (
        <PayDialog
          totals={totals}
          customerLabel={cart.customerLabel}
          paidText={paidText}
          setPaidText={setPaidText}
          paymentMethod={cart.paymentMethod}
          defaultMethod={defaultMethod}
          setPaymentMethod={(m) => cart.setTotals({ paymentMethod: m })}
          dueDate={dueDate}
          setDueDate={setDueDate}
          changeMinor={changeMinor}
          busy={busy}
          creditBlocked={creditBlocked}
          creditBlockedMsg={creditBlockedMsg}
          onClose={() => setPayOpen(false)}
          onValidate={() => void finalize()}
          notify={notify}
        />
      ) : null}

      {/* Règlement de la dette client (P4 : sell/SettleDialog) */}
      {settleOpen && cart.customerId != null && customerBalance != null ? (
        <SettleDialog
          customerLabel={cart.customerLabel}
          customerBalance={customerBalance}
          settleAmount={settleAmount}
          setSettleAmount={setSettleAmount}
          settleMethod={settleMethod}
          setSettleMethod={setSettleMethod}
          settleBusy={settleBusy}
          onClose={() => setSettleOpen(false)}
          onSubmit={() => void settleDebt()}
        />
      ) : null}

      {/* Aperçu du devis + impression A4 (Entrée = imprimer) */}
      {proformaDoc ? (
        <Modal
          label="Aperçu devis"
          title={`Devis ${proformaDoc.number}`}
          onClose={() => setProformaDoc(null)}
          wide
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void printProforma();
            }}
          >
            <p className="text-xs text-slate-500">
              {proformaDoc.date} · Document sans valeur fiscale.
            </p>
            <iframe
              sandbox=""
              srcDoc={proformaDoc.htmlA4}
              title={`Aperçu devis ${proformaDoc.number}`}
              className="h-[420px] w-full rounded-xl border border-white/10 bg-white"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setProformaDoc(null)}
                className="flex-1"
              >
                Fermer
              </Button>
              <Button type="submit" className="flex-[2]">
                <Printer size={16} aria-hidden="true" /> Imprimer A4
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {/* Fiche client directe (requête 1) : le panier reste intact */}
      {customerDrawer ? (
        <ClientDetailsDrawer
          customer={customerDrawer.customer}
          sales={customerDrawer.sales}
          onClose={() => setCustomerDrawer(null)}
          onEdit={(c) => {
            setCustomerDrawer(null);
            setCustomerEditing(c);
            setCustomerFormOpen(true);
          }}
          onChanged={() => void refreshCustomerDrawer()}
          notify={notify}
        />
      ) : null}
      {customerFormOpen ? (
        <ClientFormDialog
          customer={customerEditing}
          onClose={() => {
            setCustomerFormOpen(false);
            setCustomerEditing(null);
          }}
          onSaved={() => {
            setCustomerFormOpen(false);
            setCustomerEditing(null);
            void refreshCustomerDrawer();
          }}
          notify={notify}
        />
      ) : null}

      {/* Article libre (P4 : sell/CustomItemDialog) */}
      {customOpen ? (
        <CustomItemDialog
          customForm={customForm}
          setCustomForm={setCustomForm}
          customPriceRef={customPriceRef}
          onClose={() => setCustomOpen(false)}
          onAdd={addCustomProduct}
        />
      ) : null}
    </div>
  );
}
