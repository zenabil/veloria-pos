# ADR-078 — Unification UI sûre : Switch + couleurs tokens (audit design-system)

## Contexte

Audit design-system (3 passes : structures `features/`, tokens/styles,
`mobile/src`) : ~600 lignes dupliquées confirmées, zéro régression visuelle
tolérée. Exécuté : le lot sûr (confiance 90–95 %, sorties identiques
vérifiées site par site). Différé avec motif : tout ce qui change le rendu
ou exige un choix visuel (voir § Non fait).

## Décisions (exécuté)

1. **`Switch` nu dans `primitives.tsx`** : source unique des 9
   interrupteurs de formulaires (products/suppliers ×2/clients/retours/
   pain/reports ×2) + bouton interne de `SwitchRow` (`settings/bits.tsx`).
   Même DOM/classes/aria qu'avant ; `SwitchRow` garde son API (ligne
   libellée). Vérifié : `credit-return` e2e (switch Crédit) + `sale-flow`
   verts, `tsc` a purgé les imports `cn` devenus morts (4 fichiers).
2. **Couleurs hors palette → tokens** : `#141d33` → `#122131`
   (surface-container, menus Stock/Proformas), `#34d399` → `#4edea3`,
   `#f87171` → `#ffb4ab`, `#818cf8` (série Marge) → `#8ed0ff`
   (tertiary-container). Zéro hex hors palette restant dans `src/`
   (hors aperçu papier N&B volontaire).
3. **Non fait (évalué, motif documenté)** : `FormFooter` (12 libellés/
   conditions `disabled` divergents — plumbing props > gain), mini-labels
   `text-[11px]` ×25 (no-op visuel, 25 edits), fusions Drawers/PaymentDialog/
   FormDialog (charges domaines distinctes — voir audit), `widgets`
   dashboard/reports (composants réellement distincts), tout `mobile/src`
   (lot séparé : helpers `invoiceUi`/`useRefresh`/`share.ts`, Kit adoption,
   clés i18n mortes — à chiffrer en workstream mobile dédié avec shots).

## Conséquences

- `role="switch"` restant unique : le primitif lui-même.
- Index docs mis à jour (ADR-078).

## Vérification

`prettier` propre, `tsc -b` + `electron` verts (zéro import mort),
`eslint --max-warnings 0` vert, `vitest` 659/659, `build` + `build:electron`
(re-signature) verts, `credit-return` + `sale-flow` e2e 6/6.
