// Veloria PoS — Clients : aperçu bon de retour (A4/80mm) + impression.
// Extrait de `ClientDialogs.tsx` (découpage sans changement de comportement).
// FIX racine : chrome d'aperçu partagé (DocumentPreviewModal).
import { DocumentPreviewModal } from "@shared/documents/DocumentPreviewModal.tsx";
import { Button } from "@shared/ui/primitives.tsx";

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
  return (
    <DocumentPreviewModal
      label={title}
      title={title}
      htmlA4={htmlA4}
      text80={text80}
      a4TabLabel="Bon A4"
      onClose={onClose}
      actions={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => onPrint("80mm")}>
            Imprimer 80mm
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => onPrint("A4")}>
            Imprimer A4
          </Button>
        </div>
      }
    />
  );
}
