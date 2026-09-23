// Veloria PoS — Clients : tiroir détail + formulaire + règlement.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useEffect, useState } from "react";
import { Pencil, ReceiptText, RotateCcw, Trash2, Wallet } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { InvoicePreviewModal } from "@shared/documents/invoice-preview.tsx";
import { PaymentTicketModal, type PaymentTicketInput } from "@shared/documents/payment-preview.tsx";
import { callChecked, paymentAckSchema } from "@shared/types/ipc-contracts.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { formatDzd, parseDzdInputStrict } from "@domain/money/money.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { playSound } from "@shared/sound/sound.ts";
import { newOperationId } from "@domain/common/ids.ts";
import {
  PAYMENT_METHOD_LABELS,
  formatCustomerCode,
  formatDateTimeFr,
} from "@shared/formatters/format.ts";
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
  TextArea,
  TextInput,
  cn,
} from "@shared/ui/primitives.tsx";
import {
  debtLabel,
  debtTone,
  fullName,
  hasDebt,
  isArchived,
  splitFullName,
  type Customer,
  type EnrichedCustomer,
  type StatementSale,
} from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";

// Libellés des moyens de paiement : source unique partagée (format.ts).

// ---------------------------------------------------------------------------
// Tiroir de détail client.
// ---------------------------------------------------------------------------

