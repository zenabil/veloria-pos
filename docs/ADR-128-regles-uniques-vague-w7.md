# ADR-128 — Règles uniques : quantités, montants, dates, normalisation, statut « en retard » (vague W7)

## Contexte

Vague **W7** du plan de remédiation (audit intégral 2026-10-19, §« vague
W7 ») : « une source de vérité pour 6 règles (argent, quantité, normalisation
du nom, date, `operationId`) ». L'audit a relevé **8 duplications**, une
**dérive de normalisation** et un **état mort**.

| #    | Constat                                                              | Sévérité | Statut                      |
| ---- | -------------------------------------------------------------------- | -------- | --------------------------- |
| D-01 | `newOperationId()` ×4                                                | P1       | **Corrigé (W5)**            |
| D-02 | `parseQtyInput` / `parseQty` (2 copies identiques) + 1 copie domaine | P2       | **Source unique**           |
| D-03 | `fmtQty` / `formatQtyFr` (2 copies, formats divergents)              | P2       | **Source unique**           |
| D-04 | `percentOfMinor` recalculée _inline_ en 2 endroits                   | P2       | **Règle financière unique** |
| D-05 | `multiplyMinorByQuantity` sautée en 7 sites renderer (sans garde)    | P2       | **Gardé**                   |
| D-06 | 3 implémentations de l'écart en jours                                | P2       | **Source unique**           |
| D-07 | `strictOrNeg` / `strictOrNum` (2 copies)                             | P3       | **Source unique**           |
| D-08 | `asMinor` (3ᵉ conversion de montant)                                 | P3       | **Source unique**           |
| E-29 | 3 normalisations du nom client ⇒ index et rapprochement divergents   | P2       | **Parité**                  |
| E-30 | `debt_status = 'overdue'` jamais écrit ⇒ « En retard » mort          | P2       | **État produit**            |
| J-11 | `knip` ne couvrait ni `license-manager/**` ni `cloud/**`             | P2       | **Corrigé**                 |

## Décision 1 — D-02/D-03 : UNE saisie et UN formatage de quantité

Source unique : `src/domain/common/quantity.ts`.

