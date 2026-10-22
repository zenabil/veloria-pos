# ADR-131 — Remise de ligne SIGNÉE, majoration de prix et facture au montant exact

- **Statut** : accepté (décision propriétaire 2026-10-22)
- **Date** : 2026-10-22
- **Remplace/amende** : ADR-114 (dialogue « quantité vendue » — mode « Montant »), P0-7 (la remise vit dans le prix unitaire de ligne)
- **Migrations** : `0051_sales_signed_discount.sql` (NOUVEAU — `0001..0050` restent immuables)

## 1. Contexte (3 bugs caisse signalés le 2026-10-21)

| #   | Symptôme                                                                                                      | Cause prouvée                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1  | « Article libre » : le nom se saisit, mais le prix n'accepte qu'UN chiffre puis le focus revient au champ Nom | `useDialogFocus` (`src/shared/ui/primitives.tsx`) rejouait son effet à CHAQUE rendu : ses dépendances `[boxRef, onClose, extraKey]` incluaient `onClose`, or les écrans passent un flécheta inline (`() => setX(false)`) dont l'identité change à chaque rendu. L'effet re-posait le focus sur le **premier `input`** du dialogue (le nom).                                                                                                                                                                                          |
| B2  | Mode « Montant (DZD) » : 50,00 DZD saisis à 700 DZD/kg ⇒ **49,70 DZD facturés**                               | `weightDialogPreview` calcule la quantité (arrondie à 3 décimales : 0,071 kg) puis facture `prix × qté`. Le montant saisi était perdu (seule la quantité était transmise à la ligne).                                                                                                                                                                                                                                                                                                                                                |
| B3  | Panier mixte (article libre + poids + catalogue + remise) ⇒ **vente refusée**, message générique              | Une ligne facturée **au-dessus** de son prix d'origine (majoration) produit une remise de ligne NÉGATIVE. Le domaine l'admettait (« majoration admise ») mais la base l'interdisait : `sales.discount_amount_minor >= 0` (schéma 0001, immuable) + `trg_sale_items_discount_nonneg_*` (0031) ⇒ `CHECK constraint failed: discount_amount_minor >= 0` ⇒ rollback total + « Une erreur inattendue est survenue ». **Preuve** : 7 occurrences dans le journal main du 2026-10-21 (canal `sales.create`) + reproduction sur base migrée. |

**Lien B1 → B3** : le focus perdu tronquait la saisie du prix de l'article libre (ex. « 5 » au lieu de « 500 ») ; le caissier corrigeait alors le prix depuis le panier (fenêtre « Modifier le prix ») — une **majoration** ⇒ B3.

## 2. Décisions

### D1 — La remise de ligne devient SIGNÉE (migration 0051)

