// Veloria PoS — Application: projection des lignes caisse vers les lignes
// facturables (conditionnement carton). Aucune IO, aucun framework.

import type { CartLineInput } from "@domain/sales/sale-rules.ts";
import { computeBilledTotal } from "@domain/sales/sale-rules.ts";
import {
  priceSaleLine,
  splitQuantityByCarton,
  type PackagingPriceResult,
} from "@domain/packaging/packaging-rules.ts";

export interface PackagingCartMetadata {
  packagingId?: number | null;
  packagingLabelFr?: string | null;
  packagingFactor?: number | null;
  packagingSellingPriceMinor?: number | null;
  packagingAutoCartonPricing?: boolean | null;
  /** Prix modifié manuellement : la règle carton est désactivée. */
  packagingPriceOverridden?: boolean | null;
}

export type PackagedCartLine = CartLineInput & PackagingCartMetadata;

export interface ExpandedSaleLine extends CartLineInput {
  packagingId: number | null;
  unitFactor: number;
  isCarton: boolean;
}

export interface PackagingLineDisplay {
  labelFr: string;
  factor: number;
  cartons: number;
  pieces: number;
  cartonApplied: boolean;
  manualPrice: boolean;
  savingsMinor: number;
}

function validPackaging(line: PackagedCartLine): {
  id: number;
  label: string;
  factor: number;
  cartonPrice: number;
} | null {
  if (line.packagingId == null) return null;
  const factor = Number(line.packagingFactor);
  const cartonPrice = Number(line.packagingSellingPriceMinor);
  if (!Number.isInteger(line.packagingId) || line.packagingId <= 0) return null;
  if (!Number.isInteger(factor) || factor <= 1) return null;
  if (!Number.isInteger(cartonPrice) || cartonPrice < 0) return null;
  const label =
    typeof line.packagingLabelFr === "string" && line.packagingLabelFr.trim() !== ""
      ? line.packagingLabelFr.trim()
      : `Carton de ${factor}`;
  return { id: line.packagingId, label, factor, cartonPrice };
}

export function isPackagingAuto(line: PackagedCartLine): boolean {
  return (
    validPackaging(line) != null &&
    line.packagingAutoCartonPricing === true &&
    line.packagingPriceOverridden !== true &&
    line.billedTotalMinor == null
  );
}

export function pricePackagedCartLine(line: PackagedCartLine): PackagingPriceResult | null {
  const pack = validPackaging(line);
  if (pack == null) return null;
  return priceSaleLine({
    qty: line.quantity,
    unitPriceMinor: line.unitPriceMinor,
    cartonPriceMinor: pack.cartonPrice,
    factor: pack.factor,
    auto: isPackagingAuto(line),
  });
}

/** Éclate une ligne caisse en 1 ligne (pièce) ou 2 lignes (cartons + reste). */
export function expandSaleLine(line: PackagedCartLine): ExpandedSaleLine[] {
  const pack = validPackaging(line);
  const priced = pricePackagedCartLine(line);
  if (pack == null || priced == null || line.billedTotalMinor != null) {
    return [
      {
        productId: line.productId,
        productName: line.productName,
        unitCode: line.unitCode,
        originalUnitPriceMinor: line.originalUnitPriceMinor,
        unitPriceMinor: line.unitPriceMinor,
        purchasePriceMinor: line.purchasePriceMinor,
        quantity: line.quantity,
        billedTotalMinor: line.billedTotalMinor ?? null,
        packagingId: null,
        unitFactor: 1,
        isCarton: false,
      },
    ];
  }
  return priced.lines.map((l) => ({
    productId: line.productId,
    productName: line.productName,
    unitCode: l.isCarton
      ? pack.label.slice(0, 20)
      : line.unitCode === "PIECE"
        ? "PIÈCE"
        : line.unitCode,
    originalUnitPriceMinor: l.originalUnitPriceMinor,
    unitPriceMinor: l.unitPriceMinor,
    purchasePriceMinor: Math.round(line.purchasePriceMinor * l.unitFactor),
    quantity: l.quantity,
    billedTotalMinor: null,
    packagingId: l.isCarton ? pack.id : null,
    unitFactor: l.unitFactor,
    isCarton: l.isCarton,
  }));
}

export function expandSaleLines(lines: PackagedCartLine[]): ExpandedSaleLine[] {
  return lines.flatMap((l) => expandSaleLine(l));
}

/** Total facturé d'une ligne caisse (conditionnement inclus). */
export function saleLineTotal(line: PackagedCartLine): number {
  return expandSaleLine(line).reduce((a, l) => a + computeBilledTotal(l), 0);
}

/** Données d'affichage caisse : découpage, économie et prix manuel. */
export function packagingDisplay(line: PackagedCartLine): PackagingLineDisplay | null {
  const pack = validPackaging(line);
  if (pack == null) return null;
  const split = splitQuantityByCarton(line.quantity, pack.factor);
  const priced = pricePackagedCartLine(line);
  return {
    labelFr: pack.label,
    factor: pack.factor,
    cartons: split.cartons,
    pieces: split.pieces,
    cartonApplied: priced?.cartonApplied === true,
    manualPrice:
      line.packagingPriceOverridden === true ||
      line.unitPriceMinor !== line.originalUnitPriceMinor ||
      line.billedTotalMinor != null,
    savingsMinor: priced?.savingsMinor ?? 0,
  };
}
