// Veloria Client (APK) — Design tokens V4 : « Daylight plat ».
//
// Direction alignée sur la refonte du POS (ADR-148) : une seule élévation,
// des hairlines au lieu d'ombres, des surfaces tonales au lieu de cartes
// imbriquées, et UN seul accent fort (l'or) réservé à l'action principale et
// au chiffre de dette. Les statuts deviennent un point + un texte teinté, plus
// des pastilles colorées partout.
//
// Verrous (tests/unit/mobile-foundation.test.ts) : headerBg #051424,
// primary #fbbf24, touchMin 48, pageSize 20 + les couleurs de dette.
export const COLORS = {
  // --- Marque (verrouillée) ---
  headerBg: "#051424",
  headerText: "#E7EEF7",
  headerAccent: "#4EDea3",
  primary: "#fbbf24",
  primaryText: "#3A2A00",
  // --- Surfaces plates (V4) ---
  contentBg: "#F7F8FA", // fond d'écran
  cardBg: "#FFFFFF", // seule surface claire (lignes, champs)
  toneBg: "#EDF1F6", // bandeau tonal (en-têtes de groupe, totaux)
  sunkenBg: "#F1F5F9", // creux : saisies, pastilles secondaires
  border: "#E1E7EF", // hairline universelle (remplace les ombres)
  divider: "#EEF2F7", // filet interne d'une ligne
  // --- Encres ---
  cardText: "#0F1B2A",
  cardMuted: "#5B6B7F",
  white: "#FFFFFF",
  overlay: "#051424CC",
  // --- Dettes : texte + point (le fond teinté reste rare) ---
  debtOk: "#15803D",
  debtDue: "#B45309",
  debtOverdue: "#B91C1C",
  debtOverLimit: "#7F1D1D",
  okTone: "#EAF5EE",
  dueTone: "#FBF1E3",
  dangerTone: "#FBECEC",
  dangerBg: "#FBECEC",
  dangerText: "#B42318",
  dangerLight: "#FF7A7A",
  announcementText: "#0B5C2E",
  // --- Navy (bandeau haut, dock, états « encre ») ---
  navyDeep: "#03101C",
  navySoft: "#0E1C2D",
  navyLine: "#1E3149",
  navyMuted: "#9AACC2",
  // --- Échelle neutre (réutilisée par les fonds et les filets) ---
  gray50: "#F8FAFC",
  gray100: "#F1F5F9",
  gray200: "#E2E8F0",
  gray300: "#CBD5E1",
  gray400: "#94A3B8",
  gray500: "#64748B",
  gray600: "#475569",
  gray700: "#334155",
  gray800: "#1E293B",
  gray900: "#0F172A",
  // --- Préparation d'un thème sombre (non activé) ---
  darkBg: "#0B1220",
  darkCard: "#121C2E",
  darkBorder: "#1E2A3F",
  darkText: "#E6EDF7",
  darkMuted: "#94A3B8",
} as const;

/** Rayons resserrés et cohérents : plus de 24/16/12/9999 mélangés. */
export const RADIUS = {
  card: 18,
  cardSm: 14,
  inner: 10,
  pill: 9999,
  heroBottom: 0,
  field: 14,
  sheet: 20,
  button: 14,
} as const;

/** Filet universel : la V4 sépare par une ligne, pas par une ombre. */
export const HAIRLINE = { borderWidth: 1, borderColor: COLORS.border } as const;

export type DebtTone = "green" | "amber" | "red" | "grey";

export function debtTone(status: string, overLimit: boolean): DebtTone {
  if (overLimit || status === "over_limit" || status === "overdue") return "red";
  if (status === "due") return "amber";
  if (status === "none") return "green";
  return "grey";
}

export function debtColor(status: string, overLimit: boolean): string {
  const tone = debtTone(status, overLimit);
  if (tone === "red") return COLORS.debtOverdue;
  if (tone === "amber") return COLORS.debtDue;
  if (tone === "green") return COLORS.debtOk;
  return COLORS.cardMuted;
}

/** Fond très teinté d'un statut (bandeau de dette, rien d'autre). */
export function debtSurface(status: string, overLimit: boolean): string {
  const tone = debtTone(status, overLimit);
  if (tone === "red") return COLORS.dangerTone;
  if (tone === "amber") return COLORS.dueTone;
  if (tone === "green") return COLORS.okTone;
  return COLORS.toneBg;
}

/** Couleur pleine → fond pastille (alpha en hex : 14 = ~8 %, 1A = ~10 %). */
export function tint(color: string, alpha = "14"): string {
  return `${color}${alpha}`;
}

export const FONTS = {
  ui: "System",
  mono: "monospace",
} as const;

export const SIZES = {
  heroAmount: 30,
  amountLg: 22,
  amountMd: 16,
  touchMin: 48,
  filterChipHeight: 40,
  rowHeight: 60,
  tabBar: 60,
  /** Réserve basse : le dock n'écrase plus la dernière ligne (défaut V3). */
  dockInset: 88,
  pageSize: 20,
} as const;

/** Échelle typographique (une seule source pour toutes les écrans). */
export const TYPE = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: "800" },
  title: { fontSize: 20, lineHeight: 26, fontWeight: "800" },
  headline: { fontSize: 16, lineHeight: 22, fontWeight: "700" },
  body: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
  label: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: "700" },
} as const;

/** Rythme 4/8 — marge d'écran 16, gutter 12. */
export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

/**
 * Élévations V4 : quasi plates, et en `boxShadow` — les props `shadow*` sont
 * dépréciées depuis RN 0.76 (avertissement au rendu). `card`/`raised` ne
 * servent plus qu'à la feuille de reçu superposée ; la séparation courante
 * est `HAIRLINE`.
 */
export const SHADOW = {
  card: { boxShadow: "0 1px 2px rgba(5, 20, 36, 0.05)" },
  raised: { boxShadow: "0 2px 8px rgba(5, 20, 36, 0.08)" },
  nav: { boxShadow: "0 -1px 0 rgba(5, 20, 36, 0.05)" },
  gold: { boxShadow: "none" },
} as const;
