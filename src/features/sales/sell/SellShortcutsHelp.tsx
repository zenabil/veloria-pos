// Veloria PoS — Caisse : aide raccourcis clavier ([?], JSX pur).
// Chaque entrée affichée correspond à un handler réel (footer-hints + useSellShortcuts).
import { Kbd, Modal } from "@shared/ui/primitives.tsx";
import { FOOTER_HINTS } from "@/app/shell/footer-hints.ts";

const EXTRA = [
  { k: "+ / −", label: "Quantité dernière ligne" },
  { k: "↑ ↓ + Entrée", label: "Choisir un produit" },
  { k: "5*code", label: "Quantité rapide au scan" },
  { k: "?", label: "Cette aide" },
  { k: "Échap", label: "Fermer" },
];

export function SellShortcutsHelp({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <Modal label="Raccourcis caisse" title="Raccourcis caisse" onClose={onClose}>
      <ul className="space-y-1.5">
        {[...FOOTER_HINTS.sell, ...EXTRA].map((h) => (
          <li key={`${h.k}-${h.label}`} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-300">{h.label}</span>
            <Kbd>{h.k}</Kbd>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
