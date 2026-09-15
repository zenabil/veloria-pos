// Veloria PoS — Screen: Zakat (Phase 8, reporting uniquement).
// Sources 100 % SQLite ; taux/nisab/hypothèses explicites et configurables.
import { useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { formatDzd } from "@domain/money/money.ts";
import { calculateZakat } from "@domain/finance/zakat.ts";
import { Button, Card, TextInput, Field } from "@shared/ui/primitives.tsx";

interface Sources {
  cash: { paid: number; total: number };
  inventory: { v: number };
  customerDebts: { d: number };
  supplierDebts: { d: number };
  params: { ratePercent: number; nisabMinor: number };
}

export function ZakatScreen({
  notify,
}: {
  notify: (m: string, k?: "ok" | "err") => void;
}): React.JSX.Element {
  const [src, setSrc] = useState<Sources | null>(null);
  const [rate, setRate] = useState("2.5");
  const [nisab, setNisab] = useState("");

  async function load(): Promise<void> {
    try {
      const s = (await api.zakatSources()) as Sources;
      setSrc(s);
      setRate(String(s.params.ratePercent));
      setNisab(s.params.nisabMinor > 0 ? String(s.params.nisabMinor / 100) : "");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Chargement impossible.", "err");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(): Promise<void> {
    try {
      await api.zakatSave({
        ratePercent: Number(rate.replace(",", ".")),
        nisabMinor: Math.round(Number(nisab || "0") * 100),
      });
      notify("Paramètres zakat enregistrés.", "ok");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Enregistrement impossible.", "err");
    }
  }

  let result: { zakatableBaseMinor: number; zakatDueMinor: number; aboveNisab: boolean } | null =
    null;
  let err = "";
  if (src) {
    try {
      result = calculateZakat({
        cashMinor: src.cash.paid,
        inventoryValueMinor: Math.round(src.inventory.v),
        customerDebtsMinor: src.customerDebts.d,
        supplierDebtsMinor: src.supplierDebts.d,
        nisabMinor: Math.round(Number(nisab || "0") * 100),
        ratePercent: Number(rate.replace(",", ".")),
      });
    } catch (e) {
      err = e instanceof Error ? e.message : "";
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-extrabold">Zakat</h1>
        <p className="text-sm text-slate-400">
          Calcul documenté — ni registre comptable, ni écriture automatique
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card className="space-y-2 p-4">
          <h2 className="font-bold">Valeurs sources (base locale)</h2>
          {src ? (
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-400">Encaissements ventes</dt>
                <dd className="tabular-nums">{formatDzd(src.cash.paid)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Valeur du stock (coût)</dt>
                <dd className="tabular-nums">{formatDzd(Math.round(src.inventory.v))}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Créances clients</dt>
                <dd className="tabular-nums">{formatDzd(src.customerDebts.d)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Dettes fournisseurs (−)</dt>
                <dd className="tabular-nums">{formatDzd(src.supplierDebts.d)}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Chargement…</p>
          )}
          <div className="grid grid-cols-2 gap-2 border-t border-white/5 pt-3">
            <Field label="Taux (%)">
              <TextInput value={rate} onChange={(e) => setRate(e.target.value)} />
            </Field>
            <Field label="Nisab (DZD)">
              <TextInput value={nisab} onChange={(e) => setNisab(e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void save()}>Enregistrer les hypothèses</Button>
          </div>
        </Card>
        <Card className="space-y-2 p-4">
          <h2 className="font-bold">Résultat</h2>
          {err ? (
            <div role="alert" className="text-sm text-red-300">
              {err}
            </div>
          ) : result ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Base zakatable</span>
                <strong className="tabular-nums">{formatDzd(result.zakatableBaseMinor)}</strong>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Seuil (nisab) atteint</span>
                <strong>{result.aboveNisab ? "Oui" : "Non"}</strong>
              </div>
              <div className="flex justify-between border-t border-white/5 pt-2 text-lg">
                <span className="font-bold">Zakat due</span>
                <strong className="tabular-nums text-emerald-300">
                  {formatDzd(result.zakatDueMinor)}
                </strong>
              </div>
              <p className="text-xs text-slate-500">
                Hypothèses : taux {rate} % · nisab{" "}
                {nisab ? formatDzd(Math.round(Number(nisab) * 100)) : "non défini"} · base =
                encaissements + stock + créances − dettes. Vérifiez avec votre référent avant tout
                versement.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">—</p>
          )}
        </Card>
      </div>
    </div>
  );
}
