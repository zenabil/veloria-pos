# ADR-047 — Client 360 à onglets + fournisseur inline + backup 8 fréquences

> Statut : accepté (Phase 2, P1-1/2/3).

## Contexte

Audit P1 : fiche client sans onglets (0 hit `360`), création fournisseur uniquement depuis `SuppliersScreen`, backup `intervalDays` 1..30j au démarrage seul.

## Décision

- Client 360 (`ClientDialogs.tsx`) : 5 onglets FR `Factures/Paiements/Retours/Dettes-Solde/Historique` (`tablist`, clavier ←/→), données existantes (`customers.statement`, `returns.list`, `debts.list`, `history.list` rapprochées côté renderer par nom normalisé + filtre serveur `query`), chaque facture Ouvrir (`InvoicePreviewModal`) + Imprimer (80mm direct), soldes `formatDzd` centimes. Paresseux par onglet + Réessayer.
- Fournisseur inline : `SupplierQuickForm` + `SupplierQuickCreateDialog` extraits de `suppliers/dialogs/FormDialog.tsx` (mêmes validateurs, `suppliers.create` + `newOperationId`), montés en sœurs modales dans `products/dialogs/FormDialog.tsx` et `stock/dialogs/IntakeDialog.tsx` (sélection auto, état parent conservé, zéro perte).
- Backup : `backupAutoSchema {enabled, frequency: 10min|30min|1h|6h|12h|daily|weekly|custom, customMinutes 5..10080, retentionCount 1..100}` + compat `intervalDays` legacy ; `frequencyMinutes` + rotation `retentionCount` (défaut 30) + `startAutoBackupTimer` (60s, main, `unref`) + démarrage conservé ; règle pure extraite `src/domain/backup/backup-rules.ts` (`backupFrequencyMinutes`, `clampRetentionCount`) pour UI/tests sans importer Electron. UI : 8 options FR + custom + rétention + liste/restaurer + alerte `role=alert` + `notify` si en retard.
- Écart assumé : rapprochement retours/dettes/historique par nom (pas d'`entity_id` client) — homonymes possibles, filtre serveur + resserrage renderer (documenté).

## Conséquences

- Tests : backup via `backup-rules` pur (le service Electron n'est jamais importé en test — garde eslint `strictTypeChecked`).
