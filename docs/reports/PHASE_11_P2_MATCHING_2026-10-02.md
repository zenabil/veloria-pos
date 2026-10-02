# PHASE 11 — Découpe P2 (suite) : `client-matching` + clarté OCR (2026-10-02)

> Suite de PHASE 10. Comportement strictement identique, prouvé par tests.

## Livré

1. **`client-matching.ts`** (`src/features/customers/client-matching.ts`) extrait de `ClientDialogs.tsx` (1846 l., plus gros fichier après `SellScreen`) : `normFr/asMinor/asCreatedAt/matchClient/keepClient` + `tests/unit/client-matching.test.ts` (5 tests). `historyKindOf` conservé dans l'écran (dépend de `KIND_LABELS` importée).
2. **Clarté OCR** : `minorToInput` locale de `OcrImportDialog.tsx` (2 décimales fixes « 12,50 », 1 usage) renommée `minorToFixedInput` + commentaire distinguant du helper domaine (« 12,5 ») — les deux round-trip via `parseDzdInputStrict`. Collision de nom future impossible (erreur TS au import).

## Gardes

`format` ✓ · `typecheck` ✓ · `unit` 435 ✓ (430 + 5) · `eslint` fichiers touchés ✓.
