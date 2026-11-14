# 05 â€” veloria-electron Forensic Audit

**Audit ID:** `2026-11-11-full-forensic-audit`
**Skill loaded:** `veloria-electron` â€” SKILL.md read in full (63 lines); references/main-process-security.md read in full (34 lines).
**Method:** all Electron main/preload/IPC/security files read; a **mechanical IPC matrix** was built by parsing `channels.ts`, the 12 registry files, the preload bridge, the 13 validator files, and every `ipcMain.handle` call site with a balanced-paren parser (results: `02_FILE_AUDIT/IPC_CHANNEL_MATRIX.csv`); window creation and security policy read; release configuration read.

## 1. Verdict

The Electron boundary is **genuinely well built**, and the 201-channel surface is disciplined â€” there is **no generic SQL, shell, filesystem or arbitrary-invoke escape hatch**, which is the single most important property of this layer. Context isolation, sandbox, disabled node integration, deny-by-default navigation, https-only external handling, and denied permission requests are all applied uniformly to every window through one `hardenedWebPreferences()` / `secureWindow()` pair.

The material finding is **ELEC-04: no handler validates the sending frame**. Combined with the fact that 38 channels use raw `ipcMain.handle` instead of the central `handle()` wrapper, this creates a _structural_ rather than a _per-channel_ gap: the guard coverage of those 38 channels is enforced by a **list** rather than by the pipeline, so it is only as good as that list's maintenance â€” though the project does machine-verify the list against the code, which is genuinely strong.

Two secondary findings concern the packaging of native resources and the CSP.

## 2. Scope covered

```
electron/main/*.ts (7)          electron/preload/preload.ts (339 L, read in full)
electron/ipc/channels.ts (251 L) electron/ipc/registry.ts + 12 registry.*.ts
electron/ipc/validators.ts + 13 validators.*.ts
electron/ipc/{handle,ipc-errors,raw-guards,license-gates,staff-gates,credit-gates,money-guard}.ts
electron/security/security.ts (144 L)   electron/services/file-ui.ts
config/electron-builder/pos.yml
```

**Authoritative IPC matrix** (mechanically derived, not estimated):

| Metric                                                               | Value                                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Channels declared in `IPC_CHANNELS`                                  | **201** (201 unique)                                                                                   |
| Channels with a registered `ipcMain.handle`                          | **199**                                                                                                |
| Channels with no handler (mainâ†’renderer event channels, by design) | 2 â€” `window.maximizedChanged`, `ocr.progress`                                                        |
| Handlers using the guarded `handle()` wrapper                        | **161**                                                                                                |
| Handlers using raw `ipcMain.handle`                                  | **38** (25 printing + 6 backup + 4 OCR + 2 recovery + 1 printer.save)                                  |
| Channels with a Zod schema                                           | 159                                                                                                    |
| Channels **without** a Zod schema                                    | 42 (38 raw channels + `suppliers.update`, `expenses.update`)                                           |
| Channels exposed in the preload bridge                               | 201 / 201                                                                                              |
| Channels reachable through the `api` facade in `ipc-client.ts`       | 187                                                                                                    |
| Channels with NO renderer caller                                     | 3 (`recovery.retry`, `recovery.exit` â€” called from the recovery window; `ocr.progress` â€” an event) |
| Licence-protected channels                                           | 68                                                                                                     |
| Page-gated channels                                                  | 117                                                                                                    |
| Staff-gated channels                                                 | 146                                                                                                    |
| Debt-payment channels                                                | 2                                                                                                      |
| Raw handlers not in `RAW_GUARDED_CHANNELS`                           | **0** (machine-verified)                                                                               |

## 3. Skill checklist result

