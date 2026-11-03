// Veloria PoS — Historique : tiroir détail + aperçu ticket (ventes).
// Branché sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useState } from "react";
import { Pencil, Printer, ReceiptText, X } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { useCompany } from "@shared/company/use-company.ts";
import { formatDzd } from "@domain/money/money.ts";
import { formatDateFr } from "@shared/formatters/format.ts";
import { useContentOperationId } from "@shared/ui/use-operation-id.ts";
import { usePendingSaleEdit, type PendingSaleEdit } from "@shared/sales/pending-sale-edit.ts";
import { buildSaleTicketPayload } from "@shared/documents/sale-ticket.ts";
import { Badge, Button, Card, Drawer, InfoRow } from "@shared/ui/primitives.tsx";
import { DocumentPreviewModal } from "@shared/documents/DocumentPreviewModal.tsx";
import { KIND_LABELS, kindTone, splitDateTime, type HistoryDetail } from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { playSound } from "@shared/sound/sound.ts";

export function HistoryDetailsDrawer({
  detail,
  onClose,
  onChanged,
  notify,
  onNavigate,
}: {
  detail: HistoryDetail;
  onClose: () => void;
  onChanged: () => void;
  notify: Notify;
  onNavigate?: (module: "sell") => void;
}): React.JSX.Element {
  const [ticket, setTicket] = useState<{
    text80: string;
    html80: string;
    payload: Record<string, unknown>;
  } | null>(null);
  // Aperçu ticket uniquement (politique opération → format) — le chrome
  // partagé (DocumentPreviewModal) affiche un seul format.
  const [ticketBusy, setTicketBusy] = useState(false);
  // Bon de livraison (previewDelivery/printDelivery) : ticket uniquement.
  const [delivery, setDelivery] = useState<{
    text80: string;
    payload: Record<string, unknown>;
  } | null>(null);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [reopenBusy, setReopenBusy] = useState(false);
  // Idempotence par VENTE et par ACTION (jamais par clic) : `sales.cancel` et
  // `sales.reopen` annulent/retouchent stock, FIFO et soldes. Un retry après
  // réponse perdue doit REJOUER le résultat stocké, pas rejouer l'effet.
  // UN cache par opération : les deux s'ignorent mutuellement (cancel puis
  // reopen puis cancel reconduit bien l'identité du premier cancel).
  const cancelOperationId = useContentOperationId();
  const reopenOperationId = useContentOperationId();
  const confirmAsync = useConfirm();
  // Fiche entreprise : source unique partagée (ticket).
  const { record: companyRecord } = useCompany();
  const { time } = splitDateTime(detail.createdAt);
  const date = formatDateFr(detail.createdAt);

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
      const pv = (await api.printPreview(payload)) as { text80: string; html80?: unknown };
      setTicket({
        text80: pv.text80,
        html80: typeof pv.html80 === "string" ? pv.html80 : "",
        payload,
      });
    } catch (e) {
      notify(frError(e, "Aperçu indisponible."), "err");
    } finally {
      setTicketBusy(false);
    }
  }

  async function printTicket(): Promise<void> {
    if (!ticket) return;
    try {
      // Vente = ticket uniquement (jamais A4).
      await api.printReceipt(ticket.payload);
      // P5 : impression = papier.
      playSound("print");
      notify("Ticket envoyé.", "ok");
    } catch (e) {
      notify(frError(e, "Impression impossible."), "err");
    }
  }

  // Bon de livraison : même payload que le ticket + vente d'origine.
  // Aperçu et impression ticket 58/80mm uniquement.
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
      const pv = (await api.deliveryPreview(payload)) as { text80: string };
      setDelivery({ text80: pv.text80, payload });
    } catch (e) {
      notify(frError(e, "Aperçu indisponible."), "err");
    } finally {
      setDeliveryBusy(false);
    }
  }

  async function printDelivery(): Promise<void> {
    if (!delivery || deliveryBusy) return;
    setDeliveryBusy(true);
    try {
      await api.deliveryPrint(delivery.payload);
      // P5 : impression = papier.
      playSound("print");
      notify("Bon de livraison envoyé.", "ok");
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
      await api.saleCancel({
        id: detail.ticketSaleId,
        operationId: cancelOperationId(`sales.cancel:${detail.ticketSaleId}`),
      });
      notify(`Vente ${detail.reference} annulée.`, "ok");
      onChanged();
      onClose();
    } catch (e) {
      notify(frError(e, "Annulation impossible."), "err");
    } finally {
      setCancelBusy(false);
    }
  }

  /**
   * ADR-139 — Modifier = annuler la vente (miroir stock/soldes/paiements) puis
   * recharger ses lignes dans un nouveau panier. La facture d'origine reste
   * tracée ; la réédition produit un nouveau numéro à l'encaissement.
   */
  async function modifySale(): Promise<void> {
    if (detail.ticketSaleId == null || reopenBusy || cancelBusy) return;
    if (
      !(await confirmAsync(
        `Modifier la vente ${detail.reference} ? Elle sera annulée (stock, soldes et paiements restaurés), puis ses lignes rechargées dans un nouveau panier.`,
      ))
    )
      return;
    setReopenBusy(true);
    try {
      const draft = (await api.saleReopen({
        id: detail.ticketSaleId,
        operationId: reopenOperationId(`sales.reopen:${detail.ticketSaleId}`),
      })) as PendingSaleEdit;
      usePendingSaleEdit.getState().set(draft);
      notify(
        `Vente ${detail.reference} annulée : lignes rechargées dans la caisse, vérifiez puis encaissez.`,
        "ok",
      );
      onChanged();
      onClose();
      onNavigate?.("sell");
    } catch (e) {
      notify(frError(e, "Modification impossible."), "err");
    } finally {
      setReopenBusy(false);
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
          <>
            <Button
              onClick={() => void modifySale()}
              disabled={reopenBusy || cancelBusy}
              className="w-full"
              title="Annuler la vente et recharger ses lignes dans un nouveau panier"
            >
              <Pencil size={15} aria-hidden="true" />{" "}
              {reopenBusy ? "Préparation…" : "Modifier la vente (annuler et rééditer)"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void cancelSale()}
              disabled={cancelBusy || reopenBusy}
              className="w-full"
            >
              {cancelBusy ? "Annulation…" : "Annuler la vente (stock et soldes restaurés)"}
            </Button>
          </>
        ) : null}
        <Button variant="secondary" onClick={onClose} className="w-full">
          <X size={15} aria-hidden="true" /> Fermer
        </Button>
      </Drawer>

      {ticket ? (
        <DocumentPreviewModal
          label="Ticket de vente"
          title="Ticket de vente"
          html80={ticket.html80}
          text80={ticket.text80}
          onClose={() => setTicket(null)}
          actions={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void printTicket()} className="flex-1">
                <Printer size={15} aria-hidden="true" /> Imprimer le ticket
              </Button>
            </div>
          }
        />
      ) : null}

      {delivery ? (
        <DocumentPreviewModal
          label="Bon de livraison"
          title="Bon de livraison"
          text80={delivery.text80}
          onClose={() => setDelivery(null)}
          actions={
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => void printDelivery()}
                disabled={deliveryBusy}
                className="flex-1"
              >
                <Printer size={15} aria-hidden="true" /> Imprimer le bon
              </Button>
            </div>
          }
        />
      ) : null}
    </>
  );
}
