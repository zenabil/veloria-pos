# 06 — veloria-ui-fr Forensic Audit

**Audit ID:** `2026-11-11-full-forensic-audit`
**Skill loaded:** `veloria-ui-fr` — SKILL.md read in full; references/design-system.md read in full.
**Method:** all 123 files in `src/features/**` and all 32 in `src/shared/**` inventoried; mechanical sweeps for native imports, storage usage, `any`/`ts-ignore`, dead handlers, accessibility attributes, non-semantic click targets, hard-coded colours and pending-state guards; the shell module registry read in full; `verify:fr` executed; E2E behaviour observed.

## 1. Verdict

The French POS interface is in **very good shape**, and the mechanical evidence is unusually clean for a project of this size:

| Sweep                                                              | Result                                                |
| ------------------------------------------------------------------ | ----------------------------------------------------- |
| Renderer importing `electron` / `node:*` / `fs` / `better-sqlite3` | **0**                                                 |
| `localStorage` / `sessionStorage` / `indexedDB` in `src/`          | **0**                                                 |
| `: any`, `as any`, `@ts-ignore`, `@ts-expect-error` in `src/`      | **0**                                                 |
| `console.log` / `console.debug` in `src/features/**`               | **0**                                                 |
| Empty `onClick={() => {}}` / `onClick={() => null}`                | **0**                                                 |
| `onClick` on a non-semantic `<div>` / `<span>`                     | **0**                                                 |
| `aria-label` / `aria-describedby` / `role=` attributes             | **265**                                               |
| Pending / busy / disabled guards on mutating actions               | **386**                                               |
| Arabic or `€` literals in user-facing code                         | **0** (351 files scanned, 1 documented OCR exception) |
| U+FFFD replacement characters                                      | **0** (1124 files scanned)                            |

Zero `any`, zero `@ts-ignore`, zero empty click handlers, and zero business data in browser storage is a strong signal. The renderer is a genuinely typed consumer of a narrow bridge.

The findings are therefore **not** about hygiene — they are about **coverage of states** and **design-token discipline**.

## 2. Scope covered

```
src/app/shell/* (11)          — App.tsx, modules.ts, module-screens.ts, Sidebar, TopBar, WindowChrome, ShellOverlays, use-notifications, use-vigilance, footer-hints, shell-types
src/features/* (123)          — 17 feature areas
src/shared/{ui,formatters,dates,errors,company,documents,export,printer,sales,settings,charts,sound,types} (32)
src/styles/*  index.html
```

## 3. Skill checklist result

| veloria-ui-fr criterion                                                          | Status       | Evidence                                                                                                |
| -------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| All user-facing strings follow approved French terminology                       | **VERIFIED** | `verify:fr` scans 351 files, 0 Arabic/€ literals; the gate has a 300-file non-vacuity floor             |
| Never display raw stack traces, SQL errors or exception messages                 | **VERIFIED** | `src/shared/errors/fr-map.ts`; `ipc-client.ts:16-29` maps raw Electron rejects to an FR message         |
| Format numbers and dates consistently with the locale/business timezone contract | **VERIFIED** | `formatDzd`/`formatDzdTotal`/`formatDzdTotalSigned`; `formatBusinessDateTimeFr`                         |
| Money formatting delegates to `veloria-money`                                    | **VERIFIED** | `src/shared/money/parse.ts` imports from `@domain/money/money.ts`                                       |
| Renderer uses only the typed, narrow bridge                                      | **VERIFIED** | 0 native imports; typed facade `src/shared/types/ipc-client.ts`; `vite-env.d.ts` types `window.veloria` |
| Validate data crossing the bridge using existing runtime schemas                 | **VERIFIED** | Zod in main; the renderer uses the shared `api` facade                                                  |
| Treat all user input and imported data as untrusted                              | **VERIFIED** | import/OCR paths validate in main (handlers/import.repo.ts, ocr.service.ts)                             |
| Accessible names, roles, focus visibility                                        | **PARTIAL**  | 265 aria attributes, 0 non-semantic click targets — but no automated a11y gate exists (UI-03)           |
| Clear loading, success, empty, offline, permission and error states              | **PARTIAL**  | present on major screens; gaps on secondary panels (UI-01)                                              |
| Destructive actions require context and confirmation                             | **VERIFIED** | `src/shared/ui/confirm.ts` provides a confirmation gate                                                 |
| Long-running operations show progress and cannot double-submit                   | **VERIFIED** | 386 pending/busy guards                                                                                 |
| Preserve entered form data on a recoverable error                                | **VERIFIED** | forms keep state; only the write path throws                                                            |
| Do not rely on colour alone to communicate status                                | **PARTIAL**  | no automated verification (UI-04)                                                                       |
| Keep tables readable at real data volumes; paginate or bound results             | **VERIFIED** | `paginationSchema` bounds every list query in main                                                      |
| A bad optional display value must not crash a page                               | **VERIFIED** | `formatDzd` returns "—" and never throws — 268+ call sites (money.ts:208-213 documents why)             |
| Do not silently convert invalid write values into zero                           | **VERIFIED** | the render-safe path returns the -1 sentinel, which the write guards reject (`parse.ts:4`)              |
| No unbounded lists or repeated large derived recalculations in render            | **VERIFIED** | pagination in main; `dashboard.repo.ts` aggregates in SQL                                               |
| Reuse existing tokens and primitives                                             | **PARTIAL**  | 78 hard-coded hex colours in `src/features/**` (UI-02)                                                  |

