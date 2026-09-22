// Veloria PoS — Domain: FIFO cost allocation (framework-free, deterministic).
// Rule: FIFO drives inventory COST, never the selling price (fully independent).
// Quantities may be fractional (3 decimals max): allocation runs on integer
// thousandths to avoid float drift. Money stays in integer minor units (DZD).

import { DomainError } from "../common/errors.ts";
import { assertValidQuantity } from "../common/quantity.ts";
import { assertSafeMinor, assertSafeTotal, multiplyMinorByQuantity } from "../money/money.ts";

export interface FifoLayerInput {
  id: number;
  remainingQty: number;
  unitCostMinor: number;
}

export interface FifoConsumption {
  /** Null = oversell beyond layers (fallback cost, see resolveOversellUnitCost). */
  layerId: number | null;
  quantity: number;
  unitCostMinor: number;
  costMinor: number;
}

export interface FifoAllocation {
  consumptions: FifoConsumption[];
  cogsMinor: number;
  /** Quantity that could not be covered by layers (0 when fully covered). */
  shortQty: number;
}

const TH = 1000;

function toThousandths(qty: number): number {
  assertValidQuantity(qty, { allowZero: true });
  return Math.round(qty * TH);
}

/**
 * Allocate `quantity` from `layers` oldest-first (array order = age order).
 * Never mutates inputs. Per-piece cost uses Math.round like the rest of the
 * codebase (minor × qty). Throws on invalid quantity (never partial).
 */
export function allocateFifo(layers: FifoLayerInput[], quantity: number): FifoAllocation {
  assertValidQuantity(quantity);
  if (layers.length > 10000) {
    throw new DomainError("STOCK_ERROR", "Trop de couches FIFO.");
  }
  let need = toThousandths(quantity);
  const consumptions: FifoConsumption[] = [];
  let cogs = 0;
  for (const layer of layers) {
    if (need <= 0) break;
    const avail = toThousandths(layer.remainingQty);
    if (avail <= 0) continue;
    try {
      assertSafeMinor(layer.unitCostMinor, { label: "Coût de couche FIFO invalide" });
    } catch {
      throw new DomainError("STOCK_ERROR", "Coût de couche FIFO invalide.");
    }
    const take = Math.min(avail, need);
    const qty = take / TH;
    // H-1: guarded per-piece cost (overflow before Math.round).
    // cost = round(unitCost*take/1000) ≤ MAX_MINOR_TOTAL (1e11) ⟺
    // unitCost*take ≤ 1e14. Threshold is 1e14, not 1e11.
    if (layer.unitCostMinor !== 0 && take > 100_000_000_000_000 / layer.unitCostMinor) {
      throw new DomainError("STOCK_ERROR", "Coût FIFO : dépassement de capacité.");
    }
    const cost = Math.round((layer.unitCostMinor * take) / TH);
    try {
      assertSafeTotal(cost, "Coût FIFO invalide");
    } catch {
      throw new DomainError("STOCK_ERROR", "Coût FIFO : dépassement de capacité.");
    }
    consumptions.push({
      layerId: layer.id,
      quantity: qty,
      unitCostMinor: layer.unitCostMinor,
      costMinor: cost,
    });
    cogs += cost;
    if (!Number.isSafeInteger(cogs) || cogs < 0) {
      throw new DomainError("STOCK_ERROR", "COGS FIFO : dépassement de capacité.");
    }
    need -= take;
  }
  try {
    assertSafeTotal(cogs, "COGS FIFO invalide");
  } catch {
    throw new DomainError("STOCK_ERROR", "COGS FIFO : dépassement de capacité.");
  }
  return { consumptions, cogsMinor: cogs, shortQty: need / TH };
}

export interface OversellInput {
  shortQty: number;
  /** Most recent layer unit cost, else product last cost, else 0 (explicit). */
  fallbackUnitCostMinor: number;
}

/** Cost of the oversold remainder (negative stock allowed by settings). */
export function oversellCost(input: OversellInput): {
  quantity: number;
  unitCostMinor: number;
  costMinor: number;
} {
  assertValidQuantity(input.shortQty, { allowZero: true });
  try {
    assertSafeMinor(input.fallbackUnitCostMinor, { label: "Coût de substitution invalide" });
  } catch {
    throw new DomainError("STOCK_ERROR", "Coût de substitution invalide.");
  }
  const cost = multiplyMinorByQuantity(input.fallbackUnitCostMinor, input.shortQty);
  return {
    quantity: input.shortQty,
    unitCostMinor: input.fallbackUnitCostMinor,
    costMinor: cost,
  };
}

/** Gross profit = actual selling revenue − FIFO cost (both frozen at sale time). */
export function grossProfitOf(revenueMinor: number, cogsMinor: number): number {
  try {
    assertSafeTotal(revenueMinor, "Chiffre d'affaires invalide");
    assertSafeTotal(cogsMinor, "Coût de vente invalide");
  } catch {
    throw new DomainError("SALE_ERROR", "Marge invalide : dépassement de capacité.");
  }
  const out = revenueMinor - cogsMinor;
  if (!Number.isSafeInteger(out)) {
    throw new DomainError("SALE_ERROR", "Marge invalide : dépassement de capacité.");
  }
  return out;
}
