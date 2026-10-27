// Veloria PoS - IPC: gates credit/partiel par canal (extrait de handle(), deplacement pur).
// Ordre d evaluation inchange : appele par handle() avant fn(input).

import { IPC_CHANNELS } from "./channels";
import { getDb } from "../database/sqlite.service";
import { requireLicensedFeature, type LicenseServiceDeps } from "../licensing/license-service";
import { log } from "../services/logger";

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
      try {
        const prow = getDb()
          .prepare(`SELECT total_minor FROM proforma_invoices WHERE id = ?`)
          .get(cc.proformaId) as { total_minor: number } | undefined;
        const ptotal = typeof prow?.total_minor === "number" ? prow.total_minor : null;
        if (ptotal != null && ptotal > 0 && cc.amountPaidMinor < ptotal) {
          requireLicensedFeature(deps, "debt-management");
          if (cc.amountPaidMinor > 0) requireLicensedFeature(deps, "partial-payments");
        }
      } catch (err) {
        log("WARN", "ipc", "license.gate_best_effort", {
          channel,
          error: err instanceof Error ? err.message : String(err),
        });
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
      let charged = 0;
      let valid = true;
      for (const l of sale.lines) {
        if (typeof l.unitPriceMinor !== "number" || typeof l.quantity !== "number") {
          valid = false;
          break;
        }
        // Mode « Montant » (ADR-114) : le montant facturé est celui SAISI.
        charged +=
          typeof l.billedTotalMinor === "number"
            ? l.billedTotalMinor
            : Math.round(l.unitPriceMinor * l.quantity);
      }
      if (valid) {
        const delivery = typeof sale.deliveryFeeMinor === "number" ? sale.deliveryFeeMinor : 0;
        total = charged + delivery;
      }
    }
    if (paid != null && total != null && total > 0 && paid < total) {
      requireLicensedFeature(deps, "debt-management");
      if (paid > 0) requireLicensedFeature(deps, "partial-payments");
    }
  }
}
