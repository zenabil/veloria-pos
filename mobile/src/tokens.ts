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
} as const;

// Aliases Stitch veloria_industrial_client/DESIGN.md (mêmes teintes, noms Stitch).
export const STITCH = {
  navy: "#051424",
  navyContainer: "#0e1c2d",
  gold: "#fbbf24",
  goldContainer: "#ffc329",
  emerald: "#16A34A",
  emeraldGlow: "#4edea3",
  surface: "#F6F7F9",
  outline: "#E2E8F0",
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
  filterChipHeight: 40,
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

/** Dégradés signature (LinearGradient). */
export const GRADIENTS = {
  hero: ["#051424", "#0A1E33", "#123A5C"],
  heroDeep: ["#030D18", "#051424", "#0A1E33"],
  gold: ["#FFD976", "#FBBF24"],
  ok: ["#22C55E", "#16A34A"],
  danger: ["#F87171", "#DC2626"],
  slate: ["#0E1C2D", "#1B3149"],
} as const;

/** Ombres : carte (plan 1), surélevée (plan 2), nav flottante, halo or. */
export const SHADOW = {
  card: {
    shadowColor: COLORS.headerBg,
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 2,
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
