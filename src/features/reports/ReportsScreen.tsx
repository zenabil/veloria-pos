// Veloria PoS — Écran : Rapports (synthèse période + graphiques + export).
// Une seule source agrégée (reports.summary) + sections détaillées.
import { useEffect, useRef, useState } from "react";
import { Download, FileDown, Printer, X } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { callChecked, closingsListSchema } from "@shared/types/ipc-contracts.ts";
import { formatDzdTotal, formatDzdTotalSigned, parseDzdInputStrict } from "@domain/money/money.ts";
import { formatDateFr } from "@shared/formatters/format.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { playSound } from "@shared/sound/sound.ts";
import { newOperationId } from "@domain/common/ids.ts";
import {
  addCalendarDays,
  businessMonthStart,
  todayBusinessDate,
} from "@domain/common/business-day.ts";
import { useLoadSeq } from "@shared/ui/use-load-seq.ts";
import { isAnyModalOpen } from "@shared/ui/use-busy.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { useStaff } from "@features/staff/use-staff.ts";
import { BarChart } from "@shared/charts/BarChart.tsx";
import { MiniTable, ReportSectionCard } from "./widgets.tsx";
import {
  ErrorState,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Kbd,
  Kpi,
  Modal,
  PageHeader,
  Select,
  TextInput,
  cn,
} from "@shared/ui/primitives.tsx";
import { ReportExportDialog } from "./ReportDialogs.tsx";
import { CashSessionsSection } from "./CashSessionsSection.tsx";
import {
  REPORT_SECTIONS,
  currentBusinessMonthStart,
  type ClosingRow,
  type ReportSection,
  type ReportSummary,
} from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";

interface Category {
  id: number;
  name: string;
}

type PresetKind = "month" | "prev" | "quarter" | "year";

/**
 * Bornes du jour métier des périodes prédéfinies (source unique : boutons +
 * état actif). E-35 : « ce mois-ci » commence au 1er du mois d'Alger.
 */
function presetRange(kind: PresetKind): { from: string; to: string } {
  const today = todayBusinessDate();
  const thisMonthStart = businessMonthStart(today);
  const monthIndex = Number(today.slice(5, 7)) - 1;
  if (kind === "month") {
    return { from: thisMonthStart, to: today };
  }
  if (kind === "prev") {
    const prevStart = monthStartOffset(today, -1);
    return { from: prevStart, to: addCalendarDays(thisMonthStart, -1) };
  }
  if (kind === "quarter") {
    const quarterStartMonth = Math.floor(monthIndex / 3) * 3;
    return { from: monthStartOffset(today, quarterStartMonth - monthIndex), to: today };
  }
  return { from: monthStartOffset(today, -monthIndex), to: today };
}

