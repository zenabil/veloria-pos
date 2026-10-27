// Veloria PoS - IPC: gates credit/partiel par canal (extrait de handle(), deplacement pur).
// Ordre d evaluation inchange : appele par handle() avant fn(input).

import { IPC_CHANNELS } from "./channels";
import { getDb } from "../database/sqlite.service";
import { requireLicensedFeature, type LicenseServiceDeps } from "../licensing/license-service";
import { log } from "../services/logger";
import { assertTotalMinor, priceLine } from "./money-guard";

export function enforceCreditGates(
  channel: string,
  input: unknown,
  deps: LicenseServiceDeps,
): void {
  // Vente à crédit / partielle : capabilities dédiées (§5).
  // Crédit (reste > 0) → debt-management ; partiel (0 < payé < total) →
  // partial-payments. Comptant intégral : aucune feature requise.
  // EL-24: mêmes gates pour les workflows qui créent du crédit sans
  // passer par sales.create (returns crédit, conversions).
  if (channel === IPC_CHANNELS["returns.create"]) {
    // Depuis 0055, l'avoir est imputé automatiquement à la dette du client :
    // le gate ne peut plus dépendre du champ `creditMinor` (ignoré). On lit
    // la dette réelle de la vente ; une vente au passage n'en crée aucune.
    const rc = input as { kind?: unknown; saleId?: unknown };
    if (rc.kind === "customer" && typeof rc.saleId === "number") {
      let debt = 0;
      try {
        const row = getDb()
          .prepare(
            `SELECT c.outstanding_balance_minor AS debt
             FROM sales s JOIN customers c ON c.id = s.customer_id
             WHERE s.id = ? AND s.is_cancelled = 0`,
          )
          .get(rc.saleId) as { debt: number } | undefined;
        debt = row ? Number(row.debt) : 0;
      } catch (err) {
        // Fail-closed : sans lecture fiable de la dette, impossible de savoir
        // si le retour consomme la capability debt-management.
        log("ERROR", "ipc", "license.gate_debt_read_failed", {
          channel,
          error: err instanceof Error ? err.message : String(err),
        });
        throw new Error("Vérification de la licence impossible : réessayez.");
      }
      if (debt > 0) requireLicensedFeature(deps, "debt-management");
    }
  }
  // Conversions : le total vient de la DB (devis/commande) — on le charge
  // ici (lecture synchrone) pour gater avant toute mutation.
  if (channel === IPC_CHANNELS["proformas.convert"]) {
    const cc = input as { proformaId?: unknown; amountPaidMinor?: unknown };
    if (typeof cc.proformaId === "number" && typeof cc.amountPaidMinor === "number") {
      // A1 (audit 2026-10-27) : la lecture etait « best effort » (log WARN puis
      // on continuait) ⇒ une base verrouilee ouvrait la vente a credit SANS
      // debt-management. Meme contrat que returns.create ci-dessus : sans
      // lecture fiable, on refuse (fail-closed).
      let ptotal: number | null;
      try {
        const prow = getDb()
          .prepare(`SELECT total_minor FROM proforma_invoices WHERE id = ?`)
          .get(cc.proformaId) as { total_minor: number } | undefined;
        ptotal = typeof prow?.total_minor === "number" ? prow.total_minor : null;
      } catch (err) {
        log("ERROR", "ipc", "license.gate_proforma_total_read_failed", {
          channel,
          error: err instanceof Error ? err.message : String(err),
        });
        throw new Error("Vérification de la licence impossible : réessayez.");
      }
      if (ptotal != null && ptotal > 0 && cc.amountPaidMinor < ptotal) {
        requireLicensedFeature(deps, "debt-management");
        if (cc.amountPaidMinor > 0) requireLicensedFeature(deps, "partial-payments");
      }
    }
  }
  if (channel === IPC_CHANNELS["sales.create"]) {
    // P0-7 : la remise vit dans les lignes (original − final) × qty —
    // le total de gate se recalcule aux prix FACTURÉS (jamais aux originaux).
    const sale = input as {
      amountPaidMinor?: unknown;
      totalMinor?: unknown;
      deliveryFeeMinor?: unknown;
      lines?: Array<{
        originalUnitPriceMinor?: unknown;
        unitPriceMinor?: unknown;
        quantity?: unknown;
        billedTotalMinor?: unknown;
      }>;
    };
    const paid = typeof sale.amountPaidMinor === "number" ? sale.amountPaidMinor : null;
    let total: number | null = typeof sale.totalMinor === "number" ? sale.totalMinor : null;
    if (total == null && Array.isArray(sale.lines)) {
      // A2 (audit 2026-10-27) : la porte utilise la RÈGLE UNIQUE du main
      // (`priceLine`, money-guard) au lieu d'un `Math.round(prix × qté)` maison.
      // Mêmes gardes d'entier monétaire, même tolérance du mode « Montant »
      // (ADR-114) : le total de porte ne peut plus diverger du total que le
      // handler écrit en base. Une ligne illisible LÈVE (fail-closed) au lieu
      // de laisser la porte sans total.
      let charged = 0;
      for (const l of sale.lines) {
        charged += priceLine({
          unitPriceMinor: Number(l.unitPriceMinor),
          originalUnitPriceMinor: Number(l.originalUnitPriceMinor ?? l.unitPriceMinor),
          quantity: Number(l.quantity),
          billedTotalMinor: typeof l.billedTotalMinor === "number" ? l.billedTotalMinor : null,
        }).charged;
      }
      const delivery = typeof sale.deliveryFeeMinor === "number" ? sale.deliveryFeeMinor : 0;
      total = charged + delivery;
      assertTotalMinor(total, "Total de vente invalide.");
    }
    if (paid != null && total != null && total > 0 && paid < total) {
      requireLicensedFeature(deps, "debt-management");
      if (paid > 0) requireLicensedFeature(deps, "partial-payments");
    }
  }
}
