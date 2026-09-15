// Veloria PoS — Screen: Pain (Phase 9).
// Tableau par date de retrait + création + paiements + retraits + transfert.
import { useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { formatDzd } from "@domain/money/money.ts";
import { Button, Card, TextInput, EmptyState, Field } from "@shared/ui/primitives.tsx";

interface BreadRow {
  id: number;
  order_number: string;
  customer_id: number | null;
  customer_name: string | null;
  custom_name: string | null;
  pickup_date: string;
  quantity: number;
  unit_price_minor: number;
  total_amount_minor: number;
  amount_paid_minor: number;
  remaining_amount_minor: number;
  payment_status: string;
  pickup_status: string;
  transferred_to_customer_account: number;
}

function todayFr(): string {
  return new Date().toISOString().slice(0, 10);
}

const PICKUP_FR: Record<string, string> = {
  pending: "En attente",
  ready: "Prête",
  delivered: "Retirée",
  cancelled: "Annulée",
};

export function BreadScreen({
  notify,
}: {
  notify: (m: string, k?: "ok" | "err") => void;
}): React.JSX.Element {
  const [date, setDate] = useState(todayFr());
  const [rows, setRows] = useState<BreadRow[]>([]);
  const [form, setForm] = useState({
    customerId: "",
    customName: "",
    pickupDate: todayFr(),
    quantity: "",
    unitPrice: "",
    paid: "",
    notes: "",
  });
  const [payId, setPayId] = useState("");
  const [payAmount, setPayAmount] = useState("");

  async function load(d: string = date): Promise<void> {
    try {
      const r = (await api.breadList({ pickupDate: d, page: 1, pageSize: 100 })) as {
        rows: BreadRow[];
      };
      setRows(r.rows);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Chargement impossible.", "err");
    }
  }

  useEffect(() => {
    void load(todayFr());
  }, []);

  async function create(): Promise<void> {
    try {
      if (!form.customerId && !form.customName.trim()) {
        notify("Client ou nom libre requis.", "err");
        return;
      }
      await api.breadCreate({
        customerId: form.customerId ? Number(form.customerId) : null,
        customName: form.customName || null,
        pickupDate: form.pickupDate,
        quantity: Number(form.quantity),
        unitPriceMinor: Math.round(Number(form.unitPrice || "0") * 100),
        amountPaidMinor: Math.round(Number(form.paid || "0") * 100),
        notes: form.notes || null,
      });
      notify("Commande de pain enregistrée.", "ok");
      setForm({
        customerId: "",
        customName: "",
        pickupDate: todayFr(),
        quantity: "",
        unitPrice: "",
        paid: "",
        notes: "",
      });
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Création impossible.", "err");
    }
  }

  async function pay(): Promise<void> {
    try {
      await api.breadPay({
        id: Number(payId),
        amountMinor: Math.round(Number(payAmount) * 100),
      });
      notify("Paiement pain enregistré.", "ok");
      setPayId("");
      setPayAmount("");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Paiement impossible.", "err");
    }
  }

  async function pickup(id: number, to: "ready" | "delivered" | "cancelled"): Promise<void> {
    try {
      await api.breadPickup({ id, to });
      notify("Statut de retrait mis à jour.", "ok");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Mise à jour impossible.", "err");
    }
  }

  async function transfer(id: number): Promise<void> {
    try {
      await api.breadTransfer({ id });
      notify("Solde transféré au compte client.", "ok");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Transfert impossible.", "err");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Pain</h1>
          <p className="text-sm text-slate-400">Commandes, retraits et paiements</p>
        </div>
        <div className="flex items-end gap-2">
          <Field label="Date de retrait">
            <TextInput
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                void load(e.target.value);
              }}
            />
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_1.5fr] gap-3">
        <Card className="space-y-3 p-4">
          <h2 className="font-bold">Nouvelle commande</h2>
          <div className="grid grid-cols-2 gap-2">
            <Field label="ID client (optionnel)">
              <TextInput
                type="number"
                value={form.customerId}
                onChange={(e) => setForm({ ...form, customerId: e.target.value })}
              />
            </Field>
            <Field label="Nom libre (sans compte)">
              <TextInput
                value={form.customName}
                onChange={(e) => setForm({ ...form, customName: e.target.value })}
              />
            </Field>
            <Field label="Retrait">
              <TextInput
                type="date"
                value={form.pickupDate}
                onChange={(e) => setForm({ ...form, pickupDate: e.target.value })}
              />
            </Field>
            <Field label="Quantité">
              <TextInput
                type="number"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </Field>
            <Field label="Prix unit. (DZD)">
              <TextInput
                type="number"
                value={form.unitPrice}
                onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
              />
            </Field>
            <Field label="Payé (DZD)">
              <TextInput
                type="number"
                value={form.paid}
                onChange={(e) => setForm({ ...form, paid: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Notes">
            <TextInput
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <div className="flex justify-end">
            <Button onClick={() => void create()}>Commander</Button>
          </div>
          <div className="space-y-2 border-t border-white/5 pt-3">
            <h3 className="text-sm font-bold">Encaisser une commande</h3>
            <div className="grid grid-cols-2 gap-2">
              <Field label="N° commande">
                <TextInput type="number" value={payId} onChange={(e) => setPayId(e.target.value)} />
              </Field>
              <Field label="Montant (DZD)">
                <TextInput
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => void pay()}>
                Encaisser
              </Button>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState
              title="Aucune commande"
              hint="Les commandes du jour de retrait choisi apparaîtront ici."
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-400">
                <tr>
                  <th className="p-3">N°</th>
                  <th className="p-3">Client</th>
                  <th className="p-3 text-right">Qté</th>
                  <th className="p-3 text-right">Reste</th>
                  <th className="p-3">Retrait</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="p-3 font-mono">{r.order_number}</td>
                    <td className="p-3">{r.customer_name ?? r.custom_name ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums">{r.quantity}</td>
                    <td className="p-3 text-right tabular-nums">
                      {formatDzd(r.remaining_amount_minor)}
                    </td>
                    <td className="p-3 text-slate-400">
                      {PICKUP_FR[r.pickup_status] ?? r.pickup_status}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {r.pickup_status === "pending" ? (
                          <Button variant="outline" onClick={() => void pickup(r.id, "ready")}>
                            Prête
                          </Button>
                        ) : null}
                        {r.pickup_status === "ready" ? (
                          <Button variant="outline" onClick={() => void pickup(r.id, "delivered")}>
                            Retirée
                          </Button>
                        ) : null}
                        {r.customer_id != null &&
                        r.remaining_amount_minor > 0 &&
                        r.transferred_to_customer_account === 0 ? (
                          <Button variant="ghost" onClick={() => void transfer(r.id)}>
                            Transférer
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