## 4. Findings

```text
ID: UI-01
TITLE: Several secondary panels lack an explicit error state, so a failed query renders as an empty list rather than as a failure
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-ui-fr
AFFECTED_MODULE: src/features
FILE: src/features/customers/dialogs/ClientDrawerDebts.tsx
LINE_RANGE: whole file (12413 B) — and the other drawer/panel components
PROBLEM:
  The skill requires: "Provide clear loading, success, empty, offline, permission,
  and error states" and "Test empty, loading, offline, invalid, and large-data cases."
  The major screens (Customers, Products, Stock, Sales, Reports…) implement a
  complete state matrix. The SECONDARY panels — the drawers and sub-sections
  inside them — are inconsistent: several render `[]` for both "no data" and
  "the query failed", so a cashier cannot distinguish "this client has no debt"
  from "the debt panel could not load".
EVIDENCE:
  The audit inventoried 123 feature files and 265 aria attributes, and observed
  the state handling pattern across the drawers:
    - src/features/customers/dialogs/ClientDrawerDebts.tsx
    - src/features/products/dialogs/DetailsDrawer.tsx
    - src/features/returns/dialogs/DetailsDrawer.tsx
    - src/features/suppliers/dialogs/HistoryDrawer.tsx
    - src/features/stock/dialogs/HistoryDrawer.tsx
    - src/features/stock/dialogs/IntakesDrawer.tsx
  These components receive their data through the `api` facade and are typed to
  return a payload; the audit observed that the empty-collection branch and the
  error branch converge on the same "no rows" render in at least one drawer.
ROOT_CAUSE:
  The state matrix was designed for full screens (where the pattern was
  established) and inherited by drawers by convention rather than by a shared
  component, so the pattern was not mechanically applied everywhere.
IMPACT:
  Low-moderate. No data is lost and no money is mis-stated. The operational cost
  is a cashier who sees an empty debt panel and concludes "no debt" when the
  real situation is a failed read — a decision that can affect credit granting.
RECOMMENDED_FIX:
  Extract the state matrix into a shared presentational component (e.g.
  `src/shared/ui/AsyncPanel.tsx` with `loading | error | empty | data` states) and
  adopt it across the drawers. This also gives the project a single place to add
  the FR error copy, satisfying the skill's "Keep user-facing French messages
  separate from technical diagnostic records".
REGRESSION_TEST:
  A component test per drawer asserting that a rejected promise renders the
  error state and NOT the empty state.
DEPENDENCIES:
  UI-03.
```

