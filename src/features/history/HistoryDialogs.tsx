// Veloria PoS — Historique : tiroir détail + aperçu ticket (ventes).
// Branché sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useState } from "react";
import { Printer, ReceiptText, X } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { useCompany } from "@shared/company/use-company.ts";
import { formatDzd } from "@domain/money/money.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { buildSaleTicketPayload } from "@shared/documents/sale-ticket.ts";
import { Badge, Button, Card, Drawer, InfoRow, Modal } from "@shared/ui/primitives.tsx";
import { KIND_LABELS, kindTone, splitDateTime, type HistoryDetail } from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { playSound } from "@shared/sound/sound.ts";

export function HistoryDetailsDrawer({
  detail,
  onClose,
  onChanged,
  notify,
}: {
  detail: HistoryDetail;
  onClose: () => void;
  onChanged: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [ticket, setTicket] = useState<{
    htmlA4: string;
    text80: string;
    payload: Record<string, unknown>;
  } | null>(null);
  // Requête 3 : aperçu double format (Ticket 80mm + Facture A4).
  const [ticketFormat, setTicketFormat] = useState<"80mm" | "A4">("A4");
  const [ticketBusy, setTicketBusy] = useState(false);
  // Bon de livraison (previewDelivery/printDelivery) : aperçu vivant A4/80mm.
  const [delivery, setDelivery] = useState<{
    htmlA4: string;
    text80: string;
    payload: Record<string, unknown>;
  } | null>(null);
  const [deliveryFormat, setDeliveryFormat] = useState<"80mm" | "A4">("A4");
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const confirmAsync = useConfirm();
  // Fiche entreprise : source unique partagée (ticket).
  const { record: companyRecord } = useCompany();
  const { date, time } = splitDateTime(detail.createdAt);

  // Payload ticket canonique partagé (ticket + bon de livraison).
  async function loadTicketPayload(): Promise<Record<string, unknown>> {
    const d = (await api.saleGet({ id: detail.ticketSaleId })) as {
      sale: Record<string, string | number | null>;
      items: Record<string, string | number | null>[];
    };
    const co = companyRecord;
    const customerId = typeof d.sale["customer_id"] === "number" ? d.sale["customer_id"] : 0;
    let customer: {
      search_name: string;
      phone: string | null;
      address: string | null;
    } | null = null;
    if (customerId > 0) {
      try {
        const st = (await api.customerStatement({ id: customerId })) as {
          customer: {
            search_name: string;
            phone: string | null;
            address: string | null;
            outstanding_balance_minor: number;
          };
        };
        customer = st.customer;
      } catch {
        /* ticket sans coordonnées plutôt que pas de ticket */
      }
    }
    return buildSaleTicketPayload(d, co, customer, customerId);
  }

  async function openTicket(): Promise<void> {
    if (detail.ticketSaleId == null || ticketBusy) return;
    setTicketBusy(true);
    try {
      const payload = await loadTicketPayload();
      const pv = (await api.printPreview(payload)) as { text80: string; htmlA4: string };
      setTicket({ htmlA4: pv.htmlA4, text80: pv.text80, payload });
      setTicketFormat("A4");
    } catch (e) {
      notify(frError(e, "Aperçu indisponible."), "err");
    } finally {
      setTicketBusy(false);
    }
  }

  async function printTicket(mode: "80mm" | "A4"): Promise<void> {
    if (!ticket) return;
    try {
      if (mode === "A4") await api.printA4(ticket.payload);
      else await api.printReceipt(ticket.payload);
      // P5 : impression = papier.
      playSound("print");
      notify(mode === "A4" ? "Facture A4 envoyée." : "Ticket envoyé.", "ok");
    } catch (e) {
      notify(frError(e, "Impression impossible."), "err");
    }
  }

  // Bon de livraison : même payload que le ticket + facture d'origine.
  // Aperçu vivant A4/80mm, impression A4 ou thermique.
  async function openDelivery(): Promise<void> {
    if (detail.ticketSaleId == null || deliveryBusy) return;
    setDeliveryBusy(true);
    try {
      const base = ticket ? ticket.payload : await loadTicketPayload();
      const origin =
        typeof base["invoice"] === "string" && base["invoice"] !== ""
          ? base["invoice"]
          : detail.reference;
      const payload: Record<string, unknown> = {
        ...base,
        originNumber: origin,
      };
      const pv = (await api.deliveryPreview(payload)) as { text80: string; htmlA4: string };
      setDelivery({ htmlA4: pv.htmlA4, text80: pv.text80, payload });
      setDeliveryFormat("A4");
    } catch (e) {
      notify(frError(e, "Aperçu indisponible."), "err");
    } finally {
      setDeliveryBusy(false);
    }
  }

  async function printDelivery(mode: "80mm" | "A4"): Promise<void> {
    if (!delivery || deliveryBusy) return;
    setDeliveryBusy(true);
    try {
      await api.deliveryPrint(
        mode === "A4" ? { ...delivery.payload, format: "A4" } : delivery.payload,
      );
      // P5 : impression = papier.
      playSound("print");
      notify(mode === "A4" ? "Bon de livraison A4 envoyé." : "Bon de livraison 80mm envoyé.", "ok");
    } catch (e) {
      notify(frError(e, "Impression impossible."), "err");
    } finally {
      setDeliveryBusy(false);
    }
  }

  // Annulation de vente (canal `sales.cancel`, atomique : stock + couches +
  // solde restaurés). Réservée aux ventes validées affichées ici.
  async function cancelSale(): Promise<void> {
    if (detail.ticketSaleId == null || cancelBusy) return;
    if (
      !(await confirmAsync(
        `Annuler la vente ${detail.reference} ? Stock, soldes et couches FIFO restaurés.`,
      ))
    )
      return;
    setCancelBusy(true);
    try {
      await api.saleCancel({ id: detail.ticketSaleId, operationId: newOperationId() });
      notify(`Vente ${detail.reference} annulée.`, "ok");
      onChanged();
      onClose();
    } catch (e) {
      notify(frError(e, "Annulation impossible."), "err");
    } finally {
      setCancelBusy(false);
    }
  }

  return (
    <>
      <Drawer
        label={detail.title}
        title={detail.title}
        above={
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={kindTone(detail.kind)}>{KIND_LABELS[detail.kind]}</Badge>
            <Badge tone="grey">{detail.status}</Badge>
          </div>
        }
        onClose={onClose}
      >
        <Card className="space-y-2.5 p-4 text-sm">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Opération
          </div>
          <InfoRow label="Date" value={date} num />
          <InfoRow label="Heure" value={time} num />
          <InfoRow label="Type" value={KIND_LABELS[detail.kind]} />
          <InfoRow label="Référence" value={detail.reference} />
          <InfoRow label="Utilisateur" value={detail.user} />
        </Card>

        {detail.entity ? (
          <Card className="space-y-2.5 p-4 text-sm">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Entité
            </div>
            <InfoRow label="Type" value={detail.entity.type} />
            <InfoRow label="Nom" value={detail.entity.name} />
            <InfoRow label="Identifiant" value={`#${detail.entity.id}`} num />
          </Card>
        ) : null}

        {detail.financial ? (
          <Card className="space-y-2.5 p-4 text-sm">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Montant
            </div>
            <div className="text-2xl font-extrabold tabular-nums tracking-tight text-amber-300">
              {formatDzd(detail.financial.amount)}
            </div>
            {detail.financial.method ? (
              <InfoRow label="Paiement" value={detail.financial.method} />
            ) : null}
            {detail.financial.extra ? (
              <p className="text-xs tabular-nums text-slate-400">{detail.financial.extra}</p>
            ) : null}
          </Card>
        ) : null}

        {detail.stock ? (
          <Card className="space-y-2.5 p-4 text-sm">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Stock
            </div>
            <InfoRow label="Avant" value={String(detail.stock.before)} num />
            <InfoRow
              label="Variation"
              value={`${detail.stock.delta >= 0 ? "+" : ""}${detail.stock.delta}`}
              num
            />
            <InfoRow label="Après" value={String(detail.stock.after)} num />
          </Card>
        ) : null}

        {detail.ticketSaleId != null ? (
          <Button variant="secondary" onClick={() => void openTicket()} disabled={ticketBusy}>
            <ReceiptText size={15} aria-hidden="true" />{" "}
            {ticketBusy ? "Chargement…" : "Voir le document (ticket)"}
          </Button>
        ) : null}
        {detail.ticketSaleId != null ? (
          <Button variant="secondary" onClick={() => void openDelivery()} disabled={deliveryBusy}>
            <ReceiptText size={15} aria-hidden="true" />{" "}
            {deliveryBusy ? "Chargement…" : "Bon de livraison"}
          </Button>
        ) : null}
        {detail.kind === "sale" && detail.ticketSaleId != null && detail.status !== "Annulée" ? (
          <Button
            variant="secondary"
            onClick={() => void cancelSale()}
            disabled={cancelBusy}
            className="w-full"
          >
            {cancelBusy ? "Annulation…" : "Annuler la vente (stock et soldes restaurés)"}
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onClose} className="w-full">
          <X size={15} aria-hidden="true" /> Fermer
        </Button>
      </Drawer>

      {ticket ? (
        <Modal label="Ticket de vente" title="Ticket de vente" onClose={() => setTicket(null)} wide>
          <div className="mb-3 flex gap-1.5" role="tablist" aria-label="Format d'aperçu">
            {(["A4", "80mm"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={ticketFormat === f}
                onClick={() => setTicketFormat(f)}
                className={
                  ticketFormat === f
                    ? "rounded-lg bg-amber-400 px-4 py-1.5 text-xs font-bold text-black"
                    : "rounded-lg border border-white/10 px-4 py-1.5 text-xs font-bold text-slate-400 hover:text-white"
                }
              >
                {f === "A4" ? "Facture A4" : "Ticket 80mm"}
              </button>
            ))}
          </div>
          {ticketFormat === "A4" ? (
            <iframe
              sandbox=""
              srcDoc={ticket.htmlA4}
              title="Aperçu ticket"
              className="h-[50vh] w-full rounded-xl border border-white/10 bg-white"
            />
          ) : (
            <pre
              className="h-[50vh] overflow-auto rounded-xl border border-white/10 bg-white p-4 font-mono text-[12px] leading-snug text-black"
              aria-label="Aperçu ticket 80mm"
            >
              {ticket.text80}
            </pre>
          )}
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => void printTicket("80mm")} className="flex-1">
              <Printer size={15} aria-hidden="true" /> Ticket 80mm
            </Button>
            <Button variant="secondary" onClick={() => void printTicket("A4")} className="flex-1">
              <Printer size={15} aria-hidden="true" /> Facture A4
            </Button>
          </div>
        </Modal>
      ) : null}

      {delivery ? (
        <Modal
          label="Bon de livraison"
          title="Bon de livraison"
          onClose={() => setDelivery(null)}
          wide
        >
          <div className="mb-3 flex gap-1.5" role="tablist" aria-label="Format d'aperçu">
            {(["A4", "80mm"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={deliveryFormat === f}
                onClick={() => setDeliveryFormat(f)}
                className={
                  deliveryFormat === f
                    ? "rounded-lg bg-amber-400 px-4 py-1.5 text-xs font-bold text-black"
                    : "rounded-lg border border-white/10 px-4 py-1.5 text-xs font-bold text-slate-400 hover:text-white"
                }
              >
                {f === "A4" ? "Format A4" : "Ticket 80mm"}
              </button>
            ))}
          </div>
          {deliveryFormat === "A4" ? (
            <iframe
              sandbox=""
              srcDoc={delivery.htmlA4}
              title="Aperçu bon de livraison"
              className="h-[50vh] w-full rounded-xl border border-white/10 bg-white"
            />
          ) : (
            <pre
              className="h-[50vh] overflow-auto rounded-xl border border-white/10 bg-white p-4 font-mono text-[12px] leading-snug text-black"
              aria-label="Aperçu bon de livraison 80mm"
            >
              {delivery.text80}
            </pre>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              variant="secondary"
              onClick={() => void printDelivery("80mm")}
              disabled={deliveryBusy}
              className="flex-1"
            >
              <Printer size={15} aria-hidden="true" /> Imprimer 80mm
            </Button>
            <Button
              variant="secondary"
              onClick={() => void printDelivery("A4")}
              disabled={deliveryBusy}
              className="flex-1"
            >
              <Printer size={15} aria-hidden="true" /> Imprimer A4
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
