// Veloria PoS — Shared: modale d'aperçu vente (ticket 58/80mm uniquement).
// Source unique utilisée par l'historique, la fiche client et les dettes :
// charge la vente (`sales.get`), construit le payload canonique
// (`buildSaleTicketPayload`), demande l'aperçu main (`printing.preview`),
// puis imprime ou exporte le PDF ticket via les canaux dédiés.
// Politique opération → format : une vente ne sort JAMAIS en A4.
// Renderer = affichage seul ; tout rendu/validation côté main.
import { useEffect, useState } from "react";
import { FileDown, Printer } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { buildSaleTicketPayload } from "@shared/documents/sale-ticket.ts";
import { Button, Modal } from "@shared/ui/primitives.tsx";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

interface LoadedPreview {
  payload: Record<string, unknown>;
  text80: string;
  invoice: string;
}

export function InvoicePreviewModal({
  saleId,
  title,
  onClose,
  notify,
}: {
  saleId: number;
  title: string;
  onClose: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [doc, setDoc] = useState<LoadedPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      setLoading(true);
      try {
        const d = (await api.saleGet({ id: saleId })) as {
          sale: Record<string, string | number | null>;
          items: Record<string, string | number | null>[];
        };
        // Fiche entreprise chargée ici (pas de hook : un seul appel IPC
        // déterministe, jamais de payload sans raison sociale).
        let co: Record<string, string> | null = null;
        try {
          const cg = (await api.companyGet()) as {
            company: Record<string, string> | null;
          };
          co = cg.company;
        } catch {
          /* repli "Veloria" du builder */
        }
        const customerId = typeof d.sale["customer_id"] === "number" ? d.sale["customer_id"] : 0;
        let customer: {
          search_name: string;
          phone: string | null;
          address: string | null;
        } | null = null;
        if (customerId > 0) {
          try {
            const st = (await api.customerStatement({ id: customerId })) as {
              customer: {
                search_name: string;
                phone: string | null;
                address: string | null;
              };
            };
            customer = st.customer;
          } catch {
            /* aperçu sans coordonnées plutôt que pas d'aperçu */
          }
        }
        const payload = buildSaleTicketPayload(d, co, customer, customerId);
        const pv = (await api.printPreview(payload)) as { text80: string };
        if (!cancelled) {
          setDoc({
            payload,
            text80: pv.text80,
            invoice: String(d.sale["invoice_number"] ?? ""),
          });
        }
      } catch (e) {
        if (!cancelled) {
          notify(frError(e, "Aperçu indisponible."), "err");
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
  }, [saleId]);

  async function printDoc(): Promise<void> {
    if (!doc || busy) return;
    setBusy(true);
    try {
      await api.printReceipt(doc.payload);
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
      const res = (await api.exportReceiptPdf(doc.payload)) as { path: string };
      notify(`PDF enregistré : ${res.path}`, "ok");
    } catch (e) {
      notify(frError(e, "Export PDF impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label={title} title={title} onClose={onClose} wide>
      {loading || !doc ? (
        <p className="py-10 text-center text-sm text-slate-500" role="status">
          Chargement…
        </p>
      ) : (
        <pre
          className="h-[50vh] overflow-auto rounded-xl border border-white/10 bg-white p-4 font-mono text-[12px] leading-snug text-black"
          aria-label={`Aperçu ticket ${doc.invoice}`}
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
