# 04 — Technology Stack

## Technology policy

Use stable production releases available at implementation time, pin exact versions in `package-lock.json`, and upgrade only through a controlled dependency update process.

As of **2026-09-14**, the official sources show:

- React 19.3 is current and stable.
- Next.js 16.3 is the active LTS line and the supplied project is already on the 16.x generation.
- Node.js 24.21.0 is LTS; Node 26 is Current. Production development/tooling should prefer the LTS line.
- Electron 44 is the current stable line on the published schedule; Electron 45 is scheduled for stable later in 2026.
- Tailwind CSS 4.3 is current.
- SQLite 3.53.4 is the latest SQLite release listed by the official SQLite site as of this audit.

Official references:

- React: https://react.dev/blog
- Next.js: https://nextjs.org/blog
- Node.js releases: https://nodejs.org/en/about/previous-releases
- Electron releases: https://releases.electronjs.org/schedule
- Tailwind CSS: https://tailwindcss.com/blog
- SQLite: https://sqlite.org/

## Required stack

### UI / renderer

- React 19.3+
- TypeScript strict mode
- Next.js 16.3+ App Router or a controlled static-export-compatible setup
- Tailwind CSS 4.3+
- Radix UI primitives or an equivalent accessible component foundation
- Lucide icons
- Zustand for narrow client state
- React Hook Form + Zod for complex forms and validation where justified
- Recharts for analytical charts

### Desktop

- Electron 44 stable line at project creation time, or a newer supported stable line selected only after native-module compatibility is verified.
- Secure preload bridge
- Electron main process written in TypeScript
- Electron builder for Windows packaging

### Database

- SQLite 3.x
- `better-sqlite3` as the Node/Electron SQLite driver, provided its native ABI is rebuilt specifically against the target Electron version
- SQL migrations under source control

### Tooling

- Node.js 24 LTS for development/build environment
- npm 11.x compatible with the lockfile and package policy
- ESLint
- Prettier
- Vitest for unit/integration tests
- Playwright or an equivalent desktop/web E2E strategy for critical workflows
- TypeScript compiler
- dependency audit tooling

## Technology decisions

### Why SQLite

SQLite is embedded, self-contained, transactional, and suited to a local POS workload. The official project describes it as a small, fast, self-contained, full-featured, high-reliability SQL database engine.

### Why better-sqlite3

It provides direct synchronous SQLite access that is suitable for short, deterministic database operations in the Electron main process. Heavy report work should be optimized/query-batched so the UI remains responsive.

### Why Electron

Electron gives direct access to Windows printing, files, native device adapters, application lifecycle, and packaging while allowing a modern React UI.

### Why not a browser database

The desktop product should have one authoritative persistence model. Keeping a second browser database creates migration, consistency, and debugging complexity.

## Native-module rule

Every native dependency must have:

- exact version pinning
- target Electron version documented
- reproducible rebuild step
- CI build validation
- packaged runtime smoke test

`better-sqlite3` must never be built only for the host Node version when the runtime is Electron.
