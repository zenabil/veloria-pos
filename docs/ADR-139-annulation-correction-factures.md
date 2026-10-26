# ADR-139 — Annulation et correction des factures de vente et d'achat

- **Statut** : accepté (2026-10-26)
- **Contexte** : demande propriétaire — pouvoir **modifier ou annuler** une
  facture de vente ou d'achat.
- **ADR liés** : ADR-021 (couches FIFO, factures d'achat immuables), ADR-116
  (scan sans Entrée), ADR-131/132 (montant saisi verrouillé), ADR-138 (retours
  dette d'abord).

## Décision

1. **Aucune facture validée n'est modifiée en place.** Une correction est
   toujours **annulation + nouvelle pièce**, afin de préserver les couches
   FIFO, les paiements, les soldes et l'audit.
2. **Vente** — nouveau canal `sales.reopen` (idempotent, permission
   `cancel`) : dans une seule transaction, projette les lignes de la vente en
   panier de caisse, annule la vente via `cancelSaleAtomic` (stock, couches,
   paiements, solde client), puis renvoie le panier. L'Historique le place
   dans la Caisse (nouvel onglet) ; l'encaissement crée une **nouvelle
   facture**, l'ancienne reste visible « Annulée ». Les lignes carton sont
   reconstruites en unités de base + tarif carton, et les lignes « montant
   saisi » conservent leur total verrouillé. Une vente avec retours ou un
   produit archivé est refusée **avant** toute annulation.
3. **Achat** — une facture fournisseur (réception) peut être **annulée**
   (`stock.intakeCancel`, idempotent, permission `stock`) uniquement si :
   - statut `committed` ; aucune ligne de retour fournisseur vivante ;
   - **toutes** les couches FIFO de la réception sont intactes (aucune vente,
     retour ou ajustement n'a consommé le stock) et leur somme égale la
     quantité nette reçue ;
   - le solde fournisseur couvre le total (facture non déjà réglée) ;
   - la réception **n'est pas liée à un bon de commande** réceptionné
     (correction via retour fournisseur).
     L'annulation remet le stock, neutralise les couches (quantité restante 0),
     journalise un mouvement `adjust_out` (`related_entity_type =
intake_cancel`), réduit la dette fournisseur, passe la réception en
     `cancelled` et écrit `stock.intake_cancelled` dans l'audit.
4. **Correction d'achat** = annulation puis formulaire de réception
   **prérempli** avec les valeurs d'origine (fournisseur, facture, date,
   livraison, notes, produits, quantités, coût d'achat hors fret). Le vendeur
   relit et valide une nouvelle réception.
5. **Permissions inchangées** : `cancel` pour la vente, `stock` pour l'achat.
6. **Aucune migration** : la colonne `stock_intakes.status` acceptait déjà
   `cancelled`, et les mouvements utilisent le type existant `adjust_out`.

## Conséquences

- Les documents annulés restent consultables (statut, audit, mouvements) ;
  les rapports de ventes/achats excluent déjà les documents annulés.
- Une vente rééditée porte un **nouveau numéro** ; l'ancien numéro n'est
  jamais réutilisé.
- Limite assumée : une réception issue d'un **bon de commande** ne peut pas
  être annulée (le bon resterait « reçu ») — passer par un retour
  fournisseur. Même limite pour un stock déjà consommé.
- Le produit créé automatiquement par une réception annulée reste au
  catalogue avec un stock nul ; le prix d'achat courant est recalé sur la
  dernière couche restante lorsqu'elle existe.
- **Correctif découvert** : l'annulation d'une vente **sans client** (ou avec
  un client sans crédit autorisé) violait le garde SQL 0051 en remettant
  `remaining = total`. Elle est désormais **soldée** (`paid = total`,
  `remaining = 0`) : aucune créance impossible, paiements supprimés, vente
  annulée. Les ventes à crédit autorisées conservent le miroir E-25
  (`paid = 0`, `remaining = total`).

## Tests

- `tests/integration/sale-reopen.test.ts` (6) : annulation + panier,
  idempotence, retours, produit archivé, ligne carton, montant saisi.
- `tests/integration/intake-cancel.test.ts` (7) : annulation complète,
  idempotence, stock consommé, retour fournisseur, facture réglée, bon de
  commande, réception sans fournisseur.
- `tests/unit/sales/cart-store-open-draft.test.ts` (4) : réutilisation du
  panier vide, nouvel onglet, limite 20, montant verrouillé.
