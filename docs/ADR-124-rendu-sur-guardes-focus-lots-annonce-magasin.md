# ADR-124 — Rendu sûr, garde synchrone, focus, lots bornés et tranche « annonce magasin » (vague W5)

## Contexte

Vague **W5** du plan de remédiation (audit intégral 2026-10-19, §« vague
W5 ») : « empêcher l'écran mort, empêcher le double-envoi, supprimer
l'`operationId` constant ». Le plan a été exécuté avec les décisions
propriétaire du 2026-10-21 (Q1, Q5, Q11, Q17, Q6, Q7).

| #    | Constat                                                                    | Sévérité | Statut      |
| ---- | -------------------------------------------------------------------------- | -------- | ----------- |
| A-01 | `formatDzd()` **lève** pendant le rendu React (268 sites `.tsx`)           | High     | **Corrigé** |
| A-02 | `useBusyFlag` ne bloque pas le double-envoi (state asynchrone)             | High     | **Corrigé** |
| A-03 | 3 copies locales de `newOperationId()` avec repli UUID **constant**        | High     | **Corrigé** |
| A-07 | `PrintTemplatesScreen` sans états chargement / vide / erreur               | Medium   | **Corrigé** |
| A-08 | `Drawer` sans piège de focus (le caissier écrit derrière l'overlay)        | Medium   | **Corrigé** |
| A-14 | Closure périmée dans `useClientDrawerData` (chargements sautés/doublés)    | Medium   | **Corrigé** |
| A-15 | 10 cascades `await` dans le renderer (200 archivages = 200 allers-retours) | Medium   | **Corrigé** |
| A-16 | `useCountUp` déclenche un `setState` à chaque frame rAF                    | Medium   | **Corrigé** |
| A-21 | `minorToInput` peut lever dans un gestionnaire d'événement                 | Low      | **Corrigé** |
| A-22 | Minuteur de toast jamais annulé                                            | Low      | **Corrigé** |
| A-23 | Écouteur `visibilitychange` non retiré (closure figée)                     | Low      | **Corrigé** |
| A-24 | Écriture sur l'onglet panier actif sans `cart` dans les dépendances        | Low      | **Corrigé** |
| A-25 | `Modal` ne restitue pas le focus au bouton déclencheur                     | Low      | **Corrigé** |
| A-26 | `aria-label` écrase le titre visible du `Modal`                            | Low      | **Corrigé** |
| A-27 | `key={i}` sur des données stables (3 sites)                                | Low      | **Corrigé** |

## Décision 1 — A-01 : `formatDzd` ne lève plus JAMAIS

Avant : `formatDzd` → `assertMinorInteger` → `MoneyError` sur une valeur
corrompue (NaN, fractionnaire, négative, hors bornes). **268 sites** en JSX
l'appelaient directement : une seule valeur fausse en base suffisait à faire
tomber l'`ErrorBoundary` ⇒ **écran mort devant le caissier** (le tiroir ou
le tableau entier était remplacé par « Écran momentanément indisponible »).

| Fonction          | Rôle                       | Valeur invalide               |
| ----------------- | -------------------------- | ----------------------------- |
| `formatDzd`       | **rendu**                  | « — » (jamais d'exception)    |
| `formatDzdStrict` | **transaction / écriture** | `MoneyError` (lève)           |
| `formatDzdSafe`   | rendu, entrée `unknown`    | « — » (délégue à `formatDzd`) |

Le risque « on masque une vraie erreur » est couvert par `formatDzdStrict` :
il reste disponible pour les chemins qui DOIVENT corriger la valeur, et
`verify:domain` l'exerce explicitement (valeurs invalides ⇒ exception,
`formatDzd` ⇒ « — »). Les 268 sites n'ont pas été touchés : le changement
est **structurel**, pas un remplacement site par site.

## Décision 2 — A-02 : garde anti-double-clic synchrone

`useBusyFlag` (13 sections de réglages, dont `database.reset`,
`backup.autoSave`, `sync.pushNow`) testait un `useState` React — asynchrone :
deux clics dans le **même tick** voyaient tous deux `busy === false` ⇒ deux
envois de la même action. La caisse avait déjà la bonne réponse (des `useRef`
dans `useSellState.ts`) ; les réglages non.

