# ADR-129 — État d'erreur persistant dans chaque écran + coordonnées non codées en dur (vague W10)

## Contexte

Vague **W10** du plan de remédiation (audit intégral 2026-10-19, §« vague
W10 ») : « un état d'erreur permanent dans tous les écrans + `PrintTemplatesScreen`

- a11y ».

| #    | Constat                                                                                            | Sévérité | Statut                          |
| ---- | -------------------------------------------------------------------------------------------------- | -------- | ------------------------------- |
| A-06 | **Aucune écran n'a d'état d'erreur durable** (0 `setError`/`errorState` dans les 16 `*Screen.tsx`) | P2       | **Corrigé**                     |
| A-07 | `PrintTemplatesScreen` sans chargement / vide / erreur                                             | P2       | **Corrigé en W5** (rappelé ici) |
| A-27 | `key={i}` en 3 sites                                                                               | P3       | **Corrigé en W5** (rappelé ici) |
| A-28 | Numéro de téléphone **codé en dur** dans « À propos »                                              | P3       | **Corrigé**                     |
| L-05 | a11y (`htmlFor`/`id`, `aria-label`, `role`, cibles ≥ 44 px)                                        | —        | **Conforme (aucun constat)**    |

## Décision 1 — A-06 : un état d'erreur QUI RESTE

Le seul canal d'erreur était le toast : **4,5 s**, les **3 derniers**
conservés. Trois conséquences mesurées par l'audit :

1. l'erreur **disparaît** — pas de trace, pas de journal à l'écran ;
2. un tableau vide après un échec **passe pour « aucune donnée »** ;
3. une série d'erreurs (un import CSV, 200 lignes) est **noyée**.

**Décision** : chaque écran de données déclare un état d'erreur
**persistant** (`loadError`), l'arme au moment de l'échec, le remet à zéro
au nouvel essai, et l'affiche à la place du vide
(`ErrorState` — primitive partagée, `role="alert"`, message FR, icône
triangle).

L'erreur est affichée **avant** l'état vide et **avant** le tableau : un
écran dont le rechargement a échoué ne doit pas laisser croire à un
registre vide. Le toast reste (il confirme l'action) mais n'est plus le
seul porteur de l'information.

Écrans traités (12) : clients, tableau de bord, dettes, dépenses,
historique, produits, devis, rapports, retours, stock, fournisseurs,
zakat. `PrintTemplatesScreen` avait déjà été traité en W5 (chargement +
erreur + `EmptyState`).

**Exemptions documentées** (pas de chargement de données) :
`LicenseScreen` (panneau d'activation avec son propre « Réessayer »),
`SellScreen` (la caisse n'a pas de liste à charger), `SettingsScreen`
(composition de sections, chacune gère ses états).

**Garde** : `tests/unit/a06-screen-error-state.test.ts` parcourt
`src/features/**/*Screen.tsx` et exige, pour chaque écran de données, un
état d'erreur persistant **ET** son affichage. Une régression (retour au
toast seul) casse la porte.

## Décision 2 — A-28 : les coordonnées affichées viennent de la fiche entreprise

`src/features/settings/SettingsSectionsB.tsx` affichait un **numéro de
téléphone codé en dur** (`+213770204047`) et un e-mail dans le bloc
« À propos ».

**Décision** : ces coordonnées sont celles de la **fiche entreprise**
(`useCompany()`), que le commerçant règle dans « Entreprise » ; si elles
sont vides, l'écran affiche « Non renseigné » (jamais un numéro figé que
personne ne peut corriger). Le nom du développeur reste affiché : c'est
l'information de l'auteur du produit, pas une coordonnée du commerçant.

## Décision 3 — A-07 / A-27 : déjà traités en W5 (rappel)

- `PrintTemplatesScreen` affichait les réglages du type de document
  **précédent** pendant le chargement du nouveau (mensonge visuel) : W5 a
  ajouté les états `loading` / `error` / `EmptyState` ;
- `key={i}` (index de position) supprimé en W5 au profit de clés stables.

Ces deux points sont clos depuis W5 : la vague W10 n'apporte que ce qui
restait (A-06, A-28) et **le rappel** pour que le plan et le rapport
d'audit ne restent pas en décalage.

## Portes (vague W10)

`format:check` 0 · `tsc -b` 0 · `typecheck:electron` 0 · `eslint
--max-warnings 0` 0 · `knip` 0 · `vitest` **140 fichiers / 964 tests** 0 ·
`test:db` 0 · `verify:migrations/domain/perf` VERIFIED · `verify:fr` 0 ·
`license:scan` 0 · `build` + `build:electron` ✓.

## Rollback

`git revert <sha>` — aucun contrat, aucune migration.
