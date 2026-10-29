// Veloria PoS — Retours : tiroir détail + création (client/fournisseur) + remboursement.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useState } from "react";
import { Truck, Undo2 } from "lucide-react";

import { Modal, cn } from "@shared/ui/primitives.tsx";
import { type ReturnKind } from "../types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";

import { CustomerReturnDialog } from "./NewCustomerReturnDialog.tsx";
import { SupplierReturnDialog } from "./NewSupplierReturnDialog.tsx";

// ---------------------------------------------------------------------------
// Nouveau retour : aiguillage client / fournisseur.
// ---------------------------------------------------------------------------

export function NewReturnDialog({
  onClose,
  onSaved,
  notify,
}: {
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [kind, setKind] = useState<ReturnKind>("customer");
  const choices = [
    {
      kind: "customer" as const,
      label: "Retour client",
      hint: "Avoir ou remboursement depuis une facture",
      icon: Undo2,
    },
    {
      kind: "supplier" as const,
      label: "Retour fournisseur",
      hint: "Marchandise renvoyée, dette fournisseur réduite",
      icon: Truck,
    },
  ];
  return (
    <Modal
      label="Nouveau retour"
      title={
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fbbf24]/10 text-[#fbbf24] ring-1 ring-[#fbbf24]/20"
          >
            <Undo2 size={16} />
          </span>
          <span>Nouveau retour</span>
        </span>
      }
      onClose={onClose}
      extraWide
    >
      <div className="space-y-4">
        <div role="group" aria-label="Type de retour" className="grid gap-2 sm:grid-cols-2">
          {choices.map((c) => {
            const Icon = c.icon;
            const active = kind === c.kind;
            return (
              <button
                key={c.kind}
                type="button"
                aria-pressed={active}
                onClick={() => setKind(c.kind)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                  active
                    ? "border-[#fbbf24]/30 bg-[#fbbf24]/[0.08]"
                    : "border-white/10 bg-black/25 hover:border-white/20",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1",
                    active
                      ? "bg-[#fbbf24]/15 text-[#fbbf24] ring-[#fbbf24]/25"
                      : "bg-white/[0.04] text-slate-400 ring-white/10",
                  )}
                >
                  <Icon size={16} />
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block text-sm font-bold",
                      active ? "text-amber-100" : "text-slate-200",
                    )}
                  >
                    {c.label}
                  </span>
                  <span className="block text-[11px] leading-snug text-slate-500">{c.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        {kind === "customer" ? (
          <CustomerReturnDialog onClose={onClose} onSaved={onSaved} notify={notify} />
        ) : (
          <SupplierReturnDialog onClose={onClose} onSaved={onSaved} notify={notify} />
        )}
      </div>
    </Modal>
  );
}
