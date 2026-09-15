// Veloria PoS — Domain: zakat calculation (reporting only, never a ledger).
// All source values come from SQLite; rate/nisab/assumptions are explicit inputs.
import { DomainError } from "../common/errors.ts";

export interface ZakatInputs {
  cashMinor: number;
  inventoryValueMinor: number;
  customerDebtsMinor: number;
  supplierDebtsMinor: number;
  nisabMinor: number;
  ratePercent: number; // e.g. 2.5
}

export interface ZakatResult {
  zakatableBaseMinor: number;
  zakatDueMinor: number;
  aboveNisab: boolean;
}

export function calculateZakat(input: ZakatInputs): ZakatResult {
  for (const [k, v] of Object.entries(input)) {
    if (!Number.isFinite(v as number) || (v as number) < 0) {
      throw new DomainError("VALIDATION_ERROR", `Entrée zakat invalide : ${k}.`);
    }
  }
  if (input.ratePercent <= 0 || input.ratePercent > 100) {
    throw new DomainError("VALIDATION_ERROR", "Taux de zakat invalide.");
  }
  const base = Math.max(
    0,
    input.cashMinor +
      input.inventoryValueMinor +
      input.customerDebtsMinor -
      input.supplierDebtsMinor,
  );
  const aboveNisab = base >= input.nisabMinor && input.nisabMinor > 0;
  const due = aboveNisab ? Math.round((base * input.ratePercent) / 100) : 0;
  return { zakatableBaseMinor: base, zakatDueMinor: due, aboveNisab };
}
