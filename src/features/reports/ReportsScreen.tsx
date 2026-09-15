// Veloria PoS — Screen: Rapports + clôture Z (Phase 8).
// Périodes, marges, top produits, dettes, exports CSV, clôture journalière.
import { useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { formatDzd } from "@domain/money/money.ts";
import { Button, Card, TextInput, Field } from "@shared/ui/primitives.tsx";

function monthBounds(): { from: string; to: string } {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

interface FullReport {
  sales: { n: number; t: number; p: number; c: number };
  collections: { standalone: number };
  expenses: { e: number; n: number };
  refunds: { r: number; v: number; n: number };
  top: { name: string; qty: number; revenue: number }[];
  debt: { d: number };
  supplierDebt: { d: number };
  inventory: { v: number };
  from: string;
  to: string;
}

interface ClosingRow {
  business_date: string;
  opening_balance_minor: number;
  cash_sales_minor: number;
  customer_collections_minor: number;
  expenses_minor: number;
  refunds_minor: number;
  closing_balance_minor: number;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0] ?? {});
  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return `""`;
    if (typeof v === "string") return `"${v.replace(/"/g, '""')}"`;
    if (typeof v === "number" || typeof v === "boolean") return `"${String(v)}"`;
    return `"${String(JSON.stringify(v)).replace(/"/g, '""')}"`;
  };
  return [headers.join(";"), ...rows.map((r) => headers.map((h) => esc(r[h])).join(";"))].join(
    "\n",
  );
}

export function ReportsScreen({
  notify,
}: {
  notify: (m: string, k?: "ok" | "err") => void;
}): React.JSX.Element {
  const [range, setRange] = useState(monthBounds());
  const [report, setReport] = useState<FullReport | null>(null);
  const [closings, setClosings] = useState<ClosingRow[]>([]);
  const [closingForm, setClosingForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    opening: "",
  });

  async function load(): Promise<void> {
    try {
      setReport((await api.fullReport(range)) as FullReport);
      const c = (await api.closingsGet(range)) as { rows: ClosingRow[] };
      setClosings(c.rows);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Rapport impossible.", "err");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function closeDay(): Promise<void> {
    try {
      await api.closingCreate({
        businessDate: closingForm.date,
        openingMinor: Math.round(Number(closingForm.opening || "0") * 100),
      });
      notify("Clôture Z enregistrée.", "ok");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Clôture impossible.", "err");
    }
  }

  function exportCsv(kind: "top" | "closings"): void {
    try {
      const data =
        kind === "top"
          ? (report?.top ?? []).map((t) => ({
              produit: t.name,
              quantite: t.qty,
              chiffre_centimes: t.revenue,
            }))
          : closings.map((c) => ({
              date: c.business_date,
              ouverture_centimes: c.opening_balance_minor,
              ventes_centimes: c.cash_sales_minor,
              encaissements_centimes: c.customer_collections_minor,
              depenses_centimes: c.expenses_minor,
              remboursements_centimes: c.refunds_minor,
              cloture_centimes: c.closing_balance_minor,
            }));
      const csv = toCsv(data);
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = kind === "top" ? "top-produits.csv" : "clotures.csv";
      a.click();
      URL.revokeObjectURL(url);
      notify("Export CSV téléchargé.", "ok");
    } catch {
      notify("Export impossible.", "err");
    }
  }

  const margin = report != null ? report.sales.t - report.expenses.e - report.refunds.r : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">Rapports</h1>
          <p className="text-sm text-slate-400">Périodes, marges, clôture Z et exports</p>
        </div>
        <div className="flex items-end gap-2">
          <Field label="Du">
            <TextInput
              type="date"
              value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
            />
          </Field>
          <Field label="Au">
            <TextInput
              type="date"
              value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
            />
          </Field>
          <Button onClick={() => void load()}>Actualiser</Button>
        </div>
      </div>

      {report ? (
        <div className="grid grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wider text-slate-400">Ventes</div>
            <div className="mt-1 text-xl font-extrabold tabular-nums">
              {formatDzd(report.sales.t)}
            </div>
            <div className="text-xs text-slate-500">
              {report.sales.n} vente(s) · Encaissé {formatDzd(report.sales.p)} · Crédit{" "}
              {formatDzd(report.sales.c)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wider text-slate-400">Charges</div>
            <div className="mt-1 text-xl font-extrabold tabular-nums text-red-300">
              −{formatDzd(report.expenses.e)}
            </div>
            <div className="text-xs text-slate-500">
              {report.expenses.n} dépense(s) · Remboursements {formatDzd(report.refunds.r)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wider text-slate-400">Marge période</div>
            <div className="mt-1 text-xl font-extrabold tabular-nums text-emerald-300">
              {formatDzd(margin)}
            </div>
            <div className="text-xs text-slate-500">Ventes − charges − remboursements</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wider text-slate-400">Dettes & stock</div>
            <div className="mt-1 text-sm tabular-nums">
              Clients : <strong>{formatDzd(report.debt.d)}</strong>
            </div>
            <div className="text-sm tabular-nums">
              Fournisseurs : <strong>{formatDzd(report.supplierDebt.d)}</strong>
            </div>
            <div className="text-sm tabular-nums">
              Stock : <strong>{formatDzd(Math.round(report.inventory.v))}</strong>
            </div>
          </Card>
        </div>
      ) : (
        <Card className="p-8 text-center text-slate-400">Chargement du rapport…</Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Top produits
            </span>
            <Button variant="outline" onClick={() => exportCsv("top")}>
              Export CSV
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-400">
              <tr>
                <th className="p-3">Produit</th>
                <th className="p-3 text-right">Qté</th>
                <th className="p-3 text-right">CA</th>
              </tr>
            </thead>
            <tbody>
              {(report?.top ?? []).map((t) => (
                <tr key={t.name} className="border-t border-white/5">
                  <td className="p-3 font-semibold">{t.name}</td>
                  <td className="p-3 text-right tabular-nums">{t.qty}</td>
                  <td className="p-3 text-right tabular-nums">{formatDzd(t.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className="space-y-3">
          <Card className="space-y-3 p-4">
            <h2 className="font-bold">Clôture Z du jour</h2>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Date d'activité">
                <TextInput
                  type="date"
                  value={closingForm.date}
                  onChange={(e) => setClosingForm({ ...closingForm, date: e.target.value })}
                />
              </Field>
              <Field label="Fond d'ouverture (DZD)">
                <TextInput
                  type="number"
                  value={closingForm.opening}
                  onChange={(e) => setClosingForm({ ...closingForm, opening: e.target.value })}
                />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => void closeDay()}>Clôturer</Button>
            </div>
            <p className="text-xs text-slate-500">
              Clôture = ouverture + ventes espèces + encaissements − dépenses − remboursements. Une
              seule clôture par date.
            </p>
          </Card>
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Clôtures ({closings.length})
              </span>
              <Button variant="outline" onClick={() => exportCsv("closings")}>
                Export CSV
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-400">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Clôture</th>
                </tr>
              </thead>
              <tbody>
                {closings.map((c) => (
                  <tr key={c.business_date} className="border-t border-white/5">
                    <td className="p-3 font-mono">{c.business_date}</td>
                    <td className="p-3 text-right tabular-nums">
                      {formatDzd(c.closing_balance_minor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </div>
  );
}
