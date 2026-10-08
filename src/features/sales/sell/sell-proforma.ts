// Veloria PoS — Vente : devis + fiche client (extrait de sell-finalize).
// Idempotence M-1 (clé stable du contenu), aperçu 80mm/A4, panier conservé.
import { playSound } from "@shared/sound/sound.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { formatCustomerCode } from "@shared/formatters/format.ts";
import { api } from "@shared/types/ipc-client.ts";
import { proformaOperationKey } from "../proforma-op.ts";
import { enrichCustomer, type CustomerStatement } from "../../customers/types.ts";
import { fetchCustomerCredit } from "./sell-search.ts";
import { buildProformaLines } from "./sell-totals.ts";
import { clearSaleForm, type SellFlowDeps } from "./sell-finalize.ts";

export async function createProforma(d: SellFlowDeps): Promise<void> {
  const totals = d.totals;
  if (d.cart.lines.length === 0 || !totals || d.proformaBusy || d.proformaGuard.current) return;
  d.proformaGuard.current = true;
  d.setProformaBusy(true);
  // M-1: clé stable du contenu — même panier réessayé = même operationId.
  const proformaKey = proformaOperationKey(d.cart.customerId, d.cart.lines);
  if (d.proformaOpRef.current?.key !== proformaKey) {
    d.proformaOpRef.current = { key: proformaKey, id: newOperationId() };
  }
  const proformaOperationId = (d.proformaOpRef.current as { key: string; id: string }).id;
  try {
    const res = (await api.proformaCreate({
      operationId: proformaOperationId,
      customerId: d.cart.customerId,
      lines: d.cart.lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        unitPriceMinor: l.unitPriceMinor,
        quantity: l.quantity,
      })),
      discountMinor: 0,
      deliveryMinor: 0,
      notes: null,
    })) as { number: string };
    const payload: Record<string, unknown> = {
      company: d.company.name,
      companyPhone: d.company.phone,
      companyAddress: d.company.address,
      companyCity: d.company.city,
      companyEmail: d.company.email,
      customerName: d.cart.customerId != null ? d.cart.customerLabel : "",
      customerPhone: "",
      customerAddress: "",
      customerCode: "",
      invoice: res.number,
      date: new Date().toLocaleString("fr-FR"),
      lines: buildProformaLines(d.cart),
      subtotalMinor: totals.subtotalMinor,
      discountMinor: totals.discountAmountMinor,
      deliveryMinor: 0,
      totalMinor: totals.totalMinor,
      paidMinor: 0,
    };
    if (d.cart.customerId != null) {
      try {
        const st = (await api.customerStatement({ id: d.cart.customerId })) as {
          customer: { phone: string | null; address: string | null };
        };
        payload["customerPhone"] = st.customer.phone ?? "";
        payload["customerAddress"] = st.customer.address ?? "";
        payload["customerCode"] = formatCustomerCode(d.cart.customerId);
      } catch {
        /* devis sans coordonnées plutôt que pas de devis */
      }
    }
    try {
      const pv = (await api.proformaPreview(payload)) as {
        text80: string;
        htmlA4: string;
      };
      d.setProformaDoc({
        number: res.number,
        date: payload["date"] as string,
        text80: pv.text80,
        htmlA4: pv.htmlA4,
        payload,
      });
    } catch {
      d.notify(`Proforma ${res.number} créée (aperçu indisponible).`, "ok");
    }
    // P5 : devis créé = succès.
    playSound("success");
    clearSaleForm(d);
    // Succès : le panier est vidé, l'opération est terminée.
    d.proformaOpRef.current = null;
  } catch (e) {
    // Échec : on garde proformaOpRef (même panier → même operationId au retry).
    d.notify(frError(e, "Proforma impossible."), "err");
  } finally {
    d.proformaGuard.current = false;
    d.setProformaBusy(false);
  }
}

// Détail client direct depuis la caisse (requête 1) : fiche + factures +
// aperçu/impression, sans quitter la vente (panier conservé).
export async function openCustomerDetails(d: SellFlowDeps): Promise<void> {
  if (d.cart.customerId == null || d.drawerBusy) return;
  d.setDrawerBusy(true);
  try {
    const st = (await api.customerStatement({ id: d.cart.customerId })) as CustomerStatement;
    d.setCustomerDrawer({ customer: enrichCustomer(st.customer, st), sales: st.sales });
  } catch (e) {
    d.notify(frError(e, "Fiche client indisponible."), "err");
  } finally {
    d.setDrawerBusy(false);
  }
}

export async function refreshCustomerDrawer(d: SellFlowDeps): Promise<void> {
  if (d.cart.customerId == null) return;
  try {
    const st = (await api.customerStatement({ id: d.cart.customerId })) as CustomerStatement;
    d.setCustomerDrawer({ customer: enrichCustomer(st.customer, st), sales: st.sales });
    const credit = await fetchCustomerCredit(d.cart.customerId);
    d.setCustomerBalance(credit.balance);
    d.setCustomerCredit(credit.allowed);
  } catch {
    /* tiroir déjà affiché : on garde les données visibles */
  }
}
