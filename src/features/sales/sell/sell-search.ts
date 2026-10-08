// Veloria PoS — Vente : recherche produit/client + article libre (extrait de SellScreen).
// Logique reprise à l'identique (code-barres d'abord, anti-course, debounce).
// Les actions prennent leurs dépendances explicites ; les prédicats purs sont
// exportés seuls pour les tests.
import type { RefObject } from "react";
import { playSound } from "@shared/sound/sound.ts";
import { parseDzdInputStrict } from "@domain/money/money.ts";
import { roundQuantity } from "@domain/common/quantity.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { api } from "@shared/types/ipc-client.ts";
import type { ActiveCart } from "../cart-store.ts";
import type { useDebouncedTimer } from "@shared/ui/use-debounced-timer.ts";
import type { Notify } from "@shared/ui/primitives.tsx";
import type { CustomForm } from "./CustomItemDialog.tsx";
import type { CustomerRow, SearchRow } from "./sell-types.ts";
import type { SellState } from "./useSellState.ts";

/** Code-barres candidat : chemin indexé exact avant la recherche texte. */
export function isBarcodeLike(trimmed: string): boolean {
  return /^[0-9A-Za-z\-_.]{4,}$/.test(trimmed);
}

/** Recherche client : 2 lettres minimum (évite le balayage complet). */
export function isCustomerQueryReady(q: string): boolean {
  return q.trim().length >= 2;
}

export interface ParsedCustomItem {
  name: string;
  unitPriceMinor: number;
  quantity: number;
}

/**
 * Validation pure de l'article libre (mêmes règles + mêmes messages FR que
 * l'écran) : l'appelant notifie `error` et refocalise le prix si
 * `focusPrice` est vrai.
 */
export function parseCustomItemInput(
  form: CustomForm,
): { ok: true; item: ParsedCustomItem } | { ok: false; error: string; focusPrice: boolean } {
  const name = form.name.trim();
  if (name.length === 0) return { ok: false, error: "Nom du produit requis.", focusPrice: false };
  if (form.price.trim() === "") {
    return { ok: false, error: "Prix unitaire requis.", focusPrice: true };
  }
  let unitPriceMinor = 0;
  try {
    unitPriceMinor = parseDzdInputStrict(form.price, "Prix unitaire");
  } catch (e) {
    return {
      ok: false,
      error: frError(e, "Prix unitaire invalide (montant > 0)."),
      focusPrice: true,
    };
  }
  if (!Number.isInteger(unitPriceMinor) || unitPriceMinor <= 0) {
    return { ok: false, error: "Prix unitaire invalide (montant > 0).", focusPrice: true };
  }
  const qtyRaw = form.qty.trim() === "" ? "1" : form.qty.trim();
  const qtyParsed = Number(qtyRaw.replace(",", "."));
  if (!Number.isFinite(qtyParsed) || qtyParsed <= 0) {
    return { ok: false, error: "Quantité invalide (nombre > 0).", focusPrice: false };
  }
  const quantity = roundQuantity(qtyParsed);
  if (!(quantity > 0)) {
    return { ok: false, error: "Quantité invalide (nombre > 0).", focusPrice: false };
  }
  return { ok: true, item: { name, unitPriceMinor, quantity } };
}

