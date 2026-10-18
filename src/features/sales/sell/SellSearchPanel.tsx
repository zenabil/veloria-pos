// Veloria PoS — Caisse : panneau recherche produit (extrait de SellScreen, JSX pur).
// Navigation clavier ↑↓ + Entrée surlignée, état vide avec article libre,
// badge rupture, aide raccourcis.
import { useEffect, useState } from "react";
import { formatDzd } from "@domain/money/money.ts";
import { Badge, Button, Card, Kbd, SearchField } from "@shared/ui/primitives.tsx";
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
  onOpenHelp,
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
  onOpenHelp: () => void;
}): React.JSX.Element {
  // Ligne surlignée (↑↓), remise à zéro à chaque nouveau résultat.
  const [active, setActive] = useState(0);
  useEffect(() => {
    setActive(0);
  }, [results]);
  const count = results.length;
  const clamped = count === 0 ? 0 : Math.min(Math.max(active, 0), count - 1);
  const activeRow = count > 0 ? results[clamped] : undefined;

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "ArrowDown" && count > 0) {
      e.preventDefault();
      setActive((a) => (a + 1) % count);
      return;
    }
    if (e.key === "ArrowUp" && count > 0) {
      e.preventDefault();
      setActive((a) => (a - 1 + count) % count);
      return;
    }
    // Entrée = ligne surlignée (repli : premier résultat, comme avant).
    if (e.key === "Enter" && count > 0) {
      e.preventDefault();
      if (activeRow) onPick(activeRow);
      else onEnterFirst();
    }
  }

  const showEmpty = !searching && query.trim() !== "" && results.length === 0;

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
          onKeyDown={onSearchKey}
          placeholder="Nom, code-barres… (5*code = quantité, ↑↓ + Entrée)"
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
        <ul
          role="listbox"
          aria-label="Résultats produits"
          className="mt-2 max-h-56 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10"
        >
          {results.map((r, i) => (
            <li key={r.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === clamped}
                onMouseEnter={() => setActive(i)}
                onClick={() => onPick(r)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-amber-400/10 ${i === clamped ? "bg-amber-400/10" : ""} ${r.quantity <= 0 ? "opacity-60" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{r.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    {r.quantity <= 0 ? (
                      <Badge tone="red">Rupture</Badge>
                    ) : (
                      <span className="tabular-nums">
                        Stock : {Math.round(r.quantity * 1000) / 1000}
                      </span>
                    )}
                    <span>· {r.unit_code}</span>
                    {r.primary_barcode ? <span>· {r.primary_barcode}</span> : null}
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
      {showEmpty ? (
        <div className="mt-2 rounded-xl border border-white/10 bg-black/25 px-3 py-3">
          <p className="text-sm font-semibold text-slate-300">
            Aucun produit trouvé pour « {query.trim()} ».
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Astuce : quantité rapide « 5*code ». Ou créez un article libre.
          </p>
          <div className="mt-2">
            <Button variant="secondary" onClick={onOpenCustom} title="Article libre [F1]">
              + Article libre [F1]
            </Button>
          </div>
        </div>
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
          <Button variant="ghost" onClick={onOpenHelp} title="Aide raccourcis clavier [?]">
            Raccourcis [?]
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
