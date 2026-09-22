// Veloria PoS — Retours : tiroir détail + création (client/fournisseur) + remboursement.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useState } from "react";

import { Field, Modal, Select } from "@shared/ui/primitives.tsx";
import { type ReturnKind } from "../types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";

import { CustomerReturnDialog } from "./NewCustomerReturnDialog.tsx";
import { SupplierReturnDialog } from "./NewSupplierReturnDialog.tsx";

// ---------------------------------------------------------------------------
// Nouveau retour : aiguillage client / fournisseur.
// ---------------------------------------------------------------------------

export function NewReturnDialog({
  onClose,
  onSaved,
  notify,
}: {
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [kind, setKind] = useState<ReturnKind>("customer");
  return (
    <Modal label="Nouveau retour" title="Nouveau retour" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Type de retour">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as ReturnKind)}
            aria-label="Type de retour"
          >
            <option value="customer">Retour client</option>
            <option value="supplier">Retour fournisseur</option>
          </Select>
        </Field>
        {kind === "customer" ? (
          <CustomerReturnDialog onClose={onClose} onSaved={onSaved} notify={notify} />
        ) : (
          <SupplierReturnDialog onClose={onClose} onSaved={onSaved} notify={notify} />
        )}
      </div>
    </Modal>
  );
}
