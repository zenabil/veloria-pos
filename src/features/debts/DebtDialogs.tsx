// Veloria PoS — Dettes : tiroir détail + paiement + échéance.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useEffect, useRef, useState } from "react";
import { HandCoins, Pencil, Printer, ReceiptText } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { callChecked, paymentAckSchema } from "@shared/types/ipc-contracts.ts";
import { useCompany } from "@shared/company/use-company.ts";
import { useAppSettings } from "@shared/settings/use-app-settings.ts";
import { formatDzd } from "@domain/money/money.ts";
import { formatDzdSafe } from "@shared/formatters/format.ts";
import { strictOrNeg } from "@shared/money/parse.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { buildSaleTicketPayload } from "@shared/documents/sale-ticket.ts";
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
  TextInput,
} from "@shared/ui/primitives.tsx";
import type { DebtDetailData } from "./DebtsScreen.tsx";
import {
  PAYMENT_METHOD_LABELS,
  debtStatusLabel,
  debtStatusTone,
  debtTypeLabel,
  dueLabel,
  settleBandLabel,
  settleBandTone,
  settleInfo,
  type DebtRow,
  type DebtType,
} from "./types.ts";
import { CASHIER_LABEL } from "@shared/formatters/format.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { playSound } from "@shared/sound/sound.ts";

// ---------------------------------------------------------------------------
// Tiroir de détail dette.
// ---------------------------------------------------------------------------

