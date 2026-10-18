// Veloria PoS — Parite du decoupage printing (zero changement fonctionnel).
// Chaque module electron/printing/* est couvert : parite domaine, noms FR,
// limite etiquettes, determinisme barrel vs direct, canaux IPC, gabarits.
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const mocks = vi.hoisted(() => ({ handle: vi.fn() }));

vi.mock("electron", () => ({
  ipcMain: { handle: mocks.handle },
  dialog: { showSaveDialog: vi.fn() },
  BrowserWindow: class {
    isDestroyed = false;
  },
  app: { getPath: () => "/tmp-veloria-test", getVersion: () => "0.0.0-test" },
}));

vi.mock("../../../electron/database/sqlite.service", () => ({
  getDb: () => {
    throw new Error("Base indisponible en test unitaire.");
  },
}));

import { mergeTemplateSettings, TEMPLATE_DOC_TYPES } from "@domain/print/template-rules.ts";
import {
  activeTemplateSettings,
  mergeTemplateMirror,
  templateRenderOf,
} from "../../../electron/printing/printing.templates";
import { safeInvoiceFileName } from "../../../electron/printing/printing.pdf";
import { labelsOf } from "../../../electron/printing/printing.reports-labels";
import {
  renderTemplateSample,
  sampleLines,
  sampleReceipt,
} from "../../../electron/printing/printing.samples";
import { escapeQr, qrSvgOf, receiptCodes } from "../../../electron/printing/printing.enrich";
import {
  isValidationError,
  unavailable,
  validationError,
} from "../../../electron/printing/printing.guards";
import {
  getSelectedPrinterName,
  getThermalWidth,
} from "../../../electron/printing/printing.printer-settings";
import {
  registerPrintingIpc,
  activeTemplateSettings as svcActive,
  getThermalWidth as svcWidth,
  mergeTemplateMirror as svcMerge,
  pageOptsOf as svcPage,
  templateRenderOf as svcRender,
} from "../../../electron/printing/printing.service";
import { registerReceiptIpc } from "../../../electron/printing/printing.receipt";
import { registerProformaIpc } from "../../../electron/printing/printing.proforma";
import { registerReportsLabelsIpc } from "../../../electron/printing/printing.reports-labels";
import { registerPaymentIpc } from "../../../electron/printing/printing.payment";
import { registerLogisticsIpc } from "../../../electron/printing/printing.logistics";
import { registerPdfExportsIpc } from "../../../electron/printing/printing.pdf-exports";
import { registerStudioIpc } from "../../../electron/printing/printing.studio";
import * as barrel from "../../../electron/printing/receipt-documents";
import { buildReceiptText as buildReceiptTextDirect } from "../../../electron/printing/receipt-documents/receipt-text";

const root = process.cwd();
const noDb = (): null => null;

function handled(): string[] {
  return mocks.handle.mock.calls.map((c) => String(c[0]));
}

beforeEach(() => {
  mocks.handle.mockClear();
});

describe("printing.guards : formes FR", () => {
  it("validationError / unavailable, jamais d'exception brute", () => {
    expect(validationError()).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Document d'impression invalide.",
    });
    expect(unavailable("Fenêtre d'impression indisponible.")).toEqual({
      ok: false,
      code: "PRINTER_UNAVAILABLE",
      message: "Fenêtre d'impression indisponible.",
    });
    const z = new Error("x");
    z.name = "ZodError";
    expect(isValidationError(z)).toBe(true);
    expect(isValidationError(new Error("boom"))).toBe(false);
  });
});

describe("printing.printer-settings : replis sans base", () => {
  it("null / 80mm quand la base est illisible (panne jamais bloquante)", () => {
    expect(getSelectedPrinterName()).toBeNull();
    expect(getThermalWidth()).toBe("80mm");
  });
});

describe("printing.enrich : helpers purs", () => {
  it("escapeQr echappe l'attribut SVG", () => {
    expect(escapeQr('a&b<"c">')).toBe("a&amp;b&lt;&quot;c&quot;&gt;");
  });
  it("receiptCodes coupe tout quand qrOff", () => {
    const d = { ...sampleReceipt(), qrOff: true as const };
    expect(receiptCodes(d)).toEqual({ barcode: d.invoice, qrSvg: "", qrPayload: "" });
  });
  // Timeout élargi (60 s) : génération QR CPU-bound — 145 ms isolé mais
  // >15 s sous suite complète chargée (workers vitest + SQLite). L'assertion
  // est inchangée (aucun assouplissement fonctionnel).
  it("qrSvgOf produit un SVG", { timeout: 60_000 }, () => {
    expect(qrSvgOf("TEST-123", 2).startsWith("<svg")).toBe(true);
  });
});

