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
11. Record significant decisions in `docs/ADR-*.md`; phase progress in `docs/reports/PHASE_X_REPORT.md`.
12. Migrations are IMMUTABLE once applied to any database: never edit `database/migrations/*.sql` in place (checksum guard refuses to open drifted databases). Every schema change is a NEW numbered migration + `verify-migrations` green.
13. Skill-first (mandatory auto-activation): on EVERY prompt/task, with no exceptions and without being asked, first analyze the request, then load the matching skill(s) with the skill tool BEFORE acting — never start work first and load later. The Veloria project skills (`.opencode/skills/`) take precedence over general knowledge; installed OpenCode skills (`~/.agents/skills/`) come next. **The routing table below is the single source of truth for Veloria skill selection** — pick the narrowest matching specialist(s) from it, never the whole set; a task spanning several layers, or whose affected layer is uncertain, goes to `veloria-orchestrator`, which routes to the specialists it needs and loads nothing else. Add `veloria-gates` whenever behaviour, data, security or packaging can change. On conflict, Veloria rules 1–12 override generic skills.
14. Skill auto-routing table for generic (non-Veloria) skills (extends rule 13, same mandatory force): React → `vercel-react-best-practices`; Tailwind → `tailwind-design-system`; TypeScript → `typescript-best-practices`; Playwright/E2E → `playwright-cli` + `playwright-best-practices` + `webapp-testing`; unit/integration tests → `tdd`; review → `code-review`; SQL perf → `sql-optimization`; PDF → `pdf`; Electron/packaging → `electron-development`; codebase/architecture questions → `graphify`; consequential decisions → `llm-council`; missing capability → `find-skills` (`npx skills find`); dead-code/cleanup audit → `codebase-cleanup-audit` (audit first, never auto-delete); design/polish/animate/visual effects → `impeccable` (run its `context` once per session, read `craft-floor.md` before any UI edit); SQLite patterns/security/FTS/perf → `sqlite-database-expert` as reference only, `veloria-db` stays binding; debugging/errors/exceptions → `bug-detective` (hypothesis → experiment → fix → regression test, FR messages per rule 6); ambiguous multi-path decisions → `council` (fast by default, `pipeline` 6+1+1 for high-stakes); any task matching none of the above → load `dragon`, read its `references/index.md`, open the matching skill and follow it, all before acting. Do not announce the routing unless a skill matched and changed the approach.
15. **Scope strict (règle de non-dispersion)** : une tâche qui ne mentionne ni module, ni dossier, ni fonction à traiter est interprétée comme un périmètre STRICT. Dans ce cas : ne travailler QUE sur les fichiers/dossiers explicitement nommés, ne pas chercher à comprendre les autres modules, ne pas lire ni scanner du code hors périmètre, ne pas créer de tâches ni d'agents de fond hors périmètre. Les règles 1-14 s'appliquent toujours — mais uniquement à l'intérieur du périmètre délimité par la demande initiale.
16. **Compétences auto-vérifiées (ADR-178)** : les compétences du projet (`.opencode/skills/**`), les agents (`.opencode/agents/**`) et les commandes (`.opencode/commands/**`) sont **vérifiés** par `npm run verify:docs` : standard Agent Skills (`name` = nom du dossier, minuscules-tirets ; `description` ≤ 1024 caractères), corps non vide, et **aucun chiffre périmé** (un chiffre faux dans une compétence devient une instruction fausse exécutée par l'agent). Compétence nouvelle ou modifiée ⇒ `npm run verify:docs` vert ; toute compétence citée dans cette table de routage doit **exister**. Compteurs du projet (migrations, canaux, tests, ADR) : `docs/METRICS.md` (source unique, générée).

## Table de routage des compétences Veloria

Source unique du **choix de compétence pour chaque tâche**. Le bloc entre les
marqueurs ci-dessous est vérifié par `npm run verify:docs` : une compétence
installée mais absente de cette table fait rougir la porte (l'agent ne la
chargerait jamais), et une compétence citée ici doit exister sur le disque.

<!-- SKILL-ROUTING:START -->

| Compétence              | Charger quand la tâche porte sur… (déclencheurs)                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `veloria-orchestrator`  | tâche transverse (plusieurs composants ou couches), périmètre ou couche incertaine, conflit de règles, arbitrage de priorité, avant toute modification large   |
| `veloria-db`            | SQLite, schéma, migration SQL, table, index, trigger, CHECK, repository, transaction, `operationId`, requête, `verify-migrations`                              |
| `veloria-money`         | montant, centimes DZD, total, remise, taxe, paiement, remboursement, facture, prostate, formatage DZD, arithmétique financière, parité renderer/main/SQL       |
| `veloria-stock`         | stock, réception/entrée, conditionnement carton, unité de base, FIFO, couche de coût, ajustement, inventaire, retour fournisseur, quantité                     |
| `veloria-electron`      | processus principal Electron, preload, IPC, channels, fenêtre, `webContents`, navigation, permission, service natif, module natif, runtime empaqueté           |
| `veloria-ui-fr`         | renderer React, écran, formulaire, tableau, dialogue, navigation, ergonomie caissier, clavier, tactile, thème, design system, français, `window.veloria`       |
| `veloria-slice`         | fonctionnalité nouvelle ou modifiée de bout en bout (UI → use case → domaine → repo → migration → test), tranche verticale                                     |
| `veloria-gates`         | test, porte de vérification, audit, régression, acceptation, preuve, script de contrôle, « la garde peut-elle vraiment échouer ? »                             |
| `veloria-closing`       | clôture Z, fin de journée, session de caisse, réconciliation tiroir, écart de caisse, zakat, nisab, liasse propriétaire, période close, verrou                 |
| `veloria-license`       | licence `.vlic`, activation hors ligne, signature Ed25519, clé publique, clé privée, empreinte appareil, capability, plan, anti-rollback, anti-suppression     |
| `veloria-sync`          | pont application client, Google Sheets V1, outbox, rejeu, file de sortie, APK client, isolation des données client, rejet HTTP, idempotence de synchronisation |
| `veloria-release`       | build Windows, installateur, electron-builder, signature de binaire, version, notes de version, mise à jour, rollback de version, `package:win`                |
| `veloria-backup`        | sauvegarde, restauration, instantané de base, rétention, export/import, réplication, reprise après incident, protection des données                            |
| `veloria-printing`      | impression, ticket 80 mm, facture PDF, A4, proforma, code-barres, QR, étiquette, aperçu avant impression, rendu PDF                                            |
| `veloria-security`      | revue de sécurité, modèle de menace, secret, clé, credential, surface d'attaque, accès non autorisé, fuite de données, frontière de confiance                  |
| `veloria-hardware`      | scanner code-barres, imprimante thermique, tiroir-caisse, balance, adaptateur périphérique, connexion matériel, pilote, test de matériel                       |
| `veloria-observability` | log, journalisation, diagnostic, crash, métrique, bundle de support, santé de l'application, traçabilité d'exécution, support helpdesk                         |

<!-- SKILL-ROUTING:END -->

**Comment choisir (procédure, dans cet ordre) :**

1. **Classer** la tâche : couche concernée (base, argent, stock, renderer, Electron,
   impression, licence, synchronisation, build, sauvegarde, sécurité, matériel,
   diagnostic) et type (fonctionnalité, correction, audit, documentation).
2. **Choisir la ou les lignes** dont les déclencheurs correspondent à la demande.
   Prendre la ligne la plus **spécifique** : `veloria-money` pour un total,
   `veloria-db` pour la migration qui l'héberge — pas les deux « au cas où ».
3. **Ajouter `veloria-gates`** si le changement touche le comportement, les
   données, la sécurité ou l'empaquetage.
4. **Transverse ou incertain ?** Charger `veloria-orchestrator` : il route vers
   les spécialistes nécessaires et n'en charge que ceux-là.

**Ne jamais charger toutes les compétences.** Les fichiers `references/` d'une
compétence sont un support : on ne les lit que si la compétence le demande.
Matrice détaillée : `.opencode/skills/veloria-orchestrator/references/task-routing.md`.
Registre et politique d'activation : `governance/SKILLS_REGISTRY.md`.

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
