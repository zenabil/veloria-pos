// Veloria PoS — Catalogue : tiroir détail + formulaire + ajustement de stock.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";

import { Button, Field, Modal, TextInput } from "@shared/ui/primitives.tsx";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { playSound } from "@shared/sound/sound.ts";

// ---------------------------------------------------------------------------
// Étiquettes code-barres : aperçu planche A4 + impression.
// ---------------------------------------------------------------------------

export interface LabelTarget {
  name: string;
  priceMinor: number;
  barcode: string;
}

export function LabelsDialog({
  items,
  onClose,
  notify,
}: {
  items: LabelTarget[];
  onClose: () => void;
  notify: Notify;
}): React.JSX.Element {
  const printable = items.filter((i) => i.barcode.trim() !== "");
  const [copies, setCopies] = useState("1");
  const [html, setHtml] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const n = Math.min(100, Math.max(1, Number(copies.replace(",", ".")) || 1));

  async function preview(): Promise<void> {
    setBusy(true);
    try {
      const res = (await api.labelsPreview({
        items: printable.map((i) => ({
          name: i.name,
          priceMinor: i.priceMinor,
          barcode: i.barcode,
          copies: n,
        })),
      })) as { htmlA4: string };
      setHtml(res.htmlA4);
    } catch (e) {
      notify(frError(e, "Aperçu impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function print(): Promise<void> {
    setBusy(true);
    try {
      await api.labelsPrint({
        items: printable.map((i) => ({
          name: i.name,
          priceMinor: i.priceMinor,
          barcode: i.barcode,
          copies: n,
        })),
      });
      notify("Étiquettes envoyées.", "ok");
      // P5 : impression = papier.
      playSound("print");
    } catch (e) {
      notify(frError(e, "Impression impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (printable.length > 0) void preview();
  }, []);

  return (
    <Modal label="Étiquettes code-barres" title="Étiquettes code-barres" onClose={onClose} wide>
      {printable.length < items.length ? (
        <p className="text-xs text-amber-200">
          {items.length - printable.length} produit(s) sans code-barres ignoré(s).
        </p>
      ) : null}
      <Field label="Exemplaires par produit (1 – 100)">
        <TextInput
          value={copies}
          onChange={(e) => setCopies(e.target.value)}
          inputMode="numeric"
          aria-label="Exemplaires par produit"
        />
      </Field>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => void preview()}
          disabled={busy}
          className="flex-1"
        >
          {busy ? "…" : "Actualiser l'aperçu"}
        </Button>
        <Button onClick={() => void print()} disabled={busy || html == null} className="flex-[2]">
          <Printer size={15} aria-hidden="true" /> Imprimer A4
        </Button>
      </div>
      {html ? (
        <iframe
          sandbox=""
          srcDoc={html}
          title="Aperçu étiquettes"
          className="h-[420px] w-full rounded-xl border border-white/10 bg-white"
        />
      ) : null}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onClose} className="flex-1">
          Fermer
        </Button>
      </div>
    </Modal>
  );
}
