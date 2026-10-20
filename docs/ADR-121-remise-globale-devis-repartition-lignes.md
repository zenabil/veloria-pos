# ADR-121 — Remise globale de devis : répartition exacte sur les lignes (P0-7), sans valeur de remise séparée

- **Statut** : Accepté
- **Date** : 2026-10-20
- **Décideur** : propriétaire du projet Veloria PoS
- **Réf** : `docs/reports/FULL_AUDIT_2026-10-19.md` §3.E-20 ·
  `docs/reports/FULL_AUDIT_2026-10-19_PLAN.md` §2 (W1) ·
  `docs/ADR-028-money-safety-boundary.md` · `database/migrations/0001_initial_schema.sql:136,153`

## Contexte

Un devis (proforma) porte une remise **GLOBALE** : un montant DZD saisi une fois
pour l'ensemble du devis. Une vente (sale) porte une remise **par ligne** : le
prix facturé est modifié ligne par ligne (P0-7 — « la remise vit dans le prix
unitaire de ligne »).

Ces deux modèles ne se rejoignaient pas. La conversion devis → vente
(`electron/ipc/handlers/proformas.repo.ts`, `convertProformaToSaleAtomic`)
envoyait `discountType: "amount"`, valeur **rejetée** par la garde fail-closed
de `createSaleAtomic` (`electron/ipc/handlers/sales.repo.ts`) :

```ts
if (input.discountType !== "none") {
  throw new Error("Type de remise non pris en charge (remises par lignes uniquement).");
}
```

Conséquence : **toute conversion d'un devis remisé échouait**, sans message
exploitable côté caisse. Le chemin « Devis → Facture » était donc inutilisable
dès qu'une remise était saisie.

Deux options semblaient possibles.

**Option A — un type de remise « globale » au niveau de la vente**
(`discount_type = 'amount'`, montant dans `discount_value_minor`).
Le schéma l'autorise (`0001:136` : `discount_type IN ('none','percent','amount')`),
et le validateur d'impression accepte déjà la sémantique « remise globale en sus »
(forme (b) de `electron/ipc/validators.print.ts:111-142`).
**Mais** le CHECK de la table l'interdit :

```sql
CHECK (total_minor = subtotal_minor - discount_amount_minor + delivery_fee_minor)
```

`discount_value_minor` n'y entre pas : le total de la vente ne peut pas
porter une remise globale distincte. Faire accepter cette option supposait de
**reconstruire la table `sales`** (table parente de `sale_items`,
`sale_payments`, `returns`, `purchase_orders`…) pour relâcher un CHECK — la
migration la plus risquée de l'histoire du projet, sur la table la plus
critique, avec un risque de perte de données sur les postes installés.

