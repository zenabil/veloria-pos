# ADR-060 — Audit UI trilingue : POS + License Manager + Client (doublons, langue, couleurs)

Date : 2026-10-03
Statut : Accepté

## Contexte

Audit demandé des trois interfaces : POS (`src/`), License Manager
(`license-manager/renderer/`), Client mobile (`mobile/src/`).
Trois familles de défauts : boutons dupliqués, langue non-française,
couleurs incohérentes — plus terminologie, RTL et accessibilité.

## Décision

1. POS (FR uniquement, règle 6) : casse phrase + `et` dans les 15 titres
   (`Historique des ventes et transactions`, …), `MODULE` → `Module`,
   `Email` → `E-mail`, boutons d'export explicites
   (`Exporter PDF/Excel/CSV`, `Exporter tout (CSV)` vs `Exporter la sélection`),
   suppression des deux doublons fonctionnels (bouton `Sauvegarder` redondant
   en Base de données, champ `Préfixe factures` miroir en section Vente),
   navigation unifiée (`Caisse`, `Catalogue` → `Références et prix`,
   `Proformas` → `Devis`), `Valider et encaisser`, e2e mis à jour en miroir.
2. License Manager (FR) : suppression du bouton `Sauvegarder` dupliqué du header,
   `Pages autorisées` / `Fonctions autorisées`, statuts/types/offres/éditions
   affichés en français via tables (`PLAN_FR`, `STATUS_FR`, …),
   fonctions/pages résolues vers leurs libellés FR, historique traduit
   (`EVENT_FR` + clés de détail), `vendor` → `éditeur`, focus visibles,
   variables CSS `--fond-nuit/--fond-carte/--texte-clair`.
3. Client (bilingue AR/FR, ADR-051 — pas de règle FR-only) : `Signaler`
   route vers le WhatsApp boutique, `Partager` reste générique ; suppression
   des doublons même écran (2e `Partager`, 2e `Retour`, X redondants des
   bottom-sheets au profit du bouton `Fermer` 48px, toggle langue du header
   au profit du Compte) ; 20+ chaînes en dur migrées vers `i18n.ts`
   (glossaire fermé respecté : chaque clé a ar + fr) ; couleurs via tokens
   (`dangerLight`, `announcementText`, `STITCH` réexporte `COLORS`,
   `filterChipHeight` 40 → 48) ; `flow()`/`farEdge()` RTL, convention
   chevrons documentée dans `nav.tsx`, `Tap` accepte `accessibilityLiveRegion`.
4. Limites assumées (non corrigées, notées) : libellé `REINITIALISER`
   conservé sans accent (preuve littérale exigée par le main) avec mention
   `(sans accent)` ; ordre icône/libellé des `Button` centrés non miroiré en
   RTL ; `locales/*.json` morts conservés ; `paddingTop: 36` conservé
   (pas de dépendance safe-area) ; annonces Home/Compte/modal conservées
   (contextes différents).

## Conséquences

- `tsc` manager + mobile verts ; `tsc` racine : 0 erreur hors `tests/`
  (erreurs `tests/` pré-existantes : `dist-*` non construits).
- ESLint vert sur tous les fichiers touchés ; `mobile-foundation`
  (17), `proformas` (3), `fr-map` (3) verts.
- `document.title` du Manager inchangé (`Veloria License Manager`) :
  nom produit, le smoke `manager-smoke.mjs` reste vert.