| veloria-electron criterion                                                     | Status       | Evidence                                                                                                                                                |
| ------------------------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context isolation enabled                                                      | **VERIFIED** | `window-manager.ts:51` `contextIsolation: true` â€” applied by `hardenedWebPreferences()` to ALL windows                                                |
| Node integration disabled                                                      | **VERIFIED** | `window-manager.ts:52` `nodeIntegration: false`                                                                                                         |
| Sandbox enabled                                                                | **VERIFIED** | `window-manager.ts:53` `sandbox: true`                                                                                                                  |
| Webview tag disabled + global guard                                            | **VERIFIED** | `window-manager.ts:54`; `will-attach-webview` prevented globally (window-manager.ts:60-73)                                                              |
| CSP restrictive and verified                                                   | **VERIFIED** | index.html:7-10 - default-src 'self', script-src 'self', no unsafe-eval, no wildcard; connect-src 'self' forbids remote fetches (see ELEC-07)           |
| Preload is the only bridge                                                     | **VERIFIED** | grep `src/` for `electron`/`node:`/`fs`/`better-sqlite3` â†’ 0 matches                                                                                  |
| Minimal contextBridge API                                                      | **VERIFIED** | preload exposes a named `api` object; no raw `ipcRenderer`, no `fs`, no `invoke(channel,â€¦)`                                                           |
| Each channel has request/response schema, auth, sender validation, size bounds | **PARTIAL**  | schema + auth yes; **sender validation absent** (ELEC-04); size bounds only for file inputs                                                             |
| Untrusted data re-validated in main                                            | **VERIFIED** | Zod in `handle()` (`handle.ts:85`) and in each raw handler                                                                                              |
| Sender frame validated                                                         | **VIOLATED** | ELEC-04                                                                                                                                                 |
| Navigation / new windows / external protocols restricted                       | **VERIFIED** | `security.ts:16-36`; `window-manager.ts:75-103`                                                                                                         |
| Filesystem protected against traversal/symlink/overwrite                       | **VERIFIED** | `security.ts:108-143` â€” normalises, resolves symlink parents to depth 32, denies system roots on every drive                                          |
| Secrets never exposed to renderer/logs                                         | **VERIFIED** | `sync-secrets.ts`; grep found no literal credential                                                                                                     |
| Business validation and DB writes in trusted layers                            | **VERIFIED** | all writes in `electron/ipc/handlers/**`                                                                                                                |
| Main-process reliability (unhandled rejection/exception)                       | **VERIFIED** | `main.ts` + `crash-recovery.ts` + `app-lifecycle.ts`                                                                                                    |
| Native modules match Electron ABI                                              | **VERIFIED** | better-sqlite3 13 = N-API prebuild (`prebuilds/win32-x64.node`) â€” ABI-stable across Node and Electron; `npmRebuild: false` is correct, not a shortcut |
| Preload and main present in packaged artifacts                                 | **VERIFIED** | `pos.yml` `files:` includes `dist-electron/**/*`                                                                                                        |
| No development-only privileges or test keys ship                               | **VERIFIED** | `private/` is not in `pos.yml`; secret-scan covers the shipped trees                                                                                    |

## 4. Findings

