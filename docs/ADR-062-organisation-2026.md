# ADR-062 — Organisation moderne 2026 (FSD + Clean Arch, sans remaniement)

Date : 2026-10-03. Statut : accepté (Phase A3 clôturée, pipeline vert).

Note : le plan initial réservait `ADR-062` au Print Studio ; l'organisation
étant clôturée avant, ce numéro lui revient — le Print Studio prendra `ADR-063`.

## Recherche (2025-2026 + Context7)

- FSD (article Nov 2025) : tranches autonomes, couches → bas, dépendances
  explicites, jamais de cycle. Veloria : déjà `features/<domaine>/` +
  `application/` + `domain/` + `shared/` + `electron/` — conforme.
- Smashing local-first (Mai 2026) + Expo local-first : SQLite locale source
  de vérité, sync = miroir jetable. Veloria : SQLite unique (AGENTS §1),
  `cloud/supabase` miroir lecture seule (ADR-053), `mobile` cache offline
  d'abord (ADR-055) — conforme.
- Electron officiel (Context7 `/electron/electron`) : `ipcMain.handle` +
  `ipcRenderer.invoke` wrappé par canal via `contextBridge`, jamais
  `ipcRenderer` brut exposé. Veloria : `preload.ts` wrappe par
  `domain.action` + Zod (`channels/validators/registry`) — conforme.
- Expo monorepos 2025-2026 : workspaces partagés quand les trains de release
  sont couplés. Veloria : POS (Electron/Node 22) + APK (Expo/EAS) découplés,
  `mobile/` hors `tsc` racine (ADR-051/052) — migration `pnpm/Turbo` REJETÉE
  (couplage sans gain, risque release).

## Audit (preuves, pas d'opinion)

- Graphe inter-features (scan exhaustif `from` sur `src/`) :
  `sales→customers`, `customers→{debts,history,returns}` (types),
  `products|stock→suppliers` (leaf-dialog), `settings→license` (label).
  ZÉRO cycle (DFS), zéro store→store.
- `src/domain` : 0 import `react`/`electron`/`better-sqlite3`/`node:`.
- `electron/` : 0 import vers `src/` (miroirs volontaires : `PO_TRANSITIONS`,
  `isRealCalendarDate`, `paymentMethodLabel` — parité par tests).
- Renderer : 0 import `electron`/`better-sqlite3`/`node:`/`ipcRenderer`.
- `mobile/src` : 0 import vers `src/`/`electron/` (duplication volontaire
  `format.ts`/`i18n.ts`, toolchain séparée).

## Décisions

1. AUCUN déplacement de fichiers (l'arbre est déjà la cible).
2. Conventions figées dans `docs/STRUCTURE.md` §8 (liste blanche d'arêtes).
3. Garde automatique : `tests/unit/a3-organisation.test.ts` (5 tests : graphe
   - pureté domaine + isolation electron/renderer/mobile).
4. Renommage `use-busy.ts` → `modal-guard.ts` REFUSÉ (14 fichiers, gain nul).
5. Barrel `*Dialogs.tsx` conservés (points d'entrée stables, tous vivants).

## Preuves

- `tests/unit/a3-organisation.test.ts` 5/5.
- Pipeline : `lint --max-warnings 0` + `format:check` + `typecheck` + `test`
  - `verify:migrations` + `build` verts (voir rapport de phase).