/** Solde + autorisation crédit du client (lecture seule, avant encaissement). */
export async function fetchCustomerCredit(id: number): Promise<{
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

export async function fetchBalance(id: number): Promise<number | null> {
  return (await fetchCustomerCredit(id)).balance;
}

export interface SellSearchDeps {
  cart: ActiveCart;
  notify: Notify;
  searchTimer: ReturnType<typeof useDebouncedTimer>;
  customerTimer: ReturnType<typeof useDebouncedTimer>;
  searchSeq: RefObject<number>;
  customerSearchSeq: RefObject<number>;
  searchRef: RefObject<HTMLInputElement | null>;
  customPriceRef: RefObject<HTMLInputElement | null>;
  setQuery: (v: string) => void;
  setResults: (v: SearchRow[]) => void;
  setSearching: (v: boolean) => void;
  setCustomerQuery: (v: string) => void;
  setCustomerResults: (v: CustomerRow[]) => void;
  setCustomerCredit: (v: boolean | null) => void;
  setCreditUnknown: (v: boolean) => void;
  setCustomOpen: (v: boolean) => void;
  customForm: CustomForm;
  setCustomForm: (v: CustomForm) => void;
}

export function onQueryChange(d: SellSearchDeps, q: string): void {
  d.setQuery(q);
  const trimmed = q.trim();
  if (!trimmed) {
    d.searchTimer.cancel();
    d.setResults([]);
    d.setSearching(false);
    return;
  }
  d.setSearching(true);
  d.searchTimer.schedule(220, () => {
    void runSearch(d, trimmed);
  });
}

export async function runSearch(d: SellSearchDeps, trimmed: string): Promise<void> {
  const seq = (d.searchSeq.current += 1);
  try {
    // Code-barres exact d'abord (chemin indexé), puis recherche texte.
    if (isBarcodeLike(trimmed)) {
      const hit = (await api.productByBarcode({ barcode: trimmed })) as {
        product: SearchRow | null;
      };
      if (seq !== d.searchSeq.current) return;
      if (hit.product) {
        addProduct(d, hit.product);
        d.setQuery("");
        d.setResults([]);
        d.setSearching(false);
        return;
      }
    }
    const res = (await api.productSearch({ query: trimmed, page: 1, pageSize: 12 })) as {
      rows: SearchRow[];
    };
    // Réponse périmée (une recherche plus récente est partie) : ignorée.
    if (seq !== d.searchSeq.current) return;
    d.setResults(res.rows);
  } catch (err) {
    if (seq !== d.searchSeq.current) return;
    d.notify(frError(err, "Recherche impossible."), "err");
  } finally {
    if (seq === d.searchSeq.current) d.setSearching(false);
  }
}

export function addProduct(d: Pick<SellSearchDeps, "cart" | "searchRef">, p: SearchRow): void {
  d.cart.addLine({
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
  d.searchRef.current?.focus();
}

export function addCustomProduct(d: SellSearchDeps): void {
  const parsed = parseCustomItemInput(d.customForm);
  if (!parsed.ok) {
    d.notify(parsed.error, "err");
    if (parsed.focusPrice) d.customPriceRef.current?.focus();
    return;
  }
  // Article libre hors catalogue : pas de stock décrémenté (productId null).
  d.cart.addLine({
    key: `libre-${Date.now()}`,
    productId: null,
    productName: parsed.item.name,
    unitCode: "PIECE",
    originalUnitPriceMinor: parsed.item.unitPriceMinor,
    unitPriceMinor: parsed.item.unitPriceMinor,
    purchasePriceMinor: 0,
    quantity: parsed.item.quantity,
  });
  d.setCustomOpen(false);
  d.setCustomForm({ name: "", price: "", qty: "1" });
  playSound("blip");
}

export function searchCustomers(d: SellSearchDeps, q: string): void {
  d.setCustomerQuery(q);
  if (!isCustomerQueryReady(q)) {
    d.customerTimer.cancel();
    d.setCustomerResults([]);
    return;
  }
  d.customerTimer.schedule(200, () => {
    void runCustomerSearch(d, q.trim());
  });
}

export async function runCustomerSearch(d: SellSearchDeps, trimmed: string): Promise<void> {
  const seq = (d.customerSearchSeq.current += 1);
  try {
    const res = (await api.customerSearch({ query: trimmed, page: 1, pageSize: 8 })) as {
      rows: CustomerRow[];
    };
    if (seq !== d.customerSearchSeq.current) return;
    d.setCustomerResults(res.rows);
  } catch {
    if (seq !== d.customerSearchSeq.current) return;
    d.setCustomerResults([]);
  }
}

export function selectCustomer(
  d: Pick<
    SellSearchDeps,
    "cart" | "setCustomerCredit" | "setCreditUnknown" | "setCustomerQuery" | "setCustomerResults"
  >,
  c: CustomerRow | null,
): void {
  if (c == null) {
    d.cart.setCustomer(null, "Client de passage");
    d.setCustomerCredit(null);
    d.setCreditUnknown(false);
  } else {
    d.cart.setCustomer(c.id, `${c.first_name} ${c.last_name}`.trim());
    // Valeur immédiate (relevée par le relevé juste après, anti-course inclus).
    d.setCustomerCredit(c.credit_allowed === 1);
    d.setCreditUnknown(false);
  }
  d.setCustomerQuery("");
  d.setCustomerResults([]);
}

/** Fabrique : le panier + notifier + faisceau d'état (hook) → deps de recherche. */
export function searchDepsFrom(cart: ActiveCart, notify: Notify, s: SellState): SellSearchDeps {
  return { ...s, cart, notify };
}
