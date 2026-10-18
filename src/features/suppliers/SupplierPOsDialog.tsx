// Veloria PoS — Fournisseurs : bons de commande (P3).
// Cycle draft → ordered → partially_received → received (+ cancelled).
// La réception crée une entrée de stock traçée (même UUID rejoué = replay).
import { useEffect, useRef, useState } from "react";
import { PackagePlus, Printer, Search, Trash2, Truck } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { formatDzd, minorToInput, parseDzdInputStrict } from "@domain/money/money.ts";
import { buildCompanyHead } from "@shared/documents/sale-ticket.ts";
import { strictOrNeg } from "@shared/money/parse.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { useOperationId } from "@shared/ui/use-operation-id.ts";
import { roundQuantity } from "@domain/common/quantity.ts";
import { poStatusLabelFr } from "@domain/suppliers/po-rules.ts";
import {
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  Field,
  Modal,
  TextInput,
} from "@shared/ui/primitives.tsx";

import type { Notify } from "@shared/ui/primitives.tsx";

interface PoRow {
  id: number;
  order_number: string;
  status: string;
  total_minor: number;
  expected_date: string | null;
  created_at: string;
}

interface PoItem {
  id: number;
  product_id: number | null;
  product_name_snapshot: string;
  unit_code: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost_minor: number;
  line_total_minor: number;
}

interface PoDetail {
  order: PoRow;
  items: PoItem[];
}

interface SearchHit {
  id: number;
  name: string;
  selling_price_minor: number;
  purchase_price_minor: number;
  unit_code: string;
}

interface DraftLine {
  key: number;
  productId: number | null;
  name: string;
  unitCode: string;
  qtyText: string;
  costText: string;
}

let lineSeq = 0;

