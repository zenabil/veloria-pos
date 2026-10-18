// Veloria PoS — Caisse : bloc partagé montant + moyen de paiement.
// Factorisé de PayDialog/SettleDialog (mêmes champs, mêmes libellés FR).
import { PAYMENT_METHOD_LABELS } from "@shared/formatters/format.ts";
import { Field, Select, TextInput } from "@shared/ui/primitives.tsx";

export type PaymentMethod = "cash" | "cheque" | "transfer";

export function AmountMethodFields({
  amountLabel,
  amountAria,
  amountValue,
  onAmountChange,
  methodValue,
  onMethodChange,
}: {
  amountLabel: string;
  amountAria: string;
  amountValue: string;
  onAmountChange: (v: string) => void;
  methodValue: PaymentMethod;
  onMethodChange: (m: PaymentMethod) => void;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={amountLabel}>
        <TextInput
          value={amountValue}
          onChange={(e) => onAmountChange(e.target.value)}
          inputMode="decimal"
          placeholder="0,00"
          aria-label={amountAria}
        />
      </Field>
      <Field label="Moyen de paiement">
        <Select
          value={methodValue}
          onChange={(e) => onMethodChange(e.target.value as PaymentMethod)}
          aria-label="Moyen de paiement"
        >
          <option value="cash">{PAYMENT_METHOD_LABELS["cash"]}</option>
          <option value="cheque">{PAYMENT_METHOD_LABELS["cheque"]}</option>
          <option value="transfer">{PAYMENT_METHOD_LABELS["transfer"]}</option>
        </Select>
      </Field>
    </div>
  );
}
