// Veloria PoS — Screen: Historique des ventes (recherche, annulation, réimpression).
import { useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { formatDzd } from "@domain/money/money.ts";
import { Button, Card, EmptyState, TextInput } from "@shared/ui/primitives.tsx";

interface Row {
  id: number;
  invoice_number: string;
  total_minor: number;
  payment_status: string;
  is_cancelled: number;
  created_at: string;
  customer_name: string | null;
}

export function HistoryScreen({
  notify,
}: {
  notify: (m: string, k?: "ok" | "err") => void;
}): React.JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  async function load(): Promise<void> {
    try {
      const res = (await api.salesHistory({ page: 1, pageSize: 100, query: q })) as { rows: Row[] };
      setRows(
        q.trim()
          ? res.rows.filter((r) => r.invoice_number.toLowerCase().includes(q.trim().toLowerCase()))
          : res.rows,
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erreur", "err");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function cancel(id: number): Promise<void> {
    if (!window.confirm("Annuler cette vente ? Le stock sera restauré.")) return;
    try {
      await window.veloria?.sales.cancel({ id });
      notify("Vente annulée, stock restauré.", "ok");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Annulation impossible.", "err");
    }
  }

  async function reprint(id: number): Promise<void> {
    try {
      const res = (await api.saleGet({ id })) as {
        sale: Record<string, number | string>;
        items: {
          product_name_snapshot: string;
          quantity: number;
          unit_price_minor: number;
          line_total_minor: number;
        }[];
      };
      await window.veloria?.printing.printReceipt({
        company: "Veloria",
        invoice: String(res.sale["invoice_number"]),
        date: new Date(String(res.sale["created_at"])).toLocaleString("fr-FR"),
        lines: res.items.map((it) => ({
          name: it.product_name_snapshot,
          qty: it.quantity,
          unit: "",
          unitPriceMinor: it.unit_price_minor,
          lineTotalMinor: it.line_total_minor,
        })),
        subtotalMinor: Number(res.sale["subtotal_minor"]),
        discountMinor: Number(res.sale["discount_amount_minor"]),
        deliveryMinor: Number(res.sale["delivery_fee_minor"]),
        totalMinor: Number(res.sale["total_minor"]),
        paidMinor: Number(res.sale["amount_paid_minor"]),
      });
      notify("Ticket envoyé à l'imprimante.", "ok");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Réimpression impossible.", "err");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Historique des ventes</h1>
        <TextInput
          aria-label="Rechercher une facture"
          placeholder="N° facture…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
          }}
          className="max-w-64"
        />
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="Aucune vente" hint="Les ventes validées apparaîtront ici." />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-400">
              <tr>
                <th className="p-3">Facture</th>
                <th className="p-3">Client</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3">Statut</th>
                <th className="p-3">Date</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="p-3 font-mono">{r.invoice_number}</td>
                  <td className="p-3">{r.customer_name ?? "Passage"}</td>
                  <td className="p-3 text-right tabular-nums">{formatDzd(r.total_minor)}</td>
                  <td className="p-3">
                    {r.is_cancelled
                      ? "Annulée"
                      : r.payment_status === "paid"
                        ? "Payée"
                        : r.payment_status === "partial"
                          ? "Partielle"
                          : "Crédit"}
                  </td>
                  <td className="p-3 text-slate-400">
                    {new Date(r.created_at).toLocaleString("fr-FR")}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button variant="outline" onClick={() => void reprint(r.id)}>
                        Ticket
                      </Button>
                      {r.is_cancelled ? null : (
                        <Button variant="danger" onClick={() => void cancel(r.id)}>
                          Annuler
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
