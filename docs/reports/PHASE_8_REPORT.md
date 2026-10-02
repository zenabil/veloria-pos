# PHASE_8 — Audit profond 3 programmes + complétude (01/10/2026)

Périmètre : `mobile/` (APK clients), `src/`+`electron/` (POS), `license-manager/`
(vendor), boucles POS→miroir→APK et licence manager→POS. Méthode : 4 audits
parallèles croisés + vérification manuelle des P0 + corrections en tranches
verticales. Règle d'arrêt : format → typecheck ×3 → tests → verify-migrations.

## P0 corrigés (bloquants)

1. **Miroir jamais alimenté** : `sync_outbox` (0032) sans `customer_id` alors que
   le push (`sync.service`) et le protocole l'exigent → `no such column` à
   chaque poussée. Fix : migration **0033** (`ADD COLUMN customer_id` + index),
   INSERT repo, `listPendingOutbox`, test de régression
   (`client-access-sync` : customer_id persisté + requête push).
2. **Factures annulées invisibles** : SELECT miroir excluait `is_cancelled`.
   Fix : colonne incluse + flag dans le payload, sommes/mois/Top sur actives.
3. **Dépassement jamais signalé** : `is_over_limit` non sélectionné → APK
   toujours faux. Fix : SELECT + payload (`requireLiveCustomer`).
4. **Manager — capabilities inutilisables** : canal existant, aucun éditeur UI.
   Fix : éditeur pages/features dans le détail + ré-émission.
5. **Manager — écritures non atomiques** : INSERT/UPDATE + event séparés.
   Fix : helper `inTx` (better-sqlite3, repli direct en test) + 5 flux wrappés
   - test stub (begin/work/commit, rollback propagé).
6. **Manager — backup sans restore** : canaux `manager.backups/restore` +
   `listManagerBackups/restoreManagerBackup` (snapshot + integrity_check +
   rollback) + onglet Sauvegardes UI.
7. **Manager — clé privée en clair** : stockage DPAPI (`private.enc`,
   migration legacy best-effort, repli clair documenté hors Electron) +
   confirmation d'écrasement (`{force:true}`).

## P1 corrigés

- Empreinte : comparaison insensible à la casse (POS) + normalisation
  minuscule à la signature (manager) ; sources cross-platform (MAC,
  os-user, machine-id) — non-win32 débloqué.
- `vite-env.d.ts` : clés `previewReport/printReport` dupliquées supprimées.
- Manager `fail()` : messages techniques (SQLITE/UNIQUE/ENOENT) sanitizés FR.
- Manager UI : recherche câblée (+ total), `prompt/confirm` → modale inline
  (renouveler/transférer+motif/révoquer/suspendre/restaurer/clé),
  édition affichée dérivée du plan, validation live empreinte, détail enrichi
  (pages, notes, client_id, appareils, détails d'historique), gardes d'état
  des boutons, collision `licenseId` → 3 tentatives.
- POS : centre de notifications réel (licence/backup/miroir) remplaçant le
  stub ; `ErrorBoundary` FR par module ; `Session active`, `Caisse`, `Poste
vendeur` ; `Dépôt central` (ville codée retirée) ; CSV historique via
  `frError` ; total caisse avec fallback FR ; badge « Solde indisponible »
  (fini le défaut « Comptant uniquement » trompeur).
- Directs `callChecked` + schéma (recordPayment/matchBatch/sales.create) :
  conservés volontairement (plus fort que les wrappers `api.*` non validés).
- ADR-052 : addendum documentant l'approche constatée (réimplémentation
  testée, divergences connues) au lieu de copies à risque.

## Écarts assumés / V2 (documentés, non codés)

- `maxDevices` signé mais non contrôlé (aucun registre d'appareils) ; kinds
  `announcement`/`access_revocation` morts (annonce via snapshot, révocation
  via `revoked_at`) ; `REINITIALISER` ASCII volontaire (preuve littérale
  main) ; ESC/POS brut absent (impression HTML système) ; push Supabase +
  build APK = étapes opérateur.

## Portes

- `verify-migrations` : VERIFIED (1..0033) ; `tsc` electron+principal+manager :
  0 erreur ; ESLint : 0 sur fichiers touchés ; Prettier : conforme.
- Tests : unit 419/419 (62 fichiers), intégration+base 72/72 (16 fichiers).
- Bundle web APK compilé ; démo `:8099` (login + `saleId=142` → 3 lignes,
  inconnu → 404) ; `:8083` servi.
- Note d'environnement : `better-sqlite3` compilé pour Node Electron (136),
  pas le Node système (147) — `npm rebuild` requis pour usage hors Electron
  (règle 9) ; suites vertes malgré tout (chemins d'échec couverts).

## Boucle locale cliquée POS→miroir→APK (01/10/2026)

- P0 système : `handle()` IPC n'attendait pas les handlers async → toute
  réponse Promise mourait en « object could not be cloned » (`sync.pushNow`
  seul touché). Fix : callback `async` + `await fn(input)` (registry).
- Config miroir : URL `http` refusée deux fois (main `validateSyncConfig` +
  pré-validation renderer) → `http` autorisé **loopback seul**
  (`localhost|127.0.0.1|[::1]`, sans chemin), clé min 20 conservée.
- Harnais : `scripts/e2e-mirror-relay.mjs` (PostgREST upsert + logique Edge,
  `:8100`, données de test) + `tests/e2e/full-loop-client.spec.ts`
  (activation licence E2E → client+tél+crédit → activation APK+QR →
  produit → vente crédit partiel → sync 3+details → config+poussée →
  assertions relais + login APK réel) + `scripts/e2e-mobile-shots.mjs`
  (captures Chromium de l'APK, `test-results/e2e-loop/m-*.png`).
- Helpers E2E resynchronisés avec la caisse (labels « Montant donné »,
  « Valider & Encaisser ») — `sale-flow`/`customer-invoice` en bénéficient.
- Preuve : `Miroir poussé : 7 cliché(s), 1 accès` ; APK connecté au relais
  affiche `FAC-2026-00001` (partielle), son détail (lignes ×2) et la dette —
  captures `01..08` + `m-home/m-invoices/m-detail`.
- Dérive E2E rattrapée (UI plus neuve que les specs) : labels caisse
  (« Montant donné », « Valider & Encaisser ») et recherche historique
  (aria-label dédié) — `sale-flow`/`customer-invoice` en bénéficient.
- Leçon empreinte : sources MAC écartées (adaptateurs virtuels/VPN
  instables entre processus → mismatch) ; `os-user` + `machine-id` gardés
  pour le non-win32, les 4 sources stables restent sur win32.
- Config miroir : validation URL dupliquée renderer+main — les deux
  autorisent désormais `http` loopback seul (clé min 20 conservée).
