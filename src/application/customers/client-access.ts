// Veloria PoS — Application: accès clients APK (PUR, sans IO).
// Construit la charge d'activation V2 scannée par l'APK universel.
// Zéro IO, zéro UUID généré ici : `operationId` est FOURNI par l'appelant
// (même contrat que CreateSale).
// ADR-153 (lot C) : les copies V1 du QR, la validation d'activation, le
// cliché d'affichage et le wrapper d'annonce ont été retirés — aucun appelant
// hors `tests/`, la règle exécutée vit côté main (`client-access.repo.ts`,
// `clientAccessActivateSchema`, `assertValidAnnouncement` appelé en direct).

import {
  assertValidActivationCode,
  assertValidAnonKey,
  assertValidPin,
  assertValidSupabaseUrl,
} from "@domain/customer/client-access.ts";

/** Préfixe V2 (ADR-068) : le QR embarque l'endpoint du magasin (build unique). */
export const ACTIVATION_QR_PREFIX_V2 = "VELORIA2";

/**
 * Charge QR V2 scannée par l'APK universel (ADR-068) :
 * `VELORIA2|<supabaseUrl>|<anonKey>|<phone>|<pin>|<code>`.
 * L'endpoint vient de la config sync du POS (jamais saisi à la main) ;
 * la clé `service_role` est refusée (anon uniquement).
 */
export function buildActivationQrPayloadV2(
  supabaseUrl: string,
  anonKey: string,
  phone: string,
  pin: string,
  code: string,
): string {
  assertValidSupabaseUrl(supabaseUrl);
  assertValidAnonKey(anonKey);
  const p = phone.trim();
  if (p.length < 1 || p.length > 30 || p.includes("|")) {
    throw new Error("Téléphone invalide pour le QR (1 à 30 caractères, sans |).");
  }
  assertValidPin(pin);
  assertValidActivationCode(code);
  return `${ACTIVATION_QR_PREFIX_V2}|${supabaseUrl.trim()}|${anonKey.trim()}|${p}|${pin}|${code}`;
}

/** Ligne de facture ouverte (pour la sélection des détails à pousser). */
export interface OpenSaleRow {
  id: number;
  is_cancelled: number;
  remaining_balance_minor: number;
}

/**
 * Factures dont le détail mérite d'être poussé vers le miroir (page détail
 * APK). Politique (bornée, egress du miroir maîtrisé) :
 *  - les `limit` PREMIÈRES factures non annulées de la liste — l'appelant les
 *    fournit du plus récent au plus ancien (`customers.statement` =
 *    `ORDER BY id DESC`) — SANS regarder le solde : une facture payée/clos
 *    doit rester consultable sur l'APK, sinon le client ne pourrait JAMAIS
 *    rouvrir son reçu (le bouton « Synchroniser » ne poussait que les
 *    factures ouvertes = l'erreur était irréparable depuis le magasin) ;
 *  - PLUS les factures encore ouvertes (solde restant > 0) au-delà de cette
 *    fenêtre récente, comme avant, plafonnées à `limit` elles aussi ;
 *  - annulées jamais poussées ; total borné à 2 × `limit` clichés.
 * Pur et testé ; l'enqueue reste best-effort côté main/dialogue.
 */
export function selectDetailSaleIds(sales: OpenSaleRow[], limit: number): number[] {
  const n = Math.trunc(limit);
  if (!Number.isSafeInteger(n) || n <= 0) return [];
  const ids: number[] = [];
  let recentCount = 0; // factures non annulées vues (fenêtre « plus récentes »)
  let openCount = 0; // factures ouvertes poussées (plafond propre)
  for (const s of sales) {
    if (!Number.isInteger(s.id) || s.id <= 0) continue;
    if (ids.includes(s.id)) continue; // jamais de doublon (cliché UNIQUE par vente)
    if (s.is_cancelled === 1) continue;
    recentCount += 1;
    const inRecentWindow = recentCount <= n;
    const open = Number.isSafeInteger(s.remaining_balance_minor) && s.remaining_balance_minor > 0;
    const withinOpenBudget = open && openCount < n;
    if (!inRecentWindow && !withinOpenBudget) continue;
    ids.push(s.id);
    if (open) openCount += 1;
  }
  return ids;
}
