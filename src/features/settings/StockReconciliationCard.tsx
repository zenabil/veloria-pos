// Veloria PoS — STK-01 : carte de diagnostic de la cohérence du stock.
//
// L'audit a constaté que la règle FIFO 7 de la compétence `veloria-stock`
// (« Reconcile aggregate layer quantity to product quantity and report any
// unexplained difference ») n'était appliquée par AUCUN écran : une dérive
// entre le stock affiché, les couches FIFO et le journal des mouvements était
// invisible depuis l'intérieur du produit.
//
// Cette carte rend le diagnostic accessible au gérant (Paramètres →
// Catalogue). Elle est en LECTURE SEULE : elle n'écrit rien, elle explique.
//
// Accessibilité (veloria-ui-fr) :
//  - l'état n'est jamais porté par la COULEUR seule : un libellé textuel
//    (« Conforme » / « Écart ») accompagne chaque indicateur ;
//  - le résultat est annoncé dans une zone `role="status"` (lecteurs d'écran) ;
//  - le tableau est un vrai tableau (`<table>` avec en-têtes) — lisible au
//    clavier et par un lecteur d'écran, exportable, sélectionnable.
import { useState } from "react";
import { Boxes, ShieldCheck } from "lucide-react";

import { api } from "@shared/types/ipc-client.ts";
import { Button } from "@shared/ui/primitives.tsx";
import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { Section, useBusyFlag } from "./bits.tsx";

interface ReconcileRow {
  productId: number;
  name: string;
  unitCode: string;
  productQuantity: number;
  layerQuantity: number;
  ledgerQuantity: number | null;
  movementQuantity: number | null;
  layerDrift: number;
  ledgerDrift: number | null;
  status: "ok" | "layer-drift" | "ledger-drift";
}

interface ReconcileReport {
  generatedAt: string;
  summary: {
    products: number;
    ok: number;
    drifted: number;
    layerDrifted: number;
    ledgerDrifted: number;
    truncated: boolean;
  };
  rows: ReconcileRow[];
}

/** Quantité affichée : millième près, sans flottant parasite. */
function fmtQty(value: number): string {
  return String(Math.round(value * 1000) / 1000).replace(".", ",");
}

export function StockReconciliationCard({ notify }: { notify: Notify }): React.JSX.Element {
  const { busy, run } = useBusyFlag();
  const [report, setReport] = useState<ReconcileReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  function check(): void {
    void run(async () => {
      try {
        const res = (await api.stockReconcile()) as ReconcileReport;
        setReport(res);
        setError(null);
        if (res.summary.drifted === 0) {
          notify("Cohérence du stock vérifiée : aucun écart.", "ok");
        } else {
          notify(`${res.summary.drifted} écart(s) de stock détecté(s) : voir le détail.`, "err");
        }
      } catch (e) {
        const message = frError(e, "Vérification de la cohérence impossible.");
        setError(message);
        setReport(null);
        notify(message, "err");
      }
    });
  }

  const summary = report?.summary;

  return (
    <Section
      icon={<ShieldCheck size={16} aria-hidden="true" />}
      title="Cohérence du stock"
      hint="Rapproche la quantité du produit, les couches FIFO et le journal des mouvements."
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={check} disabled={busy} variant="secondary">
          <Boxes size={15} aria-hidden="true" />
          {busy ? "Vérification en cours…" : "Vérifier la cohérence du stock"}
        </Button>
        {summary ? (
          <span className="text-xs text-slate-400">
            {summary.products} produit(s) analysé(s) · {summary.ok} conforme(s) · {summary.drifted}{" "}
            en écart
            {summary.truncated ? " (liste tronquée)" : ""}
          </span>
        ) : (
          <span className="text-xs text-slate-500">
            Lecture seule : cette vérification n&apos;écrit rien dans la base.
          </span>
        )}
      </div>

      {error ? (
        <p className="mt-3 text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <div role="status" aria-live="polite" className="mt-3 text-xs text-slate-300">
        {summary ? (
          summary.drifted === 0 ? (
            <span>
              Résultat : <strong className="text-emerald-300">conforme</strong> — la quantité
              affichée, les couches FIFO et le journal des mouvements concordent.
            </span>
          ) : (
            <span>
              Résultat : <strong className="text-amber-300">{summary.drifted} écart(s)</strong> —
              {summary.layerDrifted} entre le produit et les couches FIFO, {summary.ledgerDrifted}{" "}
              entre le produit et le journal des mouvements.
            </span>
          )
        ) : null}
      </div>

      {report && report.rows.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">
              Produits dont le stock ne concorde pas entre la fiche, les couches FIFO et le journal.
            </caption>
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.1em] text-slate-400">
                <th scope="col" className="py-1 pr-3 font-bold">
                  Produit
                </th>
                <th scope="col" className="py-1 pr-3 font-bold">
                  Quantité fiche
                </th>
                <th scope="col" className="py-1 pr-3 font-bold">
                  Couches FIFO
                </th>
                <th scope="col" className="py-1 pr-3 font-bold">
                  Journal
                </th>
                <th scope="col" className="py-1 pr-3 font-bold">
                  Écart
                </th>
                <th scope="col" className="py-1 font-bold">
                  Nature
                </th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.productId} className="border-t border-white/10">
                  <td className="py-1 pr-3">{row.name}</td>
                  <td className="py-1 pr-3">{fmtQty(row.productQuantity)}</td>
                  <td className="py-1 pr-3">{fmtQty(row.layerQuantity)}</td>
                  <td className="py-1 pr-3">
                    {row.ledgerQuantity == null ? "—" : fmtQty(row.ledgerQuantity)}
                  </td>
                  <td className="py-1 pr-3">
                    {fmtQty(row.status === "layer-drift" ? row.layerDrift : (row.ledgerDrift ?? 0))}
                  </td>
                  <td className="py-1">
                    {row.status === "layer-drift"
                      ? "Écart couches FIFO"
                      : "Écart journal des mouvements"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Section>
  );
}
