# Project Facts to Verify Before Implementation

This file prevents historical details from being mistaken for current repository facts. Fill it from the live codebase before substantial engineering work.

| Fact | Verify from | Current status |
|---|---|---|
| Electron, Node, React, TypeScript, SQLite driver versions | package manifests, lockfiles, build config | Must verify |
| Main/preload/renderer entry paths | source tree and Electron config | Must verify |
| Renderer-to-main bridge API | preload exports, IPC registry, contracts | Must verify |
| Current migration version and naming | migration directory, runner, live DB metadata | Must verify |
| Migration hash/immutability tooling | scripts and CI configuration | Must verify |
| SQLite journal mode, FK enforcement, backup mechanism | DB initialization/runtime tests | Must verify |
| Money minor-unit scale, rounding, bounds | domain code, schema, tests, product policy | Must verify |
| Quantity scale and packaging conversion | domain code, schema, product policy | Must verify |
| Inventory valuation method and layer model | stock repositories, schema, tests, approved ADR | Must verify |
| Business timezone/date-only semantics | time utilities, DB types, boundary tests | Must verify; do not assume fixed UTC+1 |
| Cash/Z report source ledgers and formulas | repositories, report tests, accounting decisions | Must verify |
| Current active modules and removed modules | navigation, module registry, product scope | Must verify |
| License format, algorithm, keys, capability catalog | licensing code, resource files, build manifests | Must verify |
| Release signing/update configuration | builder/updater config, certificates policy | Must verify |
| Printer models, thermal protocol, A4/PDF engine | hardware inventory, print code, physical tests | Must verify |
| Supported barcode symbologies and QR purpose | product workflow and hardware tests | Must verify |
| Google Sheets bridge access layer and authorization | bridge/API configuration, security tests, ADR | Must design/verify |
| Customer identity and recovery workflow | product requirements, trusted API code | Must design/verify |
| Logging, retention, telemetry consent | logger config, product policy | Must verify |
| Quality scripts, coverage, CI gates | package scripts and CI workflows | Must verify |

## Historical claims that must not be copied blindly

The V1 skill bundle contains exact paths, migration numbers, table names, trigger names, script commands, thresholds, capability counts, and Supabase-specific implementation details. These may have been correct for one snapshot, but they are not automatically correct now. Verify each against code and accepted ADRs before reusing it.

Particularly important:

- Do not hardcode a `+1 hour` timezone transform. Use a named timezone policy and test boundaries.
- Do not assume a previously mentioned next migration number is still next.
- Do not assume Supabase is the selected V1 customer bridge; Google Sheets is the approved V1 intermediary direction.
- Do not assume a legacy module or license capability remains active.
- Do not assume a test/quality command exists until checked in `package.json` and CI.
