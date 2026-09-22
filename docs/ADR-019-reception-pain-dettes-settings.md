# ADR-019 — Réception stock, pain simplifié, dettes règlement, settings unifiés

Date : 2026-09-17. Statut : accepté.

## Contexte

Demande : mouvement produit + étiquettes (déjà présents), multi-code-barres /
multi-fournisseurs (déjà présents via `product_barcodes` + jonction 0015),
jour de règlement client 1-31 (déjà en base, affichage partiel), page stock
en réception facturée, recherche facture par scan code-barres, page dettes
surveillance règlements, pain simplifié + quotidien, zakat vers paramètres,
settings unifiés + backup configurable + infos développeur, nettoyage.

## Décision

- Stock : nouvelle `StockIntakeDialog` (fournisseur, N°/date facture, livraison
  DZD, lignes avec reçu/abîmé/prix) + coût unitaire avec livraison répartie au
  prorata + `StockIntakesDrawer` (factures). Backend `stock.intake` existant
  réutilisé (1 transaction atomique). Correction déjà couverte (ajustement /
  inventaire) : bouton renommé « Correction ».
- Pain : migration 0016 (`order_name`, `is_recurring` quotidien) + repo/validators
  compatibles anciennes bases + UI simplifiée (nom / client / quantité +
  switch quotidien, table allégée, badge, « Répéter demain »).
- Dettes : filtre `settleFilter` (watch/overdue/soon) exposé + colonne
  « Règlement (jour) » (chaque X · prochain + bande) + KPIs dépassé/proche.
  Clients : colonne « Règlement (jour) » ajoutée.
- Historique/retours : recherche facture par scan (placeholder + Entrée =
  ouverture auto du match exact, normalisation majuscules). Dialogue retour
  client : autofocus + aide scan.
- Zakat : paramètres déplacés dans Paramètres → Documents (`ZakatSettingsSection`),
  écran Zakat en lecture seule + calcul/historique (dialogue dupliqué supprimé).
- Paramètres : 12 → 6 rubriques (entreprise, commerce, catalogue, documents,
  données, système). Backup : fréquence libre 1-30 j. À propos : carte développeur.
- Nettoyage : test `debts` complété (champs règlement), exemption
  `labelItemSchema` imbriqué, test 0012 isolé de 0016, erreurs lint `??`/`as`
  corrigées, imports morts retirés.

## Conséquences

- `verify-migrations` vert (16 migrations). `typecheck` vert, 158/158 tests verts,
  `vite build` vert, ESLint vert sur fichiers touchés.
- Aucun canal générique ajouté ; montants en centimes ; transactions atomiques
  inchangées.
