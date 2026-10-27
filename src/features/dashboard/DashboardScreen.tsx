// Veloria PoS — Écran : Tableau de bord (synthèse période + instantanés).
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CalendarDays,
  ChevronDown,
  CreditCard,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  HandCoins,
  History,
  Package,
  Percent,
  ReceiptText,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
  Tags,
  TrendingUp,
  Truck,
  Undo2,
  Wallet,
} from "lucide-react";
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
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Kbd,
  Kpi,
  Modal,
  PageHeader,
  Select,
  TextInput,
  cn,
} from "@shared/ui/primitives.tsx";
import { paymentMethodLabel, type DashboardSummary } from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { EmptyMini, RecentCard, RecentRow } from "./widgets.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { useCountUp } from "@shared/ui/use-count-up.ts";

const PRESETS = [
  { kind: "today", label: "Aujourd'hui" },
  { kind: "yesterday", label: "Hier" },
  { kind: "week", label: "7 derniers jours" },
  { kind: "month", label: "Ce mois-ci" },
] as const;

type PresetKind = (typeof PRESETS)[number]["kind"];

function presetRange(kind: PresetKind): { from: string; to: string } {
  const iso = (d: Date): string => d.toISOString().slice(0, 10);
  const now = new Date();
  const today = iso(now);
  if (kind === "today") return { from: today, to: today };
  if (kind === "yesterday") {
    const y = iso(new Date(now.getTime() - 86400000));
    return { from: y, to: y };
  }
  if (kind === "week") {
    return { from: iso(new Date(now.getTime() - 6 * 86400000)), to: today };
  }
  return { from: today.slice(0, 8) + "01", to: today };
}

const PCT_FR = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