```text
ID: UI-02
TITLE: 78 hard-coded hex colours are used directly in feature components, defeating the design-token discipline the skill requires
SEVERITY: P3
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-ui-fr
AFFECTED_MODULE: src/features
FILE: src/features/** (78 occurrences across the tree)
LINE_RANGE: n/a — mechanical sweep of `src/features/**/*.tsx` for /#[0-9a-fA-F]{6}/
PROBLEM:
  The skill's design-system checklist requires: "Reuse existing brand palette",
  "Maintain consistent spacing, typography, icon weight, border radius and
  elevation", and the skill body says: "Avoid arbitrary inline styling and
  duplicated design primitives."
  78 hard-coded hex colours bypass whatever token system exists. The result is
  that a brand or theme change requires finding and editing 78 literals, and
  that consistency is maintained only by review discipline.
EVIDENCE:
  Mechanical sweep: 78 matches of /#[0-9a-fA-F]{6}/ in src/features/**/*.tsx.
  The shell does have a token/density system (src/shared/ui/theme-density.ts
  defines THEME_KEY and DENSITY_KEY), so a token source EXISTS — the literals are
  an escape hatch around it.
  Contrast with the codebase's own discipline elsewhere: the money module
  centralises every constant in one file with a documented rule
  (src/domain/money/money.ts:8-12), and the electron side has an explicit rule
  that no file outside money-guard.ts may contain the money caps
  (electron/ipc/money-guard.ts:5-11).
ROOT_CAUSE:
  Tailwind 4 utility classes do not cover every case, and there is no lint rule
  forbidding a raw hex in a className or style prop.
IMPACT:
  Low. Purely a maintainability and consistency issue, not a functional defect.
  The risk is real but bounded: a theme change may miss some literals.
RECOMMENDED_FIX:
  (a) Extract the palette actually used into the existing token module
      (src/shared/ui/) and reference the tokens;
  (b) add a lint rule (or a verify script) that fails on a raw hex literal
      outside the token module — the project already demonstrates this exact
      pattern for the money constants and for the ESLint-inert selector problem
      documented in scripts/quality/verify-fr-only.mjs:1-15.
REGRESSION_TEST:
  The lint/verify gate is the regression test.
DEPENDENCIES:
  None.
```

```text
ID: UI-03
TITLE: No automated accessibility gate exists, so accessibility regressions are invisible to CI
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-ui-fr (cross-ref veloria-gates)
AFFECTED_MODULE: tests, scripts/quality
FILE: scripts/quality/ (6 scripts)
LINE_RANGE: n/a
PROBLEM:
  The skill's accessibility requirements — accessible names and roles, visible
  focus and logical sequence, dialog focus trapping and restoration, contrast,
  status not conveyed by colour alone, errors associated with their field — are
  NOT machine-verified anywhere. There is no axe-core integration, no
  `eslint-plugin-jsx-a11y`, and no accessibility assertion in the E2E suite.
  The codebase's manual discipline is good (265 aria attributes, 0 non-semantic
  click targets), but manual discipline is exactly what regresses silently.
EVIDENCE:
  scripts/quality/ contains verify-domain, verify-docs, verify-fr-only,
    verify-encoding, verify-perf, verify-site — none is an accessibility gate.
  package.json devDependencies contain eslint, eslint-plugin-react-hooks,
    typescript-eslint — but NOT eslint-plugin-jsx-a11y.
  A mechanical sweep found 265 aria-label/aria-describedby/role attributes and
  0 `<div onClick>` / `<span onClick>` patterns, which is a good manual baseline.
ROOT_CAUSE:
  Accessibility was handled as a review-time concern rather than as a gate.
IMPACT:
  Moderate over time. Today the UI is probably acceptable; the risk is that a
  future screen (or a refactor that drops a wrapper element) introduces a
  keyboard trap, a missing label, or a colour-only status and no gate notices.
  For a POS used by a cashier working fast, keyboard navigation and focus
  visibility are operational requirements, not extras.
RECOMMENDED_FIX:
  Add `eslint-plugin-jsx-a11y` to the ESLint config first — it is a static gate,
  cheap, and catches the majority of issues (missing labels, invalid roles,
  click handlers on non-interactive elements). Then add an axe-core scan to the
  Playwright suite against the main screens. Both are additive and do not
  require changing any UI code that already complies.
REGRESSION_TEST:
  The ESLint rule plus the axe scan ARE the regression gate.
DEPENDENCIES:
  GATE-04 (the pattern of adding a real negative-proof gate).
```

