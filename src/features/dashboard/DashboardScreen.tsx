// Veloria PoS — Écran : Tableau de bord (synthèse période + instantanés).
import { useEffect, useRef, useState } from "react";
import { FileDown, RefreshCw } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { useCompany } from "@shared/company/use-company.ts";
import { formatDzdTotal, formatDzdTotalSigned } from "@domain/money/money.ts";
import { formatDateFr, formatDateTimeFr } from "@shared/formatters/format.ts";
import { BarChart } from "@shared/charts/BarChart.tsx";
import { todayUtcDate } from "@shared/dates/dates.ts";
import { downloadCsv } from "@shared/export/csv.ts";
import { isAnyModalOpen } from "@shared/ui/use-busy.ts";
import { useLoadSeq } from "@shared/ui/use-load-seq.ts";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Kbd,
  Kpi,
  Modal,
  PageHeader,
  TextInput,
  cn,
} from "@shared/ui/primitives.tsx";
import { paymentMethodLabel, type DashboardSummary } from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { EmptyMini, RecentCard, RecentRow } from "./widgets.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { useCountUp } from "@shared/ui/use-count-up.ts";

/** D7+D16 : bande « Aujourd'hui » — trois chiffres de décision animés
 *  (compteur 300 ms, réduit au final si `prefers-reduced-motion`). */
function TodayStrip({
  salesMinor,
  overdue,
  out,
}: {
  /** Sentinel -1 = today is excluded from the filtered period (hide the cell). */
  salesMinor: number;
  overdue: number;
  out: number;
}): React.JSX.Element {
  const sales = useCountUp(salesMinor >= 0 ? salesMinor : 0);
  const late = useCountUp(overdue);
  const ruptures = useCountUp(out);
  const cells: { label: string; value: string; tone: string }[] = [];
  // Sentinelle -1 : période sans aujourd'hui → cellule masquée (jamais « 0 » trompeur).
  if (salesMinor >= 0) {
    cells.push({
      label: "Ventes du jour",
      value: formatDzdTotalSigned(sales),
      tone: "text-[#d4e4fa]",
    });
  }
  cells.push(
    {
      label: "Échéances dépassées",
      value: String(late),
      tone: late > 0 ? "text-red-300" : "text-emerald-300",
    },
    {
      label: "Ruptures",
      value: String(ruptures),
      tone: ruptures > 0 ? "text-amber-300" : "text-emerald-300",
    },
  );
  return (
    <div
      aria-label="Chiffres du jour"
      className="grid grid-cols-1 gap-3 rounded-xl border border-white/[0.07] bg-[#0a0f1c] p-3 sm:grid-cols-3"
    >
      {cells.map((c) => (
        <div key={c.label} className="flex items-baseline justify-between gap-2 px-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#d3c5ac]/70">
            {c.label}
          </span>
          <span className={`font-mono-currency-lg tabular-nums ${c.tone}`}>{c.value}</span>
        </div>
      ))}
    </div>
  );
}

