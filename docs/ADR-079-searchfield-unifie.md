# ADR-079 — SearchField unifié (12 zones de recherche)

## Contexte

Audit design-system : ~15 zones de recherche (`div.relative` + icône
`Search` + `TextInput pl-9`) copiées à l'identique, seules les chaînes FR
et les handlers différaient. DeuxSound exclusions volontaires :
`Sidebar` (filtre sans icône) et `SellCustomerPanel` (icône `User` +
`title` FR — un remplacement aurait changé les deux).

## Décisions

1. **`SearchField` dans `primitives.tsx`** : props `value/onChange/
placeholder/ariaLabel/inputRef?/onKeyDown?/trailing?/className?/
inputClassName?` (défaut `pl-9`). `ref` passé par spread conditionnel
   (`exactOptionalPropertyTypes`).
2. **12 sites convertis** (chaînes FR copiées à l'octet, handlers/refs
   intacts) : Suppliers/Returns/History(header)/Expenses/Debts/Stock/
   Proformas/Products/Bread/Clients/AdjustmentDialog/SellSearchPanel
   (avec `trailing={<Kbd>}` + `pl-10 pr-20` conservés).
3. **Un delta pixel assumé** : icône SellSearchPanel `17 → 16` (cœur de
   l'unification). `Toolbar` Historique sans icône laissée telle quelle.

## Conséquences

- Net : ~22 lignes en moins, une seule source pour position d'icône/retrait.
- Index docs mis à jour (ADR-079).

## Vérification

`prettier` propre, `tsc -b` + `electron` verts, `eslint` vert,
`vitest` 659/659, `build` + `build:electron` (re-signature) verts,
e2e `sale-flow` + `stock-backup` + `customer-invoice` 9/9 (recherche
exercée partout).
