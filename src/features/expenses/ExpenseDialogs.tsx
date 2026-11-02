// Veloria PoS — Dépenses : tiroir détail + formulaire.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useState } from "react";
import { Pencil, Search, Trash2 } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { formatDzd, minorToInput, parseDzdInputStrict } from "@domain/money/money.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { validateExpenseDraft } from "@domain/expenses/expense-rules.ts";
import { todayBusinessDate } from "@domain/common/business-day.ts";
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
} from "@shared/ui/primitives.tsx";
import {
  expenseNumber,
  expenseStatusLabel,
  expenseStatusTone,
  paymentMethodLabel,
  type Expense,
} from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";

// ---------------------------------------------------------------------------
// Tiroir de détail dépense.
// ---------------------------------------------------------------------------

export function ExpenseDetailsDrawer({
  expense,
  onClose,
  onEdit,
  onDeleted,
  notify,
}: {
  expense: Expense;
  onClose: () => void;
  onEdit: (e: Expense) => void;
  onDeleted: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const confirmAsync = useConfirm();

  async function remove(): Promise<void> {
    if (!(await confirmAsync(`Supprimer la dépense « ${expense.description} » ? Irréversible.`)))
      return;
    setBusy(true);
    try {
      // Idempotence (P18) : caller-owned operationId — double-clic/retry sûr.
      await api.expenseDelete({ id: expense.id, operationId: newOperationId() });
      notify("Dépense supprimée.", "ok");
      onDeleted();
      onClose();
    } catch (e) {
      notify(frError(e, "Suppression impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      label={expenseNumber(expense.id)}
      title={expense.description}
      sub={expenseNumber(expense.id)}
      below={
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone={expenseStatusTone(expense.status)}>
            {expenseStatusLabel(expense.status)}
          </Badge>
          <Badge tone="grey">{expense.category}</Badge>
        </div>
      }
      onClose={onClose}
    >
      <Card className="p-4 text-center">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Montant
        </div>
        <div className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight text-amber-300">
          {formatDzd(expense.amount_minor)}
        </div>
        <div className="mt-1 text-xs text-slate-500">{expense.expense_date.slice(0, 10)}</div>
      </Card>

      <Card className="space-y-2.5 p-4 text-sm">
        <InfoRow label="Numéro" value={expenseNumber(expense.id)} />
        <InfoRow label="Date" value={expense.expense_date.slice(0, 10)} num />
        <InfoRow label="Catégorie" value={expense.category} />
        <InfoRow label="Description" value={expense.description} />
        <InfoRow label="Fournisseur" value={expense.supplier_name || "—"} />
        <InfoRow label="Paiement" value={paymentMethodLabel(expense.payment_method)} />
        <InfoRow label="Référence" value={expense.reference || "—"} />
        <InfoRow label="Statut" value={expenseStatusLabel(expense.status)} />
        {expense.notes ? <InfoRow label="Notes" value={expense.notes} /> : null}
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => onEdit(expense)}>
          <Pencil size={15} aria-hidden="true" /> Modifier
        </Button>
        <Button variant="secondary" onClick={() => void remove()} disabled={busy}>
          <Trash2 size={15} aria-hidden="true" /> {busy ? "Suppression…" : "Supprimer"}
        </Button>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Formulaire création / édition.
// ---------------------------------------------------------------------------

export function ExpenseFormDialog({
  expense,
  categories,
  onClose,
  onSaved,
  notify,
}: {
  expense: Expense | null;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const editing = expense != null;
  const [date, setDate] = useState(expense?.expense_date.slice(0, 10) ?? todayBusinessDate());
  const [category, setCategory] = useState(expense?.category ?? "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(expense ? minorToInput(expense.amount_minor) : "");
  const [method, setMethod] = useState<"cash" | "cheque" | "transfer" | "">(
    (expense?.payment_method as "cash" | "cheque" | "transfer" | null) ?? "cash",
  );
  const [status, setStatus] = useState<"paid" | "pending">(expense?.status ?? "paid");
  const [supplierId, setSupplierId] = useState<number | null>(expense?.supplier_id ?? null);
  const [supplierName, setSupplierName] = useState(expense?.supplier_name ?? "");
  const [supplierQ, setSupplierQ] = useState("");
  const [supplierResults, setSupplierResults] = useState<{ id: number; name: string }[]>([]);
  const [reference, setReference] = useState(expense?.reference ?? "");
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [busy, setBusy] = useState(false);
  // Idempotence (migration 0022) : un UUID par dialogue de création, régénéré
  // après succès — rejouer le même UUID retrouve la dépense existante.
  const [operationId, setOperationId] = useState<string>(() => newOperationId());

  async function searchSuppliers(): Promise<void> {
    if (supplierQ.trim().length < 2) return;
    try {
      const res = (await api.supplierSearch({
        query: supplierQ.trim(),
        page: 1,
        pageSize: 8,
      })) as { rows: { id: number; name: string }[] };
      setSupplierResults(res.rows);
    } catch {
      setSupplierResults([]);
    }
  }

  function pickSupplier(id: number, name: string): void {
    setSupplierId(id);
    setSupplierName(name);
    setSupplierResults([]);
    setSupplierQ("");
  }

  async function save(): Promise<void> {
    // P1-5 : parse strict ( bornes H-1, jamais NaN) — erreur FR mappée.
    let minor = 0;
    try {
      minor = parseDzdInputStrict(amount.trim() === "" ? "0" : amount, "Montant");
    } catch (e) {
      notify(frError(e, "Montant invalide."), "err");
      return;
    }
    try {
      validateExpenseDraft({
        description: description.trim(),
        category: category.trim(),
        amountMinor: minor,
        expenseDate: date,
      });
    } catch (e) {
      notify(frError(e, "Fiche invalide."), "err");
      return;
    }
    if (status === "paid" && method === "") {
      notify("Moyen de paiement requis pour une dépense payée.", "err");
      return;
    }
    if (notes.trim().length > 500) {
      notify("Notes trop longues (500 max).", "err");
      return;
    }
    const payload = {
      description: description.trim(),
      category: category.trim(),
      amountMinor: minor,
      expenseDate: date,
      supplierId,
      paymentMethod: method === "" ? null : method,
      status,
      reference: reference.trim() === "" ? null : reference.trim(),
      notes: notes.trim() === "" ? null : notes.trim(),
    };
    setBusy(true);
    try {
      if (expense == null) {
        await api.expenseCreate({ ...payload, operationId });
        setOperationId(newOperationId());
        notify("Dépense enregistrée.", "ok");
      } else {
        // M-3: pure update — no operationId (idempotent by value, contract has none).
        await api.expenseUpdate({ ...payload, id: expense.id });
        notify("Dépense enregistrée.", "ok");
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
      label={editing ? "Modifier la dépense" : "Nouvelle dépense"}
      title={editing ? "Modifier la dépense" : "Nouvelle dépense"}
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
          <Field label="Date *">
            <TextInput
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Date de dépense"
            />
          </Field>
          <Field label="Catégorie *" hint="Existante ou nouvelle.">
            <TextInput
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ex. : Loyer, Électricité…"
              aria-label="Catégorie"
              list="expense-categories"
            />
            <datalist id="expense-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </div>
        <Field label="Description *">
          <TextInput
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex. : Facture Sonelgaz janvier"
            aria-label="Description"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Montant (DZD) *">
            <TextInput
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              aria-label="Montant"
            />
          </Field>
          <Field label="Statut">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as "paid" | "pending")}
              aria-label="Statut"
            >
              <option value="paid">Payée</option>
              <option value="pending">En attente</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Moyen de paiement">
            <Select
              value={method}
              onChange={(e) => setMethod(e.target.value as "cash" | "cheque" | "transfer" | "")}
              aria-label="Moyen de paiement"
            >
              <option value="cash">Espèces</option>
              <option value="cheque">Chèque</option>
              <option value="transfer">Virement</option>
              <option value="">—</option>
            </Select>
          </Field>
          <Field label="Référence" hint="Optionnel.">
            <TextInput
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ex. : FAC-SON-01"
              aria-label="Référence"
            />
          </Field>
        </div>
        <Field label="Fournisseur" hint="Optionnel.">
          {supplierId != null ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-black/25 px-4 py-2.5 text-sm">
              <span className="truncate font-semibold">{supplierName}</span>
              <button
                type="button"
                onClick={() => {
                  setSupplierId(null);
                  setSupplierName("");
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
                    value={supplierQ}
                    onChange={(e) => setSupplierQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void searchSuppliers();
                      }
                    }}
                    placeholder="Rechercher… (min. 2 lettres)"
                    aria-label="Rechercher un fournisseur"
                  />
                </div>
                <Button type="button" variant="secondary" onClick={() => void searchSuppliers()}>
                  <Search size={15} aria-hidden="true" />
                </Button>
              </div>
              {supplierResults.length > 0 ? (
                <ul className="mt-2 max-h-32 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10">
                  {supplierResults.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => pickSupplier(s.id, s.name)}
                        className="w-full px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-amber-400/10"
                      >
                        {s.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </Field>
        <Field label="Notes" hint="Optionnel (500 max).">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Précisez le motif…"
            aria-label="Notes"
          />
        </Field>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button type="submit" disabled={busy} className="flex-[2]">
            {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Créer la dépense"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
