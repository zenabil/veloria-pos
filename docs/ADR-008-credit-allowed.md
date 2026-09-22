# ADR-008 — Vente à crédit réservée aux clients autorisés

Date : 2026-09-16. Statut : accepté.

## Contexte

Tout client (ou une vente « passage » sans client) pouvait laisser un impayé :
le bouton « Crédit autorisé » de la fiche client ne pilotait que le plafond
(`credit_limit_minor > 0`), jamais une autorisation réelle.

## Décision

- `customers.credit_allowed` (migration **0007**, défaut 0 = opt-in strict).
- Règle : `remaining > 0` exige `customer_id ≠ NULL` **et** `credit_allowed = 1`.
  Le comptant reste libre pour tous, y compris le passage.
- Défense en profondeur : `assertCreditSaleAllowed` (domaine, testé) →
  `createSale` (application) → `createSaleAtomic` (main, dans la transaction) →
  trigger SQL `trg_sales_credit_allowed` (garantie dernier ressort).
- UI : l'interrupteur existant pilote désormais le vrai drapeau (le plafond
  devient un cap optionnel) ; la caisse affiche le statut crédit, bloque
  « Valider » avec message FR explicite en cas de crédit non autorisé.

## Conséquences

- Aucun nouveau canal IPC (les lignes `SELECT *` propagent la colonne).
- Schéma 0001-0006 immuable (règle AGENTS.md n° 11) ; tests et
  `verify-migrations` adaptés (client autorisé obligatoire pour les ventes
  de test avec impayé).
