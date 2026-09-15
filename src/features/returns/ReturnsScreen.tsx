// Veloria PoS — Screen: Retours (création depuis une vente + historique).
// Backend atomique : retour + restock + remboursement/avoir + audit = 1 tx.
import { useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { formatDzd } from "@domain/money/money.ts";
import { Button, Card, TextInput, EmptyState, Field } from "@shared/ui/primitives.tsx";

interface SaleItem {
  product_id: number | null;
  product_name_snapshot: string;
  quantity: number;
  unit_price_minor: number;
}

interface LoadedSale {
  sale: { id: number; invoice_number: string };
  items: SaleItem[];
}

interface ReturnRow {
  id: number;
  original_invoice_number: string;
  total_return_value_minor: number;
  amount_refunded_minor: number;
  credit_to_customer_minor: number;
  created_at: string;
}

export function ReturnsScreen({
  notify,
}: {
  notify: (m: string, k?: "ok" | "err") => void;
}): React.JSX.Element {
  const [saleId, setSaleId] = useState("");
  const [loaded, setLoaded] = useState<LoadedSale | null>(null);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [mode, setMode] = useState<"refund" | "credit">("refund");
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<ReturnRow[]>([]);

  async function loadHistory(): Promise<void> {
    try {
      const res = (await api.returnsList({ page: 1, pageSize: 50 })) as { rows: ReturnRow[] };
      setHistory(res.rows);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erreur", "err");
    }
  }
  useEffect(() => {
    void loadHistory();
  }, []);

  async function findSale(): Promise<void> {
    try {
      const id = Number(saleId);
      if (!Number.isInteger(id) || id <= 0) {
        notify("Numéro de vente invalide.", "err");
        return;
      }
      const res = (await api.saleGet({ id })) as LoadedSale;
      setLoaded(res);
      setQty({});
    } catch (e) {
      notify(e instanceof Error ? e.message : "Vente introuvable.", "err");
    }
  }

  const draftLines = (loaded?.items ?? [])
    .map((it, i) => {
      const q = Number(qty[i] ?? 0);
      return { ...it, index: i, qty: Number.isFinite(q) && q > 0 ? q : 0 };
    })
    .filter((l) => l.qty > 0);
  const draftTotal = draftLines.reduce((a, l) => a + Math.round(l.unit_price_minor * l.qty), 0);

  async function submit(): Promise<void> {
    if (!loaded) return;
    if (draftLines.length === 0) {
      notify("Indiquez au moins une quantité à retourner.", "err");
      return;
    }
    try {
      await api.returnCreate({
        originalSaleId: loaded.sale.id,
        items: draftLines.map((l) => ({
          productId: l.product_id,
          quantity: l.qty,
          restocked: true,
        })),
        refundMinor: mode === "refund" ? draftTotal : 0,
        creditMinor: mode === "credit" ? draftTotal : 0,
        reason,
      });
      notify(
        mode === "refund"
          ? "Retour enregistré, remboursement effectué."
          : "Retour enregistré, avoir accordé.",
        "ok",
      );
      setLoaded(null);
      setSaleId("");
      setQty({});
      setReason("");
      await loadHistory();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Retour impossible.", "err");
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-extrabold">Retours</h1>
        <p className="text-sm text-slate-400">Restock automatique, remboursement ou avoir client</p>
      </div>

      <Card className="space-y-3 p-4">
        <h2 className="font-bold">Nouveau retour</h2>
        <div className="flex gap-2">
          <TextInput
            aria-label="Numéro de vente"
            type="number"
            min="1"
            placeholder="N° de vente (ex. 12)"
            value={saleId}
            onChange={(e) => setSaleId(e.target.value)}
          />
          <Button onClick={() => void findSale()}>Charger</Button>
        </div>
        {loaded ? (
          <div className="space-y-2">
            <div className="text-sm text-slate-400">
              Facture <span className="font-mono text-slate-200">{loaded.sale.invoice_number}</span>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-400">
                <tr>
                  <th className="p-2">Produit</th>
                  <th className="p-2 text-right">Vendu</th>
                  <th className="p-2 text-right">Prix</th>
                  <th className="p-2 text-right">Qté retour</th>
                </tr>
              </thead>
              <tbody>
                {loaded.items.map((it, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="p-2 font-semibold">{it.product_name_snapshot}</td>
                    <td className="p-2 text-right tabular-nums">{it.quantity}</td>
                    <td className="p-2 text-right tabular-nums">
                      {formatDzd(it.unit_price_minor)}
                    </td>
                    <td className="p-2 text-right">
                      <input
                        aria-label={`Quantité à retourner pour ${it.product_name_snapshot}`}
                        type="number"
                        min="0"
                        max={it.quantity}
                        step="any"
                        value={qty[i] ?? ""}
                        onChange={(e) => setQty({ ...qty, [i]: e.target.value })}
                        className="w-24 rounded-[10px] border border-white/10 bg-[#0e1319] px-2 py-1 text-right text-sm text-slate-100"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-slate-400">
                Total retour : <strong className="text-slate-100">{formatDzd(draftTotal)}</strong>
              </span>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="return-mode"
                  checked={mode === "refund"}
                  onChange={() => setMode("refund")}
                />{" "}
                Rembourser (espèces)
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="return-mode"
                  checked={mode === "credit"}
                  onChange={() => setMode("credit")}
                />{" "}
                Avoir client
              </label>
            </div>
            <Field label="Motif (optionnel)">
              <TextInput
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex. Article défectueux"
              />
            </Field>
            <div className="flex justify-end">
              <Button onClick={() => void submit()}>Valider le retour</Button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        {history.length === 0 ? (
          <EmptyState title="Aucun retour" hint="Les retours validés apparaîtront ici." />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-400">
              <tr>
                <th className="p-3">Facture d&apos;origine</th>
                <th className="p-3 text-right">Valeur</th>
                <th className="p-3">Traitement</th>
                <th className="p-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="p-3 font-mono">{r.original_invoice_number}</td>
                  <td className="p-3 text-right tabular-nums">
                    {formatDzd(r.total_return_value_minor)}
                  </td>
                  <td className="p-3 text-slate-400">
                    {r.amount_refunded_minor > 0
                      ? `Remboursé ${formatDzd(r.amount_refunded_minor)}`
                      : null}
                    {r.credit_to_customer_minor > 0
                      ? `Avoir ${formatDzd(r.credit_to_customer_minor)}`
                      : null}
                  </td>
                  <td className="p-3 text-slate-400">
                    {new Date(r.created_at).toLocaleString("fr-FR")}
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
