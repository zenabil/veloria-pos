// Veloria PoS — Tests : rapports (sections, schémas, builders d'impression).
import { describe, it, expect } from "vitest";
import { REPORT_SECTIONS, currentBusinessMonthStart } from "@features/reports/types.ts";
import { businessMonthStart, todayBusinessDate } from "@domain/common/business-day.ts";
import { reportPayloadSchema, reportSummarySchema } from "../../electron/ipc/validators.ts";
import { buildReportHtml, toReportData } from "../../electron/printing/receipt-documents";

describe("Report UI helpers", () => {
  it("couvre les rubriques rendues + all (onglets sans carte retirés — audit)", () => {
    // FIXED racine : profit/expenses/stock/supplierDebt/returns n' avaient
    // aucune carte — la liste n'expose plus ces « lure tabs ».
    expect(REPORT_SECTIONS.length).toBe(6);
    expect(REPORT_SECTIONS[0]?.value).toBe("all");
    expect(REPORT_SECTIONS.some((s) => s.value === "closings")).toBe(true);
    expect(REPORT_SECTIONS.some((s) => s.value === "stock")).toBe(false);
    expect(REPORT_SECTIONS.some((s) => s.value === "returns")).toBe(false);
    // E-35 : « ce mois-ci » démarre au 1er du MOIS MÉTIER (Africa/Algiers).
    expect(businessMonthStart("2026-09-16")).toBe("2026-09-01");
    expect(businessMonthStart("2026-09-16T23:30:00.000Z")).toBe("");
    expect(currentBusinessMonthStart()).toBe(`${todayBusinessDate().slice(0, 7)}-01`);
  });
});

describe("Report Zod schemas", () => {
  it("validates summary filters", () => {
    const s = reportSummarySchema.parse({ from: "2026-09-01", to: "2026-09-30" });
    expect(s.customerId).toBe(undefined);
    expect(() => reportSummarySchema.parse({ from: "2026-09-30", to: "2026-09-01" })).not.toThrow();
    expect(() => reportSummarySchema.parse({ from: "nope", to: "2026-09-01" })).toThrow();
  });

  it("validates report payloads", () => {
    const p = reportPayloadSchema.parse({
      title: "Rapport d'activité",
      kpis: [{ label: "Ventes", value: "100 DA" }],
      charts: [{ title: "Ventes", labels: ["01", "02"], values: [10, 20] }],
      tables: [{ title: "Top", headers: ["Nom", "Total"], rows: [["A", "10 DA"]] }],
    });
    expect(p.tables.length).toBe(1);
    expect(() => reportPayloadSchema.parse({ title: "x" })).toThrow();
  });
});

describe("Report printing", () => {
  it("builds a deterministic A4 with KPIs, charts and tables", () => {
    const d = toReportData({
      title: "Rapport d'activité",
      period: "Du 2026-09-01 au 2026-09-30",
      company: "Veloria",
      kpis: [{ label: "Ventes", value: "1 000 DA" }],
      charts: [{ title: "Ventes", labels: ["01", "02"], values: [100, 200] }],
      tables: [{ title: "Top", headers: ["Nom"], rows: [["A"]] }],
      footer: "Veloria POS",
    });
    const a = buildReportHtml(d);
    expect(buildReportHtml(d)).toBe(a);
    for (const needle of [
      "Rapport d'activité",
      "Ventes",
      "1 000 DA",
      "Top",
      "<svg",
      "Veloria POS",
    ]) {
      expect(a.includes(needle), needle).toBe(true);
    }
  });
});
