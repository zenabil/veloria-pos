// Veloria PoS — Paramètres : « Produits publiés dans l'application » (ADR-182).
//
// Le catalogue est une PROJECTION de `products` vers la table miroir
// `store_catalog` (une copie par magasin). Les prix affichés ici sont RELUS
// en base à chaque appel : le renderer ne fait jamais foi.
//
// L'écran montre le CATALOGUE EFFECTIF (ce que le client verra réellement)
// et explique pourquoi un produit n'y est pas. Un écart muet est un
// catalogue faux : le commerçant doit voir les compteurs.
import { useEffect, useRef, useState } from "react";
import { PackageSearch, Send, Store } from "lucide-react";

import { api } from "@shared/types/ipc-client.ts";
import { formatDzd } from "@domain/money/money.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { Button } from "@shared/ui/primitives.tsx";
import { Section, SwitchRow, useBusyFlag } from "./bits.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import type { Notify } from "@shared/ui/primitives.tsx";

interface CatalogItem {
  id: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  priceMinor: number;
  unitCode: string;
  available: boolean;
}

interface CatalogSettings {
  enabled: boolean;
  excludedCategoryIds: number[];
  productOverrides?: Record<string, { published?: boolean | null; available?: boolean | null }>;
  lastPublishedAt: string | null;
  lastVersion: string | null;
  lastProductCount: number;
  dirty: boolean;
}

interface CatalogSkipped {
  inactive: number;
  excludedCategory: number;
  invalidPrice: number;
  priceOverCap: number;
  invalidName: number;
  overLimit: number;
  merchantExcluded: number;
}

interface CatalogPreview {
  items: CatalogItem[];
  skipped: CatalogSkipped;
  settings: CatalogSettings;
}

interface CategoryRow {
  id: number;
  name: string;
}

interface ProductRow {
  id: number;
  name: string;
  category_id: number | null;
  category_name: string | null;
  is_active: number;
}

function formatWhen(iso: string | null): string {
  if (iso == null) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Algiers",
  });
}

