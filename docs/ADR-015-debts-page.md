# ADR-015 — Page Dettes (créances clients + dettes fournisseurs)

Date : 2026-09-16. Statut : accepté.

## Contexte

Les dettes n'étaient visibles que par ricochet (fiches, relevés) : aucun
écran unifié, aucune échéance (colonne `sales.due_date` jamais renseignée),
aucun statut de retard. Le module sidebar « Dettes » était un placeholder.

## Décision

- Lecture seule : UNION créances/vendeur — ventes impayées non annulées
  (reste + échéance + statut `overdue`/`due` calculés) + comptes fournisseurs
  à solde > 0 (original = entrées + initial, payé = paiements, reste = solde).
  **Pas de ventilation des paiements fournisseurs par bon** (conception
  existante au compte — aucun prorata fabriqué).
- Canaux : `debts.list/detail/stats` (l'ancien `listDebts` par solde est
  remplacé, aucun appelant UI), `sales.setDueDate` (report d'échéance,
  vente non annulée). Paiements via canaux existants (`customers.recordPayment`
  - date optionnelle désormais, `suppliers.pay`).
- Échéance réelle : champ optionnel à l'encaissement crédit (caisse) +
  report depuis la page ; carte « Échéances du jour », filtres retard/venue.
- UI : table 10 colonnes, tiroir (historique paiements, ticket pour ventes),
  paiement borné, édition d'échéance (ventes uniquement), export CSV.
  `buildSaleTicketPayload` partagé (`shared/documents`, historique refactoré).
- Mono-poste : colonne « Caisse » comme l'historique (ADR-011).

## Conséquences

- Nouveau module sidebar « Dettes » (prêt). Dettes absentes de l'Historique
  (taxonomie ADR-011 figée — suivi ultérieur avec retours).
