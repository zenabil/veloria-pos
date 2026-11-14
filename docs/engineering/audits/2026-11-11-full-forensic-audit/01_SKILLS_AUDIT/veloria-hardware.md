# veloria-hardware â€” Skill Audit

**Audit ID:** `2026-11-11-full-forensic-audit`  
**SKILL.md read in full:** yes  
**References read in full:** yes (see Scope)  
**Skill loaded via skill tool:** yes

## 1. Verdict

Only one hardware class is genuinely implemented â€” thermal/A4 printing via Electron's print APIs â€” plus keyboard-wedge barcode input handled in the renderer. There is NO device adapter layer, no cash drawer support, no weighing scale support and no device discovery/discovery-contract code. The skill prescribes an adapter architecture that does not exist, so the skill and the codebase disagree about scope.

## 2. Scope covered

SKILL.md (52 L) + references/device-adapter-contract.md; electron/printing/printing.capabilities.ts, printing.printer-settings.ts, printing.watchdog.ts, printing.guards.ts; src/features/sales/sell/sell-search.ts (scanner input), useSellShortcuts.ts; electron/ocr/*; tests/e2e/{scan-flow,barcode-uppercase,carton-barcode}.spec.ts.

## 3. Skill checklist result

| Criterion                                                                            | Status             | Evidence                                                                                                                                |
| ------------------------------------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Define a device capability interface separate from business logic                    | **NOT_FOUND**      | No adapter interface; printing calls Electron print APIs directly                                                                       |
| Explicit discovery, connect, disconnect, status, operation, timeout, error contracts | **PARTIAL**        | Only printer list/selection (printing.printer-settings.ts) and a print watchdog exist                                                   |
| Normalize vendor-specific behavior in adapters                                       | **NOT_APPLICABLE** | No vendor-specific protocol is implemented                                                                                              |
| Prevent duplicate scan events and accidental double submissions                      | **VERIFIED**       | debounce + 'scan sans EntrÃ©e' logic verified by E2E ('scan sans EntrÃ©e : deux scans rapprochÃ©s (180 ms) â†’ deux lignes')            |
| Keep device failures from corrupting committed transactions                          | **VERIFIED**       | print failures return an outcome and never affect the sale transaction                                                                  |
| Make connection failures visible and actionable in French                            | **VERIFIED**       | printing.guards.ts maps every failure to an FR message                                                                                  |
| Support keyboard-wedge behavior with focus management and scan detection             | **VERIFIED**       | scan-flow.spec.ts: 'scan connu : ajout direct unique, mÃªme sans focus (rafale + EntrÃ©e)' and 'scan inconnu : message FR, aucun ajout' |
| Cash drawer trigger tied to an authorized completed transaction                      | **NOT_FOUND**      | No drawer code exists                                                                                                                   |
| Validate scale readings as untrusted sensor input                                    | **NOT_FOUND**      | No scale code exists                                                                                                                    |
| Test disconnect/busy/permission-denied/reconnect                                     | **NOT_FOUND**      | No such tests; no adapter to test                                                                                                       |
| Real-device acceptance recorded                                                      | **NOT_FOUND**      | No physical acceptance record in the repository                                                                                         |

## 4. Findings raised by this skill

- **SKILL-06** â€” full finding block in `01_SKILLS_AUDIT/SKILLS_SYSTEM_AUDIT.md` Â§3.

## 5. What is genuinely solid

- Barcode handling is genuinely robust for the wedge case: unknown codes produce an FR message and add nothing (verified by E2E), and rapid double-scans are disambiguated.
- Printer selection is persisted with an operationId, and the printer is re-checked for availability before each print (assertConfiguredPrinterAvailable).
- Print failures are surfaced to the operator rather than swallowed.

## 6. Not verified / limits of this audit

- NO physical scanner, thermal printer, cash drawer or scale was attached to this host â€” every hardware-dependent behaviour is MANUAL VALIDATION REQUIRED.
- Printer model/driver/paper-width compatibility was reasoned from code only.

## 7. Metrics

- Checklist items evaluated: **11** â€” NOT_FOUND: 5, PARTIAL: 1, NOT_APPLICABLE: 1, VERIFIED: 4
- Skill-level findings owned by this skill: **1**
- Domain findings owned by this skill: see `03_SKILL_AUDITS/`

---

_Part of the `2026-11-11-full-forensic-audit` skill-by-skill forensic audit. Companion: `SKILLS_SYSTEM_AUDIT.md` (system-level analysis) and `../04_CROSS_SKILL_AUDIT.md` (inter-skill conflicts)._
