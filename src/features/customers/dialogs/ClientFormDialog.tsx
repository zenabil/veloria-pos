// Veloria PoS — Clients : formulaire (création + édition).
// Extrait de `ClientDialogs.tsx` (découpage sans changement de comportement).
// Branché sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useEffect, useState } from "react";
import {
  ChevronDown,
  Info,
  MapPin,
  StickyNote,
  TriangleAlert,
  UserRound,
  Wallet,
} from "lucide-react";

import { api } from "@shared/types/ipc-client.ts";
import { minorToInput, parseDzdInputStrict } from "@domain/money/money.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { newOperationId } from "@domain/common/ids.ts";
import {
  Button,
  Field,
  Kbd,
  Modal,
  Switch,
  TextArea,
  TextInput,
  cn,
} from "@shared/ui/primitives.tsx";
import { FormSection } from "@shared/ui/form-section.tsx";
import { fullName, resolveCustomerName } from "../types.ts";
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
  const [nameEdited, setNameEdited] = useState(false);
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
  const [notesOpen, setNotesOpen] = useState((customer?.notes ?? "").trim() !== "");
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

  // Un nom existant n'est découpé qu'après une modification explicite : un nom
  // de famille composé (« Ben Ali ») ne doit pas être réinterprété en éditant
  // seulement le téléphone.
  const { firstName, lastName } = resolveCustomerName(customer, full, nameEdited);

  async function save(): Promise<void> {
    if (busy) return;
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
          operationId,
          firstName,
          lastName,
          phone: phone.trim() === "" ? null : phone.trim(),
          address: address.trim() === "" ? null : address.trim(),
          creditLimitMinor: limitMinor,
          creditAllowed,
          settlementDay: settle,
          notes: notes.trim() === "" ? null : notes.trim(),
        });
        setOperationId(newOperationId());
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
      title={
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fbbf24]/10 text-[#fbbf24] ring-1 ring-[#fbbf24]/20"
          >
            <UserRound size={16} />
          </span>
          <span>{editing ? "Modifier le client" : "Nouveau client"}</span>
        </span>
      }
      onClose={onClose}
      extraWide
    >
      <form
        className="space-y-3.5 [&_input]:scroll-mb-24 [&_textarea]:scroll-mb-24"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            void save();
          }
        }}
      >
        <p className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed text-slate-500">
          <Info size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-[#fbbf24]" />
          <span>
            Seul le <span className="font-semibold text-slate-300">nom complet</span> est
            obligatoire — téléphone, adresse et crédit peuvent être complétés plus tard.
          </span>
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-3">
            <FormSection
              icon={<UserRound size={14} aria-hidden="true" />}
              title="Identité & contact"
              hint="Nom, téléphone"
            >
              <Field label="Nom complet" hint="Prénom + nom (le dernier mot = nom de famille).">
                <TextInput
                  value={full}
                  onChange={(e) => {
                    setFull(e.target.value);
                    setNameEdited(true);
                  }}
                  placeholder="Ex. : Amine Benali"
                  aria-label="Nom complet"
                  autoComplete="name"
                />
              </Field>
              <div aria-live="polite" className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-md border border-white/10 bg-black/25 px-2 py-1 text-slate-400">
                  Prénom :{" "}
                  <strong className="font-semibold text-slate-200">{firstName || "—"}</strong>
                </span>
                <span className="rounded-md border border-white/10 bg-black/25 px-2 py-1 text-slate-400">
                  Nom : <strong className="font-semibold text-slate-200">{lastName || "—"}</strong>
                </span>
              </div>
              <Field label="Téléphone" hint="Optionnel — 30 caractères max.">
                <TextInput
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  placeholder="Ex. : 0550 12 34 56"
                  aria-label="Téléphone"
                  autoComplete="tel"
                  maxLength={30}
                />
              </Field>
            </FormSection>

            <FormSection
              icon={<MapPin size={14} aria-hidden="true" />}
              title="Adresse"
              hint="Optionnel"
            >
              <Field label="Adresse">
                <TextInput
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ex. : Alger centre"
                  aria-label="Adresse"
                  autoComplete="street-address"
                  maxLength={300}
                />
              </Field>
            </FormSection>
          </div>

          <div className="space-y-3">
            <FormSection
              icon={<Wallet size={14} aria-hidden="true" />}
              title="Crédit & règlement"
              hint={creditAllowed ? "Crédit autorisé" : "Comptant"}
            >
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm font-semibold">
                <span>
                  Crédit autorisé
                  <span className="block text-xs font-normal text-slate-500">
                    Autorise les impayés (vente à crédit). Sans plafond, tout impayé reste possible.
                  </span>
                  {!creditOpen ? (
                    <span className="mt-1 flex items-center gap-1 text-xs font-bold text-red-300">
                      <TriangleAlert size={12} aria-hidden="true" />
                      Crédit général coupé (Paramètres → Vente).
                    </span>
                  ) : null}
                </span>
                <Switch
                  checked={creditAllowed}
                  onChange={() => setCreditAllowed((a) => !a)}
                  ariaLabel="Crédit autorisé"
                />
              </label>
              {creditAllowed ? (
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="Plafond de crédit (DZD)" hint="Alerte au-delà.">
                    <TextInput
                      value={creditLimit}
                      onChange={(e) => setCreditLimit(e.target.value)}
                      inputMode="decimal"
                      placeholder="0,00"
                      aria-label="Plafond de crédit"
                      className="font-mono tabular-nums"
                    />
                  </Field>
                  <Field label="Jour de règlement" hint="1 – 31 · vide = libre.">
                    <TextInput
                      value={settleDay}
                      onChange={(e) => setSettleDay(e.target.value)}
                      inputMode="numeric"
                      placeholder="—"
                      aria-label="Jour de règlement mensuel"
                      className="font-mono tabular-nums"
                    />
                  </Field>
                </div>
              ) : (
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
                    className="font-mono tabular-nums"
                  />
                </Field>
              )}
            </FormSection>

            <div className="rounded-xl border border-white/[0.08] bg-black/25">
              <button
                type="button"
                aria-expanded={notesOpen}
                aria-controls="client-notes"
                onClick={() => setNotesOpen((o) => !o)}
                className="flex min-h-[48px] w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
              >
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-slate-400"
                >
                  <StickyNote size={14} />
                </span>
                <span className="text-sm font-bold text-slate-200">Notes</span>
                <span className="ml-auto text-[11px] text-slate-500">
                  {notes.trim() === "" ? "Optionnel" : `${notes.length} / 500`}
                </span>
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className={cn(
                    "shrink-0 text-slate-400 transition-transform",
                    notesOpen && "rotate-180",
                  )}
                />
              </button>
              {notesOpen ? (
                <div id="client-notes" className="border-t border-white/[0.08] p-3.5">
                  <TextArea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ex. : paie en fin de mois…"
                    aria-label="Notes"
                    maxLength={500}
                  />
                  <p className="mt-1 text-right font-mono text-[11px] text-slate-500">
                    {notes.length} / 500
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 z-10 -mx-6 flex flex-col-reverse gap-3 border-t border-white/10 bg-[#122131]/95 px-6 py-3.5 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1 text-[11px] text-slate-500">
            <Kbd>Ctrl</Kbd>
            <span>+</span>
            <Kbd>Entrée</Kbd>
            <span className="ml-1">pour enregistrer</span>
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1 sm:flex-none sm:min-w-[108px]"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={busy}
              className="flex-[2] sm:flex-none sm:min-w-[170px]"
            >
              {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Créer le client"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
