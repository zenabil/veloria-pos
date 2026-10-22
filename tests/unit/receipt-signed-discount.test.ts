// Veloria PoS — Régression ADR-132 : le ticket d'une vente au poids en mode
// « Montant » (ou en majoration) doit être IMPRIMABLE et lisible.
//
// Symptôme couvert (revue UI du 2026-10-22) : la remise de ligne peut être
// NÉGATIVE (facturé > prix catalogue, ou montant saisi 50,00 DZD contre
// 49,70 DZD de référence). Le schéma d'impression exigeait une remise ≥ 0 ⇒ le
// payload était REJETÉ ⇒ « Aperçu indisponible. » / « Impression auto
// impossible. » : le ticket de la vente corrigée ne pouvait pas sortir.
// De plus, le ticket masquait la remise négative (écart invisible) et
// imprimait une multiplication arithmétiquement fausse (0,071 × 700 ≠ 50,00).
import { describe, it, expect } from "vitest";
import { printPayloadSchema } from "../../electron/ipc/validators.print";
import {
  buildProformaA4Html,
  buildReceiptText,
  proformaFromReceipt,
  toReceiptData,
} from "../../electron/printing/receipt-documents";
import type { ReceiptData } from "../../electron/printing/receipt-documents";

/** Payload d'une vente au poids en mode « Montant » : 50,00 DZD saisis. */
function amountPayload(): Record<string, unknown> {
  return {
    company: "Veloria",
    invoice: "FAC-2026-00042",
    date: "22/10/2026",
    lines: [
      {
        name: "Bil",
        qty: 0.071,
        unit: "KG",
        unitPriceMinor: 70000,
        lineTotalMinor: 5000,
        billedTotalMinor: 5000,
        ref: "00001",
      },
    ],
    // Référence = prix d'origine × quantité arrondie = 4 970 centimes.
    subtotalMinor: 4970,
    // Remise SIGNÉE : 4 970 − 5 000 = −30 centimes (l'écart d'arrondi).
    discountMinor: -30,
    deliveryMinor: 0,
    totalMinor: 5000,
    paidMinor: 5000,
    paymentMethod: "cash",
    stampMinor: 0,
  };
}

describe("Ticket d'une vente à remise signée (ADR-131/132)", () => {
  it("le schéma d'impression ACCEPTE une remise négative", () => {
    const parsed = printPayloadSchema.safeParse(amountPayload());
    expect(parsed.success).toBe(true);
  });

  it("le schéma d'impression refuse encore un total incohérent", () => {
    const bad = { ...amountPayload(), totalMinor: 4000 };
    expect(printPayloadSchema.safeParse(bad).success).toBe(false);
  });

  it("le ticket affiche la majoration (remise négative) et se recompose", () => {
    const data: ReceiptData = toReceiptData(amountPayload());
    const text = buildReceiptText(data, "80mm");
    expect(text).toContain("Majoration");
    expect(text).toContain("0,30 DA");
    // Sous-total 49,70 DA + majoration 0,30 DA = 50,00 DA : visible à l'œil.
    expect(text).toContain("49,70 DA");
    expect(text).toContain("50,00 DA");
  });

  it("le ticket marque « montant saisi » au lieu d'une multiplication fausse", () => {
    const data: ReceiptData = toReceiptData(amountPayload());
    const text = buildReceiptText(data, "80mm");
    expect(text).toContain("montant saisi");
    expect(text).toContain("0,071 KG");
    // La multiplication fausse « 0.071 x 700,00 DA » ne doit plus sortir.
    expect(text).not.toContain("0.071");
  });

  it("une vente à remise classique garde son libellé « Remise »", () => {
    const payload = {
      ...amountPayload(),
      lines: [{ name: "Sucre", qty: 1, unit: "PIECE", unitPriceMinor: 5000, lineTotalMinor: 4000 }],
      subtotalMinor: 5000,
      discountMinor: 1000,
      totalMinor: 4000,
      paidMinor: 4000,
    };
    const text = buildReceiptText(toReceiptData(payload), "80mm");
    expect(text).toContain("Remise");
    expect(text).not.toContain("Majoration");
  });

  it("le devis A4 affiche la majoration même quand les lignes à zéro sont masquées", () => {
    const data = { ...toReceiptData(amountPayload()), hideZeroRows: true };
    const html = buildProformaA4Html(proformaFromReceipt(data));
    // La remise négative ne disparaît jamais : sans elle, le total ne se
    // recompose plus (sous-total 49,70 + majoration 0,30 = 50,00).
    expect(html).toContain("Majoration");
    expect(html).toContain("+0,30 DA");
    expect(html).not.toContain(">Remise<");
    expect(html).toContain("montant saisi");
    expect(html).toContain("0,071 KG");
  });

  it("le devis A4 d'une vente sans remise masque la ligne quand demandé", () => {
    const payload = {
      ...amountPayload(),
      lines: [{ name: "Sucre", qty: 1, unit: "PIECE", unitPriceMinor: 5000, lineTotalMinor: 5000 }],
      subtotalMinor: 5000,
      discountMinor: 0,
      totalMinor: 5000,
      paidMinor: 5000,
    };
    const hidden = buildProformaA4Html(
      proformaFromReceipt({ ...toReceiptData(payload), hideZeroRows: true }),
    );
    expect(hidden).not.toContain(">Remise<");
    const shown = buildProformaA4Html(proformaFromReceipt(toReceiptData(payload)));
    expect(shown).toContain(">Remise<");
  });
});
