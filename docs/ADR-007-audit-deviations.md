# ADR-007 — Écarts assumés à la spec MD (relevés par l'audit ×20)

Date : 2026-09-16. Statut : accepté.

L'audit exhaustif (20 passes, spec 00→26) a comparé chaque exigence à
l'implémentation. Écarts maintenus explicitement (tout le reste est conforme) :

## Écarts structurels (spec 05)

- `src/ports/`, `src/infrastructure/`, `src/app/{routes,providers}`,
  `features/{inventory,payments,company-profile,data-management}`,
  `electron/{hardware,filesystem}`, `tests/{e2e,electron,fixtures}`,
  `scripts/build/`, `public/branding/`, `docs/00..19` : non recréés —
  doublons, dossiers vides ou responsabilités fusionnées sans perte
  (ports réalisés par le bridge IPC typé ; filesystem fusionné dans
  `services/file-ui.ts` ; profil entreprise dans Paramètres).
- `electron/main/{app-lifecycle,crash-recovery}.ts` : EXTRAITS de `main.ts`
  (structure 05 respectée, pas de duplication).
- `electron/preload/api-types.ts` : NON créé — le contrat est inféré
  (`typeof api`, source unique) ; un fichier de ré-export serait du bruit.
  Garde-fou : test `bridge-shape` (parité canaux/preload/validateurs).

## Écarts stack (spec 04)

- Radix UI / React Hook Form / Recharts supprimés (zéro usage) : primitives
  maison accessibles (rôles, Escape, focus-trap, labels) + tableaux ;
  graphiques remplacés par top-N tabulés (spec 04 autorise un équivalent).
- Playwright E2E : absent (nécessite app packagée + display ; documenté en
  reste, jamais simulé).
- Node hôte 26 vs LTS 24 : outillage uniquement ; le runtime reste
  Electron/Node 22 rebuildé (ADR-002).

## Écarts fonctionnels assumés

- Étiquettes code-barres, OCR, tiroir-caisse/balance physiques : sans matériel
  de test, aucun driver spéculatif (spec 12 : boundary documentée, pas de code
  mort).
- `due soon/overdue` : pas de relance sans `due_date` (Dettes couvre
  dû/dépassements) ; `GetExpiringProducts` : date stockée/affichée, sans
  requête dédiée.
- Activité client = ventes + paiements (relevé) ; pas de journal séparé.
- Clôture sans signature de code ; `publish: []`.

## Règles verrouillées par cet audit

- Natif en `dependencies` (ADR-005) ; `noUncheckedIndexedAccess` sur les DEUX
  tsconfigs ; `disableSourceOfProjectReferenceRedirect` (tests ↔ modules
  électron purs) ; preload bundlé (ADR-006) ; `dist-electron` + tampon CJS.