⇒ la garde est extraite dans un **outil pur** `src/shared/ui/sync-guard.ts`
(`createSyncGuard`) : sémantique testable **sans React**, et le hook
l'utilise telle quelle (lazy init dans une ref). Le même motif de ref
(référence au lieu d'état) reste le standard du projet.

## Décision 3 — A-03 : une seule source d'`operationId`

Les écrans Équipe (`UsersAdmin`, `ChangeCodeCard`, `StaffRecover`) avaient
chacun une copie de `newOperationId()` avec un repli **UUID constant** : sans
`crypto.randomUUID`, toutes les opérations d'équipe auraient partagé la même
clé ⇒ `idempotency_keys` confondait des opérations distinctes en rejeux et
les perdait en silence. ⇒ import unique de `@domain/common/ids.ts`
(UUIDv7 via `crypto.getRandomValues`, disponible partout).

## Décision 4 — A-08 / A-25 / A-26 : focus et accessibilité des dialogues

`Modal` avait un piège de focus mais **ne restituait pas** le focus au
bouton déclencheur ; `Drawer` n'avait **ni piège, ni focus initial** (Échap ne
fonctionnait que si le focus était déjà dans le tiroir) ⇒ le caissier
continuait de saisir dans la page **cachée** derrière l'overlay (9
consommateurs).

⇒ un hook partagé `useDialogFocus` (piège Tab/Maj+Tab, focus initial sur le
premier champ, **restitution** du focus à la fermeture) est utilisé par
`Modal` **et** `Drawer` ; `aria-labelledby` (id sur le `<h2>` visible) est
ajouté aux deux : le titre visible l'emporte sur `aria-label` (A-26).

## Décision 5 — A-15 : lots à concurrence bornée

Les écrans enchaînaient les appels IPC un par un (200 produits archivés =
plusieurs minutes sans retour visuel ; en parallèle brut, le main saturé).

⇒ `src/shared/ui/bulk-actions.ts` : `runBulk(éléments, worker, {concurrency,
onProgress, onError})` — concurrence bornée (4), erreurs **isolées** (le lot
continue), progression rapportée. Converti : archivage produits, archivage
clients, export CSV clients (par pages), suppression de dépenses, suppression
de devis, annulation de retours, clichés de synchro mobile, import OCR
(création des produits). Les écrans affichent la progression sur le bouton
(`Archivage 12/200…`).

## Décision 6 — Q1 : la tranche « annonce magasin » est complète