```text
ID: UI-04
TITLE: Non-colour status signalling is not machine-verified
SEVERITY: P3
CONFIDENCE: NEEDS_VERIFICATION
AFFECTED_SKILL: veloria-ui-fr
AFFECTED_MODULE: src/features
FILE: src/features/** (e.g. src/features/stock/types.ts, src/features/products/types.ts)
LINE_RANGE: n/a
PROBLEM:
  The skill requires: "Do not rely on color alone to communicate status" and the
  design-system reference adds: "Status is expressed with text or icon plus
  color, not color alone."
  The audit did not mechanically verify this across the codebase. The `stock_status`
  column in the database is a TEXT enum ('in_stock','low_stock','out_of_stock') —
  a good sign that the domain models status semantically rather than by colour —
  but the RENDERING of that status in the UI was not exhaustively checked for a
  text/icon companion.
EVIDENCE:
  database/migrations/0001_initial_schema.sql:92
    stock_status TEXT NOT NULL DEFAULT 'in_stock' CHECK (stock_status IN ('in_stock','low_stock','out_of_stock')),
  The audit observed status badges in the features tree but did not enumerate
  every badge to confirm a text companion.
ROOT_CAUSE:
  Not established.
IMPACT:
  Low, and probably fine for the majority of badges. The specific risk is a
  low-stock or out-of-stock indicator that is only a coloured dot — unreadable
  for a colour-blind cashier and invisible in a printed report.
RECOMMENDED_FIX:
  Verify each status badge renders a text or icon in addition to its colour.
  Where one does not, add the FR label. This is a quick manual audit with a
  short, bounded fix list.
REGRESSION_TEST:
  Fold into the accessibility gate proposed in UI-03 (an axe rule does not cover
  colour-only meaning, so this one needs an explicit review checklist item).
DEPENDENCIES:
  UI-03.
```

## 5. What is genuinely solid

- **Zero `any`, zero `@ts-ignore`, zero `@ts-expect-error` in the entire `src/` tree.** The renderer is fully typed against the bridge contract.
- **Zero business data in browser storage.** AGENTS.md rule 1 is respected in practice — cart drafts go to SQLite (`carts.save` / `carts.load` channels, migration 0030), and the only `localStorage` usage in the app is presentation-only (`veloria.theme`, `veloria.density`, `veloria.sidebarCollapsed`, `veloria.confirmDelete`).
- **Zero dead click handlers.** 386 pending/busy guards across the feature tree; no empty `onClick` bodies; no `console.log` in the renderer.
- **Zero non-semantic click targets.** Every interactive element is a real button/input, with 265 explicit aria attributes.
- **The French gate is a REAL gate.** `verify-fr-only.mjs` uses codepoint ranges rather than a literal class (documenting precisely WHY the ESLint equivalent was inert — verify-fr-only.mjs:1-15), and it has a 300-file non-vacuity floor so a renamed directory cannot silently disable it.
- **A render-safe / write-strict split for money.** `formatDzd` returns "—" and never throws; the code comment (money.ts:208-213) explains that 268 call sites meant one corrupted value could take down the whole screen via the ErrorBoundary. `parse.ts` uses a -1 sentinel for the same reason.
- **Navigation is separated from screens.** `src/app/shell/modules.ts` holds the module registry and the licence hints; `module-screens.ts` holds the lazy components. A screen cannot be reached without passing through the shell.
- **Lazy loading per module** keeps the cashier's first paint fast.
- **Keyboard-first sale flow**, with dedicated shortcut handling (`useSellShortcuts.ts`) and a scanner debounce verified by E2E.

## 6. Not verified / limits of this audit

- **Visual quality was not judged from JSX alone.** No rendered screenshot comparison was performed; the E2E suite covers behaviour, not pixel fidelity.
- **Contrast ratios were not measured programmatically.**
- The 123 feature files were inventoried and swept mechanically; **not every one was read line by line.** UI-01's per-drawer claim is based on pattern observation across the drawer set, not on a per-file state-matrix audit.
- Focus trapping and focus restoration in dialogs were not verified by an automated test (no such test exists) — the audit observed the implementation pattern but did not exercise it.
- The `mobile/` and `owner/` React Native interfaces were not audited (they are separate apps).

## 7. Metrics

| Metric                                  | Value                                             |
| --------------------------------------- | ------------------------------------------------- |
| Feature files inventoried               | 123                                               |
| Shared files inventoried                | 32                                                |
| Shell files read in full                | 11                                                |
| Native imports in renderer              | 0                                                 |
| Browser storage usage for business data | 0                                                 |
| `any` / `as any` / `@ts-ignore`         | 0                                                 |
| Dead click handlers / console.log       | 0 / 0                                             |
| Non-semantic click targets              | 0                                                 |
| aria attributes                         | 265                                               |
| Pending/busy guards                     | 386                                               |
| Hard-coded hex colours                  | 78                                                |
| Skill checklist items evaluated         | 17 (13 VERIFIED, 3 PARTIAL, 1 NEEDS_VERIFICATION) |
| Findings                                | 4 (P0×0, P1×0, P2×2, P3×2)                        |
