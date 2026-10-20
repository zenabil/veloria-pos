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
  applicableSettings,
  isTemplateSettingApplicable,
  NEUTRAL_SETTING_VALUES,
} from "@domain/print/template-capabilities.ts";
import {
  buildDeliveryText,
  buildLabelsHtml,
  buildPaymentText,
  buildProformaA4Html,
  buildReceiptText,
  docQrPayload,
  logoMaxHeight,
  pageAtRule,
  proformaFromReceipt,
  signsHtml,
  thermalLogo,
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

// ---------------------------------------------------------------------------
// C6-bis : chaque type de document n'expose que les réglages qui le concernent
// (matrice de capacités) — et ceux qui restent prennent effet sur le papier.
// ---------------------------------------------------------------------------

describe("C6-bis capacités : seuls les réglages utiles au document", () => {
  it("la TVA n'existe ni sur un reçu de règlement ni sur une étiquette", () => {
    expect(isTemplateSettingApplicable("recu", "showTva")).toBe(false);
    expect(isTemplateSettingApplicable("etiquette", "showTva")).toBe(false);
    expect(isTemplateSettingApplicable("bon_livraison", "showTva")).toBe(false);
    expect(isTemplateSettingApplicable("ticket", "showTva")).toBe(true);
    expect(isTemplateSettingApplicable("avoir", "showTva")).toBe(true);
    expect(isTemplateSettingApplicable("proforma", "showTva")).toBe(true);
    // Remise nulle : un réglage de devis, pas de reçu.
    expect(isTemplateSettingApplicable("proforma", "showDiscountZero")).toBe(true);
    expect(isTemplateSettingApplicable("recu", "showDiscountZero")).toBe(false);
  });

  it("nom du produit = étiquette ; prix = étiquettes + livraison", () => {
    expect(isTemplateSettingApplicable("etiquette", "showProductName")).toBe(true);
    expect(isTemplateSettingApplicable("ticket", "showProductName")).toBe(false);
    expect(isTemplateSettingApplicable("etiquette", "showPrice")).toBe(true);
    expect(isTemplateSettingApplicable("bon_livraison", "showPrice")).toBe(true);
    expect(isTemplateSettingApplicable("avoir", "showPrice")).toBe(false);
    expect(isTemplateSettingApplicable("proforma", "showPrice")).toBe(false);
  });

  it("logo, identité, en-tête, signatures : jamais sur une étiquette", () => {
    for (const key of [
      "showLogo",
      "showIdentity",
      "headerText",
      "footerText",
      "showSignatures",
      "watermarkText",
    ] as const) {
      expect(applicableSettings("etiquette"), key).not.toContain(key);
    }
    for (const key of ["showLogo", "showIdentity", "headerText", "footerText"] as const) {
      expect(applicableSettings("ticket"), key).toContain(key);
      expect(applicableSettings("recu"), key).toContain(key);
      expect(applicableSettings("avoir"), key).toContain(key);
      expect(applicableSettings("bon_livraison"), key).toContain(key);
    }
  });

  it("fusion : un réglage hors sujet retombe sur sa valeur neutre (jamais de résidu)", () => {
    const recu = mergeTemplateSettings("recu", {
      showTva: true,
      showDiscountZero: false,
      showProductName: true,
      thermalFontPx: 13,
    });
    expect(recu.showTva).toBe(NEUTRAL_SETTING_VALUES.showTva);
    expect(recu.showDiscountZero).toBe(NEUTRAL_SETTING_VALUES.showDiscountZero);
    expect(recu.showProductName).toBe(NEUTRAL_SETTING_VALUES.showProductName);
    // Restés dans leur domaine : conservés.
    expect(recu.thermalFontPx).toBe(13);
    const etq = mergeTemplateSettings("etiquette", {
      showLogo: true,
      showIdentity: true,
      headerText: "PROMO",
      showSignatures: true,
      watermarkText: "COPIE",
    });
    expect(etq.showLogo).toBe(false);
    expect(etq.showIdentity).toBe(false);
    expect(etq.headerText).toBe("");
    expect(etq.showSignatures).toBe(false);
    expect(etq.watermarkText).toBe("");
    expect(mergeTemplateSettings("etiquette", { showProductName: true }).showProductName).toBe(
      true,
    );
  });

  it("défauts d'usine : capacités thermiques opt-in, rendu existant préservé", () => {
    for (const t of ["ticket", "recu", "avoir", "bon_livraison"] as const) {
      expect(factorySettings(t).showLogo, t).toBe(false);
      expect(factorySettings(t).showSignatures, t).toBe(false);
      expect(factorySettings(t).showWatermark, t).toBe(false);
    }
    // L'identité était déjà imprimée sur la vente → défaut conservé ; elle est
    // nouvelle sur règlement / retour / livraison → opt-in.
    expect(factorySettings("ticket").showIdentity).toBe(true);
    expect(factorySettings("recu").showIdentity).toBe(false);
    expect(factorySettings("avoir").showIdentity).toBe(false);
    expect(factorySettings("bon_livraison").showIdentity).toBe(false);
    // Étiquettes : nom opt-in, prix affiché par défaut.
    expect(factorySettings("etiquette").showProductName).toBe(false);
    expect(factorySettings("etiquette").showPrice).toBe(true);
    // Devis A4 : rendu historique (logo + signatures déjà imprimés).
    expect(factorySettings("proforma").showLogo).toBe(true);
    expect(factorySettings("proforma").showSignatures).toBe(true);
  });
});

describe("C6-bis builders : les réglages retenus prennent effet", () => {
  it("livraison sans prix : quantités seules + total quantité", () => {
    const doc = { ...BASE, originNumber: "FAC-2026-00001" };
    const priced = buildDeliveryText(doc);
    expect(priced).toContain("PRODUIT · QTÉ x P.U. = TOTAL");
    expect(priced).toContain("100,00 DA");
    const qty = buildDeliveryText({ ...doc, hidePrices: true });
    expect(qty).toContain("PRODUIT · QTÉ");
    expect(qty).not.toContain("P.U.");
    expect(qty).not.toContain("100,00 DA");
    expect(qty).toContain("TOTAL QUANTITÉ");
  });

  it("ticket : pied du modèle, filigrane en bandeau, signatures opt-in", () => {
    const bare = buildReceiptText({ ...BASE, hideSigns: true });
    expect(bare).not.toContain("Signature client");
    const full = buildReceiptText({
      ...BASE,
      footerNote: "Pied du modèle",
      watermark: "DUPLICATA",
      hideSigns: false,
    });
    expect(full).toContain("Pied du modèle");
    expect(full).toContain("*** DUPLICATA ***");
    expect(full).toContain("Signature client");
    expect(full).toContain("Cachet / Signature");
    // En-tête du modèle sous le cartouche.
    expect(buildReceiptText({ ...BASE, headerNote: "PROMO" })).toContain("PROMO");
  });

  it("reçu de règlement : pied du modèle + signatures masquées par défaut", () => {
    const ticket = {
      company: "Veloria",
      companyPhone: "",
      companyAddress: "",
      companyCity: "",
      companyEmail: "",
      companyRc: "",
      companyNif: "",
      companyLogo: "",
      partyLabel: "Amine — CL-00001",
      kind: "customer" as const,
      reference: "PAY-00042",
      date: "03/10/2026",
      amountMinor: 5000,
      paymentMethod: "cash" as const,
      prevBalanceMinor: 15_000,
      newBalanceMinor: 10_000,
      notes: "",
      footerText: "",
      thankYouMessage: "",
    };
    const plain = buildPaymentText({ ...ticket, hideSigns: true });
    expect(plain).toContain("Merci pour votre règlement");
    expect(plain).not.toContain("Signature");
    const full = buildPaymentText({
      ...ticket,
      footerNote: "Reçu du modèle",
      watermark: "DUPLICATA",
      hideSigns: false,
    });
    expect(full).toContain("Reçu du modèle");
    expect(full).toContain("*** DUPLICATA ***");
    expect(full).toContain("Cachet / Signature");
  });

  it("logo thermique : data URL N&B seulement, taille S/M/L", () => {
    expect(thermalLogo("data:image/png;base64,QUJD", "L", 280)).toContain("max-height:96px");
    expect(thermalLogo("data:image/png;base64,QUJD", "S", 200)).toContain("max-height:48px");
    expect(thermalLogo("data:image/png;base64,QUJD", "M", 280)).toContain("max-height:64px");
    // Injection : jamais de HTML/URL arbitraire (même garde que le A4).
    expect(thermalLogo("javascript:alert(1)", "M", 280)).toBe("");
    expect(thermalLogo('<img src=x onerror="x">', "M", 280)).toBe("");
    expect(thermalLogo(undefined, "M", 280)).toBe("");
  });

  it("étiquettes : nom échappé opt-in, prix masquable", () => {
    const item = { name: "<b>Sucre</b>", priceMinor: 10_000, barcode: "ABC" };
    const withName = buildLabelsHtml([item], {
      format: "58x30",
      showName: true,
      showPrice: false,
    });
    expect(withName).toContain("&lt;b&gt;Sucre&lt;/b&gt;");
    expect(withName).not.toContain("100,00");
    // Rendu historique sans option : prix seul, jamais le nom.
    const bare = buildLabelsHtml([item], { format: "58x30" });
    expect(bare).not.toContain("Sucre");
    expect(bare).toContain("100,00");
  });
});
