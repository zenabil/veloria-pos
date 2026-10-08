// Veloria PoS — Écran : Rapports (synthèse période + graphiques + export).
// Une seule source agrégée (reports.summary) + sections détaillées.
import { useEffect, useRef, useState } from "react";
import { Download, FileDown, Printer, X } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { callChecked, closingsListSchema } from "@shared/types/ipc-contracts.ts";
import { formatDzd, parseDzdInputStrict } from "@domain/money/money.ts";
import { formatDateFr, formatDzdSigned } from "@shared/formatters/format.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { playSound } from "@shared/sound/sound.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { todayUtcDate } from "@shared/dates/dates.ts";
import { useLoadSeq } from "@shared/ui/use-load-seq.ts";
import { isAnyModalOpen } from "@shared/ui/use-busy.ts";
import { BarChart } from "@shared/charts/BarChart.tsx";
import { MiniTable, ReportSectionCard } from "./widgets.tsx";
import {
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
} from "@shared/ui/primitives.tsx";
import { ReportExportDialog } from "./ReportDialogs.tsx";
import {
  REPORT_SECTIONS,
  monthStartUtc,
  type ClosingRow,
  type ReportSection,
  type ReportSummary,
} from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";

interface Category {
  id: number;
  name: string;
}

export function ReportsScreen({ notify }: { notify: Notify }): React.JSX.Element {
  const [from, setFrom] = useState(monthStartUtc());
  const [to, setTo] = useState(todayUtcDate());
  const [section, setSection] = useState<ReportSection>("all");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerQ, setCustomerQ] = useState("");
  const [customerResults, setCustomerResults] = useState<{ id: number; name: string }[]>([]);
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [supplierQ, setSupplierQ] = useState("");
  const [supplierResults, setSupplierResults] = useState<{ id: number; name: string }[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [stockValue, setStockValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [preview, setPreview] = useState<{
    htmlA4: string;
    payload: Record<string, unknown>;
  } | null>(null);
  // Clôtures Z : la tranche `closings.*` (main + domaine) n'avait aucune UI.
  const [closings, setClosings] = useState<ClosingRow[]>([]);
  const [closingDate, setClosingDate] = useState(todayUtcDate());
  const [openingText, setOpeningText] = useState("0,00");
  const [closingBusy, setClosingBusy] = useState(false);
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
      await loadClosings(f, t, seq);
    } catch (e) {
      if (!isSeqCurrent(seq)) return;
      notify(frError(e, "Chargement impossible."), "err");
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
    } catch {
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

  async function loadCategories(): Promise<void> {
    try {
      const res = (await api.categoriesList()) as { rows: Category[] };
      setCategories(res.rows);
    } catch {
      /* filtre catégorie optionnel */
    }
  }

  // Chargement initial.
  useEffect(() => {
    void loadCategories();
    void load({ f: monthStartUtc(), t: todayUtcDate() });
  }, []);

  function changeRange(f: string, t: string): void {
    setFrom(f);
    setTo(t);
    if (f !== "" && t !== "") void load({ f, t });
  }

  /** Presets Stitch : Ce Mois · Mois Précédent · Trimestre Q3 · Exercice 2025 (UTC). */
  function applyPreset(kind: "month" | "prev" | "quarter" | "year"): void {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const iso = (d: Date): string => d.toISOString().slice(0, 10);
    if (kind === "month") {
      changeRange(iso(new Date(Date.UTC(y, m, 1))), todayUtcDate());
    } else if (kind === "prev") {
      changeRange(iso(new Date(Date.UTC(y, m - 1, 1))), iso(new Date(Date.UTC(y, m, 0))));
    } else if (kind === "quarter") {
      const q = Math.floor(m / 3) * 3;
      changeRange(iso(new Date(Date.UTC(y, q, 1))), todayUtcDate());
    } else {
      changeRange(iso(new Date(Date.UTC(y, 0, 1))), todayUtcDate());
    }
  }

  async function searchCustomers(): Promise<void> {
    if (customerQ.trim().length < 2) return;
    try {
      const res = (await api.customerSearch({
        query: customerQ.trim(),
        page: 1,
        pageSize: 8,
      })) as { rows: { id: number; first_name: string; last_name: string }[] };
      setCustomerResults(
        res.rows.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() })),
      );
    } catch {
      setCustomerResults([]);
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
    } catch {
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
        module="Module 12 · v3.8 · DONNÉES EN TEMPS RÉEL (SQLITE WAL)"
        period={
          summary
            ? `ANALYSE DE PERFORMANCE · POSTE 04 · EXERCICE ${new Date().getUTCFullYear()} · Du ${formatDateFr(summary.from)} au ${formatDateFr(summary.to)} ${summary.weekly ? "· par semaine" : "· par jour"}`
            : "ANALYSE DE PERFORMANCE · POSTE 04 · Choisissez une période"
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
            />
            <TextInput
              type="date"
              value={to}
              onChange={(e) => changeRange(from, e.target.value)}
              aria-label="Au"
              title="Au [F4]"
            />
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
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Périodes prédéfinies">
            {(
              [
                ["month", "Ce Mois"],
                ["prev", "Mois Précédent"],
                ["quarter", `Trimestre T${Math.floor(new Date().getUTCMonth() / 3) + 1}`],
                ["year", `Exercice ${new Date().getUTCFullYear()}`],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                onClick={() => applyPreset(kind)}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
              >
                {label}
              </button>
            ))}
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
            className="flex flex-wrap gap-1.5"
          >
            {REPORT_SECTIONS.map((s) => (
              <button
                key={s.value}
                type="button"
                role="tab"
                aria-selected={section === s.value}
                onClick={() => setSection(s.value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  section === s.value
                    ? "bg-amber-400/20 text-amber-200"
                    : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                }`}
              >
                {s.label}
              </button>
            ))}
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
            <ul className="mt-2 max-h-24 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10">
              {customerResults.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerId(c.id);
                      setCustomerName(c.name);
                      setCustomerResults([]);
                      setCustomerQ("");
                      void load({ customer: c.id });
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-amber-400/10"
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
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
            <ul className="mt-2 max-h-24 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10">
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
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-amber-400/10"
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

      {loading && !summary ? (
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
              value={formatDzdSigned(k.profitMinor)}
              sub="Ventes − achats revendus"
              accent="#4edea3"
            />
            <Kpi
              label="Ventes"
              value={formatDzd(k.salesMinor)}
              sub={`${k.salesCount} facture(s)`}
              accent="#fbbf24"
            />
            <Kpi
              label="Achats"
              value={formatDzd(k.purchasesMinor)}
              sub={`${k.purchasesCount} entrée(s)`}
              accent="#8ed0ff"
            />
            <Kpi
              label="Dépenses"
              value={formatDzd(k.expensesMinor)}
              sub="Charges"
              accent="#ffb4ab"
            />
            <Kpi
              label="Créances"
              value={formatDzd(k.customerDebtMinor)}
              sub="Clients"
              accent="#cde8ff"
            />
            <Kpi
              label="Dettes"
              value={formatDzd(k.supplierDebtMinor)}
              sub="Fournisseurs"
              accent="#ffb4ab"
            />
          </div>

          {/* P3 : résultat net = marge − charges − retours (jamais calculé avant). */}
          {(() => {
            const net = k.profitMinor - k.expensesMinor - summary.returns.amountMinor;
            return (
              <Card className="flex items-center justify-between p-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    Résultat net (période)
                  </p>
                  <p className="text-xs text-slate-500">Marge brute − dépenses − retours</p>
                </div>
                <p
                  className={`text-2xl font-extrabold tabular-nums ${net >= 0 ? "text-emerald-300" : "text-red-300"}`}
                >
                  {formatDzdSigned(net)}
                </p>
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
                    color: "#34d399",
                  },
                  {
                    label: "Achats",
                    values: summary.buckets.map((b) => b.purchases),
                    color: "#fbbf24",
                  },
                  {
                    label: "Dépenses",
                    values: summary.buckets.map((b) => b.expenses),
                    color: "#f87171",
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
                    color: "#818cf8",
                  },
                ]}
              />
            </Card>
          ) : null}

          {/* Sections */}
          {show("sales") ? (
            <ReportSectionCard title={`Ventes · ${formatDzd(k.salesMinor)} (${k.salesCount})`}>
              <MiniTable
                headers={["Client", "Total"]}
                rows={summary.tops.customers.map((t) => [t.name, formatDzd(t.total)])}
                empty="Aucune vente sur la période."
              />
              <MiniTable
                headers={["Produit", "Qté", "Total"]}
                rows={summary.tops.products.map((t) => [
                  t.name,
                  String(t.qty ?? 0),
                  formatDzd(t.total),
                ])}
                empty="Aucun article vendu."
              />
            </ReportSectionCard>
          ) : null}
          {show("purchases") ? (
            <ReportSectionCard
              title={`Achats · ${formatDzd(k.purchasesMinor)} (${k.purchasesCount})`}
            >
              <MiniTable
                headers={["Fournisseur", "Total"]}
                rows={summary.tops.suppliers.map((t) => [t.name, formatDzd(t.total)])}
                empty="Aucun achat sur la période."
              />
            </ReportSectionCard>
          ) : null}
          {show("profit") ? (
            <ReportSectionCard title={`Bénéfices · marge ${formatDzd(k.profitMinor)}`}>
              <p className="px-4 pb-3 text-xs text-slate-500">
                Marge brute = ventes nettes − coût d'achat des lignes vendues (remises et livraison
                incluses via les totaux nets).
              </p>
            </ReportSectionCard>
          ) : null}
          {show("expenses") ? (
            <ReportSectionCard title={`Dépenses · ${formatDzd(k.expensesMinor)}`}>
              <p className="px-4 pb-3 text-xs text-slate-500">
                Détail complet dans la page Dépenses.
              </p>
            </ReportSectionCard>
          ) : null}
          {show("stock") ? (
            <ReportSectionCard
              title={`Stock · valorisation ${stockValue == null ? "—" : formatDzd(stockValue)}`}
            >
              <p className="px-4 pb-3 text-xs text-slate-500">
                Valeur au prix d'achat, instantané actuel (hors période). Détail dans la page Stock.
              </p>
            </ReportSectionCard>
          ) : null}
          {show("customerDebt") ? (
            <ReportSectionCard title={`Dettes clients · ${formatDzd(k.customerDebtMinor)}`}>
              <MiniTable
                headers={["Client", "Achats période"]}
                rows={summary.tops.customers
                  .filter((t) => t.name !== "Passage")
                  .slice(0, 5)
                  .map((t) => [t.name, formatDzd(t.total)])}
                empty="Aucune vente."
              />
              <p className="px-4 pb-3 text-xs text-slate-500">
                Ci-dessus : top acheteurs de la période (pas des dettes). Soldes exacts et relances
                dans la page Dettes.
              </p>
            </ReportSectionCard>
          ) : null}
          {show("supplierDebt") ? (
            <ReportSectionCard title={`Dettes fournisseurs · ${formatDzd(k.supplierDebtMinor)}`}>
              <p className="px-4 pb-3 text-xs text-slate-500">
                Soldes exacts et paiements dans les pages Dettes et Fournisseurs.
              </p>
            </ReportSectionCard>
          ) : null}
          {show("payments") ? (
            <ReportSectionCard title="Paiements">
              <MiniTable
                headers={["Sens", "Montant"]}
                rows={[
                  ["Encaissé (clients)", formatDzd(summary.payments.inMinor)],
                  ["Payé (fournisseurs)", formatDzd(summary.payments.outMinor)],
                ]}
                empty=""
              />
            </ReportSectionCard>
          ) : null}
          {show("returns") ? (
            <ReportSectionCard
              title={`Retours · ${summary.returns.count} (${formatDzd(summary.returns.amountMinor)})`}
            >
              <p className="px-4 pb-3 text-xs text-slate-500">
                Détail complet dans la page Retours.
              </p>
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
                  formatDzd(c.opening_balance_minor),
                  formatDzd(c.cash_sales_minor),
                  formatDzd(c.customer_collections_minor),
                  formatDzd(c.expenses_minor),
                  formatDzd(c.refunds_minor),
                  formatDzd(c.closing_balance_minor),
                ])}
                empty="Aucune clôture sur la période."
              />
              <p className="px-4 pb-3 text-xs text-slate-500">
                Formule : ouverture + ventes espèces + encaissements − dépenses − remboursements.
                Une journée clôturée ne peut pas être rejouée.
              </p>
            </ReportSectionCard>
          ) : null}
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
