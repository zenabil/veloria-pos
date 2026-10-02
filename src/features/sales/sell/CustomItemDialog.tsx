// Veloria PoS — Caisse : article libre hors catalogue (P4, extrait de SellScreen).
import type { RefObject } from "react";
import { Button, Field, Modal, TextInput } from "@shared/ui/primitives.tsx";

export interface CustomForm {
  name: string;
  price: string;
  qty: string;
}

export function CustomItemDialog({
  customForm,
  setCustomForm,
  customPriceRef,
  onClose,
  onAdd,
}: {
  customForm: CustomForm;
  setCustomForm: (f: CustomForm) => void;
  customPriceRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onAdd: () => void;
}): React.JSX.Element {
  return (
    <Modal label="Article libre" title="Article libre [F1]" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd();
        }}
      >
        <Field label="Nom du produit">
          <TextInput
            value={customForm.name}
            onChange={(e) => setCustomForm({ ...customForm, name: e.target.value })}
            onKeyDown={(e) => {
              // Entrée = passer au prix (l'ajout se fait depuis le prix).
              if (e.key === "Enter") {
                e.preventDefault();
                customPriceRef.current?.focus();
              }
            }}
            placeholder="Ex. : Sachet plastique"
            aria-label="Nom du produit libre"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prix unitaire (DZD) *" hint="Obligatoire. Entrée = ajouter au panier.">
            <TextInput
              value={customForm.price}
              onChange={(e) => setCustomForm({ ...customForm, price: e.target.value })}
              inputMode="decimal"
              placeholder="0,00"
              aria-label="Prix unitaire"
              ref={customPriceRef}
            />
          </Field>
          <Field label="Qté *" hint="Quantité (défaut 1).">
            <TextInput
              value={customForm.qty}
              onChange={(e) => setCustomForm({ ...customForm, qty: e.target.value })}
              inputMode="decimal"
              placeholder="1"
              aria-label="Quantité"
            />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button type="submit" className="flex-[2]">
            Ajouter au panier
          </Button>
        </div>
      </form>
    </Modal>
  );
}