export function ClientDetailsDrawer({
  customer,
  sales,
  onClose,
  onEdit,
  onChanged,
  notify,
}: {
  customer: EnrichedCustomer;
  sales: StatementSale[];
  onClose: () => void;
  onEdit: (c: EnrichedCustomer) => void;
  onChanged: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [showInvoices, setShowInvoices] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Requête 2 : aperçu facture (80mm/A4) + réimpression depuis la fiche.
  const [previewSaleId, setPreviewSaleId] = useState<number | null>(null);
  const archived = isArchived(customer);
  const confirmAsync = useConfirm();

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

  return (
    <>
      <Drawer
        label={`Détail ${fullName(customer)}`}
        title={fullName(customer)}
        sub={`Client #${customer.id}`}
        below={
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={debtTone(customer)}>{debtLabel(customer)}</Badge>
            {customer.phone ? <Badge tone="grey">{customer.phone}</Badge> : null}
          </div>
        }
        footer={
          <>
            {!archived && hasDebt(customer) ? (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => setPayOpen(true)}
                className="w-full"
              >
                <Wallet size={15} aria-hidden="true" /> Encaisser un paiement
              </Button>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                disabled={busy || archived}
                onClick={() => onEdit(customer)}
                title="Modifier le client"
              >
                <Pencil size={15} aria-hidden="true" /> Modifier
              </Button>
              {archived ? (
                <Button variant="secondary" disabled={busy} onClick={() => void restore()}>
                  <RotateCcw size={15} aria-hidden="true" /> Restaurer
                </Button>
              ) : (
                <Button variant="danger" disabled={busy} onClick={() => void remove()}>
                  <Trash2 size={15} aria-hidden="true" /> Supprimer
                </Button>
              )}
            </div>
          </>
        }
        onClose={onClose}
      >
        <Card
          className={cn(
            "p-4 text-center",
            hasDebt(customer) ? "border-red-400/25" : "border-emerald-400/20",
          )}
        >
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Dette actuelle
          </div>
          <div
            className={cn(
              "mt-1 text-3xl font-extrabold tabular-nums tracking-tight",
              hasDebt(customer) ? "text-red-300" : "text-emerald-300",
            )}
          >
            {formatDzd(customer.outstanding_balance_minor)}
          </div>
          {customer.credit_limit_minor > 0 ? (
            <div className="mt-1 text-xs text-slate-500">
              Plafond : {formatDzd(customer.credit_limit_minor)}
            </div>
          ) : null}
        </Card>

        <Card className="space-y-2.5 p-4 text-sm">
          <InfoRow
            label="Vente à crédit"
            value={customer.credit_allowed === 1 ? "Autorisée" : "Comptant uniquement"}
          />
          <InfoRow
            label="Règlement mensuel"
            value={customer.settlement_day != null ? `Chaque ${customer.settlement_day}` : "—"}
          />
          <InfoRow label="Téléphone" value={customer.phone || "—"} />
          <InfoRow label="Adresse" value={customer.address || "—"} />
          <InfoRow
            label="Achats cumulés"
            value={formatDzd(customer.totalPurchasesMinor)}
            num
            strong
          />
          <InfoRow label="Factures" value={String(customer.invoiceCount)} num />
          <InfoRow
            label="Dernière vente"
            value={customer.lastSaleAt ? formatDateTimeFr(customer.lastSaleAt) : "—"}
          />
          {customer.notes ? <InfoRow label="Notes" value={customer.notes} /> : null}
        </Card>

        <Button
          variant="secondary"
          onClick={() => setShowInvoices((v) => !v)}
          aria-expanded={showInvoices}
          className="w-full"
        >
          <ReceiptText size={15} aria-hidden="true" />
          {showInvoices ? "Masquer les factures" : `Voir les factures (${sales.length})`}
        </Button>
        {showInvoices ? (
          sales.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">Aucune facture.</p>
          ) : (
            <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/10">
              {sales.map((s) => (
                <li key={s.id} className="space-y-1 px-3 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-400">{s.invoice_number}</span>
                    <span className="font-bold tabular-nums">{formatDzd(s.total_minor)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>{formatDateTimeFr(s.created_at)}</span>
                    {s.is_cancelled === 1 ? (
                      <Badge tone="grey">Annulée</Badge>
                    ) : s.remaining_balance_minor > 0 ? (
                      <span className="font-semibold tabular-nums text-amber-300">
                        Reste {formatDzd(s.remaining_balance_minor)}
                      </span>
                    ) : (
                      <Badge tone="green">Payée</Badge>
                    )}
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => setPreviewSaleId(s.id)}
                      title={`Apercevoir ${s.invoice_number} (80mm + A4, réimpression)`}
                      aria-label={`Apercevoir la facture ${s.invoice_number}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs font-semibold text-slate-300 transition-colors hover:border-amber-400/40 hover:text-amber-200"
                    >
                      <ReceiptText size={13} aria-hidden="true" /> Aperçu / Réimprimer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </Drawer>
      {payOpen ? (
        <PaymentDialog
          customer={customer}
          onClose={() => setPayOpen(false)}
          onSaved={() => {
            setPayOpen(false);
            onChanged();
            onClose();
          }}
          notify={notify}
        />
      ) : null}
      {previewSaleId != null ? (
        <InvoicePreviewModal
          saleId={previewSaleId}
          title={`Facture ${sales.find((s) => s.id === previewSaleId)?.invoice_number ?? ""}`}
          onClose={() => setPreviewSaleId(null)}
          notify={notify}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Formulaire client (création + édition).
// ---------------------------------------------------------------------------

export function ClientFormDialog({
  customer,
  onClose,
  onSaved,
  notify,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const editing = customer != null;
  const [full, setFull] = useState(customer ? fullName(customer) : "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [creditAllowed, setCreditAllowed] = useState(customer?.credit_allowed === 1);
  const [settleDay, setSettleDay] = useState(
    customer?.settlement_day != null ? String(customer.settlement_day) : "",
  );
  const [creditLimit, setCreditLimit] = useState(
    customer && customer.credit_limit_minor > 0
      ? (customer.credit_limit_minor / 100).toString().replace(".", ",")
      : "",
  );
  const [notes, setNotes] = useState(customer?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [creditOpen, setCreditOpen] = useState(true);
  // Idempotence (migration 0022) : un UUID par dialogue de création, régénéré
  // après succès — rejouer le même UUID retrouve le client existant.
  const [operationId, setOperationId] = useState<string>(() => newOperationId());

  // Plafond par défaut des réglages (création uniquement, champ intact).
  useEffect(() => {
    if (customer != null) return;
    api
      .settingsGet({ key: "customers" })
      .then((v) => {
        const d = (v as { value: { defaultCreditLimitMinor: number } }).value;
        if (d.defaultCreditLimitMinor > 0) {
          setCreditLimit((prev) =>
            prev === "" ? (d.defaultCreditLimitMinor / 100).toString().replace(".", ",") : prev,
          );
          setCreditAllowed(true);
        }
      })
      .catch(() => undefined);
    api
      .settingsGet({ key: "sales" })
      .then((v) => {
        setCreditOpen((v as { value: { allowCreditSales: boolean } }).value.allowCreditSales);
      })
      .catch(() => undefined);
  }, []);

  async function save(): Promise<void> {
    const { firstName, lastName } = splitFullName(full);
    if (firstName.length < 1 || lastName.length < 1) {
      notify("Nom complet requis (prénom + nom).", "err");
      return;
    }
    // P1-5 : strict (bornes H-1, jamais NaN) — erreur FR mappée.
    let limitMinor = 0;
    if (creditAllowed) {
      try {
        limitMinor = parseDzdInputStrict(
          creditLimit.trim() === "" ? "0" : creditLimit,
          "Plafond de crédit",
        );
      } catch (e) {
        notify(frError(e, "Plafond de crédit invalide."), "err");
        return;
      }
    }
    const settleTrimmed = settleDay.trim();
    const settle: number | null =
      settleTrimmed === "" ? null : Number(settleTrimmed.replace(",", "."));
    if (settle !== null && (!Number.isInteger(settle) || settle < 1 || settle > 31)) {
      notify("Jour de règlement invalide (1 – 31, vide = sans échéance).", "err");
      return;
    }
    if (phone.trim().length > 30) {
      notify("Téléphone trop long (30 max).", "err");
      return;
    }
    if (address.trim().length > 300) {
      notify("Adresse trop longue (300 max).", "err");
      return;
    }
    if (notes.trim().length > 500) {
      notify("Notes trop longues (500 max).", "err");
      return;
    }
    setBusy(true);
    try {
      if (customer == null) {
        await api.customerCreate({
          operationId,
          firstName,
          lastName,
          phone: phone.trim() === "" ? null : phone.trim(),
          address: address.trim() === "" ? null : address.trim(),
          creditLimitMinor: limitMinor,
          initialBalanceMinor: 0,
          settlementDay: settle,
          isBreadClient: false,
          creditAllowed,
          notes: notes.trim() === "" ? null : notes.trim(),
        });
        setOperationId(newOperationId());
        notify(`Client « ${firstName} ${lastName} » créé.`, "ok");
      } else {
        await api.customerUpdate({
          id: customer.id,
          firstName,
          lastName,
          phone: phone.trim() === "" ? null : phone.trim(),
          address: address.trim() === "" ? null : address.trim(),
          creditLimitMinor: limitMinor,
          creditAllowed,
          settlementDay: settle,
          notes: notes.trim() === "" ? null : notes.trim(),
        });
        notify("Fiche client enregistrée.", "ok");
      }
      onSaved();
    } catch (e) {
      notify(frError(e, "Enregistrement impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      label={editing ? "Modifier le client" : "Nouveau client"}
      title={editing ? "Modifier le client" : "Nouveau client"}
      onClose={onClose}
      wide
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Nom complet" hint="Prénom + nom (le dernier mot = nom de famille).">
          <TextInput
            value={full}
            onChange={(e) => setFull(e.target.value)}
            placeholder="Ex. : Amine Benali"
            aria-label="Nom complet"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Téléphone">
            <TextInput
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="Ex. : 0550 12 34 56"
              aria-label="Téléphone"
            />
          </Field>
          <Field label="Adresse">
            <TextInput
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ex. : Alger centre"
              aria-label="Adresse"
            />
          </Field>
        </div>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold">
          <span>
            Crédit autorisé
            <span className="block text-xs font-normal text-slate-500">
              Autorise les impayés (vente à crédit). Sans plafond, tout impayé reste possible.
            </span>
            {!creditOpen ? (
              <span className="block text-xs font-bold text-red-300">
                Crédit général coupé (Paramètres → Vente).
              </span>
            ) : null}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={creditAllowed}
            aria-label="Crédit autorisé"
            onClick={() => setCreditAllowed((a) => !a)}
            className={cn(
              "relative h-7 w-12 shrink-0 rounded-full transition-colors",
              creditAllowed ? "bg-amber-400" : "bg-white/15",
            )}
          >
            <span
              className={cn(
                "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
                creditAllowed ? "left-6" : "left-1",
              )}
            />
          </button>
        </label>
        {creditAllowed ? (
          <Field label="Plafond de crédit (DZD)" hint="Alerte dépassement au-delà.">
            <TextInput
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              aria-label="Plafond de crédit"
            />
          </Field>
        ) : null}
        <Field
          label="Jour de règlement (1 – 31)"
          hint="Ex. 14 = paie chaque 14. Vide = sans échéance."
        >
          <TextInput
            value={settleDay}
            onChange={(e) => setSettleDay(e.target.value)}
            inputMode="numeric"
            placeholder="—"
            aria-label="Jour de règlement mensuel"
          />
        </Field>
        <Field label="Notes" hint="Optionnel (500 caractères max).">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex. : paie en fin de mois…"
            aria-label="Notes"
          />
        </Field>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button type="submit" disabled={busy} className="flex-[2]">
            {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Créer le client"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Règlement (encaissement standalone borné par la dette).
// ---------------------------------------------------------------------------

export function PaymentDialog({
  customer,
  onClose,
  onSaved,
  notify,
}: {
  customer: EnrichedCustomer;
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [amount, setAmount] = useState(
    customer.outstanding_balance_minor > 0
      ? (customer.outstanding_balance_minor / 100).toString().replace(".", ",")
      : "",
  );
  const [method, setMethod] = useState<"cash" | "cheque" | "transfer">("cash");
  const [busy, setBusy] = useState(false);
  // Idempotence (migration 0020) : rejouer le même UUID retrouve le paiement
  // au lieu de le dupliquer (retry IPC, double-clic avant le verrou `busy`).
  const [operationId, setOperationId] = useState<string>(() => newOperationId());
  // Reçu de règlement (ticket تسديد الدين) proposé après succès.
  const [ticket, setTicket] = useState<PaymentTicketInput | null>(null);

  // P1-5 : strict (bornes H-1, jamais NaN) ; invalide → règlement refusé.
  let parsed = 0;
  let parsedOk = true;
  try {
    parsed = parseDzdInputStrict(amount.trim() === "" ? "0" : amount, "Montant");
  } catch {
    parsedOk = false;
  }
  const valid = parsedOk && Number.isInteger(parsed) && parsed > 0;
  const newBalance =
    valid && parsed <= customer.outstanding_balance_minor
      ? customer.outstanding_balance_minor - parsed
      : null;

  async function save(): Promise<void> {
    if (!valid) {
      notify("Montant invalide.", "err");
      return;
    }
    if (parsed > customer.outstanding_balance_minor) {
      notify("Le montant dépasse la dette du client.", "err");
      return;
    }
    setBusy(true);
    try {
      const ack = await callChecked(
        (a) =>
          a.customers.recordPayment({
            operationId,
            customerId: customer.id,
            saleId: null,
            amountMinor: parsed,
            method,
          }),
        paymentAckSchema,
      );
      setOperationId(newOperationId());
      notify(`Paiement de ${formatDzd(parsed)} enregistré.`, "ok");
      // P5 : encaissement = caisse.
      playSound("cash");
      // Ticket de règlement proposé (aperçu + impression 80mm/A4).
      setTicket({
        kind: "customer",
        partyLabel: `${fullName(customer)} — ${formatCustomerCode(customer.id)}`,
        reference: ack.paymentId > 0 ? `PAY-${String(ack.paymentId).padStart(5, "0")}` : "",
        date: todayUtcDate(),
        amountMinor: parsed,
        method,
        prevBalanceMinor: customer.outstanding_balance_minor,
        newBalanceMinor: customer.outstanding_balance_minor - parsed,
        notes: "",
      });
    } catch (e) {
      notify(frError(e, "Règlement impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal label="Règlement client" title={`Règlement — ${fullName(customer)}`} onClose={onClose}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <dl className="space-y-1.5 rounded-xl bg-black/25 p-4 text-sm">
            <div className="flex justify-between text-slate-300">
              <dt>Client</dt>
              <dd className="font-semibold">{fullName(customer)}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-white/10 pt-2">
              <dt className="font-extrabold">Dette actuelle</dt>
              <dd className="text-xl font-extrabold tabular-nums text-red-300">
                {formatDzd(customer.outstanding_balance_minor)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="font-extrabold">Nouveau solde</dt>
              <dd className="text-lg font-extrabold tabular-nums text-emerald-300">
                {newBalance != null ? formatDzd(newBalance) : "—"}
              </dd>
            </div>
          </dl>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Montant (DZD)">
              <TextInput
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                aria-label="Montant du règlement"
              />
            </Field>
            <Field label="Moyen de paiement">
              <Select
                value={method}
                onChange={(e) => setMethod(e.target.value as "cash" | "cheque" | "transfer")}
                aria-label="Moyen de paiement"
              >
                <option value="cash">{PAYMENT_METHOD_LABELS["cash"]}</option>
                <option value="cheque">{PAYMENT_METHOD_LABELS["cheque"]}</option>
                <option value="transfer">{PAYMENT_METHOD_LABELS["transfer"]}</option>
              </Select>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Annuler
            </Button>
            <Button type="submit" disabled={busy} className="flex-[2]">
              {busy ? "Enregistrement…" : "Enregistrer le paiement"}
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
