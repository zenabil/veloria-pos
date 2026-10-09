// Veloria PoS — Catalogue licence côté renderer (miroir typé, FR).
// Miroir de electron/licensing/catalog.ts (le renderer n'importe jamais
// Electron/Node). Parité vérifiée par test unitaire (clés pages/features,
// seuils). Aucun secret ici : libellés + seuils d'affichage uniquement.

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

/** Seuils d'expiration (jours) — source centrale, jamais hardcodés dans l'UI. */
export const LICENSE_WARNING_DAYS = 30;
export const LICENSE_CRITICAL_DAYS = 7;
