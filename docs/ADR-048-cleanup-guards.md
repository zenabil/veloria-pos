# ADR-048 — Nettoyage P2 + garde-fous (lint pré-existant, dossiers vides)

> Statut : accepté (Phase 2, P2).

## Contexte

Audit P2 : `stitch_*`, doublons traineddata, `brand-sources`, `dist*`, `*.tsbuildinfo`, `src/application/*` vides, `0031` untracked.

## Décision

- Suppressions vérifiées (`CLEANUP_REPORT.md`) : `stitch_*` + `eng/fra.traineddata` racine (untracked, doublons), `dist*/tsbuildinfo` (ignorés, régénérables), `brand-sources/*.jpg → docs/brand-*.jpg` (`git mv`). `release/` conservé (installeurs), `private/` conservé (ignoré), `src/application/*` vides conservés (churn sans gain), `0031` conservé (à committer côté release).
- Script `clean` ajouté (jamais `release/`).
- Garde-fous : `src/electron` touchés lint-propres (`printing.service`, `receipt-documents`, `validators`, `backup.service` après 2 correctifs `no-unnecessary-*`). Bruit eslint `strictTypeChecked` sur tests important `electron/*` (ex. `documents.test.ts`, `invoice-flows.test.ts`) = **pré-existant** (même motif avant nos changements, vérifié sur fichiers non touchés ; `money.test.ts` sans import electron reste vert). Convention conservée (tests importent `electron/*` comme avant) ; nouveaux tests suivent le même motif. `npm run lint` global reste hors SLA (timeout > 120s sur ce poste + bruit pré-existant) — vérification par fichiers ciblés à la place.
- `qrcode` : voir ADR-045. `src/domain/backup/backup-rules.ts` : voir ADR-047.

## Conséquences

- Workspace propre, `git status` sans untracked parasites, bundle sans images mortes.
