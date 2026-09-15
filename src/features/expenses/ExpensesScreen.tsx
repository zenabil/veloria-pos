// Veloria PoS — Screen: Dépenses (saisie + liste paginée).
import { useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { formatDzd } from "@domain/money/money.ts";
import { Button, Card, TextInput, EmptyState, Field } from "@shared/ui/primitives.tsx";

interface ExpenseRow {
  id: number;
  description: string;
  category: string;
  amount_minor: number;
  expense_date: string;
}

const CATEGORIES = [
  "Loyer",
  "Salaires",
  "Électricité",
  "Eau",
  "Transport",
  "Marchandises",
  "Entretien",
  "Autre",
];

function todayFr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExpensesScreen({
  notify,
}: {
  notify: (m: string, k?: "ok" | "err") => void;
}): React.JSX.Element {
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    description: "",
    category: "Autre",
    amount: "",
    date: todayFr(),
  });

  async function load(): Promise<void> {
    try {
      const res = (await api.expensesList({ page: 1, pageSize: 50 })) as {
        rows: ExpenseRow[];
        total: number;
      };
      setRows(res.rows);
      setTotal(res.total);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erreur", "err");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  const monthTotal = rows
    .filter((r) => r.expense_date.slice(0, 7) === todayFr().slice(0, 7))
    .reduce((a, r) => a + r.amount_minor, 0);

  async function create(): Promise<void> {
    try {
      const amountMinor = Math.round(Number(form.amount) * 100);
      if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
        notify("Montant invalide.", "err");
        return;
      }
      await api.expenseCreate({
        description: form.description.trim(),
        category: form.category,
        amountMinor,
        expenseDate: form.date,
      });
      notify("Dépense enregistrée.", "ok");
      setOpen(false);
      setForm({ description: "", category: "Autre", amount: "", date: todayFr() });
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Enregistrement impossible.", "err");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Dépenses</h1>
          <p className="text-sm text-slate-400">
            Charges du mois :{" "}
            <span className="font-bold text-slate-200">{formatDzd(monthTotal)}</span>
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>+ Nouvelle dépense</Button>
      </div>
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            title="Aucune dépense"
            hint="Enregistrez vos charges pour suivre la trésorerie."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-400">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Description</th>
                <th className="p-3">Catégorie</th>
                <th className="p-3 text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="p-3 text-slate-400">{r.expense_date}</td>
                  <td className="p-3 font-semibold">{r.description}</td>
                  <td className="p-3 text-slate-400">{r.category}</td>
                  <td className="p-3 text-right tabular-nums text-red-300">
                    −{formatDzd(r.amount_minor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="border-t border-white/5 px-3 py-2 text-xs text-slate-500">
          {total} dépense(s)
        </div>
      </Card>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Nouvelle dépense"
          className="fixed inset-0 flex items-center justify-center bg-black/60"
        >
          <Card className="w-[480px] space-y-3 p-5">
            <h2 className="text-lg font-bold">Nouvelle dépense</h2>
            <Field label="Description">
              <TextInput
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Ex. Facture électricité"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Catégorie">
                <select
                  aria-label="Catégorie"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-[10px] border border-white/10 bg-[#0e1319] px-3 py-2 text-sm text-slate-100"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Montant (DZD)">
                <TextInput
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Date">
              <TextInput
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button onClick={() => void create()}>Enregistrer</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
