// Veloria PoS — Clients : formulaire (création + édition).
// Extrait de `ClientDialogs.tsx` (découpage sans changement de comportement).
// Branché sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { minorToInput, parseDzdInputStrict } from "@domain/money/money.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { Button, Field, Modal, TextArea, TextInput, cn } from "@shared/ui/primitives.tsx";
import { fullName, splitFullName } from "../types.ts";
import type { ClientFormDialogProps } from "./types.ts";

/** Formulaire client (création + édition). */
export function ClientFormDialog({
  customer,
  onClose,
  onSaved,
  notify,
}: ClientFormDialogProps): React.JSX.Element {
  const editing = customer != null;
  const [full, setFull] = useState(customer ? fullName(customer) : "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [creditAllowed, setCreditAllowed] = useState(customer?.credit_allowed === 1);
  const [settleDay, setSettleDay] = useState(
    customer?.settlement_day != null ? String(customer.settlement_day) : "",
  );
  const [creditLimit, setCreditLimit] = useState(
    customer && customer.credit_limit_minor > 0 ? minorToInput(customer.credit_limit_minor) : "",
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
          setCreditLimit((prev) => (prev === "" ? minorToInput(d.defaultCreditLimitMinor) : prev));
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
