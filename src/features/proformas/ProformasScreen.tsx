// Veloria PoS — Screen: Proformas (Phase 7).
// Brouillon → envoyé → converti/annulé. Conversion = vente réelle atomique.
import { useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { formatDzd } from "@domain/money/money.ts";
import { Button, Card, TextInput, EmptyState, Field } from "@shared/ui/primitives.tsx";

interface ProformaRow {
  id: number;
  proforma_number: string;
  customer_name: string | null;
  subtotal_minor: number;
  total_minor: number;
  status: string;
  created_at: string;
}

const STATUS_FR: Record<string, string> = {
  draft: "Brouillon",
  sent: "Envoyé",
  converted: "Converti",
  cancelled: "Annulé",
};

export function ProformasScreen({
  notify,
}: {
  notify: (m: string, k?: "ok" | "err") => void;
}): React.JSX.Element {
  const [rows, setRows] = useState<ProformaRow[]>([]);
  const [form, setForm] = useState({ customerId: "", notes: "" });
  const [lines, setLines] = useState<{ name: string; price: string; qty: string }[]>([
    { name: "", price: "", qty: "1" },
  ]);
  const [convert, setConvert] = useState({ id: "", paid: "" });

  async function load(): Promise<void> {
    try {
      const r = (await api.proformasList({ page: 1, pageSize: 50 })) as { rows: ProformaRow[] };
      setRows(r.rows);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Chargement impossible.", "err");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(): Promise<void> {
    try {
      const clean = lines.filter((l) => l.name.trim().length > 0);
      if (clean.length === 0) {
        notify("Ajoutez au moins une ligne.", "err");
        return;
      }
      await api.proformaCreate({
        customerId: form.customerId ? Number(form.customerId) : null,
        lines: clean.map((l) => ({
          productId: null,
          productName: l.name.trim(),
          unitPriceMinor: Math.round(Number(l.price || "0") * 100),
          quantity: Number(l.qty),
        })),
        discountMinor: 0,
        deliveryMinor: 0,
        notes: form.notes || null,
      });
      notify("Proforma créée (brouillon).", "ok");
      setForm({ customerId: "", notes: "" });
      setLines([{ name: "", price: "", qty: "1" }]);
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Création impossible.", "err");
    }
  }

  async function setStatus(id: number, to: "sent" | "cancelled"): Promise<void> {
    try {
      await api.proformaStatus({ id, to });
      notify(to === "sent" ? "Proforma envoyée." : "Proforma annulée.", "ok");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Mise à jour impossible.", "err");
    }
  }

  async function convertToSale(): Promise<void> {
    try {
      const res = (await api.proformaConvert({
        proformaId: Number(convert.id),
        amountPaidMinor: Math.round(Number(convert.paid || "0") * 100),
      })) as { invoiceNumber: string };
      notify(`Convertie en vente ${res.invoiceNumber}.`, "ok");
      setConvert({ id: "", paid: "" });
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Conversion impossible.", "err");
    }
  }

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-extrabold">Proformas</h1>
      <div className="grid grid-cols-[1fr_1.4fr] gap-3">
        <div className="space-y-3">
          <Card className="space-y-3 p-4">
            <h2 className="font-bold">Nouveau devis</h2>
            <div className="grid grid-cols-2 gap-2">
              <Field label="ID client (optionnel)">
                <TextInput
                  type="number"
                  value={form.customerId}
                  onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                />
              </Field>
              <Field label="Notes">
                <TextInput
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>
            </div>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_100px_70px_auto] items-end gap-2">
                <Field label={i === 0 ? "Désignation" : ""}>
                  <TextInput
                    value={l.name}
                    onChange={(e) => {
                      const n = [...lines];
                      n[i] = { ...l, name: e.target.value };
                      setLines(n);
                    }}
                    placeholder="Article…"
                  />
                </Field>
                <Field label={i === 0 ? "P.U. (DZD)" : ""}>
                  <TextInput
                    type="number"
                    value={l.price}
                    onChange={(e) => {
                      const n = [...lines];
                      n[i] = { ...l, price: e.target.value };
                      setLines(n);
                    }}
                  />
                </Field>
                <Field label={i === 0 ? "Qté" : ""}>
                  <TextInput
                    type="number"
                    value={l.qty}
                    onChange={(e) => {
                      const n = [...lines];
                      n[i] = { ...l, qty: e.target.value };
                      setLines(n);
                    }}
                  />
                </Field>
                <Button variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                  ✕
                </Button>
              </div>
            ))}
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => setLines([...lines, { name: "", price: "", qty: "1" }])}
              >
                + Ligne
              </Button>
              <Button onClick={() => void create()}>Créer le devis</Button>
            </div>
          </Card>
          <Card className="space-y-3 p-4">
            <h2 className="font-bold">Convertir en vente</h2>
            <div className="grid grid-cols-2 gap-2">
              <Field label="ID proforma (envoyée)">
                <TextInput
                  type="number"
                  value={convert.id}
                  onChange={(e) => setConvert({ ...convert, id: e.target.value })}
                />
              </Field>
              <Field label="Payé (DZD)">
                <TextInput
                  type="number"
                  value={convert.paid}
                  onChange={(e) => setConvert({ ...convert, paid: e.target.value })}
                />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => void convertToSale()}>Convertir</Button>
            </div>
          </Card>
        </div>
        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState title="Aucune proforma" hint="Les devis créés apparaîtront ici." />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-400">
                <tr>
                  <th className="p-3">N°</th>
                  <th className="p-3">Client</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="p-3 font-mono">{r.proforma_number}</td>
                    <td className="p-3">{r.customer_name ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums">{formatDzd(r.total_minor)}</td>
                    <td className="p-3 text-slate-400">{STATUS_FR[r.status] ?? r.status}</td>
                    <td className="p-3">
                      {r.status === "draft" ? (
                        <div className="flex gap-1">
                          <Button variant="outline" onClick={() => void setStatus(r.id, "sent")}>
                            Envoyer
                          </Button>
                          <Button variant="ghost" onClick={() => void setStatus(r.id, "cancelled")}>
                            Annuler
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
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
