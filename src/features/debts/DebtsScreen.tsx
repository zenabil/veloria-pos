// Veloria PoS — Screen: Dettes clients (Phase 8).
// Échéances : dues + dépassements de plafond + encaissements rapides.
import { useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { formatDzd } from "@domain/money/money.ts";
import { Button, Card, TextInput, EmptyState, Field } from "@shared/ui/primitives.tsx";

interface DebtRow {
  id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  outstanding_balance_minor: number;
  credit_limit_minor: number;
  is_over_limit: number;
}

type Filter = "all" | "due" | "over_limit";

function todayFr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DebtsScreen({
  notify,
}: {
  notify: (m: string, k?: "ok" | "err") => void;
}): React.JSX.Element {
  const [filter, setFilter] = useState<Filter>("all");
  const [rows, setRows] = useState<DebtRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pay, setPay] = useState({ customerId: "", saleId: "", amount: "", method: "cash" });

  async function load(f: Filter = filter): Promise<void> {
    try {
      const r = (await api.debtsList({ filter: f, page: 1, pageSize: 100 })) as {
        rows: DebtRow[];
        total: number;
      };
      setRows(r.rows);
      setTotal(r.total);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Chargement impossible.", "err");
    }
  }

  useEffect(() => {
    void load("all");
  }, []);

  const overLimit = rows.filter((r) => r.is_over_limit === 1).length;
  const totalMinor = rows.reduce((a, r) => a + r.outstanding_balance_minor, 0);

  async function recordPayment(): Promise<void> {
    try {
      const amountMinor = Math.round(Number(pay.amount) * 100);
      if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
        notify("Montant invalide.", "err");
        return;
      }
      await api.customerPayment({
        customerId: pay.customerId ? Number(pay.customerId) : null,
        saleId: pay.saleId ? Number(pay.saleId) : null,
        amountMinor,
        method: pay.method,
      });
      notify("Encaissement enregistré.", "ok");
      setPay({ customerId: "", saleId: "", amount: "", method: "cash" });
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Encaissement impossible.", "err");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Dettes</h1>
          <p className="text-sm text-slate-400">
            {total} client(s) débiteur(s) · Total {formatDzd(totalMinor)} · {overLimit}{" "}
            dépassement(s) de plafond
          </p>
        </div>
        <div className="flex gap-1">
          {(
            [
              ["all", "Toutes"],
              ["due", "Dues"],
              ["over_limit", "Dépassements"],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <Button
              key={f}
              variant={filter === f ? "primary" : "outline"}
              onClick={() => {
                setFilter(f);
                void load(f);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-3">
        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState title="Aucune dette" hint="Les ventes à crédit apparaîtront ici." />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-400">
                <tr>
                  <th className="p-3">Client</th>
                  <th className="p-3 text-right">Dû</th>
                  <th className="p-3 text-right">Plafond</th>
                  <th className="p-3">Alerte</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="p-3 font-semibold">
                      #{r.id} {r.first_name} {r.last_name}
                      <span className="block text-xs font-normal text-slate-500">
                        {r.phone ?? "—"}
                      </span>
                    </td>
                    <td className="p-3 text-right tabular-nums text-amber-200">
                      {formatDzd(r.outstanding_balance_minor)}
                    </td>
                    <td className="p-3 text-right tabular-nums text-slate-400">
                      {r.credit_limit_minor > 0 ? formatDzd(r.credit_limit_minor) : "—"}
                    </td>
                    <td className="p-3">
                      {r.is_over_limit === 1 ? (
                        <span className="text-red-400">● Dépassement</span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card className="space-y-3 p-4">
          <h2 className="font-bold">Encaissement rapide</h2>
          <div className="grid grid-cols-2 gap-2">
            <Field label="ID client">
              <TextInput
                type="number"
                value={pay.customerId}
                onChange={(e) => setPay({ ...pay, customerId: e.target.value })}
              />
            </Field>
            <Field label="ID vente (optionnel)">
              <TextInput
                type="number"
                value={pay.saleId}
                onChange={(e) => setPay({ ...pay, saleId: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Montant (DZD)">
              <TextInput
                type="number"
                value={pay.amount}
                onChange={(e) => setPay({ ...pay, amount: e.target.value })}
              />
            </Field>
            <Field label="Méthode">
              <select
                aria-label="Méthode"
                value={pay.method}
                onChange={(e) => setPay({ ...pay, method: e.target.value })}
                className="w-full rounded-[10px] border border-white/10 bg-[#0e1319] px-3 py-2 text-sm"
              >
                <option value="cash">Espèces</option>
                <option value="cheque">Chèque</option>
                <option value="transfer">Virement</option>
              </select>
            </Field>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void recordPayment()}>Encaisser ({todayFr()})</Button>
          </div>
          <p className="text-xs text-slate-500">
            Sans N° de vente : encaissement sur compte client. Avec N° : affecté à la vente et au
            client.
          </p>
        </Card>
      </div>
    </div>
  );
}
