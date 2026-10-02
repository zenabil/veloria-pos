// Veloria PoS — Retours : tiroir détail + création (client/fournisseur) + remboursement.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useState } from "react";

import { api } from "@shared/types/ipc-client.ts";

import { formatDzd, minorToInput } from "@domain/money/money.ts";
import { strictOrNeg } from "@shared/money/parse.ts";
import { newOperationId } from "@domain/common/ids.ts";

import { Button, Field, Modal, Select, TextInput } from "@shared/ui/primitives.tsx";
import { returnNumber, type ReturnRow } from "../types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { playSound } from "@shared/sound/sound.ts";

// ---------------------------------------------------------------------------
// Remboursement / récupération complémentaire.
// ---------------------------------------------------------------------------

export function ReturnRefundDialog({
  row,
  onClose,
  onSaved,
  notify,
}: {
  row: ReturnRow;
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const remaining = row.total_minor - row.settled_minor;
  const [amountText, setAmountText] = useState(minorToInput(remaining));
  const [method, setMethod] = useState<"cash" | "cheque" | "transfer">("cash");
  const [busy, setBusy] = useState(false);
  const amount = strictOrNeg(amountText, "Montant");
  const valid = Number.isInteger(amount) && amount > 0 && amount <= remaining;

  async function save(): Promise<void> {
    if (!valid) {
      notify("Montant invalide.", "err");
      return;
    }
    setBusy(true);
    try {
      await api.returnRefund({
        kind: row.kind,
        id: row.entity_id,
        amountMinor: amount,
        method,
        operationId: newOperationId(),
      });
      notify(`Règlement ${formatDzd(amount)} enregistré.`, "ok");
      // P5 : mouvement d'argent = caisse.
      playSound("cash");
      onSaved();
    } catch (e) {
      notify(frError(e, "Règlement impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  const num = returnNumber(row.kind, row.number, row.entity_id);
  return (
    <Modal
      label={row.kind === "customer" ? "Remboursement" : "Récupération"}
      title={`${row.kind === "customer" ? "Rembourser" : "Récupérer"} — ${num}`}
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
            <dt>Retour</dt>
            <dd className="font-mono font-bold">{num}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-white/10 pt-2">
            <dt className="font-extrabold">Reste</dt>
            <dd className="text-xl font-extrabold tabular-nums text-amber-300">
              {formatDzd(remaining)}
            </dd>
          </div>
          <div className="flex justify-between font-bold text-emerald-300">
            <dt>Nouveau reste</dt>
            <dd className="tabular-nums">{formatDzd(valid ? remaining - amount : remaining)}</dd>
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
          <Field label="Moyen de paiement">
            <Select
              value={method}
              onChange={(e) => setMethod(e.target.value as "cash" | "cheque" | "transfer")}
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
            {busy ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Le statut passe à « Remboursé » une fois le total soldé.
        </p>
      </form>
    </Modal>
  );
}
