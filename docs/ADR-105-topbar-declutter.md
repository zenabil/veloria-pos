# ADR-105 — Allègement du bandeau de caisse (TopBar)

## Contexte

Le bandeau (`src/app/shell/TopBar.tsx`, 222 lignes) accumulait réglages et
décorations : bascules thème/densité (réglages posés, pas d'urgence caisse),
bouton Aide (tirets déjà permanents au pied de page + `[F2]` documenté sur le
sélecteur d'impression), pastilles statiques (`Session active`, `Caisse`,
`Poste vendeur`, icône `User` inerte) en doublon du bandeau session
(`App.tsx`, nom + rôle + `Changer d'utilisateur`), et numéro de version
SQLite en pleine vente.

## Décision

- Thème/densité → `Paramètres → Système → Affichage` (`DisplaySection`,
  `SettingsSectionsB.tsx`) ; hooks + clés déplacés vers la source partagée
  `src/shared/ui/theme-density.ts` (les features n'importent jamais
  `app/shell`, sens shell→features préservé) ; `shell-types.ts` réexporte
  (compatibilité) ; `use-theme.ts`/`use-density.ts` supprimés.
- Aide `[?]` + `HelpModal` supprimés (tirets déjà au pied de page via
  `footer-hints.ts`, `[F2]` sur le sélecteur) ; `helpOpen`/`onHelp` retirés.
- Pastilles statiques + icône `User` supprimées (doublon du bandeau session).
- Badge SQLite réduit au voyant + `SQLITE · WAL` (version en infobulle) ;
  version complète déplacée en `Paramètres → Données → Moteur`.
- Conservés : logo, `LicenseBadge` + بانر الانتهاء, module courant,
  sélecteur 80mm/A4 `[F2]`, `Horloge`, notifications.

## Conséquences

- Bandeau : 13 → 8 éléments, 5 props supprimées (`TopBarProps`).
- Aucun changement métier/DB/IPC ; FR-only et offline-first inchangés.

## Fichiers affectés

- `src/shared/ui/theme-density.ts` (nouveau), `src/app/shell/shell-types.ts`,
  `src/app/shell/TopBar.tsx`, `src/app/shell/App.tsx`,
  `src/app/shell/ShellOverlays.tsx` (−`HelpModal`),
  `src/features/settings/SettingsSectionsB.tsx` (+`DisplaySection`, +`Moteur`),
  `src/features/settings/SettingsScreen.tsx`
- Supprimés : `src/app/shell/use-theme.ts`, `src/app/shell/use-density.ts`
