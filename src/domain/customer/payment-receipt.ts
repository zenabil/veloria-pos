// Veloria PoS — Domain: reçu de règlement historique (soldes reconstitués, pur).
// La table `sale_payments` ne stocke pas les soldes avant/après : ils sont
// reconstitués depuis le grand-livre (solde initial + ventes − paiements,
// ordre chronologique). Centimes entiers, jamais de float.

interface ReceiptSale {
  id: number;
  totalMinor: number;
  createdAt: string;
  cancelled: boolean;
}

interface ReceiptPayment {
  id: number;
  amountMinor: number;
  createdAt: string;
}

/**
 * Reconstitue les soldes d'un paiement historique.
 * Ordre : `createdAt` croissant, ventes avant paiements à égalité d'horodatage
 * (une dette existe avant son encaissement du même instant), `id` en départage.
 * Retourne null si la cible est introuvable ou si les montants sont invalides.
 */
export function computePaymentReceiptBalances(args: {
  initialMinor: number;
  sales: ReceiptSale[];
  payments: ReceiptPayment[];
  targetPaymentId: number;
}): { prevMinor: number; newMinor: number } | null {
  const { initialMinor, sales, payments, targetPaymentId } = args;
  if (!Number.isInteger(initialMinor) || initialMinor < 0) return null;
  type Evt =
    | { at: string; tie: number; seq: number; kind: "sale"; amount: number }
    | { at: string; tie: number; seq: number; kind: "pay"; id: number; amount: number };
  const evts: Evt[] = [];
  for (const s of sales) {
    if (s.cancelled) continue;
    if (!Number.isInteger(s.id) || s.id <= 0) return null;
    if (!Number.isInteger(s.totalMinor) || s.totalMinor < 0) return null;
    if (typeof s.createdAt !== "string" || s.createdAt === "") return null;
    evts.push({ at: s.createdAt, tie: 0, seq: s.id, kind: "sale", amount: s.totalMinor });
  }
  let targetFound = false;
  for (const p of payments) {
    if (!Number.isInteger(p.id) || p.id <= 0) return null;
    if (!Number.isInteger(p.amountMinor) || p.amountMinor <= 0) return null;
    if (typeof p.createdAt !== "string" || p.createdAt === "") return null;
    if (p.id === targetPaymentId) targetFound = true;
    evts.push({ at: p.createdAt, tie: 1, seq: p.id, kind: "pay", id: p.id, amount: p.amountMinor });
  }
  if (!targetFound) return null;
  evts.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.tie - b.tie || a.seq - b.seq));
  let balance = initialMinor;
  for (const e of evts) {
    if (e.kind === "sale") {
      balance += e.amount;
    } else if (e.id === targetPaymentId) {
      return { prevMinor: balance, newMinor: balance - e.amount };
    } else {
      balance -= e.amount;
    }
  }
  return null;
}
