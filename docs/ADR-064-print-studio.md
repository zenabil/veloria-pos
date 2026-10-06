# ADR-064 — Print Studio (Phase C6)

Date : 2026-10-03. Statut : accepté (pipeline vert, 36 migrations).

## Contexte

`PrintTemplatesScreen` n'était qu'un centre de contrôle (imprimante + matrice
statique). La personnalisation réelle exigeait du code. Le Studio rend le
design aux utilisateurs : 7 types (facture, ticket, proforma, bon_livraison,
recu, avoir, etiquette), aperçu live, impression test, versions, import/export.

## Décisions

1. **Persistance SQLite (migration 0036)** : table `print_templates`
   `(doc_type, name)` UNIQUE, un seul actif par type (index partiel
   `uq_templates_active`), `version` monotone, `is_factory`/`is_active`.
   Seed : 7 modèles « Défaut » actifs (= rendu historique). redémarrage-sûr.
2. **Tranche verticale** : `src/domain/print/template-rules.ts` (défauts,
   fusion bornée, papiers par type) → `electron/ipc/validators.ts` (8 schémas
   Zod, `operationId` requis en mutation) → `templates.repo.ts` (transactions
   - idempotence, UNIQUE traduit en FR) → 8 canaux `templates.*`
     (`channels` + `registry` + `preload` + `vite-env` + `ipc-client`) →
     `PrintTemplatesScreen` (Studio) → tests.
3. **Application au rendu** : contenu via les données (logo/identité/TVA/QR/
   pied déjà conditionnels), mise en page via options explicites des builders
   (`PageOpts` A4/A5+marges, `logoSize` S/M/L, filigrane/signatures/colonnes
   masquables, police thermique 9–14px, copies 1–5 en boucle explicite).
   Jamais de remplacement de chaîne dans le HTML.
4. **Aperçu live sans données métier** : canal `templates.preview`
   (réglages fournis ou actifs, échantillon démo déterministe) +
   `templates.testPrint` (1 impression réelle). Les contrats d'aperçu
   existants sont intouchés.
5. **Versioning honnête** : compteur + `updated_at` par sauvegarde ;
   dupliquer (copie v1), renommer (sauvegarde sous nouveau nom), export/
   import JSON (validé côté main par Zod), reset usine (coutumes supprimées,
   usine restaurée v1). Pas d'historique complet (scope refusé).
6. **Refus documentés** : couleurs et polices A4 (le N&B strict est un
   invariant P0 testé — lisibilité fiscale et thermique) ; imprimante par
   modèle (le défaut global s'applique) ; bons de commande sans modèle
   (comportement usine) ; reçus de règlement sans timbre (suivi C5).
7. Mutations sous licence (comme `settings.save`) ; lectures et aperçu
   ouverts (échantillons uniquement).

## Preuves

- `tests/unit/c6-studio.test.ts` 8/8 (domaine, Zod, builders, N&B conservé).
- `tests/integration/print-templates.test.ts` 3/3 (seed, unicités, CHECK).
- `tests/unit/bridge-shape.test.ts` : 8 canaux exposés, 0 schéma mort.
- Pipeline : `format` + `lint --max-warnings 0` + `typecheck` + `test` +
  `verify:migrations` (36) + `build` + `release:smoke` verts.
