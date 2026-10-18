// Veloria PoS — Vente : règlement de dette client (extrait de sell-finalize).
// Montant strict borné par la dette, accusé validé, idempotence operationId.
import { playSound } from "@shared/sound/sound.ts";
import { formatDzd, minorToInput, parseDzdInputStrict } from "@domain/money/money.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { callChecked, paymentAckSchema } from "@shared/types/ipc-contracts.ts";
import { fetchCustomerCredit } from "./sell-search.ts";
import type { SellFlowDeps } from "./sell-finalize.ts";

export function openSettle(d: SellFlowDeps): void {
  if (d.cart.customerId == null || d.customerBalance == null || d.customerBalance <= 0) {
    d.notify("Aucune dette à régler pour ce client.", "err");
    return;
  }
  d.setSettleAmount(minorToInput(d.customerBalance));
  d.setSettleMethod("cash");
  d.setSettleOperationId(newOperationId());
  d.setSettleOpen(true);
}

export async function settleDebt(d: SellFlowDeps): Promise<void> {
  if (d.cart.customerId == null || d.settleBusy || d.settleGuard.current) return;
  // P1-5 : strict (bornes H-1, jamais NaN) — erreur FR mappée.
  let amountMinor = 0;
  try {
    amountMinor = parseDzdInputStrict(
      d.settleAmount.trim() === "" ? "0" : d.settleAmount,
      "Montant",
    );
  } catch (e) {
    d.notify(frError(e, "Montant invalide."), "err");
    return;
  }
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    d.notify("Montant invalide.", "err");
    return;
  }
  if (d.customerBalance != null && amountMinor > d.customerBalance) {
    d.notify("Le montant dépasse la dette du client.", "err");
    return;
  }
  d.settleGuard.current = true;
  d.setSettleBusy(true);
  try {
    // P2 : accusé validé (jamais de cast).
    await callChecked(
      (a) =>
        a.customers.recordPayment({
          operationId: d.settleOperationId,
          customerId: d.cart.customerId,
          saleId: null,
          amountMinor,
          method: d.settleMethod,
        }),
      paymentAckSchema,
    );
    d.notify(`Paiement de ${formatDzd(amountMinor)} enregistré.`, "ok");
    // P5 : encaissement = caisse.
    playSound("cash");
    d.setSettleOpen(false);
    d.setSettleOperationId(newOperationId());
    d.setCustomerBalance((await fetchCustomerCredit(d.cart.customerId)).balance);
  } catch (e) {
    d.notify(frError(e, "Règlement impossible."), "err");
  } finally {
    d.settleGuard.current = false;
    d.setSettleBusy(false);
  }
}