- `parseQuantityInput(raw, { allowZero })` — virgule FR, **décimal simple
  uniquement** (« 1e3 », « 0x10 », « +5 » sont refusés : `Number()` les
  accepterait, ce n'est pas une saisie de caisse), 3 décimales max, borné.
  Le `0` n'est valide que si on le demande (`allowZero`) : le stock et les
  seuils l'acceptent, une vente non.
  **Changement de comportement assumé** : la saisie vide ne vaut plus « 0 »
  implicite (les champs qui veulent 0 le normalisent explicitement) et
  « 1e3 » est désormais refusé partout.
- `formatQuantityFr(q)` — virgule décimale FR. L'ancienne copie locale
  (`fmtQty`) affichait « 1.5 » dans un message d'erreur français : le même
  nombre s'écrivait différemment selon l'écran.

Les copies supprimées : `features/stock/types.ts::parseQtyInput`,
`features/products/dialogs/common.ts::parseQty`,
`domain/sales/weight-sale.ts::parseQuantityInput`,
`features/sales/sell/sell-weight.ts::formatQtyFr`,
`features/sales/sell/sell-search.ts::fmtQty`.

## Décision 2 — D-04/D-05 : les règles financières sont les seules à calculer

- `percentOfMinor` (avec sa garde de capacité) remplace les deux calculs
  _inline_ (zakat, frais de restockage). L'erreur de la règle (`MoneyError`)
  est traduite en `DomainError` FR : **le contrat d'erreur du domaine ne
  change pas** (`ZAKAT_ERROR` / `RETURN_ERROR`).
- `multiplyMinorByQuantitySafe` remplace les 7 `Math.round(prix × qté)` du
  renderer (retours client/fournisseur, tiroir détail, actions client, bons
  de commande). Ces multiplications n'avaient **aucune garde** : une ligne
  pouvait dépasser `MAX_MINOR_TOTAL`.
  Variante « sure » et non « stricte » : elle **ne lève jamais** (règle
  A-01 : une exception pendant un rendu React fait tomber l'`ErrorBoundary`
  ⇒ écran mort devant le caissier) et renvoie 0 sur une valeur refusée.

## Décision 3 — D-06/D-07/D-08 : dates, parsing strict, conversion de montant

- `daysBetween(from, to)` (`domain/common/dates.ts`) : `to − from` en jours
  calendaires, `NaN` si une date est illisible — chaque appelant garde SA
  politique (bornage à 0 pour le retard client, dates déjà validées pour la
  politique de retour, bande de règlement côté renderer).
- `strictOrNum` (`@shared/money/parse.ts`) : parseur strict du rendu
  (invalide ⇒ −1 sentinelle). La copie locale du dialogue de réception est
  supprimée ; `strictOrNeg` s'appuie dessus.
- `toMinorSafe` (`@domain/money/money.ts`) : conversion **leniente** vers les
  centimes (jamais de NaN, troncature) — l'outil du rendu. `asMinor`
  (dans `features/customers/client-matching.ts`) est supprimé : c'était la
  3ᵉ copie de la même conversion.

## Décision 4 — E-29 : la normalisation du nom client est la même partout

Trois implémentations coexistaient :

| Où                                       | Règle                                               | « Cœur » |
| ---------------------------------------- | --------------------------------------------------- | -------- |
| main (`customers.repo`) + migration 0047 | NFD, marques, `œ→oe`, `æ→ae`, `ø→o`                 | `coeur`  |
| renderer (`client-matching.ts`)          | NFD, diacritiques, tout non-alphanumérique ⇒ espace | `c eur`  |

L'index de recherche (base) et le rapprochement du tiroir client (renderer)
ne s'accordaient donc pas : une ligne retrouvée par la recherche pouvait
rester invisible dans le tiroir, et inversement.

**Décision** : le renderer devient le **miroir exact** du main
(`normCustomerSearch`), et un test de parité
(`tests/unit/parity-normalisation.test.ts`) compare les deux sur 16
vecteurs. Toute évolution doit changer les deux + le test.

## Décision 5 — E-30 : l'état « en retard » EXISTE enfin

Avant : les 4 écritures du solde client n'écrivaient que `'none' | 'due' |
'over_limit'`. `'overdue'` — l'état affiché « En retard » par le POS
(`features/customers/types.ts`) **et** par l'APK (`mobile/src/tokens.ts`) —
n'était **jamais** produit : un état mort, affiché par deux clients et
atteint par aucun.

**Règle** (source unique : `electron/ipc/handlers/debt-status.ts`) : un client
est en retard si l'une de ses ventes **ouvertes** (non annulée, reste > 0) a
dépassé son échéance (`due_date` < aujourd'hui) — la même notion que le
statut `overdue` de `debts.list`.

**Deux couches, une seule règle** :

1. **Écriture** — la colonne `customers.debt_status` porte l'état au dernier
   mouvement (les 4 écritures : vente, annulation, encaissement, retour) ;
2. **Lecture** — le statut **affiché** est recalculé à la lecture
   (`customers.search` et la fiche APK) car l'échéance dépend du **temps** :
   une vente échue hier le devient aujourd'hui sans qu'aucun mouvement ne
   passe par la base. **Un état matérialisé ne peut pas suivre le temps ;
   seul un état dérivé le peut.**

Pour que l'écriture soit exacte, le recalcul du statut client est **déplacé
après** le mouvement de la vente dans les trois flux qui touchent les deux
(encaissement client, avoir sur retour, annulation de vente) : sinon un
paiement qui solde une vente échue laisserait le client « en retard ».

`agingBucket` (tranches d'ancienneté, code mort) est **supprimé**.

## Décision 6 — J-11 : `knip` voit enfin le Manager et le Cloud

`knip.json` couvre désormais `license-manager/**` et `cloud/**`. La Edge
Function `cloud/supabase/functions/client-sync/index.ts` est déclarée
comme **entry** (c'est un point de déploiement, pas un fichier importé) —
`knip` reste à **0** (0 fichier, 0 export, 0 type, 0 dépendance).

## Portes (vague W7)

`format:check` 0 · `tsc -b` 0 · `typecheck:electron` 0 · `eslint
--max-warnings 0` 0 · **`knip` 0** · `vitest` **139 fichiers / 950 tests** 0 ·
`test:db` 0 · `verify:migrations/domain/perf` VERIFIED · `verify:fr` 0 ·
`license:scan` 0 · `build` + `build:electron` ✓.

**Tests ajoutés** : `tests/unit/parity-normalisation.test.ts` (E-29) et
`tests/unit/money-rule-convergence.test.ts` (D-02 → D-08 : les règles
uniques se comportent comme les copies remplacées sur les valeurs
valides — la convergence ne change pas la production en silence).

## Rollback

`git revert <sha>` — aucune migration, aucun canal IPC, aucun schéma
modifié.
