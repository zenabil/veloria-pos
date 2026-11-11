// Veloria Client (APK) — Modèle de panier (PUR, testé).
//
// Le panier est un **état local de l'appareil**, pas une donnée métier :
// il survit à la fermeture (commande hebdomadaire) et ne touche JAMAIS le
// miroir. Les prix viennent du catalogue publié (projection du POS) : le
// total affiché est donc un **ESTIMÉ** — le prix fait foi est celui de la
// vente créée au comptoir.
//
// Argent : centimes DZD entiers (veloria-money). Une quantité décimale est
// admise (produits au kg) avec la MÊME règle que le POS : millièmes, arrondi
// au centime le plus proche.

/** Borne de lignes (le panier reste lisible sur un écran de 5"). */
export const CART_MAX_LINES = 50;
/** Borne de quantité par ligne (unité de base). */
export const CART_MAX_QTY = 1000;
/** Plafond unitaire d'un prix catalogue (miroir de `MAX_MINOR_SINGLE`). */
export const CART_MAX_PRICE_MINOR = 1_000_000_000;

export interface CartLine {
  productId: number;
  name: string;
  unitCode: string;
  /** Prix de vente unitaire en centimes (catalogue au moment de l'ajout). */
  priceMinor: number;
  /** Quantité (3 décimales max, comme le POS). */
  quantity: number;
  /** Disponibilité au moment de l'ajout (indice, pas une réservation). */
  available: boolean;
}

export interface Cart {
  lines: CartLine[];
}

/** Quantité valide : 3 décimales max, dans les bornes. */
export function isValidQuantity(qty: number): boolean {
  if (!Number.isFinite(qty)) return false;
  if (qty <= 0 || qty > CART_MAX_QTY) return false;
  return Math.abs(qty * 1000 - Math.round(qty * 1000)) < 1e-6;
}

/**
 * Multiplication centimes × quantité — MÊME règle que le domaine POS
 * (`multiplyMinorByQuantity`) : arrondi au centime le plus proche, jamais de
 * troncature. Le total n'est qu'un estimation : le main recalcule le vrai.
 */
export function multiplyMinorByQuantity(unitPriceMinor: number, quantity: number): number {
  const product = unitPriceMinor * quantity;
  if (!Number.isFinite(product)) return 0;
  return Math.round(product);
}

/** Arrondi de la quantité aux millièmes (règle POS). */
export function roundQuantity(qty: number): number {
  if (!Number.isFinite(qty)) return 0;
  return Math.round(qty * 1000) / 1000;
}

function sameLine(a: CartLine, b: CartLine): boolean {
  // Deux lignes du même produit au MÊME prix fusionnent ; un prix différent
  // (le catalogue a changé entre-temps) reste une ligne séparée : on ne
  // mélange jamais deux prix pour un même produit.
  return a.productId === b.productId && a.priceMinor === b.priceMinor;
}

/** Ajoute une ligne (fusion si même produit + même prix). */
export function addLine(lines: readonly CartLine[], line: CartLine): CartLine[] {
  if (!Number.isInteger(line.productId) || line.productId <= 0) return [...lines];
  if (!Number.isInteger(line.priceMinor) || line.priceMinor < 0) return [...lines];
  if (line.priceMinor > CART_MAX_PRICE_MINOR) return [...lines];
  const quantity = roundQuantity(line.quantity);
  if (!isValidQuantity(quantity)) return [...lines];
  const next = [...lines];
  const index = next.findIndex((l) => sameLine(l, line));
  if (index >= 0) {
    const existing = next[index] as CartLine;
    const merged = roundQuantity(existing.quantity + quantity);
    if (!isValidQuantity(merged) || merged > CART_MAX_QTY) return next;
    next[index] = { ...existing, quantity: merged };
    return next;
  }
  if (next.length >= CART_MAX_LINES) return next;
  next.push({ ...line, quantity });
  return next;
}

/** Change la quantité d'une ligne (0 = suppression). */
export function setLineQuantity(
  lines: readonly CartLine[],
  productId: number,
  priceMinor: number,
  quantity: number,
): CartLine[] {
  const qty = roundQuantity(quantity);
  if (!isValidQuantity(qty)) return [...lines];
  return lines.map((l) =>
    l.productId === productId && l.priceMinor === priceMinor ? { ...l, quantity: qty } : l,
  );
}

/** Retire une ligne (toutes ses occurrences). */
export function removeLine(lines: readonly CartLine[], productId: number): CartLine[] {
  return lines.filter((l) => l.productId !== productId);
}

/** Vide le panier. */
export function clearCart(): CartLine[] {
  return [];
}

/** Total estimé du panier (centimes DZD). */
export function cartTotalMinor(lines: readonly CartLine[]): number {
  let total = 0;
  for (const line of lines) {
    total += multiplyMinorByQuantity(line.priceMinor, line.quantity);
  }
  return total;
}

/** Nombre d'articles (somme des quantités). */
export function cartCount(lines: readonly CartLine[]): number {
  let count = 0;
  for (const line of lines) {
    count += line.quantity;
  }
  return count;
}

/** Nombre de lignes distinctes. */
export function cartLineCount(lines: readonly CartLine[]): number {
  return lines.length;
}

/** Panier vide ? */
export function isCartEmpty(lines: readonly CartLine[]): boolean {
  return lines.length === 0;
}

/**
 * Le panier a-t-il changé depuis sa construction ? (le catalogue a pu changer
 * entre-temps : le panier garde le prix au moment de l'ajout, la vente
 * appliquera le prix du jour).
 */
export function cartHasUnavailableLine(lines: readonly CartLine[]): boolean {
  return lines.some((l) => !l.available);
}
