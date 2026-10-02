// Veloria PoS — Application: accès clients APK (PUR, sans IO).
// Construit la charge d'activation (validée, hachée côté main) et le
// cliché d'affichage poussé vers le miroir. Zéro IO, zéro UUID généré ici :
// `operationId` est FOURNI par l'appelant (même contrat que CreateSale).
// V1 = lecture seule : ce use-case ne touche jamais aux soldes.

import {
  assertValidActivationCode,
  assertValidAnnouncement,
  assertValidPin,
} from "@domain/customer/client-access.ts";
import { assertSafeTotal } from "@domain/money/money.ts";

/** 1 point affiché par tranche de 1000 DZD achetés (100 000 centimes). */
export const LOYALTY_MINOR_PER_POINT = 100_000;

/**
 * Charge QR d'activation scannée par l'APK (ADR-054) :
 * `VELORIA1|<phone>|<pin>|<code>` — préfixe versionné, `|` interdit dans le
 * téléphone (rejeté ici). Le PIN reste le seul secret de connexion (même
 * niveau que la dictée manuelle) ; le code ne sert qu'au traçage futur.
 */
export const ACTIVATION_QR_PREFIX = "VELORIA1";

export function buildActivationQrPayload(phone: string, pin: string, code: string): string {
  const p = phone.trim();
  if (p.length < 1 || p.length > 30 || p.includes("|")) {
    throw new Error("Téléphone invalide pour le QR (1 à 30 caractères, sans |).");
  }
  assertValidPin(pin);
  assertValidActivationCode(code);
  return `${ACTIVATION_QR_PREFIX}|${p}|${pin}|${code}`;
}

export interface ActivationDraft {
  customerId: number;
  phone: string;
  pin: string;
  /** Code QR opaque à usage unique (généré côté main, validé ici). */
  activationCode: string;
  /** Idempotence : UUID figé par l'appelant, rejoué tel quel au retry. */
  operationId: string;
}

export interface ValidatedActivation {
  customerId: number;
  phone: string;
  pin: string;
  activationCode: string;
  operationId: string;
}

/** Valide la demande d'activation (le main hache phone/PIN/QR ensuite). */
export function validateActivation(draft: ActivationDraft): ValidatedActivation {
  if (!Number.isInteger(draft.customerId) || draft.customerId <= 0) {
    throw new Error("Client invalide : identifiant de client requis.");
  }
  if (typeof draft.operationId !== "string" || draft.operationId.trim().length === 0) {
    throw new Error("operationId manquant : le use-case refuse sans identifiant d'opération.");
  }
  const phone = draft.phone.trim();
  if (phone.length < 1 || phone.length > 30) {
    throw new Error("Téléphone invalide : 1 à 30 caractères.");
  }
  assertValidPin(draft.pin);
  assertValidActivationCode(draft.activationCode);
  return {
    customerId: draft.customerId,
    phone,
    pin: draft.pin,
    activationCode: draft.activationCode,
    operationId: draft.operationId,
  };
}

export interface SnapshotSaleRow {
  id: number;
  invoice_number: string;
  total_minor: number;
  amount_paid_minor: number;
  remaining_balance_minor: number;
  payment_status: string;
  is_cancelled: number;
  created_at: string;
}

export interface SnapshotPaymentRow {
  id: number;
  amount_minor: number;
  method: string;
  reference: string | null;
  sale_id: number | null;
  payment_date: string;
}

export interface SnapshotItemRow {
  product_name_snapshot: string;
  quantity: number;
  unit_price_minor: number;
}

export interface ClientSnapshot {
  monthPurchasesMinor: number;
  monthPaymentsMinor: number;
  /** Points INDICATIFS non échangeables (affichage seul, jamais de remise). */
  loyaltyPoints: number;
  lastSales: SnapshotSaleRow[];
  lastPayments: SnapshotPaymentRow[];
  topProducts: { name: string; quantity: number; lastPriceMinor: number }[];
}

/**
 * Cliché d'affichage : 3 dernières factures/paiements, totaux du mois
 * `monthKey` (AAAA-MM), Top 5 produits, points dérivés. Pur et testable ;
 * les soldes viennent du main (soldes calculés par les ventes, jamais ici).
 */
