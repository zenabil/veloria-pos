// Veloria PoS — Shared formatters (French, DZD).
// Les montants passent par `@domain/money/money.ts` (import direct).
import { formatDzd } from "@domain/money/money.ts";
import { BUSINESS_TIME_ZONE } from "@domain/common/business-day.ts";

/**
 * Format monétaire SÛR pour le rendu React (ne lève jamais).
 * A-01 (P1) : `formatDzd` est désormais SÛR par construction (une valeur
 * corrompue ⇒ « — », jamais d'exception au render ⇒ jamais d'écran mort).
 * Ce helper reste l'API explicite pour les valeurs d'origine incertaine
 * (`unknown` : chaîne, null, undefined) : conversion + repli « — ».
 */
export function formatDzdSafe(raw: unknown): string {
  if (raw == null) return "—";
  const n = typeof raw === "number" ? raw : Number(raw);
  return formatDzd(n);
}

/**
 * Format monétaire SIGNÉ pour le rendu React (ne lève jamais).
 * Reports/bilans : marge et résultat net peuvent être négatifs (perte) —
 * `formatDzd` rend « — » sur un négatif, donc le signe est posé ici.
 * Négatif → "-500,00 DZD". Corrompu/NaN/hors bornes → "—".
 */
export function formatDzdSigned(raw: unknown): string {
  if (raw == null) return "—";
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return "—";
  const r = Math.round(n);
  if (r >= 0) return formatDzd(r);
  // `formatDzd` ne lève jamais (A-01) : hors bornes il rend « — », et un
  // négatif hors bornes reste « — » (jamais le préfixe « -— »).
  const positive = formatDzd(-r);
  return positive === "—" ? "—" : `-${positive}`;
}

// E-35 : l'affichage suit le fuseau du magasin (Africa/Algiers), jamais l'horloge
// de l'ordinateur — sinon deux postes d'un même magasin affichent deux jours
// différents pour la même vente (G-18).
const frDateTime = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: BUSINESS_TIME_ZONE,
});

export function formatDateTimeFr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return frDateTime.format(d);
}

const MOVEMENT_FR: Record<string, string> = {
  sale_out: "Vente",
  sale_cancel_in: "Annulation",
  intake_in: "Entrée",
  adjust_in: "Ajustement +",
  adjust_out: "Ajustement −",
  return_in: "Retour",
  damage_out: "Casse",
};

export function movementTypeFr(movement: string): string {
  // P2 : inconnu → "—" (jamais de code brut à l'UI francophone).
  return MOVEMENT_FR[movement] ?? "—";
}

/** Moyens de paiement (espèces/chèque/virement) — SOURCE UNIQUE des libellés.
 * P03: le pendant print (receipt-documents.ts:paymentMethodLabel) retourne ""
 * pour masquer la ligne Mode sur le ticket — sémantiques volontairement
 * distinctes (affichage vs masquage), mappings des valeurs connues identiques.
 * P2 : la fonction dérive de la constante (plus de double source) ;
 * inconnu → "—" (jamais de code brut à l'UI).
 */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Espèces",
  cheque: "Chèque",
  transfer: "Virement",
  none: "Non réglé",
};

export function paymentMethodLabel(method: string | null): string {
  if (method == null || method === "") return "—";
  return PAYMENT_METHOD_LABELS[method] ?? "—";
}

/** « CL-00125 » (dérivé de l'id : aucun code stocké en base). */
export function formatCustomerCode(id: number): string {
  if (!Number.isInteger(id) || id <= 0) return "—";
  return `CL-${String(id).padStart(5, "0")}`;
}

/**
 * P2 : libellé FR d'un motif d'ajustement stock (le domaine rend un code,
 * voir `adjustmentReasonCode` — jamais de français dans le domaine).
 */
export function adjustmentReasonFr(code: string): string {
  if (code === "inventory") return "Inventaire";
  if (code === "correction") return "Correction";
  if (code === "entry") return "Entrée";
  if (code === "exit") return "Sortie";
  return "—";
}

const frDateOnly = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: BUSINESS_TIME_ZONE,
});

/**
 * A2 : date seule JJ/MM/AAAA (sans heure) — pendant date-seule de
 * `formatDateTimeFr` (avec heure). Remplace les `formatDateFr` locaux
 * dupliqués (licence). Invalide → "—", jamais d'exception au render.
 */
export function formatDateFr(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return frDateOnly.format(d);
}

/**
 * A2 : libellé d'édition licence — SOURCE UNIQUE (remplace les doublons
 * `LicenseBadge` / `LicenseScreen`). `plan` prime sur `edition`.
 */
export function editionLabel(edition: string | null, plan?: string | null): string {
  if (plan) return plan;
  if (edition === "basic") return "Basique";
  if (edition === "standard") return "Standard";
  if (edition === "professional" || edition === "pro") return "Professionnelle";
  if (edition === "enterprise") return "Entreprise";
  if (edition === "custom") return "Personnalisée";
  return "—";
}
