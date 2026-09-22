# ADR-018 — Pages Rapports, Proformas, Zakat, Pain + Dashboard

Date : 2026-09-16. Statut : accepté.

## Contexte

Quatre modules sidebar restaient des placeholders (dont trois avec backend
partiel) : rapports sans agrégat, proformas sans écran, zakat sans
persistance, pain sans cycle de vie.

## Décision

- Migration **0012** (schéma antérieur immuable) : pain (type, tél. libre,
  moyen, statut riche 6 états repris de l'ancien cycle), `proforma.terms`,
  table `zakat_calculations`. Pas de TVA (cohérence ventes), pas de codes
  clients (CL- dérivés stables).
- **Proformas** : liste filtrée, détail, édition (brouillons), suppression
  gardée, duplication côté client, conversion + impression existantes.
- **Zakat** : reporting seul ; paramètres (taux, nisab, méthode indicative,
  hawl), sources live, calcul manuel (caisse/banque non suivies → saisie),
  historique persisté, impression via rapports, export CSV.
- **Pain** : cycle 6 états (ancien `pickup` conservé en compat), types libres
  - datalist, encaissement avec moyen, édition (prix figé, qté gardée),
    conversion/transfert exposés, bon via rapports génériques.
- **Rapports** : agrégat `reports.summary` (KPIs + seaux jour/semaine + tops +
  paiements + retours ; marge = ventes nettes − achats revendus), graphiques
  SVG reconstruits côté main, export CSV (Excel) + impression ; PDF = dialogue
  système. Pas de table unifiée (l'Historique la couvre).
- **Dashboard** : agrégat `dashboard.summary` borné (KPIs période + instantanés
  dettes/stock, séries, méthodes, comparaison, rotation, alertes, récents,
  pain) ; trésorerie = encaissé − décaissé (période) ; actions rapides
  (Achat → Fournisseurs, pas d'écran de saisie d'entrée).

## Conséquences

- Tous les modules sidebar sont prêts. 22 tests ajoutés au total.
