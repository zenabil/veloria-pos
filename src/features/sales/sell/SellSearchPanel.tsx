// Veloria PoS — Caisse : panneau recherche produit (extrait de SellScreen, JSX pur).
import { formatDzd } from "@domain/money/money.ts";
import { Button, Card, Kbd, SearchField } from "@shared/ui/primitives.tsx";
import type { RefObject } from "react";
import type { SearchRow } from "./sell-types.ts";

export function SellSearchPanel({
  query,
  onQueryChange,
  onEnterFirst,
  results,
  searching,
  onPick,
  onOpenCustom,
  onCreateProforma,
  proformaBusy,
  cartEmpty,
  searchRef,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  onEnterFirst: () => void;
  results: SearchRow[];
  searching: boolean;
  onPick: (r: SearchRow) => void;
  onOpenCustom: () => void;
  onCreateProforma: () => void;
  proformaBusy: boolean;
  cartEmpty: boolean;
  searchRef: RefObject<HTMLInputElement | null>;
}): React.JSX.Element {
  return (
    <Card className="flex flex-col justify-between p-4">
      <div>
        <div className="flex items-center justify-between pb-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
            Recherche produit [F3]
          </span>
          <span className="rounded bg-[#1c2b3c] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#4edea3]">
            Scanner prêt
          </span>
        </div>
        <SearchField
          value={query}
          onChange={onQueryChange}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results.length > 0) onEnterFirst();
          }}
          placeholder="Nom, code-barres… (Entrée = premier résultat)"
          ariaLabel="Recherche produit"
          inputRef={searchRef}
          inputClassName="pl-10 pr-20"
          trailing={
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              <Kbd>Entrée ↵</Kbd>
            </span>
          }
        />
      </div>
      {searching ? (
        <p className="mt-2 text-xs text-slate-500" role="status">
          Recherche…
        </p>
      ) : null}
      {results.length > 0 ? (
        <ul className="mt-2 max-h-56 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onPick(r)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-amber-400/10"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{r.name}</span>
                  <span className="block text-xs text-slate-500">
                    Stock : {r.quantity} · {r.unit_code}
                    {r.primary_barcode ? ` · ${r.primary_barcode}` : ""}
                  </span>
                </span>
                <span className="shrink-0 font-bold tabular-nums text-amber-300">
                  {formatDzd(r.selling_price_minor)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onOpenCustom} title="Article libre [F1]">
            + Article libre
          </Button>
          <Button
            variant="ghost"
            onClick={onCreateProforma}
            disabled={proformaBusy || cartEmpty}
            title="Créer un devis avec aperçu [F4]"
          >
            {proformaBusy ? "Devis…" : "Devis"}
          </Button>
        </div>
        {results.length > 0 ? (
          <span className="font-mono text-[10px] font-semibold text-[#d3c5ac]/80">
            Affichage : {results.length} produit(s) filtré(s)
          </span>
        ) : null}
      </div>
    </Card>
  );
}
