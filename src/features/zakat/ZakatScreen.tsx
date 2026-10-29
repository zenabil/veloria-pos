// Veloria PoS — Écran : Zakat (calcul reporting + historique).
// Paramètres déplacés dans Paramètres → Documents. Reporting seul, jamais un registre.
import { useEffect, useState } from "react";
import { Calculator, Download, FileDown, History, Info, Printer, Scale } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { useCompany } from "@shared/company/use-company.ts";
import { formatDzd } from "@domain/money/money.ts";
import { formatDateFr } from "@shared/formatters/format.ts";
import { downloadCsv } from "@shared/export/csv.ts";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  Pager,
  Select,
  StatsStrip,
} from "@shared/ui/primitives.tsx";
import { ZakatCalculationDialog } from "./ZakatDialogs.tsx";
import { computeZakat } from "@domain/zakat/zakat-rules.ts";
import {
  HIJRI_YEARS,
  nisabMethodLabel,
  type ZakatCalculation,
  type ZakatSources,
} from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

const PAGE_SIZE = 20;

export function ZakatScreen({ notify }: { notify: Notify }): React.JSX.Element {
  const [hijriYear, setHijriYear] = useState("1448");
  const [sources, setSources] = useState<ZakatSources | null>(null);
  const [loading, setLoading] = useState(true);
  // A-06 : erreur de chargement PERSISTANTE (le toast dure 4,5 s).
  // Distingue « échec du chargement » de « aucune donnée ».
  const [loadError, setLoadError] = useState("");
  const [calcOpen, setCalcOpen] = useState(false);
  const [history, setHistory] = useState<ZakatCalculation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<{
    htmlA4: string;
    payload: Record<string, unknown>;
  } | null>(null);
  // Fiche entreprise : source unique partagée (rapport).
  const { record: companyRecord } = useCompany();

  async function load(): Promise<void> {
    setLoading(true);
    setLoadError("");
    try {
      const s = (await api.zakatSources()) as ZakatSources;
      setSources(s);
    } catch (e) {
      const loadErrorMessage = frError(e, "Chargement impossible.");
      setLoadError(loadErrorMessage);
      notify(loadErrorMessage, "err");
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory(p = 1): Promise<void> {
    try {
      const res = (await api.zakatHistory({ page: p, pageSize: PAGE_SIZE })) as {
        rows: ZakatCalculation[];
        total: number;
      };
      setHistory(res.rows);
      setTotal(res.total);
      setPage(p);
    } catch (e) {
      notify(frError(e, "Historique indisponible."), "err");
    }
  }

  useEffect(() => {
    void load();
    void loadHistory(1);
  }, []);

  // H-1 fail-safe display: corrupt DB aggregates must show "—", never crash render.
  let net = 0;
  let preview_calc: { net: number; zakat: number; above: boolean } | null = null;
  if (sources != null) {
    try {
      preview_calc = computeZakat({
        cashMinor: 0,
        bankMinor: 0,
        stockMinor: sources.inventory.v,
        receivablesMinor: sources.customerDebts.d,
        otherMinor: 0,
        liabilitiesMinor: sources.supplierDebts.d,
        nisabMinor: sources.params.nisabMinor,
        ratePercent: sources.params.ratePercent,
      });
      net = preview_calc.net;
    } catch {
      net = 0;
      preview_calc = null;
    }
  }

  function exportHistory(): void {
    if (history.length === 0) {
      notify("Rien à exporter.", "err");
      return;
    }
    try {
      downloadCsv(
        `zakat-${new Date().toISOString().slice(0, 10)}.csv`,
        history.map((h) => ({
          Date: formatDateFr(h.calc_date),
          "Année hégirienne": h.hijri_year,
          "Montant zakatable": formatDzd(h.net_minor),
          Nisab: formatDzd(h.nisab_minor),
          Zakat: formatDzd(h.zakat_minor),
          Règlement: h.status === "paid" ? "Payée" : "Calculée",
        })),
      );
      notify(`${history.length} ligne(s) exportée(s).`, "ok");
    } catch (e) {
      notify(frError(e, "Export impossible."), "err");
    }
  }

  async function printLast(): Promise<void> {
    const last = history[0];
    if (!last) {
      notify("Aucun calcul à imprimer.", "err");
      return;
    }
    try {
      const payload = {
        title: `Rapport Zakat — ${last.hijri_year}`,
        period: `Calculé le ${formatDateFr(last.calc_date)}`,
        company: companyRecord?.["company_name"] ?? "Veloria",
        kpis: [
          { label: "Montant zakatable", value: formatDzd(last.net_minor) },
          { label: "Nisab", value: formatDzd(last.nisab_minor) },
          { label: "Zakat estimée", value: formatDzd(last.zakat_minor) },
        ],
        charts: [],
        tables: [
          {
            title: "Détail",
            headers: ["Poste", "Montant"],
            rows: [
              ["Espèces", formatDzd(last.cash_minor)],
              ["Banque", formatDzd(last.bank_minor)],
              ["Stock", formatDzd(last.stock_minor)],
              ["Créances", formatDzd(last.receivables_minor)],
              ["Autres", formatDzd(last.other_minor)],
              ["Dettes", formatDzd(last.liabilities_minor)],
              ["Net zakatable", formatDzd(last.net_minor)],
              [`Taux ${last.rate_percent} %`, formatDzd(last.zakat_minor)],
            ],
          },
        ],
        footer: "Zakat — reporting seul, jamais un registre.",
      };
      const pv = (await api.reportPreview(payload)) as { htmlA4: string };
      setPreview({ htmlA4: pv.htmlA4, payload });
    } catch (e) {
      notify(frError(e, "Aperçu indisponible."), "err");
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* En-tête Stitch : Zakat El-Mal & Décharge Annuelle · REPORTING */}
      <PageHeader
        title="Zakat el-mal et décharge annuelle"
        module="Zakat · reporting annuel"
        period={
          preview_calc && preview_calc.above
            ? `NISAB PROBABLEMENT ATTEINT (estimation hors caisse/banque) · Zakat exigible ≈ ${formatDzd(preview_calc.zakat)} · Rapport ${hijriYear} H`
            : `Estimation partielle sous le nisab (hors caisse/banque) · Rapport ${hijriYear} H · DZD`
        }
        actions={
          <>
            <Select
              value={hijriYear}
              onChange={(e) => setHijriYear(e.target.value)}
              aria-label="Année hégirienne"
              title="Année hégirienne"
              className="w-[110px]"
            >
              {HIJRI_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y} H
                </option>
              ))}
            </Select>
            <Button onClick={() => setCalcOpen(true)} title="Nouvel exercice">
              <Calculator size={16} aria-hidden="true" /> Nouvel Exercice
            </Button>
          </>
        }
      />

      {/* Paramètres Nisab & Référentiel Sharia (lecture seule, édition dans Paramètres → Documents) */}
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fbbf24]/10 text-[#fbbf24] ring-1 ring-[#fbbf24]/20">
          <Scale size={18} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Nisab or 85 g 24K
            </span>
            <strong className="font-mono text-[15px] tabular-nums text-slate-100">
              {sources ? formatDzd(sources.params.nisabMinor) : "—"}
            </strong>
            <span className="text-[11px] text-slate-500">
              {sources ? nisabMethodLabel(sources.params.nisabMethod) : "—"}
            </span>
          </span>
          <span aria-hidden="true" className="hidden h-10 w-px bg-white/10 sm:block" />
          <span className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Taux
            </span>
            <strong className="font-mono text-[15px] tabular-nums text-amber-200">
              {sources ? `${sources.params.ratePercent} %` : "—"}
            </strong>
            <span className="text-[11px] text-slate-500">1/40e</span>
          </span>
          <span aria-hidden="true" className="hidden h-10 w-px bg-white/10 sm:block" />
          <span className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Statut Hawl
            </span>
            <strong className="text-[13px] font-semibold text-slate-200">
              {formatDateFr(sources?.params.hawlDate ?? null)}
            </strong>
            <span className="text-[11px] text-slate-500">Année lunaire</span>
          </span>
        </div>
        <span className="ml-auto text-[11px] text-slate-500">
          Réglages : Paramètres → Documents → Zakat
        </span>
      </Card>

      <StatsStrip
        columns={5}
        items={[
          {
            label: "Seuil Nisab or 85 g 24K",
            value: sources ? formatDzd(sources.params.nisabMinor) : "—",
            sub: "Min. Aff. Religieuses",
          },
          {
            label: "Assiette nette zakatable",
            value: formatDzd(net),
            sub: "Stocks + créances − dettes",
            tone: "blue",
          },
          {
            label: `Zakat exigible (${sources ? sources.params.ratePercent : "—"} %)`,
            value: preview_calc ? formatDzd(preview_calc.zakat) : "—",
            sub: preview_calc && preview_calc.above ? "1/40e — nisab atteint" : "Sous le nisab",
            tone: preview_calc && preview_calc.above ? "green" : "default",
          },
          {
            label: "Créances",
            value: sources ? formatDzd(sources.customerDebts.d) : "—",
            sub: "Clients",
          },
          {
            label: "Dettes",
            value: sources ? formatDzd(sources.supplierDebts.d) : "—",
            sub: "Fournisseurs",
            tone: sources && sources.supplierDebts.d > 0 ? "red" : "default",
          },
        ]}
      />

      {/* Détail du calcul courant */}
      <Card className="space-y-3 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Base de calcul (sources comptables)
          </div>
          <Badge tone="grey">Reporting seul</Badge>
        </div>
        <dl className="grid gap-x-8 sm:grid-cols-2">
          {[
            {
              label: "Espèces (ventes encaissées)",
              value: sources ? formatDzd(sources.cash.paid) : "—",
            },
            { label: "Ventes totales", value: sources ? formatDzd(sources.cash.total) : "—" },
            { label: "Stock", value: sources ? formatDzd(sources.inventory.v) : "—" },
            {
              label: "Créances clients",
              value: sources ? formatDzd(sources.customerDebts.d) : "—",
            },
            {
              label: "Dettes fournisseurs",
              value: sources ? formatDzd(sources.supplierDebts.d) : "—",
            },
          ].map((row) => (
            <div
              key={row.label}
              className="flex justify-between gap-3 border-b border-white/[0.05] py-2 last:border-0"
            >
              <dt className="text-slate-500">{row.label}</dt>
              <dd className="font-mono font-semibold tabular-nums text-slate-200">{row.value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3 py-2">
            <dt className="text-slate-500">Caisse/banque</dt>
            <dd className="text-right text-[11px] font-semibold text-amber-200/90">
              Saisie manuelle (dialogue)
            </dd>
          </div>
        </dl>
        <p className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
          <Info size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-[#fbbf24]" />
          <span>
            La caisse et la banque ne sont pas suivies par l&apos;application : saisissez-les dans
            le dialogue de calcul. Reporting seul, jamais un registre.
          </span>
        </p>
      </Card>

      {/* Historique */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-slate-300 ring-1 ring-white/10">
              <History size={15} aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-[15px] font-semibold tracking-tight text-slate-100">
                Historique des calculs
              </h3>
              <p className="text-[11px] text-slate-500">{total} calcul(s) enregistré(s)</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={exportHistory} title="Exporter CSV">
              <Download size={15} aria-hidden="true" /> CSV
            </Button>
            <Button
              variant="secondary"
              onClick={() => void printLast()}
              title="Imprimer le dernier calcul"
            >
              <Printer size={15} aria-hidden="true" /> Imprimer
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {loadError ? (
            <ErrorState message={loadError} />
          ) : loading ? (
            <p className="p-8 text-center text-sm text-slate-500" role="status">
              Chargement…
            </p>
          ) : history.length === 0 ? (
            <EmptyState
              title="Aucun calcul"
              hint="Lancez votre premier calcul avec le bouton « Nouvel Exercice »."
            />
          ) : (
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 bg-[#122131] text-left text-[11px] uppercase tracking-[0.12em] text-slate-500 shadow-[0_1px_0_rgba(255,255,255,0.07)]">
                <tr>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Année H.</th>
                  <th className="px-3 py-2.5 text-right">Montant zakatable</th>
                  <th className="px-3 py-2.5 text-right">Nisab</th>
                  <th className="px-3 py-2.5 text-right">Zakat</th>
                  <th className="px-3 py-2.5">Seuil</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-white/[0.06]">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-300">
                      {formatDateFr(h.calc_date)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{h.hijri_year}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatDzd(h.net_minor)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {formatDzd(h.nisab_minor)}
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-amber-200">
                      {formatDzd(h.zakat_minor)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={h.zakat_minor > 0 ? "green" : "grey"}>
                        {h.zakat_minor > 0 ? "Exigible" : "Sous nisab"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] px-4 py-3">
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPage={(p) => void loadHistory(p)}
          />
        </div>
      </Card>

      {/* Nouveau calcul */}
      {calcOpen && sources ? (
        <ZakatCalculationDialog
          hijriYear={hijriYear}
          sources={sources}
          onClose={() => setCalcOpen(false)}
          onSaved={() => {
            setCalcOpen(false);
            void loadHistory(1);
          }}
          notify={notify}
        />
      ) : null}

      {/* Aperçu impression */}
      {preview ? (
        <Modal label="Rapport zakat" title="Rapport zakat" onClose={() => setPreview(null)} wide>
          <iframe
            sandbox=""
            srcDoc={preview.htmlA4}
            title="Aperçu rapport zakat"
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
                  .then(() => notify("Rapport envoyé.", "ok"))
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