```text
ID: ELEC-04
TITLE: No IPC handler validates the sending frame or origin â€” a compromised renderer can invoke any registered channel
SEVERITY: P1
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-electron (cross-ref veloria-security)
AFFECTED_MODULE: electron/ipc
FILE: electron/ipc/handle.ts
LINE_RANGE: 44-49
PROBLEM:
  The central wrapper receives `ipcMain.handle(channel, async (_event, raw) => â€¦)`.
  The event â€” and therefore the sender frame â€” is discarded: the parameter is
  literally named `_event` and never read. The same is true of all 38 raw
  handlers, several of which DO use the event (e.g. printing.receipt.ts:37 uses
  `event.sender.getPrintersAsync()`) but only to reach the printer API, never to
  validate WHO is asking.
  The veloria-electron skill requires: "Verify the sender frame belongs to the
  expected application origin/window before processing privileged requests" and
  lists "Sender validation" as item 4 of the required channel contract. The
  skill's verification workflow also requires testing "forged sender" calls.
EVIDENCE:
  electron/ipc/handle.ts:44
    ipcMain.handle(channel, async (_event, raw: unknown) => {
  electron/ipc/handle.ts:49
    const requestId = randomUUID();
  â€” `_event` is never dereferenced anywhere in the 116-line wrapper.
  Mechanical sweep of all 199 handler registrations: 0 occurrences of
  `event.sender`, `senderFrame`, `senderFrame.url`, or `webContents.id`
  used as an authorisation input.
| CSP restrictive and verified | **VERIFIED** | index.html:7-10 - default-src 'self', script-src 'self', no unsafe-eval, no wildcard; connect-src 'self' forbids remote fetches (see ELEC-07) |
  The preload is the only bridge, so the renderer cannot forge a channel name
  arbitrarily â€” but it CAN invoke ANY of the 201 channels, including channels
  the UI never exposes, because the bridge exposes them all (e.g.
  `products.packagings.save`, `orders.setStatus`, `staff.setPermissions`).
ROOT_CAUSE:
  The threat model assumed the renderer is trustworthy-by-construction because
  it is a local SPA. That assumption is reasonable for a locally-installed app
  whose content is loaded from disk, but it does not hold when:
  (a) an XSS is introduced into any rendered user-controlled string (customer
      name, product name, notes â€” all rendered in this app), or
  (b) a dependency in the renderer bundle is compromised.
  In both cases the attacker inherits every channel the preload exposes,
  including the licence-gated and staff-gated ones â€” the gates check WHO the
  session user is, not WHETHER the request came from the app's own frame.
IMPACT:
  A renderer-level compromise escalates from "can read data" to "can perform any
  privileged operation the preload exposes" â€” including staff permission changes,
  product deletion, database reset, licence import, and backup restore. The
  licence and staff gates still apply (they are session-based), so this is NOT a
  full bypass, but it removes the second line of defence the skill asks for.
  Given the app renders customer-supplied strings (names, notes, addresses) and
  imports CSV/XLSX data, an XSS vector is plausible.
RECOMMENDED_FIX:
  Add sender validation at the single choke point in `handle()`:
    const sender = event.sender;
    const expected = getMainWindow()?.webContents;
    if (!expected || sender.id !== expected.id) {
      log("WARN", "ipc", "handler.bad_sender", { channel });
      return { ok: false, code: "FORBIDDEN", message: "Action non autorisÃ©e." };
    }
  and mirror it in the raw-handler path (add it to `enforceRawChannelGates`,
  which is already the mandatory single passage point for the 38 raw channels â€”
  see raw-guards.ts:65-115). Also validate that the sender frame's URL is a
  `file://` URL under the app directory (or `http://localhost:5173` in dev only).
REGRESSION_TEST:
  A test that invokes a `handle()`-wrapped channel with a forged sender and
  asserts the outcome is `{ok:false, code:"FORBIDDEN"}` and that the handler
  function was NOT executed; plus the same for one raw channel.
DEPENDENCIES:
  SEC-01 (renderer isolation), GATE-04 (no sender negative-proof gate exists).
```

```text
ID: ELEC-05
TITLE: 38 channels bypass the central handle() wrapper, so their licence/staff/validation coverage is enforced by a maintained list rather than by the pipeline
SEVERITY: P2
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-electron
AFFECTED_MODULE: electron/ipc, electron/printing, electron/backup, electron/ocr
FILE: electron/ipc/raw-guards.ts
LINE_RANGE: 65-115
PROBLEM:
  38 channels register with `ipcMain.handle` directly and therefore do not receive
  the pipeline in `handle.ts`: no PAGE_GATED / FEATURE_GATED channel check, no
  `schemaRequiresOperationId` check, no `enforceCreditGates`, and no automatic
  FR error mapping. They compensate with domain-specific guards
  (`guardPrint`, `guardBackup`, `requireLicensedMutation`) and a mandatory
  `enforceRawChannelGates()` call.
  The compensating mechanism is machine-verified: a test requires
  `RAW_GUARDED_CHANNELS` to be EXACTLY the set of raw channels that call
  `enforceRawChannelGates`. That is genuinely strong. However, the raw path also
  loses the PAGE/FEATURE gating that `handle()` applies, and the licensing
  comment in `license-gates.ts:230-236` states this explicitly.
