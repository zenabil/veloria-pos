// Veloria PoS — Screen: Clients (recherche + création + relevé + encaissement + import).
import { useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { formatDzd } from "@domain/money/money.ts";
import { Button, Card, TextInput, EmptyState, Field } from "@shared/ui/primitives.tsx";
import { CsvImport } from "@shared/ui/CsvImport.tsx";

interface Row {
  id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  outstanding_balance_minor: number;
  credit_limit_minor: number;
}

interface Statement {
  customer: Row & { address: string | null };
  sales: { id: number; invoice_number: string; total_minor: number; payment_status: string }[];
  payments: { id: number; amount_minor: number; method: string; payment_date: string }[];
}

export function CustomersScreen({
  notify,
}: {
  notify: (m: string, k?: "ok" | "err") => void;
}): React.JSX.Element {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ first: "", last: "", phone: "", credit: "" });
  const [detail, setDetail] = useState<Statement | null>(null);
  const [pay, setPay] = useState({ amount: "", method: "cash" });

  async function load(query = q): Promise<void> {
    try {
      const res = (await api.customerSearch({ query, page: 1, pageSize: 50 })) as { rows: Row[] };
      setRows(res.rows);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erreur", "err");
    }
  }
  useEffect(() => {
    void load("");
  }, []);

  async function create(): Promise<void> {
    try {
      await api.customerCreate({
        firstName: form.first,
        lastName: form.last,
        phone: form.phone || null,
        creditLimitMinor: Math.round(Number(form.credit || "0") * 100),
      });
      notify("Client créé.", "ok");
      setOpen(false);
      setForm({ first: "", last: "", phone: "", credit: "" });
      await load("");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Création impossible.", "err");
    }
  }

  async function openDetail(id: number): Promise<void> {
    try {
      setDetail((await api.customerStatement({ id })) as Statement);
      setPay({ amount: "", method: "cash" });
    } catch (e) {
      notify(e instanceof Error ? e.message : "Relevé impossible.", "err");
    }
  }

  async function recordPayment(): Promise<void> {
    if (!detail) return;
    try {
      const amountMinor = Math.round(Number(pay.amount) * 100);
      await api.customerPayment({
        customerId: detail.customer.id,
        saleId: null,
        amountMinor,
        method: pay.method,
      });
      notify("Paiement enregistré.", "ok");
      await openDetail(detail.customer.id);
      await load(q);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Paiement impossible.", "err");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Clients</h1>
        <div className="flex gap-2">
          <CsvImport kind="customers" notify={notify} onDone={() => void load("")} />
          <Button onClick={() => setOpen(true)}>+ Nouveau client</Button>
        </div>
      </div>
      <Card className="p-2">
        <TextInput
          aria-label="Chercher un client"
          placeholder="Chercher (nom, téléphone)…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            void load(e.target.value);
          }}
        />
      </Card>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="Aucun client" hint="Ajoutez votre premier client." />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-400">
              <tr>
                <th className="p-3">Nom</th>
                <th className="p-3">Téléphone</th>
                <th className="p-3 text-right">Solde dû</th>
                <th className="p-3">Fiche</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="p-3 font-semibold">
                    {r.first_name} {r.last_name}
                  </td>
                  <td className="p-3 text-slate-400">{r.phone ?? "—"}</td>
                  <td className="p-3 text-right tabular-nums">
                    {formatDzd(r.outstanding_balance_minor)}
                  </td>
                  <td className="p-3">
                    <Button variant="outline" onClick={() => void openDetail(r.id)}>
                      Relevé
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Nouveau client"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        >
          <Card className="w-[440px] space-y-3 p-5">
            <h2 className="text-lg font-bold">Nouveau client</h2>
            <Field label="Prénom">
              <TextInput
                value={form.first}
                onChange={(e) => setForm({ ...form, first: e.target.value })}
              />
            </Field>
            <Field label="Nom">
              <TextInput
                value={form.last}
                onChange={(e) => setForm({ ...form, last: e.target.value })}
              />
            </Field>
            <Field label="Téléphone">
              <TextInput
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="Plafond crédit (DZD, 0 = aucun)">
              <TextInput
                type="number"
                value={form.credit}
                onChange={(e) => setForm({ ...form, credit: e.target.value })}
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
      {detail ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Relevé client"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        >
          <Card className="max-h-[85vh] w-[640px] space-y-3 overflow-auto p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {detail.customer.first_name} {detail.customer.last_name} —{" "}
                {formatDzd(detail.customer.outstanding_balance_minor)}
              </h2>
              <Button variant="ghost" onClick={() => setDetail(null)}>
                Fermer
              </Button>
            </div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">
              Ventes ({detail.sales.length})
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {detail.sales.map((s) => (
                  <tr key={s.id} className="border-t border-white/5">
                    <td className="p-2 font-mono">{s.invoice_number}</td>
                    <td className="p-2 text-right tabular-nums">{formatDzd(s.total_minor)}</td>
                    <td className="p-2 text-slate-400">{s.payment_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">
              Paiements ({detail.payments.length})
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {detail.payments.map((p) => (
                  <tr key={p.id} className="border-t border-white/5">
                    <td className="p-2">{p.payment_date.slice(0, 10)}</td>
                    <td className="p-2 text-right tabular-nums">{formatDzd(p.amount_minor)}</td>
                    <td className="p-2 text-slate-400">{p.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="grid grid-cols-[1fr_160px_auto] items-end gap-2 border-t border-white/5 pt-3">
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
              <Button onClick={() => void recordPayment()}>Encaisser</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
