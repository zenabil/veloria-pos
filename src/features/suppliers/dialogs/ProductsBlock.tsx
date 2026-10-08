// Veloria PoS — Fournisseurs : tiroir détail + formulaire + paiement + historique.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useEffect, useState } from "react";

import { api } from "@shared/types/ipc-client.ts";

import { formatDzd } from "@domain/money/money.ts";

import { Card, TextInput } from "@shared/ui/primitives.tsx";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

// ---------------------------------------------------------------------------
// Produits liés au fournisseur (jonction) : recherche + lier/délier.
// ---------------------------------------------------------------------------

interface LinkedProduct {
  id: number;
  name: string;
  quantity: number;
  purchase_price_minor: number;
}

export function SupplierProductsBlock({
  supplierId,
  notify,
}: {
  supplierId: number;
  notify: Notify;
}): React.JSX.Element {
  const [rows, setRows] = useState<LinkedProduct[]>([]);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: number; name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  async function refresh(): Promise<void> {
    try {
      const res = (await api.supplierProducts({ id: supplierId })) as { rows?: LinkedProduct[] };
      setRows(res.rows ?? []);
    } catch {
      setRows([]);
    }
  }

  useEffect(() => {
    void refresh();
  }, [supplierId]);

  async function searchProducts(v: string): Promise<void> {
    setQ(v);
    if (v.trim().length < 2) {
      setFound([]);
      return;
    }
    try {
      const res = (await api.productSearch({ query: v.trim(), page: 1, pageSize: 8 })) as {
        rows?: { id: number; name: string }[];
      };
      setFound((res.rows ?? []).filter((p) => !rows.some((r) => r.id === p.id)).slice(0, 8));
    } catch {
      setFound([]);
    }
  }

  async function link(productId: number): Promise<void> {
    setBusy(true);
    try {
      const cur = (await api.productSuppliers({ id: productId })) as { rows?: { id: number }[] };
      const ids = [...new Set([...(cur.rows ?? []).map((s) => s.id), supplierId])];
      await api.productSetSuppliers({ productId, supplierIds: ids });
      notify("Produit lié.", "ok");
      setFound([]);
      setQ("");
      await refresh();
    } catch (e) {
      notify(frError(e, "Liaison impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function unlink(productId: number): Promise<void> {
    setBusy(true);
    try {
      const cur = (await api.productSuppliers({ id: productId })) as { rows?: { id: number }[] };
      const ids = (cur.rows ?? []).map((s) => s.id).filter((id) => id !== supplierId);
      await api.productSetSuppliers({ productId, supplierIds: ids });
      notify("Liaison retirée.", "ok");
      await refresh();
    } catch (e) {
      notify(frError(e, "Retrait impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-2.5 p-4 text-sm">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
        Produits liés ({rows.length})
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">Aucun produit lié à ce fournisseur.</p>
      ) : (
        <ul className="max-h-36 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{p.name}</span>
                <span className="block text-xs tabular-nums text-slate-500">
                  Stock : {p.quantity} · {formatDzd(p.purchase_price_minor)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void unlink(p.id)}
                disabled={busy}
                aria-label={`Délier ${p.name}`}
                title="Délier le produit"
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 transition-colors hover:bg-red-500/15 hover:text-red-300 disabled:opacity-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <TextInput
        value={q}
        onChange={(e) => void searchProducts(e.target.value)}
        placeholder="Lier un produit… (min. 2 lettres)"
        aria-label="Lier un produit"
      />
      {found.length > 0 ? (
        <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/10">
          {found.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => void link(p.id)}
                disabled={busy}
                className="w-full truncate px-3 py-2 text-left text-sm transition-colors hover:bg-amber-400/10 disabled:opacity-50"
              >
                + {p.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
