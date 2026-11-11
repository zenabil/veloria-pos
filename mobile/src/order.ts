// Veloria Client (APK) — Commande : message WhatsApp + référence locale (PUR).
//
// ADR-182 §10 : la commande part d'abord par **WhatsApp** (aucune écriture
// dans le cloud, fonctionne sur 100 % des appareils, y compris sans GMS).
//
// Deux règles que ce module tient :
//   1. le total est un **ESTIMÉ** (prix du catalogue au moment de l'ajout) et
//      le message le DIT — le prix fait foi est celui de la vente au comptoir ;
//   2. la référence est **locale** (`W-xxxxxx`) : la référence officielle
//      (`CMD-AAAA-NNNNNN`) est générée par le POS, seul master. Deux
//      numérotations ne doivent jamais cohabiter.
import { formatMinor } from "./format.ts";
import { t, type Lang } from "./i18n.ts";
import { cartTotalMinor, multiplyMinorByQuantity, type CartLine } from "./cart.ts";

/** Référence locale d'une tentative de commande (jamais la référence POS). */
export function localOrderReference(seed: number): string {
  const n = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) % 1_000_000 : 0;
  return `W-${String(n).padStart(6, "0")}`;
}

export interface OrderDraft {
  lang: Lang;
  /** Référence locale (`W-xxxxxx`). */
  reference: string;
  shopName: string;
  customerName: string;
  customerPhone: string;
  lines: readonly CartLine[];
  /** Préférence de retrait (« après 16 h »), libre. */
  note: string;
}

/** Une ligne de commande : « nom × qté — montant ». */
export function formatOrderLine(line: CartLine, lang: Lang): string {
  const qty = Number.isInteger(line.quantity)
    ? String(line.quantity)
    : String(line.quantity).replace(".", lang === "ar" ? "٫" : ".");
  const total = multiplyMinorByQuantity(line.priceMinor, line.quantity);
  return `${line.name} × ${qty} — ${formatMinor(total, lang)}`;
}

/**
 * Message de commande, structuré pour être lu d'un coup d'œil par le
 * commerçant (c'est sa boîte de réception). Les lignes sont numérotées, le
 * total est étiqueté « estimé », et la réserve est explicitée.
 */
export function buildOrderMessage(draft: OrderDraft): string {
  const l = draft.lang;
  const lines = draft.lines.map((line, i) => `${i + 1}. ${formatOrderLine(line, l)}`);
  const total = cartTotalMinor(draft.lines);
  const name = draft.customerName.trim() === "" ? "—" : draft.customerName.trim();
  const phone = draft.customerPhone.trim();
  const note = draft.note.trim();
  if (l === "ar") {
    return [
      `🧾 ${t(l, "orderTitle")} — ${draft.shopName.trim() === "" ? "Veloria" : draft.shopName.trim()}`,
      `${t(l, "orderRef")}: ${draft.reference}`,
      `${t(l, "orderCustomer")}: ${name}${phone === "" ? "" : ` — ${phone}`}`,
      "",
      ...lines,
      "",
      `${t(l, "orderTotalEstimated")}: ${formatMinor(total, l)}`,
      `⚠️ ${t(l, "orderEstimatedWarning")}`,
      `${t(l, "orderPickup")}: ${t(l, "orderPickupValue")}${note === "" ? "" : ` — ${note}`}`,
    ].join("\n");
  }
  return [
    `🧾 ${t(l, "orderTitle")} — ${draft.shopName.trim() === "" ? "Veloria" : draft.shopName.trim()}`,
    `${t(l, "orderRef")}: ${draft.reference}`,
    `${t(l, "orderCustomer")}: ${name}${phone === "" ? "" : ` — ${phone}`}`,
    "",
    ...lines,
    "",
    `${t(l, "orderTotalEstimated")}: ${formatMinor(total, l)}`,
    `⚠️ ${t(l, "orderEstimatedWarning")}`,
    `${t(l, "orderPickup")}: ${t(l, "orderPickupValue")}${note === "" ? "" : ` — ${note}`}`,
  ].join("\n");
}

/** Une commande déjà envoyée (historique local de l'appareil). */
export interface SentOrder {
  reference: string;
  /** Instants ISO d'envoi. */
  sentAt: string;
  /** Nombre d'articles envoyés. */
  count: number;
  /** Total estimé au moment de l'envoi. */
  totalMinor: number;
  /** Lignes envoyées (pour « renvoyer »). */
  lines: CartLine[];
  note: string;
}

/** Bornes de l'historique local (l'appareil ne stocke pas l'infini). */
export const SENT_ORDERS_MAX = 20;

/** Ajoute une commande à l'historique (le plus récent d'abord). */
export function pushSentOrder(list: readonly SentOrder[], order: SentOrder): SentOrder[] {
  return [order, ...list].slice(0, SENT_ORDERS_MAX);
}
