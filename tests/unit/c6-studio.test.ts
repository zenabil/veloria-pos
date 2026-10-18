// Veloria PoS — C6 : Studio d'impression (domaine + frontière + builders).
// Politique stricte opération → format : la vente / le règlement / le retour /
// la livraison / le bon de commande sortent en ticket 58/80 ; le devis est le
// SEUL document A4 ; les étiquettes sont des gabarits thermiques (jamais A4).
import { describe, it, expect } from "vitest";
import {
  allowedPapers,
  defaultPaperFor,
  factorySettings,
  mergeTemplateSettings,
  nextTemplateVersion,
  TEMPLATE_DOC_TYPES,
} from "@domain/print/template-rules.ts";
import {
  buildLabelsHtml,
  buildProformaA4Html,
  docQrPayload,
  logoMaxHeight,
  pageAtRule,
  proformaFromReceipt,
  signsHtml,
  watermarkHtml,
  headerNoteHtml,
  type ReceiptData,
} from "../../electron/printing/receipt-documents";
import {
  templateDocTypeSchema,
  templateSaveSchema,
  templateSettingsSchema,
} from "../../electron/ipc/validators";

const BASE: ReceiptData = {
  company: "SARL Démo",
  companyPhone: "",
  companyAddress: "",
  companyCity: "",
  companyEmail: "",
  companyRc: "RC1",
  companyNif: "NIF1",
  companyLogo: "",
  customerName: "Client",
  customerPhone: "",
  customerAddress: "",
  customerCode: "",
  paymentMethod: "cash",
  dueDate: "",
  notes: "",
  invoice: "FAC-2026-00001",
  date: "03/10/2026",
  lines: [{ name: "Sucre", qty: 1, unit: "", unitPriceMinor: 10_000, lineTotalMinor: 10_000 }],
  subtotalMinor: 10_000,
  discountMinor: 0,
  deliveryMinor: 0,
  totalMinor: 10_000,
  paidMinor: 10_000,
  footerText: "",
  thankYouMessage: "",
};

describe("C6 domaine : défauts, papiers, fusion", () => {
  it("6 types, papiers par défaut et autorisés (politique stricte)", () => {
    expect(TEMPLATE_DOC_TYPES).toHaveLength(6);
    // Vente / règlement / retour / livraison : ticket 58/80 uniquement.
    expect(defaultPaperFor("ticket")).toBe("80mm");
    expect(defaultPaperFor("recu")).toBe("80mm");
    expect(defaultPaperFor("avoir")).toBe("80mm");
    expect(defaultPaperFor("bon_livraison")).toBe("80mm");
    // Devis : A4 uniquement. Étiquettes : gabarit thermique (jamais A4).
    expect(defaultPaperFor("proforma")).toBe("A4");
    expect(defaultPaperFor("etiquette")).toBe("58x30");
    expect(allowedPapers("proforma")).toEqual(["A4"]);
    expect(allowedPapers("ticket")).toEqual(["80mm", "58mm"]);
    expect(allowedPapers("recu")).toEqual(["80mm", "58mm"]);
    expect(allowedPapers("avoir")).toEqual(["80mm", "58mm"]);
    expect(allowedPapers("bon_livraison")).toEqual(["80mm", "58mm"]);
    expect(allowedPapers("etiquette")).toEqual(["30x20", "45x20", "50x30", "58x30", "58x40"]);
    expect(factorySettings("etiquette").showQr).toBe(false);
    expect(factorySettings("proforma").showQr).toBe(true);
  });

  it("fusion bornée : papier incohérent rejeté, textes tronqués, version monotone", () => {
    const m = mergeTemplateSettings("proforma", {
      paper: "58mm",
      copies: 99,
      watermarkText: "x".repeat(100),
    });
    expect(m.paper).toBe("A4");
    expect(m.copies).toBe(5);
    expect(m.watermarkText).toHaveLength(60);
    // Un ticket ne peut jamais dériver vers A4.
    expect(mergeTemplateSettings("ticket", { paper: "A4" }).paper).toBe("80mm");
    expect(nextTemplateVersion(3)).toBe(4);
    expect(nextTemplateVersion(0)).toBe(1);
  });
});