export function buildClientSnapshot(
  sales: SnapshotSaleRow[],
  payments: SnapshotPaymentRow[],
  items: SnapshotItemRow[],
  monthKey: string,
  totalPurchasesMinor: number,
): ClientSnapshot {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error("Mois invalide (AAAA-MM).");
  }
  assertSafeTotal(totalPurchasesMinor, "Total des achats invalide");
  const live = sales.filter((s) => s.is_cancelled !== 1);
  for (const s of live) {
    assertSafeTotal(s.total_minor, "Total de facture invalide");
    assertSafeTotal(s.remaining_balance_minor, "Reste de facture invalide");
  }
  for (const p of payments) assertSafeTotal(p.amount_minor, "Montant de paiement invalide");

  const byDateDesc = (rows: SnapshotSaleRow[]): SnapshotSaleRow[] =>
    [...rows].sort((a, b) =>
      a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
    );

  const monthPurchasesMinor = live
    .filter((s) => s.created_at.slice(0, 7) === monthKey)
    .reduce((a, s) => a + s.total_minor, 0);
  const monthPaymentsMinor = payments
    .filter((p) => p.payment_date.slice(0, 7) === monthKey)
    .reduce((a, p) => a + p.amount_minor, 0);
  assertSafeTotal(monthPurchasesMinor, "Total mensuel invalide");
  assertSafeTotal(monthPaymentsMinor, "Paiements mensuels invalides");

  const grouped = new Map<string, { quantity: number; lastPriceMinor: number }>();
  for (const it of items) {
    const name = it.product_name_snapshot.trim();
    if (!name) continue;
    const prev = grouped.get(name);
    grouped.set(name, {
      quantity: (prev?.quantity ?? 0) + it.quantity,
      lastPriceMinor: it.unit_price_minor,
    });
  }
  const topProducts = [...grouped.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  return {
    monthPurchasesMinor,
    monthPaymentsMinor,
    loyaltyPoints: Math.floor(totalPurchasesMinor / LOYALTY_MINOR_PER_POINT),
    lastSales: byDateDesc(live).slice(0, 3),
    lastPayments: [...payments]
      .sort((a, b) => (a.payment_date < b.payment_date ? 1 : -1))
      .slice(0, 3),
    topProducts,
  };
}

/** Annonce magasin : valide avant persistance (miroir DB 0032 identique). */
export function validateAnnouncement(text: string): string {
  assertValidAnnouncement(text);
  return text.trim();
}

/** Ligne de facture ouverte (pour la sélection des détails à pousser). */
export interface OpenSaleRow {
  id: number;
  is_cancelled: number;
  remaining_balance_minor: number;
}

/**
 * Factures dont le détail mérite d'être poussé vers le miroir (page détail
 * APK). Politique (bornée, egress du miroir maîtrisé) :
 *  - les `limit` PREMIÈRES factures non annulées de la liste — l'appelant les
 *    fournit du plus récent au plus ancien (`customers.statement` =
 *    `ORDER BY id DESC`) — SANS regarder le solde : une facture payée/clos
 *    doit rester consultable sur l'APK, sinon le client ne pourrait JAMAIS
 *    rouvrir son reçu (le bouton « Synchroniser » ne poussait que les
 *    factures ouvertes = l'erreur était irréparable depuis le magasin) ;
 *  - PLUS les factures encore ouvertes (solde restant > 0) au-delà de cette
 *    fenêtre récente, comme avant, plafonnées à `limit` elles aussi ;
 *  - annulées jamais poussées ; total borné à 2 × `limit` clichés.
 * Pur et testé ; l'enqueue reste best-effort côté main/dialogue.
 */
export function selectDetailSaleIds(sales: OpenSaleRow[], limit: number): number[] {
  const n = Math.trunc(limit);
  if (!Number.isSafeInteger(n) || n <= 0) return [];
  const ids: number[] = [];
  let recentCount = 0; // factures non annulées vues (fenêtre « plus récentes »)
  let openCount = 0; // factures ouvertes poussées (plafond propre)
  for (const s of sales) {
    if (!Number.isInteger(s.id) || s.id <= 0) continue;
    if (ids.includes(s.id)) continue; // jamais de doublon (cliché UNIQUE par vente)
    if (s.is_cancelled === 1) continue;
    recentCount += 1;
    const inRecentWindow = recentCount <= n;
    const open = Number.isSafeInteger(s.remaining_balance_minor) && s.remaining_balance_minor > 0;
    const withinOpenBudget = open && openCount < n;
    if (!inRecentWindow && !withinOpenBudget) continue;
    ids.push(s.id);
    if (open) openCount += 1;
  }
  return ids;
}