- `sales.discount_amount_minor` accepte une valeur **négative** (borne basse : −100 000 000 000 centimes, miroir de `assertSignedTotal`).
- Une remise négative = **majoration** (prix facturé > prix d'origine) **ou** facture au montant saisi (D2).
- L'invariant de recomposition est **inchangé** et toujours vérifié par la base :
  `total_minor = subtotal_minor − discount_amount_minor + delivery_fee_minor`.
  (Sous-total = Σ prix d'origine × quantité ; remise = Σ (origine − facturé).)
- `trg_sale_items_discount_nonneg_*` (0031) sont **remplacés** par un plancher borné (`..._floor_*`) ; le plafond existant (`remise ≤ origine × quantité + 1`) est conservé.
- **Conséquence** : une vente ne peut plus être refusée par la base pour un écart de prix licite ; la majoration est **tracée** (`audit_log.sale.created.raisedLines`).

### D2 — Le mode « Montant » facture le montant SAISI (ADR-114 révisé)

- La ligne de panier porte `billedTotalMinor` (montant facturé EXACT, centimes) ; la **quantité** reste l'unité de stock (le poids retiré du stock est celui calculé).
- Le montant saisi est **validé des deux côtés** (domaine + main) : entier > 0, borné, et à portée de l'arrondi de la quantité (`0,0005 × prix unitaire + 1 centime`). Le renderer ne peut donc **pas** gonfler un total de ligne.
- La vente au poids en mode « Montant » ne perd plus de recette : 50,00 DZD saisis ⇒ **50,00 DZD facturés** (et non 49,70).
- La ligne est marquée « montant saisi » dans le panier ; le ticket porte le montant facturé.

### D3 — Le focus des dialogues n'est posé qu'à l'ouverture

- `useDialogFocus` conserve `onClose`/`extraKey` dans des refs « dernière valeur connue » ; l'effet ne dépend plus que de `[boxRef]`.
- Effet : **tous** les dialogues/tiroirs de l'application (et pas seulement « article libre ») sont corrigés.

### D4 — Les lignes sont contrôlées AVANT l'écriture (fail-closed FR)

- `validateSaleLines()` (main) est appelée **avant** l'`INSERT INTO sales` : prix, montant facturé saisi et bornes de la remise sont vérifiés avec des **messages français**.
- Avant, la garde « Remise de ligne invalide » jouait **après** l'INSERT : l'erreur SQL brute (`CHECK constraint failed…`) atteignait l'écran (violation AGENTS §6 — aucune exception brute à l'utilisateur).

## 3. Mise en œuvre

- **Domaine** (`src/domain/sales/sale-rules.ts`) : `CartLineInput.billedTotalMinor`, `computeBilledTotal()`, `billedAmountToleranceMinor()` ; la remise signée était déjà supportée (`assertSignedTotal`).
- **Main** : `electron/ipc/money-guard.ts` (miroir + parité prouvée par `tests/unit/money-guard-parity.test.ts`), `electron/ipc/handlers/sales.repo.ts` (`validateSaleLines`, remise signée bornée, `raisedLines` d'audit), `electron/ipc/validators.sales.ts` / `validators.documents.ts` / `validators.print.ts` (champ optionnel + borne d'arrondi), `electron/ipc/credit-gates.ts` (total facturé = montant saisi).
- **Renderer** : `sell-weight.ts` (aperçu = montant saisi), `QuantityDialog` (transmet le montant), `sell-search.ts` (`addProduct`/`confirmWeightedAdd`), `cart-store.ts` (deux lignes à montants différents ne fusionnent pas), `CartPanel` (total = montant facturé + marque « montant saisi »), `PriceDialog` (annonce de la majoration), brouillons (`cart-drafts.ts` + `carts.repo.ts` : le montant survit au redémarrage).
- **Migration 0051** : reconstruction de `sales` (procédure SQLite « 12 étapes » : `PRAGMA foreign_keys = OFF` **avant** la transaction — `PRAGMA foreign_keys` est un no-op dans une transaction — + `legacy_alter_table` pour que les clauses `REFERENCES` des tables enfants ne soient pas réécrites). Le runner (`electron/database/sqlite.service.ts`) reconnaît le marqueur `-- veloria:foreign-keys-off`, désactive les FK, rejoue la migration dans UNE transaction, réactive les FK et **contrôle `PRAGMA foreign_key_check`** (fail-closed).

## 4. Conséquences & risques

- Le ticket d'une vente en majoration affiche une remise **négative** (l'écart au prix catalogue est visible, pas masqué) — le format d'impression reste inchangé (la remise est un montant signé).
- La base `sales` est reconstruite une fois : identifiants, lignes et index recopiés à l'identique ; l'application pose un **snapshot** avant migration (règle AGENTS §12).
- Le « montant saisi » se propage au devis (`proformas`) et à la conversion devis → vente (le total stocké est réutilisé tel quel).
- Un devis créé depuis un panier « montant saisi » conserve le montant exact (champ optionnel `billedTotalMinor` dans le schéma des lignes de devis).

## 5. Vérification

- `tests/unit/sales/sale-signed-discount.test.ts` (9 cas) — remise signée, montant exact, tolérance, panier mixte.
- `tests/integration/sale-signed-discount.test.ts` (3 cas, repos **réels** sur base migrée) — la vente mixte passe, un gonflement est refusé **en français** (et non par un CHECK SQL), un prix d'origine invalide est refusé avant toute écriture.
- `tests/unit/ui-dialog-focus.test.ts` (3 cas) — garde statique du piège de focus.
- `tests/unit/money-guard-parity.test.ts` — parité main/domaine sur le montant saisi (même montant, même refus).
- `scripts/database/verify-migrations.mjs` — 0051 : remise signée acceptée, triggers « non négatif » absents, bornes conservées.
- Portes : `tsc -b` 0 · `eslint --max-warnings 0` 0 · `format:check` 0 · `vitest` 145 fichiers / 992 tests 0 · `test:db` 40 / 186 0 · `verify:migrations` VERIFIED · `verify:domain` VERIFIED · `verify:fr` 0 · `verify:encoding` 0 · `verify:perf` VERIFIED · `knip` 0.