**Option B — répartir la remise globale sur les lignes de la vente**
(le modèle P0-7), la somme des parts étant **exactement** le montant de la
remise du devis. Le prix unitaire affiché reste celui du devis et le ticket
affiche une ligne « Remise » (forme (b) du validateur d'impression).

L'obstacle d'Option B est arithmétique : une remise de ligne vaut
`(original − facturé) × quantité`, donc elle est un multiple de la quantité.
Une remise globale de 100,00 DZD sur une ligne unique de 3 unités ne peut
**pas** être représentée sur un prix unitaire entier (10000 ÷ 3 n'est pas
entier). Une répartition « au plus proche » perdrait des centimes et
l'invariant `Σ lignes = discount_amount_minor` (CHECK 0001:153) ne tiendrait plus.

**Découverte déterminante** : la colonne `sale_items.discount_minor`
(ajoutée par `0027_sale_item_line_prices.sql`) n'est **contrainte par aucun
CHECK** et n'est lue par aucun code applicatif. Elle peut donc porter une
part de remise **arbitraire** (entière), indépendante de la divisibilité par
la quantité. La contrainte `line_total_minor = unit_price_minor × quantity`
reste respectée (les totaux de ligne ne changent pas) : c'est le **partage
de la remise** qui est réparti, pas les prix.

## Décision

**La remise globale d'un devis est répartie sur les lignes de la vente par la
méthode du plus grand reste, à la fraction près, sans jamais modifier le prix
unitaire affiché ni le total de ligne.**

Règles :

1. **Répartition exacte** — `Σ parts = remise du devis` au centime près
   (méthode du plus grand reste : part proportionnelle au total de ligne,
   puis distribution des centimes restants aux plus grandes fractions
   décimales, égalité tranchée par index croissant).
2. **Prix intacts** — `unit_price_minor` et `original_unit_price_minor`
   restent ceux du devis ; `line_total_minor` reste `prix × quantité` ; la
   remise partagée est portée par `sale_items.discount_minor`.
3. **Invariant de vente** — `discount_amount_minor` = Σ des parts ;
   `total_minor` = `subtotal − discount_amount + livraison` (CHECK 0001:153
   respecté). `discount_type` reste `'none'` : la remise vit dans les lignes
   (P0-7), pas dans une valeur de vente séparée.
4. **Fail-closed** — `createSaleAtomic` **recalcule** le total attendu à
   partir du sous-total, des remises et de la livraison, et refuse l'écriture
   si le total transmis diffère (« Total de vente incohérent. ») : un appelant
   ne peut plus écrire une vente dont le total ne se recompose pas.
5. **Parité domaine ↔ main** — l'algorithme existe dans les deux couches
   (`src/domain/proforma/proforma-rules.ts` → `allocateGlobalDiscount`,
   `electron/ipc/handlers/amount-allocation.ts` → `allocateAmountByWeights`),
   `electron/` ne pouvant pas importer `src/` (rootDir — ADR-062,
   `docs/STRUCTURE.md` §8.3). La parité est prouvée par un test dédié
   (`tests/unit/proforma-discount-parity.test.ts`), fail-closed au moindre
   écart.

## Alternatives considérées

| Option                                                                                   | Pour                                                                                                                                                                        | Contre                                                                                                                                                                           | Verdict                                                              |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **A. Remise globale portée par la vente** (`discount_type='amount'`)                     | Sémantique directe ; le validateur d'impression la supporte déjà                                                                                                            | **Impossible** sans relâcher le CHECK `total = subtotal − discount_amount + delivery` ⇒ reconstruction de la table `sales` (table parente de 4 tables, sur les postes installés) | **Rejeté** — risque de migration disproportionné pour un flux métier |
| **B. Répartition sur les prix unitaires** (arrondi au plus proche)                       | Simple ; respecte P0-7 au sens strict                                                                                                                                       | **Perd des centimes** (100,00 sur 3 unités) ; rompt `Σ lignes = discount_amount_minor` ; le total de la vente diverge du devis                                                   | **Rejeté** — un montant de facture doit être exact                   |
| **B'. Répartition sur les prix unitaires avec report du reliquat sur la dernière ligne** | Total exact                                                                                                                                                                 | `line_total_minor ≠ prix × quantité` sur une ligne ⇒ incohérence visible sur le ticket et dans les rapports                                                                      | **Rejeté** — casse l'invariant de ligne                              |
| **C. Répartition de la REMISE sur `sale_items.discount_minor`** (retenue)                | Montant exact ; prix et totaux de ligne intacts ; invariant de vente respecté ; aucune migration ; le validateur d'impression accepte déjà la sémantique « remise globale » | `discount_minor` n'est plus derivé de `(original − facturé) × qté` pour ce cas ⇒ la convention est documentée (commentaire + ADR)                                                | **Retenu**                                                           |
| **D. Refuser la conversion d'un devis remisé** (fail-closed immédiat)                    | Aucun risque de divergence                                                                                                                                                  | Le flux « Devis → Facture » reste cassé pour toute remise                                                                                                                        | **Rejeté**                                                           |

## Conséquences

- **Positives** :
  - La conversion d'un devis remisé **fonctionne de nouveau**, au montant exact
    du devis (tests : `tests/integration/proforma-convert-discount.test.ts`).
  - **Aucune migration** : le schéma `0001..0047` est inchangé (règle
    AGENTS.md §12).
  - La vente **reste vérifiable** : `total = sous-total − Σ remises + livraison`
    est recalculé par le main (fail-closed), et le ticket affiche les lignes
    au prix du devis + une ligne « Remise » — forme déjà acceptée par le
    validateur d'impression.
  - La rounding est **exacte et déterministe** (pas de dérive d'arrondi entre
    deux exécutions).
- **Négatives / risques** :
  - `sale_items.discount_minor` perd sa signification derivative
    (`(original − facturé) × qté`) **dans le seul cas d'une remise globale** ;
    la convention est documentée dans le code et dans le présent ADR. La
    colonne n'étant lue par aucun code applicatif, l'impact est nul à ce jour.
  - Un jour où une remise globale serait **Mixée** avec des remises de ligne
    sur la même vente, la répartition devrait se faire sur le reliquat — non
    implémenté aujourd'hui (une vente ne porte qu'un seul `discountType`).
