// Veloria PoS — Screen: Vente (critical keyboard-first screen).
import { useEffect, useRef, useState } from "react";
import { useCart } from "./cart-store.ts";
import { api } from "@shared/types/ipc-client.ts";
import { formatDzd } from "@domain/money/money.ts";
import { totalsOf, createSale } from "@/application/sales/create-sale.ts";
import { Button, Card, TextInput } from "@shared/ui/primitives.tsx";

interface SearchRow {
  id: number;
  name: string;
  selling_price_minor: number;
  purchase_price_minor: number;
  quantity: number;
  unit_code: string;
  primary_barcode: string | null;
}

export function SellScreen({
  notify,
}: {
  notify: (msg: string, kind?: "ok" | "err") => void;
}): React.JSX.Element {
  const cart = useCart();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchRow[]>([]);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "F3") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "F10") {
        e.preventDefault();
        void finalize();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function search(q: string): Promise<void> {
    setQuery(q);
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    try {
      // Barcode exact first (indexed <=50ms path), then text search.
      if (/^[0-9A-Za-z\-_.]{4,}$/.test(trimmed)) {
        const hit = (await api.productByBarcode({ barcode: trimmed })) as {
          product: SearchRow | null;
        };
        if (hit.product) {
          addProduct(hit.product);
          setQuery("");
          setResults([]);
          return;
        }
      }
      const res = (await api.productSearch({ query: trimmed, page: 1, pageSize: 20 })) as {
        rows: SearchRow[];
      };
      setResults(res.rows);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Recherche impossible.", "err");
    }
  }

  function addProduct(p: SearchRow): void {
    cart.addLine({
      key: `${p.id}-${Date.now()}`,
      productId: p.id,
      productName: p.name,
      unitCode: p.unit_code,
      unitPriceMinor: p.selling_price_minor,
      purchasePriceMinor: p.purchase_price_minor,
      quantity: 1,
    });
  }

  let totals: { subtotalMinor: number; discountAmountMinor: number; totalMinor: number } | null =
    null;
  let totalsErr = "";
  try {
    if (cart.lines.length > 0) {
      totals = totalsOf({
        lines: cart.lines,
        discountType: cart.discountType,
        discountValue: cart.discountValue,
        deliveryFeeMinor: cart.deliveryFeeMinor,
        amountPaidMinor: Math.min(cart.amountPaidMinor, 999_999_999_99),
        customerId: cart.customerId,
        paymentMethod: cart.paymentMethod,
      });
    }
  } catch (e) {
    totalsErr = e instanceof Error ? e.message : "";
  }

  async function finalize(): Promise<void> {
    if (cart.lines.length === 0 || !totals) return;
    setBusy(true);
    try {
      const res = await createSale({
        lines: cart.lines,
        discountType: cart.discountType,
        discountValue: cart.discountValue,
        deliveryFeeMinor: cart.deliveryFeeMinor,
        amountPaidMinor: cart.amountPaidMinor,
        customerId: cart.customerId,
        paymentMethod: cart.paymentMethod,
      });
      notify(`Vente ${res.invoiceNumber} enregistrée.`, "ok");
      cart.clear();
      setResults([]);
      searchRef.current?.focus();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Échec de la vente.", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid h-full grid-cols-[1.2fr_1fr] gap-3">
      {/* Cart */}
      <Card className="flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-2 text-xs uppercase tracking-widest text-slate-400">
          <span>
            Vente · {cart.lines.length} article{cart.lines.length > 1 ? "s" : ""}
          </span>
          <span>{cart.customerLabel}</span>
        </div>
        <div className="flex-1 overflow-auto p-3">
          {cart.lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-slate-500">
              <div className="text-4xl">🛒</div>
              <div className="mt-2 text-xs font-bold uppercase tracking-widest">Caisse prête</div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#141a23] text-xs text-slate-400">
                <tr>
                  <th className="text-left p-2">Produit</th>
                  <th className="p-2 text-right">Qté</th>
                  <th className="p-2 text-right">P.U.</th>
                  <th className="p-2 text-right">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cart.lines.map((l) => (
                  <tr key={l.key} className="border-t border-white/5">
                    <td className="p-2">{l.productName}</td>
                    <td className="p-2 text-right">
                      <input
                        aria-label={`Quantité ${l.productName}`}
                        type="number"
                        min={0.001}
                        step={1}
                        value={l.quantity}
                        onChange={(e) => cart.setQty(l.key, Number(e.target.value))}
                        className="w-20 rounded border border-white/10 bg-black/30 px-2 py-1 text-right tabular-nums"
                      />
                    </td>
                    <td className="p-2 text-right tabular-nums">{formatDzd(l.unitPriceMinor)}</td>
                    <td className="p-2 text-right tabular-nums">
                      {formatDzd(Math.round(l.unitPriceMinor * l.quantity))}
                    </td>
                    <td className="p-2 text-right">
                      <button
                        aria-label={`Retirer ${l.productName}`}
                        className="text-slate-500 hover:text-red-300"
                        onClick={() => cart.removeLine(l.key)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="border-t border-white/5 p-3">
          {totalsErr ? (
            <div role="alert" className="mb-2 text-xs text-red-300">
              {totalsErr}
            </div>
          ) : null}
          <div className="flex items-end justify-between">
            <div className="text-xs uppercase tracking-widest text-slate-400">
              Total transaction
            </div>
            <div className="text-2xl font-extrabold tabular-nums">
              {formatDzd(totals?.totalMinor ?? 0)}
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <TextInput
              aria-label="Montant payé (centimes)"
              type="number"
              min={0}
              placeholder="Payé (DZD ×100)…"
              value={cart.amountPaidMinor || ""}
              onChange={(e) => cart.setTotals({ amountPaidMinor: Number(e.target.value) || 0 })}
            />
            <select
              aria-label="Méthode de paiement"
              value={cart.paymentMethod ?? "cash"}
              onChange={(e) => cart.setTotals({ paymentMethod: e.target.value as "cash" })}
              className="rounded-[10px] border border-white/10 bg-[#0e1319] px-2 text-sm"
            >
              <option value="cash">Espèces</option>
              <option value="cheque">Chèque</option>
              <option value="transfer">Virement</option>
            </select>
            <Button disabled={busy || cart.lines.length === 0} onClick={() => void finalize()}>
              {busy ? "…" : "Finaliser [F10]"}
            </Button>
          </div>
        </div>
      </Card>
      {/* Search */}
      <Card className="flex flex-col overflow-hidden">
        <div className="border-b border-white/5 p-2">
          <TextInput
            ref={searchRef}
            aria-label="Scanner ou chercher un produit"
            placeholder="Scanner / Chercher [F3]…"
            value={query}
            onChange={(e) => void search(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-auto p-2">
          {results.length === 0 ? (
            <div className="py-16 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
              Scanner / rechercher un produit
            </div>
          ) : (
            <ul>
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => addProduct(r)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-white/5"
                  >
                    <span>
                      <span className="block text-sm font-semibold">{r.name}</span>
                      <span className="block text-xs text-slate-500">
                        Stock : {r.quantity} · {r.primary_barcode ?? "sans code"}
                      </span>
                    </span>
                    <span className="text-sm font-bold tabular-nums text-emerald-300">
                      {formatDzd(r.selling_price_minor)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
