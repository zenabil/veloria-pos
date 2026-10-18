// Veloria PoS — Shared documents: chrome d'aperçu document (A4 / Ticket 80mm).
// FIX racine (audit) : le bloc « tablist + iframe A4 + pre 80mm » était copié
// dans 6 écrans (historique, dettes, devis, clients, caisse, retours). UN seul
// chrome ici — chaque site garde ses canaux d'impression/PDF (`actions`),
// sa charge de données et ses libellés de format.
import { useState } from "react";
import { Modal } from "@shared/ui/primitives.tsx";

export type PreviewFormat = "A4" | "80mm";

export function DocumentPreviewModal({
  label,
  title,
  htmlA4,
  text80,
  a4TabLabel = "Format A4",
  onClose,
  actions,
}: {
  /** Label d'accessibilité de la modale. */
  label: string;
  /** Titre affiché dans l'en-tête. */
  title: string;
  /** HTML A4 formaté (construit côté main, rendu sandboxé). */
  htmlA4: string;
  /** Texte du ticket 80mm. */
  text80: string;
  /** Libellé de l'onglet A4 (facture / devis / bon…). */
  a4TabLabel?: string;
  onClose: () => void;
  /** Rangée de boutons (imprimer 80mm / A4 / PDF…) — la sémantique reste
   *  par site : canaux `printing.*` distincts, guards `busy` propres. */
  actions: React.ReactNode;
}): React.JSX.Element {
  const [format, setFormat] = useState<PreviewFormat>("A4");
  return (
    <Modal label={label} title={title} onClose={onClose} wide>
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
            {f === "A4" ? a4TabLabel : "Ticket 80mm"}
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
          aria-label={`Aperçu ticket 80mm — ${title}`}
        >
          {text80}
        </pre>
      )}
      <div className="mt-3">{actions}</div>
    </Modal>
  );
}
