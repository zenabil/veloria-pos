# ADR-014 — Page Dépenses (charges d'exploitation)

Date : 2026-09-16. Statut : accepté.

## Contexte

Les dépenses n'avaient qu'un CRUD minimal (description/catégorie/montant/date),
sans écran : ni fournisseur, ni moyen de paiement, ni statut payé/en attente,
ni suppression. Le module sidebar « Dépenses » était un placeholder.

## Décision

- Migration **0011** (schéma antérieur immuable) : `supplier_id`,
  `payment_method`, `status` (`paid` défaut = comportement historique),
  `reference`, `notes` + 3 index. Lignes existantes inchangées.
- Règle : dépense `paid` ⇒ moyen requis ; `pending` ⇒ moyen optionnel.
- Recherche serveur : description/catégorie/fournisseur/référence + `DEP-00012`
  compris (id direct) ; filtres catégorie (distinctes servies avec les stats),
  statut, moyen, période ; 4 tris ; pagination. Numéro `DEP-…` dérivé (aucune
  colonne, comme `CL-…`).
- Suppression définitive (table feuille, aucune référence entrante) + audit ;
  suppression en masse par boucle gardée. Canaux : `expenses.delete/stats`
  nouveaux (`create/list/update` étendus, contrats précédents inutilisés par
  l'UI).
- UI : table 10 colonnes, tiroir détail, formulaire (datalist catégories,
  recherche fournisseur, moyen requis si payée).

## Conséquences

- Nouveau module sidebar « Dépenses » (prêt). Dépenses absentes de
  l'Historique (taxonomie ADR-011 figée — suivi ultérieur avec retours).
