# ADR-071 — Parité monétaire entière POS ↔ Client + quantités décimales

Date : 2026-10-07 — Audit radical tri-programmes (POS + Manager + Client).

## Contexte

- POS : `src/domain/money/money.ts` utilisait `minor / 100` (float) dans
  `formatDzd` et `minorToInput`, et `src/domain/invoice/timbre-rules.ts`
  comparait `totalMinor / 100` (float) aux seuils DA.
- Client : `mobile/src/views.ts` `num()` tronquait via `Math.trunc`
  (12.9 → 12, 1.5 kg → 1), avec dérivation `qty * unit` sans arrondi.
- POS quantités = NUMERIC 3 décimales (`0001`, `quantity.ts`, validators) ;
  le miroir (`client-access.repo.ts`) pousse les décimales intactes.
- Conséquence : perte sèche 0.5 kg + total dérivé faux de 1000 centimes
  (1.5 × 1999 = 2999 affiché 1999), et dette corrompue affichée plausible.

## Décision

1. **Argent 100 % entier** : `formatDzd`/`minorToInput` en arithmétique entière
   (major `Math.trunc(abs/100)`, cents `abs % 100`, groupement Intl sur entier
   seul). `timbreQuittanceLf2025` compare des centimes entiers
   (`300*100`, `30_000*100`, `100_000*100`). Parité vérifiée :
   `formatDzd(1250000) === formatMinor(1250000, "fr")` (U+202F identique).
2. **Quantités vs montants séparés côté Client** : `num()` STRICT (non-entier →
   fallback, jamais `trunc`), nouveau `numQty()` (fini, 0..1M, arrondi 3
   décimales — miroir de `roundQuantity`). `toDetail`/`toHome`/`App.tsx`
   utilisent `numQty` pour `quantity`, `Math.round(qty * unit)` pour le total
   dérivé (même règle que `multiplyMinorByQuantity`).
3. **Contrats** : `tests/unit/mobile-views.test.ts` verrouille strict + kg ;
   `tests/unit/money.test.ts` verrouille `minorToInput` identique au legacy +
   round-trip.

## Alternatives rejetées

- Arrondi `Math.round` dans `num()` : masque la corruption (12.9 → 13 plausible).
- Garder `trunc` + commentaire : mensonge silencieux, interdit (règle 4).
- `toFixed`/float centralisé : viole « jamais de float pour la monnaie ».
- Copier `money.ts` dans `mobile/` : duplication inter-runtime ; on unifie par
  arithmétique entière identique + test de parité, pas par copier-coller.

## Conséquences

- POS/Client affichent le même montant au centime, sans float.
- 1.5 kg survit POS → Supabase → Client.
- `validate-env` reste fail-closed (placeholders EAS refusés) — risque résiduel,
  pas un bug.
