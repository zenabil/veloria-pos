// Veloria PoS — Screen: Stock (Phase 6).
// KPI + alertes + entrées fournisseurs + ajustements + journal + valorisation + fournisseurs.
// FR uniquement. Montants en centimes DZD.
import { useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { formatDzd } from "@domain/money/money.ts";
import { Button, Card, TextInput, EmptyState, Field } from "@shared/ui/primitives.tsx";

type Tab = "stock" | "intakes" | "suppliers" | "valuation";

interface Overview {
  skuActive: number;
  inventoryValueMinor: number;
  lowStock: number;
  outOfStock: number;
}

interface LowRow {
  id: number;
  name: string;
  quantity: number;
  min_stock_level: number;
  selling_price_minor: number;
}

interface IntakeRow {
  id: number;
  invoice_number: string | null;
  invoice_date: string | null;
  total_minor: number;
  supplier_name: string | null;
  created_at: string;
}

interface SupplierRow {
  id: number;
  name: string;
  phone: string | null;
  outstanding_balance_minor: number;
}

function todayFr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function StockScreen({
  notify,
}: {
  notify: (m: string, k?: "ok" | "err") => void;
}): React.JSX.Element {
  const [tab, setTab] = useState<Tab>("stock");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [low, setLow] = useState<LowRow[]>([]);
  const [intakes, setIntakes] = useState<IntakeRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [supQuery, setSupQuery] = useState("");
  const [valuation, setValuation] = useState<{
    valueMinor: number;
    skuActive: number;
    lines: { id: number; name: string; quantity: number; line_value: number }[];
  } | null>(null);

  // Entrée : formulaire simple (1 produit/ligne ajouté par recherche)
  const [intakeForm, setIntakeForm] = useState({
    supplierId: "",
    invoiceNumber: "",
    invoiceDate: todayFr(),
    shipping: "",
    notes: "",
  });
  const [intakeLines, setIntakeLines] = useState<
    { productId: number | null; productName: string; qty: string; cost: string }[]
  >([]);
  const [prodQuery, setProdQuery] = useState("");
  const [prodHits, setProdHits] = useState<{ id: number; name: string }[]>([]);

  // Ajustement
  const [adj, setAdj] = useState({ productId: "", newQty: "", reason: "" });

  // Fournisseur : création + paiement
  const [supForm, setSupForm] = useState({ name: "", phone: "" });
  const [payForm, setPayForm] = useState({ supplierId: "", amount: "", method: "cash" });

  async function loadAll(): Promise<void> {
    try {
      setOverview((await api.stockOverview()) as Overview);
      const l = (await api.stockLow({ page: 1, pageSize: 50 })) as { rows: LowRow[] };
      setLow(l.rows);
      const it = (await api.stockIntakes({ page: 1, pageSize: 30 })) as { rows: IntakeRow[] };
      setIntakes(it.rows);
      const sp = (await api.supplierSearch({ query: supQuery, page: 1, pageSize: 50 })) as {
        rows: SupplierRow[];
      };
      setSuppliers(sp.rows);
      setValuation((await api.stockValuation()) as typeof valuation);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Chargement du stock impossible.", "err");
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function searchProducts(q: string): Promise<void> {
    setProdQuery(q);
    if (q.trim().length < 2) {
      setProdHits([]);
      return;
    }
    try {
      const r = (await api.productSearch({ query: q.trim(), page: 1, pageSize: 10 })) as {
        rows: { id: number; name: string }[];
      };
      setProdHits(r.rows);
    } catch {
      setProdHits([]);
    }
  }

  async function submitIntake(): Promise<void> {
    try {
      if (intakeLines.length === 0) {
        notify("Ajoutez au moins une ligne à l'entrée.", "err");
        return;
      }
      const shippingMinor = Math.round(Number(intakeForm.shipping || "0") * 100);
      await api.stockIntake({
        supplierId: intakeForm.supplierId ? Number(intakeForm.supplierId) : null,
        invoiceNumber: intakeForm.invoiceNumber || null,
        invoiceDate: intakeForm.invoiceDate,
        shippingMinor,
        notes: intakeForm.notes || null,
        lines: intakeLines.map((l) => ({
          productId: l.productId,
          productName: l.productName,
          quantityReceived: Number(l.qty),
          quantityDamaged: 0,
          purchasePriceMinor: Math.round(Number(l.cost || "0") * 100),
        })),
      });
      notify("Entrée fournisseur enregistrée.", "ok");
      setIntakeLines([]);
      setIntakeForm({
        supplierId: "",
        invoiceNumber: "",
        invoiceDate: todayFr(),
        shipping: "",
        notes: "",
      });
      await loadAll();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Entrée impossible.", "err");
    }
  }

  async function submitAdjust(): Promise<void> {
    try {
      await api.stockAdjust({
        productId: Number(adj.productId),
        newQuantity: Number(adj.newQty),
        reason: adj.reason,
      });
      notify("Stock ajusté.", "ok");
      setAdj({ productId: "", newQty: "", reason: "" });
      await loadAll();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Ajustement impossible.", "err");
    }
  }

  async function createSupplier(): Promise<void> {
    try {
      await api.supplierCreate({ name: supForm.name, phone: supForm.phone || null });
      notify("Fournisseur créé.", "ok");
      setSupForm({ name: "", phone: "" });
      await loadAll();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Création impossible.", "err");
    }
  }

  async function paySupplier(): Promise<void> {
    try {
      await api.supplierPay({
        supplierId: Number(payForm.supplierId),
        amountMinor: Math.round(Number(payForm.amount) * 100),
        method: payForm.method,
        paymentDate: todayFr(),
      });
      notify("Paiement fournisseur enregistré.", "ok");
      setPayForm({ supplierId: "", amount: "", method: "cash" });
      await loadAll();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Paiement impossible.", "err");
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "stock", label: "Inventaire" },
    { id: "intakes", label: "Entrées" },
    { id: "suppliers", label: "Fournisseurs" },
    { id: "valuation", label: "Valorisation" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Stock</h1>
          <p className="text-sm text-slate-400">
            {overview
              ? `${overview.skuActive} référence(s) · Valeur ${formatDzd(overview.inventoryValueMinor)} · ${overview.lowStock} bas · ${overview.outOfStock} rupture(s)`
              : "Chargement…"}
          </p>
        </div>
        <div className="flex gap-1">
          {tabs.map((t) => (
            <Button
              key={t.id}
              variant={tab === t.id ? "primary" : "outline"}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      {tab === "stock" ? (
        <div className="grid grid-cols-2 gap-3">
          <Card className="overflow-hidden">
            <div className="border-b border-white/5 px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-400">
              Alertes bas / rupture
            </div>
            {low.length === 0 ? (
              <EmptyState title="Stock sain" hint="Aucun produit sous le seuil." />
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-400">
                  <tr>
                    <th className="p-3">Produit</th>
                    <th className="p-3 text-right">Stock</th>
                    <th className="p-3 text-right">Seuil</th>
                  </tr>
                </thead>
                <tbody>
                  {low.map((r) => (
                    <tr key={r.id} className="border-t border-white/5">
                      <td className="p-3 font-semibold">{r.name}</td>
                      <td className="p-3 text-right tabular-nums text-red-300">{r.quantity}</td>
                      <td className="p-3 text-right tabular-nums text-slate-400">
                        {r.min_stock_level}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card className="space-y-3 p-4">
            <h2 className="font-bold">Ajustement d&apos;inventaire</h2>
            <Field label="ID produit">
              <TextInput
                type="number"
                value={adj.productId}
                onChange={(e) => setAdj({ ...adj, productId: e.target.value })}
                placeholder="Ex. 3"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Nouvelle quantité">
                <TextInput
                  type="number"
                  value={adj.newQty}
                  onChange={(e) => setAdj({ ...adj, newQty: e.target.value })}
                />
              </Field>
              <Field label="Motif">
                <TextInput
                  value={adj.reason}
                  onChange={(e) => setAdj({ ...adj, reason: e.target.value })}
                  placeholder="Inventaire, casse…"
                />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => void submitAdjust()}>Ajuster</Button>
            </div>
            <p className="text-xs text-slate-500">
              Chaque ajustement écrit un mouvement traçable dans le journal de stock.
            </p>
          </Card>
        </div>
      ) : null}

      {tab === "intakes" ? (
        <div className="grid grid-cols-2 gap-3">
          <Card className="space-y-3 p-4">
            <h2 className="font-bold">Nouvelle entrée fournisseur</h2>
            <div className="grid grid-cols-2 gap-2">
              <Field label="ID fournisseur (optionnel)">
                <TextInput
                  type="number"
                  value={intakeForm.supplierId}
                  onChange={(e) => setIntakeForm({ ...intakeForm, supplierId: e.target.value })}
                />
              </Field>
              <Field label="Facture fournisseur">
                <TextInput
                  value={intakeForm.invoiceNumber}
                  onChange={(e) => setIntakeForm({ ...intakeForm, invoiceNumber: e.target.value })}
                  placeholder="N° facture"
                />
              </Field>
              <Field label="Date">
                <TextInput
                  type="date"
                  value={intakeForm.invoiceDate}
                  onChange={(e) => setIntakeForm({ ...intakeForm, invoiceDate: e.target.value })}
                />
              </Field>
              <Field label="Port (DZD)">
                <TextInput
                  type="number"
                  value={intakeForm.shipping}
                  onChange={(e) => setIntakeForm({ ...intakeForm, shipping: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Ajouter un produit (recherche)">
              <TextInput
                value={prodQuery}
                onChange={(e) => void searchProducts(e.target.value)}
                placeholder="Taper ≥ 2 lettres…"
              />
            </Field>
            {prodHits.length > 0 ? (
              <ul className="max-h-32 overflow-auto rounded-[10px] border border-white/10">
                {prodHits.map((h) => (
                  <li key={h.id}>
                    <button
                      className="w-full px-3 py-1 text-left text-sm hover:bg-white/5"
                      onClick={() => {
                        setIntakeLines([
                          ...intakeLines,
                          { productId: h.id, productName: h.name, qty: "1", cost: "" },
                        ]);
                        setProdHits([]);
                        setProdQuery("");
                      }}
                    >
                      {h.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {intakeLines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_110px_auto] items-end gap-2">
                <Field label="Produit">
                  <TextInput
                    value={l.productName}
                    onChange={(e) => {
                      const next = [...intakeLines];
                      next[i] = { ...l, productName: e.target.value };
                      setIntakeLines(next);
                    }}
                  />
                </Field>
                <Field label="Qté">
                  <TextInput
                    type="number"
                    value={l.qty}
                    onChange={(e) => {
                      const next = [...intakeLines];
                      next[i] = { ...l, qty: e.target.value };
                      setIntakeLines(next);
                    }}
                  />
                </Field>
                <Field label="Coût (DZD)">
                  <TextInput
                    type="number"
                    value={l.cost}
                    onChange={(e) => {
                      const next = [...intakeLines];
                      next[i] = { ...l, cost: e.target.value };
                      setIntakeLines(next);
                    }}
                  />
                </Field>
                <Button
                  variant="ghost"
                  onClick={() => setIntakeLines(intakeLines.filter((_, j) => j !== i))}
                >
                  ✕
                </Button>
              </div>
            ))}
            <div className="flex justify-end">
              <Button onClick={() => void submitIntake()}>Valider l&apos;entrée</Button>
            </div>
          </Card>
          <Card className="overflow-hidden">
            <div className="border-b border-white/5 px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-400">
              Dernières entrées
            </div>
            {intakes.length === 0 ? (
              <EmptyState title="Aucune entrée" hint="Les réceptions validées apparaîtront ici." />
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-400">
                  <tr>
                    <th className="p-3">Facture</th>
                    <th className="p-3">Fournisseur</th>
                    <th className="p-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {intakes.map((r) => (
                    <tr key={r.id} className="border-t border-white/5">
                      <td className="p-3 font-mono">{r.invoice_number ?? `#${r.id}`}</td>
                      <td className="p-3 text-slate-400">{r.supplier_name ?? "—"}</td>
                      <td className="p-3 text-right tabular-nums">{formatDzd(r.total_minor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "suppliers" ? (
        <div className="grid grid-cols-2 gap-3">
          <Card className="space-y-3 p-4">
            <h2 className="font-bold">Fournisseurs</h2>
            <TextInput
              aria-label="Chercher un fournisseur"
              placeholder="Chercher…"
              value={supQuery}
              onChange={(e) => {
                setSupQuery(e.target.value);
                void api
                  .supplierSearch({ query: e.target.value, page: 1, pageSize: 50 })
                  .then((r) => setSuppliers((r as { rows: SupplierRow[] }).rows))
                  .catch(() => undefined);
              }}
            />
            {suppliers.length === 0 ? (
              <EmptyState
                title="Aucun fournisseur"
                hint="Créez votre premier fournisseur ci-dessous."
              />
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-400">
                  <tr>
                    <th className="p-2">Nom</th>
                    <th className="p-2 text-right">Dette</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s) => (
                    <tr key={s.id} className="border-t border-white/5">
                      <td className="p-2 font-semibold">
                        #{s.id} {s.name}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {formatDzd(s.outstanding_balance_minor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="grid grid-cols-2 gap-2 border-t border-white/5 pt-3">
              <Field label="Nom (nouveau)">
                <TextInput
                  value={supForm.name}
                  onChange={(e) => setSupForm({ ...supForm, name: e.target.value })}
                />
              </Field>
              <Field label="Téléphone">
                <TextInput
                  value={supForm.phone}
                  onChange={(e) => setSupForm({ ...supForm, phone: e.target.value })}
                />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => void createSupplier()}>Créer</Button>
            </div>
          </Card>
          <Card className="space-y-3 p-4">
            <h2 className="font-bold">Paiement fournisseur</h2>
            <div className="grid grid-cols-2 gap-2">
              <Field label="ID fournisseur">
                <TextInput
                  type="number"
                  value={payForm.supplierId}
                  onChange={(e) => setPayForm({ ...payForm, supplierId: e.target.value })}
                />
              </Field>
              <Field label="Montant (DZD)">
                <TextInput
                  type="number"
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Méthode">
              <select
                aria-label="Méthode"
                value={payForm.method}
                onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
                className="w-full rounded-[10px] border border-white/10 bg-[#0e1319] px-3 py-2 text-sm"
              >
                <option value="cash">Espèces</option>
                <option value="cheque">Chèque</option>
                <option value="transfer">Virement</option>
              </select>
            </Field>
            <div className="flex justify-end">
              <Button onClick={() => void paySupplier()}>Payer</Button>
            </div>
            <p className="text-xs text-slate-500">
              Paiement atomique : dette fournisseur et journal d&apos;audit mis à jour ensemble.
            </p>
          </Card>
        </div>
      ) : null}

      {tab === "valuation" ? (
        <Card className="p-4">
          <h2 className="font-bold">
            Valorisation — {valuation ? formatDzd(valuation.valueMinor) : "…"} (
            {valuation?.skuActive ?? "…"} références)
          </h2>
          <p className="text-xs text-slate-500">
            Coût d&apos;achat × quantité (50 premières lignes).
          </p>
          <table className="mt-2 w-full text-sm">
            <thead className="text-left text-xs text-slate-400">
              <tr>
                <th className="p-2">Produit</th>
                <th className="p-2 text-right">Qté</th>
                <th className="p-2 text-right">Valeur</th>
              </tr>
            </thead>
            <tbody>
              {(valuation?.lines ?? []).map((l) => (
                <tr key={l.id} className="border-t border-white/5">
                  <td className="p-2 font-semibold">{l.name}</td>
                  <td className="p-2 text-right tabular-nums">{l.quantity}</td>
                  <td className="p-2 text-right tabular-nums">
                    {formatDzd(Math.round(l.line_value))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
