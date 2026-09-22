# ADR-028 — Frontière de sécurité monétaire unique H-1 (RADICAL REPAIR)

## Statut

Accepté — 2026-09-19 (phase RADICAL REPAIR).

## Problème

Les calculs vérifiaient `Number.isInteger` seulement, sans garantir
`Number.isSafeInteger` ni plafonds. Une facture volumineuse (200 lignes ×
prix×quantité) pouvait dépasser `Number.MAX_SAFE_INTEGER` : les valeurs
unitaires restaient valides mais le cumul perdait silencieusement en
précision — corruption financière invisible. De plus, `dzdInputToMinor`
rendait `NaN` comme valeur « valide », chaque appelant devant s'en souvenir.

## Cause racine

Pas de frontière centrale : chaque module (vente, pain, proforma, entrée,
zakat, FIFO, clôture, remises) appliquait ses propres contrôles partiels
(`isInteger`, `isFinite`, parfois rien), et l'accumulation (`+=`, `reduce`)
n'était gardée nulle part. Zod bornait l'entrée IPC (0..1e9) mais le domaine
pouvait encore déborder en cumulant.

## Décision : frontière unique `src/domain/money/money.ts`

- `MAX_MINOR_SINGLE = 1e9` (10M DZD — miroir du validateur IPC `moneyMinor`).
- `MAX_MINOR_TOTAL = 1e11` (100M DZD cumulé — fail-closed bien avant 9e15).
- Primitives : `assertSafeMinor` (fini + safeInteger + bornes),
  `assertSafeTotal` (cumulés), `addSafeMinor`/`sumSafeMinors` (addition
  gardée itérative), `multiplyMinorByQuantity` + `percentOfMinor` avec garde
  anti-débordement AVANT `Math.round`.
- `parseDzdInputStrict` : entrée valide → Money valide, entrée invalide →
  `MoneyError` contrôlée (jamais NaN). `dzdInputToMinor` historique conservé
  (plafonné H-1) car 15 appelants UI vérifient déjà `isFinite` — migration
  complète interdite ici (risque de throw pendant le rendu).
- Tous les modules migrés : sales, bread, proforma, intake, returns,
  product, FIFO (coûts + marges), closings (perte documentée comme résultat
  négatif légal), suppliers, debts, CSV-import (strict), OCR
  (`MAX_MINOR` 1e12 → 1e9 aligné IPC ; montants négatifs → null), zakat
  **chemin vivant** `features/zakat/types.ts:computeZakatLocal` (le doublon
  `domain/finance/zakat.ts` n'a jamais existé dans l'arbre — constat
  d'audit : le script QA l'importait à tort, corrigé vers la frontière).
- Défense en profondeur : IPC (Zod 0..1e9) + Domaine (ici) + DB (CHECKs +
  triggers 0003/0023/0026).

## Invariant nouveau

Aucune opération financière ne peut produire : NaN, ±Infinity, entier
unsafe, dépassement, ni négatif là où interdit — sinon erreur FR contrôlée
avant toute persistance.

## Tests

- `tests/unit/money-safety.test.ts` (10) : plafonds, débordement avant
  `Math.round`, 200 lignes OK vs facture explosive refusée, parser strict,
  overdue, clôture négative documentée, zakat.
- `scripts/quality/verify-domain.ts` : assertion `parseDzdInputStrict`.
- `scripts/quality/verify-perf.mjs` : seuils inchangés (commit 13ms < 150ms).

## Risque régression

Faible : bornes alignées sur les contrats existants (IPC 1e9, quantité 1M) ;
seuls les cumuls-pathologiques (>1e11) changent — d'un résultat faux
silencieux vers un refus FR explicite (voulu).
