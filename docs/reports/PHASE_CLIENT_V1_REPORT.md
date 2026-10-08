# PHASE_CLIENT_V1_REPORT — Application clients lecture seule (APK + miroir)

Date : 2026-09-29. Périmètre V1 verrouillé : 40 clients, lecture seule, 0 $.
SQLite reste le seul master ; Supabase n'est qu'un miroir jetable (ADR-053).
Exception bilingue limitée à l'APK (ADR-051). Emplacements neufs (ADR-052).

## Livré

### POS — tranche verticale complète

- Migration `0032_client_access_sync.sql` : `customer_access` (1 actif/client,
  condensats SHA-256, cascade), `sync_outbox` (UNIQUE operationId), `announcements`
  (120 max). 0001..0031 intactes.
- Domaine pur : `src/domain/customer/client-access.ts` (PIN 6 chiffres, QR 7 j,
  session 90 j, verrou 5 échecs/5 min, annonces).
- Use-case pur : `src/application/customers/client-access.ts` (activation validée,
  cliché accueil : 3+3, mois AAAA-MM, Top 5, points dérivés 1/1000 DZD affichés).
- Repo main : `electron/ipc/handlers/client-access.repo.ts` (SHA-256 côté main,
  remplacement atomique, révocation idempotente, 4 kinds de clichés + garde 200 Ko,
  file UNIQUE, annonces).
- 10 canaux explicites + Zod : `customers.access{Activate,Revoke,Status}`,
  `sync.{enqueue,markSent,pending,pushNow,getConfig,saveConfig}`, `announcements.save`.
  Mutations sous garde licence + page `customers`. Bridge complet (preload, Window,
  ipc-client, contrats `callChecked`).
