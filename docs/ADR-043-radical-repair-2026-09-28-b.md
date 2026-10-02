# ADR-043 — Réparation radicale 2026-09-28 (audit total, zéro mockup métier)

Date : 2026-09-28. Statut : accepté.

## Contexte

Audit exhaustif demandé (chaque dossier, fichier, ligne) : recherche de mockups,
données fictives, violations AGENTS.md, failles IPC/Zod/atomicité/idempotence,
config build/package, couverture tests.

## Constats

- Aucun mockup métier dans `src/` : 0 `MOCK_*`/`FAKE_*`/`DEMO_*`, 0 `TODO/FIXME`,
  0 `console.log` commercial. Les seuls « exemples » sont l'aperçu d'impression
  (`Article/Client/Fournisseur exemple`, `PAY-00000`) avec identité réelle
  (`useCompany`), explicitement badgé « Exemple ».
- `stitch_veloria_pos_desktop_system/` (37 fichiers) : archive design non référencée,
  non empaquetée (absente de `electron-builder.yml`/`vite.config`). Conservée comme
  référence, jamais livrée.
- Tests : 65 fichiers / 410 tests verts. `vi.mock` unique légitime
  (`startup-flow`), fixture négative `fake.jpg` (test logo invalide) légitime.
- 8 défauts réels corrigés (voir Décision). Aucune migration modifiée (AGENTS §11).

## Décision

1. `package.json` : `build:manager` ESM-safe
   (`node --input-type=commonjs -e "require('fs')..."`) — l'ancien
   `node -e "require(...)"` échouait sous `"type": "module"`.
2. `package.json` : `verify:domain` → `node --experimental-strip-types ...`
   (Node 22.5–22.17 exige le flag ; 22.18+/26 l'acceptent).
3. `package.json` : nouveau `build:pos`
   (`tsc -p tsconfig.json --noEmit && tsc -p tsconfig.electron.json && vite build`)
   pour ne plus casser le POS sur une erreur Manager.
4. `docs/ADR-016` : titre corrigé (`ADR-018` → `ADR-016`).
5. `electron/printing/printing.service.ts` : `printing.listPrinters`, `printer.get`,
   `printing.testPage` valident `emptyPayloadSchema.parse(raw ?? {})` (AGENTS §3).
6. `electron/backup/backup.service.ts` : `backup.create` valide `raw ?? {}`
   (au lieu de `{}` figé) ; `vacuumInto` refuse aussi `;` et `--` (conforme au
   commentaire, chemin interpolé dans littéral SQL).
7. `electron/security/security.ts` : `isSystemDeniedPath` généralisée à tout
   lecteur (`D:\Windows`…) + racines Unix sensibles.
8. `electron-builder.yml` : `tesseract.js-core/**/*` en wildcard (anti-casse au bump).
9. `vite.license-manager.config.ts` : mêmes alias `@/@domain/@shared/@features`.
10. `electron/ipc/handlers/carts.repo.ts` : `clearCartDraftsAtomic` en transaction
    (cohérence nominale ; alias `clearCartDrafts` conservé).

## Conséquences

- `typecheck` + `typecheck:electron` + `typecheck:manager` verts.
- `verify:migrations` vert (31/31), `verify:domain` vert.
- `vitest` : 65 fichiers / 410 tests verts.
- Aucune donnée fictive ajoutée ou conservée dans le runtime livré.
