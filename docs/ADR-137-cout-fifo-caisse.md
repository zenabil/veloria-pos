# ADR-137 — Coût FIFO en caisse (le prix ancien reste jusqu'à la vente)

Date : 2026-10-25 · Statut : accepté · Migration : aucune

## Contexte

Après une réception à un nouveau prix, `products.purchase_price_minor` devient le
dernier coût (ADR-021). La caisse utilisait ce champ comme coût de référence : le
dialogue de prix affichait le dernier prix d'achat et le garde « sous coût »
comparait le prix facturé à ce dernier prix. Conséquence : vendre un stock
ancien acheté moins cher déclenchait une fausse alerte « sous coût », et l'audit
`sale.created` mémorisait ce coût erroné — alors que le COGS FIFO réel des
couches était déjà correct dans les rapports.

## Décision

- `products.purchase_price_minor` reste le **dernier coût** (référence d'achat,
  ADR-021 inchangé).
- `products.search` et `products.getByBarcode` exposent
  `fifo_next_unit_cost_minor` : coût de la plus ancienne couche restante, c.-à-d.
  la prochaine unité à sortir.
- La ligne de panier utilise ce coût comme référence ; le dialogue prix affiche
  « Coût FIFO » et l'alerte sous-coût se base dessus.
- `createSaleAtomic` calcule le sous-coût **après** `consumeLayers`, en comparant
  le total facturé de la ligne au COGS FIFO réel. `sale_items.purchase_price_minor`
  est figé au coût FIFO moyen de la ligne (et non au dernier prix) ;
  `sale_items.cogs_minor` reste la somme exacte des couches consommées.
- `sale_fifo_consumption`, la valorisation du stock et les rapports
  (Dashboard/Finance) restent inchangés : ils utilisaient déjà le FIFO.

## Conséquences

- Vendre un ancien stock à son ancien prix n'est plus faussement signalé sous
  coût ; la sortie suit FIFO jusqu'à épuisement de la couche.
- Le coût affiché dans le dialogue est celui de la prochaine unité. Si une ligne
  traverse plusieurs couches, l'audit serveur reste exact (moyenne COGS de la
  ligne), même si l'avertissement préalable est une estimation conservatrice.
- Aucune migration, aucun canal IPC, aucun changement de schéma. Les retours et
  annulations utilisent désormais le coût FIFO figé de la ligne, plus juste que
  le dernier prix du catalogue.
- Tests : `tests/integration/fifo-sale-cost.test.ts` (prochaine couche exposée,
  vente couverte par l'ancien stock non signalée, audit réel quand la vente
  traverse les couches).
