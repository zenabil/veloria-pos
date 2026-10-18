// Veloria PoS — Raccourcis RÉELS par module (pied de page + aide [?]).
// Chaque entrée affichée correspond à un gestionnaire existant et vérifié.
// Règle : jamais d'étiquette sans handler (audit ADR-037).
import type { ModuleId } from "./shell-types.ts";

export interface FooterHint {
  k: string;
  label: string;
}

export const FALLBACK_HINTS: FooterHint[] = [
  { k: "F2", label: "Format Impr." },
  { k: "Échap", label: "Fermer" },
  { k: "Entrée", label: "Valider" },
];

export const FOOTER_HINTS: Record<ModuleId, FooterHint[]> = {
  sell: [
    { k: "F1", label: "Article libre" },
    { k: "F3", label: "Recherche" },
    { k: "F4", label: "Proforma" },
    { k: "F5", label: "Client" },
    { k: "F6", label: "Panier" },
    { k: "F8", label: "Fermer onglet" },
    { k: "F9", label: "Vider" },
    { k: "F10", label: "Encaisser" },
  ],
  dashboard: [
    { k: "F4", label: "Filtrer par date" },
    { k: "F5", label: "Actualiser" },
    { k: "F8", label: "Exporter" },
  ],
  products: [{ k: "F3", label: "Recherche" }],
  customers: [{ k: "F3", label: "Recherche" }],
  suppliers: [{ k: "F3", label: "Recherche" }],
  stock: [{ k: "F3", label: "Recherche" }],
  history: [
    { k: "F3", label: "Recherche" },
    { k: "F6", label: "Réimprimer" },
  ],
  returns: [
    { k: "F2", label: "Nouveau Retour" },
    { k: "F3", label: "Recherche" },
    { k: "F8", label: "Exporter" },
  ],
  expenses: [
    { k: "F3", label: "Recherche" },
    { k: "F8", label: "Exporter" },
  ],
  debts: [{ k: "F3", label: "Recherche" }],
  reports: [
    { k: "F4", label: "Filtrer par date" },
    { k: "F8", label: "Exporter" },
  ],
  proformas: [{ k: "F3", label: "Recherche" }],
  templates: [],
  zakat: [],
  settings: [],
  license: [],
};

/** Raccourcis du module, repli générique si aucun spécifique (jamais vide). */
export function hintsFor(id: ModuleId): FooterHint[] {
  const hints = FOOTER_HINTS[id];
  return hints.length > 0 ? hints : FALLBACK_HINTS;
}
