// Veloria PoS — Stock : factures fournisseurs (réceptions) + annulation/correction.
// ADR-139 : une réception intacte peut être annulée (stock, couches FIFO, dette
// fournisseur) puis recréée depuis le formulaire prérempli — jamais modifiée en place.
import { useEffect, useState } from "react";

import { api } from "@shared/types/ipc-client.ts";
import { formatDzd } from "@domain/money/money.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { playSound } from "@shared/sound/sound.ts";
import { Badge, Button, Card, Drawer, EmptyState, InfoRow, Pager } from "@shared/ui/primitives.tsx";

import type { Notify } from "@shared/ui/primitives.tsx";
import type { StockIntakeInitial } from "./IntakeDialog.tsx";

interface IntakeRow {
  id: number;
  invoice_number: string | null;
  invoice_date: string | null;
  supplier_name: string | null;
  subtotal_minor: number;
  shipping_cost_minor: number;
  total_minor: number;
  status: string;
  created_at: string;
}

interface IntakeDetailItem {
  id: number;
  product_id: number | null;
  product_name_snapshot: string;
  unit_code: string | null;
  packaging_id: number | null;
  packaging_label_fr: string | null;
  unit_factor: number;
  quantity_received: number;
  quantity_damaged: number;
  quantity_net: number;
  purchase_price_minor: number;
  line_total_minor: number;
}

interface IntakeDetail {
  intake: IntakeRow & { supplier_id: number | null; notes: string | null };
  items: IntakeDetailItem[];
  canCancel: boolean;
  cancelBlockedReason: string | null;
}

function statusLabel(status: string): string {
  if (status === "cancelled") return "Annulée";
  if (status === "draft") return "Brouillon";
  return "Validée";
}

/** Détail serveur → formulaire de réception prérempli (correction). */
function toInitial(detail: IntakeDetail): StockIntakeInitial {
  const intake = detail.intake;
  return {
    supplierId: intake.supplier_id == null ? null : Number(intake.supplier_id),
    supplierName: String(intake.supplier_name ?? ""),
    invoiceNumber: String(intake.invoice_number ?? ""),
    invoiceDate: String(intake.invoice_date ?? intake.created_at).slice(0, 10),
    shippingMinor: Number(intake.shipping_cost_minor),
    notes: String(intake.notes ?? ""),
    lines: detail.items.map((it) => {
      const factor = it.unit_factor > 1 ? it.unit_factor : 1;
      const carton = factor > 1 && it.packaging_id != null;
      return {
        productId: it.product_id,
        productName: it.product_name_snapshot,
        unitCode: it.unit_code ?? "PIECE",
        quantityReceived: Number(it.quantity_received),
        quantityDamaged: Number(it.quantity_damaged),
        // Coût d'achat par unité d'achat hors fret (reconstruit depuis le coût
        // unitaire de base figé à la réception).
        purchasePriceMinor:
          Number(it.quantity_received) > 0
            ? Math.round(
                (Number(it.purchase_price_minor) * Number(it.quantity_net)) /
                  Number(it.quantity_received),
              )
            : Number(it.purchase_price_minor),
        packagingId: it.packaging_id,
        packagingLabel: it.packaging_label_fr,
        packagingFactor: carton ? factor : null,
        purchaseUnit: carton ? "carton" : "piece",
      };
    }),
  };
}

