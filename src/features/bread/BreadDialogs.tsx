// Veloria PoS — Pain : tiroir détail + formulaire + statut + encaissement.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useState } from "react";
import { FileDown, HandCoins, Pencil, Printer, Search } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { useCompany } from "@shared/company/use-company.ts";
import { useDefaultMethod } from "@shared/settings/use-app-settings.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { formatDzd, minorToInput } from "@domain/money/money.ts";
import { strictOrNeg } from "@shared/money/parse.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { todayUtcDate } from "@shared/dates/dates.ts";
import {
  Badge,
  Button,
  Card,
  Drawer,
  Field,
  InfoRow,
  Modal,
  Select,
  Switch,
  TextInput,
} from "@shared/ui/primitives.tsx";
import { PaymentTicketModal, type PaymentTicketInput } from "@shared/documents/payment-preview.tsx";
import type { BreadDetailData } from "./BreadScreen.tsx";
import {
  NEXT_STATUSES,
  isRecurringOrder,
  orderCustomerName,
  orderDisplayName,
  orderStatusLabel,
  orderStatusTone,
  paymentStatusLabel,
} from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { playSound } from "@shared/sound/sound.ts";
type Method = "cash" | "cheque" | "transfer";

// ---------------------------------------------------------------------------
// Tiroir de détail commande.
// ---------------------------------------------------------------------------