describe("printing.templates : parite miroir vs domaine", () => {
  it("parite exacte sur {} pour les 6 types", () => {
    for (const docType of TEMPLATE_DOC_TYPES) {
      expect(mergeTemplateMirror(docType, {})).toEqual(mergeTemplateSettings(docType, {}));
    }
  });
  it("parite exacte sur reglages valides", () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ["ticket", { paper: "58mm", copies: 2 }],
      ["proforma", { paper: "A4", marginMm: 10, showTva: false }],
      // Un devis ne peut pas deriver vers le ticket : repli A4 des deux cotes.
      ["proforma", { paper: "58mm" }],
      ["avoir", { paper: "58mm", copies: 3 }],
      ["bon_livraison", { paper: "80mm", thermalFontPx: 12 }],
      ["etiquette", { showQr: true }],
      ["etiquette", {}],
      ["recu", { showQr: false, copies: 5, thermalFontPx: 9 }],
      ["proforma", { watermarkText: "BROUILLON", showWatermark: true }],
    ];
    for (const [docType, raw] of cases) {
      expect(mergeTemplateMirror(docType, raw)).toEqual(
        mergeTemplateSettings(docType as "ticket", raw),
      );
    }
  });
  it("replis thermiques sans base", () => {
    expect(activeTemplateSettings("ticket").paper).toBe("80mm");
    expect(templateRenderOf("ticket").width).toBe("80mm");
  });
});

describe("printing.pdf : nom de fichier sur", () => {
  it("safeInvoiceFileName neutralise", () => {
    expect(safeInvoiceFileName("FAC-2026-00001", "ticket-80mm")).toBe(
      "FAC-2026-00001-ticket-80mm.pdf",
    );
    expect(safeInvoiceFileName("a/b?c", "x")).toBe("a_b_c-x.pdf");
    expect(safeInvoiceFileName("", "recu")).toBe("document-recu.pdf");
  });
});

describe("printing.samples : coherence au centime", () => {
  it("lignes demo somment au sous-total", () => {
    const lines = sampleLines();
    const sum = lines.reduce((n, l) => n + l.lineTotalMinor, 0);
    expect(sum).toBe(sampleReceipt().subtotalMinor);
    const r = sampleReceipt();
    expect((r.htMinor ?? 0) + (r.tvaMinor ?? 0)).toBe(r.totalMinor);
  });
  it("renderTemplateSample : ticket = text80, devis = htmlA4", () => {
    const s = renderTemplateSample("ticket", undefined);
    expect(s.text80).toContain("TICKET DE CAISSE");
    // Vente = ticket : jamais de HTML A4 pour une vente.
    expect(s.htmlA4).toBe("");
    const p = renderTemplateSample("proforma", undefined);
    expect(p.text80).toBe("");
    expect(p.htmlA4).toContain("PROFORMA / DEVIS");
  });
});

describe("printing.reports-labels : limite 200 etiquettes", () => {
  const item = (
    copies: number,
  ): { name: string; priceMinor: number; barcode: string; copies: number } => ({
    name: "Sucre",
    priceMinor: 12000,
    barcode: "X1",
    copies,
  });
  it("refus FR au-dela de 200 au total", () => {
    expect(() => labelsOf({ items: [item(70), item(70), item(70)] })).toThrow(
      "Trop d'étiquettes : 200 maximum par lot.",
    );
  });
  it("200 pile acceptes", () => {
    const l = labelsOf({ items: [item(100), item(100)] });
    expect(l.items).toHaveLength(200);
    // Defaut du schema : gabarit thermique 45x20 (l'A4 est banni).
    expect(l.format).toBe("45x20");
  });
});

