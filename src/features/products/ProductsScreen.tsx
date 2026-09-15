// Veloria PoS — Screen: Catalogue produits (search + create, paginated, indexed).
import { useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { formatDzd } from "@domain/money/money.ts";
import { Button, Card, TextInput, EmptyState, Field } from "@shared/ui/primitives.tsx";
import { CsvImport } from "@shared/ui/CsvImport.tsx";

interface Row {
  id: number;
  name: string;
  selling_price_minor: number;
  quantity: number;
  stock_status: string;
  primary_barcode: string | null;
}

export function ProductsScreen({
  notify,
}: {
  notify: (m: string, k?: "ok" | "err") => void;
}): React.JSX.Element {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", selling: "", purchase: "", qty: "", barcode: "" });

  async function load(query = q): Promise<void> {
    try {
      const res = (await api.productSearch({ query, page: 1, pageSize: 50 })) as {
        rows: Row[];
        total: number;
      };
      setRows(res.rows);
      setTotal(res.total);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erreur", "err");
    }
  }
  useEffect(() => {
    void load("");
  }, []);

  async function create(): Promise<void> {
    try {
      await api.productCreate({
        name: form.name,
        sellingPriceMinor: Math.round(Number(form.selling) * 100),
        purchasePriceMinor: Math.round(Number(form.purchase) * 100),
        quantity: Number(form.qty) || 0,
        barcodes: form.barcode ? [form.barcode.trim()] : [],
      });
      notify("Produit créé.", "ok");
      setOpen(false);
      setForm({ name: "", selling: "", purchase: "", qty: "", barcode: "" });
      await load("");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Création impossible.", "err");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Catalogue</h1>
          <p className="text-sm text-slate-400">Inventaire et tarification</p>
        </div>
        <div className="flex gap-2">
          <CsvImport kind="products" notify={notify} onDone={() => void load("")} />
          <Button onClick={() => setOpen(true)}>+ Nouveau [N]</Button>
        </div>
      </div>
      <Card className="p-2">
        <TextInput
          aria-label="Chercher une référence"
          placeholder="Chercher une référence… [F3]"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            void load(e.target.value);
          }}
        />
      </Card>
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            title="Aucun produit"
            hint="Créez votre premier produit avec le bouton Nouveau."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-400">
              <tr>
                <th className="p-3">Produit</th>
                <th className="p-3">Code</th>
                <th className="p-3 text-right">Prix</th>
                <th className="p-3 text-right">Stock</th>
                <th className="p-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="p-3 font-semibold">{r.name}</td>
                  <td className="p-3 text-slate-400">{r.primary_barcode ?? "—"}</td>
                  <td className="p-3 text-right tabular-nums text-emerald-300">
                    {formatDzd(r.selling_price_minor)}
                  </td>
                  <td className="p-3 text-right tabular-nums">{r.quantity}</td>
                  <td className="p-3">
                    {r.stock_status === "out_of_stock" ? (
                      <span className="text-red-400">● Rupture</span>
                    ) : r.stock_status === "low_stock" ? (
                      <span className="text-amber-300">● Bas</span>
                    ) : (
                      <span className="text-emerald-300">● OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="border-t border-white/5 px-3 py-2 text-xs text-slate-500">
          {total} produit(s)
        </div>
      </Card>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Nouveau produit"
          className="fixed inset-0 flex items-center justify-center bg-black/60"
        >
          <Card className="w-[480px] space-y-3 p-5">
            <h2 className="text-lg font-bold">Nouveau produit</h2>
            <Field label="Nom">
              <TextInput
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Prix vente (DZD)">
                <TextInput
                  type="number"
                  value={form.selling}
                  onChange={(e) => setForm({ ...form, selling: e.target.value })}
                />
              </Field>
              <Field label="Prix achat (DZD)">
                <TextInput
                  type="number"
                  value={form.purchase}
                  onChange={(e) => setForm({ ...form, purchase: e.target.value })}
                />
              </Field>
              <Field label="Quantité">
                <TextInput
                  type="number"
                  value={form.qty}
                  onChange={(e) => setForm({ ...form, qty: e.target.value })}
                />
              </Field>
              <Field label="Code-barres">
                <TextInput
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                />
              </Field>
            </div>
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
