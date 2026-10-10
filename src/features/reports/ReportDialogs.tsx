// Veloria PoS — Rapports : dialogue d'export (CSV/impression).
import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { useCompany } from "@shared/company/use-company.ts";
import { formatDzd } from "@domain/money/money.ts";
import { formatDateFr, formatDzdSigned } from "@shared/formatters/format.ts";
import { downloadCsv } from "@shared/export/csv.ts";
import { Button, Field, Modal, Select, Switch, TextInput } from "@shared/ui/primitives.tsx";
import type { ReportSummary } from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

export function ReportExportDialog({
  summary,
  stockValue,
  onClose,
  onPreviewed,
  notify,
}: {
  summary: ReportSummary;
  stockValue: number | null;
  onClose: () => void;
  onPreviewed: (htmlA4: string, payload: Record<string, unknown>) => void;
  notify: Notify;
}): React.JSX.Element {
  const [format, setFormat] = useState<"csv" | "print">("csv");
  const [withDetails, setWithDetails] = useState(true);
  const [withCharts, setWithCharts] = useState(true);
  const [busy, setBusy] = useState(false);
  // Fiche entreprise réelle sur le rapport (jamais de raison sociale codée en dur).
  const { record: companyRecord } = useCompany();
  const companyName = companyRecord?.["company_name"] ?? "Veloria";

  const k = summary.kpis;
  const period = `Du ${formatDateFr(summary.from)} au ${formatDateFr(summary.to)}`;

  function csvRows(): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [
      { Rubrique: "Ventes", Montant: formatDzd(k.salesMinor), Nombre: k.salesCount },
      { Rubrique: "Achats", Montant: formatDzd(k.purchasesMinor), Nombre: k.purchasesCount },
      { Rubrique: "Dépenses", Montant: formatDzd(k.expensesMinor), Nombre: "" },
      { Rubrique: "Marge brute", Montant: formatDzdSigned(k.profitMinor), Nombre: "" },
      { Rubrique: "Créances clients", Montant: formatDzd(k.customerDebtMinor), Nombre: "" },
      { Rubrique: "Dettes fournisseurs", Montant: formatDzd(k.supplierDebtMinor), Nombre: "" },
      {
        Rubrique: "Stock (valorisation)",
        Montant: stockValue == null ? "" : formatDzd(stockValue),
        Nombre: "",
      },
    ];
    if (withDetails) {
      for (const b of summary.buckets) {
        rows.push({
          Rubrique: `Jour ${b.date}`,
          Montant: `Ventes ${formatDzd(b.sales)} · Achats ${formatDzd(b.purchases)} · Dépenses ${formatDzd(b.expenses)} · Marge ${formatDzdSigned(b.profit)}`,
          Nombre: "",
        });
      }
      for (const t of summary.tops.customers) {
        rows.push({ Rubrique: `Client ${t.name}`, Montant: formatDzd(t.total), Nombre: "" });
      }
      for (const t of summary.tops.suppliers) {
        rows.push({ Rubrique: `Fournisseur ${t.name}`, Montant: formatDzd(t.total), Nombre: "" });
      }
      for (const t of summary.tops.products) {
        rows.push({
          Rubrique: `Produit ${t.name}`,
          Montant: formatDzd(t.total),
          Nombre: t.qty ?? "",
        });
      }
    }
    return rows;
  }

  function printPayload(): Record<string, unknown> {
    const tables: { title: string; headers: string[]; rows: string[][] }[] = [
      {
        title: "Indicateurs",
        headers: ["Rubrique", "Montant", "Nombre"],
        rows: [
          ["Ventes", formatDzd(k.salesMinor), String(k.salesCount)],
          ["Achats", formatDzd(k.purchasesMinor), String(k.purchasesCount)],
          ["Dépenses", formatDzd(k.expensesMinor), ""],
          ["Marge brute", formatDzdSigned(k.profitMinor), ""],
          ["Créances clients", formatDzd(k.customerDebtMinor), ""],
          ["Dettes fournisseurs", formatDzd(k.supplierDebtMinor), ""],
        ],
      },
    ];
    if (withDetails) {
      tables.push(
        {
          title: "Principaux clients",
          headers: ["Client", "Total"],
          rows: summary.tops.customers.map((t) => [t.name, formatDzd(t.total)]),
        },
        {
          title: "Principaux fournisseurs",
          headers: ["Fournisseur", "Total"],
          rows: summary.tops.suppliers.map((t) => [t.name, formatDzd(t.total)]),
        },
        {
          title: "Principaux produits",
          headers: ["Produit", "Qté", "Total"],
          rows: summary.tops.products.map((t) => [t.name, String(t.qty ?? 0), formatDzd(t.total)]),
        },
      );
    }
    return {
      title: "Rapport d'activité",
      period,
      company: companyName,
      kpis: [
        { label: "Ventes", value: formatDzd(k.salesMinor) },
        { label: "Achats", value: formatDzd(k.purchasesMinor) },
        { label: "Marge brute", value: formatDzdSigned(k.profitMinor) },
      ],
      charts: withCharts
        ? [
            {
              title: "Ventes",
              labels: summary.buckets.map((b) => b.date),
              values: summary.buckets.map((b) => b.sales),
            },
            {
              title: "Marge brute",
              labels: summary.buckets.map((b) => b.date),
              values: summary.buckets.map((b) => Math.max(0, b.profit)),
            },
          ]
        : [],
      tables,
      footer: `${companyName} · Veloria POS · ${period}`,
    };
  }

  async function run(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      if (format === "csv") {
        downloadCsv(`rapport-${summary.from}-${summary.to}.csv`, csvRows());
        notify("Rapport CSV exporté (ouvrable dans Excel).", "ok");
        onClose();
      } else {
        const payload = printPayload();
        const pv = (await api.reportPreview(payload)) as { htmlA4: string };
        onPreviewed(pv.htmlA4, payload);
        onClose();
      }
    } catch (e) {
      notify(frError(e, "Export impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label="Exporter le rapport" title="Exporter le rapport" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Format">
          <Select
            value={format}
            onChange={(e) => setFormat(e.target.value as "csv" | "print")}
            aria-label="Format d'export"
          >
            <option value="csv">CSV (Excel)</option>
            <option value="print">Aperçu / Impression</option>
          </Select>
        </Field>
        <Field label="Période">
          <TextInput value={period} aria-label="Période" disabled />
        </Field>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold">
          <span>Inclure le détail (jours, tops)</span>
          <Switch
            checked={withDetails}
            onChange={() => setWithDetails((v) => !v)}
            ariaLabel="Inclure le détail"
          />
        </label>
        {format === "print" ? (
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold">
            <span>Inclure les graphiques</span>
            <Switch
              checked={withCharts}
              onChange={() => setWithCharts((v) => !v)}
              ariaLabel="Inclure les graphiques"
            />
          </label>
        ) : null}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button onClick={() => void run()} disabled={busy} className="flex-[2]">
            {busy ? (
              "…"
            ) : format === "csv" ? (
              <>
                <Download size={15} aria-hidden="true" /> Exporter CSV
              </>
            ) : (
              <>
                <Printer size={15} aria-hidden="true" /> Aperçu
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          CSV s'ouvre dans Excel. Pour un PDF : aperçu puis « Enregistrer au format PDF » depuis le
          dialogue d'impression.
        </p>
      </div>
    </Modal>
  );
}
