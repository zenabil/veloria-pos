// Veloria PoS — Caisse : panneau client (extrait de SellScreen, JSX pur).
import { HandCoins, User, X } from "lucide-react";
import { formatDzd } from "@domain/money/money.ts";
import { Badge, Card, Field, TextInput } from "@shared/ui/primitives.tsx";
import type { RefObject } from "react";
import type { CustomerRow } from "./sell-types.ts";

export function SellCustomerPanel({
  customerQuery,
  onSearchCustomers,
  customerId,
  customerLabel,
  creditUnknown,
  customerCredit,
  customerBalance,
  onOpenDetails,
  onOpenSettle,
  onSelectPassage,
  customerResults,
  onSelectCustomer,
  customerRef,
}: {
  customerQuery: string;
  onSearchCustomers: (q: string) => void;
  customerId: number | null;
  customerLabel: string;
  creditUnknown: boolean;
  customerCredit: boolean | null;
  customerBalance: number | null;
  onOpenDetails: () => void;
  onOpenSettle: () => void;
  onSelectPassage: () => void;
  customerResults: CustomerRow[];
  onSelectCustomer: (c: CustomerRow) => void;
  customerRef: RefObject<HTMLInputElement | null>;
}): React.JSX.Element {
  return (
    <Card className="p-4">
      <Field label="Client">
        <div className="relative">
          <User
            size={17}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <TextInput
            value={customerQuery}
            onChange={(e) => onSearchCustomers(e.target.value)}
            placeholder="Rechercher un client… (min. 2 lettres)"
            aria-label="Rechercher un client"
            title="Rechercher un client [F5]"
            ref={customerRef}
            className="pl-10"
          />
        </div>
      </Field>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {customerId == null ? (
          <Badge tone="grey">{customerLabel}</Badge>
        ) : (
          <button
            type="button"
            onClick={onOpenDetails}
            title="Ouvrir la fiche client (factures, aperçu, impression)"
            aria-label={`Ouvrir la fiche de ${customerLabel}`}
            className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-400/20"
          >
            {customerLabel} · Fiche
          </button>
        )}
        {customerId != null ? (
          creditUnknown ? (
            <Badge tone="grey">Solde indisponible</Badge>
          ) : (
            <Badge tone={customerCredit === true ? "green" : "grey"}>
              {customerCredit === true ? "Crédit autorisé" : "Comptant uniquement"}
            </Badge>
          )
        ) : null}
        {customerBalance != null ? (
          <span className="text-xs tabular-nums text-slate-400">
            Solde : {formatDzd(customerBalance)}
          </span>
        ) : null}
        {customerId != null && (customerBalance ?? 0) > 0 ? (
          <button
            type="button"
            onClick={onOpenSettle}
            title="Régler la dette du client"
            className="inline-flex items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-400/20"
          >
            <HandCoins size={13} aria-hidden="true" /> Régler
          </button>
        ) : null}
        {customerId != null ? (
          <button
            type="button"
            onClick={onSelectPassage}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white"
          >
            <X size={13} aria-hidden="true" /> Passage
          </button>
        ) : null}
      </div>
      {customerResults.length > 0 ? (
        <ul className="mt-2 max-h-32 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10">
          {customerResults.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelectCustomer(c)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-amber-400/10"
              >
                <span className="truncate font-semibold">
                  {c.first_name} {c.last_name}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge tone={c.credit_allowed === 1 ? "green" : "grey"}>
                    {c.credit_allowed === 1 ? "Crédit" : "Comptant"}
                  </Badge>
                  <span className="text-xs tabular-nums text-slate-400">
                    {formatDzd(c.outstanding_balance_minor)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
