# PHASE 13 — Découpe P2 (suite) : widgets Dashboard + Reports (2026-10-02)

> Suite de PHASE 12. Composants présentationnels purs déplacés verbatim, comportement identique.

## Livré

1. **`dashboard/widgets.tsx`** : `RecentCard/RecentRow/EmptyMini` extraits de `DashboardScreen.tsx` (~42 l.).
2. **`reports/widgets.tsx`** : `ReportSectionCard/MiniTable` extraits de `ReportsScreen.tsx` (~54 l.). `cn` retiré des imports de l'écran (devenu inutile — `tsc noUnusedLocals` + `eslint` verts).

## Gardes

`format` ✓ · `typecheck` ✓ · `unit` 438 ✓ · `eslint` fichiers touchés ✓.
