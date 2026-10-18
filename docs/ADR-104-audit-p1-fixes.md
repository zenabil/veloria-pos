# ADR-104 — Correctifs P1 audit 2026-10-15 (argent dormant, lastError FR, focus douchette)

## Contexte

Audit radical 2026-10-15 (zéro P0 confirmé : argent INTEGER partout,
atomicité + idempotence systématiques, `verify-migrations` vert, aucun
`run-sql`, renderer sans Node/SQL). Trois P1 restants exigent un correctif
racine avec preuve (double-submit/rollback/FR).

## Décisions

### 1. Garde discountType fail-closed (MONEY-ROOT)

`createSaleAtomic` (`electron/ipc/handlers/sales.repo.ts`) conservait une
branche `discountType === "percent"` stockant un taux flottant (ex. 2.5) dans
la colonne INTEGER `discount_value_minor` (commentaire DB-10 historique).
La remise vit dans les lignes (P0-7) ; le registre IPC force `"none"` et le
schéma Zod n'accepte aucun discountType : la branche était dormante mais
constituait le seul chemin float→DB du périmètre.
Décision : refus explicite FR en première ligne de la transaction
(`Type de remise non pris en charge (remises par lignes uniquement).`) —
fail-closed, rollback trivial (rien d'écrit).
Alternative rejetée : `Math.round` des deux branches (corromprait le taux 2.5→3
et masquerait un appelant illégitime).

### 2. lastError synchro toujours FR (règle 6)

`sync.service.ts` persistait `err.message` brut + détail serveur HTTP brut
(anglais/JSON) dans `lastError`, affiché tel quel par
`SettingsSectionsB.tsx:883`. Double correctif (défense en profondeur) :
source — détail serveur au log technique uniquement, message persisté via
`toUserMessage` (`electron/ipc/ipc-errors.ts`) ; ceinture UI — `frError`
sur l'affichage (couvre les valeurs techniques stockées avant le correctif).

### 3. Refocus recherche après article libre (ergonomie douchette)

`addCustomProduct` (`src/features/sales/sell/sell-search.ts`) fermait le
dialogue sans refocaliser la recherche (contrairement à `addProduct`) :
la frappe douchette suivante ne partait nulle part.
Décision : `d.searchRef.current?.focus()` miroir (null-safe).

## Conséquences

- Aucun float ne peut atteindre une colonne `*_minor` (garde testée).
- `Dernière erreur` n'affiche plus que du FR (repli `Poussée impossible.`).
- Cadence douchette préservée après article libre.
- Docs : `ADR-NEW-*` réimmatriculés `ADR-101/102/103` (séquence 001→104 sans trou).

## Fichiers affectés

- `electron/ipc/handlers/sales.repo.ts` (+ `tests/integration/sale-discount-type-guard.test.ts`)
- `electron/sync/sync.service.ts`, `src/features/settings/SettingsSectionsB.tsx`
  (+ `tests/unit/sync-error-fr.test.ts`)
- `src/features/sales/sell/sell-search.ts` (+ `tests/unit/sales/sell-split.test.ts`)
- `docs/ADR-101/102/103*` (renommage), `docs/INDEX.md`, `docs/GLOSSARY.md`,
  `docs/ADR-075-dead-code-radical-cleanup.md`, `handoff.md`
