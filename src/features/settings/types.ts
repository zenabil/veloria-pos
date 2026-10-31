// Veloria PoS — Feature Paramètres : sections unifiées (7 rubriques).
// Regroupées pour limiter la navigation : entreprise, commerce, catalogue,
// documents (+ zakat), données, équipe, système.

export type SettingsSectionId =
  "company" | "commerce" | "catalogue" | "documents" | "data" | "team" | "system";

export type SettingsIconKey =
  "company" | "commerce" | "catalogue" | "documents" | "data" | "team" | "system";

export interface SettingsSectionMeta {
  id: SettingsSectionId;
  /** Libellé historique complet — conservé comme nom accessible (E2E). */
  label: string;
  shortLabel: string;
  description: string;
  icon: SettingsIconKey;
  keywords: string;
}

export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  {
    id: "company",
    label: "Entreprise",
    shortLabel: "Entreprise",
    description: "Raison sociale, coordonnées, fiscalité, logo",
    icon: "company",
    keywords: "société adresse téléphone email nif rc nis article imposition logo facture",
  },
  {
    id: "commerce",
    label: "Commerce (vente, clients, fournisseurs)",
    shortLabel: "Commerce",
    description: "Vente, sons, clients, fournisseurs, annonce",
    icon: "commerce",
    keywords: "caisse paiement crédit impression ticket sons clients fournisseurs annonce magasin",
  },
  {
    id: "catalogue",
    label: "Catalogue (produits, stock)",
    shortLabel: "Catalogue",
    description: "Produits, unités, seuils et stock",
    icon: "catalogue",
    keywords: "produit unité stock seuil inventaire quantité",
  },
  {
    id: "documents",
    label: "Documents (factures, impression, zakat)",
    shortLabel: "Documents",
    description: "Factures, imprimante, zakat",
    icon: "documents",
    keywords: "facture ticket impression imprimante zakat paiement",
  },
  {
    id: "data",
    label: "Données (sauvegarde, base)",
    shortLabel: "Données",
    description: "Sauvegarde, base locale, miroir mobile",
    icon: "data",
    keywords: "sauvegarde backup base sqlite restauration miroir android synchronisation",
  },
  {
    id: "team",
    label: "Équipe (gérant, utilisateurs)",
    shortLabel: "Équipe",
    description: "Code gérant et comptes utilisateurs",
    icon: "team",
    keywords: "gérant code pin utilisateur staff permission accès",
  },
  {
    id: "system",
    label: "Système (sécurité, à propos)",
    shortLabel: "Système",
    description: "Sécurité, affichage, version",
    icon: "system",
    keywords: "sécurité affichage thème densité à propos version licence",
  },
];

export const SETTINGS_NAV_GROUPS: { label: string; items: SettingsSectionId[] }[] = [
  { label: "Configuration", items: ["company", "commerce", "catalogue"] },
  { label: "Documents & données", items: ["documents", "data"] },
  { label: "Poste & accès", items: ["team", "system"] },
];

export interface SettingsCardMeta {
  id: string;
  section: SettingsSectionId;
  title: string;
  description: string;
  keywords: string;
}

/** Index des cartes : navigation interne + recherche globale. */
export const SETTINGS_CARDS: SettingsCardMeta[] = [
  {
    id: "company",
    section: "company",
    title: "Entreprise",
    description: "Identité, contact, fiscalité et logo",
    keywords: "raison sociale commercial adresse wilaya contact nif rc nis article logo préfixe",
  },
  {
    id: "sales",
    section: "commerce",
    title: "Vente",
    description: "Caisse, crédit, impression et sons",
    keywords:
      "paiement espèces chèque virement crédit impression automatique sons volume audio bips",
  },
  {
    id: "customers",
    section: "commerce",
    title: "Clients",
    description: "Crédit client et règlements fournisseurs",
    keywords: "client crédit plafond défaut fournisseur règlement paiement échéance",
  },
  {
    id: "announcement",
    section: "commerce",
    title: "Annonces du magasin",
    description: "Bandeau de l'application mobile : texte ou image, expiration",
    keywords: "annonce annonces message magasin apk mobile image expiration compte à rebours",
  },
  {
    id: "products",
    section: "catalogue",
    title: "Produits",
    description: "Unité par défaut et seuil de stock",
    keywords: "produit unité défaut création stock seuil minimum inventaire négatif",
  },
  {
    id: "invoice",
    section: "documents",
    title: "Facturation",
    description: "Mentions, pied de page et remerciement",
    keywords: "facture ticket mentions pied page remerciement tva",
  },
  {
    id: "printer",
    section: "documents",
    title: "Imprimante",
    description: "Imprimante, largeur papier, mode silencieux",
    keywords: "imprimante papier 58 80 silencieux test",
  },
  {
    id: "zakat",
    section: "documents",
    title: "Zakat",
    description: "Paramètres du calcul et historique",
    keywords: "zakat nisab or argent calcul",
  },
  {
    id: "backup",
    section: "data",
    title: "Sauvegarde",
    description: "Copies automatiques et manuelles",
    keywords: "sauvegarde backup copie restauration fréquence rétention",
  },
  {
    id: "database",
    section: "data",
    title: "Base de données",
    description: "Emplacement, intégrité, réinitialisation",
    keywords: "base sqlite intégrité déplacer réinitialiser usine",
  },
  {
    id: "sync",
    section: "data",
    title: "Miroir Android",
    description: "Synchronisation vers l'application mobile",
    keywords: "miroir android supabase synchronisation url clé service",
  },
  {
    id: "team-code",
    section: "team",
    title: "Code gérant",
    description: "Code d'accès du gérant",
    keywords: "code gérant pin accès",
  },
  {
    id: "team-users",
    section: "team",
    title: "Utilisateurs",
    description: "Comptes, rôles et permissions",
    keywords: "utilisateur staff rôle permission équipe",
  },
  {
    id: "security",
    section: "system",
    title: "Sécurité et affichage",
    description: "Verrouillage, thème et densité",
    keywords: "sécurité verrouillage session thème densité affichage",
  },
  {
    id: "about",
    section: "system",
    title: "À propos",
    description: "Version, base et informations développeur",
    keywords: "à propos version licence développeur système",
  },
];

export interface SettingsSearchHit {
  kind: "section" | "card";
  id: string;
  section: SettingsSectionId;
  title: string;
  description: string;
}

function fold(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function settingsCardsForSection(section: SettingsSectionId): SettingsCardMeta[] {
  return SETTINGS_CARDS.filter((c) => c.section === section);
}

/** Recherche accent-insensible dans les rubriques et les cartes. */
export function searchSettings(raw: string, limit = 12): SettingsSearchHit[] {
  const tokens = fold(raw.trim())
    .split(/\s+/)
    .filter((t) => t !== "");
  if (tokens.length === 0) return [];
  const matches = (haystack: string): boolean => {
    const folded = fold(haystack);
    return tokens.every((t) => folded.includes(t));
  };
  const hits: SettingsSearchHit[] = [];
  for (const s of SETTINGS_SECTIONS) {
    if (matches(`${s.label} ${s.shortLabel} ${s.description} ${s.keywords}`)) {
      hits.push({
        kind: "section",
        id: s.id,
        section: s.id,
        title: s.shortLabel,
        description: s.description,
      });
    }
  }
  for (const c of SETTINGS_CARDS) {
    if (matches(`${c.title} ${c.description} ${c.keywords}`)) {
      hits.push({
        kind: "card",
        id: c.id,
        section: c.section,
        title: c.title,
        description: c.description,
      });
    }
  }
  return hits.slice(0, limit);
}
