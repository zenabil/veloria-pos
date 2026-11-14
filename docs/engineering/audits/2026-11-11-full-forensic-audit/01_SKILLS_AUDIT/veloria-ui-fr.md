# veloria-ui-fr â€” Skill Audit

**Audit ID:** `2026-11-11-full-forensic-audit`  
**SKILL.md read in full:** yes  
**References read in full:** yes (see Scope)  
**Skill loaded via skill tool:** yes

## 1. Verdict

The French POS interface is well built: 17 lazy-loaded screens, a single shell module registry, French-only literals enforced by a real codepoint-based gate with a non-vacuity floor, DZD formatting delegated to the shared money module, and 268+ defensive format call sites that never throw. The recurring weakness is missing error/empty states on secondary panels and the absence of automated accessibility assertions.

## 2. Scope covered

SKILL.md + references/design-system.md; src/app/shell/* (11); src/features/* (123); src/shared/ui|formatters|dates|errors|company|documents|export|printer|sales|settings|charts|sound|types (32); src/styles; index.html.

## 3. Skill checklist result

| Criterion                                                            | Status       | Evidence                                                                                  |
| -------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| All user-facing strings follow approved French terminology           | **VERIFIED** | verify:fr scans 351 files, 0 Arabic/â‚¬ literals, 1 documented OCR exception              |
| No raw stack traces, SQL errors or exception messages reach the user | **VERIFIED** | src/shared/errors/fr-map.ts + ipc-client.ts:28                                            |
| Numbers and dates formatted consistently                             | **VERIFIED** | formatDzd/formatDzdTotal/formatDzdTotalSigned from src/domain/money; business-day helpers |
| Renderer never imports Electron/Node/SQLite                          | **VERIFIED** | grep over src/ => 0 matches                                                               |
| No business data in LocalStorage/IndexedDB                           | **VERIFIED** | grep localStorage                                                                         | sessionStorage | indexedDB over src/ => 0 matches |
| Loading, success, empty, offline, permission, error states           | **PARTIAL**  | Present on major screens; gaps on secondary panels â€” see 06_UI_FR.md                    |
| Double submission prevented on mutating forms                        | **PARTIAL**  | Present on the sale flow; not universal â€” see 06_UI_FR.md                               |
| Accessible names, roles, contrast, focus visibility                  | **PARTIAL**  | No automated a11y gate exists â€” see 06_UI_FR.md                                         |
| No unbounded lists                                                   | **VERIFIED** | pagination enforced in main (paginationSchema) for history/sales/customers                |
| Bad optional display values must not crash a page                    | **VERIFIED** | formatDzd returns 'â€”' instead of throwing (money.ts:214-222)                            |

## 4. Findings raised by this skill

No skill-level contradiction was found. The skill's rules are implementable and, where checkable, already implemented in the codebase. Domain-level defects discovered while auditing this skill's subject matter are reported in the corresponding `03_SKILL_AUDITS/` file and are cross-referenced there.

## 5. What is genuinely solid

- verify-fr-only.mjs is a real gate, not a token scan: it uses codepoint ranges and a 300-file non-vacuity floor, and documents WHY the ESLint equivalent was inert (verify-fr-only.mjs:1-15).
- Shell module registry (src/app/shell/modules.ts) separates navigation/licence-hint from the screen component (module-screens.ts), so a screen cannot be reached without passing the shell.
- Lazy loading per module (16 chunks) keeps the cashier's first paint fast.

## 6. Not verified / limits of this audit

- Visual quality was NOT judged from JSX alone; no browser-rendered screenshot comparison was performed in this audit pass (E2E specs cover behaviour, not pixel fidelity).
- Contrast ratios were not measured programmatically.

## 7. Metrics

- Checklist items evaluated: **10** â€” VERIFIED: 7, PARTIAL: 3
- Skill-level findings owned by this skill: **0**
- Domain findings owned by this skill: see `03_SKILL_AUDITS/`

---

_Part of the `2026-11-11-full-forensic-audit` skill-by-skill forensic audit. Companion: `SKILLS_SYSTEM_AUDIT.md` (system-level analysis) and `../04_CROSS_SKILL_AUDIT.md` (inter-skill conflicts)._
