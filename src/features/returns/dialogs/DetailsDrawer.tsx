// Veloria PoS — Retours : tiroir détail + création (client/fournisseur) + remboursement.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { multiplyMinorByQuantitySafe } from "@domain/money/money.ts";
import { useState } from "react";
import { Printer, ReceiptText, Undo2 } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { useCompany } from "@shared/company/use-company.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { buildCompanyHead } from "@shared/documents/sale-ticket.ts";

import { newOperationId } from "@domain/common/ids.ts";
import { timbreQuittanceLf2025 } from "@domain/invoice/timbre-rules.ts";
import { roundQuantity } from "@domain/common/quantity.ts";
import { formatCustomerCode, formatDzdSafe } from "@shared/formatters/format.ts";

import { Badge, Button, Card, Drawer, InfoRow, Modal } from "@shared/ui/primitives.tsx";
import {
  conditionLabel,
  returnKindLabel,
  returnNumber,
  returnStatusLabel,
  returnStatusTone,
  type ReturnDetailData,
  type ReturnKind,
  type ReturnRow,
} from "../types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

// ---------------------------------------------------------------------------
// Tiroir de détail retour.
// ---------------------------------------------------------------------------

export function ReturnDetailsDrawer({
  kind,
  data,
  onClose,
  onRefund,
  onChanged,
  notify,
}: {
  kind: ReturnKind;
  data: ReturnDetailData;
  onClose: () => void;
  onRefund: (r: ReturnRow) => void;
  onChanged: () => void;
  notify: Notify;
}): React.JSX.Element {
  const h = data.header;
  const num = returnNumber(
    kind,
    typeof h["return_number"] === "string" ? h["return_number"] : null,
    Number(h["id"] ?? 0),
  );
  const total = Number(h["total_return_value_minor"] ?? 0);
  const settled =
    kind === "customer"
      ? Number(h["amount_refunded_minor"] ?? 0) + Number(h["credit_to_customer_minor"] ?? 0)
      : Number(h["amount_recovered_minor"] ?? 0);
  const [ticket, setTicket] = useState<{
    text80: string;
    html80: string;
    payload: Record<string, unknown>;
  } | null>(null);
  // Bon de retour dédié (previewReturnSlip/printReturnSlip) : ticket uniquement.
  const [slip, setSlip] = useState<{
    text80: string;
    payload: Record<string, unknown>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  // Fiche entreprise : source unique partagée (ticket).
  const { record: companyRecord } = useCompany();
  // Confirmation non bloquante (modale applicative).
  const confirmAsync = useConfirm();
  const cancelled = h["status"] === "cancelled";

  const stockLines = data.items.filter((l) => l.stock_before != null && l.stock_after != null);
  const stockBefore = stockLines.reduce((a, l) => a + Number(l.stock_before ?? 0), 0);
  const stockAfter = stockLines.reduce((a, l) => a + Number(l.stock_after ?? 0), 0);
  const qtyReturned = data.items.reduce((a, l) => a + Number(l.quantity), 0);

  async function openTicket(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const co = companyRecord;
      const party = data.party ?? {};
      const partyId =
        typeof party["id"] === "number"
          ? party["id"]
          : typeof h["customer_id"] === "number"
            ? h["customer_id"]
            : typeof h["supplier_id"] === "number"
              ? h["supplier_id"]
              : 0;
      const refOf = (v: unknown): string =>
        typeof v === "number" && v > 0 ? String(v).padStart(5, "0") : "—";
      const payload: Record<string, unknown> = {
        ...buildCompanyHead(
          co
            ? {
                company_name: co["company_name"],
                phone: co["phone"],
                address: co["address"],
                city: co["city"],
                email: co["email"],
                rc_number: co["rc_number"] ?? co["commercial_register"],
                nif: co["nif"],
                nis: co["nis"],
                article_imposition: co["article_imposition"],
              }
            : null,
        ),
        customerName: partyName(),
        customerPhone: typeof party["phone"] === "string" ? party["phone"] : "",
        customerAddress: typeof party["address"] === "string" ? party["address"] : "",
        customerCode:
          kind === "customer"
            ? partyId > 0
              ? formatCustomerCode(partyId)
              : ""
            : typeof party["code"] === "string"
              ? party["code"]
              : "",
        paymentMethod:
          kind === "customer"
            ? typeof h["refund_method"] === "string"
              ? h["refund_method"]
              : null
            : typeof h["recovery_method"] === "string"
              ? h["recovery_method"]
              : null,
        invoice: num,
        date: new Date(String(h["created_at"] ?? Date.now())).toLocaleString("fr-FR"),
        lines: data.items.map((l) => ({
          name: String(l.product_name_snapshot),
          qty: Number(l.quantity),
          unit: "",
          unitPriceMinor: Number(l.unit_price_minor),
          lineTotalMinor: Number(l.line_total_minor),
          ref: refOf(l.product_id),
        })),
        subtotalMinor: total,
        discountMinor: 0,
        deliveryMinor: 0,
        totalMinor: total,
        paidMinor: settled,
        // C5 : timbre documentaire LF 2025 sur le remboursé espèces.
        stampMinor: timbreQuittanceLf2025(
          settled,
          (kind === "customer" ? h["refund_method"] : h["recovery_method"]) === "cash"
            ? "cash"
            : null,
        ),
      };
      const pv = (await api.printPreview(payload)) as { text80: string; html80?: unknown };
      setTicket({
        text80: pv.text80,
        html80: typeof pv.html80 === "string" ? pv.html80 : "",
        payload,
      });
    } catch (e) {
      notify(frError(e, "Aperçu indisponible."), "err");
    } finally {
      setBusy(false);
    }
  }

  function partyName(): string {
    const p = data.party;
    if (!p) return "—";
    const name = p["name"] ?? p["search_name"];
    return typeof name === "string" ? name : "—";
  }

  async function printTicket(): Promise<void> {
    if (!ticket) return;
    try {
      // Retour = ticket uniquement (jamais A4).
      await api.printReceipt(ticket.payload);
      notify("Ticket envoyé.", "ok");
    } catch (e) {
      notify(frError(e, "Impression impossible."), "err");
    }
  }

  // Bon de retour dédié (`printing.previewReturnSlip/printReturnSlip`) :
  // mêmes lignes que le ticket + numéro de retour, motif et montant remboursé.
  async function openReturnSlip(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const co = companyRecord;
      const party = data.party ?? {};
      const methodRaw = kind === "customer" ? h["refund_method"] : h["recovery_method"];
      const paymentMethod =
        methodRaw === "cash" || methodRaw === "cheque" || methodRaw === "transfer"
          ? methodRaw
          : null;
      const refunded =
        kind === "customer"
          ? Number(h["amount_refunded_minor"] ?? 0)
          : Number(h["amount_recovered_minor"] ?? 0);
      // Lignes retotalisées (ligne = prix × qté) pour la cohérence exigée
      // par le main ; lignes invalides ignorées.
      const lines: {
        name: string;
        qty: number;
        unit: string;
        unitPriceMinor: number;
        lineTotalMinor: number;
        ref: string;
      }[] = [];
      for (const l of data.items) {
        const qty = roundQuantity(Number(l.quantity));
        const unit = Math.round(Number(l.unit_price_minor));
        if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unit) || unit < 0) continue;
        lines.push({
          name: String(l.product_name_snapshot),
          qty,
          unit: "",
          unitPriceMinor: unit,
          lineTotalMinor: multiplyMinorByQuantitySafe(unit, qty),
          ref:
            typeof l.product_id === "number" && l.product_id > 0
              ? String(l.product_id).padStart(5, "0")
              : "—",
        });
      }
      if (lines.length === 0) {
        notify("Aucune ligne à imprimer.", "err");
        return;
      }
      const subtotal = lines.reduce((a, l) => a + l.lineTotalMinor, 0);
      const rawDate = String(h["created_at"] ?? "");
      const dd = rawDate === "" ? new Date(Date.now()) : new Date(rawDate);
      const payload: Record<string, unknown> = {
        ...buildCompanyHead(
          co
            ? {
                company_name: co["company_name"],
                phone: co["phone"],
                address: co["address"],
                city: co["city"],
                email: co["email"],
                rc_number: co["rc_number"] ?? co["commercial_register"],
                nif: co["nif"],
                nis: co["nis"],
                article_imposition: co["article_imposition"],
              }
            : null,
        ),
        customerName: partyName(),
        customerPhone: typeof party["phone"] === "string" ? party["phone"] : "",
        customerAddress: typeof party["address"] === "string" ? party["address"] : "",
        customerCode: "",
        paymentMethod,
        invoice: String(h["original_invoice_number"] ?? h["intake_invoice_number"] ?? num),
        date: Number.isNaN(dd.getTime()) ? rawDate.slice(0, 10) : dd.toLocaleString("fr-FR"),
        lines,
        subtotalMinor: subtotal,
        discountMinor: 0,
        deliveryMinor: 0,
        totalMinor: subtotal,
        paidMinor: settled,
        returnNumber: num,
        originNumber: String(h["original_invoice_number"] ?? h["intake_invoice_number"] ?? ""),
        reason: typeof h["reason"] === "string" ? h["reason"] : "",
        refundMinor: Number.isFinite(refunded) && refunded > 0 ? Math.round(refunded) : 0,
      };
      const pv = (await api.returnSlipPreview(payload)) as {
        text80: string;
      };
      setSlip({ text80: pv.text80, payload });
    } catch (e) {
      notify(frError(e, "Aperçu indisponible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function printReturnSlip(): Promise<void> {
    if (!slip || busy) return;
    setBusy(true);
    try {
      await api.returnSlipPrint(slip.payload);
      notify("Bon de retour envoyé.", "ok");
    } catch (e) {
      notify(frError(e, "Impression impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(): Promise<void> {
    if (!(await confirmAsync(`Annuler le retour ${num} ? Stock et soldes restaurés.`))) return;
    setBusy(true);
    try {
      await api.returnCancel({ kind, id: Number(h["id"] ?? 0), operationId: newOperationId() });
      notify("Retour annulé.", "ok");
      onChanged();
      onClose();
    } catch (e) {
      notify(frError(e, "Annulation impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  const toRow = (): ReturnRow => ({
    kind,
    entity_id: Number(h["id"] ?? 0),
    number: typeof h["return_number"] === "string" ? h["return_number"] : null,
    created_at: String(h["created_at"] ?? ""),
    ref: String(h["original_invoice_number"] ?? h["intake_invoice_number"] ?? ""),
    party_name: partyName(),
    total_minor: total,
    settled_minor: settled,
    status: h["status"] as ReturnRow["status"],
    stock_qty: qtyReturned,
  });

  return (
    <>
      <Drawer label={num} title={num} sub={returnKindLabel(kind)} onClose={onClose}>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={kind === "customer" ? "blue" : "amber"}>{returnKindLabel(kind)}</Badge>
          <Badge tone={returnStatusTone(String(h["status"] ?? ""))}>
            {returnStatusLabel(String(h["status"] ?? ""))}
          </Badge>
        </div>

        <Card className="space-y-2.5 p-4 text-sm">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Retour
          </div>
          <InfoRow label="Numéro" value={num} />
          <InfoRow label="Date" value={String(h["created_at"] ?? "").slice(0, 10)} num />
          <InfoRow label="Type" value={returnKindLabel(kind)} />
          <InfoRow
            label="Référence"
            value={String(h["original_invoice_number"] ?? h["intake_invoice_number"] ?? "—")}
          />
          <InfoRow label="Motif" value={String(h["reason"] ?? "—")} />
        </Card>

        <Card className="space-y-2.5 p-4 text-sm">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            {kind === "customer" ? "Client" : "Fournisseur"}
          </div>
          <InfoRow label="Nom" value={partyName()} />
        </Card>

        <Card className="space-y-2 p-4 text-sm">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Articles ({data.items.length})
          </div>
          <table className="w-full text-xs">
            <thead className="text-left uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="py-1 pr-2">Produit</th>
                <th className="py-1 pr-2 text-right">Qté</th>
                <th className="py-1 pr-2 text-right">Prix unit.</th>
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((l, idx) => (
                <tr
                  key={`${typeof l.product_id === "number" ? l.product_id : "m"}-${idx}`}
                  className="border-t border-white/[0.06]"
                >
                  <td className="py-1 pr-2">
                    {l.product_name_snapshot}
                    <span className="block text-[11px] text-slate-500">
                      {conditionLabel(l.condition)}
                      {l.restocked === 0 ? " · non restocké" : ""}
                    </span>
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">{l.quantity}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {formatDzdSafe(l.unit_price_minor)}
                  </td>
                  <td className="py-1 text-right font-bold tabular-nums">
                    {formatDzdSafe(l.line_total_minor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="space-y-2.5 p-4 text-sm">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Montants
          </div>
          <InfoRow label="Total retour" value={formatDzdSafe(total)} num />
          {kind === "customer" ? (
            <>
              <InfoRow
                label="Remboursé"
                value={formatDzdSafe(h["amount_refunded_minor"] ?? 0)}
                num
              />
              <InfoRow
                label="Avoir client"
                value={formatDzdSafe(h["credit_to_customer_minor"] ?? 0)}
                num
              />
            </>
          ) : (
            <InfoRow label="Récupéré" value={formatDzdSafe(h["amount_recovered_minor"] ?? 0)} num />
          )}
          <InfoRow label="Reste" value={formatDzdSafe(total - settled)} num />
        </Card>

        {stockLines.length > 0 ? (
          <Card className="space-y-2.5 p-4 text-sm">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Impact stock
            </div>
            <InfoRow label="Avant" value={String(stockBefore)} num />
            <InfoRow
              label="Quantité retournée"
              value={`${kind === "customer" ? "+" : "−"}${qtyReturned}`}
              num
            />
            <InfoRow label="Après" value={String(stockAfter)} num />
          </Card>
        ) : null}

        <Button variant="secondary" onClick={() => void openTicket()} disabled={busy}>
          <ReceiptText size={15} aria-hidden="true" /> {busy ? "Chargement…" : "Imprimer le retour"}
        </Button>
        <Button variant="secondary" onClick={() => void openReturnSlip()} disabled={busy}>
          <Printer size={15} aria-hidden="true" /> {busy ? "Chargement…" : "Bon de retour (aperçu)"}
        </Button>
        {!cancelled && settled === 0 ? (
          <Button variant="secondary" onClick={() => void cancel()} disabled={busy}>
            <Undo2 size={15} aria-hidden="true" /> Annuler le retour
          </Button>
        ) : !cancelled ? (
          <Button variant="secondary" onClick={() => onRefund(toRow())}>
            Rembourser le solde ({formatDzdSafe(total - settled)})
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onClose} className="w-full">
          Fermer
        </Button>
      </Drawer>

      {ticket ? (
        <Modal label="Bon de retour" title={`Bon ${num}`} onClose={() => setTicket(null)} wide>
          {ticket.html80 !== "" ? (
            <iframe
              sandbox=""
              srcDoc={ticket.html80}
              title={`Aperçu ticket retour ${num}`}
              className="h-[50vh] w-full rounded-xl border border-white/10 bg-white"
            />
          ) : (
            <pre
              className="h-[50vh] overflow-auto rounded-xl border border-white/10 bg-white p-4 font-mono text-[12px] leading-snug text-black"
              aria-label={`Aperçu ticket retour ${num}`}
            >
              {ticket.text80}
            </pre>
          )}
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => void printTicket()} className="flex-1">
              <Printer size={15} aria-hidden="true" /> Imprimer le ticket
            </Button>
          </div>
        </Modal>
      ) : null}

      {slip ? (
        <Modal
          label="Bon de retour"
          title={`Bon de retour ${num}`}
          onClose={() => setSlip(null)}
          wide
        >
          <pre
            className="h-[50vh] overflow-auto rounded-xl border border-white/10 bg-white p-4 font-mono text-[12px] leading-snug text-black"
            aria-label="Aperçu bon de retour 58/80 mm"
          >
            {slip.text80}
          </pre>
          <div className="mt-3 flex gap-2">
            <Button
              variant="secondary"
              onClick={() => void printReturnSlip()}
              disabled={busy}
              className="flex-1"
            >
              <Printer size={15} aria-hidden="true" /> Imprimer le bon
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
