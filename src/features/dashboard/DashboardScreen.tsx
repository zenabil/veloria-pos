// Veloria PoS — Écran : Tableau de bord (synthèse période + instantanés).
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { formatDzd } from "@domain/money/money.ts";
import { BarChart } from "@shared/charts/BarChart.tsx";
import { todayUtcDate } from "@shared/dates/dates.ts";
import { Button, Card, EmptyState, Kpi, TextInput, cn } from "@shared/ui/primitives.tsx";
import { paymentMethodLabel, type DashboardSummary } from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

export function DashboardScreen({
  notify,
  onNavigate,
}: {
  notify: Notify;
  /** P4 : forage — les alertes deviennent des boutons vers le module. */
  onNavigate?: (module: "stock" | "debts" | "bread") => void;
}): React.JSX.Element {
  const [from, setFrom] = useState(todayUtcDate());
  const [to, setTo] = useState(todayUtcDate());
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(f = from, t = to): Promise<void> {
    if (f === "" || t === "") return;
    setLoading(true);
    try {
      const s = (await api.dashboardSummary({ from: f, to: t })) as DashboardSummary;
      setSummary(s);
    } catch (e) {
      notify(frError(e, "Chargement impossible."), "err");
    } finally {
      setLoading(false);
    }
  }

  // Chargement initial (journée en cours).
  useEffect(() => {
    const today = todayUtcDate();
    setFrom(today);
    setTo(today);
    void load(today, today);
  }, []);

  function changeRange(f: string, t: string): void {
    setFrom(f);
    setTo(t);
    if (f !== "" && t !== "") void load(f, t);
  }

  const k = summary?.kpis;

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto">
      {/* En-tête de page */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold tracking-tight">Tableau de bord</h2>
          <p className="text-xs text-slate-500">
            {summary ? `Du ${summary.from} au ${summary.to}` : "Vue d'ensemble"}
          </p>
        </div>
        <TextInput
          type="date"
          value={from}
          onChange={(e) => changeRange(e.target.value, to)}
          aria-label="Du"
          title="Du"
        />
        <TextInput
          type="date"
          value={to}
          onChange={(e) => changeRange(from, e.target.value)}
          aria-label="Au"
          title="Au"
        />
        <Button
          variant="secondary"
          onClick={() => void load()}
          disabled={loading}
          title="Actualiser"
        >
          <RefreshCw size={16} aria-hidden="true" /> {loading ? "…" : "Actualiser"}
        </Button>
      </div>

      {!summary || !k ? (
        // P12: chargement initial ≠ vide (pas de flash « Aucune donnée »).
        loading ? (
          <EmptyState title="Chargement…" hint="Calcul des indicateurs en cours." />
        ) : (
          <EmptyState
            title="Aucune donnée"
            hint="Choisissez une période couvrant des opérations."
          />
        )
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi
              label="Ventes"
              value={formatDzd(k.salesMinor)}
              sub={`${k.salesCount} facture(s)`}
            />
            <Kpi
              label="Achats"
              value={formatDzd(k.purchasesMinor)}
              sub={`${k.purchasesCount} entrée(s)`}
            />
            <Kpi
              label="Dépenses"
              value={formatDzd(k.expensesMinor)}
              sub={`${k.expensesCount} charge(s)`}
            />
            <Kpi
              label="Marge brute"
              value={formatDzd(k.profitMinor)}
              sub="Ventes − achats revendus"
            />
            <Kpi label="Créances" value={formatDzd(k.customerDebtMinor)} sub="Clients" />
            <Kpi label="Dettes" value={formatDzd(k.supplierDebtMinor)} sub="Fournisseurs" />
            <Kpi label="Stock" value={formatDzd(k.stockValueMinor)} sub="Valeur d'achat" />
            <Kpi label="Trésorerie" value={formatDzd(k.cashMinor)} sub="Encaissé − décaissé" />
          </div>

          {/* Ventes : graphique + méthodes + comparaison */}
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="p-4">
              <BarChart
                title="Ventes par jour"
                labels={summary.daily.map((d) => d.d)}
                series={[
                  { label: "Ventes", values: summary.daily.map((d) => d.t), color: "#34d399" },
                ]}
              />
            </Card>
            <Card className="space-y-3 p-4">
              <h3 className="text-sm font-extrabold">Par moyen de paiement</h3>
              {summary.byMethod.length === 0 ? (
                <p className="text-xs text-slate-500">Aucune vente.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {summary.byMethod.map((m) => (
                      <tr key={m.method} className="border-t border-white/[0.06]">
                        <td className="py-1.5">{paymentMethodLabel(m.method)}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-400">{m.n}</td>
                        <td className="py-1.5 text-right font-bold tabular-nums">
                          {formatDzd(m.t)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <h3 className="pt-1 text-sm font-extrabold">Comparaison</h3>
              <p className="text-xs text-slate-500">
                Période précédente : {formatDzd(summary.comparison.prevSalesMinor)} ·{" "}
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

          {/* Finances : revenus/dépenses/marge */}
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="space-y-1.5 p-4">
              <h3 className="text-sm font-extrabold">Revenus / Dépenses / Marge</h3>
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Revenus (ventes)</dt>
                  <dd className="font-bold tabular-nums">{formatDzd(k.salesMinor)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Dépenses</dt>
                  <dd className="font-bold tabular-nums">{formatDzd(k.expensesMinor)}</dd>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-1.5">
                  <dt className="font-extrabold">Bénéfice brut</dt>
                  <dd className="font-extrabold tabular-nums text-amber-300">
                    {formatDzd(k.profitMinor)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Bénéfice net (brut − dépenses)</dt>
                  <dd className="font-bold tabular-nums">
                    {formatDzd(k.profitMinor - k.expensesMinor)}
                  </dd>
                </div>
              </dl>
            </Card>
            <Card className="space-y-2 p-4">
              <h3 className="text-sm font-extrabold">Rotation (top 5)</h3>
              {summary.fastMoving.length === 0 ? (
                <p className="text-xs text-slate-500">Aucune vente.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {summary.fastMoving.map((p, i) => (
                      <tr key={i} className="border-t border-white/[0.06]">
                        <td className="max-w-[220px] truncate py-1.5">{p.name}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-400">{p.qty}</td>
                        <td className="py-1.5 text-right font-bold tabular-nums">
                          {formatDzd(p.total)}
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
                <strong className="tabular-nums">{formatDzd(k.customerDebtMinor)}</strong>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Dettes fournisseurs</span>
                <strong className="tabular-nums">{formatDzd(k.supplierDebtMinor)}</strong>
              </div>
              <h3 className="pt-1 text-sm font-extrabold">En retard ({summary.overdue.length})</h3>
              {summary.overdue.length === 0 ? (
                <p className="text-xs text-slate-500">Aucune échéance dépassée.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {summary.overdue.map((d, i) => (
                      <tr key={i} className="border-t border-white/[0.06]">
                        <td className="max-w-[180px] truncate py-1.5">{d.party}</td>
                        <td className="py-1.5 font-mono text-xs text-slate-400">{d.ref}</td>
                        <td className="py-1.5 text-right font-bold tabular-nums text-red-300">
                          {formatDzd(d.remaining)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {summary.upcoming.length > 0 ? (
                <>
                  <h3 className="pt-1 text-sm font-extrabold">
                    Échéances 7 jours ({summary.upcoming.length})
                  </h3>
                  <table className="w-full text-sm">
                    <tbody>
                      {summary.upcoming.map((d, i) => (
                        <tr key={i} className="border-t border-white/[0.06]">
                          <td className="max-w-[180px] truncate py-1.5">{d.party}</td>
                          <td className="py-1.5 tabular-nums text-slate-400">
                            {d.due.slice(0, 10)}
                          </td>
                          <td className="py-1.5 text-right font-bold tabular-nums">
                            {formatDzd(d.remaining)}
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
                  right={formatDzd(s.total_minor)}
                  sub={s.created_at.slice(0, 16).replace("T", " ")}
                />
              ))}
              {summary.recent.sales.length === 0 ? <EmptyMini /> : null}
            </RecentCard>
            <RecentCard title="Derniers paiements">
              {summary.recent.payments.map((p, i) => (
                <RecentRow
                  key={i}
                  left={p.dir === "in" ? "Encaissé" : "Payé"}
                  mid={p.party}
                  right={formatDzd(p.amount_minor)}
                  sub={`${p.payment_date.slice(0, 10)} · ${paymentMethodLabel(p.method)}`}
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
                  right={formatDzd(p.total_minor)}
                  sub={p.created_at.slice(0, 10)}
                />
              ))}
              {summary.recent.purchases.length === 0 ? <EmptyMini /> : null}
            </RecentCard>
            <RecentCard title="Derniers retours">
              {summary.recent.returns.map((r, i) => (
                <RecentRow
                  key={i}
                  left={r.ref}
                  mid={r.kind === "client" ? "Client" : "Fournisseur"}
                  right={formatDzd(r.total)}
                  sub={r.created_at.slice(0, 10)}
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
                  right={formatDzd(e.amount_minor)}
                  sub={e.expense_date.slice(0, 10)}
                />
              ))}
              {summary.recent.expenses.length === 0 ? <EmptyMini /> : null}
            </RecentCard>
          </div>

          {/* Alertes */}
          <Card className="space-y-2 p-4">
            <h3 className="text-sm font-extrabold">Alertes</h3>
            <AlertRow
              tone={summary.stock.low + summary.stock.out > 0 ? "amber" : "green"}
              text={
                summary.stock.low + summary.stock.out > 0
                  ? `${summary.stock.low} stock(s) bas, ${summary.stock.out} rupture(s).`
                  : "Stock sain."
              }
              {...(summary.stock.low + summary.stock.out > 0 && onNavigate
                ? { action: { label: "Voir Stock", onClick: () => onNavigate("stock") } }
                : {})}
            />
            <AlertRow
              tone={summary.overdue.length > 0 ? "red" : "green"}
              text={
                summary.overdue.length > 0
                  ? `${summary.overdue.length} échéance(s) dépassée(s).`
                  : "Aucune échéance dépassée."
              }
              {...(summary.overdue.length > 0 && onNavigate
                ? { action: { label: "Voir Dettes", onClick: () => onNavigate("debts") } }
                : {})}
            />
            <AlertRow
              tone={summary.bread.pending + summary.bread.ready > 0 ? "amber" : "green"}
              text={
                summary.bread.pending + summary.bread.ready > 0
                  ? `${summary.bread.pending} commande(s) pain en cours, ${summary.bread.ready} prête(s).`
                  : "Aucune commande pain en cours."
              }
              {...(summary.bread.pending + summary.bread.ready > 0 && onNavigate
                ? { action: { label: "Voir Pain", onClick: () => onNavigate("bread") } }
                : {})}
            />
            <AlertRow
              tone={summary.alerts.lastBackup == null ? "amber" : "green"}
              text={
                summary.alerts.lastBackup == null
                  ? "Aucune sauvegarde : créez-en une (Paramètres → Sauvegarde)."
                  : `Dernière sauvegarde : ${summary.alerts.lastBackup.slice(0, 16).replace("T", " ")}.`
              }
            />
            <AlertRow
              tone={summary.alerts.integrity === "ok" ? "green" : "red"}
              text={
                summary.alerts.integrity === "ok"
                  ? "Base saine."
                  : `Base : ${summary.alerts.integrity} — restaurez une sauvegarde.`
              }
            />
          </Card>
        </>
      )}
    </div>
  );
}

function RecentCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Card className="space-y-1 p-4">
      <h3 className="text-sm font-extrabold">{title}</h3>
      {children}
    </Card>
  );
}

function RecentRow({
  left,
  mid,
  right,
  sub,
}: {
  left: string;
  mid: string;
  right: string;
  sub: string;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-2 border-t border-white/[0.06] py-1.5 text-sm">
      <span className="min-w-0">
        <span className="block truncate font-semibold">{left}</span>
        <span className="block truncate text-xs text-slate-500">
          {mid} · {sub}
        </span>
      </span>
      <span className="shrink-0 font-bold tabular-nums">{right}</span>
    </div>
  );
}

function EmptyMini(): React.JSX.Element {
  return <p className="text-xs text-slate-500">Aucune activité.</p>;
}

function AlertRow({
  tone,
  text,
  action,
}: {
  tone: "green" | "amber" | "red";
  text: string;
  action?: { label: string; onClick: () => void };
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm",
        tone === "green" && "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-100",
        tone === "amber" && "border-amber-400/30 bg-amber-400/[0.07] text-amber-100",
        tone === "red" && "border-red-400/30 bg-red-400/[0.07] text-red-100",
      )}
    >
      <span>{text}</span>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold underline decoration-dotted underline-offset-4 hover:bg-white/10"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