- Synchro : `electron/sync/sync.protocol.ts` (pur) + `sync.service.ts` (poussée REST
  upsert, config `client_sync` clé masquée, timer 60 s, rafraîchissement best-effort
  après chaque vente/paiement — jamais d'exception vers la finance).
- UI commerçant (FR) : section « Application mobile » dans le tiroir client
  (statut, PIN, carte d'activation unique, synchroniser, couper) + rubrique
  « Miroir APK » dans Paramètres → Données (URL, clé service, cadence, poussée).
- Nettoyage documenté : 5 erreurs ESLint préexistantes (ClientDialogs, WIP parallèle)
  - 4 (SettingsSectionsB) corrigées sans changement de comportement.

### Cloud — `cloud/supabase/`

- `schema.sql` (accès + clichés + vue derniers), `rls.sql` (refus par défaut,
  lecture via `client-sync` + service_role uniquement),
  `functions/client-sync/index.ts` (1 aller-retour : PIN → clichés, mêmes verrous),
  `limits.md` (budgets : ~60 Mo/5 Go, ~1200/500k appels, keep-alive anti-pause).

### APK — `mobile/`

- Fondations testées : tokens (header `#051424` + contenu clair), i18n ar/fr fermé
  - RTL/LTR, formateurs centimes, appel `client-sync` (fetch injecté, timeout 10 s).
- 5 écrans réels : Login, Accueil (hero dette + mois + 3+3 + Top5 + points + bandeau),
  Factures (recherche + chips + détail + erreur WhatsApp), Paiements (timeline + mois),
  Compte/Magasin (+ ligne « À propos »). Coquille 4 onglets + montants masquables.
- `package.json`/`app.json` Expo (installation sur machine de build uniquement).

## Portes vertes

- `vitest run` : 75 fichiers / 471 tests verts (dont 27 nouveaux : 0032, accès,
  protocole, fondations et vues mobile).
- `verify-migrations` : MIGRATIONS VERIFIED (séquence 1..0032 sans trou).
- `tsc -b` + `tsc -p tsconfig.electron.json` : 0 erreur.
- `vite build` + `build:electron` : verts (manifest re-signé, 136 fichiers).
- ESLint 0 sur tous les fichiers touchés ; Prettier conforme.
- Bridge-shape : aucun canal mort, aucun schéma mort.

## Reste hors-machine (étapes opérateur)

1. Créer le projet Supabase Free, appliquer `schema.sql` + `rls.sql`, déployer
   `client-sync` avec `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
2. Coller URL + clé dans Paramètres → Données → Miroir APK, activer, « Pousser ».
3. Sur machine de build : `npm install` dans `mobile/`, renseigner URL/anon dans
   `App.tsx`, `eas build -p android --profile preview`, distribuer via WhatsApp.
4. Pilote 5 clients / 2 semaines (critère : 4/5 autonomes, dette comprise sans appel,
   1 erreur signalée via WhatsApp), puis 40. QR valables 7 jours, sessions 90 jours.

## Exclu V1 (V2)

Commandes, paiement mobile, notifications push, PDF, fidélité avec remise, barcode,
multi-magasins. Toute écriture future = `*_intent` validé côté POS, jamais direct.

## Suite — complétude APK (30/09/2026, ADR-054)

- QR d'activation scannable : format `VELORIA1|phone|pin|code`, use-case pur +
  miroir main + canal lecture seule `customers.accessQrSvg` (SVG N&B, repli
  texte), image sur la carte d'activation, écran scan APK (`expo-camera`,
  anti double-scan, erreurs ar/fr). PIN seul secret, même `client-sync`.
- Écrans Stitch manquants ajoutés : reçu facture + reçu paiement (bottom-sheet
  ticket 80mm + partage WhatsApp), cloche notifications (annonce + fraîcheur),
  demande de code WhatsApp pré-login, mois localisés (« سبتمبر 2026 »),
  pastille situation financière dans Compte, liens « عرض الكل » vers onglets.
- Correctifs : PIN clavier arabe (normalisation ٠-٩→ASCII), mois par défaut
  après login, paddings sous nav flottante, `amount_paid_minor` requis partout
  (interface + mapping App + données de test), `SERVER_ERROR` mappé
  `serverError` (plus confondu avec hors-ligne), Entrée clavier = valider.
- Persistance : session SecureStore (repli mémoire) + clichés expo-sqlite
  (repli mémoire), restauration au démarrage + rafraîchissement silencieux,
  splash V, langue/masquage mémorisés, logout purge tout.
- Portes : 48 tests ciblés verts (dont `mobile-qr`, payload, bridge-shape),
  `tsc` electron + principal 0 erreur, ESLint 0 sur fichiers touchés, Prettier
  conforme, bundle web compilé (expo-sqlite/camera OK), démo `:8099` vérifiée.

## Suite — page détail facture (30/09/2026)

- Page détail complète (design `invoice_receipt`) : ticket 80mm avec LIGNES
  produits (quantité × prix), totaux, statut, QR, partage + signalement
  WhatsApp, skeleton, erreur + réessayer, persistance sqlite du dernier détail.
- Protocole : `fetchInvoiceDetail` (+ `saleId`, code `NOT_FOUND`) ; fonction
  Edge `client-sync` : branche `saleId` (balaye 50 derniers `invoice_detail`,
  comparaison lâche, 404 sinon) — sans changement de schéma miroir.
- Alimentation : `enqueueSaleRefresh` pousse le détail après chaque vente ;
  bouton « Synchroniser » complète les factures ouvertes (cap 10) via
  `selectDetailSaleIds` pur et testé. Navigation : page par-dessus onglets
  (nav masquée, retour), reçus paiements inchangés en bottom-sheet.
- Portes : 53 tests ciblés verts (`toDetail`, `fetchInvoiceDetail`,
  `selectDetailSaleIds`), `tsc` 0 erreur, démo `:8099` vérifiée
  (`saleId=142` → 3 lignes, inconnu → 404).

## Intégration travail parallèle + correctifs démo web (30/09/2026)

- Constat : tranches parallèles trouvées dans l'arbre (QR ADR-054, redesign
  Stitch, persistance `cache.ts`, page détail) — suivent les conventions
  (canaux explicites, miroirs, tests). Rien d'écrasé : intégration seule.
- Correctifs appliqués (vérifiés, sans changement de comportement) :
  - `mobile/src/cache.ts` : modules natifs en chargement paresseux — l'`import`
    statique d'expo-sqlite plantait le bundle web au démarrage (écran blanc,
    `Cannot find native module 'ExpoSQLite'`) ; le repli mémoire prévu
    fonctionne de nouveau sur web.
  - `mobile/src/views.ts` (`mapSale`) : `amount_paid_minor` manquant → `undefined`
    → `formatMinor` levait → écran blanc à l'ouverture du détail. Cause masquée
    car `mobile/` est hors `tsc`. Garde-fou ajouté : `tests/unit/mobile-payload.test.ts`
    (aucun `undefined` dans le view-model + tout `*_minor` affichable).
  - `mobile/src/format.ts` : séparateur de milliers U+202F (l'espace normale
    coupait les montants en deux runs bidi en RTL).
  - 3 directives ESLint mortes retirées (`App.tsx`, `cache.ts`).
- Portes finales : `vitest run` 78 fichiers / 488 tests verts, `tsc -b` +
  `tsc -p tsconfig.electron.json` 0 erreur, ESLint/Prettier verts sur fichiers
  touchés, démo web rejouée (login → 4 onglets rendus, 0 erreur console).
- Point d'attention : le serveur démo `:8099` et Expo `:8082` meurent entre les
  sessions (processus d'arrière-plan récoltés) — les relancer avant chaque démo.
