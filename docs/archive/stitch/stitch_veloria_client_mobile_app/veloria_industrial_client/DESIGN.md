---
name: Veloria Industrial Client
colors:
  surface: "#f8f9fb"
  surface-dim: "#d9dadc"
  surface-bright: "#f8f9fb"
  surface-container-lowest: "#ffffff"
  surface-container-low: "#f2f4f6"
  surface-container: "#edeef0"
  surface-container-high: "#e7e8ea"
  surface-container-highest: "#e1e2e4"
  on-surface: "#191c1e"
  on-surface-variant: "#44474c"
  inverse-surface: "#2e3132"
  inverse-on-surface: "#f0f1f3"
  outline: "#74777d"
  outline-variant: "#c4c6cd"
  surface-tint: "#515f72"
  primary: "#000000"
  on-primary: "#ffffff"
  primary-container: "#0e1c2d"
  on-primary-container: "#778599"
  inverse-primary: "#b9c8de"
  secondary: "#795900"
  on-secondary: "#ffffff"
  secondary-container: "#ffc329"
  on-secondary-container: "#6f5100"
  tertiary: "#000000"
  on-tertiary: "#ffffff"
  tertiary-container: "#002109"
  on-tertiary-container: "#009842"
  error: "#ba1a1a"
  on-error: "#ffffff"
  error-container: "#ffdad6"
  on-error-container: "#93000a"
  primary-fixed: "#d5e4fa"
  primary-fixed-dim: "#b9c8de"
  on-primary-fixed: "#0e1c2d"
  on-primary-fixed-variant: "#3a485a"
  secondary-fixed: "#ffdf9f"
  secondary-fixed-dim: "#f9bd22"
  on-secondary-fixed: "#261a00"
  on-secondary-fixed-variant: "#5c4300"
  tertiary-fixed: "#7ffc97"
  tertiary-fixed-dim: "#62df7d"
  on-tertiary-fixed: "#002109"
  on-tertiary-fixed-variant: "#005320"
  background: "#f8f9fb"
  on-background: "#191c1e"
  surface-variant: "#e1e2e4"
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 44px
    fontWeight: "700"
    lineHeight: 52px
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: "700"
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 28px
    fontWeight: "600"
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: "600"
    lineHeight: 28px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: "400"
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: "400"
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: "400"
    lineHeight: 16px
  currency-xl:
    fontFamily: JetBrains Mono
    fontSize: 32px
    fontWeight: "600"
    lineHeight: 40px
    letterSpacing: -0.02em
  currency-lg:
    fontFamily: JetBrains Mono
    fontSize: 22px
    fontWeight: "500"
    lineHeight: 28px
  currency-md:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: "500"
    lineHeight: 24px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: "600"
    lineHeight: 16px
    letterSpacing: 0.06em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-tablet: 1.5rem
  gutter-desktop: 2rem
  margin: 1rem
  margin-tablet: 2rem
  margin-desktop: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system unifies high-end minimal fintech sophistication with industrial-grade utility, engineered specifically for Algerian commerce merchants and shop clientele. The visual language conveys uncompromising reliability, fiscal transparency, and speed in high-velocity point-of-sale and client-facing tracking workflows.

The brand persona blends:

- **Precision Fintech:** Crisp, unadorned surfaces, ultra-refined borders, and mathematically sound metrics.
- **Industrial Reliability:** Built for low-connectivity environments, intense repetitive transactions, and high visibility under harsh storefront lighting conditions.
- **Bilingual Authority:** First-class support for Algerian Arabic (RTL) alongside French and English, ensuring equal legibility, dignity, and visual weight across script systems.

The emotional signature is composed, resilient, and elite—translating the solidity of institutional banking into an accessible, physical storefront utility.

## Colors

The palette establishes an authoritative light foundation anchored by industrial dark elements and high-clarity status cues:

- **Primary Canvas (`#F6F7F9`):** A cold, clean, non-glare concrete grey background that eliminates eye strain and isolates foreground interaction surfaces.
- **Card & Sheet Surfaces (`#FFFFFF`):** Pure white container surfaces that lift crucial transaction data above the structural canvas.
- **Deep Industrial Navy (`#051424`):** The primary color, reserved for typography, high-impact structural panels, primary interactive actions, and the floating navigation frame.
- **Warm Gold Accent (`#FBBF24`):** The focused highlight tone, used sparingly for VIP states, pending balance alerts, loyalty rewards, and active focus rings.
- **Operational Emerald Status (`#16A34A` base, `#4EDEA3` high-visibility glow):** Communicates cleared payments, synchronized offline databases, active cellular links, and positive accounting flows.
- **Error & Critical State (`#DC2626`):** Reserved for unrecoverable sync failures, overdraft warnings, and cancelled settlements.
- **Muted Structural Neutral (`#E2E8F0` / `#94A3B8`):** Restrained boundary lines, tabular dividing rules, and secondary meta-labels.

## Typography

Typography balances architectural discipline with mechanical exactness:

