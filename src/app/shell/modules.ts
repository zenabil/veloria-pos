// Veloria PoS — Registre des 17 modules shell (navigation + gardes licence).
// Icônes et libellés FR centralisés ; décision réelle côté main (§10).
import {
  BarChart3,
  Croissant,
  FileText,
  HandCoins,
  History,
  KeyRound,
  LayoutDashboard,
  MoonStar,
  Package,
  Printer,
  Settings,
  ShoppingCart,
  Truck,
  Undo2,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import type { ModuleId } from "./shell-types.ts";

/**
 * Module → pages licence requises (§10). Au moins UNE suffit
 * (bread = breadOrders OU pain). "license" toujours accessible.
 * La décision réelle est côté main ; ici : affichage + garde de route.
 */
export const MODULE_PAGES: Record<ModuleId, readonly string[]> = {
  dashboard: ["dashboard"],
  sell: ["sales"],
  products: ["products"],
  customers: ["customers"],
  suppliers: ["suppliers"],
  stock: ["stock"],
  history: ["history"],
  returns: ["returns"],
  expenses: ["expenses"],
  debts: ["debts"],
  reports: ["reports"],
  bread: ["breadOrders", "pain"],
  proformas: ["proformas"],
  templates: ["settings", "invoices"],
  zakat: ["zakat"],
  settings: ["settings"],
  license: [],
};

export interface ModuleDef {
  id: ModuleId;
  label: string;
  hint: string;
  icon: LucideIcon;
  kbd?: string;
  group: string;
}

export const MODULE_GROUPS = ["Caisse", "Pilotage", "Marchandise", "Tiers", "Système"] as const;

export const MODULES: ModuleDef[] = [
  {
    id: "sell",
    label: "Caisse",
    hint: "Vente [F1]",
    icon: ShoppingCart,
    kbd: "F1",
    group: "Caisse",
  },
  {
    id: "dashboard",
    label: "Tableau de bord",
    hint: "Vue d'ensemble",
    icon: LayoutDashboard,
    group: "Pilotage",
  },
  {
    id: "history",
    label: "Historique",
    hint: "Toutes les opérations",
    icon: History,
    group: "Pilotage",
  },
  {
    id: "reports",
    label: "Rapports",
    hint: "Activité et marges",
    icon: BarChart3,
    group: "Pilotage",
  },
  { id: "zakat", label: "Zakat", hint: "Calcul et rapport", icon: MoonStar, group: "Pilotage" },
  {
    id: "products",
    label: "Catalogue",
    hint: "Références et prix",
    icon: Package,
    group: "Marchandise",
  },
  {
    id: "stock",
    label: "Stock",
    hint: "Valeur, seuils et inventaire",
    icon: Warehouse,
    group: "Marchandise",
  },
  {
    id: "suppliers",
    label: "Fournisseurs",
    hint: "Achats et dettes",
    icon: Truck,
    group: "Marchandise",
  },
  {
    id: "bread",
    label: "Pain",
    hint: "Commandes et retraits",
    icon: Croissant,
    group: "Marchandise",
  },
  { id: "customers", label: "Clients", hint: "Dettes et soldes", icon: Users, group: "Tiers" },
  { id: "debts", label: "Dettes", hint: "Créances et échéances", icon: HandCoins, group: "Tiers" },
  { id: "returns", label: "Retours", hint: "Clients et fournisseurs", icon: Undo2, group: "Tiers" },
  {
    id: "expenses",
    label: "Dépenses",
    hint: "Charges d'exploitation",
    icon: Wallet,
    group: "Tiers",
  },
  {
    id: "proformas",
    label: "Devis",
    hint: "Devis et conversions (PRF-)",
    icon: FileText,
    group: "Tiers",
  },
  {
    id: "templates",
    label: "Impression",
    hint: "Documents, imprimante et personnalisation",
    icon: Printer,
    group: "Système",
  },
  {
    id: "settings",
    label: "Paramètres",
    hint: "Entreprise et préférences",
    icon: Settings,
    group: "Système",
  },
  {
    id: "license",
    label: "Licence",
    hint: "Activation hors-ligne",
    icon: KeyRound,
    group: "Système",
  },
];
