// Veloria PoS — Domain: returns rules.
import { DomainError } from "../common/errors.ts";
import {
  assertSafeMinor,
  assertSafeTotal,
  MAX_MINOR_TOTAL,
  MoneyError,
  multiplyMinorByQuantity,
  sumSafeMinors,
} from "../money/money.ts";
import { assertValidQuantity } from "../common/quantity.ts";

/** H-1: money boundary violations surface as RETURN_ERROR (domain contract). */
function asReturnError(fn: () => void, fallback: string): void {
  try {
    fn();
  } catch (err) {
    if (err instanceof DomainError) throw err;
    throw new DomainError("RETURN_ERROR", err instanceof MoneyError ? err.message : fallback);
  }
}

export type ReturnKind = "customer" | "supplier";
export type ReturnStatus = "validated" | "partially_refunded" | "refunded" | "cancelled";

export const RETURN_REASONS = [
  "Défectueux",
  "Périmé",
  "Erreur de commande",
  "Excédent",
  "Changement d'avis",
  "Autre",
] as const;

/** Numéro stable (`RET-C-00001` client, `RET-S-00001` fournisseur). */
export function formatReturnNumber(kind: ReturnKind, id: number): string {
  if (!Number.isInteger(id) || id <= 0) {
    throw new DomainError("RETURN_ERROR", "Identifiant de retour invalide.");
  }
  return `${kind === "customer" ? "RET-C" : "RET-S"}-${String(id).padStart(5, "0")}`;
}

/** Statut dérivé du remboursé vs total (l'annulation est un drapeau à part). */
export function computeReturnStatus(totalMinor: number, settledMinor: number): ReturnStatus {
  asReturnError(
    () => assertSafeTotal(totalMinor, "Valeur de retour invalide"),
    "Valeur de retour invalide.",
  );
  asReturnError(
    () => assertSafeTotal(settledMinor, "Montant réglé invalide"),
    "Montant réglé invalide.",
  );
  if (settledMinor > totalMinor) {
    throw new DomainError("RETURN_ERROR", "Règlement supérieur à la valeur du retour.");
  }
  if (totalMinor > 0 && settledMinor >= totalMinor) return "refunded";
  if (settledMinor > 0) return "partially_refunded";
  return "validated";
}

/** Remboursement complémentaire : strictement positif, borné par le reste. */
export function assertAdditionalRefund(
  totalMinor: number,
  alreadySettledMinor: number,
  amountMinor: number,
): void {
  asReturnError(
    () => assertSafeTotal(totalMinor, "Valeur de retour invalide"),
    "Valeur de retour invalide.",
  );
  asReturnError(
    () => assertSafeTotal(alreadySettledMinor, "Montant réglé invalide"),
    "Montant réglé invalide.",
  );
  asReturnError(
    () => assertSafeMinor(amountMinor, { min: 1, label: "Montant de remboursement invalide" }),
    "Montant de remboursement invalide.",
  );
  if (alreadySettledMinor + amountMinor > totalMinor) {
    throw new DomainError("RETURN_ERROR", "Remboursement supérieur au solde du retour.");
  }
}

export interface ReturnLineInput {
  productId: number | null;
  productName: string;
  unitPriceMinor: number;
  purchasePriceMinor: number;
  soldQuantity: number;
  alreadyReturned: number;
  returnQuantity: number;
  restocked: boolean;
}

export function computeReturnLineTotal(unitPriceMinor: number, qty: number): number {
  assertValidQuantity(qty);
  asReturnError(
    () => assertSafeMinor(unitPriceMinor, { label: "Prix unitaire de retour invalide" }),
    "Prix unitaire de retour invalide.",
  );
  try {
    return multiplyMinorByQuantity(unitPriceMinor, qty);
  } catch (err) {
    throw new DomainError(
      "RETURN_ERROR",
      err instanceof MoneyError ? err.message : "Prix unitaire de retour invalide.",
    );
  }
}

export function validateReturnLines(lines: ReturnLineInput[]): number {
  if (lines.length === 0) throw new DomainError("RETURN_ERROR", "Aucune ligne à retourner.");
  if (lines.length > 500)
    throw new DomainError("RETURN_ERROR", "Retour trop volumineux (max 500 lignes).");
  const totals: number[] = [];
  for (const l of lines) {
    assertValidQuantity(l.returnQuantity);
    const eligible = l.soldQuantity - l.alreadyReturned;
    if (l.returnQuantity > eligible) {
      throw new DomainError(
        "RETURN_ERROR",
        `Quantité retournée (${l.returnQuantity}) supérieure à la quantité éligible (${eligible}) pour « ${l.productName} ».`,
      );
    }
    totals.push(computeReturnLineTotal(l.unitPriceMinor, l.returnQuantity));
  }
  try {
    return sumSafeMinors(totals, "Total retour invalide");
  } catch (err) {
    throw new DomainError(
      "RETURN_ERROR",
      err instanceof MoneyError ? err.message : "Total retour invalide.",
    );
  }
}

