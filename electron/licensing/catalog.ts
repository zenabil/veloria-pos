// Veloria Licensing — Catalogue des capabilities (main uniquement, zéro dépendance).
// Source unique des identifiants pages/features, presets de plans et seuils
// d'expiration. Pur (aucun import node/electron) : le renderer POS possède un
// miroir typé (src/features/license/catalog.ts) vérifié par test de parité.
// Toute nouvelle page/feature s'ajoute ICI + dans le miroir + dans la doc,
// sans redesign du système (payload extensible : pages partielles = refus).

/** Pages contrôlables par licence (17, §4 du cahier). */
export const LICENSE_PAGES = [
  "dashboard",
  "sales",
  "products",
  "stock",
  "customers",
  "suppliers",
  "debts",
  "expenses",
  "returns",
  "history",
  "reports",
  "pain",
  "breadOrders",
  "proformas",
  "invoices",
  "zakat",
  "settings",
] as const;

export type LicensePageId = (typeof LICENSE_PAGES)[number];

/** Features contrôlables par licence (13 métier + 1 legacy). */
export const LICENSE_FEATURES = [
  "receipt-80mm",
  "invoice-a4",
  "automatic-backup",
  "restore-backup",
  "barcode-scanner",
  "ocr",
  "excel-export",
  "pdf-export",
  "debt-management",
  "partial-payments",
  "returns",
  "proformas",
  "advanced-reports",
  "multi-printer",
] as const;

export type LicenseFeatureId = (typeof LICENSE_FEATURES)[number];

/** Plans = presets d'émission (jamais source d'autorisation à l'exécution). */
export const LICENSE_PLANS = ["BASIC", "STANDARD", "PRO", "ENTERPRISE", "CUSTOM"] as const;

export type LicensePlan = (typeof LICENSE_PLANS)[number];

/** Seuils configurables d'expiration (jours) — jamais hardcodés dans l'UI. */
export const LICENSE_WARNING_DAYS = 30;
export const LICENSE_CRITICAL_DAYS = 7;

export interface PlanPreset {
  pages: Record<LicensePageId, boolean>;
  features: Record<LicenseFeatureId, boolean>;
}

function allPages(value: boolean): Record<LicensePageId, boolean> {
  return Object.fromEntries(LICENSE_PAGES.map((p) => [p, value])) as Record<LicensePageId, boolean>;
}

function allFeatures(value: boolean): Record<LicenseFeatureId, boolean> {
  return Object.fromEntries(LICENSE_FEATURES.map((f) => [f, value])) as Record<
    LicenseFeatureId,
    boolean
  >;
}

/**
 * Presets par plan. PRO = preset modifiable avant émission (copie profonde
 * côté Manager). CUSTOM = tout activé par défaut, à ajuster par le vendor.
 */
export const PLAN_PRESETS: Record<LicensePlan, PlanPreset> = {
  BASIC: {
    pages: {
      ...allPages(false),
      dashboard: true,
      sales: true,
      products: true,
      stock: true,
      customers: true,
      history: true,
      settings: true,
    },
    features: {
      ...allFeatures(false),
      "receipt-80mm": true,
      "automatic-backup": true,
    },
  },
  STANDARD: {
    pages: {
      ...allPages(false),
      dashboard: true,
      sales: true,
      products: true,
      stock: true,
      customers: true,
      suppliers: true,
      debts: true,
      expenses: true,
      returns: true,
      history: true,
      proformas: true,
      invoices: true,
      settings: true,
    },
    features: {
      ...allFeatures(false),
      "receipt-80mm": true,
      "invoice-a4": true,
      "automatic-backup": true,
      "restore-backup": true,
      "barcode-scanner": true,
      "pdf-export": true,
      "debt-management": true,
      "partial-payments": true,
      returns: true,
      proformas: true,
    },
  },
  PRO: {
    pages: {
      ...allPages(false),
      dashboard: true,
      sales: true,
      products: true,
      stock: true,
      customers: true,
      suppliers: true,
      debts: true,
      expenses: true,
      returns: true,
      history: true,
      reports: true,
      pain: true,
      breadOrders: true,
      proformas: true,
      invoices: true,
      settings: true,
    },
    features: {
      ...allFeatures(false),
      "receipt-80mm": true,
      "invoice-a4": true,
      "automatic-backup": true,
      "restore-backup": true,
      "barcode-scanner": true,
      ocr: true,
      "excel-export": true,
      "pdf-export": true,
      "debt-management": true,
      "partial-payments": true,
      returns: true,
      proformas: true,
      "advanced-reports": true,
    },
  },
  ENTERPRISE: {
    pages: { ...allPages(true) },
    features: { ...allFeatures(true) },
  },
  CUSTOM: {
    pages: { ...allPages(true) },
    features: { ...allFeatures(true) },
  },
};

/** Preset deep-copy (le Manager le mute librement avant signature). */
export function planPreset(plan: LicensePlan): PlanPreset {
  const p = PLAN_PRESETS[plan];
  return { pages: { ...p.pages }, features: { ...p.features } };
}

export function isLicensePage(value: unknown): value is LicensePageId {
  return typeof value === "string" && (LICENSE_PAGES as readonly string[]).includes(value);
}

export function isLicenseFeature(value: unknown): value is LicenseFeatureId {
  return typeof value === "string" && (LICENSE_FEATURES as readonly string[]).includes(value);
}

/**
 * Normalise la liste `features` signée (anciennes licences : 3 ids ; nouvelles :
 * 14). Inconnues ignorées (extensibilité), doublons dédupliqués, tri stable.
 * (P2 : l'ancienne table d'alias identité a été supprimée — les 3 ids
 * historiques sont toujours canoniques, `isLicenseFeature` suffit.)
 */
export function normalizeFeatures(features: unknown): string[] {
  if (!Array.isArray(features)) return [];
  const out = new Set<string>();
  for (const f of features) {
    if (typeof f !== "string") continue;
    const v = f.trim();
    if (isLicenseFeature(v)) out.add(v);
  }
  return [...out].sort();
}
