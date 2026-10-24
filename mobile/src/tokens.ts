// Veloria Client (APK) — Design tokens V3 : « Veloria Fintech » (Revolut/Wise)
// + identité Stitch verrouillée. Header sombre #051424 + contenu clair,
// montants en Mono comme le ticket, shapes pill-dominant.
// Verrous (tests) : headerBg #051424, primary #fbbf24, touchMin 48, pageSize 20.
export const COLORS = {
  headerBg: "#051424",
  headerText: "#d4e4fa",
  headerAccent: "#4edea3",
  contentBg: "#F6F7F9",
  cardBg: "#FFFFFF",
  cardText: "#122131",
  cardMuted: "#64748B",
  primary: "#fbbf24",
  primaryText: "#402d00",
  debtOk: "#16A34A",
  debtDue: "#D97706",
  debtOverdue: "#DC2626",
  debtOverLimit: "#991B1B",
  border: "#E2E8F0",
  // V3 — profondeurs et neutres de la nouvelle UI.
  navyDeep: "#030D18",
  navySoft: "#0E1C2D",
  navyLine: "#1B3149",
  navyMuted: "#8FA6C0",
  white: "#FFFFFF",
  overlay: "#051424B3",
  dangerBg: "#FEF2F2",
  dangerText: "#B42318",
  dangerLight: "#FF7A7A",
  announcementText: "#005320",
  // V4 — échelle de gris neutre (texte secondaire, séparateurs, fonds).
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
  // V4 — palette « dark mode » (préparation, non activée par défaut).
  darkBg: "#0B1220",
  darkCard: "#121C2E",
  darkBorder: "#1E2A3F",
  darkText: "#E6EDF7",
  darkMuted: "#94A3B8",
} as const;

export const RADIUS = {
  card: 24,
  cardSm: 16,
  inner: 12,
  pill: 9999,
  heroBottom: 28,
  field: 16,
  sheet: 28,
} as const;

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

/** Couleur pleine → fond pastille (alpha en hex : 14 = ~8 %, 1A = ~10 %). */
export function tint(color: string, alpha = "14"): string {
  return `${color}${alpha}`;
}

export const FONTS = {
  ui: "System",
  mono: "monospace",
} as const;

export const SIZES = {
  heroAmount: 34,
  amountLg: 26,
  amountMd: 18,
  touchMin: 48,
  filterChipHeight: 48,
  pageSize: 20,
  tabBar: 64,
} as const;

/** Échelle typographique (une seule source pour toutes les écrans). */
export const TYPE = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: "800" },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "800" },
  headline: { fontSize: 17, lineHeight: 24, fontWeight: "700" },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "500" },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "700" },
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

/** Dégradés signature (LinearGradient).
 * hero = cartes et écrans (clair-obscur bleu) ; heroDeep = splash et
 * TopAppBar (variante plus profonde, 3e ton encre). */
export const GRADIENTS = {
  hero: ["#051424", "#0A1E33", "#123A5C"],
  heroDeep: ["#030D18", "#051424", "#0A1E33"],
  gold: ["#FFD976", "#FBBF24"],
  danger: ["#F87171", "#DC2626"],
} as const;

/** Ombres : carte (plan 1), surélevée (plan 2), nav flottante, halo or. */
export const SHADOW = {
  card: {
    shadowColor: COLORS.headerBg,
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 3,
  },
  raised: {
    shadowColor: COLORS.headerBg,
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 6,
  },
  nav: {
    shadowColor: COLORS.headerBg,
    shadowOpacity: 0.28,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 28,
    elevation: 12,
  },
  gold: {
    shadowColor: COLORS.primary,
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 4,
  },
} as const;