- **Contrats touchés** :
  - `electron/ipc/handlers/sales.repo.ts` : `CreateSaleInput.lineDiscounts?`
    (nouveau champ **optionnel** — l'API IPC ne change pas : le champ est
    construit par le repo, jamais par le renderer) ; garde de cohérence du
    total ; `lineDiscount` lu depuis `lineDiscounts` quand il est fourni.
  - `electron/ipc/handlers/proformas.repo.ts` : `discountType: "none"`,
    `discountValueMinor: 0`, `discountAmountMinor = remise du devis`,
    `lineDiscounts = répartition exacte`.
  - `electron/ipc/handlers/amount-allocation.ts` (nouveau) : utilitaire
    générique de répartition exacte.
  - `src/domain/proforma/proforma-rules.ts` : `allocateGlobalDiscount` (miroir
    du domaine).
  - Aucun changement de schéma SQL, aucun changement de `IPC_CHANNELS`, aucun
    changement de `FROZEN_SCHEMA_COUNT`.

## Vérification

- [x] `npm run format:check` (0)
- [x] `npm run typecheck` (0) · `typecheck:electron` (0) · `typecheck:manager` (0)
- [x] `npm run lint` (0)
- [x] `npm test` (126 fichiers / 834 tests, 0 échec)
- [x] `npm run test:db` (33 fichiers, 0 échec)
- [x] `npm run verify:migrations` (MIGRATIONS VERIFIED)
- [x] `npm run verify:domain` (DOMAIN VERIFIED)
- [x] `npm run verify:perf` (PERF VERIFIED)
- [x] `npm run license:scan` (0)
- [x] `npm run build && npm run build:electron` (✓, manifeste signé)
- [x] `tests/unit/proforma-discount-parity.test.ts` (11 vecteurs, parité
      domaine ↔ main + invariant `Σ parts = montant`)
- [x] `tests/integration/proforma-convert-discount.test.ts` (4 cas : remise
      totale, remise + livraison, vente à crédit partielle, remise de 1 centime
      non représentable)

## Références

- `docs/reports/FULL_AUDIT_2026-10-19.md` §3.E-20 (finding PROUVÉ)
- `docs/ADR-028-money-safety-boundary.md` (frontière monétaire)
- `docs/ADR-062-organisation-2026.md` · `docs/STRUCTURE.md` §8.3 (miroirs
  main ↔ domaine)
- `database/migrations/0001_initial_schema.sql:136,153` (CHECK `sales`),
  `0027_sale_item_line_prices.sql` (`sale_items.discount_minor`)
- `src/domain/proforma/proforma-rules.ts` · `electron/ipc/handlers/amount-allocation.ts`
- `electron/ipc/validators.print.ts:111-142` (deux sémantiques de remise
  acceptées)
