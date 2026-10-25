# ADR-136 — Conditionnement « carton » avec tarif automatique

- **Date** : 2026-10-25
- **Statut** : accepté
- **Contexte** : vente à la pièce avec tarif dégressif au carton, achat en
  carton ou en pièce, retours dans l'unité vendue. Le stock, le FIFO et les
  rapports doivent rester en unités de base (pièces).
- **Migration** : `0054_product_packagings.sql`.

## Décision 1 — Numéro de migration 0054 (et non 0052)

Le prompt initial demandait `0052_product_packagings.sql`. Les migrations
`0052_dashboard_category_snapshots.sql` et `0053_cart_drafts_sale_operation.sql`
sont déjà appliquées. La règle 12 (migrations immuables) interdit de les
renuméroter ou de les éditer : la nouvelle migration est donc **0054**.

## Décision 2 — Une seule table, un seul conditionnement actif

`product_packagings` porte le libellé FR, le facteur (`> 1`), les prix carton
vente/achat et le drapeau `auto_carton_pricing`. L'index partiel
`ux_packaging_active` garantit **un seul conditionnement actif par produit**.
La suppression est logique (`is_active = 0`) : les lignes historiques gardent
leur FK, et un nouveau conditionnement réutilise la ligne la plus récente.

Les lignes de vente, d'achat, de retour et de code-barres mémorisent
`packaging_id`/`unit_factor` (facteur figé au moment de l'opération). Le
`unit_code` d'une ligne carton contient le libellé (« Carton de 12 »), ce qui
rend le ticket lisible sans jointure sur une configuration qui peut changer.

## Décision 3 — Le stock et le FIFO restent en unités de base

- `sale_items.quantity` d'une ligne carton = nombre de cartons ;
  `unit_factor` = taille du carton.
- `baseQty = quantity × unit_factor` pour la vérification de stock, la
  déduction, les mouvements et la consommation FIFO.
- La vérification de stock est **agrégée par produit avant toute écriture** :
  deux lignes du même produit ne peuvent pas contourner la disponibilité.
- Le COGS figé reste le coût FIFO réel des `baseQty` unités.
- Les rapports (Top produits, rotations) multiplient les quantités par
  `unit_factor` pour rester en pièces.

## Décision 4 — Tarif carton automatique monotone

`priceSaleLine` découpe la quantité en cartons complets + reste. Une ligne
carton porte :

- `quantity = n` cartons, `unit_factor = facteur` ;
- `unit_price_minor = prix carton` ;
- `original_unit_price_minor = prix pièce × facteur` (référence de remise) ;
- remise de ligne = `(original − facturé) × n`.

Le tarif carton n'est appliqué que si
`(facteur − 1) × prix pièce ≤ prix carton < facteur × prix pièce`. Ce garde
garantit qu'acheter une unité de plus ne fait jamais baisser le total (test de
monotonicité) et évite les configurations de prix absurdes. Hors de cette
zone, la ligne reste au prix pièce.

Un prix saisi manuellement (dialogue P.U.) ou un montant saisi (ADR-114)
désactive la règle carton : badge « Prix manuel », ligne non découpée.

## Décision 5 — Le main ne fait pas confiance au renderer

À la vente, le main relit le conditionnement en DB dans la transaction :

- `packaging_id` inconnu ou `is_active = 0` → refus FR ;
- produit du conditionnement différent, facteur différent → refus ;
- prix carton envoyé différent du prix DB → refus (« tarif modifié ») ;
- prix d'origine carton différent de `prix pièce actuel × facteur` → refus ;
- une ligne carton ne peut pas porter de montant saisi.

À l'achat, le facteur est relu en DB, la quantité reçue en cartons doit être
entière et la quantité abîmée reste exprimée en pièces.

## Décision 6 — Achat : total payé exact réparti sur les unités nettes

- `line_total_minor = prix d'achat × unités reçues + part de fret` (source de
  vérité du total payé).
- `netBase = unités reçues × facteur − unités abîmées`.
- Le total payé est réparti sur `netBase` par la méthode du plus grand reste
  compacte : au plus **deux paliers** de coût unitaire, avec
  `Σ(quantité × coût) = total payé` au centime près.
- `products.purchase_price_minor` reçoit un coût dérivé par pièce (affichage
  seulement) ; `selling_price_minor` n'est jamais écrasé par le facteur.
- L'éligibilité des retours fournisseur est convertie en unités de base.

## Décision 7 — Retours client Phase 1

Un retour se fait dans l'unité de la ligne vendue (`unit_factor`) : carton
complet ou pièces. L'éligibilité est calculée en unités de base
(`Σ return_items.quantity × unit_factor`). Un retour partiel de carton est
refusé ; le restockage, le FIFO et les mouvements utilisent `baseQty`.
Les retours partiels de carton et les code-barres carton restent en Phase 3.

## Conséquences

- Contrats gelés : canaux IPC **178 → 181** (`products.packagings.list/save/delete`),
  schémas Zod **122 → 125**, exports de validation **131 → 134**,
  migrations **53 → 54**.
- Tests : domaine (découpage, arrondis, monotonicité, allocation exacte),
  parité domaine ↔ main de l'allocation, intégration (vente mixte, double
  submit, facteur/prix forgés, rollback stock, retours, achat 3 cartons +
  abîmés).
- Hors périmètre Phase 1 : code-barres carton, retour partiel de carton,
  plusieurs niveaux de carton, prix de gros client.
