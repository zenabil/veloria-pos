// Veloria PoS — Shared documents: chrome d'aperçu document (format unique).
// FIX racine (audit) : le bloc « tablist + iframe A4 + pre 80mm » était copié
// dans 6 écrans (historique, dettes, devis, clients, caisse, retours). UN seul
// chrome ici — chaque site garde ses canaux d'impression/PDF (`actions`),
// sa charge de données et son format (politique stricte opération → format).
import { Modal } from "@shared/ui/primitives.tsx";

export function DocumentPreviewModal({
  label,
  title,
  htmlA4 = "",
  html80 = "",
  text80 = "",
  onClose,
  actions,
}: {
  /** Label d'accessibilité de la modale. */
  label: string;
  /** Titre affiché dans l'en-tête. */
  title: string;
  /** HTML A4 (construit côté main, rendu sandboxé ; vide = document thermique). */
  htmlA4?: string | undefined;
  /** HTML du ticket 58/80mm (design réel imprimé, ADR-134). */
  html80?: string | undefined;
  /** Repli texte du ticket (document thermique sans HTML dédié). */
  text80?: string | undefined;
  onClose: () => void;
  /** Rangée de boutons (imprimer / PDF…) — la sémantique reste par site :
   *  canaux `printing.*` distincts, guards `busy` propres. */
  actions: React.ReactNode;
}): React.JSX.Element {
  const html = htmlA4 !== "" ? htmlA4 : html80;
  return (
    <Modal label={label} title={title} onClose={onClose} wide>
      {html !== "" ? (
        <iframe
          sandbox=""
          srcDoc={html}
          title={`Aperçu ${title}`}
          aria-label={`Aperçu ticket 58/80 mm — ${title}`}
          className="h-[50vh] w-full rounded-xl border border-white/10 bg-white"
        />
      ) : (
        <pre
          className="h-[50vh] overflow-auto rounded-xl border border-white/10 bg-white p-4 font-mono text-[12px] leading-snug text-black"
          aria-label={`Aperçu ticket 58/80 mm — ${title}`}
        >
          {text80}
        </pre>
      )}
      <div className="mt-3">{actions}</div>
    </Modal>
  );
}
