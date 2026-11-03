# AGENTS.md — Veloria PoS Contributor Rules

1. SQLite (`Veloria POS DB.sqlite`) is the ONLY business source of truth. No Dexie/IndexedDB/Firebase/Sheets/LocalStorage for business data.
2. Renderer never imports Electron/Node/SQLite. Only `window.veloria` typed bridge.
3. No generic `run-sql` IPC. Add explicit `domain.action` channels + Zod validators.
4. Money = integer centimes (DZD). All sale/payment/stock/customer mutations are atomic (one transaction) with idempotency `operationId`.
5. Domain is framework-free. Use cases are explicit + testable. Repositories use prepared statements.
6. French-only UI. No raw exceptions to users; map to FR messages + log technical details.
7. Vertical slices: UI → use case → domain → repo → migration → test.
8. After structural changes: format → typecheck → tests → build.
9. Native modules: document Electron target; verify packaged runtime loads better-sqlite3.
10. End of EVERY task (mandatory): update `handoff.md` (current-state §1 + a session section), then commit the task's work (`docs(handoff): ...` kept as its own commit when the tree is otherwise clean; otherwise an explicit checkpoint commit). Always inspect `git status` first — pre-staged files from earlier sessions would be swept in.
11. Record significant decisions in `docs/ADR-*.md`; phase progress in `PHASE_X_REPORT.md`.
12. Migrations are IMMUTABLE once applied to any database: never edit `database/migrations/*.sql` in place (checksum guard refuses to open drifted databases). Every schema change is a NEW numbered migration + `verify-migrations` green.
13. Skill-first (mandatory auto-activation): on EVERY prompt/task, with no exceptions and without being asked, first analyze the request, then load the matching skill(s) with the skill tool BEFORE acting — never start work first and load later. Project skills (`.opencode/skills/`: `veloria-db`, `veloria-slice`, `veloria-ui-fr`) and installed OpenCode skills (`~/.agents/skills/`) take precedence over general knowledge. Mapping: sale/payment/stock/customer/migration → `veloria-db` + `veloria-slice`; renderer/UI → `veloria-ui-fr`; React → `vercel-react-best-practices`; Tailwind → `tailwind-design-system`; TypeScript → `typescript-best-practices`; Playwright/E2E → `playwright-cli` + `playwright-best-practices` + `webapp-testing`; unit/integration tests → `tdd`; review → `code-review`; SQL perf → `sql-optimization`; PDF → `pdf`; Electron/packaging → `electron-development`; codebase/architecture questions → `graphify`; consequential decisions → `llm-council`; missing capability → `find-skills` (`npx skills find`). On conflict, Veloria rules 1–12 override generic skills.
14. Skill auto-routing table (extends rule 13, same mandatory force): dead-code/cleanup audit → `codebase-cleanup-audit` (audit first, never auto-delete); design/polish/animate/visual effects → `impeccable` (run its `context` once per session, read `craft-floor.md` before any UI edit); SQLite patterns/security/FTS/perf → `sqlite-database-expert` as reference only, `veloria-db` stays binding; debugging/errors/exceptions → `bug-detective` (hypothesis → experiment → fix → regression test, FR messages per rule 6); ambiguous multi-path decisions → `council` (fast by default, `pipeline` 6+1+1 for high-stakes); any task matching none of the above → load `dragon`, read its `references/index.md`, open the matching skill and follow it, all before acting. Do not announce the routing unless a skill matched and changed the approach.
15. **Scope strict (règle de non-dispersion)** : une tâche qui ne mentionne ni module, ni dossier, ni fonction à traiter est interprétée comme un périmètre STRICT. Dans ce cas : ne travailler QUE sur les fichiers/dossiers explicitement nommés, ne pas chercher à comprendre les autres modules, ne pas lire ni scanner du code hors périmètre, ne pas créer de tâches ni d'agents de fond hors périmètre. Les règles 1-14 s'appliquent toujours — mais uniquement à l'intérieur du périmètre délimité par la demande initiale.

## Parallel work — scratch isolation (MANDATORY)

When several agents or subtasks work on this repository at the same time, each worker keeps its own scratch state. Share `src/`, `electron/`, `database/` as read-only inputs; never let two workers write the same scratch path. Per-worker isolated scratch: (1) one dedicated OS temp dir for generated previews, exports, PDFs, screenshots and diffs; (2) one separate SQLite copy or transaction namespace per worker; (3) one dedicated temporary Git branch named after the task — the branch is removed once the task is finished. A worker NEVER reads or writes another worker's temporary files, database copies or branches. Never reuse `handoff.md`, `test-results/`, `coverage/`, `graphify-out/` or a shared `Veloria POS DB.sqlite` as a coordination channel or scratch space between parallel workers — merge results only in the normal branch/history flow.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:

- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