export function DashboardScreen({ notify }: { notify: Notify }): React.JSX.Element {
  const [from, setFrom] = useState(todayUtcDate());
  const [to, setTo] = useState(todayUtcDate());
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  // A-06 : erreur de chargement PERSISTANTE (le toast dure 4,5 s).
  // Distingue « échec du chargement » de « aucune donnée ».
  const [loadError, setLoadError] = useState("");
  const [preview, setPreview] = useState<{ htmlA4: string } | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const fromRef = useRef<HTMLInputElement>(null);
  // Fiche entreprise réelle sur le rapport (jamais de raison sociale codée en dur).
  const { record: companyRecord } = useCompany();
  const { next: nextSeq, isCurrent: isSeqCurrent } = useLoadSeq();

  async function load(f = from, t = to): Promise<void> {
    if (f === "" || t === "") return;
    // Garde anti-course (même motif que les autres écrans) : une réponse
    // périmée d'une plage précédente ne doit pas écraser la plus récente.
    const seq = nextSeq();
    setLoading(true);
    setLoadError("");
    try {
      const s = (await api.dashboardSummary({ from: f, to: t })) as DashboardSummary;
      if (!isSeqCurrent(seq)) return;
      setSummary(s);
    } catch (e) {
      if (!isSeqCurrent(seq)) return;
      const loadErrorMessage = frError(e, "Chargement impossible.");
      setLoadError(loadErrorMessage);
      notify(loadErrorMessage, "err");
    } finally {
      if (isSeqCurrent(seq)) setLoading(false);
    }
  }

  // Chargement initial (journée en cours).
  useEffect(() => {
    const today = todayUtcDate();
    setFrom(today);
    setTo(today);
    void load(today, today);
  }, []);

  // Raccourcis réels Stitch : F4 dates · F5 actualiser · F8 exporter.
  // miroir des dernières fonctions : l'écouteur reste monté (deps []) sans
  // se réattacher à chaque render, tout en voyant les valeurs courantes.
  const actionsRef = useRef({ load, exportReport });
  useEffect(() => {
    actionsRef.current = { load, exportReport };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isAnyModalOpen()) return;
      if (e.key === "F4") {
        e.preventDefault();
        fromRef.current?.focus();
      } else if (e.key === "F5") {
        e.preventDefault();
        void actionsRef.current.load();
      } else if (e.key === "F8") {
        e.preventDefault();
        actionsRef.current.exportReport();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function changeRange(f: string, t: string): void {
    setFrom(f);
    setTo(t);
    if (f !== "" && t !== "") void load(f, t);
  }

  /** Presets Stitch (UTC) : Aujourd'hui · Hier · 7 derniers jours · Ce mois. */
  function applyPreset(kind: "today" | "yesterday" | "week" | "month"): void {
    const iso = (d: Date): string => d.toISOString().slice(0, 10);
    const now = new Date();
    const today = iso(now);
    if (kind === "today") {
      changeRange(today, today);
    } else if (kind === "yesterday") {
      const y = iso(new Date(now.getTime() - 86400000));
      changeRange(y, y);
    } else if (kind === "week") {
      changeRange(iso(new Date(now.getTime() - 6 * 86400000)), today);
    } else {
      changeRange(today.slice(0, 8) + "01", today);
    }
  }

  /** Lignes d'export : brutes (centimes, sommables) ou humaines (DZD). */
  function buildExportRows(human: boolean): Record<string, unknown>[] | null {
    if (!summary || !k) return null;
    const money = (v: number, signed = false): number | string =>
      human ? (signed ? formatDzdTotalSigned(v) : formatDzdTotal(v)) : v;
    const unit = human ? "(DZD)" : "(centimes)";
    return [
      { Section: "Période", Rubrique: "Du", Nombre: null, Valeur: summary.from },
      { Section: "Période", Rubrique: "Au", Nombre: null, Valeur: summary.to },
      {
        Section: "KPI",
        Rubrique: `Ventes nettes ${unit}`,
        Nombre: k.salesCount,
        Valeur: money(k.salesMinor),
      },
      {
        Section: "KPI",
        Rubrique: `Achats nets ${unit}`,
        Nombre: k.purchasesCount,
        Valeur: money(k.purchasesMinor),
      },
      {
        Section: "KPI",
        Rubrique: `Dépenses ${unit}`,
        Nombre: k.expensesCount,
        Valeur: money(k.expensesMinor),
      },
      {
        Section: "KPI",
        Rubrique: `Marge brute ${unit}`,
        Nombre: null,
        Valeur: money(k.profitMinor, true),
      },
      {
        Section: "KPI",
        Rubrique: `Créances clients ${unit}`,
        Nombre: null,
        Valeur: money(k.customerDebtMinor),
      },
      {
        Section: "KPI",
        Rubrique: `Dettes fournisseurs ${unit}`,
        Nombre: null,
        Valeur: money(k.supplierDebtMinor),
      },
      {
        Section: "KPI",
        Rubrique: `Stock valeur achat ${unit}`,
        Nombre: null,
        Valeur: money(k.stockValueMinor),
      },
      {
        Section: "KPI",
        Rubrique: `Trésorerie ${unit}`,
        Nombre: null,
        Valeur: money(k.cashMinor, true),
      },
      ...summary.byCategory.flatMap((c) => [
        {
          Section: "Ventes par catégorie",
          Rubrique: `${c.name} — ventes`,
          Nombre: null,
          Valeur: money(c.salesMinor, true),
        },
        {
          Section: "Ventes par catégorie",
          Rubrique: `${c.name} — marge`,
          Nombre: null,
          Valeur: money(c.profitMinor, true),
        },
      ]),
      ...summary.daily.map((d) => ({
        Section: "Ventes journalières",
        Rubrique: d.d,
        Nombre: d.n as number | null,
        Valeur: money(d.t),
      })),
      ...summary.byMethod.map((m) => ({
        Section: "Moyens de paiement",
        Rubrique: paymentMethodLabel(m.method),
        Nombre: m.n as number | null,
        Valeur: money(m.t),
      })),
    ];
  }

  function pdfPayload(): Record<string, unknown> {
    const s = summary;
    const kk = k;
    if (!s || !kk) throw new Error("Aucune donnée.");
    const companyName = companyRecord?.["company_name"] ?? "Veloria";
    return {
      title: "Tableau de bord",
      period: `Du ${formatDateFr(s.from)} au ${formatDateFr(s.to)}`,
      company: companyName,
      kpis: [
        { label: "Ventes nettes", value: formatDzdTotalSigned(kk.salesMinor) },
        { label: "Achats nets", value: formatDzdTotal(kk.purchasesMinor) },
        { label: "Dépenses", value: formatDzdTotal(kk.expensesMinor) },
        { label: "Marge brute", value: formatDzdTotalSigned(kk.profitMinor) },
        { label: "Créances", value: formatDzdTotal(kk.customerDebtMinor) },
        { label: "Dettes", value: formatDzdTotal(kk.supplierDebtMinor) },
        { label: "Stock", value: formatDzdTotal(kk.stockValueMinor) },
        { label: "Trésorerie", value: formatDzdTotalSigned(kk.cashMinor) },
      ],
      charts: [
        {
          title: "Ventes journalières",
          labels: s.daily.slice(0, 62).map((d) => d.d.slice(5)),
          values: s.daily.slice(0, 62).map((d) => Math.max(0, d.t)),
        },
      ],
      tables: [
        {
          title: "Moyens de paiement",
          headers: ["Moyen", "Nombre", "Total"],
          rows: s.byMethod
            .slice(0, 50)
            .map((m) => [paymentMethodLabel(m.method), String(m.n), formatDzdTotalSigned(m.t)]),
        },
        {
          title: "Ventes par catégorie",
          headers: ["Catégorie", "Ventes nettes", "Retours", "Marge"],
          rows: s.byCategory
            .slice(0, 50)
            .map((c) => [
              c.name.slice(0, 60),
              formatDzdTotalSigned(c.salesMinor),
              formatDzdTotal(c.returnsMinor),
              formatDzdTotalSigned(c.profitMinor),
            ]),
        },
        {
          title: "5 meilleures rotations",
          headers: ["Produit", "Qté", "Total"],
          rows: s.fastMoving
            .slice(0, 50)
            .map((p) => [p.name.slice(0, 60), String(p.qty), formatDzdTotalSigned(p.total)]),
        },
        {
          title: "Échéances dépassées",
          headers: ["Tiers", "Réf", "Reste"],
          rows: s.overdue
            .slice(0, 50)
            .map((d) => [d.party.slice(0, 60), d.ref.slice(0, 40), formatDzdTotal(d.remaining)]),
        },
        {
          title: "Stock sous seuil",
          headers: ["Produit", "Qté", "Min"],
          rows: s.stock.lowRows
            .slice(0, 50)
            .map((p) => [p.name.slice(0, 60), String(p.quantity), String(p.min_stock_level)]),
        },
      ],
      footer: `${companyName} — synthèse générée le ${formatDateFr(todayUtcDate())}.`,
    };
  }

  /** Export Stitch [F8] : synthèse période en CSV brut (centimes, sommable). */
  function exportReport(): void {
    const rows = buildExportRows(false);
    if (!rows || !summary) {
      notify("Aucune donnée à exporter.", "err");
      return;
    }
    try {
      downloadCsv(`rapport-${summary.from}_${summary.to}.csv`, rows);
      notify("Rapport exporté.", "ok");
    } catch (e) {
      notify(frError(e, "Export impossible."), "err");
    }
  }

  /** Export Excel : même synthèse en DZD lisibles (CSV BOM, s'ouvre dans Excel). */
  function exportExcel(): void {
    const rows = buildExportRows(true);
    if (!rows || !summary) {
      notify("Aucune donnée à exporter.", "err");
      return;
    }
    try {
      downloadCsv(`rapport-${summary.from}_${summary.to}-excel.csv`, rows);
      notify("Classeur exporté (CSV ouvrable dans Excel).", "ok");
    } catch (e) {
      notify(frError(e, "Export impossible."), "err");
    }
  }

  /** Export PDF : aperçu A4 puis impression via le pipeline (licence reports). */
  async function exportPdf(): Promise<void> {
    if (!summary || !k || pdfBusy) return;
    setPdfBusy(true);
    try {
      const pv = (await api.reportPreview(pdfPayload())) as { htmlA4: string };
      setPreview({ htmlA4: pv.htmlA4 });
    } catch (e) {
      notify(frError(e, "Aperçu indisponible."), "err");
    } finally {
      setPdfBusy(false);
    }
  }

  async function printPdf(): Promise<void> {
    try {
      await api.reportPrint(pdfPayload());
      notify("Rapport envoyé à l'imprimante.", "ok");
    } catch (e) {
      notify(frError(e, "Impression impossible."), "err");
    }
  }

  async function exportPdfFile(): Promise<void> {
    try {
      const res = (await api.reportExportPdf(pdfPayload())) as { path: string };
      notify(`PDF enregistré : ${res.path}`, "ok");
    } catch (e) {
      notify(frError(e, "Export PDF impossible."), "err");
    }
  }

  const k = summary?.kpis;
  const categoryRows = summary?.byCategory ?? [];
  const visibleCategories =
    categoryFilter === "all"
      ? categoryRows
      : categoryRows.filter((c) => (c.id == null ? "none" : String(c.id)) === categoryFilter);
  const categoryTotals = visibleCategories.reduce(
    (acc, c) => ({
      salesMinor: acc.salesMinor + c.salesMinor,
      returnsMinor: acc.returnsMinor + c.returnsMinor,
      profitMinor: acc.profitMinor + c.profitMinor,
    }),
    { salesMinor: 0, returnsMinor: 0, profitMinor: 0 },
  );

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto">
      {/* En-tête Stitch : pastille + H1 + poste + période + export */}
      <PageHeader
        title="Tableau de bord"
        period={
          summary
            ? `Période analytique : ${formatDateFr(summary.from)} au ${formatDateFr(summary.to)} · Net des avoirs et retours caisse`
            : "Vue d'ensemble — synthèse d'activité"
        }
        actions={
          <>
            <TextInput
              type="date"
              ref={fromRef}
              value={from}
              onChange={(e) => changeRange(e.target.value, to)}
              aria-label="Du"
              title="Du [F4]"
              className="!w-auto"
            />
            <TextInput
              type="date"
              value={to}
              onChange={(e) => changeRange(from, e.target.value)}
              aria-label="Au"
              title="Au [F4]"
              className="!w-auto"
            />
            <Button
              variant="secondary"
              onClick={() => void load()}
              disabled={loading}
              title="Actualiser [F5]"
            >
              <RefreshCw size={16} aria-hidden="true" /> {loading ? "…" : "Actualiser"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void exportPdf()}
              disabled={pdfBusy || summary == null}
              title="Aperçu PDF du rapport"
            >
              Exporter PDF
            </Button>
            <Button variant="secondary" onClick={exportExcel} title="Exporter pour Excel (CSV)">
              Exporter Excel
            </Button>
            <Button variant="secondary" onClick={exportReport} title="Exporter CSV brut [F8]">
              Exporter CSV <Kbd>F8</Kbd>
            </Button>
          </>
        }
      />

      {/* Presets période */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Périodes prédéfinies">
        {(
          [
            ["today", "Aujourd'hui"],
            ["yesterday", "Hier"],
            ["week", "7 derniers jours"],
            ["month", "Ce mois-ci"],
          ] as const
        ).map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            onClick={() => applyPreset(kind)}
            className="rounded-lg bg-[#0d1c2d] px-3 py-1.5 text-sm font-semibold text-[#d3c5ac] transition-colors hover:bg-[#1c2b3c] hover:text-[#d4e4fa]"
          >
            {label}
          </button>
        ))}
      </div>

      {!summary || !k ? (
        // P12: chargement initial ≠ vide (pas de flash « Aucune donnée »).
        loadError ? (
          <ErrorState message={loadError} />
        ) : loading ? (
          <EmptyState title="Chargement…" hint="Calcul des indicateurs en cours." />
        ) : (
          <EmptyState
            title="Aucune donnée"
            hint="Choisissez une période couvrant des opérations."
          />
        )
      ) : (
        <>
          <TodayStrip
            // Fix racine : « Ventes du jour : 0 » trompeur quand la période
            // analysée n'inclut pas aujourd'hui — la cellule n'est rendue
            // que si le jour courant appartient à la période filtrée.
            salesMinor={
              from <= todayUtcDate() && todayUtcDate() <= to
                ? (summary.daily.find((d) => d.d === todayUtcDate())?.t ?? 0)
                : -1
            }
            overdue={summary.overdueCount}
            out={summary.stock.out}
          />
          {/* KPIs Stitch : 8 cartes, liseré accent 3px */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Ventes nettes"
              value={formatDzdTotalSigned(k.salesMinor)}
              sub={`${k.salesCount} facture(s) · ${k.returnsCount} retour(s) · ${summary.comparison.deltaPercent >= 0 ? "+" : ""}${summary.comparison.deltaPercent} % vs précédente`}
              accent="#fbbf24"
            />
            <Kpi
              label="Achats nets"
              value={formatDzdTotal(k.purchasesMinor)}
              sub={`${k.purchasesCount} réception(s) fournisseur(s)`}
              accent="#8ed0ff"
            />
            <Kpi
              label="Dépenses caisse"
              value={formatDzdTotal(k.expensesMinor)}
              sub={`${k.expensesCount} charge(s)`}
              accent="#ffb4ab"
            />
            <Kpi
              label="Marge brute"
              value={formatDzdTotalSigned(k.profitMinor)}
              sub="Ventes nettes − coût des articles vendus"
              accent="#4edea3"
            />
            <Kpi
              label="Créances clients"
              value={formatDzdTotal(k.customerDebtMinor)}
              sub="Instantané global · comptes avec solde"
              accent="#fbbf24"
            />
            <Kpi
              label="Dettes fournisseurs"
              value={formatDzdTotal(k.supplierDebtMinor)}
              sub="Instantané global · solde dû"
              accent="#ffb4ab"
            />
            <Kpi
              label="Valeur stock (achat)"
              value={formatDzdTotal(k.stockValueMinor)}
              sub="Instantané global · valorisation FIFO"
              accent="#cde8ff"
            />
            <Kpi
              label="Trésorerie globale"
              value={formatDzdTotalSigned(k.cashMinor)}
              sub="Encaissé − remboursements − décaissé"
              accent="#6ffbbe"
            />
          </div>

          {/* Ventes : graphique + méthodes + comparaison */}
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="p-4">
              <BarChart
                title="Ventes par jour"
                labels={summary.daily.map((d) => d.d)}
                series={[
                  { label: "Ventes", values: summary.daily.map((d) => d.t), color: "#4edea3" },
                ]}
              />
            </Card>
            <Card className="space-y-3 p-4">
              <h3 className="text-sm font-extrabold">Encaissements nets par moyen de paiement</h3>
              <p className="text-xs text-slate-500">
                Encaissements réels − remboursements réels. Une vente à crédit ne compte que sa part
                payée.
              </p>
              {summary.byMethod.length === 0 ? (
                <p className="text-xs text-slate-500">Aucun encaissement.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {summary.byMethod.map((m) => (
                      <tr key={m.method} className="border-t border-white/[0.06]">
                        <td className="py-1.5">{paymentMethodLabel(m.method)}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-400">{m.n}</td>
                        <td
                          className={cn(
                            "py-1.5 text-right font-bold tabular-nums",
                            m.t < 0 ? "text-red-300" : "",
                          )}
                        >
                          {formatDzdTotalSigned(m.t)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <h3 className="pt-1 text-sm font-extrabold">Comparaison</h3>
              <p className="text-xs text-slate-500">
                Période précédente : {formatDzdTotalSigned(summary.comparison.prevSalesMinor)} ·{" "}
                <strong
                  className={cn(
                    "tabular-nums",
                    summary.comparison.deltaPercent >= 0 ? "text-emerald-300" : "text-red-300",
                  )}
                >
                  {summary.comparison.deltaPercent >= 0 ? "+" : ""}
                  {summary.comparison.deltaPercent} %
                </strong>
              </p>
            </Card>
          </div>

          {/* Ventes et marge par catégorie (catégorie figée dans la ligne de vente) */}
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold">Ventes et marge par catégorie</h3>
                <p className="text-xs text-slate-500">Articles, hors livraison · net des retours</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-400">
                Catégorie
                <select
                  aria-label="Filtrer par catégorie"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="rounded-lg border border-white/10 bg-[#0d1c2d] px-2 py-1.5 text-sm text-[#d4e4fa]"
                >
                  <option value="all">Toutes les catégories</option>
                  {categoryRows.map((c) => (
                    <option key={c.id ?? "none"} value={c.id == null ? "none" : String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {visibleCategories.length === 0 ? (
              <p className="text-xs text-slate-500">Aucune vente sur cette catégorie.</p>
            ) : (
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="pb-1 text-left font-bold">Catégorie</th>
                      <th className="pb-1 text-right font-bold">Ventes nettes</th>
                      <th className="pb-1 text-right font-bold">Retours</th>
                      <th className="pb-1 text-right font-bold">Marge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCategories.map((c) => (
                      <tr key={c.id ?? "none"} className="border-t border-white/[0.06]">
                        <td className="max-w-[260px] truncate py-1.5">{c.name}</td>
                        <td className="py-1.5 text-right font-bold tabular-nums">
                          {formatDzdTotalSigned(c.salesMinor)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-slate-400">
                          {formatDzdTotal(c.returnsMinor)}
                        </td>
                        <td
                          className={cn(
                            "py-1.5 text-right font-bold tabular-nums",
                            c.profitMinor < 0 ? "text-red-300" : "text-emerald-300",
                          )}
                        >
                          {formatDzdTotalSigned(c.profitMinor)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-white/15 font-extrabold">
                      <td className="py-1.5">Total</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {formatDzdTotalSigned(categoryTotals.salesMinor)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {formatDzdTotal(categoryTotals.returnsMinor)}
                      </td>
                      <td
                        className={cn(
                          "py-1.5 text-right tabular-nums",
                          categoryTotals.profitMinor < 0 ? "text-red-300" : "text-emerald-300",
                        )}
                      >
                        {formatDzdTotalSigned(categoryTotals.profitMinor)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Finances : revenus/dépenses/marge */}
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="space-y-1.5 p-4">
              <h3 className="text-sm font-extrabold">Revenus / Dépenses / Marge</h3>
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Revenus (ventes nettes)</dt>
                  <dd className="font-bold tabular-nums">{formatDzdTotalSigned(k.salesMinor)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Dépenses</dt>
                  <dd className="font-bold tabular-nums">{formatDzdTotal(k.expensesMinor)}</dd>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-1.5">
                  <dt className="font-extrabold">Bénéfice brut</dt>
                  <dd className="font-extrabold tabular-nums text-amber-300">
                    {formatDzdTotalSigned(k.profitMinor)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Bénéfice net (brut − dépenses)</dt>
                  <dd className="font-bold tabular-nums">
                    {formatDzdTotalSigned(k.profitMinor - k.expensesMinor)}
                  </dd>
                </div>
              </dl>
            </Card>
            <Card className="space-y-2 p-4">
              <h3 className="text-sm font-extrabold">5 meilleures rotations</h3>
              {summary.fastMoving.length === 0 ? (
                <p className="text-xs text-slate-500">Aucune vente.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {summary.fastMoving.map((p) => (
                      <tr key={p.name} className="border-t border-white/[0.06]">
                        <td className="max-w-[220px] truncate py-1.5">{p.name}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-400">{p.qty}</td>
                        <td className="py-1.5 text-right font-bold tabular-nums">
                          {formatDzdTotalSigned(p.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          {/* Stock */}
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="space-y-2 p-4">
              <h3 className="text-sm font-extrabold">
                Stock bas ({summary.stock.low}) · Ruptures ({summary.stock.out})
              </h3>
              {summary.stock.lowRows.length === 0 ? (
                <p className="text-xs text-slate-500">Aucune alerte.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {summary.stock.lowRows.map((p) => (
                      <tr key={p.id} className="border-t border-white/[0.06]">
                        <td className="max-w-[220px] truncate py-1.5">{p.name}</td>
                        <td className="py-1.5 text-right tabular-nums text-red-300">
                          {p.quantity}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-slate-500">
                          min {p.min_stock_level}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <Card className="space-y-2 p-4">
              <h3 className="text-sm font-extrabold">Dettes</h3>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Créances clients</span>
                <strong className="tabular-nums">{formatDzdTotal(k.customerDebtMinor)}</strong>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Dettes fournisseurs</span>
                <strong className="tabular-nums">{formatDzdTotal(k.supplierDebtMinor)}</strong>
              </div>
              <h3 className="pt-1 text-sm font-extrabold">
                En retard ({summary.overdueCount}) — top 5
              </h3>
              {summary.overdueCount === 0 ? (
                <p className="text-xs text-slate-500">Aucune échéance dépassée.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {summary.overdue.map((d) => (
                      <tr key={`${d.kind}-${d.ref}`} className="border-t border-white/[0.06]">
                        <td className="max-w-[180px] truncate py-1.5">{d.party}</td>
                        <td className="py-1.5 font-mono text-xs text-slate-400">{d.ref}</td>
                        <td className="py-1.5 text-right font-bold tabular-nums text-red-300">
                          {formatDzdTotal(d.remaining)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {summary.upcomingCount > 0 ? (
                <>
                  <h3 className="pt-1 text-sm font-extrabold">
                    Échéances 7 jours ({summary.upcomingCount}) — top 5
                  </h3>
                  <table className="w-full text-sm">
                    <tbody>
                      {summary.upcoming.map((d) => (
                        <tr key={`${d.kind}-${d.ref}`} className="border-t border-white/[0.06]">
                          <td className="max-w-[180px] truncate py-1.5">{d.party}</td>
                          <td className="py-1.5 tabular-nums text-slate-400">
                            {formatDateFr(d.due)}
                          </td>
                          <td className="py-1.5 text-right font-bold tabular-nums">
                            {formatDzdTotal(d.remaining)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}
            </Card>
          </div>

          {/* Activités récentes */}
          <div className="grid gap-4 xl:grid-cols-2">
            <RecentCard title="Dernières ventes">
              {summary.recent.sales.map((s) => (
                <RecentRow
                  key={s.id}
                  left={s.invoice_number}
                  mid={s.party}
                  right={formatDzdTotal(s.total_minor)}
                  sub={formatDateTimeFr(s.created_at)}
                />
              ))}
              {summary.recent.sales.length === 0 ? <EmptyMini /> : null}
            </RecentCard>
            <RecentCard title="Derniers paiements">
              {summary.recent.payments.map((p, i) => (
                <RecentRow
                  key={`${p.payment_date}-${p.party}-${p.amount_minor}-${p.method}-${i}`}
                  left={p.dir === "in" ? "Encaissé" : "Payé"}
                  mid={p.party}
                  right={formatDzdTotal(p.amount_minor)}
                  sub={`${formatDateFr(p.payment_date)} · ${paymentMethodLabel(p.method)}`}
                />
              ))}
              {summary.recent.payments.length === 0 ? <EmptyMini /> : null}
            </RecentCard>
            <RecentCard title="Derniers achats">
              {summary.recent.purchases.map((p) => (
                <RecentRow
                  key={p.id}
                  left={p.ref}
                  mid={p.party}
                  right={formatDzdTotal(p.total_minor)}
                  sub={formatDateFr(p.created_at)}
                />
              ))}
              {summary.recent.purchases.length === 0 ? <EmptyMini /> : null}
            </RecentCard>
            <RecentCard title="Derniers retours">
              {summary.recent.returns.map((r) => (
                <RecentRow
                  key={`${r.kind}-${r.ref}`}
                  left={r.ref}
                  mid={r.kind === "client" ? "Client" : "Fournisseur"}
                  right={formatDzdTotal(r.total)}
                  sub={formatDateFr(r.created_at)}
                />
              ))}
              {summary.recent.returns.length === 0 ? <EmptyMini /> : null}
            </RecentCard>
            <RecentCard title="Dernières dépenses">
              {summary.recent.expenses.map((e) => (
                <RecentRow
                  key={e.id}
                  left={e.description}
                  mid={e.category}
                  right={formatDzdTotal(e.amount_minor)}
                  sub={formatDateFr(e.expense_date)}
                />
              ))}
              {summary.recent.expenses.length === 0 ? <EmptyMini /> : null}
            </RecentCard>
          </div>

          {/* Vigilance système (sauvegarde + intégrité) */}
          <Card className="space-y-2 p-4">
            <h3 className="text-sm font-extrabold">Vigilance système</h3>
            <p className="text-xs text-slate-500">
              {summary.alerts.lastBackup == null
                ? "Aucune sauvegarde : créez-en une (Paramètres → Sauvegarde)."
                : `Dernière sauvegarde : ${formatDateTimeFr(summary.alerts.lastBackup)}.`}{" "}
              {summary.alerts.integrity === "ok"
                ? `Base saine${
                    summary.alerts.integrityAt
                      ? ` (vérifiée le ${formatDateTimeFr(summary.alerts.integrityAt)})`
                      : ""
                  }.`
                : `Base : ${summary.alerts.integrity} — restaurez une sauvegarde.`}
            </p>
          </Card>

          {/* Aperçu PDF */}
          {preview ? (
            <Modal
              label="Aperçu rapport"
              title="Rapport — aperçu A4"
              onClose={() => setPreview(null)}
              wide
            >
              <iframe
                sandbox=""
                srcDoc={preview.htmlA4}
                title="Aperçu rapport A4"
                className="h-[60vh] w-full rounded-xl border border-white/10 bg-white"
              />
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setPreview(null)} className="flex-1">
                  Fermer
                </Button>
                <Button variant="secondary" onClick={() => void exportPdfFile()} className="flex-1">
                  <FileDown size={15} aria-hidden="true" /> PDF
                </Button>
                <Button onClick={() => void printPdf()} className="flex-[2]">
                  Imprimer
                </Button>
              </div>
            </Modal>
          ) : null}
        </>
      )}
    </div>
  );
}
