// Veloria PoS — Catalogue : tiroir détail + formulaire + ajustement de stock.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useEffect, useState } from "react";
import { FileDown, Printer } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";

import { Button, Field, Modal, Select, TextInput } from "@shared/ui/primitives.tsx";

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
  const [format, setFormat] = useState<"30x20" | "50x30" | "58x40" | "A4-24" | "custom">("A4-24");
  const [customWidth, setCustomWidth] = useState("50");
  const [customHeight, setCustomHeight] = useState("30");
  /** C5 : QR du code-barres sous le Code 39 (opt-in). */
  const [withQr, setWithQr] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const n = Math.min(100, Math.max(1, Number(copies.replace(",", ".")) || 1));

  // Payload unique aperçu + impression + PDF (mono/collectif via `copies`).
  function labelPayload(): {
    items: { name: string; priceMinor: number; barcode: string; copies: number }[];
    format: typeof format;
    customWidthMm: number;
    customHeightMm: number;
    qr: boolean;
  } {
    const w = Number(String(customWidth).replace(",", "."));
    const hgt = Number(String(customHeight).replace(",", "."));
    return {
      items: printable.map((i) => ({
        name: i.name,
        priceMinor: i.priceMinor,
        barcode: i.barcode,
        copies: n,
      })),
      format,
      customWidthMm:
        format === "custom" && Number.isFinite(w) ? Math.min(210, Math.max(10, w)) : 50,
      customHeightMm:
        format === "custom" && Number.isFinite(hgt) ? Math.min(297, Math.max(10, hgt)) : 30,
      qr: withQr,
    };
  }

  // BL-24 : 200 étiquettes max par planche (copies × articles).
  function overLimit(): boolean {
    return printable.length * n > 200;
  }

  async function preview(): Promise<void> {
    if (busy) return;
    if (overLimit()) {
      notify("Trop d'étiquettes : 200 maximum par planche.", "err");
      return;
    }
    setBusy(true);
    try {
      const res = (await api.labelsPreview(labelPayload())) as { htmlA4: string };
      setHtml(res.htmlA4);
    } catch (e) {
      notify(frError(e, "Aperçu impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function print(): Promise<void> {
    if (busy) return;
    if (overLimit()) {
      notify("Trop d'étiquettes : 200 maximum par planche.", "err");
      return;
    }
    setBusy(true);
    try {
      await api.labelsPrint(labelPayload());
      notify("Étiquettes envoyées.", "ok");
      // P5 : impression = papier.
      playSound("print");
    } catch (e) {
      notify(frError(e, "Impression impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf(): Promise<void> {
    if (busy) return;
    if (overLimit()) {
      notify("Trop d'étiquettes : 200 maximum par planche.", "err");
      return;
    }
    setBusy(true);
    try {
      const res = (await api.labelsExportPdf(labelPayload())) as { path: string };
      notify(`PDF enregistré : ${res.path}`, "ok");
    } catch (e) {
      notify(frError(e, "Export PDF impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (printable.length > 0) void preview();
  }, []);

  // Aperçu vivant : réactualisé à chaque changement (format, dimensions, exemplaires).
  useEffect(() => {
    if (printable.length === 0) return;
    const t = window.setTimeout(() => void preview(), 500);
    return () => window.clearTimeout(t);
  }, [copies, format, customWidth, customHeight, withQr]);

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
      <Field label="Format d'étiquette">
        <Select
          value={format}
          onChange={(e) =>
            setFormat(e.target.value as "30x20" | "50x30" | "58x40" | "A4-24" | "custom")
          }
          aria-label="Format d'étiquette"
        >
          <option value="30x20">Thermique 30 × 20 mm</option>
          <option value="50x30">Thermique 50 × 30 mm</option>
          <option value="58x40">Thermique 58 × 40 mm</option>
          <option value="A4-24">Planche A4 — 24 étiquettes</option>
          <option value="custom">Personnalisé…</option>
        </Select>
      </Field>
      {format === "custom" ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Largeur (mm, 10 – 210)">
            <TextInput
              value={customWidth}
              onChange={(e) => setCustomWidth(e.target.value)}
              inputMode="decimal"
              aria-label="Largeur personnalisée en millimètres"
            />
          </Field>
          <Field label="Hauteur (mm, 10 – 297)">
            <TextInput
              value={customHeight}
              onChange={(e) => setCustomHeight(e.target.value)}
              inputMode="decimal"
              aria-label="Hauteur personnalisée en millimètres"
            />
          </Field>
        </div>
      ) : null}
      <p className="text-xs text-slate-500">
        Impression noir et blanc, code-barres réel de chaque produit.
      </p>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={withQr}
          onChange={(e) => setWithQr(e.target.checked)}
          aria-label="Ajouter le QR du code-barres"
          className="h-4 w-4 accent-amber-400"
        />
        QR du code-barres sous le Code 39
      </label>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => void preview()}
          disabled={busy}
          className="flex-1"
        >
          {busy ? "…" : "Actualiser l'aperçu"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void exportPdf()}
          disabled={busy || html == null}
          className="flex-1"
        >
          <FileDown size={15} aria-hidden="true" /> PDF
        </Button>
        <Button onClick={() => void print()} disabled={busy || html == null} className="flex-[2]">
          <Printer size={15} aria-hidden="true" /> Imprimer
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
