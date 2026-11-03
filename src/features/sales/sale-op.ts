// Veloria PoS — Vente : identité d'encaissement liée au CONTENU du panier.
// Même panier réessayé (double-clic, réponse perdue, crash) = même `operationId`
// → le main rejoue le résultat stocké (`idempotency_keys`) au lieu de créer une
// seconde facture et de retrancher deux fois le stock.
// Panier MODIFIÉ = NOUVELLE opération : sans cette liaison, le main rejouerait
// l'ANCIENNE vente pendant que la caisse imprime et annonce le nouveau panier
// (montants du ticket ≠ facture, la correction n'est jamais vendue, panier
// silencieusement vidé).
//
// Empreinte réutilisée depuis `proforma-op.ts` (client + lignes, conditionnement
// compris) : le devis et la vente ont la même règle d'identité de contenu.
import { newOperationId } from "@domain/common/ids.ts";
import { proformaOperationKey, type ProformaCartLine } from "./proforma-op.ts";

/** Contenu d'une tentative d'encaissement (mêmes champs que le brouillon). */
export interface SaleOperationContent {
  customerId: number | null;
  lines: readonly ProformaCartLine[];
  amountPaidMinor: number;
  deliveryFeeMinor: number;
  paymentMethod: string | null;
}

/** Liaison figée dans l'onglet panier (`saleOperationId` persisté avec le brouillon). */
export interface SaleOperationBinding {
  saleOperationId?: string | null;
  saleOperationKey?: string | null;
}

/**
 * Empreinte stable du contenu soumis.
 * - Le `key` de ligne est EXCLU : c'est une clé d'affichage régénérée quand un
 *   brouillon est rechargé ou qu'une vente est rééditée — l'inclure ferait
 *   changer l'identité sans que l'intention ait changé.
 * - `purchasePriceMinor`/`originalUnitPriceMinor` exclus : prix de référence
 *   lus au catalogue, non choisis par le caissier (même règle que le devis).
 * - Échéance et accord de plafond exclus : état du dialogue, absent du
 *   brouillon persisté, donc impossible à reconstituer après un rechargement.
 */
export function saleOperationKey(c: SaleOperationContent): string {
  return JSON.stringify({
    lignes: proformaOperationKey(c.customerId, c.lines),
    paye: c.amountPaidMinor,
    livraison: c.deliveryFeeMinor,
    moyen: c.paymentMethod,
  });
}

/**
 * Résout l'opération de la tentative en cours : même empreinte = même UUID
 * (rejoué), empreinte différente = nouvel UUID à figer (`rotated`).
 * Une seule rotation, jamais de `newOperationId()` au clic.
 */
export function pickSaleOperationId(
  bound: SaleOperationBinding,
  content: SaleOperationContent,
): { key: string; operationId: string; rotated: boolean } {
  const key = saleOperationKey(content);
  if (bound.saleOperationId != null && bound.saleOperationKey === key) {
    return { key, operationId: bound.saleOperationId, rotated: false };
  }
  return { key, operationId: newOperationId(), rotated: true };
}

/**
 * UUID à écrire dans le brouillon : l'identité n'est conservée que si elle est
 * toujours liée au contenu du panier. Un panier modifié puis rechargé doit
 * reprendre une NOUVELLE opération, sinon le vieux UUID survivrait au contenu
 * qu'il est censé décrire et ferait rejouer l'ancienne vente.
 * Empreinte absente (brouillon antérieur à la liaison) : l'UUID survit, comme
 * avant — il n'y a rien à quoi le comparer.
 */
export function persistedSaleOperationId(
  bound: SaleOperationBinding,
  content: SaleOperationContent,
): string | null {
  if (bound.saleOperationId == null) return null;
  if (bound.saleOperationKey == null) return bound.saleOperationId;
  return bound.saleOperationKey === saleOperationKey(content) ? bound.saleOperationId : null;
}