Le canal `announcements.save`, le repo et la règle de domaine existaient ;
**la saisie commerçante côté POS manquait** (le bandeau s'affichait bien
dans l'APK, mais le gérant ne pouvait pas écrire). Décision propriétaire :
**construire l'UI**.

⇒ tranche verticale : lecture (`getCurrentAnnouncement` + canal
`announcements.get`, permission `settings`) → écran **Paramètres → Commerce →
« Annonce magasin »** (champ 120 caractères max + compteur, lecture de
l'annonce courante, règle de domaine appliquée avant l'IPC, bouton
« Enregistrer ») → test d'intégration (aller-retour, idempotence, refus FR).

Contrat : **+1 canal IPC** (`announcements.get`, 177 → 178), **+0 schéma**
Zod (`emptyPayloadSchema` réutilisé ⇒ `FROZEN_SCHEMA_COUNT` inchangé à 121).

## Décision 7 — Q11 : porte de couverture « interface » (cran)

Décision propriétaire : couverture de `src/features` avec un seuil
**progressif**. DeuxConstraints realities :

1. les composants `.tsx` ne sont **pas exécutés** par la suite (pas
   d'environnement DOM, pas de bibliothèque de rendu) ⇒ leur couverture
   réelle est quasi nulle (2,6 % sur l'ensemble `src/features`, 742/28 372
   lignes) ;
2. mesurer l'interface suppose d'ajouter des dépendances de test
   (jsdom + testing-library) ⇒ **modification de `package-lock.json`**,
   hors périmètre propriétaire (Q3 du plan).

⇒ porte créée sur le périmètre **mesurable sans DOM** : les modules purs de
`src/features` (`*.ts` hors `types.ts`) — aideurs de caisse, fusion de
modèles, normalisation. Seuil mesuré le 2026-10-21 : **27,49 % lignes ·
82,46 % branches · 67,64 % fonctions** ⇒ CRAN posé à **27 / 80 / 65 / 27**
(le seuil ne peut pas baisser ; il monte à chaque vague qui ajoute des
tests). Commande : `npm run test:coverage:features` (branchée dans le CI).

La couverture des **composants** (`.tsx`) reste un chantier ouvert : il
exige l'arbitrage « installation de jsdom + @testing-library/react » (Q11 bis,
demandé au propriétaire).

## Décision 8 — décisions propriétaire du 2026-10-21 appliquées

| #   | Décision                                | Application                                                  |
| --- | --------------------------------------- | ------------------------------------------------------------ |
| Q5  | workshop Impression : **commit**        | `ae4e410` (commit dédié, portes vertes) — l'arbre est propre |
| Q11 | features : seuil progressif             | porte `test:coverage:features` (cran, § Décision 7)          |
| Q17 | jour métier : **UTC** (inchangé)        | aucun changement (E-35 reste un constat documenté)           |
| Q6  | avoir > solde : **refus FR** (inchangé) | aucun changement (W1)                                        |
| Q7  | dette : **colonne physique** (inchangé) | aucun changement (W1)                                        |
| Q1  | annonces : **construire l'UI**          | § Décision 6                                                 |

## Conséquences

- **Aucun écran mort** sur une valeur monétaire corrompue (268 sites
  couverts structurellement).
- **Plus de double-envoi** sur les 13 sections de réglages (garde synchrone).
- **Plus d'`operationId` constant** ⇒ plus d'opérations d'équipe perdues.
- **Focus** : Échap et Tab fonctionnent dans tous les tiroirs/dialogues, le
  focus revient au bouton déclencheur.
- **Lots** : archivages et exports massifs deviennent rapides **et
  progressifs** (au lieu de plusieurs minutes sans retour).
- **Contrats** : +1 canal IPC (`announcements.get`), snapshot mis à jour
  (178), `FROZEN_SCHEMA_COUNT` inchangé (121).
- **Point de retour arrière** : `git revert` (aucune migration, aucun
  changement de schéma, aucune donnée).

## Vérification

Portes vertes (arbre propre après le commit de la workshop) :

| Porte                                                               | Valeur                                                         |
| ------------------------------------------------------------------- | -------------------------------------------------------------- |
| `npm test`                                                          | 136 fichiers / 926 tests                                       |
| `npm run test:db`                                                   | 36 fichiers / 164 tests                                        |
| `npm run test:coverage`                                             | EXIT 0 (domaine + application, seuils 80/75/88/80 par fichier) |
| `npm run test:coverage:features`                                    | EXIT 0 (cran interface)                                        |
| `npm run typecheck` / `typecheck:electron` / `typecheck:manager`    | 0                                                              |
| `npm run lint`                                                      | exit 0                                                         |
| `npm run format:check`                                              | 0                                                              |
| `verify:migrations` / `verify:domain` / `verify:perf` / `verify:fr` | VERIFIED / 0                                                   |
| `npm run build` + `build:electron`                                  | ✓ (manifeste signé)                                            |

## Fichiers affectés

- Domaine : `src/domain/money/money.ts` (`formatDzd` sûr + `formatDzdStrict`).
- Shared : `src/shared/formatters/format.ts`, `src/shared/ui/sync-guard.ts`
  (nouveau), `src/shared/ui/bulk-actions.ts` (nouveau),
  `src/shared/ui/primitives.tsx` (focus + `aria-labelledby`),
  `src/shared/ui/use-count-up.ts`, `src/shared/sound/sound.ts`,
  `src/shared/charts/BarChart.tsx`.
- Features : `settings/bits.tsx` (garde synchrone), `settings/SettingsSectionsA.tsx`
  (annonce magasin), `settings/SettingsScreen.tsx`, `staff/{UsersAdmin,ChangeCodeCard,StaffRecover}.tsx`,
  `customers/dialogs/useClientDrawerData.ts`, `customers/dialogs/ClientMobileAccess.tsx`,
  `customers/ClientsScreen.tsx`, `products/ProductsScreen.tsx`,
  `expenses/ExpensesScreen.tsx`, `proformas/ProformasScreen.tsx`,
  `returns/ReturnsScreen.tsx`, `stock/OcrImportDialog.tsx`,
  `sales/sell/{PayDialog,useSellState}.tsx`, `reports/widgets.tsx`,
  `print-templates/PrintTemplatesScreen.tsx`.
- App : `src/app/shell/App.tsx` (minuteurs de toast).
- Main : `electron/ipc/channels.ts`, `registry.customers.ts`, `staff-gates.ts`,
  `handlers/client-access.repo.ts`, `electron/preload/preload.ts`.
- Config : `vitest.features.config.ts` (nouveau), `package.json`, CI.
- Tests : `tests/unit/format-dzd-safe.test.ts`, `tests/unit/use-busy-flag.test.ts`,
  `tests/unit/operation-id-unique.test.ts`, `tests/integration/announcement.test.ts`.