1. **Brand & Numeric Headlines:** `Space Grotesk` drives high-level statements, store account names, and screen titles, projecting technical authority.
2. **Body & Communication:** `Plus Jakarta Sans` powers the core reading layer, microcopy, and forms. Its open counterforms remain legible at low display resolutions.
3. **Financial & Data Engine:** `JetBrains Mono` handles all Algerian Dinar (`DZD` / `د.ج`) monetary amounts, transaction hashes, receipts, timestamps, and balance figures to prevent character jitter and misaligned ledgers.
4. **Bi-directional Typography Rules:**
   - Arabic text automatically inherits system-level Arabic typefaces matching the baseline geometry of `Plus Jakarta Sans`, preserving weight parity between French and Arabic copy.
   - In RTL layout contexts, monetary symbols remain tightly paired with the tabular numeral figures without breaking alignment grids.

## Layout & Spacing

The layout operates on a dynamic 8-point rhythmic grid designed to accommodate compact hand-held merchant tablets and consumer smartphone screens:

- **Mobile (< 768px):** Single column, 1rem edge margin, 1rem gutter. Bottom clearance incorporates an 80px dedicated safe zone to prevent overlap with the floating navy navigation bar.
- **Tablet (768px - 1024px):** 6-column split layout accommodating active cart/ledger views on the right and catalog/historical flows on the left.
- **Desktop / POS Station (> 1024px):** 12-column max-width grid capped at 1280px to preserve immediate scanning efficiency without peripheral eye fatigue.
- **RTL Fluidity:** In Arabic mode, the spatial order mirrors across the horizontal axis; margins and gutters invert symmetrically.

## Elevation & Depth

Visual hierarchy combines clean tonal surfaces with ambient light diffusion:

- **Base Ground:** The `#F6F7F9` surface forms layer zero with zero elevation.
- **White Data Cards:** Pure `#FFFFFF` structures rest atop the base using a signature soft shadow: `0 4px 20px -2px rgba(5, 20, 36, 0.04), 0 2px 6px -1px rgba(5, 20, 36, 0.02)` and a hairline outline of `1px solid rgba(5, 20, 36, 0.05)`.
- **Raised Interactive Tiles:** Active merchant elements, scanning surfaces, and selected cards elevate with `0 8px 30px -4px rgba(5, 20, 36, 0.08)`.
- **Floating Island Navigation:** The primary navigation bar hovers above all interface planes at `z-index: 100`. Built from `#051424` with a subtle back-surface blur (`backdrop-filter: blur(12px)`) and a deep ambient grounding drop shadow: `0 12px 40px rgba(5, 20, 36, 0.25)`.
- **Offline Mode Indicator:** When connectivity drops, an offline status tier introduces an amber warning glow along the upper viewport perimeter (`0 0 16px rgba(251, 191, 36, 0.3)`).

## Shapes

The design uses an architectural pill-dominant geometry that softens the heavy industrial palette while preserving touch targets:

- **Pill Shells (`rounded-full` / `9999px`):** Primary action buttons, chips, status pills, search bars, and the central floating navigation container employ complete curvature.
- **Content Cards:** Main structural data cards leverage a rounded exterior profile (`1.5rem` / `24px`) to frame transactional content cleanly against the `#F6F7F9` background.
- **Nested Data Cells:** Interior line-items and sub-cards scale down to `0.75rem` (`12px`) to maintain harmonious radius nesting.

## Components

### Buttons

- **Primary Pill:** `#051424` background with `#FFFFFF` text. Fully rounded (`9999px`). On press, applies subtle inward scaling (`scale(0.98)`).
- **Secondary Pill:** Pure `#FFFFFF` background with 1px border `rgba(5, 20, 36, 0.12)`, text `#051424`.
- **Gold Accent Pill:** `#FBBF24` background with `#051424` text for urgent payment calls and VIP actions.

### Chips & Status Tags

- **Sync/Offline Tag:** Pill-shaped badge. Active sync uses `#16A34A` background tint (`rgba(22, 163, 74, 0.1)`) with `#16A34A` text and a pulsing emerald beacon dot (`#4EDEA3`). Offline status utilizes `#FBBF24` tint with dark navy text.
- **Filter Chips:** Pill shape, `#FFFFFF` idle state, switching to `#051424` with `#FFFFFF` text when selected.

### Transaction & Metric Cards

- Constructed with `#FFFFFF` background, `24px` corner radius, and subtle ambient shadow.
- DZD currency values sit on their own visual row, rendered in `JetBrains Mono` with explicit currency tags (`DZD` or `د.ج`).
- Subdued hairline border (`1px solid #ECEFF3`) ensures contrast under sunlight.

### Input Fields

- Fully rounded (`9999px`) search and numeric entry inputs with a `#FFFFFF` fill and a `1.5px` border in `#E2E8F0`.
- Focus state activates a distinct outline using `#FBBF24` or `#051424` with zero blur for crisp industrial clarity.
- RTL-aware placement: Clear buttons, search icons, and DZD unit markers swap positions cleanly based on locale.

### Floating Industrial Navigation Bar

- A detached, pill-shaped dock centered at the bottom of the viewport (`32px` bottom offset).
- Deep `#051424` fill, containing icon-and-label tabs rendered in `#94A3B8` (inactive) and `#FFFFFF` or `#FBBF24` (active).
- Includes an integrated offline-first sync pulse dot indicating localized data caching status.

### Offline Queue Tray

- Sticky or expandable bottom sheet indicating queued offline transactions pending remote reconciliation once network connection is restored.
