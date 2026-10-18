// Veloria PoS — Vente : recherche produit/client + article libre (extrait de SellScreen).
// Logique reprise à l'identique (code-barres d'abord, anti-course, debounce).
// Les actions prennent leurs dépendances explicites ; les prédicats purs sont
// exportés seuls pour les tests.
import type { RefObject } from "react";
import { playSound } from "@shared/sound/sound.ts";
import { parseDzdInputStrict } from "@domain/money/money.ts";
import { MAX_QUANTITY, roundQuantity } from "@domain/common/quantity.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { api } from "@shared/types/ipc-client.ts";
import { needsQuantityDialog } from "./sell-weight.ts";
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

/**
 * Probable scan complet (EAN 8+ chiffres) : seul cas où un échec mérite un
 * message — la frappe manuelle en cours ne doit jamais bruiter.
 */
export function isLikelyScan(trimmed: string): boolean {
  return /^[0-9]{8,}$/.test(trimmed);
}

/**
 * Douchette (scan sans Entrée) : une frappe à ≤ 60 ms de la précédente est une
 * cadence machine — aucun humain ne tape à 1 000 caractères/minute.
 */
export const SCAN_BURST_GAP_MS = 60;

/** Idle d'une rafale douchette sur un code-barres : ajout quasi immédiat. */
export const SCAN_IDLE_MS = 90;

/** Idle de frappe humaine : laisse finir le mot (comportement historique). */
export const TEXT_IDLE_MS = 220;

/**
 * Délai d'inactivité avant recherche : une rafale machine sur un texte
 * code-barres n'attend que 90 ms — le scan sans Entrée s'ajoute aussitôt et
 * deux scans d'affilée (> 90 ms d'écart, cadence opérateur) ne se concatènent
 * plus en un pseudo-code inconnu. Une frappe humaine garde 220 ms (anti-bruit :
 * jamais de recherche par préfixe pendant la saisie).
 */
export function searchIdleMs(machineBurst: boolean, barcodeLike: boolean): number {
  return machineBurst && barcodeLike ? SCAN_IDLE_MS : TEXT_IDLE_MS;
}

/** Recherche client : 2 lettres minimum (évite le balayage complet). */
export function isCustomerQueryReady(q: string): boolean {
  return q.trim().length >= 2;
}

/** Quantité rapide caisse (`5*CODE`, `2x huile`, `1,5×619…`) : préfixe optionnel. */
export interface QtyPrefix {
  quantity: number;
  code: string;
  /**
   * ADR-114 : true si le vendeur a TAPÉ le préfixe (`2,5*CODE`) — sa quantité
   * fait foi (ajout direct, dialogue « quantité vendue » contourné).
   */
  explicit: boolean;
}

export function parseQtyPrefix(trimmed: string): QtyPrefix {
  const m = /^(\d+(?:[.,]\d+)?)\s*[*x×]\s*(.+)$/i.exec(trimmed.trim());
  if (!m) return { quantity: 1, code: trimmed, explicit: false };
  const qty = roundQuantity(Number((m[1] ?? "").replace(",", ".")));
  const code = (m[2] ?? "").trim();
  if (!Number.isFinite(qty) || qty <= 0 || qty > 9999 || code.length === 0) {
    return { quantity: 1, code: trimmed, explicit: false };
  }
  return { quantity: qty, code, explicit: true };
}