export function StockIntakesDrawer({
  onClose,
  notify,
  onCorrect,
}: {
  onClose: () => void;
  notify: Notify;
  /** Correction : annulation puis ouverture du formulaire prérempli. */
  onCorrect?: (initial: StockIntakeInitial) => void;
}): React.JSX.Element {
  const [rows, setRows] = useState<IntakeRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<IntakeDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirmAsync = useConfirm();

  async function load(p: number): Promise<void> {
    try {
      const res = (await api.stockIntakes({ page: p, pageSize: 20 })) as {
        rows: IntakeRow[];
        total: number;
      };
      setRows(res.rows);
      setTotal(res.total);
      setPage(p);
    } catch {
      setRows([]);
      setTotal(0);
    }
  }

  useEffect(() => {
    void load(1);
  }, []);

  async function openDetail(id: number): Promise<void> {
    if (detailBusy) return;
    setDetailBusy(true);
    try {
      const d = (await api.stockIntakeDetail({ id })) as IntakeDetail;
      setDetail(d);
    } catch (e) {
      notify(frError(e, "Détail de la facture indisponible."), "err");
    } finally {
      setDetailBusy(false);
    }
  }

  async function cancelIntake(): Promise<void> {
    if (detail == null || busy) return;
    const ref = detail.intake.invoice_number ?? `#${detail.intake.id}`;
    if (
      !(await confirmAsync(
        `Annuler la facture fournisseur ${ref} ? Stock, couches FIFO et dette fournisseur seront restaurés.`,
      ))
    )
      return;
    setBusy(true);
    try {
      await api.stockIntakeCancel({
        id: detail.intake.id,
        operationId: newOperationId(),
      });
      playSound("success");
      notify(`Facture ${ref} annulée : stock et dette fournisseur restaurés.`, "ok");
      setDetail(null);
      await load(page);
    } catch (e) {
      notify(frError(e, "Annulation impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function correctIntake(): Promise<void> {
    if (detail == null || busy || onCorrect == null) return;
    const ref = detail.intake.invoice_number ?? `#${detail.intake.id}`;
    if (
      !(await confirmAsync(
        `Corriger la facture ${ref} ? Elle sera annulée, puis une nouvelle réception s'ouvrira avec ses valeurs d'origine.`,
      ))
    )
      return;
    setBusy(true);
    try {
      await api.stockIntakeCancel({
        id: detail.intake.id,
        operationId: newOperationId(),
      });
      const initial = toInitial(detail);
      notify(`Facture ${ref} annulée : vérifiez la nouvelle réception préremplie.`, "ok");
      setDetail(null);
      await load(page);
      onClose();
      onCorrect(initial);
    } catch (e) {
      notify(frError(e, "Correction impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  if (detail != null) {
    const intake = detail.intake;
    const committed = intake.status === "committed";
    return (
      <Drawer
        label="Facture fournisseur"
        title={`Facture ${intake.invoice_number ?? `#${intake.id}`}`}
        sub={intake.supplier_name ?? "Sans fournisseur"}
        onClose={() => setDetail(null)}
        wide
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={committed ? "green" : intake.status === "cancelled" ? "red" : "grey"}>
              {statusLabel(intake.status)}
            </Badge>
            <span className="text-xs text-slate-500">
              {String(intake.invoice_date ?? intake.created_at).slice(0, 10)}
            </span>
          </div>
          <Card className="space-y-2 p-4 text-sm">
            <InfoRow label="Sous-total" value={formatDzd(Number(intake.subtotal_minor))} num />
            <InfoRow label="Livraison" value={formatDzd(Number(intake.shipping_cost_minor))} num />
            <InfoRow label="Total" value={formatDzd(Number(intake.total_minor))} num />
            {intake.notes ? <InfoRow label="Notes" value={intake.notes} /> : null}
          </Card>
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-2 py-2">Produit</th>
                <th className="px-2 py-2 text-right">Reçue</th>
                <th className="px-2 py-2 text-right">Abîmée</th>
                <th className="px-2 py-2 text-right">Net</th>
                <th className="px-2 py-2 text-right">Ligne</th>
              </tr>
            </thead>
            <tbody>
              {detail.items.map((it) => (
                <tr key={it.id} className="border-t border-white/[0.06]">
                  <td className="max-w-[190px] truncate px-2 py-2 font-semibold">
                    {it.product_name_snapshot}
                    {it.packaging_label_fr ? (
                      <span className="block text-[11px] font-normal text-emerald-300/80">
                        {it.packaging_label_fr} × {it.unit_factor}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{it.quantity_received}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-400">
                    {it.quantity_damaged}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{it.quantity_net}</td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums text-amber-200">
                    {formatDzd(it.line_total_minor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {committed && !detail.canCancel && detail.cancelBlockedReason ? (
            <p className="rounded-xl border border-amber-400/25 bg-amber-400/[0.08] px-3 py-2 text-xs font-semibold text-amber-200">
              {detail.cancelBlockedReason}
            </p>
          ) : null}
          {committed && detail.canCancel ? (
            <div className="flex flex-wrap gap-2">
              {onCorrect ? (
                <Button onClick={() => void correctIntake()} disabled={busy} className="flex-1">
                  {busy ? "Correction…" : "Corriger (annuler et recréer)"}
                </Button>
              ) : null}
              <Button
                variant="secondary"
                onClick={() => void cancelIntake()}
                disabled={busy}
                className="flex-1"
              >
                {busy ? "Annulation…" : "Annuler la facture"}
              </Button>
            </div>
          ) : null}
          <Button variant="secondary" onClick={() => setDetail(null)} className="w-full">
            Retour à la liste
          </Button>
        </div>
      </Drawer>
    );
  }

  return (
    <Drawer
      label="Réceptions"
      title="Factures fournisseurs"
      sub={`${total} réception(s)`}
      onClose={onClose}
      wide
    >
      {rows.length === 0 ? (
        <EmptyState title="Aucune réception" hint="Validez votre première réception fournisseur." />
      ) : (
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#122131] text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Facture</th>
              <th className="px-3 py-2.5">Fournisseur</th>
              <th className="px-3 py-2.5">Statut</th>
              <th className="px-3 py-2.5 text-right">Sous-total</th>
              <th className="px-3 py-2.5 text-right">Livraison</th>
              <th className="px-3 py-2.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`cursor-pointer border-t border-white/[0.06] transition-colors hover:bg-amber-400/[0.06] ${r.status === "cancelled" ? "opacity-60" : ""}`}
                onClick={() => void openDetail(r.id)}
              >
                <td className="px-3 py-2 font-mono text-xs">
                  {r.invoice_number ?? `#${r.id}`}
                  <span className="block text-[11px] text-slate-500">
                    {String(r.invoice_date ?? r.created_at).slice(0, 10)}
                  </span>
                </td>
                <td className="max-w-[180px] truncate px-3 py-2">{r.supplier_name ?? "—"}</td>
                <td className="px-3 py-2">
                  <Badge tone={r.status === "cancelled" ? "red" : "green"}>
                    {statusLabel(r.status)}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                  {formatDzd(r.subtotal_minor)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                  {formatDzd(r.shipping_cost_minor)}
                </td>
                <td className="px-3 py-2 text-right font-bold tabular-nums text-amber-200">
                  {formatDzd(r.total_minor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pager page={page} pageSize={20} total={total} onPage={(p) => void load(p)} />
    </Drawer>
  );
}