describe("C6 frontière Zod : réglages typés, sauvegarde gardée", () => {
  it("défauts complets sur {}", () => {
    const s = templateSettingsSchema.parse({});
    expect(s.paper).toBe("A4");
    expect(s.copies).toBe(1);
    expect(s.showQr).toBe(true);
  });

  it("bornes rejetées, operationId exigé, doctrine des formats appliquée", () => {
    expect(() => templateSettingsSchema.parse({ copies: 9 })).toThrow();
    expect(() => templateSettingsSchema.parse({ marginMm: 2 })).toThrow();
    // Papiers fantômes disparus : A4-24 et A5 ne sont plus des valeurs valides.
    expect(() => templateSettingsSchema.parse({ paper: "A4-24" })).toThrow();
    expect(() => templateSettingsSchema.parse({ paper: "A5" })).toThrow();
    expect(() =>
      templateSaveSchema.parse({ docType: "facture", name: "X", settings: {} }),
    ).toThrow();
    const ok = templateSaveSchema.parse({
      operationId: "11111111-1111-4111-8111-111111111111",
      docType: "ticket",
      name: "Nuit",
      settings: { paper: "58mm", copies: 2 },
    });
    expect(ok.settings.paper).toBe("58mm");
    expect(() => templateDocTypeSchema.parse("facturette")).toThrow();
    // « facture » n'est plus un type de document : seul le devis reste A4.
    expect(() => templateDocTypeSchema.parse("facture")).toThrow();
  });
});

describe("C6 builders : options Studio explicites", () => {
  it("page A4 uniquement, filigrane, signatures, logo, QR", () => {
    expect(pageAtRule()).toContain("size:A4");
    // Même une valeur parasite ne dévie pas du A4 (jamais de planche fantôme).
    expect(pageAtRule({ page: "A5", marginMm: 10 })).toContain("size:A4");
    expect(pageAtRule({ marginMm: 99 })).toContain("margin:25mm");
    expect(logoMaxHeight("S")).toBe(48);
    expect(logoMaxHeight("L")).toBe(96);
    expect(logoMaxHeight()).toBe(64);
    expect(watermarkHtml("")).toBe("");
    expect(watermarkHtml("DUPLICATA")).toContain("DUPLICATA");
    expect(headerNoteHtml("")).toBe("");
    expect(signsHtml("a", "b", true)).toBe("");
    expect(signsHtml("a", "b", false)).toContain("signs");
    expect(docQrPayload({ ...BASE, qrOff: true })).toBe("");
    expect(docQrPayload(BASE)).toContain("VELORIA|");
  });

  it("devis A4 : papier, filigrane, masquages (seul document A4)", () => {
    const html = buildProformaA4Html(
      proformaFromReceipt({
        ...BASE,
        hideSigns: true,
        watermark: "DUPLICATA",
        headerNote: "PROMO",
      }),
      { page: "A4", marginMm: 10 },
    );
    expect(html).toContain("size:A4");
    expect(html).toContain("margin:10mm");
    expect(html).toContain("DUPLICATA");
    expect(html).toContain("PROMO");
    expect(html).not.toContain('class="signs"');
    const plain = buildProformaA4Html(proformaFromReceipt(BASE));
    expect(plain).toContain('class="signs"');
    expect(plain).toContain("size:A4");
  });

  it("N&B strict conservé avec options", () => {
    const html = buildProformaA4Html(
      proformaFromReceipt({ ...BASE, watermark: "X", headerNote: "Y", hideSigns: true }),
      { page: "A4", marginMm: 5 },
    );
    const colors = [...html.matchAll(/#[0-9a-fA-F]{3,6}/g)].map((m) => m[0].toLowerCase());
    for (const c of colors) {
      expect(["#fff", "#ffffff", "#000", "#000000"]).toContain(c);
    }
  });

  it("étiquettes inchangées sans QR, QR avec svg", () => {
    const item = { name: "Sucre", priceMinor: 10_000, barcode: "ABC" };
    expect(buildLabelsHtml([item], { format: "58x30" })).not.toContain('class="lqr"');
    expect(buildLabelsHtml([{ ...item, qrSvg: "<svg></svg>" }], {})).toContain("lqr");
  });
});
