// Veloria PoS — Clients : en-tête du tiroir détail + actions.
// Extrait de `ClientDialogs.tsx` (découpage sans changement de comportement).
import { Pencil, RotateCcw, Trash2, Wallet } from "lucide-react";
import { formatDzd } from "@domain/money/money.ts";
import { formatDateTimeFr } from "@shared/formatters/format.ts";
import { Badge, Button, Card, InfoRow, cn } from "@shared/ui/primitives.tsx";
import { debtLabel, debtTone, hasDebt, type EnrichedCustomer } from "../types.ts";

/** Badges sous le titre du tiroir (statut dette + téléphone). */
export function ClientDrawerBadges({
  customer,
}: {
  customer: EnrichedCustomer;
}): React.JSX.Element {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <Badge tone={debtTone(customer)}>{debtLabel(customer)}</Badge>
      {customer.phone ? <Badge tone="grey">{customer.phone}</Badge> : null}
    </div>
  );
}

/** En-tête : dette actuelle + fiche d'information client. */
export function ClientDrawerHeader({
  customer,
}: {
  customer: EnrichedCustomer;
}): React.JSX.Element {
  return (
    <>
      <Card
        className={cn(
          "p-4 text-center",
          hasDebt(customer) ? "border-red-400/25" : "border-emerald-400/20",
        )}
      >
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Dette actuelle
        </div>
        <div
          className={cn(
            "mt-1 text-3xl font-extrabold tabular-nums tracking-tight",
            hasDebt(customer) ? "text-red-300" : "text-emerald-300",
          )}
        >
          {formatDzd(customer.outstanding_balance_minor)}
        </div>
        {customer.credit_limit_minor > 0 ? (
          <div className="mt-1 text-xs text-slate-500">
            Plafond : {formatDzd(customer.credit_limit_minor)}
          </div>
        ) : null}
      </Card>

      <Card className="space-y-2.5 p-4 text-sm">
        <InfoRow
          label="Vente à crédit"
          value={customer.credit_allowed === 1 ? "Autorisée" : "Comptant uniquement"}
        />
        <InfoRow
          label="Règlement mensuel"
          value={customer.settlement_day != null ? `Chaque ${customer.settlement_day}` : "—"}
        />
        <InfoRow label="Téléphone" value={customer.phone || "—"} />
        <InfoRow label="Adresse" value={customer.address || "—"} />
        <InfoRow
          label="Achats cumulés"
          value={formatDzd(customer.totalPurchasesMinor)}
          num
          strong
        />
        <InfoRow label="Factures" value={String(customer.invoiceCount)} num />
        <InfoRow
          label="Dernière vente"
          value={customer.lastSaleAt ? formatDateTimeFr(customer.lastSaleAt) : "—"}
        />
        {customer.notes ? <InfoRow label="Notes" value={customer.notes} /> : null}
      </Card>
    </>
  );
}

/** Actions du tiroir : encaisser un paiement, modifier, supprimer/restaurer. */
export function ClientDrawerFooter({
  customer,
  archived,
  busy,
  onEncaisser,
  onEdit,
  onRemove,
  onRestore,
}: {
  customer: EnrichedCustomer;
  archived: boolean;
  busy: boolean;
  onEncaisser: () => void;
  onEdit: (c: EnrichedCustomer) => void;
  onRemove: () => void;
  onRestore: () => void;
}): React.JSX.Element {
  return (
    <>
      {!archived && hasDebt(customer) ? (
        <Button variant="primary" disabled={busy} onClick={onEncaisser} className="w-full">
          <Wallet size={15} aria-hidden="true" /> Encaisser un paiement
        </Button>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          disabled={busy || archived}
          onClick={() => onEdit(customer)}
          title="Modifier le client"
        >
          <Pencil size={15} aria-hidden="true" /> Modifier
        </Button>
        {archived ? (
          <Button variant="secondary" disabled={busy} onClick={onRestore}>
            <RotateCcw size={15} aria-hidden="true" /> Restaurer
          </Button>
        ) : (
          <Button variant="danger" disabled={busy} onClick={onRemove}>
            <Trash2 size={15} aria-hidden="true" /> Supprimer
          </Button>
        )}
      </div>
    </>
  );
}
