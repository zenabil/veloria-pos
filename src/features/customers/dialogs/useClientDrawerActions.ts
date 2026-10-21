// Veloria PoS — Clients : impressions + reçus + archivage de la fiche 360.
// Extrait de `ClientDetailsDrawer` (découpage sans changement de comportement).
import { useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { buildSaleTicketPayload } from "@shared/documents/sale-ticket.ts";
import { returnNumber } from "@features/returns/types.ts";
import { formatCustomerCode, formatDateTimeFr } from "@shared/formatters/format.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { asCreatedAt } from "../client-matching.ts";
import { multiplyMinorByQuantitySafe, toMinorSafe } from "@domain/money/money.ts";
import { fullName, type EnrichedCustomer } from "../types.ts";
import type { PaymentTicketInput } from "@shared/documents/payment-preview.tsx";
import type { Notify } from "@shared/ui/primitives.tsx";
import type { SlipState } from "./types.ts";

/** Impression directe, reçus, bons de retour, archivage/restauration. */
export function useClientDrawerActions({
  customer,
  clientName,
  notify,
  onChanged,
  onClose,
}: {
  customer: EnrichedCustomer;
  clientName: string;
  notify: Notify;
  onChanged: () => void;
  onClose: () => void;
}): {
  printId: number | null;
  printDirect: (saleId: number) => Promise<void>;
  receiptTicket: PaymentTicketInput | null;
  setReceiptTicket: (t: PaymentTicketInput | null) => void;
  receiptBusyId: number | null;
  openReceipt: (paymentId: number) => Promise<void>;
  slip: SlipState | null;
  setSlip: (s: SlipState | null) => void;
  slipBusyKey: string | null;
  slipBusy: boolean;
  openSlip: (kind: string, entityId: number) => Promise<void>;
  printSlip: () => Promise<void>;
  busy: boolean;
  remove: () => Promise<void>;
  restore: () => Promise<void>;
} {
  // Impression directe d'une ligne facture (bouton « Imprimer »).
  const [printId, setPrintId] = useState<number | null>(null);
  // Reçu d'une ligne paiement (soldes reconstitués, jamais inventés).
  const [receiptTicket, setReceiptTicket] = useState<PaymentTicketInput | null>(null);
  const [receiptBusyId, setReceiptBusyId] = useState<number | null>(null);
  // Bon de retour d'une ligne retours (aperçu + impression ticket uniquement).
  const [slip, setSlip] = useState<SlipState | null>(null);
  const [slipBusyKey, setSlipBusyKey] = useState<string | null>(null);
  const [slipBusy, setSlipBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirmAsync = useConfirm();

  /** Impression directe 80mm d'une facture (sans passer par l'aperçu). */
  async function printDirect(saleId: number): Promise<void> {
    if (printId != null) return;
    setPrintId(saleId);
    try {
      const d = (await api.saleGet({ id: saleId })) as {
        sale: Record<string, string | number | null>;
        items: Record<string, string | number | null>[];
      };
      let co: Record<string, string> | null = null;
      try {
        const cg = (await api.companyGet()) as { company: Record<string, string> | null };
        co = cg.company;
      } catch {
        /* repli "Veloria" du builder */
      }
      const customerId = typeof d.sale["customer_id"] === "number" ? d.sale["customer_id"] : 0;
      let beneficiary: {
        search_name: string;
        phone: string | null;
        address: string | null;
      } | null = null;
      if (customerId > 0) {
        try {
          const st = (await api.customerStatement({ id: customerId })) as {
            customer: { search_name: string; phone: string | null; address: string | null };
          };
          beneficiary = st.customer;
        } catch {
          /* impression sans coordonnées plutôt que pas d'impression */
        }
      }
      await api.printReceipt(buildSaleTicketPayload(d, co, beneficiary, customerId));
      notify("Ticket envoyé.", "ok");
    } catch (e) {
      notify(frError(e, "Impression impossible."), "err");
    } finally {
      setPrintId(null);
    }
  }

  /** Reçu d'une ligne paiement : soldes reconstitués côté main (jamais inventés). */
  async function openReceipt(paymentId: number): Promise<void> {
    if (receiptBusyId != null) return;
    setReceiptBusyId(paymentId);
    try {
      const r = (await api.customerPaymentReceipt({ id: paymentId })) as {
        payment: Record<string, unknown>;
        customer: Record<string, unknown>;
        prevBalanceMinor: number;
        newBalanceMinor: number;
      };
      const p = r.payment;
      const methodRaw = typeof p["method"] === "string" ? p["method"] : "";
      const method: "cash" | "cheque" | "transfer" | null =
        methodRaw === "cash" || methodRaw === "cheque" || methodRaw === "transfer"
          ? methodRaw
          : null;
      const dateRaw = typeof p["payment_date"] === "string" ? p["payment_date"] : "";
      setReceiptTicket({
        kind: "customer",
        partyLabel: `${clientName} — ${formatCustomerCode(customer.id)}`,
        reference: typeof p["reference"] === "string" ? p["reference"] : "",
        date: dateRaw !== "" ? dateRaw : formatDateTimeFr(asCreatedAt(p)),
        amountMinor: toMinorSafe(p["amount_minor"]),
        method,
        prevBalanceMinor: toMinorSafe(r.prevBalanceMinor),
        newBalanceMinor: toMinorSafe(r.newBalanceMinor),
        notes: typeof p["notes"] === "string" ? p["notes"] : "",
      });
    } catch (e) {
      notify(frError(e, "Reçu indisponible."), "err");
    } finally {
      setReceiptBusyId(null);
    }
  }

  /** Bon de retour d'une ligne retours (aperçu A4/80mm + impression). */
  async function openSlip(kind: string, entityId: number): Promise<void> {
    const key = `${kind}:${entityId}`;
    if (slipBusyKey != null) return;
    setSlipBusyKey(key);
    try {
      const rk = kind === "supplier" ? "supplier" : "customer";
      const d = (await api.returnDetail({ kind: rk, id: entityId })) as {
        header: Record<string, unknown>;
        items: Record<string, unknown>[];
        party: Record<string, unknown> | null;
      };
      let co: Record<string, string> | null = null;
      try {
        const cg = (await api.companyGet()) as { company: Record<string, string> | null };
        co = cg.company;
      } catch {
        /* repli "Veloria" côté main */
      }
      const h = d.header;
      const num =
        typeof h["return_number"] === "string" && h["return_number"] !== ""
          ? h["return_number"]
          : returnNumber(rk, typeof h["number"] === "string" ? h["number"] : null, entityId);
      const lines: Record<string, unknown>[] = [];
      for (const it of d.items) {
        const qty =
          typeof it["quantity"] === "number" ? it["quantity"] : Number(it["quantity"] ?? 0);
        const unit =
          typeof it["unit_price_minor"] === "number"
            ? it["unit_price_minor"]
            : Number(it["unit_price_minor"] ?? 0);
        if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(unit) || unit < 0) continue;
        const pid = typeof it["product_id"] === "number" ? it["product_id"] : null;
        lines.push({
          name:
            typeof it["product_name_snapshot"] === "string"
              ? it["product_name_snapshot"]
              : "Article",
          qty,
          unit: "",
          unitPriceMinor: unit,
          lineTotalMinor: multiplyMinorByQuantitySafe(unit, qty),
          ref: pid != null && pid > 0 ? String(pid).padStart(5, "0") : "—",
        });
      }
      if (lines.length === 0) {
        notify("Aucune ligne à imprimer.", "err");
        return;
      }
      const total = toMinorSafe(h["total_return_value_minor"]);
      const refund = toMinorSafe(h["amount_refunded_minor"] ?? h["amount_recovered_minor"] ?? 0);
      const payload: Record<string, unknown> = {
        company: co?.["company_name"] ?? "Veloria",
        companyPhone: co?.["phone"] ?? "",
        companyAddress: co?.["address"] ?? "",
        companyCity: co?.["city"] ?? "",
        companyEmail: co?.["email"] ?? "",
        companyRc: co?.["rc_number"] ?? "",
        companyNif: co?.["nif"] ?? "",
        customerName: rk === "customer" ? clientName : "",
        invoice: num,
        date: formatDateTimeFr(asCreatedAt(h)),
        lines,
        subtotalMinor: total,
        discountMinor: 0,
        deliveryMinor: 0,
        totalMinor: total,
        paidMinor: 0,
        returnNumber: num,
        reason: typeof h["reason"] === "string" ? h["reason"] : "",
        refundMinor: refund,
      };
      const pv = (await api.returnSlipPreview(payload)) as { text80: string };
      setSlip({ payload, text80: pv.text80, title: `Bon de retour ${num}` });
    } catch (e) {
      notify(frError(e, "Bon de retour indisponible."), "err");
    } finally {
      setSlipBusyKey(null);
    }
  }

  async function printSlip(): Promise<void> {
    if (!slip || slipBusy) return;
    setSlipBusy(true);
    try {
      // Retour = ticket uniquement (jamais A4).
      await api.returnSlipPrint(slip.payload);
      notify("Bon de retour envoyé.", "ok");
    } catch (e) {
      notify(frError(e, "Impression impossible."), "err");
    } finally {
      setSlipBusy(false);
    }
  }

  async function remove(): Promise<void> {
    if (!(await confirmAsync(`Archiver « ${fullName(customer)} » ? Historique conservé.`))) return;
    setBusy(true);
    try {
      await api.customerArchive({ id: customer.id, operationId: newOperationId() });
      notify("Client archivé.", "ok");
      onChanged();
      onClose();
    } catch (e) {
      notify(frError(e, "Archivage impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function restore(): Promise<void> {
    setBusy(true);
    try {
      await api.customerRestore({ id: customer.id, operationId: newOperationId() });
      notify("Client restauré.", "ok");
      onChanged();
      onClose();
    } catch (e) {
      notify(frError(e, "Restauration impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return {
    printId,
    printDirect,
    receiptTicket,
    setReceiptTicket,
    receiptBusyId,
    openReceipt,
    slip,
    setSlip,
    slipBusyKey,
    slipBusy,
    openSlip,
    printSlip,
    busy,
    remove,
    restore,
  };
}
