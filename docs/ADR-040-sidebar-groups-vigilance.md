# ADR-040 — Sidebar : groupes, recherche, vigilance réelle, F1 global

Date : 2026-09-28 (demande utilisateur : développer le Shريط الجانبي).

## Ajouts

- **5 groupes** : Caisse (Vente) · Pilotage (Tableau de bord, Historique,
  Rapports, Zakat) · Marchandise (Catalogue, Stock, Fournisseurs, Pain) ·
  Tiers (Clients, Dettes, Retours, Dépenses, Proformas) · Système (Impression,
  Paramètres, Licence). Ordre des modules réorganisé en conséquence.
- **Recherche modules** : filtre instantané sur libellé + hint (état session,
  masqué en mode réduit).
- **Badges vigilance réels** : ruptures stock (`stockOverview.outOfStock`),
  règlements dépassés (`debtsStats.settleOverdue`), pain en cours
  (`breadStats.pending + ready`). Règles d'honnêteté : `null` = inconnu
  (aucun badge, jamais de `0` mensonger), badge seulement si `> 0`, `99+`
  au-delà, refresh montage + toutes les 120 s (3 requêtes légères).
- **F1 global → Caisse** : le badge `F1` du rail devient réel partout (hors
  modale) ; en caisse, le handler écran ouvre en plus l'article libre
  (comportement additif sans conflit, documenté).

## Conservation

Gating licence, `data-path`, collapse 68px, pied hors-ligne, pastille `F1`
unique conservée (les autres touches restent contextuelles au footer —
règle ADR-037 : étiquette sans handler = bug).

## Vérification

- `typecheck` + `eslint` verts, `vite build` + `build:electron` (integrity
  130 fichiers), démarrage nominal, `vitest` 65/409 verts.
