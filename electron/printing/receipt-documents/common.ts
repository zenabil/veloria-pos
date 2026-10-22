// Veloria PoS — Documents purs : types, codes, echappement (zero import).
// Découpage gabarit (P0 test split-parity ≤300 lignes/fichier) : les tables
// Code 39 / Code 128 et l'échappement vivent dans ./barcode39, ./barcode128
// et ./html. Ce module garde les types + helpers + ré-exports de compat
// (surface publique inchangée, aucun changement fonctionnel).

export interface ReceiptLine {
  name: string;
  qty: number;
  unit: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
  /** Référence imprimée (code-barres ou identifiant paddé, « — » sinon). */
  ref?: string | undefined;
  /**
   * ADR-131/132 : montant facturé tel que SAISI (mode « Montant »). Quand il
   * est présent, le ticket affiche « Montant saisi » au lieu de la
   * multiplication quantité × prix unitaire (arithmétiquement fausse dès que
   * la quantité est arrondie). Absent = facturation prix × quantité.
   */
  billedTotalMinor?: number | null | undefined;
}

export interface ReceiptData {
  company: string;
  companyPhone: string;
  companyAddress: string;
  companyCity: string;
  companyEmail: string;
  companyRc: string;
  companyNif: string;
  /** C5 : NIS + article d'imposition (migration 0035, facture DZ). */
  companyNis?: string | undefined;
  companyArticle?: string | undefined;
  /** Logo en data URL (injecté côté main), absent = aucun bloc logo. */
  companyLogo: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCode: string;
  /** Vendeur / caissier (vide = ligne masquée). */
  seller?: string | undefined;
  /** Taux TVA en % (0 = pas de TVA, rendu historique conservé). */
  tvaRatePercent?: number | undefined;
  /** Ventilation HT/TVA en centimes (0 quand taux = 0). */
  htMinor?: number | undefined;
  tvaMinor?: number | undefined;
  /**
   * C5 : timbre de quittance LF 2025 en centimes (espèces uniquement, 0 sinon).
   * Ligne DOCUMENTAIRE : le total vente DB reste subtotal − remise + livraison
   * (CHECK 0001) ; le net à payer documentaire vaut total + timbre.
   */
  stampMinor?: number | undefined;
  /** Charge QR déterministe (vide = calculée depuis N°/total/date/RC/NIF/NIS). */
  qrPayload?: string | undefined;
  /** SVG QR réel injecté côté main (vide = aucun bloc QR). */
  qrSvg?: string | undefined;
  paymentMethod: string;
  dueDate: string;
  notes: string;
  invoice: string;
  date: string;
  lines: ReceiptLine[];
  subtotalMinor: number;
  discountMinor: number;
  deliveryMinor: number;
  totalMinor: number;
  paidMinor: number;
  prevBalanceMinor?: number | undefined;
  currentBalanceMinor?: number | undefined;
  /** Pied de page / remerciement personnalisés (paramètres) ; vide = défaut. */
  footerText: string;
  thankYouMessage: string;
  /**
   * C6 : options Studio (posées par le main, jamais par le renderer) —
   * taille logo, masquages, filigrane, note d'en-tête.
   */
  logoSize?: string | undefined;
  hideSigns?: boolean | undefined;
  qrOff?: boolean | undefined;
  codesOff?: boolean | undefined;
  hideZeroRows?: boolean | undefined;
  watermark?: string | undefined;
  headerNote?: string | undefined;
  /** Pied du MODÈLE (thermique) : imprimé seulement si le modèle le définit. */
  footerNote?: string | undefined;
  /** Bon de livraison : prix masqués (quantités seules). */
  hidePrices?: boolean | undefined;
}

/** « CL-00125 » (dérivé de l'id : aucun code stocké en base). */
export function formatCustomerCode(id: number): string {
  if (!Number.isInteger(id) || id <= 0) return "—";
  return `CL-${String(id).padStart(5, "0")}`;
}

/** Référence ligne : identifiant paddé, « — » pour les lignes libres. */
export function formatProductRef(productId: number | null | undefined): string {
  if (!Number.isInteger(productId) || (productId as number) <= 0) return "—";
  return String(productId).padStart(5, "0");
}

/** Libellé mode de paiement côté ticket (vide → "" pour masquer la ligne).
 * P03: miroir de shared/formatters (vide → "—" en UI) — mappings identiques. */
export function paymentMethodLabel(method: string): string {
  if (method === "cash") return "Espèces";
  if (method === "cheque") return "Chèque";
  if (method === "transfer") return "Virement";
  return "";
}

/** Largeur thermique supportée (58/80mm, sans coupe). */
export type ThermalWidth = "58mm" | "80mm";