function fmtQty(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/**
 * Garde stock précoce (UX) : le main retranche de toute façon (survente
 * refusée sauf paramètre), mais la caisse alerte en FR AVANT l'encaissement.
 * `null` = stock suffisant, message FR sinon (rupture ou dépassement).
 */
export function stockGuardMessage(
  stockQty: number,
  desiredQty: number,
  productName: string,
): string | null {
  if (!Number.isFinite(stockQty) || stockQty <= 0) {
    return `Rupture de stock : « ${productName} » indisponible (ajouté quand même — la vente sera refusée si la survente est interdite).`;
  }
  if (desiredQty > stockQty) {
    return `Stock insuffisant : « ${productName} » — demandé ${fmtQty(desiredQty)}, disponible ${fmtQty(stockQty)}.`;
  }
  return null;
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

/** Solde + autorisation + plafond du client (lecture seule, avant encaissement). */
export async function fetchCustomerCredit(id: number): Promise<{
  balance: number | null;
  allowed: boolean | null;
  limit: number | null;
}> {
  try {
    const st = (await api.customerStatement({ id })) as {
      customer: {
        outstanding_balance_minor: number;
        credit_allowed: number;
        credit_limit_minor: number;
      };
    };
    return {
      balance: st.customer.outstanding_balance_minor,
      allowed: st.customer.credit_allowed === 1,
      limit: st.customer.credit_limit_minor,
    };
  } catch {
    return { balance: null, allowed: null, limit: null };
  }
}

export interface SellSearchDeps {
  cart: ActiveCart;
  notify: Notify;
  searchTimer: ReturnType<typeof useDebouncedTimer>;
  customerTimer: ReturnType<typeof useDebouncedTimer>;
  searchSeq: RefObject<number>;
  customerSearchSeq: RefObject<number>;
  /** Douchette : horodatage (ms) de la dernière frappe — cadence machine. */
  lastKeyAtRef: RefObject<number>;
  /** Douchette : true si la dernière frappe est à cadence machine (rafale). */
  scanBurstRef: RefObject<boolean>;
  searchRef: RefObject<HTMLInputElement | null>;
  customPriceRef: RefObject<HTMLInputElement | null>;
  setQuery: (v: string) => void;
  setResults: (v: SearchRow[]) => void;
  setSearching: (v: boolean) => void;
  setCustomerQuery: (v: string) => void;
  setCustomerResults: (v: CustomerRow[]) => void;
  setCustomerTotal: (v: number) => void;
  setCustomerCredit: (v: boolean | null) => void;
  setCustomerBalance: (v: number | null) => void;
  setCustomerCreditLimit: (v: number | null) => void;
  setLimitOverride: (v: boolean) => void;
  setCreditUnknown: (v: boolean) => void;
  setCustomOpen: (v: boolean) => void;
  customForm: CustomForm;
  setCustomForm: (v: CustomForm) => void;
  /** ADR-114 : produit à unité continue en attente de quantité (dialogue). */
  quantityFor: SearchRow | null;
  setQuantityFor: (v: SearchRow | null) => void;
}

export function onQueryChange(d: SellSearchDeps, q: string): void {
  d.setQuery(q);
  const trimmed = q.trim();
  // Cadence machine (douchette HID : frappes ≤ 60 ms) : idle court dès que le
  // texte est un code-barres — l'ajout suit le scan sans Entrée, et un scan
  // suivant à cadence opérateur ne se concatène plus (fenêtre 220 → 90 ms).
  const now = Date.now();
  const gap = now - d.lastKeyAtRef.current;
  d.lastKeyAtRef.current = now;
  d.scanBurstRef.current = gap >= 0 && gap < SCAN_BURST_GAP_MS;
  // Invalide toute recherche en vol (résultats à venir ignorés par seq).
  d.searchSeq.current += 1;
  if (!trimmed) {
    d.searchTimer.cancel();
    d.setResults([]);
    d.setSearching(false);
    return;
  }
  // Anti-ligne périmée (scan rapide + Entrée de la douchette) : les résultats
  // précédents ne sont plus sélectionnables pendant la frappe — sinon Entrée
  // ajoute la mauvaise ligne, puis le hit code-barres en ajoute une seconde.
  d.setResults([]);
  d.setSearching(true);
  d.searchTimer.schedule(searchIdleMs(d.scanBurstRef.current, isBarcodeLike(trimmed)), () => {
    void runSearch(d, trimmed);
  });
}

export async function runSearch(d: SellSearchDeps, trimmed: string): Promise<void> {
  const seq = (d.searchSeq.current += 1);
  // Quantité rapide (`5*CODE`) : le préfixe ne part jamais au moteur.
  const prefix = parseQtyPrefix(trimmed);
  const code = prefix.code;
  try {
    // Code-barres exact d'abord (chemin indexé), puis recherche texte.
    if (isBarcodeLike(code)) {
      const hit = (await api.productByBarcode({ barcode: code })) as {
        product: SearchRow | null;
      };
      if (seq !== d.searchSeq.current) return;
      if (hit.product) {
        // ADR-114 : unité continue sans quantité tapée → dialogue quantité.
        addProductOrAskQuantity(d, hit.product, prefix);
        d.setQuery("");
        d.setResults([]);
        d.setSearching(false);
        return;
      }
    }
    const res = (await api.productSearch({ query: code, page: 1, pageSize: 12 })) as {
      rows: SearchRow[];
    };
    // Réponse périmée (une recherche plus récente est partie) : ignorée.
    if (seq !== d.searchSeq.current) return;
    d.setResults(res.rows);
    // Scan sans correspondance : jamais silencieux — le code doit être
    // enregistré sur la fiche produit (Catalogue → Codes-barres).
    if (res.rows.length === 0 && isLikelyScan(code)) {
      d.notify("Code-barres inconnu : vérifiez la fiche produit (Catalogue).", "err");
    }
  } catch (err) {
    if (seq !== d.searchSeq.current) return;
    d.notify(frError(err, "Recherche impossible."), "err");
  } finally {
    if (seq === d.searchSeq.current) d.setSearching(false);
  }
}

export function addProduct(
  d: Pick<SellSearchDeps, "cart" | "notify" | "searchRef">,
  p: SearchRow,
  qty = 1,
): void {
  // Clé anti-collision (scan rapide) : UUIDv7, jamais Date.now().
  // Garde stock précoce : cumul panier + demandé vs disponible (le main retranche).
  const wanted = Number.isFinite(qty) && qty > 0 ? roundQuantity(qty) : 1;
  const safeQty = wanted > 0 ? wanted : 1;
  const inCart = Array.isArray(d.cart.lines)
    ? d.cart.lines
        .filter((l) => l.productId != null && l.productId === p.id)
        .reduce((a, l) => a + l.quantity, 0)
    : 0;
  const guard = stockGuardMessage(p.quantity, roundQuantity(inCart + safeQty), p.name);
  if (guard) d.notify(guard, "err");
  d.cart.addLine({
    key: `l-${newOperationId()}`,
    productId: p.id,
    productName: p.name,
    unitCode: p.unit_code,
    originalUnitPriceMinor: p.selling_price_minor,
    unitPriceMinor: p.selling_price_minor,
    purchasePriceMinor: p.purchase_price_minor,
    quantity: safeQty,
    stockQty: Number.isFinite(p.quantity) ? p.quantity : null,
  });
  // P5 : bip d'ajout (discret, coupable en un clic en tête).
  playSound("blip");
  // Seul l'ajout depuis la recherche refocalise le champ de recherche.
  d.searchRef.current?.focus();
}

/**
 * ADR-114 — Flux d'ajout caisse : unité continue (poids/volume/longueur) sans
 * quantité explicite du vendeur → le dialogue « quantité vendue » s'ouvre
 * (poids OU montant), jamais « 1 par défaut ». Le préfixe tapé (`2,5*CODE`)
 * est une quantité déjà donnée → ajout direct.
 * Retour : "dialog" (dialogue ouvert, rien ajouté) | "added" (ligne ajoutée).
 */
export function addProductOrAskQuantity(
  d: Pick<SellSearchDeps, "cart" | "notify" | "searchRef" | "setQuantityFor">,
  p: SearchRow,
  prefix: QtyPrefix,
): "added" | "dialog" {
  if (needsQuantityDialog(p.unit_code, prefix.explicit)) {
    d.setQuantityFor(p);
    return "dialog";
  }
  addProduct(d, p, prefix.quantity);
  return "added";
}

/**
 * Confirmation du dialogue « quantité vendue » : ajoute la ligne avec la
 * quantité saisie (poids entré ou converti du montant), referme le dialogue
 * et nettoie la recherche. `false` = rien à confirmer (quantité invalide ou
 * dialogue déjà fermé) — le dialogue reste ouvert sur quantité invalide.
 */
export function confirmWeightedAdd(
  d: Pick<
    SellSearchDeps,
    "cart" | "notify" | "searchRef" | "quantityFor" | "setQuantityFor" | "setQuery" | "setResults"
  >,
  quantity: number,
): boolean {
  const row = d.quantityFor;
  const qty = roundQuantity(quantity);
  // Bornes identiques au domaine/IPC : finie, > 0, ≤ 1 000 000 (jamais de
  // « 1 par défaut » silencieux ni d'Infinity dans la ligne de panier).
  if (row == null || !Number.isFinite(qty) || qty <= 0 || qty > MAX_QUANTITY) return false;
  addProduct(d, row, qty);
  d.setQuantityFor(null);
  d.setQuery("");
  d.setResults([]);
  return true;
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
    key: `libre-${newOperationId()}`,
    productId: null,
    productName: parsed.item.name,
    unitCode: "PIECE",
    originalUnitPriceMinor: parsed.item.unitPriceMinor,
    unitPriceMinor: parsed.item.unitPriceMinor,
    purchasePriceMinor: 0,
    quantity: parsed.item.quantity,
    stockQty: null,
  });
  d.setCustomOpen(false);
  d.setCustomForm({ name: "", price: "", qty: "1" });
  // FIX-P1-04 : refocus recherche après article libre (miroir de addProduct) —
  // sans cela la frappe douchette suivante ne part nulle part.
  d.searchRef.current?.focus();
  playSound("blip");
}

