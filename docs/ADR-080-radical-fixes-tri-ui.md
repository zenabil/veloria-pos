# ADR-080 — Correctifs radicaux inter-faces (audit profond 2026-10-12)

Date : 2026-10-12. Statut : accepté.

## Contexte

Audit profond des trois interfaces (POS `src/`, License Manager
`license-manager/`, mobile `mobile/`) : 0× P0, 7× P1 fonctionnels
(dont 2 rendant des fonctions Manager inopérantes), ~25× P2.
Portes vertes avant/après : `tsc` ×3 = 0, `eslint` = 0,
`vitest` 661/661, `verify:migrations` VERIFIED, `build` +
`build:electron` + manifest signé.

## Décision

- **Manager (M1-M18)** : `preload` transmet le payload (`keyImport`,
  `licensesList`) — recherche et rotation de clé réparées ; `JSON.parse`
  protégé (repli `—`, jamais de white-screen) ; `startup` fail-closed
  (dialogue FR + quit) ; restore réinitialise la sélection + recharge les
  backups ; libellés FR `standing_*` + `professional` ; `licenseStatus`
  retiré du schéma CREATE (l'enveloppe est toujours active — source unique
  de vérité) ; erreurs de liste signalées FR ; `createdAt` backups parsé
  correctement ; `await onConfirm` ; recherche à un seul IPC par frappe ;
  `preload.js` dans les listes critiques + test P0-4 mis à jour ;
  couleurs via `var()` ; labels `htmlFor`/`id` ; texte de confirmation
  mentionnant la distribution de `public.key` ; `appInfo` mort supprimé
  (zéro référence repo + tests) ; test parity PRESETS
  (`license-manager-presets.test.ts`) ; `resolveManagerIcon` vérifié.
- **POS (P1, P2-a/b/c/d/e/g)** : `useLicense(notify?)` — échec IPC =
  toast FR + log (fini les modules masqués en silence) ; `SearchField` à
  la Sidebar (dernier champ brut, ADR-079) ; `Select` unifié dans
  OcrImport (ADR-078) ; `aria-label` bouton loupe Intake ; `console.error`
  contextuels partout + notice FR pour les chargements explicites
  (`loadClosings`) ; clés stables (`kind-ref`, composites) sur les listes
  dynamiques ; `thead sticky` MiniTable.
- **Mobile (B1-B9)** : `saveLastEndpoint` câblé (connexion + restauration
  silencieuse) ; clés i18n mortes et `STITCH`/`GRADIENTS.ok/slate`
  supprimés ; `:8100` accepté par `validate-env` ; langue explicite
  anti-stale-closure ; `grant()` protégé ; clés stables ; seuil
  `onEndReached`. `staleLabel`/`allKeys` conservés (utilisés par
  `mobile-foundation.test.ts`).
- **Non-fait assumé (documenté, pas du tech-debt caché)** : migration
  repo-wide des hex littéraux (`accent="#4edea3"`, `text-emerald-300`,
  `bg-[#1c1113]`) refusée — valeurs vérifiées identiques aux tokens,
  convention codebase-wide (20+/64 sites) : une migration partielle
  créerait le drift qu'elle prétend tuer (même rationale qu'ADR-075 D1).

## Vérification

- `tsc -b` + `tsc electron/manager --noEmit` = 0 ; `eslint` = 0 ;
  `vitest` 661/661 (dont nouveau `license-manager-presets` 2 tests) ;
  `verify:migrations` VERIFIED ; `verify:domain` OK ;
  `build` + `build:electron` + manifests signés (194 + 20 fichiers).
- `release/` reconstruit (`package:win` + `package:manager`) +
  `release:smoke` + `SHA256SUMS.txt` ; `installer.spec` skip documenté
  (per-machine exige UAC élevé).
