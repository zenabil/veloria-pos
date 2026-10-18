// Veloria PoS — Shared: modale de reçu de règlement de dette.
// Après encaissement (client / fournisseur) : aperçu 80mm + A4,
// impression 80mm/A4 + export PDF via les canaux dédiés. Rendu main uniquement.
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
  htmlA4: string;
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
  const [format, setFormat] = useState<"80mm" | "A4">("80mm");
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
        const pv = (await api.paymentPreview(payload)) as { text80: string; htmlA4: string };
        if (!cancelled) setDoc({ payload, text80: pv.text80, htmlA4: pv.htmlA4 });
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

  async function printDoc(mode: "80mm" | "A4"): Promise<void> {
    if (!doc || busy) return;
    setBusy(true);
    try {
      await api.paymentPrint(mode === "A4" ? { ...doc.payload, format: "A4" } : doc.payload);
      notify(mode === "A4" ? "Reçu A4 envoyé." : "Ticket envoyé.", "ok");
    } catch (e) {
      notify(frError(e, "Impression impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf(mode: "80mm" | "A4"): Promise<void> {
    if (!doc || busy) return;
    setBusy(true);
    try {
      const res = (await api.paymentExportPdf(
        mode === "A4" ? { ...doc.payload, format: "A4" } : doc.payload,
      )) as { path: string };
      notify(`PDF enregistré : ${res.path}`, "ok");
    } catch (e) {
      notify(frError(e, "Export PDF impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label="Reçu de règlement" title="Reçu de règlement" onClose={onClose} wide>
      <div className="mb-3 flex gap-1.5" role="tablist" aria-label="Format du reçu">
        {(["80mm", "A4"] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={format === f}
            onClick={() => setFormat(f)}
            className={
              format === f
                ? "rounded-lg bg-amber-400 px-4 py-1.5 text-xs font-bold text-black"
                : "rounded-lg border border-white/10 px-4 py-1.5 text-xs font-bold text-slate-400 hover:text-white"
            }
          >
            {f === "A4" ? "Reçu A4" : "Ticket 80mm"}
          </button>
        ))}
      </div>
      {loading || !doc ? (
        <p className="py-10 text-center text-sm text-slate-500" role="status">
          Chargement…
        </p>
      ) : format === "A4" ? (
        <iframe
          sandbox=""
          srcDoc={doc.htmlA4}
          title={`Reçu ${ticket.reference || ticket.partyLabel}`}
          className="h-[50vh] w-full rounded-xl border border-white/10 bg-white"
        />
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
          <Button variant="secondary" disabled={busy} onClick={() => void printDoc("80mm")}>
            <Printer size={15} aria-hidden="true" /> Imprimer 80mm
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void printDoc("A4")}>
            <Printer size={15} aria-hidden="true" /> Imprimer A4
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void exportPdf("80mm")}>
            <FileDown size={15} aria-hidden="true" /> PDF 80mm
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void exportPdf("A4")}>
            <FileDown size={15} aria-hidden="true" /> PDF A4
          </Button>
        </div>
      ) : null}
    </Modal>
  );
}