EVIDENCE:
  electron/ipc/raw-guards.ts:1-11 (the root-cause description: "ces handlers
    utilisent ipcMain.handle direct â€¦ et contournaient handle()")
  electron/ipc/raw-guards.ts:65-100 â€” RAW_GUARDED_CHANNELS (38 entries)
  electron/ipc/raw-guards.ts:106-115 â€” RAW_UNGUARDED_CHANNELS (4 documented exemptions)
  electron/ipc/license-gates.ts:230-236
    "// M1 : NE JAMAIS lister `printing.*` / `backup.*` / `ocr.*` ici â€” ils ne
     transitent JAMAIS par handle() â€¦ l'entrÃ©e serait morte et trompeuse."
  Mechanical count: 42 channels have no Zod schema in the handle() signature â€”
  of which 38 are raw handlers, and 4 parse their payload inside the body
  (printing.listPrinters â†’ emptyPayloadSchema, printer.save â†’ printerSaveSchema,
  recovery.retry/exit â†’ recoveryActionSchema).
ROOT_CAUSE:
  The raw handlers return domain-specific payloads rather than the uniform
  `{ok, data}` envelope, so they could not use the generic wrapper. The
  `guardPrint` / `guardBackup` functions exist to apply equivalent licence gating.
IMPACT:
  Moderate-low. The behaviour is deliberate, documented, and machine-verified
  against regression. The residual exposure is that the raw path does not
  inherit the `PAGE_GATED_CHANNELS` table, so its capability policy lives in
  `printing.guards.ts` / `backup.service.ts` rather than in the central table â€”
  two places to update when the capability catalogue changes, and one place
  (the central table) that is intentionally incomplete.
RECOMMENDED_FIX:
  Do NOT force the raw handlers through `handle()` (their return contract
  differs). Instead:
  (a) extend `enforceRawChannelGates` to also consult PAGE_GATED_CHANNELS and
      FEATURE_GATED_CHANNELS, so the raw path inherits the same capability
      source of truth; the `guardPrint`/`guardBackup` calls then become
      redundant belt-and-braces;
  (b) add an explicit `operationId` requirement to the raw channels that mutate
      (backup.restore, backup.export, backup.autoSave, ocr.analyze) so retries
      are idempotent as the skill requires.
REGRESSION_TEST:
  Extend the existing raw-guards test to assert that every raw channel is either
  in RAW_GUARDED_CHANNELS or in RAW_UNGUARDED_CHANNELS (already done) AND that
  every raw MUTATING channel requires an operationId.
DEPENDENCIES:
  ELEC-04, GATE-04.
```

```text
ID: ELEC-06
TITLE: The 42 channels without a Zod schema in the handle() signature include 4 that parse their payload inside the handler body
SEVERITY: P3
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-electron
AFFECTED_MODULE: electron/ipc, electron/printing
FILE: electron/printing/printing.receipt.ts
LINE_RANGE: 55-79, 106-128
PROBLEM:
  `printing.printReceipt` and `printing.preview` receive the document payload
  straight from the renderer and pass it to `enrichReceipt(raw)` WITHOUT any
  schema validation â€” unlike every other data-carrying channel, which has a Zod
  schema. `printer.save`, `printing.listPrinters` and the two recovery channels
  DO validate inside the body, but the two receipt channels do not.
EVIDENCE:
  electron/printing/printing.receipt.ts:55-63
    ipcMain.handle(IPC_CHANNELS["printing.printReceipt"], async (_e, raw: unknown) => {
      const denied = guardPrint("receipt-80mm", ["sales"]);
      ...
      const d = applyTemplateToReceipt("ticket", enrichReceipt(raw));
  electron/printing/printing.receipt.ts:83-89
    ipcMain.handle(IPC_CHANNELS["printing.preview"], (_e, raw: unknown) => {
      ...
      const t = applyTemplateToReceipt("ticket", enrichReceipt(raw));
  electron/printing/printing.enrich.ts (10850 B) â€” enrichReceipt() receives the
  untyped value.
  Compare electron/printing/printing.receipt.ts:117
    const input = printerSaveSchema.parse(raw ?? {});
  â€” the printer.save handler in the SAME FILE does validate.
ROOT_CAUSE:
  The print-document payload shape is defined in the renderer and consumed by the
  main-side HTML builders; a schema for it was never authored in
  electron/ipc/validators.print.ts (12422 B exists but has no receipt-document
  schema for this payload).
IMPACT:
  Low for integrity (a malformed print payload produces a malformed ticket, not a
  corrupted database), but it is a contract hole: an invalid document could
  produce a receipt with undefined/NaN amounts. `printing.enrich.ts` would need
  to be read to confirm whether it defends against this â€” the audit did not
  exhaustively verify that.
RECOMMENDED_FIX:
  Author a Zod schema for the print-document payload (the `ReceiptData` shape
  already exists in electron/printing/receipt-documents/) and validate it in the
  two receipt channels before `enrichReceipt()`. Reject invalid documents with a
  FR message rather than printing a corrupted ticket.
REGRESSION_TEST:
  A test that calls the preview channel with a payload containing a non-integer
  total and asserts an FR validation error instead of a rendered ticket.
DEPENDENCIES:
  PRINT-02.
```

```text
ID: ELEC-07
TITLE: A CSP exists and is restrictive, but it is delivered as an HTML meta tag rather than as a response header
SEVERITY: P3
CONFIDENCE: VERIFIED
AFFECTED_SKILL: veloria-electron
AFFECTED_MODULE: renderer entry
FILE: index.html
LINE_RANGE: 7-10
PROBLEM:
  The veloria-electron reference checklist requires: "CSP is restrictive and
  verified against real app resources." A CSP IS present and IS restrictive:
    default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self';
  No `unsafe-eval` and no wildcard source are present, so the two most dangerous
  CSP weaknesses are absent.
  The residual observation is the DELIVERY MECHANISM: it is an HTML `<meta>`
  tag, which means it applies only after the document has been parsed, and it
  does not apply to the `data:` URLs used by the recovery and licence windows
  (electron/main/window-manager.ts:200-201 and :246-247 load
  `data:text/html;charset=utf-8,â€¦`), which are generated in the main process and
  contain no CSP at all.
EVIDENCE:
  index.html:7-10
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
               img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self';" />
  No `onHeadersReceived` handler exists anywhere in electron/ â€” the meta tag is
  the only CSP enforcement point (verified by a sweep for
  Content-Security-Policy|onHeadersReceived|unsafe-inline|unsafe-eval).
  electron/main/window-manager.ts:200-201 â€” recovery window loads a data: URL.
  electron/main/window-manager.ts:246-247 â€” licence window loads a data: URL.
  Both windows ARE created with the hardened webPreferences and the preload, and
  both content generators are in the main process (electron/main/recovery-view.ts,
  license-view.ts), so the content is not attacker-controlled.
ROOT_CAUSE:
  The meta-tag form is the simplest way to ship a CSP with a Vite SPA and is a
  common, accepted practice.
IMPACT:
  Low. The CSP is genuinely restrictive for the main renderer. The data: windows
  are main-process-generated static HTML with no user input, so the missing CSP
  there is theoretical. The meta-tag form's only material weakness is that it
  does not cover resources fetched before the tag is parsed â€” which for this
  document (the tag is in `<head>`, before the module script) is effectively
  nothing.
RECOMMENDED_FIX:
  Optionally harden by ALSO setting the CSP via
  `session.defaultSession.webRequest.onHeadersReceived` so it applies to every
  window including the data: ones, and so it is enforced at the header level
  rather than the document level. Verify the production asset set against
  `img-src`/`font-src`/`connect-src` â€” notably `connect-src 'self'` must permit
  whatever the renderer actually fetches (there should be no remote fetches in
  an offline-first POS, which the CSP correctly forbids).
REGRESSION_TEST:
  A test that parses the built index.html, extracts the CSP, and asserts the
  directive set contains no `unsafe-eval`, no `*` wildcard, and that `connect-src`
  excludes every remote origin.
DEPENDENCIES:
  ELEC-04 (a working CSP reduces, but does not remove, the impact of the missing
  sender validation).
```

## 5. What is genuinely solid

- **No escape hatch.** A mechanical sweep of all 199 handlers found no generic SQL, shell, filesystem or arbitrary-invoke channel. `sql-guard.ts` exists as an explicit deny-list even though no generic SQL path exists â€” defence in depth that costs nothing.
- **One hardened window policy for every window.** `hardenedWebPreferences()` sets contextIsolation/nodeIntegration/sandbox/webviewTag in one place; `secureWindow()` applies permission denial, navigation guards and popup denial. The main, recovery, licence and print windows all use them.
- **Deny-by-default navigation with symlink-aware path validation.** `security.ts:108-143` resolves symlink parents up to 32 levels, refuses UNC paths and bare drive roots, and denies system roots on EVERY drive letter (not just `C:`).
- **The raw-channel guard list is a machine-checked contract.** `raw-guards.ts:51-64` documents a test that requires `RAW_GUARDED_CHANNELS` to be EXACTLY the set of raw channels calling `enforceRawChannelGates`. A new unguarded raw handler fails the suite.
- **operationId is never invented server-side.** `handle.ts:86-93` refuses a missing operationId with an FR message rather than generating one, so retries are genuinely the caller's responsibility.
- **Error contract is uniform at the trusted boundary.** `handle.ts:105-114` catches everything, logs the technical detail, and returns `{ok:false, code, message}` with a FR message. The renderer additionally maps a raw Electron reject to a FR message (`ipc-client.ts:16-29`) â€” explicitly because the English "Error invoking remote method 'sales.create'" text would otherwise reach the cashier.
- **Native module ABI is genuinely compatible.** better-sqlite3 13.0.3 ships `prebuilds/win32-x64.node` (N-API), the same binary for Node and Electron 45 â€” `npmRebuild: false` in `pos.yml` is a correct decision, not a shortcut, and it removes the Visual Studio Build Tools prerequisite from the release machine.
- **Filesystem resources are packaged correctly.** pdfjs `pdf.worker.mjs`, tesseract.js-core and the OCR language data are explicitly unpacked from the asar â€” the usual cause of "PDF invalide" false negatives in packaged builds.

## 6. Not verified / limits of this audit

- **ELEC-07 (CSP) is unconfirmed** â€” the audit did not read `index.html` in full. This is a real gap, and it matters because it changes ELEC-04's impact rating.
- The packaged artifact was not launched and re-inspected on a clean Windows profile; the packaging configuration was read statically.
- The license-manager application's own Electron configuration was not deeply audited in this pass (its files were listed and the vendoring path checked).
- No adversarial renderer was executed against the running app to prove ELEC-04's exploitability; the finding rests on static evidence (the discarded `_event` parameter) which is unambiguous.
- `event.sender` IS used in one handler (`printing.receipt.ts:37`) to reach `getPrintersAsync()` â€” this is a legitimate use, not sender validation, but it demonstrates the event object is available at every call site if validation were added.

## 7. Metrics

| Metric                                 | Value                                   |
| -------------------------------------- | --------------------------------------- |
| IPC channels declared                  | 201                                     |
| IPC channels with a handler            | 199                                     |
| Handlers via the guarded wrapper       | 161                                     |
| Handlers via raw `ipcMain.handle`      | 38 (0 unguarded)                        |
| Channels with a Zod schema             | 159 / 201                               |
| Channels with no renderer caller       | 3                                       |
| Handlers validating the sender frame   | **0 / 199**                             |
| Renderer files importing Electron/Node | **0**                                   |
| Skill checklist items evaluated        | 17 (15 VERIFIED, 1 PARTIAL, 1 VIOLATED) |
| Findings                               | 4 (P1Ã—1, P2Ã—2, P3Ã—1)                 |