export function DebtDetailsDrawer({
  debtType,
  data,
  onClose,
  onPay,
  onDueDate,
  notify,
}: {
  debtType: DebtType;
  data: DebtDetailData;
  onClose: () => void;
  onPay: (r: DebtRow) => void;
  onDueDate: (r: DebtRow) => void;
  notify: Notify;
}): React.JSX.Element {
  const h = data.header;
  const party = data.party;
  // Fiche entreprise : source unique partagée (ticket).
  const { record: companyRecord } = useCompany();
  const [ticket, setTicket] = useState<{ htmlA4: string; payload: Record<string, unknown> } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const remaining =
    debtType === "customer"
      ? Number(h["remaining_balance_minor"] ?? 0)
      : Number(h["outstanding_balance_minor"] ?? 0);
  const partyName =
    typeof party?.["search_name"] === "string"
      ? party["search_name"]
      : typeof party?.["name"] === "string"
        ? party["name"]
        : "—";
  const ref = debtType === "customer" ? String(h["invoice_number"] ?? "") : "Compte";

  async function openTicket(): Promise<void> {
    if (debtType !== "customer" || busy) return;
    setBusy(true);
    try {
      const saleId = Number(h["id"] ?? 0);
      const d = (await api.saleGet({ id: saleId })) as {
        sale: Record<string, string | number | null>;
        items: Record<string, string | number | null>[];
      };
      const customerId = typeof h["customer_id"] === "number" ? h["customer_id"] : 0;
      let customer: { search_name: string; phone: string | null; address: string | null } | null =
        null;
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
      const payload = buildSaleTicketPayload(
        d as {
          sale: Record<string, string | number | null>;
          items: Record<string, string | number | null>[];
        },
        companyRecord,
        customer,
        customerId,
      );
      const pv = (await api.printPreview(payload)) as { htmlA4: string };
      setTicket({ htmlA4: pv.htmlA4, payload });
    } catch (e) {
      notify(frError(e, "Aperçu indisponible."), "err");
    } finally {
      setBusy(false);
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

  const settleDay =
    debtType === "customer" && typeof party?.["settlement_day"] === "number"
      ? party["settlement_day"]
      : null;
  const settle = settleInfo(settleDay, todayUtcDate());
  const toRow = (): DebtRow => ({
    debt_type: debtType,
    entity_id: Number(h["id"] ?? 0),
    ref,
    party_name: partyName,
    party_phone: typeof party?.["phone"] === "string" ? party["phone"] : null,
    original_minor:
      debtType === "customer"
        ? Number(h["total_minor"] ?? 0)
        : Number(h["outstanding_balance_minor"] ?? 0),
    paid_minor: debtType === "customer" ? Number(h["amount_paid_minor"] ?? 0) : 0,
    remaining_minor: remaining,
    due_date: typeof h["due_date"] === "string" ? h["due_date"] : null,
    created_at: String(h["created_at"] ?? ""),
    status:
      typeof h["due_date"] === "string" && h["due_date"].slice(0, 10) < todayUtcDate()
        ? "overdue"
        : "due",
    settlement_day: settleDay,
    next_settle: settle.next,
    settle_band: settle.band,
  });

  return (
    <>
      <Drawer
        label={`${debtTypeLabel(debtType)} ${partyName}`}
        title={partyName}
        above={
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={debtType === "customer" ? "blue" : "amber"}>
              {debtTypeLabel(debtType)}
            </Badge>
            <Badge tone={debtStatusTone(toRow().status)}>{debtStatusLabel(toRow().status)}</Badge>
            {settle.band === "overdue" || settle.band === "soon" ? (
              <Badge tone={settleBandTone(settle.band)}>{settleBandLabel(settle.band)}</Badge>
            ) : null}
          </div>
        }
        below={<div className="mt-1 font-mono text-xs text-slate-500">{ref}</div>}
        onClose={onClose}
      >
        <Card className="p-4 text-center">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Reste dû
          </div>
          <div className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight text-red-300">
            {formatDzd(remaining)}
          </div>
          <div className="mt-1 text-xs tabular-nums text-slate-500">
            Échéance : {dueLabel(typeof h["due_date"] === "string" ? h["due_date"] : null)}
          </div>
        </Card>

        <Card className="space-y-2.5 p-4 text-sm">
          <InfoRow label="Type" value={debtTypeLabel(debtType)} />
          <InfoRow label={debtType === "customer" ? "Client" : "Fournisseur"} value={partyName} />
          <InfoRow label="Référence" value={ref} />
          <InfoRow label="Utilisateur" value={CASHIER_LABEL} />
          {settleDay != null ? (
            <InfoRow
              label="Règlement mensuel"
              value={`Chaque ${settleDay}${settle.next ? ` · prochain : ${settle.next}` : ""}`}
            />
          ) : null}
          {debtType === "customer" ? (
            <>
              <InfoRow label="Total facture" value={formatDzdSafe(h["total_minor"] ?? 0)} num />
              <InfoRow label="Payé" value={formatDzdSafe(h["amount_paid_minor"] ?? 0)} num />
            </>
          ) : null}
        </Card>

        <Card className="space-y-2.5 p-4 text-sm">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Historique des paiements ({data.payments.length})
          </div>
          {data.payments.length === 0 ? (
            <p className="text-slate-500">Aucun paiement enregistré.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-left uppercase tracking-[0.1em] text-slate-500">
                <tr>
                  <th className="py-1 pr-2">Date</th>
                  <th className="py-1 pr-2 text-right">Montant</th>
                  <th className="py-1 pr-2">Moyen</th>
                  <th className="py-1">Réf.</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id} className="border-t border-white/[0.06]">
                    <td className="whitespace-nowrap py-1 pr-2 tabular-nums text-slate-400">
                      {p.payment_date.slice(0, 10)}
                    </td>
                    <td className="py-1 pr-2 text-right font-bold tabular-nums text-emerald-300/90">
                      {formatDzd(p.amount_minor)}
                    </td>
                    <td className="py-1 pr-2">{PAYMENT_METHOD_LABELS[p.method] ?? "—"}</td>
                    <td
                      className="max-w-[90px] truncate py-1 text-slate-400"
                      title={p.reference ?? ""}
                    >
                      {p.reference || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Button
          onClick={() => {
            onPay(toRow());
          }}
        >
          <HandCoins size={15} aria-hidden="true" /> Enregistrer un paiement
        </Button>
        {debtType === "customer" ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => onDueDate(toRow())}>
              <Pencil size={15} aria-hidden="true" /> Échéance
            </Button>
            <Button variant="secondary" onClick={() => void openTicket()} disabled={busy}>
              <ReceiptText size={15} aria-hidden="true" />{" "}
              {busy ? "Chargement…" : "Voir le document"}
            </Button>
          </div>
        ) : null}
        <Button variant="secondary" onClick={onClose} className="w-full">
          Fermer
        </Button>
      </Drawer>

      {ticket ? (
        <Modal label="Ticket de vente" title="Ticket de vente" onClose={() => setTicket(null)} wide>
          <iframe
            sandbox=""
            srcDoc={ticket.htmlA4}
            title="Aperçu ticket"
            className="h-[50vh] w-full rounded-xl border border-white/10 bg-white"
          />
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
    </>
  );
}

// ---------------------------------------------------------------------------
// Paiement de dette (client : sur la vente ; fournisseur : sur le compte).
// ---------------------------------------------------------------------------

export function DebtPaymentDialog({
  row,
  onClose,
  onSaved,
  notify,
}: {
  row: DebtRow;
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [amountText, setAmountText] = useState(
    (row.remaining_minor / 100).toString().replace(".", ","),
  );
  const [method, setMethod] = useState<"cash" | "cheque" | "transfer">("cash");
  const [date, setDate] = useState(todayUtcDate());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  // Idempotence (migration 0020) : un UUID par dialogue, régénéré après succès.
  const [operationId, setOperationId] = useState<string>(() => newOperationId());
  const touched = useRef(false);
  const { value: supplierDefaults } = useAppSettings<{
    defaultPaymentMethod: "cash" | "cheque" | "transfer";
  }>("suppliers");

  useEffect(() => {
    if (!touched.current && row.debt_type === "supplier" && supplierDefaults) {
      setMethod(supplierDefaults.defaultPaymentMethod);
    }
  }, [supplierDefaults]);

  // P1-5 : strict (bornes H-1, jamais NaN) ; invalide → -1 = refusé par `valid`.
  const amount = strictOrNeg(amountText, "Montant");
  const valid = Number.isInteger(amount) && amount > 0 && amount <= row.remaining_minor;

  async function save(): Promise<void> {
    if (!valid) {
      notify("Montant invalide (1 centime → reste dû).", "err");
      return;
    }
    setBusy(true);
    try {
      // P2 : accusés validés (jamais de cast).
      if (row.debt_type === "customer") {
        const det = (await api.debtDetail({ debtType: "customer", id: row.entity_id })) as {
          header: { customer_id: number | null };
        };
        await callChecked(
          (a) =>
            a.customers.recordPayment({
              operationId,
              customerId: det.header.customer_id,
              saleId: row.entity_id,
              amountMinor: amount,
              method,
              reference: reference.trim() === "" ? null : reference.trim(),
              notes: notes.trim() === "" ? null : notes.trim(),
              paymentDate: date,
            }),
          paymentAckSchema,
        );
      } else {
        await callChecked(
          (a) =>
            a.suppliers.pay({
              operationId,
              supplierId: row.entity_id,
              amountMinor: amount,
              method,
              reference: reference.trim() === "" ? null : reference.trim(),
              notes: notes.trim() === "" ? null : notes.trim(),
              paymentDate: date,
            }),
          paymentAckSchema,
        );
      }
      setOperationId(newOperationId());
      notify(`Paiement ${formatDzd(amount)} enregistré.`, "ok");
      // P5 : encaissement = caisse.
      playSound("cash");
      onSaved();
    } catch (e) {
      notify(frError(e, "Paiement impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      label={row.debt_type === "customer" ? "Encaissement" : "Paiement fournisseur"}
      title={`${row.debt_type === "customer" ? "Encaisser" : "Payer"} — ${row.party_name}`}
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <dl className="space-y-1.5 rounded-xl bg-black/25 p-4 text-sm">
          <div className="flex justify-between text-slate-300">
            <dt>Référence</dt>
            <dd className="font-mono font-bold">{row.ref}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-white/10 pt-2">
            <dt className="font-extrabold">Reste dû</dt>
            <dd className="text-xl font-extrabold tabular-nums text-red-300">
              {formatDzd(row.remaining_minor)}
            </dd>
          </div>
          <div className="flex justify-between font-bold text-emerald-300">
            <dt>Nouveau solde</dt>
            <dd className="tabular-nums">
              {formatDzd(valid ? row.remaining_minor - amount : row.remaining_minor)}
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
              aria-label="Montant du paiement"
            />
          </Field>
          <Field label="Moyen de paiement">
            <Select
              value={method}
              onChange={(e) => {
                touched.current = true;
                setMethod(e.target.value as "cash" | "cheque" | "transfer");
              }}
              aria-label="Moyen de paiement"
            >
              <option value="cash">{PAYMENT_METHOD_LABELS["cash"]}</option>
              <option value="cheque">{PAYMENT_METHOD_LABELS["cheque"]}</option>
              <option value="transfer">{PAYMENT_METHOD_LABELS["transfer"]}</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date de paiement">
            <TextInput
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Date de paiement"
            />
          </Field>
          <Field label="Référence" hint="Optionnel.">
            <TextInput
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ex. : CHQ-123"
              aria-label="Référence"
            />
          </Field>
        </div>
        <Field label="Notes" hint="Optionnel.">
          <TextInput
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex. : acompte…"
            aria-label="Notes du paiement"
          />
        </Field>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button type="submit" disabled={busy || !valid} className="flex-[2]">
            {busy ? "Enregistrement…" : `Enregistrer ${formatDzd(valid ? amount : 0)}`}
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Paiement borné par le reste dû (aucun dépassement accepté).
        </p>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Échéance d'une créance client.
// ---------------------------------------------------------------------------

export function DebtDueDateDialog({
  row,
  onClose,
  onSaved,
  notify,
}: {
  row: DebtRow;
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [date, setDate] = useState(row.due_date ? row.due_date.slice(0, 10) : "");
  const [busy, setBusy] = useState(false);

  async function save(clear: boolean): Promise<void> {
    setBusy(true);
    try {
      await api.saleSetDueDate({ id: row.entity_id, dueDate: clear ? null : date });
      notify(clear ? "Échéance retirée." : `Échéance fixée au ${date}.`, "ok");
      onSaved();
    } catch (e) {
      notify(frError(e, "Enregistrement impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label="Échéance" title={`Échéance — ${row.ref}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Date d'échéance" hint="Vide = sans échéance.">
          <TextInput
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Date d'échéance"
          />
        </Field>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void save(true)}
            disabled={busy}
            className="flex-1"
          >
            Retirer
          </Button>
          <Button
            onClick={() => void save(false)}
            disabled={busy || date === ""}
            className="flex-[2]"
          >
            {busy ? "Enregistrement…" : "Fixer l'échéance"}
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Une échéance dépassée marque la créance « En retard » et alimente la carte du jour.
        </p>
      </div>
    </Modal>
  );
}
