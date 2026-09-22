# ADR-009 — Page Fournisseurs (fiche enrichie, achats, dettes)

Date : 2026-09-16. Statut : accepté.

## Contexte

Les fournisseurs n'avaient qu'un CRUD minimal (nom/contact/téléphone/adresse),
sans page dédiée : ni code, ni fiche complète, ni historique des achats, ni
suppression sûre. La caisse restait le seul module prêt avec catalogue/clients.

## Décision

- Migration **0008** (schéma antérieur immuable) : `code` (unique, généré
  `FOU-00001` si absent), `tax_number`, `commercial_register`, `notes`,
  `is_active` (défaut 1). `email` existait depuis 0001.
- Recherche serveur enrichie : achats cumulés, total payé, dernier achat,
  nombre d'entrées + filtres statut/paiement + 5 tris + pagination.
- Suppression **gardée** (tout-ou-rien, y compris en masse ≤ 100) : solde soldé,
  sans entrées/paiements/produits liés, sinon message FR explicite + audit.
- Nouveaux canaux explicites : `suppliers.delete`, `suppliers.deleteMany`,
  `suppliers.stats` (relevé existant étendu aux lignes d'entrées, sans nouveau
  canal). Aucun `run-sql`.
- UI : `SuppliersScreen` (en-tête, 4 KPIs, barre d'outils, table 11 colonnes,
  sélection + suppression masse, pagination) + 4 dialogues (détail, formulaire
  avec interrupteur actif, paiement borné par la dette, historique Achats /
  Paiements avec recherche, plage de dates, filtre statut, lignes dépliables).
- Soldes par entrée non stockés par le schéma : l'historique montre le total
  et le statut par bon, le payé/restant au niveau fournisseur (pas de
  prorata fabriqué).

## Conséquences

- Nouveau module sidebar « Fournisseurs » (prêt), après Clients.
- Tests : domaine + helpers + schémas Zod (`suppliers.test.ts`), tranche SQL
  0008 (`atomic-slices`), `verify-migrations` et `verify-domain` étendus.
