# ADR-114 — Caisse : vente au poids (dialogue « quantité vendue »)

## Contexte

Demande produit : un produit vendu **au poids** (bétail du calcul : kg, g, L,
mL, cl, m) ne peut pas être ajouté au panier avec une quantité « 1 » devinée
par le logiciel. Jusqu'ici, tout ajout (clic résultat, Entrée, scan douchette)
partait directement au panier avec la quantité du préfixe rapide — ou 1 par
défaut — et le vendeur devait corriger après coup dans le panier.

Les unités existent déjà : `unit_code` (PIECE, KG, G, L, ML, CL, M, CARTON,
PAQUET, AUTRE) et `assertValidQuantity` accepte 3 décimales (précision g).
Les lignes de vente, l'IPC (`quantity` 0..1e6, 3 décimales) et la base
(NUMERIC) acceptent donc déjà les quantités décimales : seul le flux de saisie
à l'ajout manquait.

## Décisions

- **Unités continues** : `MEASURED_UNIT_CODES = KG, G, L, ML, CL, M` +
  `isMeasuredUnit()` dans `src/domain/units/units.ts` (source unique). Les
  unités discrètes/logistiques (PIECE, CARTON, PAQUET, AUTRE) ne changent pas
  de comportement.
- **Flux d'ajout** (`sell-search.ts → addProductOrAskQuantity`) : une unité
  continue **sans quantité tapée par le vendeur** n'ajoute jamais « 1 par
  défaut » → le dialogue « quantité vendue » s'ouvre (poids **ou** montant).
  Le préfixe rapide tapé (`2,5*code`, `2x nom`) est une quantité explicite →
  ajout direct (flux expert conservé, aucun aller-retour).
  `parseQtyPrefix` expose désormais `explicit: boolean` pour distinguer
  « pas de préfixe » de « préfixe = 1 ».
- **Dialogue** (`sell/QuantityDialog.tsx`) : deux modes au choix — quantité
  (Poids/Volume/Longueur selon l'unité) **ou** montant (DZD). L'aperçu en
  direct affiche toujours **le total réellement facturé** (`computeLineTotal`,
  arrondi exact), jamais le montant brut saisi, et un avertissement quand la
  quantité dépasse le stock (l'ajout reste possible, la garde stock existante
  décide).
- **Conversions pures** (`src/domain/sales/weight-sale.ts`) :
  `parseQuantityInput` (virgule FR, décimal simple uniquement — `1e3`/`0x10`
  rejetés, arrondi 3 décimales, jamais 0 silencieux) et
  `quantityForAmountMinor` (quantité = montant ÷ prix unitaire). Aucune
  conversion dans la couche UI — elle est testée dans le domaine.
- **Parité quantités IPC** (`electron/ipc/validators.common.ts`) : le refine
  `quantity`/`quantityNonNegative` utilisait `|q*1000 − round(q*1000)|`, qui
  rejette des quantités 3-décimales **valides** dès ~16 384 (erreur flottante)
  → « Échec de la vente. » opaque. Réaligné sur la formule du domaine
  (`assertValidQuantity`, round-trip ×1000) et verrouillé par le vecteur de
  parité `16384.005` (`tests/unit/main-domain-parity.test.ts`).
- **Annulation = retour direct** : depuis la recherche (Entrée/clic), la
  requête et les résultats sont conservés tant que le dialogue est ouvert ;
  ils ne sont nettoyés qu'à la confirmation. Le scan, lui, vide le champ
  immédiatement (la douchette suivante doit pouvoir repartir) mais n'ajoute
  rien avant confirmation.
- **Libellés unités FR** déplacés dans le domaine (`UNIT_LABELS`/`unitLabel`)
  et ré-exportés par `features/products/types.ts` : le Catalogue et la Caisse
  partagent la même source, sans arête inter-features `sales → products`
  (garde A3).

## Conséquences

- Un scan de code-barres d'un produit au poids ouvre le dialogue au lieu
  d'ajouter 1 kg : le vendeur pèse puis saisit le poids (ou le montant).
- Les codes-barres « poids intégré » (EAN balance) ne sont pas couverts —
  hors périmètre, documenté ici pour la suite.
- Fichiers affectés : `src/domain/units/units.ts`,
  `src/domain/sales/weight-sale.ts` (nouveau), `src/features/products/types.ts`,
  `src/features/sales/sell/sell-weight.ts` (nouveau),
  `src/features/sales/sell/sell-search.ts`,
  `src/features/sales/sell/useSellState.ts`,
  `src/features/sales/sell/QuantityDialog.tsx` (nouveau),
  `src/features/sales/sell/SellOverlays.tsx`, `src/features/sales/SellScreen.tsx`.
- Tests : `tests/unit/sales/sell-weight.test.ts` (nouveau — unités continues,
  conversions, flux dialogue/direct, confirmation, bornes), mise à jour de
  `sell-cashier.test.ts` (QtyPrefix explicite), `sell-split.test.ts`
  (scan pièce direct / scan KG → dialogue / scan préfixé direct) et
  `main-domain-parity.test.ts` (vecteur 16384.005) ; E2E
  `tests/e2e/scan-flow.spec.ts` (scan KG → dialogue → 1,5 kg → Échap sans
  ajout), le harnais `helpers.ts` ayant été aligné sur l'écran unique
  « Code initial » (R6) du premier boot.
