// Veloria PoS — Écran « Commandes » (ADR-182, tranche C).
//
// Le commerçant enregistre la commande reçue (WhatsApp ou application), la
// fait préparer, puis l'ENCAISSE : la vente lie la commande dans sa propre
// transaction (migration 0063). Aucun montant n'est inventé ici : les prix
// affichés sont RELUS par le main, la vente porte le vrai montant.
//
// French intégral (règle 6). Ergonomie caissier : chaque action est un
// bouton explicite, l'annulation demande un motif, et l'encaissement ouvre
// la caisse avec le panier déjà rempli (le caissier valide les prix au
// comptoir).
import { useCallback, useEffect, useState } from "react";

import { api } from "@shared/types/ipc-client.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { formatDzd } from "@domain/money/money.ts";
import {
  ORDER_STATUSES,
  canTransitionOrder,
  orderStatusLabelFr,
  type OrderStatus,
} from "@domain/order/client-order.ts";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Modal,
  PageHeader,
  SearchField,
  Select,
  TextInput,
} from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { useCartsStore } from "@features/sales/cart-store.ts";
import type { Notify } from "@shared/ui/primitives.tsx";
type ModuleId = "sell";

interface OrderLineView {
  id: number;
  productId: number | null;
  productName: string;
  unitCode: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  reservedQuantity: number;
  /** Prix de vente AUJOURD'HUI (relu par le main) — null = produit supprimé. */
  currentPriceMinor: number | null;
  /** Coût d'achat du jour (jamais publié à l'APK) — pour le snapshot de vente. */
  currentPurchasePriceMinor: number | null;
}

interface OrderView {
  id: number;
  reference: string;
  customerId: number;
  customerName: string;
  status: OrderStatus;
  totalMinor: number;
  source: "manual" | "app" | "auto";
  note: string | null;
  cancelReason: string | null;
  saleId: number | null;
  createdAt: string;
  updatedAt: string;
  lines: OrderLineView[];
}

type BadgeTone = "grey" | "amber" | "green" | "red" | "blue";

const STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  nouvelle: "amber",
  preparing: "blue",
  ready: "green",
  served: "grey",
  cancelled: "red",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export function OrdersScreen({
  notify,
  onNavigate,
}: {
  notify: Notify;
  onNavigate?: (module: ModuleId) => void;
}): React.JSX.Element {
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [detail, setDetail] = useState<OrderView | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const list = (await api.ordersList({
        status: filter === "all" ? null : filter,
        limit: 200,
      })) as OrderView[] | null;
      setOrders(Array.isArray(list) ? list : []);
      setLoadError("");
    } catch (e) {
      setLoadError(frError(e, "Commandes indisponibles."));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function changeStatus(
    order: OrderView,
    status: "preparing" | "ready" | "cancelled",
    cancelReason?: string,
  ): Promise<void> {
    if (!canTransitionOrder(order.status, status)) {
      notify("Transition impossible pour cette commande.", "err");
      return;
    }
    setBusy(true);
    try {
      await api.ordersSetStatus({
        operationId: newOperationId(),
        orderId: order.id,
        status,
        cancelReason: cancelReason ?? null,
      });
      notify(
        status === "cancelled"
          ? `Commande ${order.reference} annulée.`
          : `Commande ${order.reference} : ${orderStatusLabelFr(status)}.`,
        "ok",
      );
      setDetail(null);
      await reload();
    } catch (e) {
      notify(frError(e, "Changement d'état impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  /** Ouvre la caisse avec le panier rempli par la commande (le caissier
   *  valide les prix et encaisse : la vente lie la commande). */
  function openCheckout(order: OrderView): void {
    const openTabWith = useCartsStore.getState().openTabWith;
    const lines = order.lines
      .filter((l) => l.productId != null)
      .map((l) => ({
        productId: l.productId,
        productName: l.productName,
        unitCode: l.unitCode,
        // Prix DU JOUR (relu par le main) : la commande garde le prix estimé,
        // la vente applique le prix en vigueur.
        originalUnitPriceMinor: l.currentPriceMinor ?? l.unitPriceMinor,
        unitPriceMinor: l.currentPriceMinor ?? l.unitPriceMinor,
        // Coût d'achat du jour : il alimente le snapshot de la ligne de vente
        // (audit « vendu sous le coût »), jamais un 0 inventé.
        purchasePriceMinor: l.currentPurchasePriceMinor ?? 0,
        quantity: l.quantity,
        billedTotalMinor: null,
        packagingId: null,
        unitFactor: 1,
      }));
    if (lines.length === 0) {
      notify("Aucun produit encodable dans cette commande.", "err");
      return;
    }
    const opened = openTabWith({
      name: order.reference,
      lines,
      customerId: order.customerId,
      customerLabel: order.customerName,
      deliveryFeeMinor: 0,
      clientOrderId: order.id,
    });
    if (!opened) {
      notify("Impossible d'ouvrir un nouveau panier (limite atteinte).", "err");
      return;
    }
    notify(`Commande ${order.reference} ouverte en caisse : validez et encaissez.`, "ok");
    onNavigate?.("sell");
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        module="Commandes clients"
        title="Commandes"
        period="Réservations clients : enregistrez la commande reçue, préparez-la, puis encaissez-la au comptoir (la vente lie la commande)."
        actions={
          <>
            <Select
              value={filter}
              aria-label="Filtrer les commandes"
              onChange={(e) => setFilter(e.target.value as OrderStatus | "all")}
              className="min-w-[180px]"
            >
              <option value="all">Toutes les commandes</option>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {orderStatusLabelFr(s)}
                </option>
              ))}
            </Select>
            <Button onClick={() => setCreating(true)}>+ Nouvelle commande</Button>
          </>
        }
      />

      {loadError ? <ErrorState message={loadError} onRetry={() => void reload()} /> : null}

      {loading ? (
        <Card className="p-6 text-sm text-slate-400">Chargement des commandes…</Card>
      ) : orders.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            title="Aucune commande"
            hint="Enregistrez une commande reçue par WhatsApp ou depuis l'application client."
          />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {orders.map((order) => (
            <Card key={order.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-bold text-slate-100">{order.reference}</p>
                  <p className="truncate text-sm text-slate-300">{order.customerName}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatWhen(order.createdAt)} · {order.lines.length} ligne(s)
                    {order.note ? ` · ${order.note}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={STATUS_TONES[order.status]}>
                    {orderStatusLabelFr(order.status)}
                  </Badge>
                  <span className="font-mono text-sm font-bold text-amber-300">
                    {formatDzd(order.totalMinor)}
                  </span>
                </div>
              </div>
              {order.cancelReason ? (
                <p className="mt-2 text-xs text-red-300">Motif : {order.cancelReason}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setDetail(order)}>
                  Détail
                </Button>
                {order.status !== "served" && order.status !== "cancelled" ? (
                  <Button variant="secondary" onClick={() => openCheckout(order)}>
                    Encaisser
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      {detail ? (
        <OrderDetailModal
          order={detail}
          busy={busy}
          onClose={() => setDetail(null)}
          onStatus={changeStatus}
          onCheckout={openCheckout}
        />
      ) : null}

      {creating ? (
        <CreateOrderModal
          busy={busy}
          onClose={() => setCreating(false)}
          onCreated={async (reference) => {
            setCreating(false);
            notify(`Commande ${reference} enregistrée.`, "ok");
            await reload();
          }}
          notify={notify}
        />
      ) : null}
    </div>
  );
}

function OrderDetailModal({
  order,
  busy,
  onClose,
  onStatus,
  onCheckout,
}: {
  order: OrderView;
  busy: boolean;
  onClose: () => void;
  onStatus: (
    order: OrderView,
    status: "preparing" | "ready" | "cancelled",
    cancelReason?: string,
  ) => Promise<void>;
  onCheckout: (order: OrderView) => void;
}): React.JSX.Element {
  const [reason, setReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  return (
    <Modal label={`Commande ${order.reference}`} title={order.reference} onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONES[order.status]}>{orderStatusLabelFr(order.status)}</Badge>
          <span className="text-sm text-slate-300">{order.customerName}</span>
          <span className="font-mono text-sm font-bold text-amber-300">
            {formatDzd(order.totalMinor)}
          </span>
        </div>
        {order.note ? <p className="text-sm text-slate-400">Retrait : {order.note}</p> : null}
        <div className="rounded-xl border border-white/10">
          {order.lines.map((l) => {
            const changed = l.currentPriceMinor != null && l.currentPriceMinor !== l.unitPriceMinor;
            return (
              <div
                key={l.id}
                className="flex items-center justify-between gap-3 border-b border-white/5 px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-200">{l.productName}</p>
                  <p className="text-xs text-slate-500">
                    {l.quantity} × {formatDzd(l.currentPriceMinor ?? l.unitPriceMinor)}
                    {changed ? " (prix modifié depuis la commande)" : ""}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm text-slate-200">
                  {formatDzd(l.lineTotalMinor)}
                </span>
              </div>
            );
          })}
        </div>
        {showCancel ? (
          <Field label="Motif de l'annulation" hint="Le client doit pouvoir comprendre la raison.">
            <TextInput
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Stock épuisé, produit retiré, client absent…"
              aria-label="Motif de l'annulation"
            />
          </Field>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Fermer
          </Button>
          {canTransitionOrder(order.status, "preparing") ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void onStatus(order, "preparing")}
            >
              Passer en préparation
            </Button>
          ) : null}
          {canTransitionOrder(order.status, "ready") ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void onStatus(order, "ready")}
            >
              Marquer prête
            </Button>
          ) : null}
          {canTransitionOrder(order.status, "cancelled") ? (
            showCancel ? (
              <Button
                variant="danger"
                disabled={busy || reason.trim() === ""}
                onClick={() => void onStatus(order, "cancelled", reason.trim())}
              >
                Confirmer l'annulation
              </Button>
            ) : (
              <Button variant="danger" onClick={() => setShowCancel(true)}>
                Annuler la commande
              </Button>
            )
          ) : null}
          {order.status !== "served" && order.status !== "cancelled" ? (
            <Button disabled={busy} onClick={() => onCheckout(order)}>
              Encaisser au comptoir
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

interface ProductRow {
  id: number;
  name: string;
  sellingPriceMinor: number;
  unitCode: string;
}

interface CustomerRow {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
}

function CreateOrderModal({
  busy,
  onClose,
  onCreated,
  notify,
}: {
  busy: boolean;
  onClose: () => void;
  onCreated: (reference: string) => Promise<void>;
  notify: Notify;
}): React.JSX.Element {
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerLabel, setCustomerLabel] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [lines, setLines] = useState<{ product: ProductRow; quantity: number }[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      void (async () => {
        try {
          const res = (await api.customerSearch({
            query: customerQuery,
            page: 1,
            pageSize: 10,
          })) as {
            rows: { id: number; first_name: string; last_name: string; phone: string | null }[];
          };
          setCustomers(
            res.rows.map((c) => ({
              id: c.id,
              firstName: c.first_name,
              lastName: c.last_name,
              phone: c.phone,
            })),
          );
        } catch {
          setCustomers([]);
        }
      })();
    }, 250);
    return () => clearTimeout(id);
  }, [customerQuery]);

  useEffect(() => {
    const id = setTimeout(() => {
      void (async () => {
        try {
          const res = (await api.productSearch({
            query: productQuery,
            page: 1,
            pageSize: 10,
          })) as {
            rows: { id: number; name: string; selling_price_minor: number; unit_code: string }[];
          };
          setProducts(
            res.rows.map((p) => ({
              id: p.id,
              name: p.name,
              sellingPriceMinor: p.selling_price_minor,
              unitCode: p.unit_code,
            })),
          );
        } catch {
          setProducts([]);
        }
      })();
    }, 250);
    return () => clearTimeout(id);
  }, [productQuery]);

  async function save(): Promise<void> {
    if (customerId == null) {
      notify("Choisissez le client de la commande.", "err");
      return;
    }
    if (lines.length === 0) {
      notify("Ajoutez au moins un produit.", "err");
      return;
    }
    setSaving(true);
    try {
      const result = (await api.ordersCreate({
        operationId: newOperationId(),
        customerId,
        lines: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        note: note.trim() === "" ? null : note.trim(),
        source: "manual",
      })) as { reference?: string } | null;
      await onCreated(result?.reference ?? "");
    } catch (e) {
      notify(frError(e, "Commande impossible à enregistrer."), "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal label="Nouvelle commande" title="Nouvelle commande" onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <Field label="Client" hint="La commande est rattachée à une fiche client (dette et suivi).">
          <SearchField
            value={customerQuery}
            onChange={(v) => setCustomerQuery(v)}
            placeholder="Nom ou téléphone…"
            ariaLabel="Rechercher un client"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {customers.map((c) => (
              <Button
                key={c.id}
                variant={customerId === c.id ? "primary" : "secondary"}
                onClick={() => {
                  setCustomerId(c.id);
                  setCustomerLabel(`${c.firstName} ${c.lastName}`.trim());
                }}
              >
                {`${c.firstName} ${c.lastName}`.trim()}
                {c.phone ? ` (${c.phone})` : ""}
              </Button>
            ))}
          </div>
          {customerId != null ? (
            <p className="mt-1 text-xs text-amber-300">Client retenu : {customerLabel}</p>
          ) : null}
        </Field>

        <Field label="Produits" hint="Le prix est relu par le programme à l'enregistrement.">
          <SearchField
            value={productQuery}
            onChange={(v) => setProductQuery(v)}
            placeholder="Nom du produit…"
            ariaLabel="Rechercher un produit"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {products.map((p) => (
              <Button
                key={p.id}
                variant="secondary"
                onClick={() =>
                  setLines((current) => {
                    const found = current.find((l) => l.product.id === p.id);
                    if (found) {
                      return current.map((l) =>
                        l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l,
                      );
                    }
                    return [...current, { product: p, quantity: 1 }];
                  })
                }
              >
                {`${p.name} · ${formatDzd(p.sellingPriceMinor)}`}
              </Button>
            ))}
          </div>
        </Field>

        {lines.length > 0 ? (
          <div className="rounded-xl border border-white/10">
            {lines.map((l) => (
              <div
                key={l.product.id}
                className="flex items-center justify-between gap-3 border-b border-white/5 px-3 py-2 last:border-b-0"
              >
                <span className="truncate text-sm text-slate-200">{l.product.name}</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-sm text-slate-300">{l.quantity}</span>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setLines((current) =>
                        current
                          .map((x) =>
                            x.product.id === l.product.id ? { ...x, quantity: x.quantity - 1 } : x,
                          )
                          .filter((x) => x.quantity > 0),
                      )
                    }
                  >
                    −
                  </Button>
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <Field label="Préférence de retrait" hint="Reprise telle quelle de la commande du client.">
          <TextInput
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Après 16 h"
            aria-label="Préférence de retrait"
          />
        </Field>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={busy || saving} onClick={() => void save()}>
            Enregistrer la commande
          </Button>
        </div>
      </div>
    </Modal>
  );
}
