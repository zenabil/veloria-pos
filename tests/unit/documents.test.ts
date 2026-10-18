import { describe, it, expect } from "vitest";
import {
  formatInvoiceNumber,
  formatProformaNumber,
  padSequence,
} from "../../electron/ipc/handlers/numbers";
import {
  CODE39_PATTERNS,
  amountInWordsFr,
  buildA4Html,
  buildProformaA4Html,
  buildProformaText,
  buildReceiptText,
  code39Svg,
  escapeHtml,
  formatCustomerCode,
  formatProductRef,
  paymentMethodLabel,
  proformaFromReceipt,
  sanitizeCode39,
  toReceiptData,
  type ProformaData,
  type ReceiptData,
} from "../../electron/printing/receipt-documents";
import { computeClosingBalance, validateBusinessDate } from "@/domain/closings/closing-rules";
import { validateExpenseDraft } from "@/domain/expenses/expense-rules";

const DOC: ReceiptData = {
  company: "Veloria",
  companyPhone: "0550",
  companyAddress: "Alger",
  companyCity: "",
  companyEmail: "contact@veloria.dz",
  companyRc: "16/00-1234567",
  companyNif: "000123456789012",
  companyLogo: "",
  customerName: "Amine Benali",
  customerPhone: "0555 00 00 00",
  customerAddress: "Tlemcen",
  customerCode: "CL-00125",
  paymentMethod: "cash",
  dueDate: "",
  notes: "",
  footerText: "",
  thankYouMessage: "",
  invoice: "FAC-2026-00001",
  date: "01/01/2026",
  lines: [
    {
      name: "Coca",
      qty: 2,
      unit: "PIECE",
      unitPriceMinor: 10000,
      lineTotalMinor: 20000,
      ref: "00125",
    },
  ],
  subtotalMinor: 20000,
  discountMinor: 1000,
  deliveryMinor: 500,
  totalMinor: 19500,
  paidMinor: 10000,
  prevBalanceMinor: 5000,
  currentBalanceMinor: 14500,
};

describe("Document numbering (single format)", () => {
  it("pads and prefixes", () => {
    expect(formatInvoiceNumber("FAC", 2026, 1)).toBe("FAC-2026-00001");
    expect(formatProformaNumber("", 2026, 42)).toBe("PRO-2026-00042");
    expect(() => padSequence(0)).toThrow();
  });
});