export function searchCustomers(d: SellSearchDeps, q: string): void {
  d.setCustomerQuery(q);
  if (!isCustomerQueryReady(q)) {
    d.customerTimer.cancel();
    d.setCustomerResults([]);
    d.setCustomerTotal(0);
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
      total: number;
    };
    if (seq !== d.customerSearchSeq.current) return;
    d.setCustomerResults(res.rows);
    d.setCustomerTotal(typeof res.total === "number" ? res.total : res.rows.length);
  } catch (e) {
    if (seq !== d.customerSearchSeq.current) return;
    // Journal seul (recherche d'arrière-plan) : pas de toast à chaque frappe.
    console.error("[Veloria] caisse : clients illisibles pour la recherche", e);
    d.setCustomerResults([]);
    d.setCustomerTotal(0);
  }
}

export function selectCustomer(
  d: Pick<
    SellSearchDeps,
    | "cart"
    | "setCustomerCredit"
    | "setCustomerBalance"
    | "setCustomerCreditLimit"
    | "setLimitOverride"
    | "setCreditUnknown"
    | "setCustomerQuery"
    | "setCustomerResults"
    | "setCustomerTotal"
    | "searchRef"
  >,
  c: CustomerRow | null,
): void {
  if (c == null) {
    d.cart.setCustomer(null, "Client de passage");
    d.setCustomerCredit(null);
    d.setCustomerBalance(null);
    d.setCustomerCreditLimit(null);
    d.setLimitOverride(false);
    d.setCreditUnknown(false);
  } else {
    d.cart.setCustomer(c.id, `${c.first_name} ${c.last_name}`.trim());
    // Valeur immédiate (relevée par le relevé juste après, anti-course inclus).
    d.setCustomerCredit(c.credit_allowed === 1);
    d.setCustomerBalance(c.outstanding_balance_minor);
    d.setCustomerCreditLimit(c.credit_limit_minor ?? null);
    d.setLimitOverride(false);
    d.setCreditUnknown(false);
  }
  d.setCustomerQuery("");
  d.setCustomerResults([]);
  d.setCustomerTotal(0);
  // FIX-P1-04 (miroir article libre) : la liste se démonte sur sélection — sans
  // refocus, la frappe douchette suivante ne part nulle part.
  d.searchRef.current?.focus();
}

/** Fabrique : le panier + notifier + faisceau d'état (hook) → deps de recherche. */
export function searchDepsFrom(cart: ActiveCart, notify: Notify, s: SellState): SellSearchDeps {
  return { ...s, cart, notify };
}
