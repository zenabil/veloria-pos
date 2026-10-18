// Veloria PoS — Clients : aperçu bon de retour (ticket 58/80mm) + impression.
// Extrait de `ClientDialogs.tsx` (découpage sans changement de comportement).
// FIX racine : chrome d'aperçu partagé (DocumentPreviewModal).
import { DocumentPreviewModal } from "@shared/documents/DocumentPreviewModal.tsx";
import { Button } from "@shared/ui/primitives.tsx";

/** Aperçu bon de retour (ticket uniquement) + impression — même HTML côté main. */
export function SlipPreviewModal({
  title,
  text80,
  busy,
  onClose,
  onPrint,
}: {
  title: string;
  text80: string;
  busy: boolean;
  onClose: () => void;
  onPrint: () => void;
}): React.JSX.Element {
  return (
    <DocumentPreviewModal
      label={title}
      title={title}
      text80={text80}
      onClose={onClose}
      actions={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={busy} onClick={onPrint}>
            Imprimer le ticket
          </Button>
        </div>
      }
    />
  );
}