describe("Receipt documents (deterministic, spec 12)", () => {
  it("80mm contains the mandatory content", () => {
    const a = buildReceiptText(DOC);
    expect(buildReceiptText(DOC)).toBe(a); // déterministe
    for (const needle of [
      "Veloria",
      "FAC-2026-00001",
      "TICKET DE CAISSE",
      "Amine Benali",
      "Coca",
      "PRODUIT",
      "Sous-total",
      "Remise",
      "Livraison",
      "TOTAL",
      "Payé",
      "Reste (crédit)",
      "Ancien solde",
      "Solde actuel",
      "ESPÈCES",
      "Veloria POS",
      "Merci",
    ]) {
      expect(a.includes(needle), needle).toBe(true);
    }
    // Pas d'échéance quand elle est vide.
    expect(a.includes("Échéance")).toBe(false);
  });

  it("80mm solder soldé ne montre ni reste ni monnaie", () => {
    const paid = buildReceiptText({ ...DOC, paidMinor: DOC.totalMinor });
    expect(paid.includes("Reste (crédit)")).toBe(false);
    expect(paid.includes("Monnaie rendue")).toBe(false);
  });

  it("A4 matches the wireframe blocks", () => {
    const html = buildA4Html(DOC);
    expect(buildA4Html(DOC)).toBe(html);
    for (const needle of [
      "Veloria",
      "FACTURE",
      "Amine Benali",
      "0555 00 00 00",
      "Tlemcen",
      "CL-00125",
      "FAC-2026-00001",
      "Réf.",
      "00125",
      "TOTAL TTC",
      "RESTE",
      "Montant en lettres",
      "dinars algériens",
      "Espèces",
      "contact@veloria.dz",
      "Signature client",
      "Signature / Cachet",
      "Merci pour votre confiance",
      "Page 1 / 1",
    ]) {
      expect(html.includes(needle), needle).toBe(true);
    }
    // Soldes exclus de la facture (ticket uniquement).
    expect(html.includes("Solde actuel")).toBe(false);
    // Échéance masquée quand elle est vide (DOC.dueDate === "").
    expect(html.includes("Échéance")).toBe(false);
  });

  it("A4 affiche l'échéance et le logo quand ils sont renseignés", () => {
    const html = buildA4Html({
      ...DOC,
      dueDate: "2026-02-01",
      companyLogo: "data:image/png;base64,QUJD",
    });
    expect(html.includes("Échéance")).toBe(true);
    expect(html.includes("2026-02-01")).toBe(true);
    expect(html.includes('src="data:image/png;base64,QUJD"')).toBe(true);
  });

  it("A4 hides empty blocks and escapes HTML", () => {
    const bare: ReceiptData = {
      ...DOC,
      customerPhone: "",
      customerAddress: "",
      customerCode: "",
      companyEmail: "",
      companyRc: "",
      companyNif: "",
      paymentMethod: "",
      notes: "",
      customerName: "<b>Amine</b>",
    };
    const html = buildA4Html(bare);
    expect(html.includes("Téléphone")).toBe(false);
    expect(html.includes("Code client")).toBe(false);
    expect(html.includes("Mode de paiement")).toBe(false);
    expect(html.includes("Notes")).toBe(false);
    expect(html.includes("<b>Amine</b>")).toBe(false);
    expect(html.includes("&lt;b&gt;Amine&lt;/b&gt;")).toBe(true);
  });

  it("escapes HTML", () => {
    expect(escapeHtml('<b>&"').length).toBeGreaterThan(0);
    expect(escapeHtml("<b>")).toBe("&lt;b&gt;");
    expect(toReceiptData({}).company).toBe("Veloria");
  });

  it("formats codes, refs and payment methods", () => {
    expect(formatCustomerCode(125)).toBe("CL-00125");
    expect(formatCustomerCode(0)).toBe("—");
    expect(formatProductRef(125)).toBe("00125");
    expect(formatProductRef(null)).toBe("—");
    expect(paymentMethodLabel("cash")).toBe("Espèces");
    expect(paymentMethodLabel("cheque")).toBe("Chèque");
    expect(paymentMethodLabel("transfer")).toBe("Virement");
    expect(paymentMethodLabel("")).toBe("");
  });

  it("writes amounts in French words", () => {
    const cases: [number, string][] = [
      [0, "Zéro dinar algérien."],
      [100, "Un dinar algérien."],
      [1700, "Dix-sept dinars algériens."],
      [2100, "Vingt et un dinars algériens."],
      [7000, "Soixante-dix dinars algériens."],
      [7100, "Soixante et onze dinars algériens."],
      [7700, "Soixante-dix-sept dinars algériens."],
      [8000, "Quatre-vingts dinars algériens."],
      [8100, "Quatre-vingt-un dinars algériens."],
      [9100, "Quatre-vingt-onze dinars algériens."],
      [9900, "Quatre-vingt-dix-neuf dinars algériens."],
      [10000, "Cent dinars algériens."],
      [10100, "Cent un dinars algériens."],
      [20000, "Deux cents dinars algériens."],
      [20100, "Deux cent un dinars algériens."],
      [100000, "Mille dinars algériens."],
      [110000, "Mille cent dinars algériens."],
      [200000, "Deux mille dinars algériens."],
      [100000000, "Un million dinars algériens."],
      [148500, "Mille quatre cent quatre-vingt-cinq dinars algériens."],
      [116500, "Mille cent soixante-cinq dinars algériens."],
      [148550, "Mille quatre cent quatre-vingt-cinq dinars algériens et 50 centimes."],
    ];
    for (const [minor, words] of cases) {
      expect(amountInWordsFr(minor), String(minor)).toBe(words);
    }
  });

  it("sanitizes Code 39 input", () => {
    expect(sanitizeCode39("fac-2026-00001")).toBe("FAC-2026-00001");
    expect(sanitizeCode39("héllo!")).toBe("HLLO");
    expect(sanitizeCode39("!!!")).toBe("");
  });
});

