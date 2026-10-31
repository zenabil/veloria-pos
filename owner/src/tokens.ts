// Veloria Owner — jetons de design repris du système « Executive Retail
// Supervision » (docs/archive/stitch_veloria_supervision_mobile) et des
// jetons verrouillés du POS/APK client : bleu nuit + or, surfaces claires,
// séparation par filet, aucune ombre.
export const COLORS = {
  headerBg: "#051424",
  headerText: "#E7EEF7",
  primary: "#fbbf24",
  primaryText: "#3A2A00",
  contentBg: "#F7F8FA",
  cardBg: "#FFFFFF",
  toneBg: "#EDF1F6",
  sunkenBg: "#F1F5F9",
  border: "#E1E7EF",
  divider: "#EEF2F7",
  cardText: "#0F1B2A",
  cardMuted: "#5B6B7F",
  white: "#FFFFFF",
  navyDeep: "#03101C",
  navySoft: "#0E1C2D",
  navyLine: "#1E3149",
  navyMuted: "#9AACC2",
  // États : point + texte teinté, jamais de fond plein agressif.
  statusOk: "#15803D",
  statusWatch: "#B45309",
  statusCritical: "#B91C1C",
  okTone: "#EAF5EE",
  watchTone: "#FBF1E3",
  criticalTone: "#FBECEC",
  criticalText: "#B42318",
  onNavyChip: "rgba(231, 238, 247, 0.1)",
} as const;

export const RADIUS = {
  card: 18,
  control: 14,
  inner: 10,
  pill: 9999,
  sheet: 20,
} as const;

export const HAIRLINE = { borderWidth: 1, borderColor: COLORS.border } as const;

/** Échelle du DESIGN.md — montants et titres en graisse forte. */
export const TYPE = {
  hero: { fontSize: 30, lineHeight: 36, fontWeight: "800" },
  currencyHero: { fontSize: 28, lineHeight: 32, fontWeight: "800" },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  headline: { fontSize: 18, lineHeight: 24, fontWeight: "700" },
  headlineSm: { fontSize: 16, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 14, lineHeight: 20, fontWeight: "400" },
  bodySm: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  label: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
  badge: { fontSize: 11, lineHeight: 14, fontWeight: "600" },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: "700" },
} as const;

export const SIZES = {
  screenMargin: 16,
  gutter: 12,
  touchMin: 48,
  chipHeight: 48,
  tabBar: 64,
  dockInset: 92,
} as const;

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

/** Couleur pleine → fond pastille (alpha hex : 12 ≈ 7 %). */
export function tint(color: string, alpha = "12"): string {
  return `${color}${alpha}`;
}
