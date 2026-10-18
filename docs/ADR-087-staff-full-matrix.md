# ADR-087 — Matrice d'autorisation complète (toutes mutations mappées)

Date : 2026-10-13
Statut : accepté (implémenté, demande produit « contrôle total »)

## Contexte

ADR-086 ne gardait que les canaux des 6 modules initiaux : les mutations
catalogue, fournisseurs, clients, devis, pain, achats, restauration et base
resteraient ouvertes à tout utilisateur actif. Le produit exige un contrôle
total du gérant.

## Décision

- `electron/ipc/staff-gates.ts` : TOUTES les mutations mappées —
  catalogue/achats/fournisseurs → `stock`, clients → `debts`, devis/pain →
  `sales`, restauration/reset/relocate/miroir → `settings`.
- Les LECTURES restent ouvertes (recherche, relevés, aperçus, licence,
  impression, brouillons) pour ne jamais bloquer la vente.
- `App.tsx` : filtre d'affichage aligné (`products/suppliers` → stock,
  `customers` → debts, `proformas/bread` → sales, `templates` → settings).
- Test de couverture : chacune des 10 clés protège ≥ 1 canal (scan texte).

## Conséquences

- Un utilisateur sans permission voit ses mutations refusées par le main
  (`Action non autorisée`), même en appel IPC direct.
- Le gérant doit accorder les clés correspondantes aux rôles existants.