export function ClientCatalogSection({ notify }: { notify: Notify }): React.JSX.Element {
  const [preview, setPreview] = useState<CatalogPreview | null>(null);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { busy, run } = useBusyFlag();
  const alive = useRef(true);
  const loadSeq = useRef(0);

  async function reload(): Promise<void> {
    const seq = ++loadSeq.current;
    try {
      const [p, cats] = await Promise.all([api.clientCatalogPreview(), api.categoriesList()]);
      if (!alive.current || seq !== loadSeq.current) return;
      setPreview((p ?? null) as CatalogPreview | null);
      setCategories(Array.isArray(cats) ? (cats as CategoryRow[]) : []);
      // Charger tous les produits (pagination) pour le contrôle par produit.
      const all: ProductRow[] = [];
      let page = 1;
      while (page <= 20) {
        const r = (await api.productSearch({ query: "", page, pageSize: 100 })) as {
          rows?: ProductRow[];
          total?: number;
        } | null;
        const rows = r?.rows ?? [];
        all.push(...rows);
        if (rows.length < 100 || all.length >= (r?.total ?? all.length)) break;
        page += 1;
      }
      if (seq !== loadSeq.current) return;
      setProducts(all);
    } catch (e) {
      if (!alive.current || seq !== loadSeq.current) return;
      notify(frError(e, "Catalogue indisponible."), "err");
    } finally {
      if (alive.current && seq === loadSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    alive.current = true;
    void reload();
    return () => {
      alive.current = false;
    };
  }, [notify]);

  const settings = preview?.settings ?? null;
  const excluded = new Set(settings?.excludedCategoryIds ?? []);
  const overrides = settings?.productOverrides ?? {};

  function currentOverrides(): Record<
    string,
    { published?: boolean | null; available?: boolean | null }
  > {
    return { ...(settings?.productOverrides ?? {}) };
  }

  function saveSettings(
    enabled: boolean,
    excludedIds: number[],
    nextOverrides?: Record<string, { published?: boolean | null; available?: boolean | null }>,
  ): void {
    void run(async () => {
      try {
        await api.clientCatalogSaveSettings({
          operationId: newOperationId(),
          enabled,
          excludedCategoryIds: excludedIds,
          productOverrides: nextOverrides ?? currentOverrides(),
        });
        notify(
          enabled
            ? "Réglages enregistrés : publiez le catalogue pour le mettre en ligne."
            : "Publication désactivée : les clients ne voient plus de catalogue.",
          "ok",
        );
        await reload();
      } catch (e) {
        notify(frError(e, "Réglages du catalogue impossibles à enregistrer."), "err");
      }
    });
  }

  function publishNow(): void {
    void run(async () => {
      try {
        const result = (await api.syncPublishCatalog({
          operationId: newOperationId(),
        })) as { productCount?: number; retiredCount?: number } | null;
        notify(`Catalogue publié : ${result?.productCount ?? 0} produit(s) en ligne.`, "ok");
        await reload();
      } catch (e) {
        notify(frError(e, "Publication du catalogue impossible."), "err");
      }
    });
  }

  function updateProductOverride(
    productId: number,
    patch: { published?: boolean | null; available?: boolean | null },
  ): void {
    const key = String(productId);
    const next = { ...currentOverrides() };
    const prev = next[key] ?? {};
    const merged = { ...prev, ...patch };
    if (merged.published == null && merged.available == null) {
      const rest = Object.fromEntries(Object.entries(next).filter(([k]) => k !== key));
      saveSettings(settings?.enabled ?? false, [...excluded], rest);
      return;
    }
    next[key] = merged;
    saveSettings(settings?.enabled ?? false, [...excluded], next);
  }
  const skipped = preview?.skipped;
  const skippedTotal = skipped
    ? skipped.inactive +
      skipped.excludedCategory +
      skipped.invalidPrice +
      skipped.priceOverCap +
      skipped.invalidName +
      skipped.overLimit +
      skipped.merchantExcluded
    : 0;

  return (
    <Section
      icon={<Store size={16} aria-hidden="true" />}
      title="Produits publiés dans l'application"
      hint="Catalogue visible par vos clients dans l'application. Les prix restent ceux du POS : la publication n'est qu'une projection."
      badge={
        loading
          ? "Lecture…"
          : settings?.enabled
            ? `${preview?.items.length ?? 0} produits publiés`
            : "Publication désactivée"
      }
    >
      <div className="space-y-3">
        <SwitchRow
          label="Publier le catalogue dans l'application"
          hint="Les clients voient la liste des produits et leur prix dans l'onglet Boutique."
          checked={settings?.enabled ?? false}
          onChange={(v) => saveSettings(v, [...excluded])}
          ariaLabel="Publier le catalogue dans l'application"
          disabled={loading}
        />

        {categories.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Catégories publiées
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {categories.map((c) => {
                const on = !excluded.has(c.id);
                return (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        const next = new Set(excluded);
                        if (on) next.add(c.id);
                        else next.delete(c.id);
                        saveSettings(settings?.enabled ?? false, [...next]);
                      }}
                      className="h-4 w-4 accent-amber-400"
                      aria-label={`Publier la catégorie ${c.name}`}
                    />
                    <span className="font-semibold text-slate-200">{c.name}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-slate-500">
              Décochez une catégorie pour la retirer du catalogue client. Le stock et les coûts ne
              sont jamais publiés.
            </p>
          </div>
        ) : null}

        {products.length > 0 ? (
          <details className="rounded-lg border border-white/10 bg-black/25 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-200">
              Contrôle par produit ({products.length})
            </summary>
            <div className="mt-2 max-h-72 space-y-1 overflow-auto">
              {products.map((prod) => {
                const ov = overrides[String(prod.id)] ?? {};
                const pubVal =
                  ov.published === true ? "yes" : ov.published === false ? "no" : "auto";
                const availVal =
                  ov.available === true ? "yes" : ov.available === false ? "no" : "auto";
                return (
                  <div
                    key={prod.id}
                    className="flex flex-wrap items-center gap-2 border-b border-white/5 py-1.5 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate text-slate-200">
                      {prod.name}
                      {prod.is_active !== 1 ? (
                        <span className="text-amber-300"> · archivé</span>
                      ) : null}
                    </span>
                    <label className="flex items-center gap-1 text-xs text-slate-400">
                      Publier
                      <select
                        className="rounded border border-white/10 bg-black/40 px-1 py-0.5 text-xs text-slate-200"
                        value={pubVal}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateProductOverride(prod.id, {
                            published: v === "auto" ? null : v === "yes",
                          });
                        }}
                        aria-label={`Publication ${prod.name}`}
                      >
                        <option value="auto">Auto</option>
                        <option value="yes">Oui</option>
                        <option value="no">Non</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-1 text-xs text-slate-400">
                      Disponible
                      <select
                        className="rounded border border-white/10 bg-black/40 px-1 py-0.5 text-xs text-slate-200"
                        value={availVal}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateProductOverride(prod.id, {
                            available: v === "auto" ? null : v === "yes",
                          });
                        }}
                        aria-label={`Disponibilité ${prod.name}`}
                      >
                        <option value="auto">Auto</option>
                        <option value="yes">Oui</option>
                        <option value="no">Non</option>
                      </select>
                    </label>
                  </div>
                );
              })}
            </div>
          </details>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={publishNow}
            disabled={busy || loading || !settings?.enabled}
          >
            <Send size={14} aria-hidden="true" />
            Publier maintenant
          </Button>
          <span className="text-xs text-slate-400">
            Dernière publication : {formatWhen(settings?.lastPublishedAt ?? null)}
            {settings?.dirty ? " · modifications non publiées" : ""}
          </span>
        </div>

        {skippedTotal > 0 ? (
          <p className="text-xs text-amber-300">
            {skippedTotal} produit(s) ne sont pas publiés
            {skipped
              ? ` (${skipped.inactive} archivé(s), ${skipped.excludedCategory} de catégorie exclue, ${skipped.invalidPrice} sans prix, ${skipped.merchantExcluded} exclus par le commerçant)`
              : ""}
            .
          </p>
        ) : null}

        {preview && preview.items.length > 0 ? (
          <details className="rounded-lg border border-white/10 bg-black/25 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-200">
              Aperçu : ce que verront les clients ({preview.items.length} produits)
            </summary>
            <ul className="mt-2 max-h-64 space-y-1 overflow-auto">
              {preview.items.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 text-sm text-slate-300"
                >
                  <span className="truncate">
                    {p.name}
                    {p.categoryName ? (
                      <span className="text-slate-500"> · {p.categoryName}</span>
                    ) : null}
                    {!p.available ? <span className="text-amber-300"> · indisponible</span> : null}
                  </span>
                  <span className="shrink-0 font-mono font-bold text-slate-100">
                    {formatDzd(p.priceMinor)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {!loading && preview && preview.items.length === 0 ? (
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <PackageSearch size={14} aria-hidden="true" />
            Aucun produit à publier : vérifiez les prix et les catégories ci-dessus.
          </p>
        ) : null}
      </div>
    </Section>
  );
}
