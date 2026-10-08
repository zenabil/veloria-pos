// Veloria PoS — Clients : aperçu bon de retour (A4/80mm) + impression.
// Extrait de `ClientDialogs.tsx` (découpage sans changement de comportement).
import { useState } from "react";
import { Button, Modal } from "@shared/ui/primitives.tsx";

/** Aperçu bon de retour (A4/80mm) + impression — même HTML côté main. */
export function SlipPreviewModal({
  title,
  text80,
  htmlA4,
  busy,
  onClose,
  onPrint,
}: {
  title: string;
  text80: string;
  htmlA4: string;
  busy: boolean;
  onClose: () => void;
  onPrint: (mode: "80mm" | "A4") => void;
}): React.JSX.Element {
  const [format, setFormat] = useState<"80mm" | "A4">("A4");
  return (
    <Modal label={title} title={title} onClose={onClose} wide>
      <div className="mb-3 flex gap-1.5" role="tablist" aria-label="Format d'aperçu">
        {(["A4", "80mm"] as const).map((f) => (
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
            {f === "A4" ? "Bon A4" : "Ticket 80mm"}
          </button>
        ))}
      </div>
      {format === "A4" ? (
        <iframe
          sandbox=""
          srcDoc={htmlA4}
          title={`Aperçu ${title}`}
          className="h-[50vh] w-full rounded-xl border border-white/10 bg-white"
        />
      ) : (
        <pre
          className="h-[50vh] overflow-auto rounded-xl border border-white/10 bg-white p-4 font-mono text-[12px] leading-snug text-black"
          aria-label={`Aperçu ${title}`}
        >
          {text80}
        </pre>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => onPrint("80mm")}>
          Imprimer 80mm
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => onPrint("A4")}>
          Imprimer A4
        </Button>
      </div>
    </Modal>
  );
}