function ExportMenu({
  disabled,
  pdfBusy,
  onPdf,
  onExcel,
  onCsv,
}: {
  disabled: boolean;
  pdfBusy: boolean;
  onPdf: () => void;
  onExcel: () => void;
  onCsv: () => void;
}): React.JSX.Element {
  const ref = useRef<HTMLDetailsElement>(null);
  const close = (): void => {
    ref.current?.removeAttribute("open");
  };
  return (
    <details ref={ref} className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.08] [&::-webkit-details-marker]:hidden">
        <Download size={15} aria-hidden="true" /> Exporter
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-48 rounded-xl border border-white/10 bg-[#0d1c2d] p-1 shadow-2xl">
        <button
          type="button"
          disabled={disabled || pdfBusy}
          onClick={() => {
            close();
            onPdf();
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FileText size={14} aria-hidden="true" /> Aperçu PDF
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            close();
            onExcel();
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FileSpreadsheet size={14} aria-hidden="true" /> Excel (CSV)
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            close();
            onCsv();
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FileDown size={14} aria-hidden="true" /> CSV brut
          <span className="ml-auto">
            <Kbd>F8</Kbd>
          </span>
        </button>
      </div>
    </details>
  );
}

function PeriodToolbar({
  from,
  to,
  fromRef,
  loading,
  activePreset,
  onChange,
  onRefresh,
  onPreset,
  exportMenu,
}: {
  from: string;
  to: string;
  fromRef: React.RefObject<HTMLInputElement | null>;
  loading: boolean;
  activePreset: PresetKind | null;
  onChange: (from: string, to: string) => void;
  onRefresh: () => void;
  onPreset: (kind: PresetKind) => void;
  exportMenu: React.ReactNode;
}): React.JSX.Element {
  return (
    <Card className="flex flex-col gap-3 p-3.5">
      <div className="flex flex-wrap items-end gap-2.5">
        <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">
          Du
          <TextInput
            type="date"
            ref={fromRef}
            value={from}
            onChange={(e) => onChange(e.target.value, to)}
            aria-label="Du"
            title="Du [F4]"
            className="!w-auto"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">
          Au
          <TextInput
            type="date"
            value={to}
            onChange={(e) => onChange(from, e.target.value)}
            aria-label="Au"
            title="Au [F4]"
            className="!w-auto"
          />
        </label>
        <div
          role="group"
          aria-label="Périodes prédéfinies"
          className="flex flex-wrap gap-1.5 pb-0.5"
        >
          {PRESETS.map((p) => {
            const active = activePreset === p.kind;
            return (
              <button
                key={p.kind}
                type="button"
                aria-pressed={active}
                onClick={() => onPreset(p.kind)}
                className={cn(
                  "rounded-lg px-2.5 py-2 text-xs font-bold transition-colors",
                  active
                    ? "bg-amber-400 text-[#1a1206] shadow"
                    : "bg-[#0d1c2d] text-[#d3c5ac] hover:bg-[#1c2b3c] hover:text-[#d4e4fa]",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-end gap-2">
          <Button
            variant="secondary"
            onClick={onRefresh}
            disabled={loading}
            title="Actualiser [F5]"
          >
            <RefreshCw size={15} aria-hidden="true" /> {loading ? "…" : "Actualiser"}
          </Button>
          {exportMenu}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <CalendarDays size={13} aria-hidden="true" />
        <span>
          {formatDateFr(from)} → {formatDateFr(to)}
        </span>
        <span>·</span>
        <span>Net des avoirs et retours caisse</span>
        {activePreset ? (
          <Badge tone="amber">{PRESETS.find((p) => p.kind === activePreset)?.label}</Badge>
        ) : null}
      </div>
    </Card>
  );
}

function MiniMetric({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  tone: string;
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-2.5 bg-[#0f1e30] px-3 py-3">
      <span className={cn("mt-0.5 shrink-0", tone)}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
          {label}
        </div>
        <div className="mt-0.5 truncate font-mono text-sm font-bold tabular-nums text-slate-100">
          {value}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-slate-500">{sub}</div>
      </div>
    </div>
  );
}

const DETAIL_TABS = [
  { id: "finance", label: "Finances", icon: Wallet },
  { id: "stock", label: "Stock & dettes", icon: Boxes },
  { id: "activity", label: "Activité récente", icon: History },
] as const;

function methodDot(method: string): string {
  if (method === "cash") return "bg-emerald-400";
  if (method === "cheque") return "bg-sky-400";
  if (method === "transfer") return "bg-amber-400";
  return "bg-slate-400";
}

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
    <Card className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center">
      <div className="flex items-center gap-2 text-sm font-extrabold text-slate-100">
        <CalendarDays size={15} aria-hidden="true" className="text-amber-300" />
        Aujourd'hui
      </div>
      <div
        role="group"
        aria-label="Chiffres du jour"
        className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3 sm:divide-x sm:divide-white/10"
      >
        {cells.map((c) => (
          <div key={c.label} className="flex flex-col gap-0.5 px-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#d3c5ac]/70">
              {c.label}
            </span>
            <span className={`font-mono-currency-lg tabular-nums ${c.tone}`}>{c.value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function DashboardScreen({ notify }: { notify: Notify }): React.JSX.Element {
  const [from, setFrom] = useState(todayUtcDate());
  const [to, setTo] = useState(todayUtcDate());
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [detailsTab, setDetailsTab] = useState<"finance" | "stock" | "activity">("finance");
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

  /** Presets UTC : Aujourd'hui · Hier · 7 derniers jours · Ce mois. */
  function applyPreset(kind: PresetKind): void {
    const range = presetRange(kind);
    changeRange(range.from, range.to);
  }

  const activePreset =
    PRESETS.map((p) => p.kind).find((kind) => {
      const range = presetRange(kind);
      return range.from === from && range.to === to;
    }) ?? null;

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
  const marginPct = k && k.salesMinor > 0 ? (k.profitMinor / k.salesMinor) * 100 : 0;
  const netProfitMinor = k ? k.profitMinor - k.expensesMinor : 0;
  const netPaymentsMinor = summary?.byMethod.reduce((acc, m) => acc + m.t, 0) ?? 0;
  const alertsOk =
    summary != null && summary.alerts.integrity === "ok" && summary.alerts.lastBackup != null;
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
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Tableau de bord"
        period={
          summary
            ? `Période analytique : ${formatDateFr(summary.from)} au ${formatDateFr(summary.to)} · Net des avoirs et retours caisse`
            : "Vue d'ensemble — synthèse d'activité"
        }
        actions={
          <Badge tone={loadError ? "red" : loading || !summary ? "amber" : "green"}>
            {loadError
              ? "Erreur de chargement"
              : loading || !summary
                ? "Calcul en cours…"
                : "Données à jour"}
          </Badge>
        }
      />

      <PeriodToolbar
        from={from}
        to={to}
        fromRef={fromRef}
        loading={loading}
        activePreset={activePreset}
        onChange={changeRange}
        onRefresh={() => void load()}
        onPreset={applyPreset}
        exportMenu={
          <ExportMenu
            disabled={summary == null}
            pdfBusy={pdfBusy}
            onPdf={() => void exportPdf()}
            onExcel={exportExcel}
            onCsv={exportReport}
          />
        }
      />

      {!summary || !k ? (
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
            salesMinor={
              from <= todayUtcDate() && todayUtcDate() <= to
                ? (summary.daily.find((d) => d.d === todayUtcDate())?.t ?? 0)
                : -1
            }
            overdue={summary.overdueCount}
            out={summary.stock.out}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Ventes nettes"
              value={formatDzdTotalSigned(k.salesMinor)}
              sub={`${k.salesCount} facture(s) · ${k.returnsCount} retour(s) · ${summary.comparison.deltaPercent >= 0 ? "+" : ""}${summary.comparison.deltaPercent} % vs précédente`}
              accent="#fbbf24"
              icon={<TrendingUp size={16} className="text-amber-300" aria-hidden="true" />}
            />
            <Kpi
              label="Marge brute"
              value={formatDzdTotalSigned(k.profitMinor)}
              sub={`${PCT_FR.format(marginPct)} % des ventes nettes · net des retours`}
              accent="#4edea3"
              icon={<Percent size={16} className="text-emerald-300" aria-hidden="true" />}
            />
            <Kpi
              label="Trésorerie globale"
              value={formatDzdTotalSigned(k.cashMinor)}
              sub="Encaissé − remboursements − décaissé"
              accent="#6ffbbe"
              icon={<Wallet size={16} className="text-emerald-300" aria-hidden="true" />}
            />
            <Kpi
              label="Créances clients"
              value={formatDzdTotal(k.customerDebtMinor)}
              sub="Instantané global · comptes avec solde"
              accent="#ffb4ab"
              icon={<HandCoins size={16} className="text-red-300" aria-hidden="true" />}
            />
          </div>

          <Card className="grid grid-cols-2 gap-px overflow-hidden bg-white/[0.06] p-0 lg:grid-cols-4">
            <MiniMetric
              label="Achats nets"
              value={formatDzdTotal(k.purchasesMinor)}
              sub={`${k.purchasesCount} réception(s)`}
              icon={<ShoppingCart size={15} aria-hidden="true" />}
              tone="text-sky-300"
            />
            <MiniMetric
              label="Dépenses caisse"
              value={formatDzdTotal(k.expensesMinor)}
              sub={`${k.expensesCount} charge(s)`}
              icon={<ReceiptText size={15} aria-hidden="true" />}
              tone="text-red-300"
            />
            <MiniMetric
              label="Dettes fournisseurs"
              value={formatDzdTotal(k.supplierDebtMinor)}
              sub="Solde dû"
              icon={<CreditCard size={15} aria-hidden="true" />}
              tone="text-amber-300"
            />
            <MiniMetric
              label="Valeur stock"
              value={formatDzdTotal(k.stockValueMinor)}
              sub="Valorisation FIFO"
              icon={<Package size={15} aria-hidden="true" />}
              tone="text-sky-300"
            />
          </Card>

          {!alertsOk ? (
            <Card className="flex flex-wrap items-start gap-3 border-amber-400/30 bg-amber-400/[0.06] p-3.5">
              <AlertTriangle
                size={17}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-amber-300"
              />
              <div className="min-w-0 text-xs text-amber-100/90">
                <strong className="block text-sm text-amber-100">Vigilance système</strong>
                <p className="mt-0.5 leading-relaxed">
                  {summary.alerts.lastBackup == null
                    ? "Aucune sauvegarde : créez-en une (Paramètres → Sauvegarde)."
                    : `Dernière sauvegarde : ${formatDateTimeFr(summary.alerts.lastBackup)}.`}{" "}
                  {summary.alerts.integrity === "ok"
                    ? "Base saine."
                    : `Base : ${summary.alerts.integrity} — restaurez une sauvegarde.`}
                </p>
              </div>
            </Card>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Card className="space-y-2 p-4">
              <BarChart
                title="Ventes par jour"
                labels={summary.daily.map((d) => d.d)}
                series={[
                  { label: "Ventes", values: summary.daily.map((d) => d.t), color: "#4edea3" },
                ]}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-xs text-slate-500">
                <span>
                  Période précédente : {formatDzdTotalSigned(summary.comparison.prevSalesMinor)}
                </span>
                <Badge tone={summary.comparison.deltaPercent >= 0 ? "green" : "red"}>
                  {summary.comparison.deltaPercent >= 0 ? "+" : ""}
                  {summary.comparison.deltaPercent} % vs précédente
                </Badge>
              </div>
            </Card>

            <Card className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-extrabold">Encaissements par moyen</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Réels − remboursements. Une vente à crédit ne compte que sa part payée.
                  </p>
                </div>
                <Wallet size={17} aria-hidden="true" className="shrink-0 text-amber-300" />
              </div>
              {summary.byMethod.length === 0 ? (
                <p className="text-xs text-slate-500">Aucun encaissement.</p>
              ) : (
                <div className="space-y-1.5">
                  {summary.byMethod.map((m) => (
                    <div
                      key={m.method}
                      className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-1.5 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={cn("h-2 w-2 shrink-0 rounded-full", methodDot(m.method))}
                        />
                        <span className="truncate">{paymentMethodLabel(m.method)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="text-xs text-slate-500">{m.n}</span>
                        <strong
                          className={cn(
                            "tabular-nums",
                            m.t < 0 ? "text-red-300" : "text-slate-100",
                          )}
                        >
                          {formatDzdTotalSigned(m.t)}
                        </strong>
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t-2 border-white/15 pt-2 text-sm font-extrabold">
                    <span>Total net</span>
                    <span className="tabular-nums">{formatDzdTotalSigned(netPaymentsMinor)}</span>
                  </div>
                </div>
              )}
            </Card>
          </div>

          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-extrabold">
                  <Tags size={15} aria-hidden="true" className="text-amber-300" />
                  Ventes et marge par catégorie
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Articles, hors livraison · net des retours
                </p>
              </div>
              <label className="text-xs text-slate-400">
                Catégorie
                <Select
                  aria-label="Filtrer par catégorie"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="mt-1 w-52"
                >
                  <option value="all">Toutes les catégories</option>
                  {categoryRows.map((c) => (
                    <option key={c.id ?? "none"} value={c.id == null ? "none" : String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </Select>
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

          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center gap-1 border-b border-white/10 p-2">
              <span className="px-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                Détails
              </span>
              <div
                role="tablist"
                aria-label="Détails du tableau de bord"
                className="flex flex-wrap gap-1"
              >
                {DETAIL_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const selected = detailsTab === tab.id;
                  const alertCount =
                    tab.id === "stock"
                      ? summary.stock.low + summary.stock.out + summary.overdueCount
                      : 0;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setDetailsTab(tab.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
                        selected
                          ? "bg-amber-400/15 text-amber-200"
                          : "text-slate-400 hover:bg-white/[0.06] hover:text-white",
                      )}
                    >
                      <Icon size={13} aria-hidden="true" />
                      {tab.label}
                      {alertCount > 0 ? (
                        <span className="rounded-full bg-amber-400/20 px-1.5 text-[10px] text-amber-200">
                          {alertCount}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-4">
              {detailsTab === "finance" ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card className="space-y-2 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-extrabold">Revenus / Dépenses / Marge</h3>
                      <Badge tone={netProfitMinor >= 0 ? "green" : "red"}>
                        Net {formatDzdTotalSigned(netProfitMinor)}
                      </Badge>
                    </div>
                    <dl className="mt-2 space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Revenus (ventes nettes)</dt>
                        <dd className="font-bold tabular-nums">
                          {formatDzdTotalSigned(k.salesMinor)}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Dépenses</dt>
                        <dd className="font-bold tabular-nums">
                          {formatDzdTotal(k.expensesMinor)}
                        </dd>
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
                          {formatDzdTotalSigned(netProfitMinor)}
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
                              <td className="py-1.5 text-right tabular-nums text-slate-400">
                                {p.qty}
                              </td>
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
              ) : null}

              {detailsTab === "stock" ? (
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
                      <strong className="tabular-nums">
                        {formatDzdTotal(k.customerDebtMinor)}
                      </strong>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Dettes fournisseurs</span>
                      <strong className="tabular-nums">
                        {formatDzdTotal(k.supplierDebtMinor)}
                      </strong>
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
                              <tr
                                key={`${d.kind}-${d.ref}`}
                                className="border-t border-white/[0.06]"
                              >
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
              ) : null}

              {detailsTab === "activity" ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  <RecentCard
                    title="Dernières ventes"
                    icon={<ShoppingBag size={14} aria-hidden="true" />}
                  >
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
                  <RecentCard
                    title="Derniers paiements"
                    icon={<Wallet size={14} aria-hidden="true" />}
                  >
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
                  <RecentCard title="Derniers achats" icon={<Truck size={14} aria-hidden="true" />}>
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
                  <RecentCard
                    title="Derniers retours"
                    icon={<Undo2 size={14} aria-hidden="true" />}
                  >
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
                  <RecentCard
                    title="Dernières dépenses"
                    icon={<ReceiptText size={14} aria-hidden="true" />}
                  >
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
              ) : null}
            </div>
          </Card>

          {alertsOk ? (
            <p className="px-1 text-[11px] text-slate-500">
              Base saine
              {summary.alerts.integrityAt
                ? ` (vérifiée le ${formatDateTimeFr(summary.alerts.integrityAt)})`
                : ""}{" "}
              · Dernière sauvegarde :{" "}
              {summary.alerts.lastBackup ? formatDateTimeFr(summary.alerts.lastBackup) : "—"}.
            </p>
          ) : null}

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
