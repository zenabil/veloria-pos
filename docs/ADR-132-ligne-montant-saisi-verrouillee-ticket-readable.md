# ADR-132 — Ligne « montant saisi » VERROUILLÉE, ticket signé et lisible, écran de caisse increvable

- **Statut** : accepté (correctifs de la revue UI du 2026-10-22)
- **Date** : 2026-10-22
- **Amende** : ADR-131 (remise signée, facture au montant exact), ADR-114 (dialogue « quantité vendue » — mode « Montant »)
- **Migrations** : aucune (le schéma 0051 suffit : la remise est déjà signée en base)

## 1. Contexte

ADR-131 a corrigé les 3 bugs caisse signalés, mais sa propre revue UI a laissé **trois constats bloquants** :

| #   | Symptôme                                                                                                            | Cause prouvée                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Modifier la quantité ou le prix d'une ligne « montant saisi » **fait planter l'écran Vente** (error boundary)       | `CartPanel` appelait `computeBilledTotal(l)` pendant le rendu ; après édition, le montant saisi n'était plus à portée de l'arrondi de `prix × quantité` ⇒ le domaine **lève** une exception ⇒ rendu React interrompu. En plus, le store laissait modifier quantité/prix, ce qui rendait la ligne invendable (`validateSaleLines` la refuse ensuite). |
| C2  | La vente corrigée produit un ticket **non imprimable** (« Aperçu indisponible. » / « Impression auto impossible. ») | `printPayloadSchema.discountMinor` était encore `moneyMinor` (≥ 0). Une remise de ligne **négative** (= majoration ou écart d'arrondi du montant saisi, ex. 49,70 − 50,00 = −30 centimes) était donc rejetée par Zod. Le ticket masquait aussi cet écart et imprimait `0.071 x 700,00 DA` (faux : 49,70 ≠ 50,00).                                    |
| C3  | Aucune couverture E2E du mode « Montant »                                                                           | Le parcours caisse (poids → montant → panier → paiement → ticket) n'était prouvé qu'en unitaire.                                                                                                                                                                                                                                                     |

## 2. Décisions

### D1 — Une ligne facturée au MONTANT SAISI est VERROUILLÉE

- `isBilledByAmount(line)` (domaine) : `billedTotalMinor != null`.
- **Quantité ET prix unitaire sont immuables** sur une telle ligne (store : `setQty`/`setLinePrice` ignorent la clé ; UI : contrôles `disabled` + infobulle FR).
- **Jamais fusionnée** dans `addLine` : ni avec une autre ligne au montant saisi, ni avec une ligne au prix unitaire (la fusion additionnerait les poids en gardant un seul montant ⇒ perte de recette).
- `bumpLastQty` (raccourci clavier `+`/`−`) ne vise que la **dernière** ligne : si elle est verrouillée, le raccourci ne fait rien et affiche un message FR (il ne remonte JAMAIS vers une ligne antérieure, ce qui modifierait un produit non visé).
- Pour changer le montant : **supprimer la ligne et la ressaisir** (geste explicite, aucune dérive silencieuse). Motif : `|montant − prix × qté| ≤ tolérance` est un invariant du domaine ; éditer un seul des deux termes le brise à coup sûr.

### D2 — Le panier ne lève JAMAIS pendant le rendu

- `safeLineTotal()` entoure `computeBilledTotal` : une ligne incohérente affiche « — » (infobulle FR) et le détail technique part en `console.error`.
- Un défaut de données ne doit plus tuer l'écran de caisse ni masquer les autres lignes.

### D3 — Le ticket et le devis assument la remise SIGNÉE

- `moneyMinorSigned` : borné ±1 000 000 000 (volontairement plus strict que `assertSignedTotal`, ±1e11 — plafond d'impression inatteignable par une vente, la remise d'une ligne restant bornée à ~500 001 centimes) ; `printPayloadSchema.discountMinor` l'utilise.
- `printLineSchema.billedTotalMinor` + `ReceiptLine.billedTotalMinor` : la ligne imprimée affiche « montant saisi » au lieu de la multiplication fausse.
- Ticket thermique : « Remise −X » (remise positive) ou « Majoration +X » (remise négative) ; quantités en **virgule française** (`formatQtyFr`, miroir main de `formatQuantityFr`).
- Devis A4 : marque « montant saisi » sur la ligne, quantité FR, et la **majoration reste visible même quand le réglage masque les lignes à zéro** (sinon le total ne se recompose plus).
- `discountMinor` signé est propagé par `buildSaleSnapshot`/`buildProformaLines`.

### D4 — Lisibilité caisse (revue UI)

- Dialogue quantité : « Montant à facturer (DZD) », « Poids retenu pour le stock », « arrondi à l'unité de stock », ligne « Écart d'arrondi » (le caissier voit pourquoi 0,071 kg × 700,00 ≠ 50,00).
- Prix : la majoration annonce l'écart exact et parle du « journal de la vente » (terme utilisateur, pas « audit »).
- Totaux : « Majoration » seulement s'il existe une vraie ligne au-dessus du catalogue (`raisedLineCount`), sinon « Écart au prix catalogue » (arrondi du mode Montant).
- Les `catch` silencieux de l'aperçu/impression et des dialogues journalisent désormais le détail technique (AGENTS §6) tout en gardant un message FR.

## 3. Mise en œuvre

- **Domaine** : `src/domain/sales/sale-rules.ts` (`isBilledByAmount`).
- **Renderer** : `cart-store.ts` (verrou + non-fusion), `CartPanel.tsx` (contrôles désactivés, `safeLineTotal`, marque sous le total), `QuantityDialog.tsx`, `PriceDialog.tsx`, `SellTotalsPanel.tsx` (`raisedLineCount`), `sell-finalize.ts` (`bumpLastQty` + journalisation), `sell-weight.ts`, `sell-totals.ts`, `sell-types.ts`, `SellScreen.tsx`.
- **Main / impression** : `validators.common.ts` (`moneyMinorSigned`), `validators.print.ts`, `receipt-documents/common.ts`, `receipt-text.ts`, `amounts.ts` (`formatQtyFr`), `proforma.ts`.

## 4. Conséquences & risques

- Une ligne au montant saisi ne peut plus être « corrigée » en place : c'est un choix d'intégrité assumé (suppression + ressaisie), affiché dans l'UI (texte visible + `aria-describedby`, pas seulement une infobulle).
- Le ticket reste **recomposable à l'œil** : sous-total + remise/majoration = total, quel que soit le signe.
- **Limite connue** : `billedTotalMinor` n'est pas persisté (pas de colonne) ; une **réimpression depuis l'historique** reconstruit la ligne en « qté × P.U. » avec la majoration. Les montants restent exacts et recomposables ; seule la mention « montant saisi » est absente. La persister exigerait une NOUVELLE migration (hors périmètre).
- Aucune migration : la base accepte déjà la remise signée (0051) ; seules les couches Zod/impression/UI étaient en retard.
- Les documents anciens (remise ≥ 0) impriment exactement comme avant, à ceci près que la remise positive est précédée de « − » (lecture comptable correcte).

## 5. Vérification

- `tests/unit/sales/sale-amount-line-lock.test.ts` (8 cas) — verrou quantité/prix, non-fusion, raccourci `+`/`−` strictement sur la dernière ligne, `isBilledByAmount`.
- `tests/unit/sales/cart-line-safe-total.test.ts` (3 cas) — `safeLineTotal` ne lève jamais et journalise (voie de secours « — »).
- `tests/unit/receipt-signed-discount.test.ts` (7 cas) — schéma d'impression signé, ticket « Majoration »/« montant saisi »/quantité FR, devis A4 (majoration visible, lignes à zéro masquées).
- `tests/e2e/cashier-amount-mode.spec.ts` (2 cas) — parcours réel poids → montant → panier → paiement → ticket, et édition d'une ligne verrouillée sans crash.
- Portes : `tsc -b` 0 · `eslint --max-warnings 0` 0 · `format:check` 0 · `vitest` 148 fichiers / 1014 tests 0 · `test:db` 40 / 186 0 · `test:coverage` seuils par fichier 0 · `verify:migrations` VERIFIED · `verify:domain` VERIFIED · `verify:fr` 0 · `verify:encoding` 0 · `verify:perf` VERIFIED · `knip` 0 · Playwright 2/2 (spec caisse).
