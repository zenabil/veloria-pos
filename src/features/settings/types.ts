// Veloria PoS — Feature Paramètres : sections unifiées (6 rubriques).
// Regroupées pour limiter la navigation : entreprise, commerce, catalogue,
// documents (+ zakat), données, système.

export type SettingsSectionId =
  | "company"
  | "commerce"
  | "catalogue"
  | "documents"
  | "data"
  | "team"
  | "system";

export const SETTINGS_SECTIONS: { id: SettingsSectionId; label: string }[] = [
  { id: "company", label: "Entreprise" },
  { id: "commerce", label: "Commerce (vente, clients, fournisseurs)" },
  { id: "catalogue", label: "Catalogue (produits, stock)" },
  { id: "documents", label: "Documents (factures, impression, zakat)" },
  { id: "data", label: "Données (sauvegarde, base)" },
  { id: "team", label: "Équipe (gérant, utilisateurs)" },
  { id: "system", label: "Système (sécurité, à propos)" },
];