export function BreadDetailsDrawer({
  data,
  onClose,
  onEdit,
  onStatus,
  onPay,
  onChanged,
  notify,
}: {
  data: BreadDetailData;
  onClose: () => void;
  onEdit: (d: BreadDetailData) => void;
  onStatus: (d: BreadDetailData) => void;
  onPay: (d: BreadDetailData) => void;
  onChanged: () => void;
  notify: Notify;
}): React.JSX.Element {
  const o = data.order;
  const [busy, setBusy] = useState(false);
  // Fiche entreprise : source unique partagée (bon de commande).
  const { record: companyRecord } = useCompany();
  // Confirmation non bloquante (modale applicative).
  const confirmAsync = useConfirm();
  const [ticketPreview, setTicketPreview] = useState<{
    htmlA4: string;
    payload: Record<string, unknown>;
  } | null>(null);
  const closed = o.order_status === "delivered" || o.order_status === "cancelled";
  const custPhone =
    data.customer != null && typeof data.customer["phone"] === "string"
      ? data.customer["phone"]
      : null;
  const custAddress =
    data.customer != null && typeof data.customer["address"] === "string"
      ? data.customer["address"]
      : null;

  async function convert(): Promise<void> {
    if (!(await confirmAsync(`Convertir ${o.order_number} en vente ? La commande sera figée.`)))
      return;
    setBusy(true);
    try {
      const res = (await api.breadConvert({
        id: o.id,
        operationId: newOperationId(),
      })) as { invoiceNumber: string };
      notify(`Facture ${res.invoiceNumber} créée.`, "ok");
      onChanged();
      onClose();
    } catch (e) {
      notify(frError(e, "Conversion impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function transfer(): Promise<void> {
    if (!(await confirmAsync(`Transférer le solde de ${o.order_number} au compte client ?`)))
      return;
    setBusy(true);
    try {
      await api.breadTransfer({ id: o.id, operationId: newOperationId() });
      notify("Solde transféré au compte client.", "ok");
      onChanged();
      onClose();
    } catch (e) {
      notify(frError(e, "Transfert impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function print(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const co = companyRecord;
      const payload = {
        title: `Bon de commande ${o.order_number}`,
        period: `Commandé le ${o.order_date.slice(0, 10)} · Retrait ${o.pickup_date.slice(0, 10)}${o.pickup_time ? ` ${o.pickup_time}` : ""}`,
        company: co?.["company_name"] ?? "Veloria",
        kpis: [
          { label: "Client", value: orderCustomerName(o) },
          { label: "Total", value: formatDzd(o.total_amount_minor) },
          { label: "Statut", value: orderStatusLabel(o.order_status) },
        ],
        charts: [],
        tables: [
          {
            title: "Articles",
            headers: ["Type", "Qté", "Prix unit.", "Total"],
            rows: [
              [
                o.bread_type,
                String(o.quantity),
                formatDzd(o.unit_price_minor),
                formatDzd(o.total_amount_minor),
              ],
            ],
          },
          {
            title: "Règlement",
            headers: ["Payé", "Reste", "Statut"],
            rows: [
              [
                formatDzd(o.amount_paid_minor),
                formatDzd(o.remaining_amount_minor),
                paymentStatusLabel(o.payment_status),
              ],
            ],
          },
        ],
        footer: "Merci de votre confiance · Veloria POS",
      };
      const pv = (await api.reportPreview(payload)) as { htmlA4: string };
      setTicketPreview({ htmlA4: pv.htmlA4, payload });
    } catch (e) {
      notify(frError(e, "Impression impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function printTicket(): Promise<void> {
    if (!ticketPreview) return;
    try {
      await api.reportPrint(ticketPreview.payload);
      notify("Bon envoyé.", "ok");
    } catch (e) {
      notify(frError(e, "Impression impossible."), "err");
    }
  }

  async function exportTicketPdf(): Promise<void> {
    if (!ticketPreview) return;
    try {
      const res = (await api.reportExportPdf(ticketPreview.payload)) as { path: string };
      notify(`PDF enregistré : ${res.path}`, "ok");
    } catch (e) {
      notify(frError(e, "Export PDF impossible."), "err");
    }
  }

  async function duplicateTomorrow(): Promise<void> {
    if (busy) return;
    if (
      !(await confirmAsync(
        `Répéter « ${orderDisplayName(o)} » pour demain (même client, même quantité) ?`,
      ))
    )
      return;
    setBusy(true);
    try {
      const d = new Date(`${o.pickup_date.slice(0, 10)}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      const tomorrow = d.toISOString().slice(0, 10);
      await api.breadCreate({
        operationId: newOperationId(),
        customerId: o.customer_id ?? null,
        customName: o.custom_name ?? null,
        customPhone: o.custom_phone ?? null,
        breadType: o.bread_type,
        orderName: orderDisplayName(o),
        isRecurring: true,
        pickupDate: tomorrow,
        pickupTime: null,
        quantity: Number(o.quantity),
        unitPriceMinor: Number(o.unit_price_minor),
        amountPaidMinor: 0,
        paymentMethod: null,
        notes: null,
      });
      notify(`Commande répétée pour le ${tomorrow}.`, "ok");
      onChanged();
      onClose();
    } catch (e) {
      notify(frError(e, "Duplication impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Drawer
        label={o.order_number}
        title={orderDisplayName(o)}
        sub={`Commande ${o.order_number} · ${o.order_date.slice(0, 10)}`}
        onClose={onClose}
      >
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={orderStatusTone(o.order_status)}>{orderStatusLabel(o.order_status)}</Badge>
          {isRecurringOrder(o) ? (
            <Badge tone="amber">Quotidienne</Badge>
          ) : (
            <Badge tone="grey">Ponctuelle</Badge>
          )}
        </div>

        <Card className="space-y-2.5 p-4 text-sm">
          <InfoRow label="Commande" value={orderDisplayName(o)} strong />
          <InfoRow label="Numéro" value={o.order_number} />
          <InfoRow label="Retrait" value={o.pickup_date.slice(0, 10)} num />
          <InfoRow label="Quantité" value={String(o.quantity)} num strong />
        </Card>

        <Card className="space-y-2.5 p-4 text-sm">
          <InfoRow label="Client" value={orderCustomerName(o)} />
          {o.customer_id != null && data.customer ? (
            <>
              <InfoRow label="Téléphone" value={custPhone ?? "—"} />
              <InfoRow label="Adresse" value={custAddress ?? "—"} />
            </>
          ) : null}
          {o.custom_phone ? <InfoRow label="Tél. (passage)" value={o.custom_phone} /> : null}
        </Card>

        <Card className="space-y-2.5 p-4 text-sm">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Qté</div>
              <div className="text-lg font-extrabold tabular-nums">{o.quantity}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Prix unit.</div>
              <div className="text-lg font-extrabold tabular-nums">
                {formatDzd(o.unit_price_minor)}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Total</div>
              <div className="text-lg font-extrabold tabular-nums text-amber-300">
                {formatDzd(o.total_amount_minor)}
              </div>
            </div>
          </div>
          <InfoRow label="Payé" value={formatDzd(o.amount_paid_minor)} num />
          <InfoRow label="Reste" value={formatDzd(o.remaining_amount_minor)} num />
          <InfoRow label="Paiement" value={paymentStatusLabel(o.payment_status)} />
          {o.notes ? <InfoRow label="Notes" value={o.notes} /> : null}
        </Card>

        <div className="grid grid-cols-2 gap-2">
          {!closed ? (
            <Button variant="secondary" onClick={() => onStatus(data)}>
              Statut…
            </Button>
          ) : null}
          {o.remaining_amount_minor > 0 ? (
            <Button variant="secondary" onClick={() => onPay(data)}>
              <HandCoins size={15} aria-hidden="true" /> Encaisser
            </Button>
          ) : null}
        </div>
        {!closed ? (
          <Button variant="secondary" onClick={() => onEdit(data)}>
            <Pencil size={15} aria-hidden="true" /> Modifier
          </Button>
        ) : null}
        {!closed ? (
          <Button variant="secondary" onClick={() => void duplicateTomorrow()} disabled={busy}>
            Répéter demain (quotidienne)
          </Button>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => void print()} disabled={busy}>
            <Printer size={15} aria-hidden="true" /> {busy ? "…" : "Imprimer"}
          </Button>
          {o.sale_id == null && Number(o.transferred_to_customer_account) === 0 ? (
            <Button variant="secondary" onClick={() => void convert()} disabled={busy}>
              Facturer
            </Button>
          ) : null}
        </div>
        {o.sale_id == null &&
        Number(o.transferred_to_customer_account) === 0 &&
        o.customer_id != null &&
        o.remaining_amount_minor > 0 ? (
          <Button variant="secondary" onClick={() => void transfer()} disabled={busy}>
            Transférer au compte client
          </Button>
        ) : null}
      </Drawer>

      {ticketPreview ? (
        <Modal
          label="Bon de commande"
          title={`Bon ${o.order_number}`}
          onClose={() => setTicketPreview(null)}
          wide
        >
          <iframe
            sandbox=""
            srcDoc={ticketPreview.htmlA4}
            title="Aperçu bon de commande"
            className="h-[50vh] w-full rounded-xl border border-white/10 bg-white"
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => void exportTicketPdf()}>
              <FileDown size={15} aria-hidden="true" /> PDF
            </Button>
            <Button onClick={() => void printTicket()}>
              <Printer size={15} aria-hidden="true" /> Imprimer
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Formulaire création / édition.
// ---------------------------------------------------------------------------

export function BreadFormDialog({
  editing,
  onClose,
  onSaved,
  notify,
}: {
  editing: BreadDetailData | null;
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const o = editing?.order ?? null;
  const initialName =
    (o?.order_name ?? "").trim() !== "" ? String(o?.order_name ?? "") : (o?.bread_type ?? "Pain");
  const [orderName, setOrderName] = useState(initialName);
  const [customerId, setCustomerId] = useState<number | null>(o?.customer_id ?? null);
  const [customerLabel, setCustomerLabel] = useState(
    o ? (orderCustomerName(o) === "—" ? "" : orderCustomerName(o)) : "",
  );
  const [customerQ, setCustomerQ] = useState("");
  const [customerResults, setCustomerResults] = useState<{ id: number; name: string }[]>([]);
  const [customName, setCustomName] = useState(o?.custom_name ?? "");
  const [quantity, setQuantity] = useState(o ? String(o.quantity) : "1");
  const [unitPrice, setUnitPrice] = useState(o ? minorToInput(o.unit_price_minor) : "");
  const [recurring, setRecurring] = useState(Number(o?.is_recurring ?? 0) === 1);
  const [pickupDate, setPickupDate] = useState(o?.pickup_date.slice(0, 10) ?? todayUtcDate());
  const [busy, setBusy] = useState(false);

  async function searchCustomers(): Promise<void> {
    if (customerQ.trim().length < 2) return;
    try {
      const res = (await api.customerSearch({
        query: customerQ.trim(),
        page: 1,
        pageSize: 8,
      })) as { rows: { id: number; first_name: string; last_name: string }[] };
      setCustomerResults(
        res.rows.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() })),
      );
    } catch {
      setCustomerResults([]);
    }
  }

  const qty = Number(quantity.replace(",", "."));

  async function save(): Promise<void> {
    const label = orderName.trim();
    if (label.length < 2) {
      notify("Nom de la commande requis (2 lettres min.).", "err");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      notify("Quantité invalide.", "err");
      return;
    }
    if (pickupDate === "") {
      notify("Date de retrait requise.", "err");
      return;
    }
    const resolvedCustom =
      customerId == null
        ? customName.trim() === ""
          ? label
          : customName.trim()
        : customName.trim() === ""
          ? null
          : customName.trim();
    if (editing) {
      setBusy(true);
      try {
        if (qty > 0 && qty !== Number(editing.order.quantity)) {
          await api.breadUpdateQty({
            id: editing.order.id,
            quantity: qty,
            operationId: newOperationId(),
          });
        }
        await api.breadUpdate({
          id: editing.order.id,
          operationId: newOperationId(),
          customerId,
          customName: resolvedCustom,
          customPhone: editing.order.custom_phone ?? null,
          breadType: label,
          orderName: label,
          isRecurring: recurring,
          pickupDate,
          pickupTime: null,
          notes: null,
        });
        notify("Commande enregistrée.", "ok");
        onSaved();
      } catch (e) {
        notify(frError(e, "Enregistrement impossible."), "err");
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      const unitPriceMinor = strictOrNeg(unitPrice, "Prix unitaire");
      if (unitPriceMinor < 0) {
        notify("Prix unitaire invalide.", "err");
        return;
      }
      const res = (await api.breadCreate({
        operationId: newOperationId(),
        customerId,
        customName: resolvedCustom,
        customPhone: null,
        breadType: label,
        orderName: label,
        isRecurring: recurring,
        pickupDate,
        pickupTime: null,
        quantity: qty,
        unitPriceMinor,
        amountPaidMinor: 0,
        paymentMethod: null,
        notes: null,
      })) as { number: string };
      notify(`Commande ${res.number} créée.`, "ok");
      onSaved();
    } catch (e) {
      notify(frError(e, "Création impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      label={editing ? "Modifier la commande" : "Nouvelle commande"}
      title={editing ? `Modifier ${editing.order.order_number}` : "Nouvelle commande"}
      onClose={onClose}
    >
      <div className="space-y-4">
        <Field label="Nom de la commande *" hint="Ex. : Pain maison, Commande Hadj Ahmed…">
          <TextInput
            value={orderName}
            onChange={(e) => setOrderName(e.target.value)}
            placeholder="Ex. : Pain maison"
            aria-label="Nom de la commande"
          />
        </Field>
        <Field label="Client" hint="Nom du client ou fiche client (optionnel).">
          {customerId != null ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-black/25 px-4 py-2.5 text-sm">
              <span className="truncate font-semibold">{customerLabel}</span>
              <button
                type="button"
                onClick={() => {
                  setCustomerId(null);
                  setCustomerLabel("");
                }}
                className="shrink-0 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Retirer
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <div className="flex-1">
                  <TextInput
                    value={customerQ}
                    onChange={(e) => setCustomerQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void searchCustomers();
                      }
                    }}
                    placeholder="Rechercher un client… (min. 2 lettres)"
                    aria-label="Rechercher un client"
                  />
                </div>
                <Button type="button" variant="secondary" onClick={() => void searchCustomers()}>
                  <Search size={15} aria-hidden="true" />
                </Button>
              </div>
              {customerResults.length > 0 ? (
                <ul className="mt-2 max-h-28 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10">
                  {customerResults.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerId(c.id);
                          setCustomerLabel(c.name);
                          setCustomerResults([]);
                          setCustomerQ("");
                        }}
                        className="w-full px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-amber-400/10"
                      >
                        {c.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </Field>
        <Field label="Nom du client (libre)" hint="Utilisé si aucun client fiché.">
          <TextInput
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Ex. : Hadj Ahmed"
            aria-label="Nom du client"
          />
        </Field>
        <Field label="Quantité *">
          <TextInput
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            inputMode="decimal"
            placeholder="1"
            aria-label="Quantité"
          />
        </Field>
        <Field
          label="Prix unitaire (DZD) *"
          hint={editing ? "Fixé à la création (non modifiable)." : "0 = gratuit."}
        >
          <TextInput
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            inputMode="decimal"
            placeholder="Ex. : 15"
            aria-label="Prix unitaire"
            disabled={editing != null}
          />
        </Field>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold">
          <span>
            Commande récurrente (quotidienne)
            <span className="block text-xs font-normal text-slate-500">
              Répétée chaque jour (badge « Quotidienne »).
            </span>
          </span>
          <Switch
            checked={recurring}
            onChange={() => setRecurring((v) => !v)}
            ariaLabel="Commande récurrente quotidienne"
          />
        </label>
        <Field label="Retrait le *" hint="Par défaut : aujourd'hui.">
          <TextInput
            type="date"
            value={pickupDate}
            onChange={(e) => setPickupDate(e.target.value)}
            aria-label="Date de retrait"
          />
        </Field>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button onClick={() => void save()} disabled={busy} className="flex-[2]">
            {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Créer la commande"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Changement de statut (transitions gardées côté main).
// ---------------------------------------------------------------------------

export function BreadStatusDialog({
  data,
  onClose,
  onSaved,
  notify,
}: {
  data: BreadDetailData;
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const o = data.order;
  const [to, setTo] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const next = (NEXT_STATUSES[o.order_status] ?? []).filter((s) => s !== o.order_status);

  const STATUS_LABELS: Record<string, string> = {
    new: "Nouvelle",
    confirmed: "Confirmée",
    preparing: "En préparation",
    ready: "Prête",
    delivered: "Livrée",
    cancelled: "Annulée",
  };

  async function confirm(): Promise<void> {
    if (to === "") {
      notify("Choisissez un statut.", "err");
      return;
    }
    setBusy(true);
    try {
      await api.breadStatus({ id: o.id, to, operationId: newOperationId() });
      notify("Statut mis à jour.", "ok");
      onSaved();
    } catch (e) {
      notify(frError(e, "Transition impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label="Statut commande" title={`Statut — ${o.order_number}`} onClose={onClose}>
      <div className="space-y-4">
        <dl className="rounded-xl bg-black/25 p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Actuel</dt>
            <dd className="font-bold">{STATUS_LABELS[o.order_status] ?? o.order_status}</dd>
          </div>
        </dl>
        {next.length === 0 ? (
          <p className="text-sm text-slate-400">Commande clôturée : aucun changement possible.</p>
        ) : (
          <Field label="Nouveau statut">
            <Select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Nouveau statut">
              <option value="">— Choisir —</option>
              {next.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s] ?? s}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button
            onClick={() => void confirm()}
            disabled={busy || next.length === 0}
            className="flex-[2]"
          >
            {busy ? "…" : "Confirmer la commande"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Encaissement commande.
// ---------------------------------------------------------------------------

export function BreadPayDialog({
  data,
  onClose,
  onSaved,
  notify,
}: {
  data: BreadDetailData;
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const o = data.order;
  const [amountText, setAmountText] = useState(minorToInput(o.remaining_amount_minor));
  const [method, setMethod] = useDefaultMethod();
  const [busy, setBusy] = useState(false);
  // Reçu de règlement proposé après succès.
  const [ticket, setTicket] = useState<PaymentTicketInput | null>(null);
  // P1-5 : strict (bornes H-1, jamais NaN) ; invalide → -1 = refusé par `valid`.
  const amount = strictOrNeg(amountText, "Montant");
  const valid = Number.isInteger(amount) && amount > 0 && amount <= o.remaining_amount_minor;

  async function save(): Promise<void> {
    if (!valid) {
      notify("Montant invalide.", "err");
      return;
    }
    setBusy(true);
    try {
      await api.breadPay({ id: o.id, amountMinor: amount, method, operationId: newOperationId() });
      notify(`Encaissé ${formatDzd(amount)}.`, "ok");
      // P5 : encaissement = caisse.
      playSound("cash");
      // Ticket de règlement proposé (aperçu + impression 80mm/A4).
      setTicket({
        kind: "bread",
        partyLabel: orderCustomerName(o),
        reference: o.order_number,
        date: todayUtcDate(),
        amountMinor: amount,
        method,
        prevBalanceMinor: o.remaining_amount_minor,
        newBalanceMinor: o.remaining_amount_minor - amount,
        notes: "",
      });
    } catch (e) {
      notify(frError(e, "Encaissement impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal label="Encaissement pain" title={`Encaisser — ${o.order_number}`} onClose={onClose}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <dl className="space-y-1.5 rounded-xl bg-black/25 p-4 text-sm">
            <div className="flex items-baseline justify-between border-t border-white/10 pt-2">
              <dt className="font-extrabold">Reste dû</dt>
              <dd className="text-xl font-extrabold tabular-nums text-amber-300">
                {formatDzd(o.remaining_amount_minor)}
              </dd>
            </div>
            <div className="flex justify-between font-bold text-emerald-300">
              <dt>Nouveau reste</dt>
              <dd className="tabular-nums">
                {formatDzd(valid ? o.remaining_amount_minor - amount : o.remaining_amount_minor)}
              </dd>
            </div>
          </dl>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Montant (DZD)">
              <TextInput
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                aria-label="Montant"
              />
            </Field>
            <Field label="Moyen">
              <Select
                value={method}
                onChange={(e) => setMethod(e.target.value as Method)}
                aria-label="Moyen de paiement"
              >
                <option value="cash">Espèces</option>
                <option value="cheque">Chèque</option>
                <option value="transfer">Virement</option>
              </Select>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Annuler
            </Button>
            <Button type="submit" disabled={busy || !valid} className="flex-[2]">
              {busy ? "Enregistrement…" : "Encaisser"}
            </Button>
          </div>
        </form>
      </Modal>
      {ticket ? (
        <PaymentTicketModal
          ticket={ticket}
          onClose={() => {
            setTicket(null);
            onSaved();
          }}
          notify={notify}
        />
      ) : null}
    </>
  );
}
