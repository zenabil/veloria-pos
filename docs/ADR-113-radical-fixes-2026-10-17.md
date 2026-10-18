# ADR-113 — اصلاحات جذريّة دفعة 2026-10-17 (أمان المال + صدق الواجهة + إزالة الازدواج)

## Contexte

Audit complet des 16 pages (session du 2026-10-16) : livré en discussion.
G.logout de genèse : `{cwd}`/docs/INDEX.md. Cette ADR implémente les P0/P1 combinés.

## Décisions

### 1. Idempotence monétaire (R8) — le P0 le plus important

- `NewSupplierReturnDialog` et `RefundDialog` : `newOperationId()` inline dans
  `save()` remplacé par le hook figé `useOperationId()` (retry = 1 seul effet).
- `proformaStatus` (tiroir + envoi auto après création) : `operationId`
  désormais transmis (schema = `optionalOperationId`, compatible).
- Décision NON prise : câbler `restocked` au sélecteur « état » du retour
  fournisseur. Semantique : un retour fournisseur sort les marchandises
  (restocked:false est juste) ; l'état est enregistré (`condition` transmis).
  Le sélecteur est informatif, pas mort. Prévue : ADR décision produit si
  besoin d'un « retour sans les biens ».

### 2. Écrans/UX — zéro mensonge

- En-têtes neutralisés (jargon interne supprimé) : Historique (« SHA-256
  scellé » — aucun chaînage complet n'existe), Rapports (« v3.8 · SQLITE WAL ·
  POSTE 04 »), Dépenses (« JOURNAL SCELLÉ WAL · Poste 04 »), Retours (« Fiscal
  v3.2 · REGISTRE DES RETOURS · POSTE 04 »), Paramètres (« ESC/POS, RJ11,
  RS-232 »), Licence (« se très scellé SQLite »), Zakat (« Registre scellé » —
  contradictoire avec « jamais un registre »).
- Zakat : la « Taux assujetti / assiette nette » de l'aperçu est désormais
  labellisée estimation partielle (hors caisse/banque, jamais saisie) ; les
  années hégiriennes deviennent une fenêtre glissante (types.ts), plus de
  tableau figé 1446–1449 périmé.
- Dettes : InfoRow « Poste : Caisse 01 » codé en dur retirée (donnée fictive).
- Historique : le double champ de recherche (en-tête + barre d'outils) est
  réduit à un seul champ (en-tête, F3).
- Rapports : les 5 onglets sans carte (« lure tabs ») retirés de la liste
  REPORT_SECTIONS — les données profit/dépenses/restes restent via KPI +
  graphiques « Tout le rapport ». Les clôtures Z sont chargées seulement
  quand leur carte est visible (règle C #7 audit).
- Fournisseurs : le RowAction « Payer » est désactivé quand dette = 0
  (cohérent avec le tiroir détail).
- Dashboard : la cellule « Ventes du jour » n'est rendue que si la période
  filtrée contient aujourd'hui (sentinelle -1, jamais « 0 » trompeur).

### 3. Déduplication (audit §5/§4 partiel)

- `DocumentPreviewModal` (src/shared/documents/) : chrome unique
  tablist+iframe A4+pre 80mm. Sites migrés : historique (ticket + bon de
  livraison), dettes (tiroir reçu), devis (tiroir), clients (SlipPreviewModal
  = délégation). NON migré (décision de sécurité) : l'aperçu devis du flux de
  vente Caisse (formulaire Soumettre/Entrée — ergonomie caissier chiffrée,
  hors modèle modal onglets) et l'écran Impression (aperçu par gabarit).
- `MovementsDialog` (Catalogue) supprimé : « Mouvements » ouvre le tiroir
  Historique de Stock (filtré date/type + pager). Perdu volontairement : le
  graphe 14 jours — il agrégait incomplètement les 100 dernières lignes
  seulement (donnée mensongère potentielle) ; le tiroir filtrant est supérieur.
- `AdjustStockModal` (Catalogue, 3e implémentation d'ajustement) supprimé :
  le tiroir produit délègue à `StockAdjustmentDialog`.
- `SupplierQuickForm` (~180 lignes) fusionné dans `SupplierFormDialog` via le
  prop optionnel onCreated ; `SupplierQuickCreateDialog` reste un wrapper
  (ADR-047 non cassé, clients des 2 écrans inchangés).
- Stock-Adjustment-Dialog : le type « Inventaire » (doublon d' Inventaire)
  retiré du selector ; l'inventaire passe par InventoryDialog.

### 4. Arête architecturale

- La liste blanche du test garde a3 s'agrandit par `products>stock`
  (unidirectionnelle ; zéro cycle). Revue architecte : OK — Catalogue est
  consommateur de dialogs Stock, jamais l'inverse.

### 5. Échecs groupés mesurés (règle 6)

- Retours `cancelSelection` et Dépenses `deleteSelection` : catch{} silencieux
  remplacés par comptage des échecs + FR listé (3 premiers). L'opération
  utilise toujours un UUID frais par ligne (caller-owned, entités distinctes).

## Conséquences

- Risque de double facturation/stock via double-clic éliminé sur les 2
  retours + statuts devis.
- 2 fichiers sources supprimés, ~270 lignes dupliquées retirées.
- Différences de libellés en-têtes — les e2e n'assertion pas ces chaînes
  (grep tests : aucun match).
- Test A3 whiteliste +2 arêtes products>stock ; test reports mis à jour (6
  sections). Full suite 764/764, build RC OK, typecheck OK.

## Alternatives considérées

- Migrer l'aperçu Caisse sur DocumentPreviewModal → écarté (ergonomie
  caissier + risque e2e, bénéfice faible).
- Câbler restocked à l'état du retour fournisseur → écarté (sémantique stock
  non calibrée ; passe par sati ADR produit).
- Implémenter des KPI/rapports pour les 5 onglets retirés → écarté cette
  fois (données déjà visibles dans « all ») ; réouvrir si le budget
  reporting le justifie.
