// Veloria PoS — Caisse : règlement de dette standalone (P4, extrait de SellScreen).
import { formatDzd } from "@domain/money/money.ts";
import { PAYMENT_METHOD_LABELS } from "@shared/formatters/format.ts";
import { Button, Field, Modal, Select, TextInput } from "@shared/ui/primitives.tsx";

export function SettleDialog({
  customerLabel,
  customerBalance,
  settleAmount,
  setSettleAmount,
  settleMethod,
  setSettleMethod,
  settleBusy,
  onClose,
  onSubmit,
}: {
  customerLabel: string;
  customerBalance: number;
  settleAmount: string;
  setSettleAmount: (v: string) => void;
  settleMethod: "cash" | "cheque" | "transfer";
  setSettleMethod: (m: "cash" | "cheque" | "transfer") => void;
  settleBusy: boolean;
  onClose: () => void;
  onSubmit: () => void;
}): React.JSX.Element {
  return (
    <Modal label="Règlement dette" title={`Régler — ${customerLabel}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <dl className="space-y-1.5 rounded-xl bg-black/25 p-4 text-sm">
          <div className="flex items-baseline justify-between">
            <dt className="font-extrabold">Dette restante</dt>
            <dd className="text-xl font-extrabold tabular-nums text-red-300">
              {formatDzd(customerBalance)}
            </dd>
          </div>
        </dl>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Montant (DZD)">
            <TextInput
              value={settleAmount}
              onChange={(e) => setSettleAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              aria-label="Montant du règlement"
            />
          </Field>
          <Field label="Moyen de paiement">
            <Select
              value={settleMethod}
              onChange={(e) => setSettleMethod(e.target.value as "cash" | "cheque" | "transfer")}
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
            Retour
          </Button>
          <Button type="submit" disabled={settleBusy} className="flex-[2]">
            {settleBusy ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Encaissement standalone borné par la dette (aucun dépassement accepté).
        </p>
      </form>
    </Modal>
  );
}
