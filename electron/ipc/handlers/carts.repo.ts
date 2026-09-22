// Veloria PoS — Main-process repository: brouillons paniers caisse (P4).
// Persistance SQLite des onglets (jamais de LocalStorage pour du métier).
// Sauvegarde = remplacement en bloc en 1 tx ; lecture = lignes validées
// défensivement (un brouillon corrompu est ignoré, jamais de crash).

import { getDb } from "../../database/sqlite.service";

export interface CartDraftLine {
  key: string;
  productId: number | null;
  productName: string;
  unitCode: string;
  originalUnitPriceMinor: number;
  unitPriceMinor: number;
  purchasePriceMinor: number;
  quantity: number;
}

export interface CartDraftTab {
  tabId: number;
  name: string;
  lines: CartDraftLine[];
  customerId: number | null;
  customerLabel: string;
  amountPaidMinor: number;
  paymentMethod: "cash" | "cheque" | "transfer" | null;
}

function cleanLine(l: CartDraftLine): CartDraftLine | null {
  if (typeof l.key !== "string" || l.key.length === 0 || l.key.length > 64) return null;
  if (typeof l.productName !== "string" || l.productName.trim().length === 0) return null;
  if (l.productId !== null && (!Number.isInteger(l.productId) || l.productId <= 0)) return null;
  for (const v of [l.originalUnitPriceMinor, l.unitPriceMinor, l.purchasePriceMinor]) {
    if (!Number.isInteger(v) || v < 0) return null;
  }
  if (!Number.isFinite(l.quantity) || l.quantity <= 0 || l.quantity > 1_000_000) return null;
  return {
    key: l.key,
    productId: l.productId,
    productName: l.productName.slice(0, 200),
    unitCode:
      typeof l.unitCode === "string" && l.unitCode.length > 0 ? l.unitCode.slice(0, 20) : "PIECE",
    originalUnitPriceMinor: l.originalUnitPriceMinor,
    unitPriceMinor: l.unitPriceMinor,
    purchasePriceMinor: l.purchasePriceMinor,
    quantity: Math.round(l.quantity * 1000) / 1000,
  };
}

export function saveCartDraftsAtomic(tabs: CartDraftTab[], now: string): { saved: number } {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM cart_drafts`).run();
    let saved = 0;
    for (const t of tabs) {
      if (!Number.isInteger(t.tabId) || t.tabId <= 0) continue;
      if (typeof t.name !== "string" || t.name.length === 0) continue;
      const lines: CartDraftLine[] = [];
      for (const l of Array.isArray(t.lines) ? t.lines : []) {
        const c = cleanLine(l);
        if (c) lines.push(c);
      }
      // Onglet vide sans client : rien à conserver (pas de bruit).
      if (lines.length === 0 && t.customerId == null) continue;
      const paid =
        Number.isInteger(t.amountPaidMinor) && t.amountPaidMinor >= 0 ? t.amountPaidMinor : 0;
      const method =
        t.paymentMethod === "cash" || t.paymentMethod === "cheque" || t.paymentMethod === "transfer"
          ? t.paymentMethod
          : null;
      const customerId =
        t.customerId != null && Number.isInteger(t.customerId) && t.customerId > 0
          ? t.customerId
          : null;
      // FK douce : client supprimé entre-temps → brouillon sans client (pas d'échec).
      let keptCustomer: number | null = customerId;
      let keptLabel =
        typeof t.customerLabel === "string" && t.customerLabel.length > 0
          ? t.customerLabel.slice(0, 100)
          : "Client de passage";
      if (keptCustomer != null) {
        const exists = db.prepare(`SELECT id FROM customers WHERE id = ?`).get(keptCustomer) as
          | { id: number }
          | undefined;
        if (!exists) {
          keptCustomer = null;
          keptLabel = "Client de passage";
        }
      }
      db.prepare(
        `INSERT INTO cart_drafts (tab_id, name, lines_json, customer_id, customer_label, amount_paid_minor, payment_method, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        t.tabId,
        t.name.slice(0, 40),
        JSON.stringify(lines),
        keptCustomer,
        keptLabel,
        paid,
        method,
        now,
      );
      saved += 1;
    }
    return { saved };
  });
  return (tx as unknown as () => { saved: number })();
}

export function loadCartDrafts(): CartDraftTab[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM cart_drafts ORDER BY tab_id ASC`).all() as Record<
    string,
    unknown
  >[];
  const out: CartDraftTab[] = [];
  for (const r of rows) {
    const tabId = Number(r["tab_id"]);
    if (!Number.isInteger(tabId) || tabId <= 0) continue;
    let lines: CartDraftLine[] = [];
    try {
      const parsed: unknown = JSON.parse(String(r["lines_json"] ?? "[]"));
      if (Array.isArray(parsed)) {
        for (const l of parsed as CartDraftLine[]) {
          const c = cleanLine(l);
          if (c) lines.push(c);
        }
      }
    } catch {
      continue;
    }
    if (lines.length === 0) continue;
    const paid = Number(r["amount_paid_minor"]);
    const method = String(r["payment_method"] ?? "");
    out.push({
      tabId,
      name: String(r["name"] ?? `Panier ${tabId}`).slice(0, 40),
      lines,
      customerId: r["customer_id"] == null ? null : Number(r["customer_id"]),
      customerLabel: String(r["customer_label"] ?? "Client de passage"),
      amountPaidMinor: Number.isInteger(paid) && paid >= 0 ? paid : 0,
      paymentMethod:
        method === "cash" || method === "cheque" || method === "transfer" ? method : null,
    });
  }
  return out;
}

export function clearCartDrafts(): { cleared: boolean } {
  const db = getDb();
  db.prepare(`DELETE FROM cart_drafts`).run();
  return { cleared: true };
}
