# ADR-012 — Page Retours clients + fournisseurs

Date : 2026-09-16. Statut : accepté.

## Contexte

Seuls les retours clients existaient (sans numéro, sans statut, sans écran) :
aucun retour fournisseur, aucun remboursement complémentaire, aucune annulation
sûre. Le module sidebar « Retours » était un placeholder.

## Décision

- Migration **0010** (schéma antérieur immuable) : `returns` gagne numéro
  (`RET-C-00001`), statut CHECK, moyen de remboursement ; nouvelles tables
  `supplier_returns` / `supplier_return_items` (numérotation `RET-S-…`) ;
  condition + avant/après stock par ligne des deux côtés.
- Création atomique : éligibilité (vendu − déjà retourné, annulés exclus),
  restock client / déduction fournisseur (jamais sous zéro), dette fournisseur
  −= total, avoir client −= dette, statut dérivé (validé / partiellement /
  remboursé). Référence + notes tracées.
- Remboursement complémentaire borné par le reste ; **annulation gardée** :
  retour vierge uniquement (aucun règlement), mouvements inverses
  (`adjust_*`, types SQL existants) + soldes restaurés.
- Canaux : `returns.create/list` étendus (contrats précédents inutilisés par
  l'UI, adaptés), `returns.detail/saleItems/intakeItems/refund/cancel/stats`
  nouveaux. Aucun `run-sql`.
- UI : table unifiée 11 colonnes, tiroir détail (montants, impact stock,
  impression du bon via canaux existants), création en 2 dialogues
  (facture / bon fournisseur avec éligibilités), remboursement, annulation
  unitaire + masse.
- **Écarts assumés** : pas de statut « En attente » (création = effet immédiat,
  pas de réservation en deux temps sans besoin métier) ; retours absents de
  l'Historique (taxonomie ADR-011 figée aux 9 filtres — suivi ultérieur).

## Conséquences

- Nouveau module sidebar « Retours » (prêt). 4 statuts effectifs, tous
  atteignables et testés (domaine + SQL + Zod).