export function SupplierPOsDialog({
  supplierId,
  supplierName,
  onClose,
  onChanged,
  notify,
}: {
  supplierId: number;
  supplierName: string;
  onClose: () => void;
  onChanged: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [rows, setRows] = useState<PoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<PoDetail | null>(null);
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  // P0 load-bearing : clés d'idempotence figées par action (jamais
  // `newOperationId()` inline — chaque retry rejoue la MÊME opération) +
  // garde synchrone anti-double-clic même tick (le state `busy` est async).
  const submitGuard = useRef(false);
  const createOp = useOperationId();
  const orderOp = useOperationId();
  const cancelOp = useOperationId();
  const receiveOp = useOperationId();
  const [recv, setRecv] = useState<Record<number, string>>({});
  const [orderPreview, setOrderPreview] = useState<{
    text80: string;
    payload: Record<string, unknown>;
  } | null>(null);

  // Bon de commande fournisseur : aperçu + impression ticket 58/80mm via les
  // canaux dédiés (`printing.previewPO/printPO`) — jamais A4 (politique
  // opération → format). Payload ticket + références PO (numéro, fournisseur,
  // lignes, totaux cohérents).
  function dateFr(raw: string | null): string {
    const d = new Date(raw ?? Date.now());
    if (Number.isNaN(d.getTime())) return (raw ?? "").slice(0, 10);
    return d.toLocaleString("fr-FR");
  }

  async function previewOrder(): Promise<void> {
    if (!detail || busy) return;
    setBusy(true);
    try {
      // Fiche entreprise fraîche (jamais de bon sans raison sociale).
      let co: Record<string, string> | null = null;
      try {
        const cg = (await api.companyGet()) as {
          company: Record<string, string> | null;
        };
        co = cg.company;
      } catch {
        /* repli "Veloria" du builder */
      }
      let supplierPhone = "";
      let supplierAddress = "";
      try {
        const st = (await api.supplierStatement({ id: supplierId })) as {
          supplier: Record<string, unknown> | null;
        };
        const s = st.supplier ?? {};
        if (typeof s["phone"] === "string") supplierPhone = s["phone"];
        if (typeof s["address"] === "string") supplierAddress = s["address"];
      } catch {
        /* bon sans coordonnées plutôt que pas de bon */
      }
      // Lignes retotalisées (ligne = prix × qté) pour la cohérence exigée
      // par le main ; lignes invalides ignorées.
      const lines: {
        name: string;
        qty: number;
        unit: string;
        unitPriceMinor: number;
        lineTotalMinor: number;
        ref: string;
      }[] = [];
      for (const it of detail.items) {
        const qty = roundQuantity(Number(it.quantity_ordered));
        const unit = Math.round(Number(it.unit_cost_minor));
        if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unit) || unit < 0) continue;
        lines.push({
          name: it.product_name_snapshot,
          qty,
          unit: it.unit_code,
          unitPriceMinor: unit,
          lineTotalMinor: Math.round(unit * qty),
          ref: "",
        });
      }
      if (lines.length === 0) {
        notify("Aucune ligne à imprimer.", "err");
        return;
      }
      const subtotal = lines.reduce((a, l) => a + l.lineTotalMinor, 0);
      const payload: Record<string, unknown> = {
        ...buildCompanyHead(
          co
            ? {
                company_name: co["company_name"],
                phone: co["phone"],
                address: co["address"],
                city: co["city"],
                email: co["email"],
                rc_number: co["rc_number"] ?? co["commercial_register"],
                nif: co["nif"],
                nis: co["nis"],
                article_imposition: co["article_imposition"],
              }
            : null,
        ),
        customerName: "",
        customerPhone: "",
        customerAddress: "",
        customerCode: "",
        invoice: detail.order.order_number,
        date: dateFr(detail.order.created_at),
        lines,
        subtotalMinor: subtotal,
        discountMinor: 0,
        deliveryMinor: 0,
        totalMinor: subtotal,
        paidMinor: 0,
        orderNumber: detail.order.order_number,
        supplierName,
        supplierPhone,
        supplierAddress,
        validityDays: 30,
      };
      const pv = (await api.poPreview(payload)) as { text80: string };
      setOrderPreview({ text80: pv.text80, payload });
    } catch (e) {
      notify(frError(e, "Aperçu indisponible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function printOrder(): Promise<void> {
    if (!orderPreview || busy) return;
    setBusy(true);
    try {
      await api.poPrint(orderPreview.payload);
      notify("Bon de commande envoyé.", "ok");
    } catch (e) {
      notify(frError(e, "Impression impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function refresh(): Promise<void> {
    setLoading(true);
    try {
      const res = (await api.purchaseList({ supplierId, page: 1, pageSize: 50 })) as {
        rows: PoRow[];
      };
      setRows(res.rows);
    } catch (e) {
      notify(frError(e, "Commandes indisponibles."), "err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function searchProducts(): Promise<void> {
    const q = query.trim();
    if (q.length < 2) return;
    try {
      const res = (await api.productSearch({ query: q, page: 1, pageSize: 8 })) as {
        rows: SearchHit[];
      };
      setHits(res.rows);
    } catch {
      setHits([]);
    }
  }

  function addLine(hit: SearchHit | null, freeName = ""): void {
    lineSeq += 1;
    setLines((prev) => [
      ...prev,
      {
        key: lineSeq,
        productId: hit?.id ?? null,
        name: hit?.name ?? freeName,
        unitCode: hit?.unit_code ?? "PIECE",
        qtyText: "1",
        costText:
          hit != null && hit.purchase_price_minor > 0 ? minorToInput(hit.purchase_price_minor) : "",
      },
    ]);
    setHits([]);
    setQuery("");
  }

  async function save(): Promise<void> {
    if (lines.length === 0) {
      notify("Ajoutez au moins une ligne.", "err");
      return;
    }
    const built: {
      productId: number | null;
      productName: string;
      unitCode: string;
      quantityOrdered: number;
      unitCostMinor: number;
    }[] = [];
    for (const l of lines) {
      if (l.name.trim().length < 2) {
        notify("Ligne sans nom de produit.", "err");
        return;
      }
      const qty = Number(l.qtyText.replace(",", ".").trim());
      if (!Number.isFinite(qty) || qty <= 0 || qty > 1_000_000) {
        notify(`Quantité invalide : ${l.name}.`, "err");
        return;
      }
      let cost = 0;
      try {
        cost = parseDzdInputStrict(l.costText.trim() === "" ? "0" : l.costText, "Coût");
      } catch (e) {
        notify(frError(e, `Coût invalide : ${l.name}.`), "err");
        return;
      }
      built.push({
        productId: l.productId,
        productName: l.name.trim(),
        unitCode: l.unitCode,
        quantityOrdered: Math.round(qty * 1000) / 1000,
        unitCostMinor: cost,
      });
    }
    if (submitGuard.current) return;
    submitGuard.current = true;
    setBusy(true);
    try {
      const res = (await api.purchaseCreate({
        operationId: createOp.operationId,
        supplierId,
        expectedDate: expectedDate === "" ? null : expectedDate,
        notes: notes.trim() === "" ? null : notes.trim(),
        lines: built,
      })) as { number: string };
      notify(`Commande ${res.number} créée (brouillon).`, "ok");
      setCreating(false);
      setLines([]);
      setExpectedDate("");
      setNotes("");
      onChanged();
      await refresh();
      createOp.regen();
    } catch (e) {
      notify(frError(e, "Création impossible."), "err");
    } finally {
      submitGuard.current = false;
      setBusy(false);
    }
  }

  async function openDetail(id: number): Promise<void> {
    try {
      const res = (await api.purchaseDetail({ id })) as PoDetail;
      setDetail(res);
      const init: Record<number, string> = {};
      for (const it of res.items) {
        const rest = Math.round((it.quantity_ordered - it.quantity_received) * 1000) / 1000;
        if (rest > 0) init[it.id] = String(rest).replace(".", ",");
      }
      setRecv(init);
    } catch (e) {
      notify(frError(e, "Détail indisponible."), "err");
    }
  }

  async function act(
    id: number,
    kind: "order" | "cancel",
    label: string,
    done: string,
  ): Promise<void> {
    if (submitGuard.current) return;
    submitGuard.current = true;
    setBusy(true);
    try {
      if (kind === "order") {
        await api.purchaseOrder({ id, operationId: orderOp.operationId });
        orderOp.regen();
      } else {
        await api.purchaseCancel({ id, operationId: cancelOp.operationId });
        cancelOp.regen();
      }
      notify(`${label} : ${done}.`, "ok");
      onChanged();
      await refresh();
      setDetail(null);
    } catch (e) {
      notify(frError(e, `${label} impossible.`), "err");
    } finally {
      submitGuard.current = false;
      setBusy(false);
    }
  }

  async function receive(): Promise<void> {
    if (detail == null) return;
    const built: { itemId: number; quantityReceived: number }[] = [];
    for (const it of detail.items) {
      const raw = (recv[it.id] ?? "").trim();
      if (raw === "") continue;
      const q = Number(raw.replace(",", "."));
      if (!Number.isFinite(q) || q <= 0) {
        notify(`Quantité reçue invalide : ${it.product_name_snapshot}.`, "err");
        return;
      }
      built.push({ itemId: it.id, quantityReceived: Math.round(q * 1000) / 1000 });
    }
    if (built.length === 0) {
      notify("Saisissez au moins une quantité reçue.", "err");
      return;
    }
    if (submitGuard.current) return;
    submitGuard.current = true;
    setBusy(true);
    try {
      // P1-5 : strict sur chaque quantité (jamais de float non borné).
      for (const b of built) {
        if (strictOrNeg(String(b.quantityReceived), "Quantité") < 0) {
          notify("Quantité reçue invalide.", "err");
          submitGuard.current = false;
          setBusy(false);
          return;
        }
      }
      const res = (await api.purchaseReceive({
        operationId: receiveOp.operationId,
        id: detail.order.id,
        lines: built,
      })) as { intakeId: number };
      notify(`Réception enregistrée (entrée n°${res.intakeId}).`, "ok");
      onChanged();
      await refresh();
      await openDetail(detail.order.id);
      receiveOp.regen();
    } catch (e) {
      notify(frError(e, "Réception impossible."), "err");
    } finally {
      submitGuard.current = false;
      setBusy(false);
    }
  }

  return (
    <Drawer
      label="Commandes fournisseur"
      title={`Commandes — ${supplierName}`}
      onClose={onClose}
      wide
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => setCreating((v) => !v)}>
            <PackagePlus size={16} aria-hidden="true" /> Nouvelle commande
          </Button>
        </div>
        {creating ? (
          <Card className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Réception prévue">
                <TextInput
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  aria-label="Réception prévue"
                />
              </Field>
              <Field label="Notes">
                <TextInput
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Référence fournisseur…"
                  aria-label="Notes commande"
                />
              </Field>
            </div>
            <Field label="Ajouter un produit (recherche)">
              <div className="flex gap-2">
                <TextInput
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void searchProducts();
                    }
                  }}
                  placeholder="Nom ou code-barres (2 lettres min)…"
                  aria-label="Rechercher un produit"
                />
                <Button type="button" variant="secondary" onClick={() => void searchProducts()}>
                  <Search size={16} aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => addLine(null, query.trim())}
                  title="Ligne hors catalogue (achats)"
                >
                  + Libre
                </Button>
              </div>
            </Field>
            {hits.length > 0 ? (
              <ul className="divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => addLine(h)}
                      className="w-full px-3 py-1.5 text-left text-sm hover:bg-amber-400/10"
                    >
                      {h.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {lines.map((l) => (
              <div key={l.key} className="grid grid-cols-[1fr_90px_110px_32px] items-end gap-2">
                <Field label="Produit">
                  <TextInput
                    value={l.name}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((x) => (x.key === l.key ? { ...x, name: e.target.value } : x)),
                      )
                    }
                    aria-label="Nom produit"
                  />
                </Field>
                <Field label="Quantité">
                  <TextInput
                    value={l.qtyText}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((x) => (x.key === l.key ? { ...x, qtyText: e.target.value } : x)),
                      )
                    }
                    inputMode="decimal"
                    aria-label="Quantité commandée"
                  />
                </Field>
                <Field label="Coût (DZD)">
                  <TextInput
                    value={l.costText}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((x) => (x.key === l.key ? { ...x, costText: e.target.value } : x)),
                      )
                    }
                    inputMode="decimal"
                    aria-label="Coût unitaire"
                  />
                </Field>
                <button
                  type="button"
                  aria-label={`Retirer ${l.name}`}
                  onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/15 hover:text-red-300"
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
            ))}
            <Button onClick={() => void save()} disabled={busy || lines.length === 0}>
              {busy ? "Enregistrement…" : "Créer la commande (brouillon)"}
            </Button>
          </Card>
        ) : null}
        {loading ? (
          <p className="text-sm text-slate-500" role="status">
            Chargement…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Aucune commande"
            hint="Créez la première commande fournisseur."
            glyph="doc"
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-3 py-2">N°</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/[0.06]">
                  <td className="px-3 py-2 font-semibold">{r.order_number}</td>
                  <td className="px-3 py-2">
                    <Badge
                      tone={
                        r.status === "received"
                          ? "green"
                          : r.status === "cancelled"
                            ? "grey"
                            : "amber"
                      }
                    >
                      {poStatusLabelFr(r.status)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatDzd(r.total_minor)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" onClick={() => void openDetail(r.id)}>
                      Voir
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {detail ? (
          <Modal
            label="Détail commande"
            title={`Commande ${detail.order.order_number}`}
            onClose={() => setDetail(null)}
          >
            <div className="space-y-3">
              <p className="text-sm text-slate-300">
                Statut : <strong>{poStatusLabelFr(detail.order.status)}</strong> · Total :{" "}
                <strong className="tabular-nums">{formatDzd(detail.order.total_minor)}</strong>
              </p>
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-2 py-1">Produit</th>
                    <th className="px-2 py-1 text-right">Cmdée</th>
                    <th className="px-2 py-1 text-right">Reçue</th>
                    <th className="px-2 py-1 text-right">Recevoir</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((it) => {
                    const rest =
                      Math.round((it.quantity_ordered - it.quantity_received) * 1000) / 1000;
                    return (
                      <tr key={it.id} className="border-t border-white/[0.06]">
                        <td className="px-2 py-1">{it.product_name_snapshot}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{it.quantity_ordered}</td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {it.quantity_received}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {rest > 0 &&
                          (detail.order.status === "ordered" ||
                            detail.order.status === "partially_received") ? (
                            <TextInput
                              value={recv[it.id] ?? ""}
                              onChange={(e) =>
                                setRecv((prev) => ({ ...prev, [it.id]: e.target.value }))
                              }
                              inputMode="decimal"
                              aria-label={`Quantité à recevoir ${it.product_name_snapshot}`}
                            />
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={busy} onClick={() => void previewOrder()}>
                  <Printer size={16} aria-hidden="true" /> Aperçu bon de commande
                </Button>
                {detail.order.status === "draft" ? (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void act(detail.order.id, "order", "Commande", "passée")}
                  >
                    <Truck size={16} aria-hidden="true" /> Commander
                  </Button>
                ) : null}
                {(detail.order.status === "ordered" ||
                  detail.order.status === "partially_received") && (
                  <Button disabled={busy} onClick={() => void receive()}>
                    {busy ? "Réception…" : "Réceptionner (stock +)"}
                  </Button>
                )}
                {(detail.order.status === "draft" || detail.order.status === "ordered") && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void act(detail.order.id, "cancel", "Annulation", "annulée")}
                  >
                    Annuler
                  </Button>
                )}
              </div>
            </div>
          </Modal>
        ) : null}
        {orderPreview && detail ? (
          <Modal
            label="Bon de commande"
            title={`Bon ${detail.order.order_number}`}
            onClose={() => setOrderPreview(null)}
            wide
          >
            <pre
              className="h-[50vh] overflow-auto rounded-xl border border-white/10 bg-white p-4 font-mono text-[12px] leading-snug text-black"
              aria-label="Aperçu bon de commande 58/80 mm"
            >
              {orderPreview.text80}
            </pre>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => void printOrder()}>
                <Printer size={16} aria-hidden="true" /> Imprimer le bon
              </Button>
            </div>
          </Modal>
        ) : null}
      </div>
    </Drawer>
  );
}