describe("receipt-documents : barrel vs direct", () => {
  it("buildReceiptText deterministe et identique", () => {
    const r = sampleReceipt();
    const a = barrel.buildReceiptText(r);
    expect(buildReceiptTextDirect(r)).toBe(a);
    expect(barrel.buildReceiptText(r)).toBe(a);
    expect(a).toContain("TICKET DE CAISSE");
  });
  it("surface publique inchangee", () => {
    for (const name of [
      "buildReceiptText",
      "toReceiptData",
      "buildProformaA4Html",
      "proformaFromReceipt",
      "buildPaymentText",
      "toPaymentTicketData",
      "buildReportHtml",
      "toReportData",
      "buildLabelsHtml",
      "LABEL_FORMATS",
      "labelPageMicrons",
      "buildDeliveryText",
      "buildReturnSlipText",
      "buildPurchaseOrderText",
      "timbreQuittanceLf2025",
      "paymentMethodLabel",
    ]) {
      expect((barrel as Record<string, unknown>)[name], name).toBeDefined();
    }
    // Chemins A4 bannis : plus aucune fabrique de facture/recu A4 dans le barrel.
    for (const name of [
      "buildA4Html",
      "buildProformaText",
      "buildPaymentTicketA4Html",
      "buildDeliveryHtml",
      "buildReturnSlipHtml",
      "buildPurchaseOrderHtml",
    ]) {
      expect((barrel as Record<string, unknown>)[name], name).toBeUndefined();
    }
    expect(typeof svcMerge).toBe("function");
    expect(typeof svcActive).toBe("function");
    expect(typeof svcWidth).toBe("function");
    expect(typeof svcPage).toBe("function");
    expect(typeof svcRender).toBe("function");
  });
});

describe("canaux IPC : parite avant/apres decoupe (27 canaux)", () => {
  const ALL = [
    "printing.listPrinters",
    "printing.printReceipt",
    "printing.preview",
    "printer.get",
    "printer.save",
    "printing.testPage",
    "printing.previewProforma",
    "printing.printProformaA4",
    "printing.previewReport",
    "printing.printReport",
    "printing.previewLabels",
    "printing.printLabels",
    "printing.previewPayment",
    "printing.printPayment",
    "printing.previewDelivery",
    "printing.printDelivery",
    "printing.previewReturnSlip",
    "printing.printReturnSlip",
    "printing.previewPO",
    "printing.printPO",
    "printing.exportReceiptPdf",
    "printing.exportProformaPdf",
    "printing.exportPaymentPdf",
    "printing.exportReportPdf",
    "printing.exportLabelsPdf",
    "templates.preview",
    "templates.testPrint",
  ];
  it("chaque module enregistre ses canaux", () => {
    registerReceiptIpc(noDb);
    for (const c of ALL.slice(0, 6)) {
      expect(handled(), c).toContain(c);
    }
    mocks.handle.mockClear();
    registerProformaIpc(noDb);
    for (const c of ALL.slice(6, 8)) expect(handled(), c).toContain(c);
    mocks.handle.mockClear();
    registerReportsLabelsIpc(noDb);
    for (const c of ALL.slice(8, 12)) expect(handled(), c).toContain(c);
    mocks.handle.mockClear();
    registerPaymentIpc(noDb);
    for (const c of ALL.slice(12, 14)) expect(handled(), c).toContain(c);
    mocks.handle.mockClear();
    registerLogisticsIpc(noDb);
    for (const c of ALL.slice(14, 20)) expect(handled(), c).toContain(c);
    mocks.handle.mockClear();
    registerPdfExportsIpc(noDb);
    for (const c of ALL.slice(20, 25)) expect(handled(), c).toContain(c);
    mocks.handle.mockClear();
    registerStudioIpc(noDb);
    for (const c of ALL.slice(25)) expect(handled(), c).toContain(c);
  });
  it("composition : les 27 canaux, aucun ajout ni perte", () => {
    registerPrintingIpc(noDb);
    expect(handled().sort()).toEqual([...ALL].sort());
  });
});

describe("gabarits : chaque fichier <= 300 lignes, service <= 150", () => {
  it("bornes de decoupage", () => {
    const dir = path.join(root, "electron/printing");
    const files: string[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        for (const f of fs.readdirSync(path.join(dir, e.name))) files.push(`${e.name}/${f}`);
      } else if (e.name.endsWith(".ts")) files.push(e.name);
    }
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const n = fs.readFileSync(path.join(dir, f), "utf8").split("\n").length;
      expect(n, f).toBeLessThanOrEqual(300);
    }
    const svc = fs.readFileSync(path.join(dir, "printing.service.ts"), "utf8").split("\n").length;
    expect(svc).toBeLessThanOrEqual(150);
  });
});