describe("Code 39 barcode (ISO 16388)", () => {
  it("holds 44 valid patterns (9 modules, exactly 3 wide)", () => {
    const keys = Object.keys(CODE39_PATTERNS);
    expect(keys.length).toBe(44);
    for (const k of keys) {
      const p = CODE39_PATTERNS[k] as string;
      expect(p.length, k).toBe(9);
      expect(/^[nw]{9}$/.test(p), k).toBe(true);
      expect(p.split("").filter((c) => c === "w").length, k).toBe(3);
    }
  });

  it("matches reference patterns (0, A, P, -, *)", () => {
    expect(CODE39_PATTERNS["0"]).toBe("nnnwwnwnn");
    expect(CODE39_PATTERNS["A"]).toBe("wnnnnwnnw");
    expect(CODE39_PATTERNS["P"]).toBe("nnwnwnnwn");
    expect(CODE39_PATTERNS["-"]).toBe("nwnnnnwnw");
    expect(CODE39_PATTERNS["*"]).toBe("nwnnwnwnn");
  });

  it("renders a deterministic SVG with start/stop and label", () => {
    const a = code39Svg("FAC-2026-00001");
    expect(code39Svg("FAC-2026-00001")).toBe(a);
    expect(a.includes("<svg")).toBe(true);
    expect(a.includes("FAC-2026-00001")).toBe(true);
    // 14 caractères + 2 délimiteurs = 16 glyphes × 5 barres.
    const bars = (a.match(/<rect /g) ?? []).length;
    expect(bars).toBe(16 * 5);
    expect(code39Svg("!!!")).toBe("");
  });

  it("embeds the barcode in A4 invoice and proforma", () => {
    const invoice = buildA4Html(DOC);
    expect(invoice.includes("<svg")).toBe(true);
    expect(invoice.includes("FAC-2026-00001")).toBe(true);
    const proforma = buildProformaA4Html(PROFORMA);
    expect(proforma.includes("<svg")).toBe(true);
    expect(proforma.includes("PRO-2026-00042")).toBe(true);
  });
});

const PROFORMA: ProformaData = {
  company: "Veloria",
  companyPhone: "0550",
  companyAddress: "Alger",
  companyCity: "",
  companyEmail: "",
  companyLogo: "",
  companyRc: "16/00-1234567",
  companyNif: "000123456789012",
  footerText: "",
  customerName: "Amine Benali",
  customerPhone: "",
  customerAddress: "",
  number: "PRO-2026-00042",
  date: "01/01/2026",
  dueDate: "",
  notes: "",
  lines: [
    {
      name: "Coca",
      qty: 2,
      unit: "PIECE",
      unitPriceMinor: 10000,
      lineTotalMinor: 20000,
      ref: "00125",
    },
  ],
  subtotalMinor: 20000,
  discountMinor: 0,
  totalMinor: 20000,
};

describe("Proforma documents (no fiscal value)", () => {
  it("80mm never says Facture and shows the proforma number", () => {
    const text = buildProformaText(PROFORMA);
    expect(buildProformaText(PROFORMA)).toBe(text); // déterministe
    expect(text.includes("Facture")).toBe(false);
    for (const needle of [
      "DEVIS",
      "PRO-2026-00042",
      "Amine Benali",
      "Coca",
      "TOTAL DEVIS",
      "SANS VALEUR FISCALE",
    ]) {
      expect(text.includes(needle), needle).toBe(true);
    }
  });

  it("A4 never says Facture and stamps the no-fiscal-value notice", () => {
    const html = buildProformaA4Html(PROFORMA);
    expect(buildProformaA4Html(PROFORMA)).toBe(html);
    expect(html.includes(">Facture<")).toBe(false);
    for (const needle of [
      "PROFORMA / DEVIS",
      "Destinataire",
      "PRO-2026-00042",
      "Réf.",
      "00125",
      "TOTAL",
      "Montant en lettres",
      "Conditions",
      "Validité",
      "30 jours",
      "Document non comptabilisé",
      "Signature client",
    ]) {
      expect(html.includes(needle), needle).toBe(true);
    }
    // Devis : ni payé ni reste.
    expect(html.includes("Payé")).toBe(false);
    expect(html.includes("RESTE")).toBe(false);
  });

  it("maps the generic print payload (invoice carries the proforma number)", () => {
    // P2 : toProformaData supprimé — chemin vivant = toReceiptData + proformaFromReceipt.
    const d = proformaFromReceipt(
      toReceiptData({
        company: "Veloria",
        customerName: "Amine Benali",
        invoice: "PRO-2026-00042",
        date: "01/01/2026",
        lines: PROFORMA.lines,
        subtotalMinor: 20000,
        totalMinor: 20000,
      }),
    );
    expect(d.number).toBe("PRO-2026-00042");
    expect(d.customerName).toBe("Amine Benali");
    expect(d.totalMinor).toBe(20000);
  });

  it("proforma projection keeps the injected logo", () => {
    const d = proformaFromReceipt({ ...DOC, companyLogo: "data:image/png;base64,QUJD" });
    expect(d.companyLogo).toBe("data:image/png;base64,QUJD");
    const html = buildProformaA4Html(d);
    expect(html.includes('src="data:image/png;base64,QUJD"')).toBe(true);
  });
});

