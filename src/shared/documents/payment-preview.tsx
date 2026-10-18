// Veloria PoS — Shared: modale de reçu de règlement de dette.
// Après encaissement (client / fournisseur) : aperçu ticket 58/80mm,
// impression + export PDF via les canaux dédiés. Rendu main uniquement.
// Politique opération → format : un règlement ne sort JAMAIS en A4.
import { useEffect, useState } from "react";
import { FileDown, Printer } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { Button, Modal } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

import type { Notify } from "@shared/ui/primitives.tsx";

export interface PaymentTicketInput {
  kind: "customer" | "supplier";
  partyLabel: string;
  reference: string;
  date: string;
  amountMinor: number;
  method: "cash" | "cheque" | "transfer" | null;
  prevBalanceMinor: number;
  newBalanceMinor: number;
  notes: string;
}

interface LoadedTicket {
  payload: Record<string, unknown>;
  text80: string;
}

export function PaymentTicketModal({
  ticket,
  onClose,
  notify,
}: {
  ticket: PaymentTicketInput;
  onClose: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [doc, setDoc] = useState<LoadedTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      setLoading(true);
      try {
        let co: Record<string, string> | null = null;
        try {
          const cg = (await api.companyGet()) as {
            company: Record<string, string> | null;
          };
          co = cg.company;
        } catch {
          /* repli "Veloria" côté main */
        }
        const payload: Record<string, unknown> = {
          company: co?.["company_name"] ?? "Veloria",
          companyPhone: co?.["phone"] ?? "",
          companyAddress: co?.["address"] ?? "",
          companyCity: co?.["city"] ?? "",
          companyEmail: co?.["email"] ?? "",
          companyRc: co?.["rc_number"] ?? "",
          companyNif: co?.["nif"] ?? "",
          partyLabel: ticket.partyLabel,
          kind: ticket.kind,
          reference: ticket.reference,
          date: ticket.date,
          amountMinor: ticket.amountMinor,
          paymentMethod: ticket.method,
          prevBalanceMinor: ticket.prevBalanceMinor,
          newBalanceMinor: ticket.newBalanceMinor,
          notes: ticket.notes,
        };
        const pv = (await api.paymentPreview(payload)) as { text80: string };
        if (!cancelled) setDoc({ payload, text80: pv.text80 });
      } catch (e) {
        if (!cancelled) {
          notify(frError(e, "Aperçu du reçu impossible."), "err");
          onClose();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ticket]);

  async function printDoc(): Promise<void> {
    if (!doc || busy) return;
    setBusy(true);
    try {
      await api.paymentPrint(doc.payload);
      notify("Ticket envoyé.", "ok");
    } catch (e) {
      notify(frError(e, "Impression impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf(): Promise<void> {
    if (!doc || busy) return;
    setBusy(true);
    try {
      const res = (await api.paymentExportPdf(doc.payload)) as { path: string };
      notify(`PDF enregistré : ${res.path}`, "ok");
    } catch (e) {
      notify(frError(e, "Export PDF impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label="Reçu de règlement" title="Reçu de règlement" onClose={onClose} wide>
      {loading || !doc ? (
        <p className="py-10 text-center text-sm text-slate-500" role="status">
          Chargement…
        </p>
      ) : (
        <pre
          className="h-[50vh] overflow-auto rounded-xl border border-white/10 bg-white p-4 font-mono text-[12px] leading-snug text-black"
          aria-label={`Reçu ticket ${ticket.reference || ticket.partyLabel}`}
        >
          {doc.text80}
        </pre>
      )}
      {doc ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => void printDoc()}>
            <Printer size={15} aria-hidden="true" /> Imprimer le ticket
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void exportPdf()}>
            <FileDown size={15} aria-hidden="true" /> PDF ticket
          </Button>
        </div>
      ) : null}
    </Modal>
  );
}
