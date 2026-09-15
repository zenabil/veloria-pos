# ADR-004 — Tranches verticales Phases 6-9 (stock, proformas, finance, pain)

Date : 2026-09-15. Statut : accepté.

## Contexte

Après le socle (Phases 0-2 : domaine, SQLite, Electron, caisse), les modules
d'exploitation restaient en placeholders : stock/entrées/fournisseurs (Phase 6),
proformas (Phase 7), dettes/rapports/clôture Z/zakat (Phase 8), pain (Phase 9).

## Décision

Une tranche verticale complète par module, sans exception :

- `src/domain/<module>/*-rules.ts` : règles déterministes, framework-free, testées
  (intake, supplier, proforma, bread, closing, csv-import).
- `electron/ipc/handlers/*.repo.ts` : prepared statements, **une transaction par
  mutation multi-tables** (entrée, paiement fournisseur, conversion proforma,
  clôture, commande pain), idempotence `operationId` + ligne `audit_log`.
- `electron/ipc/{channels,validators,registry}.ts` + `preload.ts` : canaux
  explicites `domaine.action` validés Zod. Aucun `run-sql` générique.
- `src/features/<module>/*Screen.tsx` : UI français uniquement, états
  chargement/vide/erreur, aucun bouton mort.
- `database/migrations/0005_*` : **index uniquement + graine** (`IF NOT EXISTS`,
  rejouable, schéma 0001-0004 immuable).
- `tests/unit/phase6-9-rules.test.ts` + `tests/integration/atomic-slices.test.ts`
  (node:sqlite, sans toolchain native).

## Formules verrouillées

- Entrée : `total = Σ(prix_achat × (reçu − abîmé)) + port` ; solde fournisseur `+= total`.
- Clôture Z : `clôture = ouverture + ventes_espèces + encaissements − dépenses − remboursements`,
  une seule ligne par `business_date` (UNIQUE).
- Zakat : reporting seul (`calculateZakat`), jamais un registre ; taux/nisab explicites.
- Import CSV : validé-avant-commit, tout-ou-rien, max 5 000 lignes.

## Conséquences

- 21 nouveaux canaux IPC typés ; bridge `window.veloria` étendu (renderer toujours
  sans Node/SQLite).
- Dashboard enrichi (top 5 + 8 dernières ventes, SQL borné).
- Vérifications sans dépendances : `verify-migrations` (0005), `verify-domain`
  (17 assertions), `verify-perf` (10k produits).