/**
 * Valeur NETTE rendue d'une ligne de retour (après remise), au prorata de la
 * quantité retournée. `soldLineTotalMinor` (le `line_total_minor` de la ligne
 * vendue) fait foi — JAMAIS le prix catalogue.
 *
 * A20 (audit 2026-10-27) — RÈGLE UNIQUE : cette valeur vivait en deux copies
 * divergentes (aperçu caisse d'un côté, main de l'autre : le renderer retombait
 * sur `prix catalogue × qté` quand la donnée lui semblait illisible, valeur que
 * le serveur refuse). La variante stricte s'applique au main, la variante SÛRE
 * sert au rendu (doctrine A-01 : une exception au rendu tue l'écran du caissier),
 * et `main-domain-parity.test.ts` prouve qu'elles calculent identiquement.
 */
export function netReturnLineValue(args: {
  soldLineTotalMinor: number;
  soldQuantity: number;
  returnedQuantity: number;
}): number {
  const { soldLineTotalMinor, soldQuantity, returnedQuantity } = args;
  if (
    !(soldQuantity > 0) ||
    !Number.isSafeInteger(soldLineTotalMinor) ||
    soldLineTotalMinor < 0 ||
    soldLineTotalMinor > MAX_MINOR_TOTAL
  ) {
    throw new DomainError("RETURN_ERROR", "Valeur de la ligne vendue invalide.");
  }
  const partTh = Math.round(returnedQuantity * 1000);
  const wholeTh = Math.round(soldQuantity * 1000);
  if (!(wholeTh > 0)) {
    throw new DomainError("RETURN_ERROR", "Quantité vendue invalide.");
  }
  return partTh >= wholeTh
    ? soldLineTotalMinor
    : Math.round((soldLineTotalMinor * partTh) / wholeTh);
}

/** Variante d'aperçu renderer : jamais d'exception (A-01), donnée illisible ⇒ 0. */
export function netReturnLineValueSafe(args: {
  soldLineTotalMinor: number;
  soldQuantity: number;
  returnedQuantity: number;
}): number {
  try {
    return netReturnLineValue(args);
  } catch {
    return 0;
  }
}

export interface ReturnSettlementInput {
  totalReturnMinor: number;
  /** Solde dû du client au moment du retour (0 = aucune dette). */
  outstandingMinor: number;
  /** Espèces demandées par l'opérateur. */
  requestedRefundMinor: number;
}

export interface ReturnSettlement {
  /** Part imputée automatiquement à la dette du client. */
  creditAppliedMinor: number;
  /** Espèces effectivement autorisées (le reste non imputé). */
  cashRefundMinor: number;
  /** Plafond espèces = valeur retour − part imputée. */
  maxCashRefundMinor: number;
  /** Part ni imputée ni remboursée (règlement complémentaire ultérieur). */
  unsettledMinor: number;
}

/**
 * Politique propriétaire : la valeur du retour éteint d'abord la dette du
 * client, puis les espèces ne peuvent couvrir que l'excédent. Un solde
 * négatif (avoir historique) ne crée aucune dette imputable.
 *
 * Miroir main : `electron/ipc/handlers/return-settlement.ts` (electron/ ne
 * peut pas importer src/) — parité prouvée par
 * `tests/unit/main-domain-parity.test.ts`.
 */
export function computeReturnSettlement(input: ReturnSettlementInput): ReturnSettlement {
  asReturnError(
    () => assertSafeTotal(input.totalReturnMinor, "Valeur de retour invalide"),
    "Valeur de retour invalide.",
  );
  asReturnError(
    () => assertSafeTotal(input.requestedRefundMinor, "Remboursement invalide"),
    "Remboursement invalide.",
  );
  if (!Number.isSafeInteger(input.outstandingMinor)) {
    throw new DomainError("RETURN_ERROR", "Solde client invalide.");
  }
  const outstanding = Math.max(0, input.outstandingMinor);
  const creditAppliedMinor = Math.min(input.totalReturnMinor, outstanding);
  const maxCashRefundMinor = input.totalReturnMinor - creditAppliedMinor;
  if (input.requestedRefundMinor > maxCashRefundMinor) {
    throw new DomainError(
      "RETURN_ERROR",
      "Remboursement en espèces supérieur au montant non imputé à la dette du client.",
    );
  }
  return {
    creditAppliedMinor,
    cashRefundMinor: input.requestedRefundMinor,
    maxCashRefundMinor,
    unsettledMinor: input.totalReturnMinor - creditAppliedMinor - input.requestedRefundMinor,
  };
}

/**
 * A14 (audit 2026-10-27) — aperçu du règlement d'un retour : même politique que
 * `computeReturnSettlement` (la dette d'abord, les espèces pour l'excédent),
 * mais **jamais d'exception au rendu** (doctrine A-01) : une valeur illisible
 * donne un plafond à 0, donc le caissier voit un plafond refusé plutôt qu'un
 * plafond inventé. Le main garde la version stricte, autoritaire.
 */
export function previewReturnSettlement(input: ReturnSettlementInput): ReturnSettlement {
  try {
    return computeReturnSettlement(input);
  } catch {
    return {
      creditAppliedMinor: 0,
      cashRefundMinor: 0,
      maxCashRefundMinor: 0,
      unsettledMinor: 0,
    };
  }
}