describe("Closing rules", () => {
  it("computes the Z balance and validates the date", () => {
    expect(
      computeClosingBalance({
        openingMinor: 0,
        cashSalesMinor: 100,
        customerCollectionsMinor: 50,
        expensesMinor: 20,
        refundsMinor: 10,
      }),
    ).toBe(120);
    expect(() => validateBusinessDate("2026-13-45")).toThrow();
    expect(() => validateBusinessDate("2026-03-01")).not.toThrow();
  });
});

describe("Expense draft", () => {
  it("rejects bad drafts", () => {
    expect(() =>
      validateExpenseDraft({
        description: "X",
        category: "Autre",
        amountMinor: 100,
        expenseDate: "2026-01-01",
      }),
    ).toThrow();
    expect(() =>
      validateExpenseDraft({
        description: "Loyer",
        category: "Loyer",
        amountMinor: 5000,
        expenseDate: "01/01/2026",
      }),
    ).toThrow();
    expect(() =>
      validateExpenseDraft({
        description: "Loyer",
        category: "Loyer",
        amountMinor: 5000,
        expenseDate: "2026-01-01",
      }),
    ).not.toThrow();
  });
});

describe("printPayloadSchema P04 (coherence ticket)", () => {
  const base = {
    company: "Veloria",
    invoice: "FAC-2026-00001",
    date: "22/09/2026",
    paymentMethod: "cash" as const,
    lines: [
      {
        name: "Coca",
        qty: 2,
        unit: "PIECE",
        unitPriceMinor: 9000,
        lineTotalMinor: 18000,
        ref: "00001",
      },
    ],
    // Vente REMISEE (domaine) : sous-total = somme origine (20000),
    // remise = 2000, lignes au prix FACTURE (somme = 18000).
    subtotalMinor: 20000,
    discountMinor: 2000,
    deliveryMinor: 0,
    totalMinor: 18000,
    paidMinor: 18000,
  };

  it("accepte une vente remisee coherente (sous-total - remise = somme lignes)", async () => {
    const { printPayloadSchema } = await import("../../electron/ipc/validators");
    expect(() => printPayloadSchema.parse(base)).not.toThrow();
  });

  it("rejette un sous-total incoherent avec les lignes", async () => {
    const { printPayloadSchema } = await import("../../electron/ipc/validators");
    expect(() => printPayloadSchema.parse({ ...base, subtotalMinor: 99999 })).toThrow();
  });

  it("accepte un devis a remise globale (sous-total = somme lignes)", async () => {
    const { printPayloadSchema } = await import("../../electron/ipc/validators");
    expect(() =>
      printPayloadSchema.parse({
        ...base,
        lines: [
          {
            name: "Lot",
            qty: 2,
            unit: "PIECE",
            unitPriceMinor: 10000,
            lineTotalMinor: 20000,
            ref: "",
          },
        ],
        subtotalMinor: 20000,
        discountMinor: 1000,
        deliveryMinor: 500,
        totalMinor: 19500,
        paidMinor: 0,
      }),
    ).not.toThrow();
  });

  it("rejette une ligne incoherente (total != prix x qte)", async () => {
    const { printPayloadSchema } = await import("../../electron/ipc/validators");
    expect(() =>
      printPayloadSchema.parse({
        ...base,
        lines: [{ ...base.lines[0], lineTotalMinor: 1 }],
        subtotalMinor: 2000,
        discountMinor: 1999,
        totalMinor: 1,
        paidMinor: 1,
      }),
    ).toThrow();
  });
});