/** Premier jour du mois décalé de `delta` mois par rapport à `day` (arithmétique calendaire UTC). */
function monthStartOffset(day: string, delta: number): string {
  const d = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function ReportsScreen({ notify }: { notify: Notify }): React.JSX.Element {
  const [from, setFrom] = useState(currentBusinessMonthStart());
  const [to, setTo] = useState(todayBusinessDate());
  const [section, setSection] = useState<ReportSection>("all");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerQ, setCustomerQ] = useState("");
  const [customerResults, setCustomerResults] = useState<{ id: number; name: string }[]>([]);
  // Total serveur : si > 8 affichés, hint « affinez » au lieu de tronquer en silence.
  const [customerTotal, setCustomerTotal] = useState(0);
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [supplierQ, setSupplierQ] = useState("");
  const [supplierResults, setSupplierResults] = useState<{ id: number; name: string }[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [stockValue, setStockValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  // A-06 : erreur de chargement PERSISTANTE (le toast dure 4,5 s).
  // Distingue « échec du chargement » de « aucune donnée ».
  const [loadError, setLoadError] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [preview, setPreview] = useState<{
    htmlA4: string;
    payload: Record<string, unknown>;
  } | null>(null);
  // Clôtures Z : la tranche `closings.*` (main + domaine) n'avait aucune UI.
  const [closings, setClosings] = useState<ClosingRow[]>([]);
  const [closingDate, setClosingDate] = useState(todayBusinessDate());
  const [openingText, setOpeningText] = useState("0,00");
  const [closingBusy, setClosingBusy] = useState(false);
  const [reopenBusy, setReopenBusy] = useState(false);
  // E-21 : la réouverture d'une journée close est réservée au gérant
  // (l'affichage filtre, le main décide — R2 RADICAL).
  const { isManager } = useStaff();
  const confirmAsync = useConfirm();
  const fromRef = useRef<HTMLInputElement>(null);
  // P1-1/P1-2 : séquence anti-course (même hook que les autres écrans).
  const { next: nextSeq, isCurrent: isSeqCurrent } = useLoadSeq();

  // Raccourcis réels Stitch : F4 dates · F8 exporter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isAnyModalOpen()) return;
      if (e.key === "F4") {
        e.preventDefault();
        fromRef.current?.focus();
      } else if (e.key === "F8") {
        e.preventDefault();
        setExportOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Filtres figés à l'appel (P1-1) : jamais de lecture d'état périmé après setState. */
  interface ReportSnapshot {
    f?: string;
    t?: string;
    customer?: number | null;
    supplier?: number | null;
    category?: number | null;
  }

  async function load(snap: ReportSnapshot = {}): Promise<void> {
    const f = snap.f ?? from;
    const t = snap.t ?? to;
    const customer = snap.customer !== undefined ? snap.customer : customerId;
    const supplier = snap.supplier !== undefined ? snap.supplier : supplierId;
    const category = snap.category !== undefined ? snap.category : categoryId;
    if (f === "" || t === "") return;
    const seq = nextSeq();
    setLoading(true);
    setLoadError("");
    try {
      const [s, st] = await Promise.all([
        api.reportSummary({
          from: f,
          to: t,
          customerId: customer,
          supplierId: supplier,
          categoryId: category,
        }) as Promise<ReportSummary>,
        api.stockOverview() as Promise<{ inventoryValueMinor: number }>,
      ]);
      if (!isSeqCurrent(seq)) return;
      setSummary(s);
      setStockValue(st.inventoryValueMinor);
      // Clôtures Z : chargées uniquement quand leur carte est visible (le
      // reste du temps l'IPC + setState étaient superflu à chaque filtre).
      if (section === "closings" || section === "all") {
        await loadClosings(f, t, seq);
      }
    } catch (e) {
      if (!isSeqCurrent(seq)) return;
      const loadErrorMessage = frError(e, "Chargement impossible.");
      setLoadError(loadErrorMessage);
      notify(loadErrorMessage, "err");
    } finally {
      if (isSeqCurrent(seq)) setLoading(false);
    }
  }

  async function loadClosings(f = from, t = to, seq?: number): Promise<void> {
    if (f === "" || t === "") {
      setClosings([]);
      return;
    }
    const mySeq = seq ?? nextSeq();
    try {
      const res = await callChecked((a) => a.closings.get({ from: f, to: t }), closingsListSchema);
      if (!isSeqCurrent(mySeq)) return;
      setClosings(
        res.rows.map((r) => ({
          business_date: r.business_date,
          opening_balance_minor: Math.round(r.opening_balance_minor),
          cash_sales_minor: Math.round(r.cash_sales_minor),
          customer_collections_minor: Math.round(r.customer_collections_minor),
          expenses_minor: Math.round(r.expenses_minor),
          refunds_minor: Math.round(r.refunds_minor),
          closing_balance_minor: Math.round(r.closing_balance_minor),
        })),
      );
    } catch (e) {
      notify(frError(e, "Clôtures indisponibles."), "err");
      setClosings([]);
    }
  }

  async function createClosing(): Promise<void> {
    if (closingDate === "" || closingBusy) return;
    // P1-5 : strict (bornes H-1, jamais NaN) — erreur FR mappée.
    let opening = 0;
    try {
      opening = parseDzdInputStrict(
        openingText.trim() === "" ? "0" : openingText,
        "Fond d'ouverture",
      );
    } catch (e) {
      notify(frError(e, "Fond d'ouverture invalide."), "err");
      return;
    }
    if (!Number.isInteger(opening) || opening < 0) {
      notify("Fond d'ouverture invalide.", "err");
      return;
    }
    setClosingBusy(true);
    try {
      await api.closingCreate({
        operationId: newOperationId(),
        businessDate: closingDate,
        openingMinor: opening,
      });
      notify(`Journée ${closingDate} clôturée.`, "ok");
      // P5 : clôture du jour = succès.
      playSound("success");
      await loadClosings();
    } catch (e) {
      notify(frError(e, "Clôture impossible."), "err");
    } finally {
      setClosingBusy(false);
    }
  }

  /**
   * E-21 : réouverture d'une journée close (le verrou de période — migration
   * 0048 — rend la journée immuable ; le gérant peut la rouvrir pour
   * corriger, puis la re-clôturer). Confirmation explicite obligatoire.
   */
  async function reopenClosing(): Promise<void> {
    if (closingDate === "" || reopenBusy) return;
    const ok = await confirmAsync(
      `Rouvrir la journée du ${formatDateFr(closingDate)} ? Les écritures de cette journée redeviendront possibles et la clôture devra être refaite.`,
    );
    if (!ok) return;
    setReopenBusy(true);
    try {
      await api.closingReopen({
        operationId: newOperationId(),
        businessDate: closingDate,
      });
      notify(`Journée du ${formatDateFr(closingDate)} rouverte.`, "ok");
      await loadClosings();
    } catch (e) {
      notify(frError(e, "Réouverture impossible."), "err");
    } finally {
      setReopenBusy(false);
    }
  }

  async function loadCategories(): Promise<void> {
    try {
      const res = (await api.categoriesList()) as { rows: Category[] };
      setCategories(res.rows);
    } catch (e) {
      // Filtre optionnel : journal seul (l'écran reste utilisable sans).
      console.error("[Veloria] rapports : catégories illisibles", e);
    }
  }

  // Chargement initial.
  useEffect(() => {
    void loadCategories();
    void load({ f: currentBusinessMonthStart(), t: todayBusinessDate() });
  }, []);

  // Clôtures Z : au premier passage sur l'onglet, si la période a changé
  // depuis le dernier chargement de données complet.
  useEffect(() => {
    if (section === "closings" && from !== "" && to !== "") {
      void loadClosings(from, to);
    }
  }, [section]);

  function changeRange(f: string, t: string): void {
    setFrom(f);
    setTo(t);
    if (f !== "" && t !== "") void load({ f, t });
  }

  /** Presets : Ce Mois · Mois Précédent · Trimestre courant · Exercice courant (UTC). */
  function applyPreset(kind: PresetKind): void {
    const range = presetRange(kind);
    changeRange(range.from, range.to);
  }

  const presets: { kind: PresetKind; label: string }[] = [
    { kind: "month", label: "Ce Mois" },
    { kind: "prev", label: "Mois Précédent" },
    {
      kind: "quarter",
      label: `Trimestre T${Math.floor(new Date().getUTCMonth() / 3) + 1}`,
    },
    { kind: "year", label: `Exercice ${new Date().getUTCFullYear()}` },
  ];
  const activePreset =
    presets.find((p) => {
      const range = presetRange(p.kind);
      return range.from === from && range.to === to;
    })?.kind ?? null;

  async function searchCustomers(): Promise<void> {
    if (customerQ.trim().length < 2) return;
    try {
      const res = (await api.customerSearch({
        query: customerQ.trim(),
        page: 1,
        pageSize: 8,
      })) as { rows: { id: number; first_name: string; last_name: string }[]; total: number };
      setCustomerResults(
        res.rows.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() })),
      );
      setCustomerTotal(typeof res.total === "number" ? res.total : res.rows.length);
    } catch (e) {
      // Recherche d'arrière-plan : journal seul, sans toast (anti-spam).
      console.error("[Veloria] rapports : clients illisibles", e);
      setCustomerResults([]);
      setCustomerTotal(0);
    }
  }

  async function searchSuppliers(): Promise<void> {
    if (supplierQ.trim().length < 2) return;
    try {
      const res = (await api.supplierSearch({
        query: supplierQ.trim(),
        page: 1,
        pageSize: 8,
      })) as { rows: { id: number; name: string }[] };
      setSupplierResults(res.rows);
    } catch (e) {
      // Recherche d'arrière-plan : journal seul, sans toast (anti-spam).
      console.error("[Veloria] rapports : fournisseurs illisibles", e);
      setSupplierResults([]);
    }
  }

  function show(s: ReportSection): boolean {
    return section === "all" || section === s;
  }

  const k = summary?.kpis;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* En-tête Stitch : Rapports & Statistiques · Module 12 · v3.8 */}
      <PageHeader
        title="Rapports et statistiques"
        module="Rapports · analyse de performance"
        period={
          summary
            ? `Analyse de performance · Exercice ${new Date().getUTCFullYear()} · Du ${formatDateFr(summary.from)} au ${formatDateFr(summary.to)} ${summary.weekly ? "· par semaine" : "· par jour"}`
            : "Analyse de performance · Choisissez une période"
        }
        actions={
          <>
            <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
              Du
              <TextInput
                type="date"
                ref={fromRef}
                value={from}
                onChange={(e) => changeRange(e.target.value, to)}
                aria-label="Du"
                title="Du [F4]"
                className="w-auto"
              />
            </label>
            <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
              Au
              <TextInput
                type="date"
                value={to}
                onChange={(e) => changeRange(from, e.target.value)}
                aria-label="Au"
                title="Au [F4]"
                className="w-auto"
              />
            </label>
            <Button
              onClick={() => setExportOpen(true)}
              disabled={summary == null}
              title="Exporter rapport [F8]"
            >
              <Download size={16} aria-hidden="true" /> Générer Rapport <Kbd>F8</Kbd>
            </Button>
          </>
        }
      />

      {/* Filtres */}
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div>
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
            Période
          </span>
          <div
            className="flex flex-wrap gap-1 rounded-xl bg-[#0d1c2d] p-1"
            role="group"
            aria-label="Périodes prédéfinies"
          >
            {presets.map((p) => {
              const active = activePreset === p.kind;
              return (
                <button
                  key={p.kind}
                  type="button"
                  aria-pressed={active}
                  onClick={() => applyPreset(p.kind)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
                    active
                      ? "bg-[#fbbf24] text-[#402d00] shadow-[0_2px_8px_-2px_rgba(251,191,36,0.5)]"
                      : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <span
            id="reports-section-label"
            className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
          >
            Rubrique
          </span>
          {/* P4 : onglets au lieu d'un Select — une rubrique visible à la fois. */}
          <div
            role="tablist"
            aria-labelledby="reports-section-label"
            className="flex flex-wrap gap-1 rounded-xl bg-[#0d1c2d] p-1"
          >
            {REPORT_SECTIONS.map((s) => {
              const active = section === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSection(s.value)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
                    active
                      ? "bg-[#fbbf24] text-[#402d00] shadow-[0_2px_8px_-2px_rgba(251,191,36,0.5)]"
                      : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="min-w-[180px]">
          <label
            className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
            htmlFor="reports-customer"
          >
            Client
          </label>
          {customerId != null ? (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-black/25 px-3 py-2.5 text-sm">
              <span className="truncate font-semibold">{customerName}</span>
              <button
                type="button"
                onClick={() => {
                  setCustomerId(null);
                  setCustomerName("");
                  void load({ customer: null });
                }}
                className="shrink-0 text-xs font-semibold text-slate-400 hover:text-white"
                aria-label="Retirer le filtre client"
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <TextInput
                id="reports-customer"
                value={customerQ}
                onChange={(e) => setCustomerQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void searchCustomers();
                  }
                }}
                placeholder="Nom…"
                aria-label="Filtrer par client"
              />
              <Button type="button" variant="secondary" onClick={() => void searchCustomers()}>
                Rechercher
              </Button>
            </div>
          )}
          {customerResults.length > 0 ? (
            <ul className="mt-2 max-h-24 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10 bg-[#0d1c2d]">
              {customerResults.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerId(c.id);
                      setCustomerName(c.name);
                      setCustomerResults([]);
                      setCustomerTotal(0);
                      setCustomerQ("");
                      void load({ customer: c.id });
                    }}
                    className="w-full border-l-2 border-transparent px-3 py-1.5 text-left text-sm transition-colors hover:border-[#fbbf24] hover:bg-amber-400/10"
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {/* Slot à hauteur constante (pas de saut de mise en page). */}
          <p className="mt-1 min-h-[1rem] text-xs font-semibold text-slate-500" role="status">
            {customerTotal > customerResults.length
              ? `+${customerTotal - customerResults.length} autre(s) — affinez la recherche.`
              : ""}
          </p>
        </div>
        <div className="min-w-[180px]">
          <label
            className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
            htmlFor="reports-supplier"
          >
            Fournisseur
          </label>
          {supplierId != null ? (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-black/25 px-3 py-2.5 text-sm">
              <span className="truncate font-semibold">{supplierName}</span>
              <button
                type="button"
                onClick={() => {
                  setSupplierId(null);
                  setSupplierName("");
                  void load({ supplier: null });
                }}
                className="shrink-0 text-xs font-semibold text-slate-400 hover:text-white"
                aria-label="Retirer le filtre fournisseur"
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <TextInput
                id="reports-supplier"
                value={supplierQ}
                onChange={(e) => setSupplierQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void searchSuppliers();
                  }
                }}
                placeholder="Nom…"
                aria-label="Filtrer par fournisseur"
              />
              <Button type="button" variant="secondary" onClick={() => void searchSuppliers()}>
                Rechercher
              </Button>
            </div>
          )}
          {supplierResults.length > 0 ? (
            <ul className="mt-2 max-h-24 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10 bg-[#0d1c2d]">
              {supplierResults.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSupplierId(s.id);
                      setSupplierName(s.name);
                      setSupplierResults([]);
                      setSupplierQ("");
                      void load({ supplier: s.id });
                    }}
                    className="w-full border-l-2 border-transparent px-3 py-1.5 text-left text-sm transition-colors hover:border-[#fbbf24] hover:bg-amber-400/10"
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div>
          <label
            className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
            htmlFor="reports-category"
          >
            Catégorie
          </label>
          <Select
            id="reports-category"
            value={categoryId == null ? "" : String(categoryId)}
            onChange={(e) => {
              const next = e.target.value === "" ? null : Number(e.target.value);
              setCategoryId(next);
              void load({ category: next });
            }}
            aria-label="Filtre catégorie"
          >
            <option value="">Toutes</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            setCustomerId(null);
            setCustomerName("");
            setSupplierId(null);
            setSupplierName("");
            setCategoryId(null);
            setSection("all");
            void load({ customer: null, supplier: null, category: null });
          }}
          title="Réinitialiser les filtres"
        >
          Réinitialiser
        </Button>
      </Card>

      {loadError ? (
        <ErrorState message={loadError} />
      ) : loading && !summary ? (
        <p className="p-8 text-center text-sm text-slate-500" role="status">
          Chargement…
        </p>
      ) : !summary || !k ? (
        <EmptyState title="Aucune donnée" hint="Choisissez une période couvrant des opérations." />
      ) : (
        <>
          {/* KPIs Stitch : marge brute globale en tête */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Kpi
              label="Marge Brute Globale"
              value={formatDzdTotalSigned(k.profitMinor)}
              sub="Ventes − achats revendus"
              accent="#4edea3"
            />
            <Kpi
              label="Ventes"
              value={formatDzdTotal(k.salesMinor)}
              sub={`${k.salesCount} facture(s)`}
              accent="#fbbf24"
            />
            <Kpi
              label="Achats"
              value={formatDzdTotal(k.purchasesMinor)}
              sub={`${k.purchasesCount} entrée(s)`}
              accent="#8ed0ff"
            />
            <Kpi
              label="Dépenses"
              value={formatDzdTotal(k.expensesMinor)}
              sub="Charges"
              accent="#ffb4ab"
            />
            <Kpi
              label="Créances"
              value={formatDzdTotal(k.customerDebtMinor)}
              sub="Clients"
              accent="#cde8ff"
            />
            <Kpi
              label="Dettes"
              value={formatDzdTotal(k.supplierDebtMinor)}
              sub="Fournisseurs"
              accent="#ffb4ab"
            />
          </div>

          {/* P3 : résultat net = marge − charges − retours (jamais calculé avant). */}
          {(() => {
            const net = k.profitMinor - k.expensesMinor - summary.returns.amountMinor;
            return (
              <Card className="relative overflow-hidden p-5">
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-[2px] bg-[linear-gradient(90deg,transparent,#fbbf24,transparent)] opacity-80"
                />
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      Résultat net (période)
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Marge brute − dépenses − retours</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={net >= 0 ? "green" : "red"}>
                      {net >= 0 ? "Bénéfice" : "Perte"}
                    </Badge>
                    <p
                      className={cn(
                        "font-mono-currency-lg tabular-nums",
                        net >= 0 ? "text-emerald-300" : "text-red-300",
                      )}
                    >
                      {formatDzdTotalSigned(net)}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })()}

          {/* Graphiques */}
          {show("sales") || show("purchases") || show("expenses") || show("profit") ? (
            <Card className="space-y-4 p-4">
              <BarChart
                title="Ventes / Achats / Dépenses"
                labels={summary.buckets.map((b) => b.date)}
                series={[
                  {
                    label: "Ventes",
                    values: summary.buckets.map((b) => b.sales),
                    color: "#4edea3",
                  },
                  {
                    label: "Achats",
                    values: summary.buckets.map((b) => b.purchases),
                    color: "#fbbf24",
                  },
                  {
                    label: "Dépenses",
                    values: summary.buckets.map((b) => b.expenses),
                    color: "#ffb4ab",
                  },
                ]}
              />
              <BarChart
                title="Marge brute"
                labels={summary.buckets.map((b) => b.date)}
                series={[
                  {
                    label: "Marge",
                    values: summary.buckets.map((b) => b.profit),
                    color: "#8ed0ff",
                  },
                ]}
              />
            </Card>
          ) : null}

          {/* Sections */}
          {show("sales") ? (
            <ReportSectionCard title={`Ventes · ${formatDzdTotal(k.salesMinor)} (${k.salesCount})`}>
              <MiniTable
                headers={["Client", "Total"]}
                rows={summary.tops.customers.map((t) => [t.name, formatDzdTotal(t.total)])}
                empty="Aucune vente sur la période."
              />
              <MiniTable
                headers={["Produit", "Qté", "Total"]}
                rows={summary.tops.products.map((t) => [
                  t.name,
                  String(t.qty ?? 0),
                  formatDzdTotal(t.total),
                ])}
                empty="Aucun article vendu."
              />
            </ReportSectionCard>
          ) : null}
          {show("purchases") ? (
            <ReportSectionCard
              title={`Achats · ${formatDzdTotal(k.purchasesMinor)} (${k.purchasesCount})`}
            >
              <MiniTable
                headers={["Fournisseur", "Total"]}
                rows={summary.tops.suppliers.map((t) => [t.name, formatDzdTotal(t.total)])}
                empty="Aucun achat sur la période."
              />
            </ReportSectionCard>
          ) : null}
          {show("customerDebt") ? (
            <ReportSectionCard title={`Dettes clients · ${formatDzdTotal(k.customerDebtMinor)}`}>
              <p className="px-4 pb-3 text-xs text-slate-500">
                Soldes exacts, relances et règlements dans la page Dettes.
              </p>
            </ReportSectionCard>
          ) : null}
          {show("payments") ? (
            <ReportSectionCard title="Paiements">
              <MiniTable
                headers={["Sens", "Montant"]}
                rows={[
                  ["Encaissé (clients)", formatDzdTotal(summary.payments.inMinor)],
                  ["Payé (fournisseurs)", formatDzdTotal(summary.payments.outMinor)],
                ]}
                empty=""
              />
            </ReportSectionCard>
          ) : null}
          {show("closings") ? (
            <ReportSectionCard title="Clôtures journalières (Z)">
              <div className="flex flex-wrap items-end gap-3 px-4 pb-3">
                <Field label="Journée">
                  <TextInput
                    type="date"
                    value={closingDate}
                    onChange={(e) => setClosingDate(e.target.value)}
                    aria-label="Journée à clôturer"
                  />
                </Field>
                <Field label="Fond d'ouverture (DZD)">
                  <TextInput
                    value={openingText}
                    onChange={(e) => setOpeningText(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    aria-label="Fond d'ouverture"
                  />
                </Field>
                <Button onClick={() => void createClosing()} disabled={closingBusy}>
                  {closingBusy ? "Clôture…" : "Clôturer la journée"}
                </Button>
                {/* E-21 : réouverture (gérant uniquement — le main refuse aussi). */}
                {isManager ? (
                  <Button
                    variant="secondary"
                    onClick={() => void reopenClosing()}
                    disabled={reopenBusy || closingBusy || closingDate === ""}
                  >
                    {reopenBusy ? "Réouverture…" : "Rouvrir la journée"}
                  </Button>
                ) : null}
              </div>
              <MiniTable
                headers={[
                  "Journée",
                  "Ouverture",
                  "Ventes",
                  "Encaiss.",
                  "Dépenses",
                  "Remb.",
                  "Clôture",
                ]}
                rows={closings.map((c) => [
                  formatDateFr(c.business_date),
                  formatDzdTotal(c.opening_balance_minor),
                  formatDzdTotal(c.cash_sales_minor),
                  formatDzdTotal(c.customer_collections_minor),
                  formatDzdTotal(c.expenses_minor),
                  formatDzdTotal(c.refunds_minor),
                  formatDzdTotalSigned(c.closing_balance_minor),
                ])}
                empty="Aucune clôture sur la période."
              />
              <p className="px-4 pb-3 text-xs text-slate-500">
                Formule : ouverture + ventes espèces + encaissements − dépenses − remboursements.
                Une journée clôturée est verrouillée (les écritures de ce jour sont refusées) ; le
                gérant peut la rouvrir pour la corriger, puis la re-clôturer.
              </p>
            </ReportSectionCard>
          ) : null}
          {/* Sessions de caisse (migration 0059) : le poste, le comptage, l'écart. */}
          {show("closings") ? <CashSessionsSection from={from} to={to} notify={notify} /> : null}
        </>
      )}

      {/* Export */}
      {exportOpen && summary ? (
        <ReportExportDialog
          summary={summary}
          stockValue={stockValue}
          onClose={() => setExportOpen(false)}
          onPreviewed={(htmlA4, payload) => setPreview({ htmlA4, payload })}
          notify={notify}
        />
      ) : null}

      {/* Aperçu impression */}
      {preview && preview.htmlA4 ? (
        <Modal label="Aperçu rapport" title="Aperçu rapport" onClose={() => setPreview(null)} wide>
          <iframe
            sandbox=""
            srcDoc={preview.htmlA4}
            title="Aperçu rapport"
            className="h-[50vh] w-full rounded-xl border border-white/10 bg-white"
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                api
                  .reportExportPdf(preview.payload)
                  .then((r) => {
                    notify(`PDF enregistré : ${(r as { path: string }).path}`, "ok");
                  })
                  .catch((e: unknown) => notify(frError(e, "Export PDF impossible."), "err"));
              }}
            >
              <FileDown size={15} aria-hidden="true" /> PDF
            </Button>
            <Button
              onClick={() => {
                api
                  .reportPrint(preview.payload)
                  .then(() => {
                    // P5 : impression = papier.
                    playSound("print");
                    notify("Rapport envoyé.", "ok");
                  })
                  .catch((e: unknown) => notify(frError(e, "Impression impossible."), "err"));
              }}
            >
              <Printer size={15} aria-hidden="true" /> Imprimer
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
