// Veloria PoS — Fournisseurs : tiroir détail + formulaire + paiement + historique.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useState } from "react";

import { api } from "@shared/types/ipc-client.ts";

import { newOperationId } from "@domain/common/ids.ts";
import { validateSupplierDraft } from "@domain/suppliers/supplier-rules.ts";

import { Button, Field, Modal, Switch, TextArea, TextInput } from "@shared/ui/primitives.tsx";

import { type Supplier } from "../types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

// ---------------------------------------------------------------------------
// Formulaire création / édition.
// ---------------------------------------------------------------------------

export function SupplierFormDialog({
  supplier,
  onClose,
  onSaved,
  notify,
}: {
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const editing = supplier != null;
  const [code, setCode] = useState(supplier?.code ?? "");
  const [name, setName] = useState(supplier?.name ?? "");
  const [contact, setContact] = useState(supplier?.contact_person ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [address, setAddress] = useState(supplier?.address ?? "");
  const [taxNumber, setTaxNumber] = useState(supplier?.tax_number ?? "");
  const [commercialRegister, setCommercialRegister] = useState(supplier?.commercial_register ?? "");
  const [notes, setNotes] = useState(supplier?.notes ?? "");
  const [isActive, setIsActive] = useState(supplier ? supplier.is_active === 1 : true);
  const [busy, setBusy] = useState(false);
  // Idempotence (migration 0022) : un UUID par dialogue de création, régénéré
  // après succès — rejouer le même UUID retrouve le fournisseur existant.
  const [createOperationId, setCreateOperationId] = useState<string>(() => newOperationId());

  async function save(): Promise<void> {
    const draft = {
      name: name.trim(),
      code: code.trim() === "" ? null : code.trim(),
      contact: contact.trim() === "" ? null : contact.trim(),
      phone: phone.trim() === "" ? null : phone.trim(),
      email: email.trim() === "" ? null : email.trim(),
      address: address.trim() === "" ? null : address.trim(),
      taxNumber: taxNumber.trim() === "" ? null : taxNumber.trim(),
      commercialRegister: commercialRegister.trim() === "" ? null : commercialRegister.trim(),
      notes: notes.trim() === "" ? null : notes.trim(),
    };
    try {
      validateSupplierDraft(draft);
    } catch (e) {
      notify(frError(e, "Fiche invalide."), "err");
      return;
    }
    setBusy(true);
    try {
      if (supplier == null) {
        await api.supplierCreate({ ...draft, isActive, operationId: createOperationId });
        setCreateOperationId(newOperationId());
        notify(`Fournisseur « ${draft.name} » créé.`, "ok");
      } else {
        // M-3: pure update — no operationId (idempotent by value, contract has none).
        await api.supplierUpdate({ id: supplier.id, ...draft, isActive });
        notify("Fiche fournisseur enregistrée.", "ok");
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
      label={editing ? "Modifier le fournisseur" : "Nouveau fournisseur"}
      title={editing ? "Modifier le fournisseur" : "Nouveau fournisseur"}
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code" hint="Vide = généré (FOU-00001).">
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="FOU-00001"
              aria-label="Code fournisseur"
            />
          </Field>
          <Field label="Nom *">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. : Moulin El Baraka"
              aria-label="Nom fournisseur"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact">
            <TextInput
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Personne à contacter"
              aria-label="Contact"
            />
          </Field>
          <Field label="Téléphone">
            <TextInput
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="Ex. : 0550 12 34 56"
              aria-label="Téléphone"
            />
          </Field>
        </div>
        <Field label="E-mail">
          <TextInput
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            inputMode="email"
            placeholder="Ex. : contact@moulin.dz"
            aria-label="E-mail"
          />
        </Field>
        <Field label="Adresse">
          <TextInput
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Ex. : Zone industrielle, Alger"
            aria-label="Adresse"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="NIF" hint="Numéro d'identification fiscale.">
            <TextInput
              value={taxNumber}
              onChange={(e) => setTaxNumber(e.target.value)}
              placeholder="Ex. : 000123456789012"
              aria-label="NIF"
            />
          </Field>
          <Field label="Registre de commerce">
            <TextInput
              value={commercialRegister}
              onChange={(e) => setCommercialRegister(e.target.value)}
              placeholder="Ex. : 16/00-1234567 B 20"
              aria-label="Registre de commerce"
            />
          </Field>
        </div>
        <Field label="Notes" hint="Optionnel (500 caractères max).">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex. : livraison le mardi…"
            aria-label="Notes"
          />
        </Field>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold">
          <span>
            Fournisseur actif
            <span className="block text-xs font-normal text-slate-500">
              Inactif = masqué du filtre « Actifs », historique conservé.
            </span>
          </span>
          <Switch
            checked={isActive}
            onChange={() => setIsActive((a) => !a)}
            ariaLabel="Fournisseur actif"
          />
        </label>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button type="submit" disabled={busy} className="flex-[2]">
            {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Créer le fournisseur"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Création inline (depuis produit / réception) : mêmes champs + mêmes
// validateurs que le dialogue complet, sans quitter l'écran parent.
// Retourne le fournisseur créé pour sélection auto (saisie parente intacte).
// ---------------------------------------------------------------------------

export interface CreatedSupplier {
  id: number;
  name: string;
  code: string | null;
}

export function SupplierQuickForm({
  onCreated,
  onClose,
  notify,
}: {
  onCreated: (s: CreatedSupplier) => void;
  onClose: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [commercialRegister, setCommercialRegister] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  // Idempotence : un UUID par formulaire, régénéré après succès.
  const [createOperationId, setCreateOperationId] = useState<string>(() => newOperationId());

  async function save(): Promise<void> {
    const draft = {
      name: name.trim(),
      code: code.trim() === "" ? null : code.trim(),
      contact: contact.trim() === "" ? null : contact.trim(),
      phone: phone.trim() === "" ? null : phone.trim(),
      email: email.trim() === "" ? null : email.trim(),
      address: address.trim() === "" ? null : address.trim(),
      taxNumber: taxNumber.trim() === "" ? null : taxNumber.trim(),
      commercialRegister: commercialRegister.trim() === "" ? null : commercialRegister.trim(),
      notes: notes.trim() === "" ? null : notes.trim(),
    };
    try {
      validateSupplierDraft(draft);
    } catch (e) {
      notify(frError(e, "Fiche invalide."), "err");
      return;
    }
    setBusy(true);
    try {
      const res = (await api.supplierCreate({
        ...draft,
        isActive,
        operationId: createOperationId,
      })) as { id: number };
      setCreateOperationId(newOperationId());
      // Code effectif (auto-généré si vide) : relu pour la suggestion de
      // N° facture en réception ; repli = code saisi.
      let effectiveCode: string | null = draft.code;
      try {
        const found = (await api.supplierSearch({
          query: draft.name,
          page: 1,
          pageSize: 10,
        })) as { rows: { id: number; name: string; code: string | null }[] };
        const row = found.rows.find((s) => s.id === res.id);
        if (row) effectiveCode = row.code ?? effectiveCode;
      } catch {
        /* repli : code saisi */
      }
      notify(`Fournisseur « ${draft.name} » créé.`, "ok");
      onCreated({ id: res.id, name: draft.name, code: effectiveCode });
    } catch (e) {
      notify(frError(e, "Enregistrement impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Code" hint="Vide = généré (FOU-00001).">
          <TextInput
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="FOU-00001"
            aria-label="Code fournisseur"
          />
        </Field>
        <Field label="Nom *">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. : Moulin El Baraka"
            aria-label="Nom fournisseur"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contact">
          <TextInput
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Personne à contacter"
            aria-label="Contact"
          />
        </Field>
        <Field label="Téléphone">
          <TextInput
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="Ex. : 0550 12 34 56"
            aria-label="Téléphone"
          />
        </Field>
      </div>
      <Field label="E-mail">
        <TextInput
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          inputMode="email"
          placeholder="Ex. : contact@moulin.dz"
          aria-label="E-mail"
        />
      </Field>
      <Field label="Adresse">
        <TextInput
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Ex. : Zone industrielle, Alger"
          aria-label="Adresse"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="NIF" hint="Numéro d'identification fiscale.">
          <TextInput
            value={taxNumber}
            onChange={(e) => setTaxNumber(e.target.value)}
            placeholder="Ex. : 000123456789012"
            aria-label="NIF"
          />
        </Field>
        <Field label="Registre de commerce">
          <TextInput
            value={commercialRegister}
            onChange={(e) => setCommercialRegister(e.target.value)}
            placeholder="Ex. : 16/00-1234567 B 20"
            aria-label="Registre de commerce"
          />
        </Field>
      </div>
      <Field label="Notes" hint="Optionnel (500 caractères max).">
        <TextArea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex. : livraison le mardi…"
          aria-label="Notes"
        />
      </Field>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold">
        <span>
          Fournisseur actif
          <span className="block text-xs font-normal text-slate-500">
            Inactif = masqué du filtre « Actifs », historique conservé.
          </span>
        </span>
        <Switch
          checked={isActive}
          onChange={() => setIsActive((a) => !a)}
          ariaLabel="Fournisseur actif"
        />
      </label>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
          Annuler
        </Button>
        <Button type="submit" disabled={busy} className="flex-[2]">
          {busy ? "Enregistrement…" : "Créer le fournisseur"}
        </Button>
      </div>
    </form>
  );
}

export function SupplierQuickCreateDialog({
  onCreated,
  onClose,
  notify,
}: {
  onCreated: (s: CreatedSupplier) => void;
  onClose: () => void;
  notify: Notify;
}): React.JSX.Element {
  return (
    <Modal label="Nouveau fournisseur" title="Nouveau fournisseur" onClose={onClose}>
      <SupplierQuickForm onCreated={onCreated} onClose={onClose} notify={notify} />
    </Modal>
  );
}
