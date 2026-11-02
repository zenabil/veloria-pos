# Handoff — Veloria POS (état au 2026-11-02)

> Document de continuité : tout ce qui a été fait, fichiers modifiés,
> erreurs (fermées/ouvertes), en-attente, commandes. Sessions 2026-10-07
> (§9), 2026-10-11 (§1-8) et 2026-10-12 (§10) archivées ci-dessous.
> §11 = session scan sans Entrée (2026-10-18). §12 = session politique
> opération→format d'impression (2026-10-18 bis). §13 = lancement POS
> opérateur (2026-10-18 ter). §14 = préparation du prompt d'audit
> dead-code (2026-10-18 quater). §15 = audit dead-code Phase A + lot 1
> (2026-10-18 quinquies). §16 = lot 2 (canaux IPC) + `knip.json` (2026-10-19).
> §17 = prompt d'audit intégral (2026-10-19 quinquies) — audit-first, 16 axes.
> §18 = **audit intégral EXÉCUTÉ** (2026-10-19 sexies) — 228 findings, 0
> correction de code, 3 livrables + ADR-120 proposé.
> Répondre à l'utilisateur en arabe.

## 1) État courant

- Branche : `chore/root-layout` — tête **session 99** (quatre constructions d'artefacts + retrait des anciennes ; cause racine du verrou electron-builder sur `E:` trouvée et contournée). Avant elle session 98 (liasse propriétaire publiée par le POS, ADR-171, audit/corrections Supabase), session 97 (`maxDevices` documentée, ADR-172), session 96 (sessions de caisse, ADR-170), session 95 (jour métier Africa/Algiers, E-35 corrigé, ADR-169), session 94 (bootstrap de l'environnement sur poste neuf), session 93 (diagnostic bandeau hero client), session 92 (test appareil réel, CPH2235), session 91 (APK Native-max, ADR-168), session 90 (purge ciblée post-audit, ADR-167), session 89 (purge des artefacts obsolètes), session 88 (annonces multi-médias + bandeau hero APK, ADR-166), session 87 bis (rafraîchissement périodique de l'APK selon la cadence POS, ADR-165), session 87 (annonce magasin poussée aux clients, ADR-160). Avant elle session 86 (compte propriétaire, ADR-164), session 85 (connexion Supabase owner, ADR-163), session 84 (données fictives supprimées, owner), session 83 (Argent/Stock/Périodes/Alertes enrichis), session 82 (Aujourd'hui + détails de transaction), session 81 (passe design v2 owner), session 80 (écrans courts owner), session 79 (application propriétaire, ADR-162), session 78 (déploiement Supabase ADR-160), session 77 (version unique 1.0.4 + mises à jour, ADR-161), session 76 (détails de facture APK, ADR-160), session 75 (encaissement standalone ventilé FIFO, ADR-159), session 74 (passe UX mobile 2026), session 69 (Installateurs POS + License Manager), session 68 (APK client signé), session 67 (Miroir Supabase opérationnel, ADR-158), session 66 (Développement des interfaces, ADR-157), session 65 (Organisation du tronc racine, ADR-156), session 64 (Montée de gamme de l'outillage, ADR-155), session 63 (Tableau de bord simplifié, ADR-154), session 62 (purge dead-code en trois lots, ADR-153), session 61 (login client V6 « Connexion développée », ADR-152), sessions 60 (login V5 « Connexion directe », ADR-151), 59 (client mobile V4 « Daylight plat », ADR-150), 58 (purge +1,4 Go), 57 (pied d'arbre, docs), 56 (code-barres carton, ADR-149) et 54 (audit transversal, 21 findings, 4 P1 corrigés). Les sessions 41 (retours dette d'abord) et 45 (carton devis/retours fournisseur), jusque-là **non commitées** dans l'arbre de travail, ont été figées en **checkpoint `7f98e44`** sur décision du propriétaire avant l'audit : le commit rend le travail réversible, il ne vaut **pas** la validation produit, qui reste due. **Arbre propre** (hors `release/`, `graphify-out/` et artefacts de navigateur, non versionnés).
- **Session 98 (2026-11-02)** : **liasse de supervision propriétaire publiée par le POS (ADR-171 — constat n°1 clos)** — `publishOwnerSnapshot` n'existait que dans les documents (`grep` main/renderer = 0) alors que `owner/src/store.ts:269-289` + `owner/src/api.ts:137-192` consomment le contrat `OwnerSnapshot` v1 dans 9 écrans. Tranche livrée : constructeur `electron/sync/owner-snapshot.ts` (contrat **jumelé** sur l'app Owner — frontière workspace ; réutilise `getDashboardSummary`/`listClosings`/`getCashAuditSummary` et n'ajoute que les lectures absentes : seaux d'ancienneté 0-30/31-60/60+, `lateDays`, dernier versement, `sold30`/`perDay`/`autonomyDays`/`suggestedRestock`/`deadCount`, mouvements par produit ; bornes `MAX_*` + garde `MAX_LIASSE_CHARS = 900_000` ; **zéro donnée inventée** : `objectiveMinor`/`manager` restent `null` faute de colonne) · publication **append-only directe** `POST /rest/v1/owner_snapshots` avec les en-têtes `service_role` du miroir — **pas** un kind `sync_outbox` (CHECK immuable 0032, « SOURCE AUTORITAIRE ») — idempotente par `operationId` (rejouement = une seule ligne), portes lues sur le **doc persisté** (miroir coupé après activation ⇒ refus FR sans requête), détail serveur au log seulement · cadence autonome `ownerEnabled` (**défaut OFF**) + `ownerIntervalMinutes` (60, 15-1440) dans le doc `client_sync` chiffré, crochet du timer 60 s en best-effort · 1 canal `sync.pushOwnerSnapshot` (Zod + preload + façade + réponse sans liasse ni secret), gates calqués sur `sync.pushNow`, UI « Liasse de supervision (application propriétaire) » dans Paramètres → Miroir Android (interrupteur, cadence, dernière publication, erreur courante, « Publier maintenant ») · relais E2E étendu (`POST`+`GET /rest/v1/owner_snapshots`) · **cloud audité et corrigé** : `owner.sql` appliqué (`relrowsecurity=true`, politique `owner_snapshots_read` SELECT→`authenticated`, `anon` sans droit vérifié par HTTP réel `42501`), vue `latest_client_payloads` **réalignée** `security_invoker=true` (dérive silencieuse depuis ADR-158), fonction `client-sync` déployée (répond son `AUTH_ERROR` FR), CHECK `kind` déjà conforme à 0032 avec `announcement`, **inscriptions publiques fermées** (faille réelle : n'importe quel compte `authenticated` aurait lu toute la liasse ; vérifié `signup_disabled`) et 1 compte Auth confirmé existant (**le handoff disait « jamais créé » — périmé** : `zenaguibilal2@gmail.com`, 31/10). **Base du client migrée 56 → 59** après sauvegarde `E:\data\backups\avant-migrations-atelier-2026-11-02T04-36-37-375Z.vposdb` (0057+0058+0059, `integrity_check=ok`, 0 FK, 59/59 checksums identiques aux fichiers, 1165 ventes/95 clients conservés). Deux agents délégués ont cassé en vol (limite de tours) ; le travail restant a été repris et terminé en main (2 erreurs de typage de test + 19 erreurs de lint réparées). Inventaires gelés : canaux 190→**191**, schémas/exports/classes mis à jour. Portes : `npm run check` **vert** · **vitest 180 fichiers / 1 274 tests 0** (dont 32 tests de la tranche : protocole 12, publication à transport injecté 7 — premier usage réel de l'injection — liasse sur base migrée 13) · `verify` **vert** (migrations 59, secret-scan 1 521 fichiers) · `knip` **0**. **Reste ouvert** (ADR-171) : rétention `owner_snapshots` (append-only sans purge, ~720 lignes/mois), durcissement `auth.uid()`, `objectiveMinor`/`manager` (décision produit + colonne). **Non fait** : `test:e2e`/`test:coverage`, boucle réelle POS→cloud→APK, et les 4 constructions d'artefacts (session 99). Détails §98.
- **Session 97 (2026-11-02)** : **`maxDevices` documentée comme non appliquée (ADR-172 — clos G-17 / décision Q15)** — décision opérateur « توثيق فقط » (pas de registre d'appareils). Constat chiffré : la valeur est validée (`electron/licensing/protocol.ts:205-210`) mais `verifyLicenseChain()` ne la lit jamais ; `license-service.ts:291` la recopie dans `LicenseStatus` sans que `LicenseScreen.tsx:126-149` ni `LicenseBadge.tsx` ne l'affichent ni ne la comparent ; la table `licenses` du Manager ne porte qu'**une** colonne `hardware_fingerprint` que `rebindFingerprint()` écrase (`license-manager/ipc/licenses.ts:159-164`) — rien ne compte ; `signing.ts:227` omet même le champ s'il n'est pas nombre. L'**ADR promis par Q15 (ب) n'avait jamais été écrit** : le voici. Ce qui protège vraiment reste la liaison matérielle (`deviceBinding=true` ⇒ `INVALID_HARDWARE` sur une autre machine, changement de poste par `transfer`) ; la règle d'émission pour N postes = **N licences liées à N empreintes**, pas une flottante à `maxDevices = N`. Retrait explicite de la promesse fausse « appliqué à l'émission » dans `CAPABILITIES.md` (tableau + §9 Device binding), `LICENSE_FORMAT.md`, `HARDWARE_FINGERPRINT.md`, et des textes du Manager (`App.tsx` : placeholder, message de validation, ligne de détail « Appareils : … »). **Zéro modification de code de licence, zéro migration** : le comportement du POS est inchangé, le résidu (licence flottante multi-machines) est désormais **assumé et écrit** (`FINAL_REPAIR_REPORT.md:320-322`, `PHASE_8_REPORT.md:55`). Portes ciblées : `tsc -p tsconfig.manager.json --noEmit` 0 · `eslint license-manager --max-warnings 0` 0 · prettier vert sur les 4 documents · `tests/unit/license-manager.test.ts` **12/12** · `npm run build:manager` ✓ · `verify:licensing` sous Electron **OK** (2 avertissements attendus). Détails §97.
- **Session 96 (2026-11-02)** : **sessions de caisse réelles (préalable du publieur de liasse)** — même demande « اصلح التالي جذريا » ; l'Owner affichait `money.audit` / `money.activeSession` / `money.sessions` alors que le POS ne connaissait qu'une clôture de journée (`daily_closings`, une ligne par `business_date`), sans poste, sans comptage physique, sans écart (`grep cash_session|counted_minor electron/` = 0). Décision opérateur : **de vraies sessions**, pas une projection de `daily_closings`. Tranche verticale complète : migration **0059** `cash_sessions` (poste 1-40, libellé, opérateur NULL toléré, `opening_float_minor`, `counted_minor`, `expected_minor`, `note`, instants `opened_at`/`closed_at`, un `CHECK` de forme — ouverte ⇒ ni clôture ni attente, fermée ⇒ les deux + comptage ; **index partiel UNIQUE sur `post` quand `status='open'`** ⇒ la base refuse deux sessions ouvertes du même poste) · domaine pur `src/domain/cash/session-rules.ts` (attente = fond + ventes espèces + encaissements − dépenses − remboursements, **même formule que le Z**, signe conservé ; écart **jamais stocké** = compté − attendu ; conformité ; nouveau code `CASH_SESSION_ERROR`) · repo transactionnel idempotent `electron/ipc/handlers/cash-session.repo.ts` (`open`/`count`/`close`/`getActiveCashSession`/`listCashSessions`/`getCashAuditSummary`, attente **calculée en direct** puis **figée à la fermeture** par un `UPDATE … WHERE status='open'`, fenêtre en **instants** comparés directement à `created_at`) · 5 canaux explicites `cash.open|count|close|current|list` + Zod + preload + façade + schémas de réponse · gates : licence `reports` + permission staff `closings` (**aucune 18ᵉ page de licence, aucune nouvelle permission**) · UI française `src/features/reports/CashSessionsSection.tsx` posée dans Rapports à côté des clôtures Z (ouverture, comptage, fermeture confirmée, liste avec écart signé ; `cash.current` rend une session ouverte **hier** fermable **aujourd'hui** indépendamment de la période). Inventaires gelés mis à jour : canaux 185→**190**, schémas 125→**129**, exports de validation 134→**138**, `operationId` requis +3, migrations 58→**59**. Portes : `npm run check` **vert** · **vitest 177 fichiers / 1 242 tests 0** (dont 19 tests consacrés : `tests/unit/cash-session.test.ts` 9 parité domaine↔main, `tests/integration/cash-sessions.test.ts` 10 sur base migrée réelle) · `verify:migrations` **59** avec `OK 0059 sessions de caisse…` · `verify` **vert** · `knip` **0**. Deux pièges d'atelier consignés §96 (collision d'`operationId` par troncature, `parseDzdInputStrict` qui **lève** au lieu de rendre `null`). **Non fait** : UI n'a pas été vue dans l'application réelle (`test:e2e` non relancé), liasse/publieur toujours absent (session 97), `maxDevices` reste informatif (décision consignée). ADR-170. Détails §96.
- **Session 95 (2026-11-02)** : **jour métier Africa/Algiers (E-35/G-18 corrigé radicalement)** — demande : « اصلح التالي جذريا و اكمل هاته المزايا » sur six constats ; périmètre de cette session : le **découpage du temps**. Les horodatages SQLite restent des instants ISO UTC (stockage inchangé, aucune donnée migrée) ; tout ce qui découpe ou affiche — buckets de rapports, filtres de période, bornes de l'Historique, seuils d'endettement, bandes de règlement mensuel, mois des clés de miroir, numéros de facture (année), ticket de caisse, horloge du bandeau, exports CSV, `datetime-local` des annonces, dates de l'APK client et de l'APK propriétaire — suit désormais **UTC+1 fixe**. Deux modules jumeaux (frontière `rootDir`) portent la règle : `src/domain/common/business-day.ts` et `electron/shared/business-day.ts` (JS + fragments SQL `date(col,'+1 hour')`, `calendarDaySql` pour les colonnes date-seule, `businessDayRangeUtc` pour les bornes indexables) ; `todayUtcDate` et `monthStartUtc` sont **supprimés**, sans alias de compatibilité. **Migration 0058** : les six triggers d'instant du verrou de clôture (`sales`, `returns`) comparent `date(created_at,'+1 hour')` à `daily_closings.business_date` — une vente de 00:30 heure d'Alger sur une journée close est **refusée** (avant : elle passait et faussait le Z signé). Les neuf triggers date-seule sont inchangés ; 0048/0051 restent immuables. **Gardes automatiques** dans `tests/unit/business-day.test.ts` : parité des jumeaux, parité **JS ↔ SQL**, parité **POS ↔ APK client ↔ APK owner** (preuve G-18 : `2026-09-01T23:30Z` → `02/09/2026` et `00:30` des trois côtés), et interdiction dans `electron/`+`src/` de `substr(<instant>,1,10)`, `date('now'` nu, `toISOString().slice(0,10|7)`, `todayUtcDate`, `monthStartUtc`. `tests/integration/business-day-reports.test.ts` (6 tests, base migrée réelle) vérifie dashboard/rapports/clôture Z/historique sur la frontière 00:30. Portes : `npm run check` **vert** (format, lint 0, typecheck root/electron/manager/mobile/owner) · **vitest 175 fichiers / 1 223 tests 0** · `verify:migrations` **58** avec porte `OK 0058…` · `verify` complet **vert** · `knip` **0** · 4 tests d'ancienne convention mis à jour (`history`, `stock`, `reports`, `customer-payment-fifo` n'a pas eu à changer). **Non fait** : `npm run test:e2e`, `test:coverage`, `build`/`package:*` (les autres constats de la demande — liasse propriétaire, compte Supabase, 0057 chez le client, `maxDevices`, mises à jour — suivent en sessions 96+). ADR-169. Détails §95.
- **Session 94 (2026-11-02)** : **bootstrap de l'environnement de développement sur ce poste** — demande « قم بدراسة و فهم المشروع بعد ذلك ثبت البرامج و الأدوات اللازمة لتطوير المشروع ». Constat de départ : poste **sans aucun Node.js** (arbre copié depuis le compte Windows « zenagui bilal » → git refusait toute commande en « dubious ownership », `~/.gitconfig` inexistant, `mobile/android/local.properties` pointait sur l'ancien SDK). Installé et vérifié : Node **22.23.4** + npm **10.9.9** (`C:\\Users\\Admin\\tools\\node`, ZIP officiel contrôlé par SHA-256, au PATH utilisateur — conforme `.nvmrc`/`engines`/`packageManager`), JDK **Temurin 17.0.20** (`tools\\jdk17`, `JAVA_HOME`), **Android SDK** (`cmdline-tools` 13114758 → `platform-tools`, `platforms;android-35`, `build-tools;35.0.0`, `ndk;26.1.10909125`, 2,4 Go — exactly les versions exigées par `mobile/android/build.gradle`), redistribuable **VC++ 14.44** (sans lui le binding natif `oxc-resolver` de `knip` ne se charge pas), **graphify 0.9.100** via `uv tool install graphifyy` avec Python **3.12**. Portes **toutes vertes sur ce poste** (§94) : better-sqlite3 N-API · `electron --version` 45.1.0 sous Windows 10 1809 · typecheck ×5 · `verify` complet · `format:check` · lint `--max-warnings 0` · **vitest 173 fichiers / 1 194 tests** · builds renderer/electron/manager · `knip` 0 · **E2E réel `navigation-smoke` 1/1** (16 modules ouverts sans crash). **Aucun code modifié** ; seuls fichiers touchés : `handoff.md` et `mobile/android/local.properties` (git-ignoré). **Reste à faire** : redémarrer le terminal/Qoder pour le PATH ; relancer la suite E2E complète et `test:coverage` ; rebuild APK sur ce poste.
- **Session 93 (2026-11-01)** : **diagnostic bandeau hero (client)** — le composant `AnnouncementHero` est présent dans l'APK (nouveau 22 Mo et ancien 85 Mo) ; le CPH2235 est actuellement sur l'**écran de login** (le hero n'est rendu qu'après login, dans Home). Base POS `E:\data\Veloria POS DB.sqlite` en **schema 56** (migration 0057 non appliquée) : table `announcements` texte seulement (3 doublons actifs), dernier `customer_snapshot` envoyé le 2026-10-31 20:30 avec le champ legacy `announcement` et **pas** `announcements[]`. À suivre : login réel + pull-to-refresh ; POS à jour (0057) + ré-enregistrement pour images/échéances ; capture/QR si le hero reste absent. **Aucun code modifié.**
- **Session 92 (2026-11-01)** : **test appareil réel (CPH2235, Android 13)** — installation propre du client 1.0.4 (code 6) et de l'owner 0.1.0 (code 1) : `primaryCpuAbi=arm64-v8a`, aucun `RECORD_AUDIO`, démarrage d'activité ~0,33 s. Client : UI AR/FR, permission caméra + CameraX/ML Kit ouverts, erreur de login réelle « الهاتف أو الرمز غير صحيح ». Owner : login FR + erreur Supabase Auth réelle. **Aucune FATAL app**. **Non testé** : QR valide/login réussi, tableau de bord owner, stabilité longue. Captures : `release/screenshots/`. Aucun code modifié.
- **Session 91 (2026-11-01)** : **APK Native-max (ADR-168)** — demande : « اجعل تطبيقات apk native الى اقصى درجة ممكنة ». Choix : Native-max sur RN (pas de réécriture Kotlin). Client : **84,6 → 21,6 MiB (−74,4 %)** (R8, shrink, 2 ABIs ARM, libs compressées, `RECORD_AUDIO`/stockage/overlay retirés), signature vendor, hash `8ee498b5…` ; ancien APK 4 ABIs archivé. Owner : **premier APK 17,3 MiB** (2 ABIs, Dex 7,3 Mo, signature vendor, hash `e720ba19…`). Builds Gradle verts, `apksigner` vert. **Différé** : scanner QR ZXing natif (ML Kit reste) et New Architecture, faute d'appareil ADB. Portes `check`/`test`/`verify`/`knip` : §91.
- **Session 90 (2026-11-01)** : **purge ciblée post-audit (ADR-167)** — demande : « قم بفحص المشروع من الأكواد الميتة ». Audit lecture seule (392 fichiers de production, ≈1 890 exports, 186 canaux IPC, `knip` 0) : **0 fichier sans importateur, 0 export orphelin, 0 canal IPC mort, 0 dépendance inutilisée**. Corrections approuvées : copie applicative V2 morte supprimée (le test cible désormais la version main exécutée), wrappers `allocateUnitCosts` (domaine + main) retirés, `formatDelta` retiré, 3 clés i18n mortes ; icônes maîtresses 1024/512 déplacées vers `resources/icons-src/` (≈2,2 Mo d'installeur économisés). Les 3 ignores `knip` (`expo-updates` ×2, `net`) se sont révélés **vivants** (app.json / E2E) et sont conservés. Conservés : 35 exports test-only/parité, 3 modules `verify:domain`, `pain`/`breadOrders`, SQLite lot D, 11 classes CSS. Portes : §90 (toutes vertes).
- **Session 89 (2026-11-01)** : **purge des artefacts obsolètes** — demande : « قم بحذف كل الملفات القديمة و المحجورة التي لا حاجة لها في المشروع ». Audit d'abord (git propre, aucun fichier suivi touché) : suppression de l'ancien worktree temporaire `veloria-csv-run` (25 Mo, commit c30b5c6, propre), de `E:\veloria-build-final` (817 Mo, sorties electron-builder déjà copiées), des restes `E:\veloria-periodic-build`/`-stage`/backup, de `mobile/android/app/build` + `build` (420 Mo, APK déjà dans `release/`), des 5 sauvegardes `graphify-out/2026-*` (60 Mo, graphe actif conservé) et des dossiers vides `release/win-unpacked*`. **E: libre : 62 Mo → 8,0 Go.** Conservés : installateurs POS/Manager 1.0.4, APK 1.0.4 code 6, `dist`/`dist-electron` courants, `node_modules`, `.gradle` (cache), `private/` (clés/licences), archives docs, graphe actif. Aucun test/build relancé : aucune source modifiée.
- **Session 88 (2026-10-31)** : **annonces multi-médias + bandeau hero APK (ADR-166)** — demande : bandeau hero en haut de l'accueil de l'application client, annonces **optionnelles** en texte **ou** image hébergée sur un site gratuit, **4 maximum**, avec un **compte à rebours d'expiration**. Migration **0057** (rebuild de 0032, lignes legacy conservées) : `image_url` https ≤ 500 (jamais de blob/base64), `ends_at`, `sort`, `updated_at`, `CHECK` texte OU image. Domaine : texte ≤ 120 ou image https, échéance future obligatoire, **4 actives non expirées** (comptées dans la transaction). Repo : `saveAnnouncementAtomic` devient un **upsert idempotent** (`id` optionnel), `removeAnnouncementAtomic` idempotent par valeur, `listAnnouncements` ; canaux `announcements.list`/`remove`, `announcements.get` supprimé ; gardes staff `settings` / licence `customers` ; rétention critique élargie au préfixe `announcements.`. Cliché : `announcements[]` (actives non expirées, tri `sort`, ≤ 4) **+** champ legacy `announcement` (premier texte) pour les APK ≤ 1.0.4 déjà installées. POS (Paramètres → Annonces du magasin) : liste, formulaire texte/image (aperçu, https, fin, ordre, actif), suppression confirmée, badge « x/4 actives ». APK : composant `announcement-hero.tsx` (image 2:1 + texte, compte à rebours rafraîchi chaque minute, pastilles si plusieurs, **repli texte** si l'image ne charge pas, annonce expirée masquée, repli sur l'ancien champ texte), i18n ar/fr et RTL. Portes : **173 fichiers / 1 194 tests 0** · lint 0 · typecheck / electron / mobile 0 · `verify` ✓ · `build` ✓ · `build:electron` ✓ (manifeste **244**) · vérification visuelle **Expo web** (image 800×400 chargée, « ينتهي بعد 3 يوم 3 ساعة », l'annonce expirée n'apparaît pas, bascule 1/2 → 2/2), serveurs de démo arrêtés. **Non exécuté** : reconstruction/installation de l'APK (le hero ne sera visible qu'après un nouveau build + install). Session concurrente : ADR-165 (rafraîchissement périodique) commitée avant, d'où la renumérotation en **ADR-166**. Commit `1dc3e46`.
- **Session 87 (2026-10-31)** : **annonce magasin poussée aux clients** — demande : l'annonce saisie dans POS n'arrive pas dans l'APK, et la synchro doit être automatique selon la cadence choisie. Diagnostic sur la base réelle : `announcements.save` écrivait seulement la table `announcements` (12:15 et 12:17), aucun `sync_outbox` correspondant ; le timer poussait bien (lastPushAt 12:22) mais **rien à envoyer**, et le `customer_snapshot` du miroir gardait l'ancienne annonce (`null`). Correctif : `enqueueAnnouncementRefresh()` (un `customer_snapshot` par accès mobile **actif**, révoqués exclus, best-effort) appelé après `announcements.save` ; message UI « partira à la prochaine synchronisation ». La cadence auto est inchangée (`startSyncTimer` tick 60 s + `isPushDue(intervalMinutes)`, réglage POS 5 min). Test de régression ajouté (4/4). Portes : **173 fichiers / 1 187 tests 0** ; format/lint/typechecks ✓ ; verify ✓ ; **POS 1.0.4 reconstruit** (Setup `e6f96ec6…`, Portable `50a733cc…`), `release:checksums` + `release:smoke` ✓. **À faire côté poste** : installer le nouveau POS 1.0.4, réenregistrer l'annonce existante une fois, attendre ≤5 min, rouvrir l'APK.
- **Session 86 (2026-10-31)** : **compte propriétaire créé depuis le POS (ADR-164)** — demande : « اعداد الحساب يكون من برنامج pos مع امكانية تغييره ». Nouveau canal `sync.saveOwnerAccount` (Zod `ownerAccountSaveSchema`, `operationId`) : le main utilise l'URL + la clé service **déjà stockée chiffrée** pour appeler l'Admin API Supabase (`POST`/`PUT /auth/v1/admin/users`, `email_confirm`), retrouve un compte existant par e-mail en cas de 409/422, recrée si l'id stocké a disparu. Seuls `email` + `userId` + date sont conservés (`app_settings.owner_account`) ; **mot de passe jamais stocké**. UI Paramètres → Miroir Android : compte actuel, e-mail, mot de passe, bouton Créer/Mettre à jour. Gardes : licence `customers`, staff `settings`, idempotence. Contrats gelés mis à jour (canal 164, schéma 125, exports 134) + tests protocole. Portes : eslint 0 · typecheck 0 · typecheck:electron 0 · tests contrats 39/39. **Non exécuté** : SQL Supabase, test réel de création de compte (nécessite la clé service sur le poste + URL appliquée). Détails §86.
- **Session 85 (2026-10-31)** : **connexion de l'app propriétaire à Supabase (ADR-163)** — demande : « اربط التطبيق بقاعدة البيانات supabase ». Décision : **pas d'Edge Function** — table `owner_snapshots` (JSONB + `generated_at`, index `shop_key, generated_at DESC`) dans `cloud/supabase/owner.sql`, RLS `anon` révoqué / `authenticated` lecture / `service_role` écriture ; `fetchOwnerSnapshot` passe en **GET PostgREST** de la dernière liasse (message FR si vide) ; `owner/eas.json` grave l'URL + clé **anon** du projet `veloria-pos` (valeurs publiques, jamais `service_role`). **Non exécuté (cloud)** : SQL non appliqué, compte Auth propriétaire non créé, publieur POS non branché — l'app affichera « Aucune liasse de supervision publiée » jusqu'à ces trois étapes. Portes : eslint owner 0 · `typecheck:owner` 0 · **owner-foundation 17/17** · knip owner 0. Détails §85.
- **Session 84 (2026-10-31)** : **suppression totale des données fictives (app propriétaire)** — demande : « احذف كل البيانات الوهمية من التطبيق ». `owner/src/demo.ts` **supprimé** ; mode démonstration retiré (`DEMO_MODE`, `DEMO_SNAPSHOT`, puce « DÉMONSTRATION », avis de connexion, branche `Session.demo`, repli démo au boot/refresh). Sans endpoint configuré, l'app affiche un **écran de configuration** et n'ouvre aucun accès. Chiffres codés en dur retirés ou calculés : `+2,1 %`, `+12,4 %`, `100 % audité`, « v4.2 · RO », initiales « YB » (dérivées de l'opérateur), conformité en badge (issue de la liasse). États vides ajoutés (journal, encaissements, sessions, dépenses, dettes, mouvements, périodes, alertes). Tests réécrits avec une **fixture locale** (aucune donnée fictive dans l'app). Portes : eslint owner 0 · `typecheck:owner` 0 · **owner-foundation 17/17** · knip owner 0. Détails §84.
- **Session 83 (2026-10-31)** : **Argent, Stock, Périodes et Alertes enrichis** — demande : « قم بتطوير الصفحات المتبقية — Argent، Stock، Périodes، Alertes بجميع تبويباتها ». Argent : synthèse caisse (sessions, conformité, écart net), dépenses (moyenne/pièce, poste principal), dettes (part en retard critique via barre). Stock : onglets **Aperçu / Produits / Mouvements** ; flux global `recentMovements` (tri décroissant, ouverture fiche produit) ; ancienne liste déplacée dans Produits. Périodes : moyenne/jour + meilleur jour, marge en valeur par catégorie (CA en sous-ligne), part du CA de chaque top vente. Alertes : synthèse ruptures/sous-seuil + perte estimée, dossiers > 60 jours, dernier inventaire dans Système. Liasse : mouvements ajoutés à 5 produits (16 lignes au flux). Portes : eslint owner 0 · `typecheck:owner` 0 · **owner-foundation 17/17** · knip owner 0 ; vérification structurelle Expo web (snapshots) des quatre écrans, capture d'écran indisponible (surface navigateur masquée). Détails §83.
- **Session 82 (2026-10-31)** : **Aujourd'hui enrichi + détails de transaction** — demande : « قم بتطوير صفحة Aujourd'hui، طوّر تبويب Synthèse و Opérations، وأضف تفاصيل المعاملة (فاتورة، مرتجع، تسديد) ». Contrat `TransactionDetail` ajouté au journal (vente : pièces, sous-total/remise/total, encaissement reçu/monnaie/crédit, caissier, session ; retour : facture d'origine, motif, lignes, remboursement et imputation dette ; versement : type, moyen, référence, opérateur ; dépense : catégorie, bénéficiaire, règlement, référence). Synthèse : barre de progression d'objectif + rappel des retours du jour. Opérations : filtres Toutes/Vente/Retour/Versement/Dépense avec compteurs, lignes tactiles → **fiche détail** en lecture seule ; état des onglets hissé dans `App` pour revenir sur Opérations après consultation. 8 détails de démo cohérents + test d'égalité (lignes = sous-total, encaissement = total, sorties = montant). Portes : eslint owner 0 · `typecheck:owner` 0 · **owner-foundation 16/16** · knip owner 0 ; captures Expo web (Synthèse, Opérations, vente, retour, versement). Détails §82.
- **Session 81 (2026-10-31)** : **passe design v2 (app propriétaire)** — demande : « قم بتبسيط و تطوير واجهات تطبيق المالك ». Montants en police système + chiffres tabulaires (monospace retiré du kit et des jetons), actualisation unique dans l'en-tête (bouton or) au lieu du bandeau Aujourd'hui, titres d'écran dupliqués supprimés (Argent/Stock/Périodes/Alertes), Stock converti en **lignes groupées compactes** (une surface, filets, pastille d'état + quantité + valeur), fiche produit : carte « ÉCONOMIE » unique (marchandise/PAMP/PVC/PAMP unitaire) et disponibilité dépliée dans sa carte tonale. Portes : eslint owner 0 · `typecheck:owner` 0 · **owner-foundation 15/15** · knip owner 0 ; captures Expo web (Aujourd'hui, Stock, fiche produit). Détails §81.
- **Session 80 (2026-10-31)** : **écrans courts par onglets internes** — demande propriétaire : « قم بتبسيط الواجهات و اختسار الواجهات الطويلة بتبويبات ». Chaque écran long de `owner/` est découpé avec le sélecteur existant : Aujourd'hui (Synthèse / Opérations), Argent (Caisse / Dépenses / Dettes — filtre réel au lieu d'ancres de défilement), Périodes (Ventes / Marges / Top, plage 7/30 j en puces), Alertes (Stock / Créances / Système), fiche produit (Synthèse / Mouvements), fiche client (Encours / Factures), audit des caisses (Synthèse / Sessions). Simplifications : en-têtes dupliqués supprimés (fraîcheur portée par le seul bandeau), Stock ramené à une carte valeur + compteurs, libellés des contrôles secondaires raccourcis. Liasse de démo corrigée (sessions S-138→S-141 alignées sur 167 000/158 350/174 520/245 800 DZD). Portes : eslint owner 0 · `typecheck:owner` 0 · **owner-foundation 15/15** ; parcours réel Expo web : Synthèse/Opérations, Caisse/Dépenses/Dettes, Marges/Top, Système, Synthèse/Sessions. Détails §80.
- **Session 79 (2026-10-31)** : **application propriétaire (ADR-162)** — demande : étudier les maquettes Stitch puis créer l'app mobile du propriétaire. Livré : nouveau projet Expo `owner/` (français uniquement, `dz.veloria.owner`), 5 onglets (Aujourd'hui, Argent, Stock, Périodes, Alertes) + connexion + 3 sous-écrans (fiche client avec téléphone/Appeler/WhatsApp, fiche produit avec mouvements, audit des caisses), liasse de démonstration identique aux maquettes, cache SecureStore/SQLite, contrat `owner-sync` (Supabase Auth + `fetch` injecté) prêt pour l'Edge Function à venir, mode démo sans endpoint. **Lecture seule stricte** : actualiser/déconnexion/appel uniquement, aucun bouton d'écriture. Portes : `typecheck:owner` 0 · eslint owner 0 · **owner-foundation 15/15** · `typecheck` racine 0 · bundle web Expo capturé (9 écrans). **Non fait** : Edge Function `owner-sync`, use case POS de publication + réglage de cadence, compte propriétaire, biométrie, APK. Détails §79.
- **Session 78 (2026-10-31)** : **déploiement Supabase exécuté (ADR-160)** — demande : « نفّذ التغييرات على Supabase الآن ». Depuis la session navigateur Qoder (org Veloria) : `client-sync` **redéployé** depuis le fichier du dépôt (filtre direct `payload->sale->>id`, plus de `DETAIL_SCAN_LIMIT`, « Verify JWT with legacy secret » **OFF** confirmé) ; index `idx_client_payloads_customer_sale` **créé et vérifié** dans `pg_indexes`. Preuve de bout en bout via sonde temporaire (client 999999, facture 424242) : `saleId=424242` → **200** avec détail, vente inconnue → **404 NOT_FOUND**, mauvais PIN → **401 AUTH_ERROR** ; sonde supprimée (`access_left=0`, `payload_left=0`). Aucun changement de schéma/RLS/clé. Reste côté poste : installer POS 1.0.4 puis « Synchroniser » pour backfiller les factures existantes.
- **Session 77 (2026-10-31)** : **version unique 1.0.4 + contrat de mise à jour (ADR-161)** — demande propriétaire : « غير اصدار pos و license الى 1.0.4 و يجب ان تدعم ... الترقية من اصدار الى اصدار جديد ». Constat : POS/Manager étaient en **1.0.0** (`package.json` racine, embarqué par electron-builder) alors que le client était en **1.0.4** (`app.json`/`build.gradle`), avec un libellé `appVersion` codé en dur, aucune version visible dans le Manager et des migrations de registre sans copie de sécurité. Décisions : `package.json` racine = **source unique 1.0.4** (POS + Manager) ; outil **`npm run version:check|version:set`** (`scripts/release/version.mjs`) qui aligne package/locks/app.json/Gradle/`App.tsx` et **incrémente `versionCode` Android** sans régression ; `verify` inclut `version:check` ; Manager : canal `manager.appInfo` + version dans l'en-tête, **snapshot `VACUUM INTO` avant migration** de colonnes (5 conservés, fail-closed), seules les colonnes absentes rejouées ; POS : contrat NSIS inchangé (appId stable, perMachine, données hors install, snapshots pré-migration) ; client : même `applicationId`/keystore, `versionCode` croissant, données SecureStore/SQLite conservées. **Pas d'auto-update en ligne** (aucun serveur, installateurs non signés). Preuves : **172 fichiers / 1 166 tests 0** ; lint/format/typechecks ✓ ; verify (dont version:check) ✓ ; `build` ✓ ; `build:electron` ✓ (manifeste signé 243, **v1.0.4**) ; `build:manager` ✓ ; **installateurs 1.0.4** produits et copiés dans `release/` ; `release:smoke` réparé (chemin `config/electron-builder/pos.yml`) et vert. **Non exécuté** : installation réelle 1.0.0 → 1.0.4 (UAC/perMachine) et rebuild APK (client déjà 1.0.4 code 5).
- **Session 76 (2026-10-30)** : **détails de facture APK rétablis (ADR-160)** — demande propriétaire : « تفاصيل الفواتير لا تظهر في تطبيق العملاء ما السبب ». Diagnostic (base réelle + code) : `sales.create` ne poussait que les trois clichés de listes (jamais `invoice_detail`), un encaissement standalone ventilé FIFO ne poussait pas le détail des factures soldées, et l'Edge ne cherchait le détail que dans les **50 derniers** clichés → 404 « التفاصيل غير متوفرة ». Correctifs : `enqueueSaleRefresh` après création de vente ; `recordCustomerPaymentAtomic` retourne `allocatedSaleIds` et le détail repart pour chaque facture ventilée (`enqueueInvoiceDetailRefresh`, sans dupliquer les listes) ; lecture miroir directe `payload->sale->>id` (plus de fenêtre 50, index d'expression) ; bouton « Synchroniser » couvre tout le relevé (≤100 ventes) au lieu des 10 dernières. Tests : 3 nouveaux (`client-sync-queue`) + 2 assertions FIFO ; **suite complète 171 fichiers / 1 158 tests 0** ; `build` ✓ · `build:electron` ✓ (manifeste signé **243**). **Déployé le 2026-10-31 (session 78)** : fonction Edge + index, vérifiés 200/404/401 et sonde nettoyée.
- **Session 75 (2026-10-30)** : **encaissement standalone ventilé FIFO (ADR-159)** — demande propriétaire : le client a UNE dette, le POS la tenait par facture et un paiement « standalone » (fiche client / caisse) ne décrémentait que le solde agrégé, sans jamais toucher les ventes ⇒ liste des dettes, « En retard » et carte du jour restaient faux, et Σ restes par facture ≠ solde client. Désormais `recordCustomerPaymentAtomic` ventile le montant **dans la même transaction** sur les factures ouvertes, **la plus ancienne d'abord** (`created_at, id`), une ligne `sale_payments` par facture (`operationId:saleId`), reliquat éventuel en ligne standalone à l'`operationId` exact, solde client décrémenté une seule fois, audit enrichi (`allocations`). **Aucun backfill** de l'historique, aucune migration, aucun canal. Aide UI FR ajoutée dans la fiche client et la caisse. Test d'intégration neuf (base migrée réelle) : 5 cas ; suites adjacentes 44/44 ; **suite complète 170 fichiers / 1 155 tests 0** ; `build` ✓ · `build:electron` ✓ (manifeste signé **243**).
- **Session 74 (2026-10-30)** : **passe UX 2026 sur les six écrans** — connexion (préfixe +213 trompeur retiré, autofill, conseil de récupération sur erreur, séparateur « ou » + QR, « Connexion chiffrée »), accueil (échéance), détail (historique des paiements de la facture), compte (tirer pour rafraîchir + confirmation de déconnexion), contraste AA (onglets/légendes/chevrons). 31/31 tests ; APK 1.0.4 (code 5) `b420ee84…` ; installation téléphone en attente (ADB déconnecté).
- **Session 73 (2026-10-30)** : **écrans secondaires V5** — Factures (panneau unique à filets, ligne tactile, dette restante, « Aucun résultat »), Détail (fiche + héros Reste + mini Total/Payé, carte Articles, QR), Paiements (panneau, total du mois + répartition espèces/chèque/virement, ligne tactile, reçu), Compte (profil plein bandeau, dernière synchro horodatée). `paymentsByMethod` pur + tests. APK 1.0.3 (code 4) signé (`923cee03…`) ; installation téléphone en attente (ADB déconnecté).
- **Session 72 (2026-10-30)** : **accueil client V5** — carte « dernière facture » chevauchant le bandeau, crédit intégré au bandeau (barre segmentée), fraîcheur horodatée, « Ce mois-ci » en deux colonnes tactiles, factures (total) / paiements / articles, accueil dédié au client sans activité. Données : `invoiceCount` + `monthKey` dans `toHome`, `formatDateTimeFr`, 7 clés i18n. APK 1.0.2 (code 3) construit et signé (`release/Veloria-Client-1.0.2.apk`, SHA-256 `8c2e365d…`) ; installation téléphone en attente (ADB déconnecté).
- **Session 71 (2026-10-30)** : **icônes de l'APK client** — toutes les Ionicons étaient vides sur téléphone (police chargée à l'exécution par `expo-asset`, échec silencieux constaté sur le vrai appareil alors que le web rendait correctement). Correctif : police embarquée dans les assets natifs + composant `src/ui/Icon.tsx` qui dessine le glyphe via `fontFamily: "Ionicons"` (web : composant d'origine conservé), 34 usages remplacés, APK 1.0.1 (code 2) reconstruit, signé et **vérifié sur Android réel** (icônes rendues, 30/10 15:21).
- **Session 70 (2026-10-30)** : **connexion APK rétablie** — la fonction `client-sync` déployée était restée sur la version SHA-256 nue (02/10) alors que le POS écrit désormais des PIN PBKDF2 + sel : tout code correct répondait 401 et le compteur d'échecs montait (3). Redéploiement du fichier courant via la console Supabase, vérifié par sonde temporaire PBKDF2 → 200 puis 200 en legacy, lignes de test supprimées. Ajout : poussée miroir immédiate après activation d'un accès (`registry.customers.ts`) pour que le client puisse se connecter aussitôt.
- **Session 69 (2026-10-30)** : **mise à jour des installateurs Windows** — POS (Setup 156 Mo, Portable 136 Mo) et License Manager (Setup 139 Mo, Portable 126 Mo), x64, v1.0.0, NSIS fr perMachine, **non signés** (aucun certificat Authenticode configuré). Blocage `EBUSY default_app.asar` sur `release/` contourné par une sortie neuve `E:\veloria-build` (sans rien supprimer) ; artefacts copiés dans `release/` + `SHA256SUMS.txt` actualisé.
- **Session 68 (2026-10-30)** : **APK client signé (build local Gradle)** — `mobile/eas.json` pointe désormais le projet `veloria-pos` (URL + clé anon publique, profils preview/production). Build release local (`./gradlew assembleRelease`, Java 17 + SDK/NDK) : `dz.veloria.client` 1.0.0 (code 1, minSdk 24, target 34), signé CN=Veloria, 88 462 721 octets, copié `release/Veloria-Client-1.0.0.apk` (SHA-256 `6bdf6017…`). URL Supabase + anon gravées dans le bundle (repli sans QR ; le QR V2 reste prioritaire). Aucun appareil/émulateur disponible : non testé au runtime. `license:scan` OK.
- **Session 67 (2026-10-29)** : **miroir Supabase opérationnel (ADR-158)** — projet existant `veloria-pos` (ref `ynktschorbwukxovjzcz`, Londres) vérifié : tables + RLS + fonction `client-sync` (Verify JWT désactivé). POS raccordé (URL + clés legacy chiffrées DPAPI dans `app_settings.client_sync`), première poussée **réussie** (`lastPushAt 21:54:55Z`, 0 erreur). **Bug réel corrigé** : les ventes/paiements de clients non activés mettaient des clichés en file → FK `client_payloads.customer_id` → **409 bloquant toute la poussée** ; garde `hasActiveClientAccess` + test (7/7), file orpheline purgée après sauvegarde. Schéma cloud aligné (`pin_salt`, `pin_algo`). Test cloud complet insertion→`client-sync` 200→cleanup. Portes : format, lint, check ×4, **1 147 tests**.
- **Session 66 (2026-10-29)** : **développement des interfaces — 19 surfaces (ADR-157)** — demande « قم بتطوير تصميم واجهات الصفحات التالية … بالترتيب ». Direction validée par le propriétaire : **approfondir Stitch** (pas de nouvelle identité). Socle partagé d'abord (cartes, `PageHeader`, `StatsStrip`, `Kpi`, `FormSection` avec action, survol global des registres, entrée de module), puis les 19 pages dans l'ordre : navigation, tableau de bord, caisse, catalogue, fiche produit, clients, fiche client, stock, réception, fournisseurs, fiche fournisseur, historique, rapports, zakat, dettes, retours, nouveau retour, paramètres, licence. **19 checkpoints** (un par surface), libellés de données corrigés (« Fournisseurs actifs », sous-ligne « Client #id » retirée des retours). Portes vertes : format, lint, check ×4, **1 146 tests**, verify, E2E ciblés et captures Electron.
- **Session 65 (2026-10-29)** : **organisation du tronc racine — ADR-156** — audit + recherche des conventions 2026 ; la racine garde les entrées attendues par les outils (`package.json`, `tsconfig*`, `vite*`, `vitest*`, `eslint.config.mjs`) et les configs non standard passent dans `config/` : `electron-builder/{pos,manager}.yml`, `playwright.config.ts`, `knip.json`. `tsconfig.base.json` factorise les options strictes, les `tsbuildinfo` vont sous `node_modules/.cache/tsbuildinfo/` (plus à la racine), et `mobile/tsconfig.json` reçoit `ignoreDeprecations: "6.0"` (base Expo en node10). Gouvernance : scripts **`check`/`verify`/`ci`/`knip`**, `.npmrc` `engine-strict` + `save-exact`, `.github/renovate.json`, CI `concurrency`/`timeout`/`permissions` qui appelle les scripts uniques. Aucun changement runtime ni migration. Portes : `npm run ci` (check + tests + 2 couvertures + verify + builds + knip), Playwright **54 tests listés**, E2E `component-smoke` ; **packaging non re-vérifié** (verrou scanner `default_app.asar`, EBUSY) — à rejouer après redémarrage. Détails §65.
- **Session 64 (2026-10-29)** : **montée de gamme de l'outillage — ADR-155** — demande « ابحث في الانترنت بعمق … تنظيم جذع المشروع باحدث التقنيات … تطوير مكتبات المشروع بأحدث التقنيات و حسب توافقها ». Grille **dernière version compatible** vérifiée sur npm et les guides officiels : Electron 37→**45.1.0** (Chromium 156/Node 24.22), better-sqlite3 12→**13.0.3 N-API** (prebuilds, SQLite 3.53.4), Vite 6→**8.3.5/Rolldown**, Vitest 3→**5.0.5**, ESLint 9→**10.13**, TypeScript 5.7→**6.0.3** (7 **refusé** : typescript-eslint `<6.1`), Zod 3→**4.6.7**, lucide 0.469→**1.63**, Tailwind 4.3, tailwind-merge 3, React 19.3. **Quatre checkpoints** : `a8c4e92` (mises à jour sûres, React 19.3, types Node 22.20, Prettier 3.9, Node 22.12/.nvmrc/packageManager), `97c6b02` (Vite 8 `codeSplitting.groups`, esbuild 0.28 explicite, `import.meta.dirname`, Vitest 5, ESLint 10, Tailwind 4.3, tailwind-merge 3), `45fc03a` (Electron 45 + better-sqlite3 13 N-API, **suppression** `@electron/rebuild`/`bindings`/postinstall/`rebuild`, `npmRebuild:false`, CI charge N-API), `9bd9925` (TS 6, Zod 4, lucide 1). **Bug attrapé** : Zod 4 `z.uuid()` est un `ZodUUID` distinct de `ZodString` ⇒ `schemaRequiresOperationId` renvoyait false et aurait **désactivé l'exigence d'operationId en production** (`handle.ts:88`) ; garde corrigé (`ZodString | ZodUUID`), tests 8/8. `baseUrl` supprimé (paths `./`), `node10` + `ignoreDeprecations` pour l'émission CJS ; safeStorage sync (6 appels) déprécié en 45/retiré en 46 → dérogation eslint + **dette tracée**. Porte features **recalibrée** (Vitest 5/V8, hooks `use*.ts` exclus, décision propriétaire) : planchers **50/65/70/50** (53,77/66,11/74,62/52,92 mesurés), +5 tests `proforma-rules`. **Incident poste** : `node_modules/electron/dist/resources/default_app.asar` verrouillé (scanner, EBUSY) ⇒ Electron 45 remplacé **dans la même arborescence** depuis le paquet officiel, lock régénéré par `--package-lock-only` ; **ne jamais forcer `rm`** (STRUCTURE §7), un `npm ci` propre utilise le lock. Portes : format 0 · typecheck ×3 0 · lint 0 · **vitest 169 fichiers / 1 146 tests 0** · **test:coverage 0** · **test:coverage:features 0** (160/1 085) · build POS/electron/manager 0 · verify:migrations/domain/fr/encoding/perf/secret-scan 0 · **E2E Electron 45 11/11** (activation/DPAPI, PDF, impression, vente SQLite) + `component-smoke` sur `release/win-unpacked/Veloria PoS.exe` · **suite E2E complète (50 tests) non relancée** · installateurs non reconstruits. Détails §64.
- **Session 63 (2026-10-28)** : **Tableau de bord simplifié — 13 surfaces → 8 (ADR-154)** — demande « قم بتبسيط و تطوير تصميم واجهة لوحة التحكم ». Le diagnostic a commencé par **rejouer la capture réelle** : la page était la seule à avoir échappé à ADR-148 (bande « Aujourd'hui » + 4 cartes `Kpi` + bande `MiniMetric` + carte Vigilance = 13 surfaces, ≈250 px avant le premier graphique, et le même montant écrit deux fois à 70 px d'écart). `MiniMetric` était un `StatsStrip` réécrit à la main dont la surface `#0f1e30` **n'existait pas** en thème clair. Rendu : deux `StatsStrip` (4 + 5 cellules, tons conditionnels), **coût de revient** enfin affiché (seul dérivé qui manquait), « Ventes du jour » remonté dans le sous-titre de page avec son compteur, onglet **Finances supprimé** (redondant), sections de détail **sans carte imbriquée** et non rendues si vides, barres de part, période dite **une fois**, `EmptyState` unique si la période est vide, `max-h-80` interne supprimé. Bandeau **« À traiter »** conditionnel : échéances/ruptures/seuil/sauvegarde/intégrité, **puce-bouton seulement si `canNavigate` l'autorise** — nouvelle prop câblée sur `moduleAllowed` (sinon un caissier sans droit aurait atterri sur `RouteBlocked`, dont le texte blame **la licence** : mensonge évité, ADR-038). Zéro migration, canal, schéma, dépendance. E2E **renforcée** (seuil 10 pour stock 5 ⇒ alerte déterministe, clic de puce ⇒ module Stock). Trois pannes de harnais documentées hors UI : manifeste signé couvrant `dist/**` (`build` sans `build:electron` = E2E impossible) et empreinte matérielle **amputée** par contention CPU des fils `reg`/`wmic`/`powershell` — **jamais de build ni vitest pendant un E2E**. Portes : typecheck 0 · electron 0 · eslint 0 · prettier 0 · fr 0 · encoding 0 · **vitest 168 fichiers / 1 141 tests 0** · build ✓ · build:electron ✓ · **E2E `dashboard-ui` 1/1** (3,0 min, machine au repos). **Session 62 menée en parallèle dans le même arbre.** Détails §63.
- **Session 62 (2026-10-28)** : **purge dead-code radicale exécutée en trois lots (ADR-153)** — demande « فحص المشروع من كل الاكواد الميتة و اصلاح جذريا », audit d'abord puis arbitrage propriétaire en un mot (« اوافق »). `knip` était **vert** sur son périmètre (0 fichier / 0 export / 0 type / 0 dépendance) : le gisement était donc hors de son champ. Trois mesures ajoutées : **fermeture transitive** depuis les vraies entrées de production (603 fichiers TS), **cartographie IPC à trois niveaux** (déclaration → `handle()` → preload → wrapper **ou** `callChecked((a) => …)` direct), et **index de tokens** sur 1 881 exports séparant appelants production et tests. Résultat : **lot A** = 2 canaux servis-validés-exposés-mais-jamais-appelés (`printer.get`, `templates.get` — le « lot 2 bis » différé depuis 2026-10-18) + 7 wrappers morts de la façade + 3 branches inatteignables des formatteurs DZD (+ le « `-—` » d'un négatif hors bornes corrigé au passage) + 1 script sans doc + `/release-manager-tmp/` ignoré ; **lot B** = 8 modules `src/domain` **n'entrant dans aucune chaîne de production** (595 lignes) + 4 fichiers de tests qui ne testaient qu'eux (343 lignes) — leurs règles sont bel et bien exécutées, par les miroirs `electron/ipc/handlers/**` ; **lot C** = 23 symboles test-only supprimés **avec preuve pour chacun** du chemin exécuté équivalent, et **refus exprès** de 5 autres (`isQrExpired` 7 j, `isSessionExpired` 90 j, `nextFailedState` 5 échecs→5 min, `convertQuantity` + table `TO_BASE`) qui sont la **seule** formulation de politiques jamais appliquées — à brancher, pas à delete. **Lot D refusé par l'opérateur** : aucun `DROP` (pas de migration 0057). Constataire : `tests/integration/client-loop.test.ts` fabriquait le cliché client avec la copie **morte** — il appelle désormais `buildSnapshotPayload` du main (mêmes valeurs affichées) ; les planchers de couverture étaient **portés par du code mort** (`test:coverage:features` passait de 65,06 % à 62,33 % en supprimant `sortCustomers` et ses fermetures de comparaison) — **aucun seuil abaissé**, à la place 4 actions réelles du panier couvertes (`removeLine`, `clear`, `setSaleOperationId`, `hydrate`) et 2 gardes **prouvées inatteignables** de la formule Z retirées (`assertSafeTotal` borne déjà chaque champ à 1e9). Rouge **pré-existante** trouvée et fermée : `previewReturnSettlement` n'avait **jamais** été couverte depuis `50a56cc` (session 54). Portes : typecheck 0 · typecheck:electron 0 · typecheck:manager 0 · `typecheck:mobile` 0 · eslint 0 · prettier 0 · **vitest 168 fichiers / 1 141 tests 0** · **test:coverage 0** · **test:coverage:features 0** (159 fichiers / 1 080 tests) · knip 0 · verify:migrations (56) · verify:domain · verify:fr · verify:encoding · **build** ✓ · **build:electron** ✓ (manifeste signé 234). Cumulé vs `45e2c69` : **80 fichiers de code, 2 701 lignes supprimées / 1 274 ajoutées**. Détails §62.
- **Session 61 (2026-10-28)** : **login client V6 « Connexion développée »** — le propriétaire a demandé « غير تصميم واجهة login كليا », puis a cherché une référence **« lempe login » : introuvable** (web + Dribbble + Behance + Figma + recherche d'images — « Lempe » est un nom de famille germanique, aucun écran de connexion ne le porte). Trois maquettes HTML présentées (A feuille ancrée / B plein clair / C bandeau or) ; arbitrage final **« طور التصميم الحالي »** ⇒ on garde l'identité encre + or et on travaille la composition. Ajouts : **en-tête éditorial** sur encre (salut selon l'heure, **même règle D12 que l'accueil** + titre 26/900 + règle dorée 44×4), champ téléphone **`skin="outlined"`** (nouvelle prop optionnelle de `Field`, défaut `sunken` ⇒ **aucun autre écran ne bouge**) pendant que les cases PIN restent en creux, **zone QR en pointillés qui porte le mode d'emploi** (caption = clé `help1` déjà publiée, titre baissé de 16 à 14 gras), **touche retour arrière** césurée du bouton « إظهار » par un filet 1 px (sinon les deux glyphes se lisaient comme un seul contrôle), **trois cercles de filet** dans l'encre (`View` pures, `pointerEvents="none"`, hors arbre — rien d'animé, rien de dégradé). Logique V5 **intégralement conservée** (verrou = règle du serveur, envoi au 6ᵉ, `busyRef`, haptique, téléphone mémorisé) ; **1 seule** clé i18n ajoutée (`deleteDigit`, ar+fr), zéro texte/`aria-label` existant touché, zéro dépendance, zéro migration, zéro canal. Budget **tenu** : contenu **731 px pour 553 de viewport** (V5 : 713) soit **+18 dp alors que l'en-tête a été ajouté**, CTA à y≈408‑462 et zone QR à 488‑510 tous deux visibles sans scroller. Portes : mobile typecheck **0** · mobile lint **0** · vitest mobile-foundation **18/18** · prettier **0**. Preuve visuelle : captures **390×844 via Electron offscreen** (`capturePage`) — le panneau navigateur de Qoder était masqué pendant la session — états 0/5/6 chiffres + envoi automatique observé (CTA passé en « … »). **Non vérifié** : rendu natif Android, `autoFocus`, et le `borderStyle:"dashed"` sur device (Yoga/Android le rend via `BorderDrawable`, fidèle sur web, à confirmer à l'œil). **ADR-152**. Détails §61.
- **Session 60 (2026-10-28)** : **login client V5 « Connexion directe »** — demande « قم بتطوير واجهة صفحة login الخاصة بتطبيق العملاء » **avec recherche internet préalable** (patterns 2026 : reconnaître le client qui revient, valider la forme avant le réseau, envoyer quand le code est complet, confirmer la frappe par le toucher, ne jamais laisser l'action sous la ligne de flottaison). Périmètre arbitré par le propriétaire : **« واجهة فقط بدون أي مكتبة جديدة »** — biométrie écartée (`expo-local-authentication` = dép native + ADR + rebuild APK + verrou posé sur le PIN stocké). Écran 01 réécrit : marque en **lockup horizontal** (−100 dp), aide 3 étapes **repliée** (−160 dp), réassurance descendue en pied, WhatsApp passé de 3ᵉ bouton à **lien** ; **CTA verrouillé** tant que le PIN n'a pas 6 chiffres (règle **identique** à `assertCredentials`/`client-sync`, volontairement **jamais plus stricte** — pas de règle « 10 chiffres algériens » inventée ici) + **envoi automatique au 6ᵉ** (différé 140 ms, timer annulé au démontage, garde `busyRef` conservée) ; **haptique** jeton par chiffre ajouté et alerte au refus (`haptic` exporté du kit, `buzz` inchangé) ; **téléphone mémorisé** `veloria.last-phone.v1` (SecureStore, survit à la purge comme `veloria.endpoint.v1`, **jamais le PIN**, vide/>30 refusé) avec `autoFocus` sur le code et « × » pour le changer ; champ PIN posé **par-dessus** les cases en absolu opacity 0 (fini le `Tap` englobant : un seul nœud labellisé, cases hors-arbre), **caret doré** dans la case active, chiffres en `FONTS.mono` ; défaut d'alignement arabe corrigé : `startEdge` remplace `farEdge` pour le texte d'aide et le libellé replié, qui fuyaient à l'opposé de leur icône. 2 clés i18n ajoutées (ar+fr), **zéro texte / `aria-label` / `testID` existant supprimé**, zéro dépendance, zéro migration, zéro canal, aucun autre écran touché. **+1 test de régression** (numéro survivant à `clearCache()`, écritures vides/surdimensionnées refusées). Mesure Chromium **360×553 (pire cas)** : contenu 713 px, « دخول » à **y ≈ 400-460** donc visible sans scroller ; états vus arabe et français, code à 0/4/6 chiffres, cases révélées, aide dépliée, et erreur « hors connexion » **déclenchée par l'envoi automatique** (seul message console de la page : POST réel refusé vers `:8099`). Portes : mobile typecheck **0** · mobile lint **0** · vitest mobile **29/29** · prettier **0** · **non vérifié : rendu natif Android et `autoFocus`** (le clavier ne s'ouvre pas sur web). **ADR-151**. Détails §60.
- **Session 59 (2026-10-28)** : **client mobile V4 « Daylight plat »** — refonte complète du rendu de l'APK clients (`mobile/`, 8 écrans + kit + tokens + coquille), direction **A** choisie par le propriétaire parmi trois, alignée sur ADR-148 : plus de dégradés (`GRADIENTS` supprimé, `expo-linear-gradient` **retiré** du package), séparation par **filets** (`HAIRLINE`/`Divider`), un seul accent (or), statuts en point + texte, primitives neuves `Group`/`Row`/`Divider`, **dock ancré** (le pilon flottant mangeait la dernière ligne) + réserve `SIZES.dockInset`, `boxShadow` à la place des props `shadow*` dépréciées RN 0.76. Gains vus sur captures 390×844 : **4 lignes de factures contre 2**, totaux de détail enfin lisibles (le slab encre de la V3 rendait les montants masqués illegibles), titre RTL non tronqué. **Rendu seul** : zéro texte, zéro clé i18n, zéro `aria-label`, zéro logique métier touchés — les **4 verrous** d'identité/ergonomie des tests (`#051424`, `#fbbf24`, 48, 20) tiennent sans avoir été assouplis. Vérifié **visuellement** sans émulateur : miroir de démo + `expo start --web` + capture via le Chromium d'Electron (Playwright Chromium non téléchargeable ici). Trois obstacles corrigés au passage : `scripts/e2e-mobile-shots.mjs` aux ancres mortes (`phone`/`pin`), **Metro qui ne surveille pas les fichiers** (bundle servi identique octet pour octet → forcer le redémarrage du port 8083), CORS du serveur de démo sans `authorization` (« لا اتصال بالإنترنت » alors que le serveur répondait 200). Régression personnelle détectée et annulée : `aria-label` du PIN en double (conteneur + champ) ⇒ un seul nœud labellisé. Bug trouvé par la relecture parallèle : `Row` en `alignItems:"left|right"` (invalide) → `flex-start|flex-end`. Portes : mobile typecheck 0 · mobile lint 0 · **vitest 171/1 188 0** · typecheck racine 0 · eslint 0 · format:check 0 · encoding 0 (949) · fr 0 (341) · **knip 0** · **non vérifié : rendu natif Android** (aucun APK rebâti) · **Metro :8083 et démo :8099 encore lancés** (à arrêter). **ADR-150**. Détails §59.
- **Session 58 (2026-10-27)** : **purge A + B exécutée — +1,4 Go libérés (2,5 → 3,9 Go)** et **livrable Android sauvé** : `mobile/android/app/build/` (414 Mo, git-ignoré, donc « poubelle » apparente) contenait en réalité **`app-release.apk` 88,5 Mo du 2026-10-05** (`dz.veloria.client`, release, versionName 1.0.0) — déplacé avec `output-metadata.json` **et son SHA-256 consigné** (`7ed5b64c…df51`, contrôle identique à l'origine) dans `release/apk-android/` avant toute suppression ; keystore intact. Détruit : `mobile/android/app/build` + `.gradle` (28 Mo) + 2 dumps de **crash JVM** · 10 snapshots `graphify-out` (~100 Mo, 2026-10-27 et le graphe actif conservés) · `release/win-unpacked` + `builder-debug.yml` · `release-manager-tmp` · `test-results` · **`release/_prev-2026-10-23` (867 Mo)** après **vérification que ses 4 hashes sont bien ceux de la release du 23/10 du §1 et non les 4 hashes livrés** (schéma 0051, non distribuable ADR-023). Gardés : `dist*` (5,3 Mo, chargés par `npx electron .`), `node_modules`, `private/`, keystore, `release/*.exe`, docs suivis. **Zéro fichier suivi touché** (`git status` propre). **Chiffres du §57 corrigés** : les backups graphify font ~100 Mo (pas 86) et le dispensable était ~1,4 Go — j'avais oublié `mobile/android/`. Reste : 2 `app.asar` **verrouillés par l'antivirus** (~35 Mo chacun, partent au redémarrage, jamais forcés). Détails §58.
- **Session 57 (2026-10-27)** : **lancement réel + purge du pied d'arbre + docs alignées** — **app Electron lancée réellement** (fenêtre affichée, `env -u ELECTRON_RUN_AS_NODE`). Licence : 5 `.vlic` décodées **en lecture seule** (enterprise `VLIC-ED9D8361` émise aujourd'hui, 3 pro, un doublon `gggg.vlic` = même licenseId) — **aucun import** : DPAPI + `app_settings.license_anchor` + `maxStanding` + `maxDevices=1` rendent l'import quasi irréversible et le choix du client relève du propriétaire. Pied d'arbre : les 21 fichiers **suivis** sont tous légitimes, **rien de suivi n'a été touché** ; supprimé ce que `.gitignore` déclare déjà scratch (`check_like.py`, `full-inventory.txt`, `electron-run.log`, 2 `.tsbuildinfo`, `.ruff_cache/`, `coverage/`, `release-manager-tmp/` sauf son `app.asar` **verrouillé par le scanneur**, jamais forcé). **≈992 Mo proposés, NON exécutés** (arbitrage propriétaire) — **devenu sans objet : purge exécutée en §58** (chiffres corrigés au passage) : `release/_prev-2026-10-23/` 867 Mo, `release/win-unpacked/` 39 Mo, 10 backups `graphify-out/` 86 Mo, `dist*` 5,3 Mo, `docs/reports|archive|specs-archive` 4,2 Mo (suivis + cités ⇒ garder). Docs corrigées sur l'état réel : `README.md` (171 fichiers / ~1 188 tests au lieu de « ~550 / ~90 », E2E 24 specs / 50 tests au lieu de « 10 scénarios », piège `ELECTRON_RUN_AS_NODE`, pont vers `handoff.md`/`docs/INDEX.md`) et `docs/STRUCTURE.md` (migrations **0001..0056** aux 3 endroits qui disaient 0049, ADR **001→149**, racine complète incl. `handoff.md`, `src/domain` + `packaging`/`barcode`/`units`, règle d'hygiène §7 + liste d'intouchables). Portes : `format:check` 0 · `verify:encoding` 0 (953) · `git diff` limité à README/STRUCTURE/handoff (suite vitest et build non relancés — zéro changement de code depuis `9d5ad62`, déjà 171/1 188 verts). Détails §57.
- **Session 56 (2026-10-27)** : **code-barres carton — Phase 3 d'ADR-136 (ADR-149)** — le carton a SON code et la pièce a son code sur la même fiche. Le prompt demandait `pack_size`/`pack_price_minor`/`label` sur `product_barcodes` : **refusé après arbitrage propriétaire**, parce que `0054` porte déjà ces trois faits (`factor`, `selling_price_minor`, `label_fr`) et avait **réservé le hook** (`product_barcodes.packaging_id`, commentaire « Phase 3 ») — deux sources du même prix = factures divergentes. Le code ne désigne que le conditionnement ; **un scan ajoute `factor` unités de base** et la projection existante (`priceSaleLine`) facture le tarif carton exact. **Zéro migration, zéro canal, zéro schéma nouveau** (contrats 181/125/56 intacts) ; `sales.repo`, FIFO, stock, `sale_items`, rapports et devis **ne bougent pas** ; revalidation main du facteur/prix conservée (ADR-136 D5). Règle nouvelle : **code de carton ⇒ tarif automatique** (sinon le scan facturerait le prix pièce). `updateProduct` rejoue les liaisons qu'il effaçait ; `products.packagings.delete` les coupe. Formulaire produit : champ « Codes-barres du carton » + badge `carton` ; tiroir détail : `… (carton)` ; retour client : le scan pré-remplit la ligne visée (carton entier). Portes : typecheck 0 · typecheck:electron 0 · eslint 0 · format:check 0 · **vitest 171 fichiers / 1 188 tests 0** · build ✓ · build:electron ✓ (manifeste **234**) · verify:migrations **VERIFIED (56)** · domain ✓ · fr **0** (341) · encoding **0** (953) · perf ✓ · knip **0** · **E2E `carton-barcode` 1/1** réel (2 scans → **300,00 DZD**, stock 100 → 68, `sale_items` `quantity 2 × unit_factor 16`, liaison posée sur le seul code carton). **Apppris de l'E2E** : deux scans du même code **fusionnent** en une ligne (j'attendais deux lignes — assertion alignée sur le comportement réel, qui est correct). Commit **`9d5ad62`** + ce `docs(handoff)`. Détails §56.
- **Session 54 (2026-10-27)** : **Audit transversal et corrections radicales** — périmètre arbitré avec le propriétaire : checkpoint du travail en cours d'abord (`7f98e44`, 35 fichiers des sessions 41/45), puis **delta depuis le baseline vert `f9da60c`** (263 fichiers, +23 268 lignes) et code neuf, correction au fil de l'eau. 21 findings, dont 4 P1 corrigés : porte de licence **fail-open** sur la conversion devis → fail-closed ; **double restauration FIFO** possible à l'annulation d'un retour fournisseur (journal validé avant toute écriture, sinon refus) ; **3ᵉ copie** de la règle de prix de ligne dans les devis, sans plafonds → déléguée à `priceLine` ; **survalorisation** d'un retour sur le chemin contractuel « sans ligne exacte » → plafond agrégé par produit (`productCap`) sur les deux kinds, avec régression. Règles devenues **uniques** : statut de retour (`deriveReturnStatus` + parité testée), valeur nette d'une ligne (`netReturnLineValue` domaine + miroir main + variante sûre au rendu, doctrine A-01), politique « dette d'abord » de l'aperçu caisse (`previewReturnSettlement`). 5 `catch {}` muets journalisés ou supprimés, 2 N+1 agrégés, 4 littéraux monétaires remplacés par `money-guard`, 1 champ de contrat déprécié retiré (`creditMinor`), 1 règle domaine contredisant ADR-138 supprimée (`assertRefundSplit`), 1 défaut de **porte** corrigé : `docs/ADR-145` était committé hors prettier (`format:check` rouge depuis `71fbc77`). **R1-R7 vérifiés** : R6 = 0 migration éditée en place ; R3 = 143 canaux `handle()` tous validators + 40 canaux bruts tous Zod-parsés et gardés. Constat structurel **A21** : 109 exports de `src/domain` sans aucun appelant hors tests (angle mort de `knip`, qui compte un test comme consommateur) — déjà classé **DT-05** par l'audit du 2026-10-18 en arbitrage propriétaire, donc documenté et non vidé. Portes : typecheck 0 · typecheck:electron 0 · eslint 0 · **format:check 0** · verify:migrations (56) · domain · fr (340) · encoding (947) · perf ✓ · **knip 0** · **vitest 169 fichiers / 1 173 tests 0** · build ✓ · build:electron ✓. **Non audité** (balayages outillés seulement, lecture intégrée au tour suivant) : `src/features` hors retours/devis, `src/app`/`shared`/`styles`, `electron/printing`/`sync`/`preload`, `license-manager`, `mobile`, `cloud`, `scripts`. Rapport : `docs/reports/AUDIT_2026-10-27.md`.
- **Session 53 (2026-10-27)** : **Refonte visuelle transversale** — `PageHeader` plat (sur-titre module + H1 + période + actions), suppression du badge « Poste Principal » et des pastilles de module ; une seule recherche par écran (doublons en-tête/barre retirés), `Toolbar` compacte toujours visible (fin du bouton « Filtres »), exports/imports déplacés dans la barre ; `StatsStrip` unique (4 ou 5 cellules) avec tons sémantiques **conditionnels** ; coquille fusionnée (session dans `TopBar`, libellé module retiré), sidebar active plus calme, toasts en bas à droite ; thème clair aligné (surfaces, bordures, textes, en-têtes de tableaux). Aucun backend/canal/migration. Portes : typecheck 0 · electron 0 · eslint 0 · prettier 0 · verify:fr 340 · verify:encoding 947 · **vitest 169 fichiers / 1 171 tests 0** · build ✓ · build:electron ✓ · **E2E 6/6** (`navigation-smoke`, `component-smoke`, `barcode-uppercase`, `catalogue-labels`, `settings-navigation`, `dashboard-ui`). ADR-148. Commits `9b7c564` (20 fichiers UI/tests/ADR) + `2707f41` (Devis). `handoff.md`, `docs/INDEX.md` et les sessions 41/45 restent dans l'arbre ; seule l'addition de type de `ProformasScreen.tsx` (session 45) reste non commitée.
- **Session 52 (2026-10-27)** : **Tableau de bord reconstruit** — barre de période avec presets actifs + menu Exporter (PDF/Excel/CSV), 4 KPI principaux + bande compacte secondaire, ventes/jour + encaissements, catégories avec filtre/total, et détails répartis en onglets **Finances / Stock & dettes / Activité récente** ; vigilance seulement si nécessaire. Suppression du défilement imbriqué qui interceptait les clics. Aucun backend/canal/migration. Portes : typecheck 0 · eslint 0 · prettier 0 · verify:fr 340 fichiers 0 · **vitest 169 fichiers / 1 171 tests 0** · build ✓ · build:electron ✓ · **E2E dashboard-ui 1/1 + component-smoke 1/1**, captures `test-results/dashboard*.png`. ADR-147. Commit `08a3ba1`. Détails §52.
- **Session 50 (2026-10-26)** : **Paramètres — sections et composants** — `Section` commune avec icône, badge d'état, repli et pied `SaveBar` unifié ; `SettingsGroup`, `Segmented` (paiement) et `SwitchRow` compacté. Regroupement **Vente + Sons**, **Produits + Stock**, **Clients + Fournisseurs** (Commerce 5 → 3 cartes, Catalogue 2 → 1) ; recherche/ancres mises à jour. Les actions immédiates (sauvegarde, base, miroir, dossiers) utilisent des `Button` explicites et non plus `SaveBar` ; blocs avancés repliables. Aucun canal/schéma/migration. Portes : typecheck 0 · eslint 0 · prettier 0 · **vitest 169 fichiers / 1 171 tests 0** · build ✓ · build:electron ✓ · verify:fr 340 fichiers ✓ · **E2E settings-navigation 1/1 · stock-backup 4/4 · full-loop-client 1/1** (7 clichés poussés, 1 accès). ADR-145. Commit `71fbc77`. Détails §50.
- **Session 49 (2026-10-26)** : **coût rendu, prix carton auto, paramètres et formulaires** — la livraison d'une réception est répartie au prorata exact sur chaque produit et `products.purchase_price_minor` reçoit le **coût rendu** (fret inclus), y compris pour un produit créé par nom ; le formulaire produit calcule automatiquement pièce ↔ carton **sans écraser un prix saisi** (œufs 25 DZD pièce / 650 DZD carton conservés) ; Paramètres reconstruits (groupes, icônes, recherche indexée, sous-navigation, fiscalité repliée) ; formulaire client en sections avec notes repliées et barre fixe ; codes-barres ASCII en majuscules à la saisie et au stockage. 3 ADR (142/143/144), 3 migrations inchangées. Portes : typecheck/electron 0 · eslint 0 · **vitest 169 fichiers / 1 170 tests 0** · build ✓ · build:electron ✓ · verify:migrations/domain/fr/encoding ✓ · **E2E 6 specs / 7 tests ciblés verts** (smokes, carton 750 DZD, client, paramètres, barcode). Commits `bfef912` + `5f33cac`. Détails §49.
- **Session 48 (2026-10-26)** : **réception fournisseur simplifiée** — modale élargie (960 px, `Modal extraWide`), saisie en sections **Facture fournisseur / Articles reçus / Notes**, fournisseur replié avec recherche à la demande, lignes compactes (produit existant ou nouveau produit par nom, unité d'achat pièce/carton, quantités, prix, coût rendu), **total + validation fixes** en bas. Une ligne commencée mais incomplète **bloque désormais la validation** (message FR + défilement automatique vers la ligne) au lieu d'être ignorée en silence ; « Changer » réinitialise les données produit/tarif du produit précédent ; **Entrée ne valide plus implicitement** (`Ctrl+Entrée` explicite). Aucun canal, schéma, migration ni ADR. Portes : `tsc` 0 · eslint 0 · **vitest 165 fichiers / 1156 tests 0** (suite complète finale) · `build` ✓ · `build:electron` ✓ (manifeste **233**) · `verify:fr` 0 (336) · **E2E stock 4/4** (dont garde Entrée + ligne incomplète). Commits `c4a4208` (refonte) + `ebbd5c3` (garde Entrée). Détails §48.
- **Session 47 (2026-10-26)** : **formulaire produit simplifié** — saisie réorganisée en 2 colonnes (Identification, Prix, Stock & seuils, Conditionnement) + « Options avancées » repliées (fournisseurs avec filtre, stock maximum, produit actif) ; aperçu de marge en direct (vert/rouge, vente à perte), codes-barres en puces avec bouton d'ajout, création de catégorie à la demande, barre d'enregistrement fixe + `Ctrl+Entrée`, et le code scanné non validé est conservé au clic sur « Créer ». Libellés/aria-labels existants conservés. Aucun canal, schéma, migration ni ADR. Portes : `tsc` 0 · eslint 0 · **vitest 165 fichiers / 1156 tests 0** · `build` ✓ · `build:electron` ✓ (manifeste **233**) · `verify:fr` 0 (336) · **E2E carton + scan 7/7** ; vérification visuelle réelle création + édition. Commit `4a993c2`. Détails §47.
- **Session 46 (2026-10-26)** : **test réel du tarif de gros carton** — produit **œufs** : 1 carton = 30 pièces, achat carton 540 DZD, vente carton 650 DZD, vente pièce 25 DZD. L'E2E réel a révélé que le plancher ADR-136 `(facteur−1) × prix pièce` (29 × 25 = 725) refusait le tarif 650 : le panier affichait « 1 carton + 4 pièces » mais **sans badge Tarif carton** et facturait **850 DZD** au lieu de **750 DZD**. Plancher supprimé (ADR-141) : seul reste `prix carton < facteur × prix pièce` ; la baisse au seuil (29 = 725 → 30 = 650) est le tarif de gros voulu. Après correctif, E2E réel : badge Tarif carton, économie 100 DZD, ticket `1 × Carton de 30 @650` + `4 × 25` = **750 DZD**, stock **34 → 0**, lignes `unit_factor` 30/1. Portes : typecheck/electron 0 · eslint 0 · **vitest 165 fichiers / 1156 tests 0** · `build` ✓ · **E2E carton 1/1** (à lancer avec `env -u ELECTRON_RUN_AS_NODE`). ADR-141. Détails §46.
- **Session 45 (2026-10-26)** : **conditionnement carton — devis et retours fournisseur corrigés** — un devis enregistre désormais les lignes éclatées (carton + reste) avec **snapshot** `packaging_id`/`unit_factor`/`unit_code` : total stocké = total imprimé = total converti ; la conversion honore le prix/conditionnement du devis (même si le tarif a changé depuis) et déduit le stock en unités de base (`trustedPackagingSnapshot` interne au main, migration **0056**). Le retour fournisseur sépare `quantity_stock` et `quantity_damaged` : stock 34 + 2 abîmées = 36 retournables, la sortie de stock n'est que de 34 ; l'`intakeItemId` valorise chaque ligne à son propre prix ; l'annulation restaure le stock et le journal une seule fois. Correctif latent : l'annulation de retour avait un placeholder SQL de trop (échec systématique client/fournisseur). Portes : typecheck/electron 0 · eslint 0 · **vitest 165 fichiers / 1156 tests 0** · build ✓ · verify:migrations **56** ✓. ADR-140. Détails §45.
- **Session 44 (2026-10-26)** : **étiquettes multi-pages** — la sélection du Catalogue porte désormais les fiches (`Map<number, Product>`) et non plus seulement leurs identifiants : « Étiquettes » imprime les produits cochés sur **toutes les pages**, plus uniquement la page affichée. Helper pur `labelTargets` (types.ts) + régression unitaire et **E2E réel** (`catalogue-labels.spec.ts` : 21 produits, 1 coché sur chaque page ⇒ 2 étiquettes dans l'aperçu). Licence E2E complétée (`excel-export`, `barcode-scanner`) pour couvrir import CSV + aperçu. Aucune migration, aucun canal IPC, aucun ADR. Portes : typecheck/electron 0 · eslint 0 · **vitest 165 fichiers / 1150 tests 0** · build ✓ · build:electron ✓ (manifeste **232**) · verify:fr 0 · E2E ciblé 1/1. Détails §44.
- **Session 43 (2026-10-26)** : **annulation / correction des factures** — **vente** : nouveau canal `sales.reopen` (annuler puis recharger les lignes dans la caisse, nouveau numéro ; bouton « Modifier la vente » dans l'Historique), refus avant annulation si retours ou produit archivé ; **achat** : détail + `stock.intakeCancel` d'une facture fournisseur **intacte** (stock, couches FIFO et dette restaurés ; refus si stock consommé, retour fournisseur, facture réglée ou réception liée à un bon de commande), correction = formulaire de réception prérempli. Correctif associé : l'annulation d'une vente **sans client** violait le garde crédit 0051 (vente annulée désormais soldée). ADR-139, **aucune migration**, permissions existantes (`cancel` / `stock`). Portes : typecheck/electron 0 · eslint 0 · **vitest 165 fichiers / 1149 tests 0** · build ✓ · verify:migrations (55) ✓. Détails §43.
- **Session 42 (2026-10-25)** : **caisse — codes-barres alphanumériques** — la recherche/scan accepte lettres, symboles et codes courts (jeton unique ≥ 2 car.), la correspondance code-barres ignore la casse (étiquettes Code 39 imprimées en majuscules / fiche parfois en minuscules ; casse exacte prioritaire), le jeton complet gagne sur le préfixe quantité (`2X500G` reste un code) et un scan machine inconnu à lettres affiche le message FR puis vide le champ (plus de concaténation avec le scan suivant). Aucune migration, aucun canal IPC. Portes : typecheck/electron 0 · eslint 0 · **vitest 162 fichiers / 1132 tests 0** · build ✓ · verify:migrations (55) ✓. Détails §42.
- **Session 41 (2026-10-25)** : **retours clients — la dette d'abord** (ADR-138, migration **0055**) : imputation automatique `min(valeur nette, solde)`, allocation vente d'origine puis ventes ouvertes les plus anciennes, jour clos ⇒ crédit non affecté (aucun ABORT 0048), espèces plafonnées à l'excédent (refus FR au-delà), `sales.credit_applied_minor` exclu du Z/zakat, valeur nette `line_total` et `sale_item_id` par ligne, UI dette/avoir calculés. Portes : typecheck/electron 0 · eslint 0 · **vitest 161 fichiers / 1121 tests 0** · build ✓ · build:electron ✓ (manifeste **232**) · verify:migrations (55)/domain/fr/encoding ✓ · knip 0 · **E2E credit-return 3/3** (dont retour sur vente à crédit). Détails §41.
- **Session 35 (2026-10-23/24)** : skills alignés (migration **0051**, ADR-135), lint **0** (casts `any` des tickets HTML supprimés), `knip` **0** (`PrintingSection` mort + ré-export `TicketCodes` retirés), E2E **45 tests** (2 smokes ajoutés : navigation 16 modules + composants/dialogues) — **42 réussis / 3 ignorés / 0 échec**, 5 échecs E2E corrigés (aria-label iframe ticket ADR-134, noms réels des dialogues, attente iframe historique), `full-loop-client` rejoué avec relais `:8100`, packaging ADR-023 refait. Détails §35.
- **Session 37 (2026-10-25)** : **migration 0052** (lignes de vente/retour : catégorie figée + COGS retour ; `supplier_returns.staff_user_id` ; index Dashboard) · Dashboard reconstruit sur le **NET des retours/remboursements** (`dashboard.repo.ts`), carte **Ventes/marge par catégorie** avec sélecteur, `formatDzdTotal(±)`, compteurs Top 5 non tronqués, séries journalières complètes, intégrité mise en cache avec horodatage · gardes : annulation refusée avec retours, retour refusé sur vente annulée, refresh APK après annulation/retour, pagination miroir >500 clients, **RLS/revoke/security_invoker** Supabase, clé service liée à l'hôte, opérations destructives **gérant-only** · portes : typecheck 0, electron 0, eslint 0, **vitest 153 fichiers / 1063 tests 0**, build ✓, build:electron ✓, verify:migrations/domain/fr/encoding ✓. Détails §37. **Reste ouvert** : verrou PIN côté Edge (RPC atomique), jour métier `Africa/Algiers` (E-35), chiffrement sauvegardes/QR PIN, `maxDevices`, TTL payloads cloud.
- **Session 38 (2026-10-25)** : caisse durcie de bout en bout — **migration 0053** (`cart_drafts.sale_operation_id`), paiements jusqu'à `MAX_MINOR_TOTAL`, rejet des montants invalides (plus de 0 silencieux), `formatDzdTotal(±)` sur les totaux, limites **500 lignes / 20 paniers**, stock négatif **toujours** interdit (toggle trompeur retiré), produits/clients archivés refusés, livraison synchronisée, échéance réelle imprimée, moyen de paiement masqué si versement 0, actions filtrées par permissions staff, operationId **persisté avec le brouillon** et panier vidé avant impression. Portes : typecheck/electron 0, eslint 0, **vitest 156 fichiers / 1075 tests 0**, build ✓, build:electron ✓ (manifeste **227**), verify:migrations (53)/domain/fr/encoding ✓. Détails §38. **Reste ouvert** : navigation clavier des résultats clients/onglets, `dueDate`/onglet actif non persistés dans le brouillon, aperçu d'un replay après édition d'un brouillon ambigu, verrou PIN Edge, jour métier Algiers, sauvegardes/QR.
- **Session 40 (2026-10-25)** : **coût FIFO en caisse** — après une réception à un nouveau prix, la caisse utilisait le dernier prix d'achat comme coût de référence : fausse alerte « sous coût » sur l'ancien stock et coût erroné dans l'audit. La recherche produit expose désormais la prochaine couche FIFO (`fifo_next_unit_cost_minor`), le dialogue prix et l'alerte l'utilisent, et `createSaleAtomic` audite le sous-coût sur le **COGS FIFO réel** (après consommation) en figeant `sale_items.purchase_price_minor` sur ce coût moyen. ADR-137. Portes : typecheck/electron 0 · eslint 0 · **vitest 160 fichiers / 1106 tests 0** · build ✓ · build:electron ✓ (manifeste **230**) · verify:migrations (54)/domain/fr/encoding ✓.
- **Session 39 (2026-10-25)** : **conditionnement carton** — **migration 0054** (`product_packagings`, `packaging_id`/`unit_factor` sur ventes/achats/retours, `line_total_minor` achat, backfills historiques), domaine pur (`splitQuantityByCarton`, `priceSaleLine`, `allocateUnitCosts`, `toBaseQuantity`), tarif carton **monotone** (jamais de total qui baisse), stock/FIFO/mouvements **en unités de base**, vérification stock **agrégée par produit**, revalidation main du facteur/prix carton, achat carton→pièces avec couches FIFO exactes (1–2 paliers), retours dans l'unité vendue (carton complet ou pièces), UI Produit « Conditionnement », caisse (découpage + badges Tarif carton/Économie/Prix manuel), achat (unité d'achat + résumé pièces/coût), ticket (lignes carton/pièce). Portes : typecheck/electron 0, eslint 0, **vitest 159 fichiers / 1103 tests 0**, build ✓, build:electron ✓ (manifeste **230**), verify:migrations (54)/domain/fr/encoding ✓, knip **0**. Détails §39 et ADR-136.
- **Audit intégral EXÉCUTÉ (§18, 2026-10-19)** : 3 livrables — `docs/reports/FULL_AUDIT_2026-10-19.md` (rapport, 16 axes A→P, **228 findings** : 0 Critical · 23 High · 95 Medium · 110 Low) · `docs/reports/FULL_AUDIT_2026-10-19_PLAN.md` (plan en **11 vagues W0→W10**, ~11-13 j, 20 décisions owner) · `docs/ADR-120-*.md` (**proposé**, en attente d'approbation). Preuves brutes : `docs/reports/maintenance/audit-raw/`.
- **Remédiation : vagues W1 → W10 EXÉCUTÉES et commitées** : `0e900f1` **W1** (logique financière) · `cd43aa2` **W2** (sécurité) · `833cea1` **W3** (base) · **W4** (couverture verte + gardes auto-dérivées) · `1e56547` **W5** (rendu/UI caissier + atelier impression) · **W6** (code mort trié — ADR-127) · `4a96938` **W9** (encodage + chiffres à jour) · `7086954` **W8** (chemins chauds indexés, N+1, bundle) · **W7** (règles uniques — ADR-128) · **W10** (état d'erreur persistant — ADR-129). **Plan d'audit : TERMINÉ** (les 11 vagues sont exécutées).
- **Baseline gelé 2026-10-21 (mesuré, arbre propre)** : `tsc -b` **0** · `typecheck:electron` **0** · `eslint . --max-warnings 0` **exit 0** · `vitest` **142 fichiers / 976 tests** **0** · `test:db` **39 fichiers / 183 tests** **0** (isolé) · **`test:coverage` = EXIT 0 (VERT — 95,83 % lignes · 87,19 % branches · 100 % fonctions, seuils 80/75/88/80 par fichier ; aucun seuil abaissé)** · `knip` **0** (0 fichier, 0 export, 0 type, 0 dépendance) · `verify:migrations` **VERIFIED** · `verify:domain` **VERIFIED** · `verify:perf` **VERIFIED** · `verify:fr` **0** (322 fichiers, **plus de liste d'attente**) · `verify:encoding` **0** (868 fichiers) · `license:scan` **0** (1420 fichiers) · `format:check` **0** · `build` ✓ (12,1 s) · `build:electron` ✓ (manifeste signé **216 fichiers**).
- **Nouveaux constats P1 (non corrigés, voir plan)** : ~~jour métier en UTC au lieu de `Africa/Algiers` (E-35)~~ **CORRIGÉ session 95 (ADR-169, migration 0058)** · `verify:licensing` hors CI (bloqué : l'état local du Manager n'existe pas sur un runner) · **E2E rejoués le 2026-10-23 : 42 réussis / 3 ignorés / 0 échec**.
- **Corrigé en W1→W10 (à ne plus re-signaler)** : `customers.accessQrSvg` sans staff-gate · `staffScope()` ⇒ «no session = gérant» · `database.optimize` sans gate · conversion Proforma→vente cassée si remise · clôture Z (chèque/transfert/dépenses/retours) · verrou de période close (W3) · unicité téléphone + `paginationSchema.page` borné (W3) · `test:coverage` rouge (W4) · `FROZEN_SCHEMA_COUNT` (W4) · extraction EAN-13/14 (W4) · `formatDzd` qui throw au rendu + double-submit + focus + lots bornés (W5) · atelier impression (W5) · code mort trié, `knip` à 0, `expo-constants` retirée, garde FR sans liste d'attente (W6) · chemins chauds indexés (migration 0050) + N+1 supprimés + bundle découpé (W8) · encodage réparé (W9) · **règles uniques (quantité/montant/date/normalisation) + état « en retard » produit (W7)** · **état d'erreur persistant dans 12 écrans (W10)**.
- ADRs : 001→**169** (`134` = design du ticket de vente, `135` = export données réimportable, `136` = conditionnement carton, `137` = coût FIFO en caisse, `138` = retours dette d'abord, `139` = annulation/correction factures, `140` = carton devis/retours fournisseur, `141` = tarif de gros carton sans plancher, `142` = coût rendu produit/livraison, `143` = paramètres navigation/recherche, `144` = formulaires et code-barres, `145` = paramètres composants/sections, `146` = studio d'impression, `147` = tableau de bord, `148` = refonte visuelle transversale, `149` = code-barres carton, `167` = purge ciblée post-audit, `168` = APK Native-max, `169` = jour métier Africa/Algiers). `docs/INDEX.md` **complété 142→149 puis 167→169**.
- **3 bugs caisse signalés par le propriétaire (2026-10-21) — DIAGNOSTIC PROUVÉ puis CORRIGÉS (§23, ADR-131)** : (B1) focus qui revient au champ « Nom » de l'article libre — `useDialogFocus` rejouait son effet à chaque rendu (`onClose` inline = identité nouvelle) ⇒ **corrigé** (refs, dépendances `[boxRef]`) ; (B2) vente au poids en mode « Montant » : 50,00 DZD saisis mais **49,70 facturés** ⇒ **corrigé** (le montant saisi est facturé tel quel, `billedTotalMinor`) ; (B3) panier mixte : `CHECK constraint failed: discount_amount_minor >= 0` (7× dans le journal du 2026-10-21) — une **majoration** (prix de ligne > prix d'origine) produisait une remise négative, acceptée par le domaine mais **interdite par la base** ⇒ **corrigé** (migration **0051** : remise signée, table `sales` reconstruite + runner « FK off » ; garde des lignes AVANT l'INSERT ⇒ message FR au lieu du CHECK SQL). **Lien B1 → B3** (la saisie tronquée du prix forçait une correction par majoration). Packaging refait le 2026-10-23 (schéma 0051 inclus) ; constat secondaire non traité (4 ventes à `amount_paid_minor = 0`).
- **Constats bloquants de la revue UI d'ADR-131 — CORRIGÉS (§25, ADR-132)** : (C1) éditer qté/prix d'une ligne « montant saisi » tuait l'écran Vente (`computeBilledTotal` levait au rendu) ⇒ ligne **verrouillée** (qté + prix, jamais fusionnée, `+`/`−` strictement sur la dernière ligne) + `safeLineTotal` (« — » + log, jamais d'exception) ; (C2) ticket **non imprimable** (remise négative refusée par `discountMinor`) ⇒ `moneyMinorSigned`, ticket « Remise −X »/« Majoration +X », « montant saisi » au lieu de qté × P.U., quantités FR, devis A4 à majoration visible ; (C3) couverture **E2E** du mode Montant. Revue ui-fr (3 risques corrigés) + db-guardian CLEAN (aucune migration).
- Outillage : `knip.json` (§16) — `Unused files` **32 → 0** ; re-mesuré 2026-10-21 : **0 fichier · 0 export · 0 type · 0 dépendance** (la couverture `knip` s'étend désormais à `license-manager/**` et `cloud/**` — J-11).
- **« Grand blanc après le code-barres » sur la facture de vente imprimée — CORRIGÉ (§26, ADR-133)** : (a) le ticket **n'imposait aucun format de page** (`printOptions()` sans `pageSize` ⇒ format par défaut du pilote, A4/297 mm) alors que son contenu **se termine par le bloc codes** ⇒ la page est désormais **largeur du rouleau × hauteur mesurée du contenu** (+3 mm de coupe, plancher 30 mm, repli = ancien comportement) ; (b) le **Code 39 n'était jamais mis à l'échelle** (462 px dans 280/200 px + `overflow:hidden`) ⇒ module calé sur la colonne (1,1 px ⇒ 275,7 px en 80 mm) + plafond CSS `max-width/height:auto` (58 mm : 200/200 px, plus de barre coupée) ; (c) l'export PDF passait des **microns** à `printToPDF` (qui attend des **pouces**) ⇒ conversion explicite, PDF d'un ticket 80 mm = **80,1 × 141,5 mm sur 1 page**. Restent assumés : Code 39 de 14 car. non scannable sur 58 mm (limite matérielle) et payload QR imprimé deux fois (contrat texte ADR-050).
- **Import/export Clients & Produits — VÉRIFIÉS et DURCIS (§27, EMP-1 `6bb3a51`)** : le câblage existait (ADR-130) et les 3 E2E étaient vertes, mais **réimporter l'export clients créait 2 fiches bidon** (en-tête `Client;Téléphone…` traité comme données, guillemets conservés) au lieu d'échouer proprement, et un téléphone `pas-un-numero` était accepté. **Corrigé** : parseur CSV quote-aware, **refus FR explicite des exports de rapport** (produits et clients), **téléphone importé validé** (domaine + main), **export interrompu** si une page est illisible (plus de CSV tronqué annoncé « ok »). Parseur inchangé sur les formats documentés (`nom;vente;achat;quantité[;code-barres]`, `prénom;nom;téléphone`). Aucune migration, aucun canal, aucun ADR nouveau (restaure la décision 3 d'ADR-130). **Complété par §28/ADR-135** : second export « Données CSV » réimportable, sans changer le rapport.
- **Export de données réimportable — AJOUTÉ (§28, ADR-135 `2d8028a`)** : les écrans Produits et Clients ont désormais **deux exports** : « Rapport CSV » (lisible Excel, ADR-130) et « Données CSV » (`nom;vente;achat;quantité[;code-barres]` / `prénom;nom;téléphone`) qui se réimporte tel quel. Montants via `minorToInput` (jamais `formatDzd`) ; `protectFormulas:false` pour préserver `+213…`/`-…` (le rapport garde RX-18) ; export données **refusé** si le filtre inclut des archivés (le format d'import ne transporte pas le statut). Aucun canal, schéma, migration. Réimporter dans la même base échoue proprement sur l'unicité code-barres/téléphone : la restauration complète reste `Paramètres → Sauvegarde`.
- **Essai réel de la build CSV — LANCÉ (§29, 2026-10-22)** : build propre depuis `c30b5c6` dans un worktree isolé (`tsc -b` **0**, `vite build` ✓, `build:electron` ✓, manifeste **218 fichiers** signé), copie stable non versionnée `release/veloria-csv-test/` (gitignorée) + raccourci Bureau `Veloria POS - Test CSV.lnk`. Licence existante **ACTIVE** (`VLIC-757224A4`, pro à vie, 17 pages) réutilisée : aucune réactivation nécessaire. La base réelle `%PROGRAMDATA%\Veloria PoS\Data\Veloria POS DB.sqlite` a été migrée **50 → 51** par cette build : l'ancien installateur du 21/10 refusera désormais cette base (« version plus récente ») ; snapshot pré-migration + copie manuelle disponibles. `release/` (installateur) reste l'ancienne build.
- **Design du ticket de vente — LIVRÉ (§30, ADR-134 `9fbc90e`)** : le ticket papier, le PDF, l'aperçu vente et l'atelier partagent désormais **un seul document HTML** (`buildReceiptTicketHtml`) : en-tête enseigne, date, ligne client, table `Qté/Article/P.U/Montant` à lignes pointillées, `N Article(s)`, encadré arrondi `Ancien solde/Total vente/Versement/Nouveau solde` (ou `Reste à payer`/`Monnaie rendue`), remerciement, Code 39 + QR, mentions légales. Le montant saisi garde `P.U —` + « Montant saisi » (ADR-131/132). L'aperçu renvoie `{ text80, html80 }` (aucun canal, schéma ni migration ajouté) et s'affiche en iframe `sandbox=""`. Défaut trouvé et corrigé : l'encadré dépassait de **14 px** en 80 mm (`flex:0 0 74%`) ⇒ `flex:1 1 auto; min-width:0` ; mesure Playwright **0 débordement** en 58 et 80 mm. Le payload QR n'est plus imprimé deux fois quand un SVG existe. `buildReceiptText` reste pour les autres documents thermiques et le repli d'aperçu.
- **Contrats gelés (mis à jour par ADR-138)** : snapshot `ipc-channels.json` **181** (+`products.packagings.list/save/delete`) · `FROZEN_SCHEMA_COUNT` **125** · `FROZEN_EXPORT_COUNT = 134` · `FROZEN_SCHEMA_TOTAL` (op-id) **125** · `operation-id-coverage` : **46** REQUIRED + classification complète (125 schémas) · migrations **56** (0051 = remise signée ; **0052 = snapshots catégorie/COGS retours** ; **0053 = operationId de vente dans le panier** ; **0054 = conditionnements carton** ; **0055 = imputation des retours sur la dette** ; **0056 = snapshot carton des devis + retours fournisseur stock/abîmées**). `printing.preview` renvoie en plus `html80` (même canal, même schéma de requête).
- **E2E (2026-10-23)** : suite complète **45 tests : 42 réussis, 3 ignorés** (installateur NSIS/UAC + drag/redimensionnement OS), **0 échec** (26,6 min, relais miroir `:8100`). Specs ajoutées : `navigation-smoke` (16 modules) et `component-smoke` (rendu + dialogues) ; matrice `docs/reports/E2E_COVERAGE_MATRIX.md`. `full-loop-client` vert avec relais. Les 3 ignorés sont documentés dans la matrice.
- **Packaging REFAIT 2026-10-27 (session 55)** : `release/` reconstruit depuis la tête `701b348` — POS Setup/Portable + License Manager Setup/Portable + blockmaps + `SHA256SUMS.txt` (4 hashes, §55) ; `release:smoke` **0** ; règle 9 vérifiée sur le runtime POS emballé (`better-sqlite3` chargé, Electron 37.2.0, ABI 136, SQLite 3.50.2). Les binaires du 23/10 sont conservés hors distribution dans `release/_prev-2026-10-23/`. Version toujours **1.0.0** ⇒ mêmes noms de fichiers que la release précédente, seul le hash les distingue.
- **Packaging REFAIT 2026-10-23** (§35, remplacé ci-dessus) : `release/` reconstruit **de zéro** (ADR-023) — `Veloria-PoS-Setup-1.0.0.exe` + `.blockmap` · `Veloria-PoS-Portable-1.0.0.exe` · `Veloria-License-Manager-Setup-1.0.0.exe` + `.blockmap` · `Veloria-License-Manager-Portable-1.0.0.exe` · `SHA256SUMS.txt` · `release/win-unpacked/` (= License Manager, dernier empaqueté). Hashes : POS setup `1993570380256561b9272133f90a1bb2f4d15607522a0f9a95dd54b2be255d9d` · POS portable `39f4ea38c9bf615a03dc982822be328db90f99788846b837814a98b97c4ab94e` · Manager setup `a61f274eaa3acbdcbba3a9d2adac3f8558b30541efa9b98eb20112991079ce3f` · Manager portable `850321ccfcf502e26a59ec52550037bbec7018d90f0f7846c2fba5d178d5b0db`. `release:smoke` **0** ; `better-sqlite3` chargé dans les runtimes POS **et** Manager (Electron 37.2.0, ABI 136, SQLite 3.50.2 — règle AGENTS.md §9).
- Non relancés : `verify:licensing`, `npm audit` réseau (offline ⇒ non probant). **APK mobile impossible ici** : ni EAS CLI/jeton, ni JDK/Android SDK, ni `EXPO_PUBLIC_*` réel (placeholders dans `mobile/eas.json`).
- **Portes §30 (historique, 2026-10-22, arbre de `9fbc90e`)** : `npm run typecheck` **0** · `typecheck:electron` **0** · `eslint . --max-warnings 0` **0** · `vitest` **151 fichiers / 1 051 tests** **0** · `build` ✓ · `build:electron` ✓ (manifeste **220 fichiers**) · `verify:fr` **0** (325 fichiers) · `verify:encoding` **0** (886) · `verify:migrations` **VERIFIED**. E2E et `verify:licensing` **non rejoués** ; packaging `release/` antérieur au design ticket.
- **Portes §31 (historique, 2026-10-23, arbre de `e3cf6e7`)** : `typecheck` **0** · `typecheck:electron` **0** · `eslint` **0** · `vitest` **151 fichiers / 1 052 tests** **0** · `build` ✓ · `build:electron` ✓ (manifeste **220**) · `verify:fr` **0** (325) · `verify:encoding` **0** (887) · `verify:migrations` **VERIFIED**. **PDF réel** : 80,09 × 155,19 mm et 58,25 × 176,36 mm, dernier texte « POS » à **6,23 mm** du bas, aucun gris peint (blanc/noir uniquement). **Vide papier** : pilote étiquette `2120TF(Label)` en 90 × 60 mm, gap actif — passer le pilote en reçu/continu (détail §31). E2E, `verify:licensing` et packaging **non rejoués**.
- **Pièges découverts pendant l'audit** : (1) `npm run lint` passe sur `docs/**` ⇒ **tout `.mjs` déposé sous `docs/` casse la porte** (allowlist `allowDefaultProject` = 24 chemins, `eslint.config.mjs:31-58`) ; (2) `test:db` échoue (12 `Hook timed out`) si lancé **en parallèle** d'autres outils lourds ⇒ **`hookTimeout` passé à 60 s (W4)** ; (3) `format:check` échoue sur tout `.md` écrit à la main ⇒ **toujours** passer Prettier sur les livrables ; (4) `npm run build` seul invalide le manifeste licence ⇒ toujours enchaîner `build:electron` ; (5) `better-sqlite3` est compilé pour l'ABI Electron (136) : pour interroger la base hors GUI, passer par `ELECTRON_RUN_AS_NODE=1 npx electron script.cjs` ; (6) toute arête inter-features nouvelle fait **échouer** le test A3 ⇒ liste blanche `tests/unit/a3-organisation.test.ts` à mettre à jour dans le même commit ; (7) **`test:coverage` instrumentant tout le code, les tests d'intégration lourds dépassaient `testTimeout` (15 s) ⇒ passé à 60 s (W4)** ; (8) **écrire un fichier via `Set-Content` (PowerShell) corrompt l'UTF-8** (double encodage) ⇒ toujours écrire via l'outil d'édition ou un script Node.

## 2) Objectifs réalisés (11 → 12 oct 2026)

| #   | Objectif                  | Résultat                                                                                                                                                                 |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Nettoyage TEMP/cache      | TEMP user 1654→9 fichiers, +598 MB libres (opencode + verrous préservés) ; `npm cache verify` (39 MB GC)                                                                 |
| 2   | Packaging débloqué        | Developer Mode (`AllowDevelopmentWithoutDevLicense=1`) lève le blocage winCodeSign SANS admin — `package:win` + `package:manager` verts (ADR-070 respecté, `true` gardé) |
| 3   | Audit profond 3 UI        | 3 sous-agents + vérification manuelle : 0× P0, 7× P1, ~25× P2, plusieurs « dettes » réfutées (GRADIENTS utilisé, `share.ts` inexistant, `•••` voulu, haptics déjà câblé) |
| 4   | Correctifs radicaux       | 18 Manager + 9 Mobile + 13 POS (dont preload payload, JSON.parse gardé, startup fail-closed, restore, `useLicense(notify)`, SearchField/Select, clés stables) — ADR-080  |
| 5   | Design Phase 1 fondations | `::selection`/caret or, moment mouvement unique (modal+toast 160/180 ms), « Monnaie » héros 30 px — ADR-081 (D1/D10/D13 reformulés après refus craft-floor)              |
| 6   | Design Phase 2 surfaces   | Pastille+J-X Manager, bande « Aujourd'hui », salut horaire + impayés Mobile, barre crédit segmentée, glyphes SVG EmptyState — ADR-082 (D14 vérifié existant)             |
| 7   | Design Phase 3 profondeur | Densité (miroir useTheme), épinglés ★, total+Encaisser sticky, `useCountUp`, durcissement clair (10/10 hex couverts) — ADR-083                                           |
| 8   | Re-verdict complet        | 661/661 + E2E 24/24 (chrome 6, sale 4, reste 14) + re-packaging + checksums                                                                                              |

## 3) Fichiers modifiés (12 oct, par chantier, non commités)

- **Correctifs Manager** : `preload.ts`, `App.tsx`, `ipc-client.ts`,
  `manager-env.d.ts`, `registry.ts`, `validators.ts`, `licenses.ts`(inchangé —
  lecture seule), `manager-db.ts`, `integrity-check.ts`, `main.ts`,
  `window-manager.ts`, `styles.css`, `sign-manager-integrity.mjs`,
  `tests/unit/license-manager-presets.test.ts` (nouveau),
  `tests/unit/license-tamper.test.ts` (fixture P0-4 +preload).
- **Correctifs POS** : `use-license.ts`, `LicenseScreen.tsx`, `App.tsx`,
  `Sidebar.tsx`, `OcrImportDialog.tsx`, `IntakeDialog.tsx`,
  `ProductsBlock.tsx`, `ReportsScreen.tsx`, `widgets.tsx`,
  `DashboardScreen.tsx`, `ProformaDialogs.tsx`, `DetailsDrawer.tsx`
  (returns), `MovementsDialog.tsx`.
- **Correctifs Mobile** : `App.tsx`, `i18n.ts`, `Home.tsx`,
  `Invoices.tsx`, `QrScanner.tsx`, `tokens.ts`, `validate-env.mjs`
  (`staleLabel`/`allKeys` conservés — utilisés par les tests).
- **Design** : `globals.css`, `primitives.tsx` (Modal, EmptyState+glyphes),
  `ShellOverlays.tsx` (toasts), `PayDialog.tsx`, `SellTotalsPanel.tsx`
  (sticky), `CartPanel.tsx`, `TopBar.tsx` (densité), `use-density.ts`
  (nouveau), `use-count-up.ts` (nouveau), `shell-types.ts`,
  `SupplierPOsDialog.tsx`, + `license-manager/renderer/App.tsx`,
  `mobile/src/{App,Home,i18n}.tsx/ts` (Phase 2).
- **Docs** : `ADR-080`, `ADR-081`, `ADR-082`, `ADR-083`, `INDEX.md`.
- **Rebuildés (git-ignorés ou release/)** : `dist*/`, `release/` (4 exe +
  blockmaps + SHA256SUMS).

## 4) Erreurs découvertes (12 oct)

### Fermées (40+)

P1 : preload payload (recherche+rotation clé mortes), JSON.parse JSX,
startup sans catch, restore `selected` périmé, `standing_*` bruts,
`professional` brut, `use-license` silencieux · P2 : SearchField/Select
bruts, aria-label loupe, 8× catch silencieux, 10× `key={i}`,
MiniTable non-sticky, `createdAt` backups, `onConfirm` non-attendu,
double IPC recherche, preload hors حراسة, `licenseStatus` CREATE
contradictoire, labels sans `htmlFor`, `appInfo` mort, PRESETS sans
parity, endpoint mobile non-câblé, clés i18n/`STITCH` mortes, `:8100`
refusé par validate-env, stale-closure langue, `grant()` sans catch,
`key={p.name}`, `onEndReached` sans seuil · Design : `◌` Unicode,
toasts/modals sans mouvement, sélection/caret par défaut, total
PayDialog timide, liste Manager illisible, impayés invisibles (Mobile),
barre crédit continue, `bg-[#171207]`/`[#1c1113]` illisibles en clair.

### Ouvertes / assumées

1. **`installer.spec` jamais exécuté** : per-machine exige UAC élevé
   (skip documenté dans le spec lui-même, `:117-118`).
2. **`full-loop-client` exige relais `:8100`** (`e2e-mirror-relay.mjs`)
   - `PHONE`/`PIN` — non relancé cette session.
3. **Pas de remote/CI** : tags locaux uniquement (inchangé).
4. **Hex littéraux conservés** (`accent="#4edea3"`, `text-emerald-300`,
   `bg-[#1c1113]`, ~84 sites) : valeurs vérifiées = tokens ; migration
   partielle refusée (ADR-080, même rationale qu'ADR-075).
5. **E2E lent** : ~35-40 s/test (boot app) ; suite complète ≈ 25-30 min ;
   timeout 20 min insuffisant (pas un hang — prouvé par specs unitaires).
6. **`handoff.md` racine** : conservé (fichier de travail actif).
7. **Dette restante** : APK EAS (placeholders), specs E2E manquantes
   (11 specs), dû mobile soldé sauf Kit/annonces, harness hors périmètre.
8. **50 fichiers non commités** : en attente de revue + tag opérateur.

## 4bis) Session §15 — audit dead-code Phase A + lot 1 (2026-10-18)

**Livrable** : `docs/reports/DEAD_CODE_AUDIT_2026-10-18.md` (Phase A, rapport
seul, zéro suppression) puis **lot 1 exécuté** sur autorisation opérateur
(« fais un plan et corrige radicalement »).

**Méthode** : `npx --yes knip` (219 candidats) + `npx --yes depcheck` +
`graphify` (6011 nœuds) ; chaque candidat revérifié par recherche exhaustive
avant toute suppression. 4 sous-agents `explore` en lecture seule ont couvert
`src/`, `electron/`, `tests/+scripts/+racine+dépendances`,
`license-manager/+mobile` ; la couche IPC à 3 niveaux (définition → preload →
appel renderer) a été vérifiée directement (les deux voies : wrapper
`api.*` **et** appel direct `call((a) => a.<ns>.<méthode>())`).

**Bilan** : 219 bruts → **212 faux positifs réfutés**, **47 findings réels**
(6 critiques · 31 sûrs · 6 « décision » · 2 hygiène).

**Supprimé (lot 1 — ADR-118)** : 21 fichiers, **148 lignes supprimées /
3 ajoutées** (commentaires devenus faux). `electron/` : alias
`clearCartDrafts`, `sumRemaining`, `expirationDate`, `LICENSE_SIGNATURE_ALG`,
`EXPIRING_CRITICAL_DAYS`, `sha256Hex`, `clearIntegrityCache`,
`clearFingerprintCache`, `setSecretBackendForTests`, réexport `TemplateRender`.
`src/` : 15 exports morts (thème/densité, `ModuleId`, `clampRetentionCount`,
`CLIENT_PIN_LENGTH`, `DebtAgingInput`, `agingBucketLabelFr`, `OcrDocumentKind`,
5× staff, `assertReceivableQuantity`, `ItemCondition`, 2× licence,
`CustomerDrawerState`). Tests : `acceptNextConfirm`, entrée dupliquée du
guard IPC. Dossiers : `src/shared/validation/`, `electron/database/migrations/`.

**Import orphelins retirés** (sinon `tsc -b` échoue, `noUnusedLocals`) :
`createHash` + `LICENSE_CRITICAL_DAYS` (`licensing/protocol.ts`).

**Portes avant → après** : `tsc -b` 0 → **0** · `eslint --max-warnings 0` 0 →
**0** · `vitest` **804 → 804** (121 fichiers, aucune perte) · `build` ✓ → ✓ ·
`build:electron` ✓ → ✓ (manifeste signé 214 fichiers) · `verify:migrations`
VERIFIED → **VERIFIED** · `verify:domain` VERIFIED → **VERIFIED** ·
`graphify update` OK (6011 nœuds / 16430 arêtes).

**Contrats gelés INTACTS** : `IPC_CHANNELS` (180), snapshot `ipc-channels.json`
(180), `FROZEN_SCHEMA_COUNT` (114), `operation-id-coverage` (R1). Les gardes
`bridge-shape` / `ipc-channel-inventory` / `validators-inventory` n'ont pas
été modifiées.

**Pièges écartés (ne pas « nettoyer »)** :

- `recovery.retry`/`recovery.exit` : appelés depuis le HTML **main**
  (`recovery-view.ts:95,100`, `license-view.ts:95`) — faussement morts.
- `bindings` : arête runtime transitive exigée par `better-sqlite3` (ADR-005).
- `mobile/**` + `license-manager/**` : points d'entrée Expo/electron-builder.
- `clearCartDraftsAtomic`, `CODE39/128*`, `STAFF_KDF_*`, `PIN_KDF_*`,
  `license/catalog.ts` : **test-only mais gardés** (couverture métier réelle,
  ADR-075 déjà tranché).

**Différé / à arbitrer** :

- **Lot 2 (ADR-119) — EXÉCUTÉ (§16)** : 3 canaux retirés (`sync.markSent`,
  `sync.pending`, `stock.ledger`) + 3 fonctions repo orphelines
  (`markOutboxSentAtomic`, `listPendingOutbox`, `Inventory.getLedger`).
  Snapshot 180 → **176** ; `FROZEN_SCHEMA_COUNT` 114 → **113**.
  `pushNowAtomic` marque la file `'sent'` lui-même (`sync.service.ts:263-270`)
  → les 2 canaux `sync.*` sont **supersédés techniquement**, pas « UI
  manquante ». La garde `retention` protège par **préfixe** `"sync."` → elle
  reste correcte ; le vecteur fantôme `"sync.markSent"` de
  `retention-critical.test.ts` a été retiré.
  **Conservés** : `announcements.save` (domaine+repo+validateur complets,
  seule l'UI manque → décision **produit**, pas du code mort) ;
  `templates.get` + `printer.get` (**hors périmètre** : schéma dans
  `validators.templates.ts`, handler dans `printing.receipt.ts` → fichiers du
  chantier impression non commité).
- `printer.get` + 24 réexports morts de `receipt-documents*` : **dans la zone
  du chantier impression non commité**, donc différés.
- `knip.json` + workspace `mobile` : ~95 % de faux positifs en moins pour un
  fichier de config, zéro changement de code.
- `RAW_GUARDED_CHANNELS` non appliqué (`ipc/raw-guards.ts:31`) ; garde
  `bridge-shape` ne couvrant que les noms `*Schema` (d'où la survie de
  `expirationDate`) ; `DT-03` : le validateur `expirationDate` **câblé** est
  le plus laxiste des deux.

**⚠ Dette de couverture** : `mobile/` n'est couvert par **aucun tsconfig**
(`typecheck` racine et `typecheck:manager` l'ignorent) ; seul `vitest` garde.

## 4ter) Session §16 — lot 2 : canaux IPC morts + `knip.json` (2026-10-19)

Autorisation opérateur : « fais un plan et corrige radicalement » puis
« tu as les permissions ». **Lot 1 déjà commité** (`20a705b`, ADR-118).

**Lot 2 (ADR-119)** — 3 canaux IPC retirés, sur les 6 candidats du rapport :

| Canal           | Handler                     | Fonction repo orpheline retirée                  |
| --------------- | --------------------------- | ------------------------------------------------ |
| `sync.markSent` | `registry.customers.ts:163` | `markOutboxSentAtomic` (`client-access.repo.ts`) |
| `sync.pending`  | `registry.customers.ts:170` | `listPendingOutbox` (`client-access.repo.ts`)    |
| `stock.ledger`  | `registry.stock.ts:14`      | `Inventory.getLedger` (`inventory.repo.ts`)      |

**Le fait qui tranche** : `pushNowAtomic` marque la file `'sent'` **lui-même**
dans sa transaction (`electron/sync/sync.service.ts:263-270`) et lit
lui-même les lignes `pending` (`:212-216`) → les 2 canaux `sync.*` sont
**supersédés techniquement**, pas des fonctionnalités à interface manquante.
`listPendingOutbox` était d'ailleurs explicitement étiqueté « pour le **futur**
agent de synchro » — un futur agent qui existe déjà (`pushNow`).

**Gardes synchronisées** : snapshot `ipc-channels.json` **180 → 176** ·
`IPC_CHANNELS` 180 → **177** clés (176 servis + `window.maximizedChanged`
push-only) · `FROZEN_SCHEMA_COUNT` **114 → 113** (`syncPendingSchema`) ·
vecteur fantôme `"sync.markSent"` retiré de `retention-critical.test.ts` ·
import + assertion `syncPendingSchema` retirés de `client-access.test.ts` ·
commentaire `retention.ts:42` corrigé (la garde protège par **préfixe**
`"sync."` → elle reste correcte : `sync.enqueue`/`pushNow`/`saveConfig`
subsistent).

**Conservés, et pourquoi** : `announcements.save` (domaine + repo + validateur

- handler **complets**, seule l'UI manque → décision **produit**) ·
  `templates.get` et `printer.get` (leurs fichiers sont dans le **chantier
  impression non commité** → mélanger deux chantiers dans un commit est
  interdit, AGENTS.md §10).

**Portes avant → après** : `tsc -b` 0 → **0** · `typecheck:electron` ✓ → ✓ ·
`typecheck:manager` ✓ → ✓ · `eslint --max-warnings 0` → **exit 0** ·
`vitest` **804 → 804** (121 fichiers) · `build` ✓ → ✓ · `build:electron` ✓ → ✓
· `verify:migrations` VERIFIED → **VERIFIED** · `verify:domain` VERIFIED →
**VERIFIED** · `graphify update` ✓.
**Gardes de contrat rejouées en isolation** : 37 assertions — `bridge-shape`
3/3 · `ipc-channel-inventory` 2/2 · `validators-inventory` 2/2 ·
`operation-id-coverage` 2/2 · `channel-alias` 4/4 · `client-access` 24/24.

**`knip.json` ajouté** (zéro changement de code) : candidats bruts
**219 → 30**, `Unused files` **32 → 0**. La clé décisive est
`ignoreExportsUsedInFile: true` : le dépôt exporte massivement des règles
pures consommées **dans leur propre fichier**, usage que knip ne comptait pas.
Les 27 `unused exports` restants sont **exactement** les findings vérifiés
manuellement (24 réexports `receipt-documents*` + `buildActivationQrPayload` +
`clearSecureState`) → **plus aucun faux positif résiduel**.

**Nouvelle trouvaille mobile** : `expo-constants` est déclaré dans
`mobile/package.json:23` mais **n'est importé nulle part** dans `mobile/src`.
Non supprimé : la correction exige `mobile/package-lock.json`
(**lockfiles intouchables**, consigne 3).

## 5) En attente (next actions)

> **Priorité 2026-10-19 (§18)** : le plan de remédiation
> `docs/reports/FULL_AUDIT_2026-10-19_PLAN.md` (11 vagues W0→W10) prime sur
> les items ci-dessous, qui y sont repris (Q1→Q20). **Prochaine action
> attendue : approbation du propriétaire sur (a) ADR-120, (b) Q5 (chantier
> impression : commit ou stash), (c) la vague W1 (logique financière).**

- [ ] **Lot 2 bis** : `templates.get` + `printer.get` + les 24 réexports morts
      de `receipt-documents*` — **nécessite le commit du chantier impression**
      d'abord (zone de chevauchement stricte). _(→ vague W6 du plan)_
- [ ] **`announcements.save`** : décision produit — construire l'UI des
      annonces magasin, ou retirer le canal + domaine + repo. _(→ Q1)_
- [ ] **`expo-constants`** : dépendance `mobile` inutilisée (retrait soumis à
      mise à jour du lockfile mobile). _(→ Q3)_
- [x] ~~**`docs/INDEX.md`** : étendre au-delà de ADR-103 (118 + 119 à ajouter)~~
      — **fait le 2026-10-19** : l'index était déjà complet jusqu'à ADR-119
      (l'affirmation « jusqu'à 103 » de l'ancien §1 était fausse) ; ADR-120
      et les 2 rapports d'audit y ont été ajoutés.
- [ ] **Revue + tag** de l'arbre checkpointé (HEAD `fec3acf`, §11) —
      proposition : tag local `v1.0.0-session-1018` après revue.
- [ ] **Session admin** : `installer.spec` (UAC) — seul gate jamais vert.
- [ ] **Relais + full-loop-client** : `node scripts/e2e-mirror-relay.mjs`
      puis spec client (PHONE/PIN).
- [ ] **Remote** : dépôt distant + push + CI (`.github/workflows/ci.yml`
      prête) ; alternative `git bundle` USB.
- [ ] **APK** : compte EAS + `eas.json` réel (placeholders refusés).
- [ ] **Phase design restante** : D2 sticky Mobile ? non — reste D5
      Mobile ? non. Reste : D15 soleil (contraste), D16 Mobile (compte),
      D3 presets ? — revoir liste §D (propositions 25-36, D15/D16 mobiles
      non faits).
- [ ] **Propositions fonctionnelles 1-36** : vagues à prioriser
      (irrigation directe : 15, 27, 14, 23).

## 6) Commandes

```powershell
npm run dev:electron          # dev (build electron + electron .)
npm test                      # vitest (661)
npm run test:e2e               # Playwright (electron.launch, workers:1, ~30 min total)
npx playwright test tests/e2e/sale-flow.spec.ts   # fumée rapide ciblée (~3 min)
node scripts/e2e-mirror-relay.mjs            # relais :8100 (prérequis full-loop)
npm run verify:migrations && npm run verify:domain && npm run verify:perf
npm run build && npm run build:electron      # TOUJOURS couplés (manifest, sinon e2e "tampered")
npm run package:win && npm run package:manager  # OK sans admin SI Developer Mode (reg AllowDevelopmentWithoutDevLicense=1)
npm run release:smoke && npm run release:checksums
npm run license:scan          # secrets (prepackage)
git tag -a vX -m "..."        # tags locaux (pas de remote)
```

Données test réutilisables (isolation par run) : client `0555123456` / PIN
au choix (6 chiffres) · service-key e2e `e2e-service-key-0123456789` ·
anon JWT `role:anon` (voir full-loop-client.spec.ts).

## 7) Règles à garder (AGENTS.md, résumé)

1. SQLite seule source métier · 2. Renderer = `window.veloria` uniquement ·
2. Pas de `run-sql`, canaux `domain.action` + Zod · 4. Centimes DZD + 1 tx +
   `operationId` · 5. Domaine sans framework, prepared statements ·
3. UI 100 % FR (mobile AR/FR), erreurs FR + log · 7. Tranches verticales ·
4. format → typecheck → tests → build · 9. better-sqlite3 vs Electron 37 ·
5. ADR-\*.md + INDEX · 11. Migrations IMMUABLES + verify vert ·
   12-13. Skill-first + routage (db/slice/ui-fr, impeccable+craft-floor
   avant tout edit UI, audit-avant-suppression, dragon si aucun match).
   Nouveaux : craft-floor refuse `border-left` coloré / anneaux décoratifs /
   `◌`-Unicode / cartes fantômes — reformuler, pas adoucir.

## 8) Pièges rencontrés (ne pas répéter — ajouts 12 oct)

- `build` renderer seul invalide le manifest → e2e licence `tampered` ;
  toujours enchaîner `build:electron` (re-confirmé 2026-10-18 : manifest
  re-signé 213 fichiers, E2E reparti).
- Toasts empilés (4,5 s) : drainer avant lecture du toast suivant.
- `getByLabel` matche aussi les `aria-label` des boutons (ex. nav) → préférer
  `title=` ou `data-path` si collision.
- thead sticky + `min-w-[1240px]` : clic ligne → bouton `Voir …` + scroll
  explicite ; `scroll-margin` global dans `globals.css`.
- `exactOptionalPropertyTypes` : `ref` par spread conditionnel.
- PowerShell 5.1 : pas de `sed/grep/tail` → outils `read/grep` natifs ;
  `Select-String` sans `-Recurse` ; chemins avec espaces entre `"..."`.
- `test-only-allow-expired.cjs` DOIT suivre `buildSecureStateV2` (H-3).
- QR V2 exige URL+anon configurés AVANT l'activation (ADR-068).
- e2e fenêtrage : écran < 1600×900 → démarrage maximisé (skips dédiés).
- **NOUVEAU** : `Select-String ... | Select-Object -Last N` bufferise tout
  jusqu'à la fin — en cas de timeout, zéro sortie (ce n'est pas un hang) ;
  rediriger vers fichier (`> $env:TEMP\x.log`) + lire le fichier.
- **NOUVEAU** : E2E ≈ 35-40 s/test (boot) → prévoir ~30 min ; valider par
  spec ciblée (`sale-flow`, `window-chrome`) avant la suite complète.
- **NOUVEAU** : `Set-Content` peut ré-encoder (mojibake) — vérifier
  `git diff` après toute réécriture hors `edit`.
- **NOUVEAU** : `edit` exige l'indentation exacte — en cas d'échec,
  afficher les espaces (`-replace ' ', '.'`) avant de réessayer.
- **NOUVEAU** : winCodeSign passe SANS admin si Developer Mode = 1
  (`mklink` cmd OK même si `New-Item` PS exige l'élévation) ;
  `signAndEditExecutable=false` reste INTERDIT (ADR-070).
- **NOUVEAU** : `noUncheckedIndexedAccess` — `split().map(Number)`
  donne `number|undefined` (garde explicite exigée).
- **NOUVEAU** : utilitaires Tailwind vs classes CSS perso en conflit de
  taille → une seule source (ex. `font-mono-currency-*` SANS `text-*`).
- **NOUVEAU (18 oct)** : `graphify update .` peut sortir code 1 APRÈS un
  update réussi (tip watch) — vérifier la sortie, pas le code retour.
- **NOUVEAU (18 oct)** : douchette E2E = rafale ≤ 60 ms → idle 90 ms
  (ADR-116) ; ne pas remonter `TEXT_IDLE_MS` (220 ms, frappe humaine),
  les specs « scan sans Entrée » en dépendent.
- **NOUVEAU (18 oct)** : `git commit` embarque TOUT l'index — un arbre
  multi-sessions peut avoir des fichiers PRÉ-STAGÉS (`D `/`RM ` dans
  `git status --short`) ; vérifier/stager par chemins avant commit.
- **NOUVEAU (18 oct ter)** : ne JAMAIS lancer un script GUI
  `npx electron script.cjs` pendant que le POS tourne (crash renderer de
  l'instance POS) — requêtes DB dev : `ELECTRON_RUN_AS_NODE=1 npx electron
script.cjs` (better-sqlite3 = ABI Electron ; `node` système échoue).

## 9) Archive session 2026-10-07 (topnav + Manager icon, ADR-072/073)

TopBar fusionné + Sidebar compacte horizontale + horloge fr-DZ 24h + mode
clair CSS-only + icône Manager (`resolveManagerIcon`). Vérifié + rebuildé ;
screenshots `docs/shots/pos-*.png`. Restes : sign-off visuel demandeur,
`test:e2e` packagé, Manager UI + APK refonts en attente, `graphify update .`
impossible (CLI absent).

## 10) Session 2026-10-12 (correctifs radicaux + design Phases 1-3)

- **Déblocage packaging** : Dev Mode → 4 exe signés + SHA256SUMS (×2
  rebuilds : après correctifs, après design).
- **Audit → 0 P0 / 7 P1 / ~25 P2** (3 sous-agents, findings vérifiés
  manuellement, dettes réfutées documentées en §4.7).
- **Correctifs** : 18 Manager + 13 POS + 9 Mobile + 2 tests
  (parity + fixture P0-4) — auteur mixte (sous-agents Manager/Mobile
  relus via `git diff`, POS en direct).
- **Design** (direction « دفع جريء محسوب », impeccable+craft-floor) :
  Phase 1 fondations, Phase 2 surfaces, Phase 3 profondeur
  (D5 densité, D6 épinglés ★, D2 sticky, D16 `useCountUp`, D8 clair).
- **État final** : 661/661, E2E 24/24, eslint 0, manifests signés,
  release/ frais, 50 fichiers en attente de revue/commit/tag.
- **Correctif jour (même date)** : écriture invisible en thème clair —
  pastels (`amber/emerald/red/sky-200/300`), variantes `/60-/80`,
  placeholder beige, `bg-black/40`, `hover:text-white` : tous mappés
  (contrastes AAA) ; preuve par captures E2E (`test-results/light-*`,
  git-ignorées, spec temporaire supprimé).

## 11) Session 2026-10-18 (scan douchette sans Entrée — ADR-116)

- **Demande opérateur** : le scan doit ajouter au panier SANS presser
  Entrée (et, pour les unités continues KG/G/L/ML/CL/M, ouvrir le dialogue
  quantité-ou-montant — déjà livré en ADR-114).
- **Constat** (3 reproductions E2E réelles) : l'ajout sans Entrée existait
  (debounce 220 ms ; Entrée en fin de rafale = no-op) mais deux failles —
  latence fixe 220 ms, et deux scans < 220 ms d'écart se CONCATÈNENT
  (`CODE1CODE2`) → « Code-barres inconnu », zéro ajout.
- **Fix ADR-116** : cadence machine = frappes ≤ 60 ms
  (`SCAN_BURST_GAP_MS`, aucun humain) → idle 90 ms (`SCAN_IDLE_MS`) si
  texte code-barres ; frappe humaine inchangée 220 ms (`TEXT_IDLE_MS`).
  Refs `lastKeyAtRef`/`scanBurstRef` (`useSellState`), décision pure
  `searchIdleMs` (sell-search).
- **Tests** : unit sales 69/69 (4 nouveaux : searchIdleMs, rafale/humain/
  texte) ; E2E `scan-flow` **6/6** — 3 nouveaux (sans Entrée focus champ ;
  sans Entrée focus perdu ; 2 scans à 180 ms → 2 lignes), ×2 passes
  stables ; vitest complet **795/795** ; eslint 0 ; `verify:*` VERIFIED.
- **Piège re-vécu** : `npm run build` seul → manifest licence « tampered »
  à l'import E2E ; `build:electron` re-signe (213 fichiers) — séquence
  obligatoire.
- **Git** : `734a69c` (purge harness) + `fec3acf` (checkpoint 295 fichiers
  = backlog ADR-080→115 + cette session ; scratch `check_like.py` /
  `full-inventory.txt` git-ignorés) + commit `docs(handoff)` de ce §11.
- **Restes** : revue + tag opérateur ; suite E2E complète, packaging,
  typecheck manager/mobile non relancés cette session.

## 12) Session 2026-10-18 bis (politique opération → format d'impression — ADR-117)

- **Demande opérateur** : cantonner le format d'impression par opération —
  vente / règlement / retour / bon de livraison / bon de commande fournisseur
  → **ticket 58/80 uniquement** ; devis → **A4 uniquement** ; étiquettes →
  tous gabarits adhésifs SAUF A4. Le 58 vs 80 reste le réglage
  imprimante/modèle existant (aucun sélecteur au moment d'imprimer).
- **Décisions (ADR-117)** : A4 banni de TOUT document de vente (historique,
  fiche client, dettes, aperçus + exports) ; devis ticket 80 mm supprimé ;
  canaux IPC `printing.printA4`, `printing.exportA4Pdf`,
  `printing.printProforma80mm` supprimés (30→27) ; constructeurs A4 de vente
  purgés (`receipt-a4.ts` supprimé, `buildA4Html`, `buildProformaText`,
  `buildPaymentTicketA4Html`, …) ; type doc `facture` retiré du Studio/Zod
  (6 types : ticket, proforma « Devis A4 », bon_livraison, recu, avoir,
  etiquette) ; papier A5 + gabarit `A4-24` retirés ; `pageAtRule` (chrome)
  toujours A4 ; Zod 116→114 ; étiquettes : microns non nuls
  (`labelFormatSchema` défaut `45x20`, limite 200 conservée),
  `exportLabelsPdf` → « etiquettes.pdf » ; capacités de licence historiques
  (ex. `invoice-a4`) conservées (concepts de licence) ; `autoPrintInvoice`
  inchangé (auto-impression = ticket). **Aucune migration** : 0036 immutable
  (ligne `facture` orpheline inoffensive ; `TEMPLATE_DOC_TYPES` ne la
  réinitialise plus) ; papier legacy invalide → miroir Zod = défauts
  complets (accepté).
- **E2E réparés au passage** (casse PRÉEXISTANTE — refonte recherche
  liste ADR-114 + porte session 0041 arrivées dans `fec3acf` sans mise à
  jour des specs) :
  - 7 specs : sélecteur résultat produit `getByRole("button")` →
    `getByRole("option")` (`SellSearchPanel`) — customer-invoice ×2,
    credit-return ×2, sale-flow ×2, pdf-export, restart, full-loop-client.
  - `restart` : placeholder historique périmé → `getByLabel` (libellé
    courant « Rechercher dans l'historique … »).
  - `license-activation` : franchit la porte session (`staffLoginIfNeeded`)
    après l'import externe + redémarrage — 4/4 vertes.
  - `factory-reset` : l'instance `app.relaunch()` (non pilotable par
    Playwright) bootstrappait la porte et consommait le code initial
    (affiché UNE fois, jamais en clair) → perdu pour la relance du harnais.
    Fix : boucle de frappe qui la tue AVANT son bootstrap (~5 s), puis
    relance pilotée — 2/2 stables.
  - `helpers.ts` : capacité `proformas` ajoutée (exigée par
    `exportProformaPdf`) ; commentaire `autoStaffLogin` à jour.
- **Preuves** : vitest **794/794** (121 fichiers ; snapshot IPC 27 canaux) ;
  `tsc -b` 0 (213 fichiers) ; eslint 0 ; prettier OK ; `build` +
  `build:electron` + manifest signé (213 fichiers) ;
  `verify:migrations`/`verify:domain` VERIFIED ; **13 specs E2E : 12/13
  vertes** (seul `installer` non exécutable — paquet Win requis), dont
  `pdf-export` réécrit (ticket 80 via `exportReceiptPdf` + devis A4 via
  `exportProformaPdf` + assertions négatives de purge des canaux) et
  `full-loop-client` avec relais `:8100`.
- **Pièges pour la suite** : ne jamais éditer une migration appliquée
  (0036 garde sa ligne `facture` — CHECK) ; tout nouveau test E2E caisse :
  résultats produit = `role="option"`, porte session = `staffLoginIfNeeded`
  (défaut du harnais), restart = relance pilotée après kill des instances
  auto-relancées ; `dist`/`dist-electron` doivent être rebuildés APRÈS tout
  changement src (build + `build:electron` re-signe le manifest).
- **Git** : `860c11a` (72 fichiers, ADR-117 + purge A4 + E2E) +
  commit `docs(handoff)` de ce §12. Tag opérateur à proposer :
  `v1.0.0-format-ops` après revue.

## 13) Session 2026-10-18 ter (lancement POS opérateur)

- **Demande opérateur** : « شغل pos و فعله » — lancer le POS et
  (licence) l'activer. Aucun changement de code.
- **Actions** : sources plus récentes que `dist-electron` (17 oct) →
  `npm run build` + `npm run build:electron` (manifest re-signé, 213
  fichiers, 18 oct 21:0x) ; `npm run verify:licensing` → **ACTIVE**
  (licence locale déjà importée, clé embarquée vérifiée) ; lancement
  `npx electron .` : `startup.ready` mode main ≈ 6,6 s, DB
  `C:\ProgramData\Veloria PoS\Data\Veloria POS DB.sqlite` schema 47,
  backup auto créé, porte session staff affichée (1 utilisateur :
  `admin` / « Gérant », role manager, actif).
- **Piège vécu (nouveau)** : lancer un script GUI `npx electron
script.cjs` PENDANT que le POS tourne → `renderer.gone reason
crashed` + crash GPU/service réseau de l'instance POS (2ᵉ lancement
  propre OK). Pour requêter la DB en dev sans GUI :
  `$env:ELECTRON_RUN_AS_NODE="1"; npx electron script.cjs` (better-sqlite3
  est compilé ABI Electron — `node` système échoue en
  NODE_MODULE_VERSION 136≠127).
- **Git** : arbre propre avant/après (builds git-ignorés) ; seul ce
  §13 + §8 commités (`docs(handoff)`).

## 14) Session 2026-10-18 quater (préparation du prompt d'audit dead-code)

- **Demande opérateur** : « برومبت احترافي » pour un audit complet des
  codes morts — aucun changement de code ; livrable = prompt prêt à
  coller, remis dans le chat (seul ce §14 est committé).
- **Prompt préparé** : audit-first (AGENTS §13/§14 + ADR-075) ;
  périmètre repo entier (src, electron, license-manager, mobile, cloud,
  private, tests, scripts, racine) ; knip/ts-prune/depcheck + repli rg ;
  vérification IPC 3 couches (channels ↔ preload ↔ renderer) + gardes
  `bridge-shape`, `ipc-channel-inventory`, `validators-inventory` ;
  rapport `docs/reports/DEAD_CODE_AUDIT_<date>.md` ; suppressions par
  lots APRÈS approbation explicite, portes format→typecheck→lint→tests→
  build + `graphify update` + handoff + commit par lot.
- **État arbre** : chantier impression en cours non commité (11 M :
  `validators.templates.ts`, `printing.receipt.ts`,
  `printing.templates.ts`, `receipt-documents*.ts`, `thermal.ts`,
  `template-rules.ts` ; 2 nouveaux : `printing.capabilities.ts`,
  `template-capabilities.ts`) — laissé intact, NON touché ici ; à
  committer par sa session dédiée après portes vertes.
- **Complément (même session)** : recommandation du modèle gratuit pour
  l'audit — `opencode/space-bunny-free#max` (1M ctx, zero-retention) ;
  alternatives `longcat-2.5-preview-free`, `beam-free#max`,
  `deepseek-v4.1-flash-free#high` ; à éviter pour du code confidentiel :
  Nemotron free (trial NVIDIA loggé), MiMo / Big Pickle. Sources :
  catalogue `tools.opencode.models` + models.dev + docs Console.
- **Git** : commits `docs(handoff)` explicites sur `handoff.md` uniquement
  (les fichiers du chantier impression restent dans l'arbre, non
  touchés).

## 17) Session 2026-10-19 quinquies (prompt d'audit intégral — 16 axes)

- **Demande opérateur** : « درس المشروع واكتبلي برومبت احترافي وصارم يقوم
  بفحص المشروع من كل أنواع المشاكل والأخطاء والأكواد الميتتة وغير المكتملة
  والزائدة وكل شيء، يعطيني تقرير شامل ومفصل وخطة إصلاحية جذرية » →
  livrable = **un prompt** à coller dans une session neuve. **Aucun changement
  de code métier** dans cette session.
- **Étude préalable du dépôt** (avant rédaction) : `AGENTS.md`, `handoff.md`
  (§1→§16), `package.json` (24 scripts), `eslint.config.mjs`,
  `knip.json`, `docs/STRUCTURE.md`, `docs/INDEX.md`, `docs/ADR-001..119`,
  `docs/reports/DEAD_CODE_AUDIT_2026-10-18.md` (ADRs 075/118/119), arborescence
  `src/` `electron/` `tests/` `scripts/` `docs/` `license-manager/` `mobile/`
  `cloud/` `database/`, `tests/unit/` (85 fichiers de garde), `electron/ipc/`
  (24 canaux + 47 validateurs + 20 repos).
- **Livrable** : `docs/prompts/AUDIT_PROMPT_2026-10-19.md` (1080 lignes / 83 Ko).
  Structure : §1 contexte obligatoire (identite projet + 14 regles + gates +
  etat courant + pieges) · §2 livrables (3 fichiers) · §3 **10 regles de
  comportement strict** (audit-first, preuve obligatoire, classification de
  confiance, interdiction lockfiles/migrations, interdiction `--fix` pendant
  l'audit) · §4 **8 phases** (baseline → carte graphify → statique →
  dynamique → parite → securite → produit → synthese) · §5 **16 axes**
  (A→P) + **19 playbooks de domaine** (P1→P19 : caisse, paiements,
  stock/FIFO, clients/dettes, fournisseurs, retours, depenses, zakat/
  clotures, rapports, impression/PDF, OCR, licences, sync/cloud, backup/
  migrations, staff/PIN/RBAC, mobile, manager, scripts, packaging) +
  **matrice de couverture des artefacts** (type de fichier → controle →
  outil → preuve) + **politique de preuve et d'echantillonnage** ·
  §6 outils (knip, depcheck, ts-prune, madge, dpdm, jscpd, semgrep,
  gitleaks, osv-scanner, ast-grep, betterer, lizard, scc, npm audit) +
  cheatsheet de commandes + regles anti-false-positives · §7 **gabarit de
  rapport** (13 sections) · §8 **gabarit de plan** (vagues W0→W9) ·
  §9 livrables finaux · §10 **DoD** (14 points) · §11 style d'execution
  (explore/db-guardian/ui-fr/general) · §12 **echelle de severite +
  calcul de risque** (Impact × Likelihood → P0..P3) + definition P0
  Veloria · §13 **scenario d'execution** (5 phases + ordre des vagues +
  regle d'arret) · §14 **10 questions proprietaire** (Q1→Q10 avec defaut
  propose) · §15 **gabarits pret-a-l'emploi** (ADR en francais + messages
  de commit + entree handoff + checklist PR) · §16 **liste de deverrouillage
  des contrats figes** (snapshot IPC, FROZEN_SCHEMA_COUNT, operation-id
  coverage, manifeste, migrations) · §17 **profondeurs S/M/L**.
- **Chiffres re-vérifiés avant écriture** (écarts vs skills/docs signalés
  dans le prompt lui-même) : migrations = **47** (`0047_customer_search_norm.sql`)
  et non 0036 comme l'affirme le skill `veloria-db` ; `knip` 219→30 avec
  `Unused files`=0 ; 20 M + 3 nouveaux non commités (chantier impression) ;
  `RAW_GUARDED_CHANNELS` non appliqué (`electron/ipc/raw-guards.ts:31`) ;
  `bridge-shape` ne couvre que `*Schema` ; `docs/INDEX.md` s'arrête à ADR-103
  alors que 118/119 existent.
- **Pièges consignés dans le prompt** : `rg` absent du PATH · PowerShell 5.1 ·
  `Set-Content` mojibake · `git commit` balaie l'index (staging par chemins) ·
  `build` seul invalide le manifeste licence · ABI `better-sqlite3` =
  `ELECTRON_RUN_AS_NODE=1 npx electron script.cjs` · `graphify update` peut
  sortir code 1 après succès · `noUncheckedIndexedAccess` +
  `exactOptionalPropertyTypes`.
- **État arbre** : chantier impression (20 M + 3 N) **laissé intact** ; seul
  `docs/prompts/AUDIT_PROMPT_2026-10-19.md` + `handoff.md` + `docs/INDEX.md`
  sont commités (staging par chemins explicites, AGENTS.md §10).
- **Prochaine étape proposée** : coller le prompt dans une session neuve →
  Phase 0 (baseline + mesure des gates) → Phase 1 (carte graphify) →
  rapport `docs/reports/FULL_AUDIT_2026-10-19.md` + plan
  `..._PLAN.md` → puis exécution des vagues **avec approbation par vague**
  (ADR-075 : jamais de suppression automatique).
- **Git** : commit `docs(audit): prompt d'audit integral 16 axes (audit-first)`
  sur `docs/prompts/AUDIT_PROMPT_2026-10-19.md` + `docs/INDEX.md`, puis
  commit `docs(handoff)` séparé sur `handoff.md` (arbre sale → pas de
  commit handoff « arbre propre », commit explicite par chemins).

## 18) Session 2026-10-19 sexies — audit intégral EXÉCUTÉ (0 correction de code)

- **Demande opérateur** : « أنت مهندس جودة وأرشيف (code archaeologist) بمستوى
  staff+، ومكلَّف بإجراء تدقيق forensic شامل ونهائي لمشروع Veloria PoS، ثم إنتاج
  تقرير مفصّل و خطة إصلاح جذرية مرتّبة على موجات (waves) قابلة للتنفيذ. لا تُصلح
  شيئًا في هذه المرحلة. مخرجك الأساسي هو معرفة مُثبَتة + خطة. » ⇒ **3 livrables
  obligatoires** : rapport (M1) + plan en vagues (M2) + ADR optionnel (M3).
- **Livrable** :
  - `docs/reports/FULL_AUDIT_2026-10-19.md` — rapport intégral, 16 axes A→P,
    **228 findings** classifiés, chaque finding avec `file:line` + extrait +
    commande de reproduction + étiquette de confiance (PROUVÉ / DYNAMIC-RISK /
    TEST-ONLY / DUPLICATE / DELIBERATE-KEEP / REFUTED) + §12 «مُستبعد»
    (21 réfutations prouvées).
  - `docs/reports/FULL_AUDIT_2026-10-19_PLAN.md` — **11 vagues W0→W10** avec
    chemins explicites, pas, gates, rollback, dépendances, timeline, DoD,
    registre de déverrouillage des contrats gelés, et **20 décisions owner**
    en attente (§4, Q1→Q20).
  - `docs/ADR-120-guardes-de-contrat-auto-derivees.md` — **proposé** (en attente
    d'approbation) : « les gardes qui ne peuvent pas échouer ne sont pas des
    gardes ».
  - Preuves brutes : `docs/reports/maintenance/audit-raw/` (12 fichiers, 340 Ko).
- **Chiffres (avant → après)** : findings **0 → 228** (0 Critical · 23 High ·
  95 Medium · 110 Low) · canaux IPC **177** (mesure exacte) · schémas Zod réels
  **120** vs `FROZEN_SCHEMA_COUNT` **113** · `formatDzd` en render **268** sites
  vs `formatDzdSafe` **16** · `mobile/src` non typechecké **13/22** ·
  `test:coverage` **EXIT=1** (18 dépassements) · U+FFFD **113** caractères dans
  **20** fichiers `electron/ipc/*` · canaux IPC morts **6 → 3**.
- **Portes** (baseline mesuré, arbre sale) : `tsc -b` 0 · `typecheck:electron` 0
  · `typecheck:manager` 0 · `lint` exit 0 · `vitest` 121 fichiers / 804 tests
  0 · `test:db` 0 (isolé) · `verify:migrations` VERIFIED · `verify:domain`
  VERIFIED · `verify:perf` VERIFIED · `license:scan` 0 · `format:check` 0 ·
  `build` ✓ · `build:electron` ✓ (manifeste 214 fichiers) ·
  **`test:coverage` EXIT=1 — porte rouge, NON corrigée (audit-first)**.
- **Contrats gelés** : **inchangés** (aucun canal, aucun compteur, aucun
  snapshot modifié). Le passage `FROZEN_SCHEMA_COUNT` 113→120 est **proposé**
  en W4 (pas exécuté).
- **État arbre** : chantier impression (20 M + 3 N) **laissé intact** ; seuls
  `docs/reports/FULL_AUDIT_2026-10-19*.md`, `docs/ADR-120-*.md`,
  `docs/reports/maintenance/audit-raw/`, `docs/INDEX.md` et `handoff.md` sont
  commités (staging par chemins explicites, AGENTS.md §10).
- **En attente** : 20 décisions owner (Q1→Q20 du plan) — notamment **Q5**
  (commit/stash du chantier impression), **Q7** (source de vérité de la
  dette), **Q9** (`RAW_GUARDED_CHANNELS` : test ou suppression), **Q11**
  (seuil de couverture de `src/features`), **Q12** (majeur Electron) —
  plus l'approbation d'**ADR-120**.
- **Pièges** : (1) `npm run lint` scanne `docs/**` ⇒ un `.mjs` déposé sous
  `docs/` casse la porte (`allowDefaultProject` = liste de 24 chemins) ; (2)
  `test:db` échoue si lancé en parallèle d'outils lourds (`hookTimeout` 10 s
  par défaut vs 47 migrations rejouées par `beforeEach`) ; (3) `format:check`
  échoue sur tout `.md` non passé par Prettier ⇒ passer Prettier sur les
  livrables ; (4) `npm run build` seul invalide le manifeste licence.
- **Git** : commit `docs(audit): audit integral 16 axes - 228 findings, 0
correction` sur `docs/reports/FULL_AUDIT_2026-10-19.md` +
  `docs/reports/FULL_AUDIT_2026-10-19_PLAN.md` + `docs/ADR-120-*.md` +
  `docs/reports/maintenance/audit-raw/` + `docs/INDEX.md`, puis commit
  `docs(handoff): session 2026-10-19 sexies - audit integral execute (baseline
gele)` sur `handoff.md` seul.

## 19) Session 2026-10-19 septies → 2026-10-20 (remédiation : vagues W1, W2, W3)

- **Demande propriétaire** : « قم بالاصلاحات الجذرية اللازمة » (faire les
  corrections radicales nécessaires) — exécution du plan d'audit vague par
  vague, avec approbation implicitement donnée pour les vagues déjà
  listées dans `docs/reports/FULL_AUDIT_2026-10-19_PLAN.md`.
- **Reprise de session** : la session « تدقيق Veloria PoS وخطة الإصلاح الجذري »
  (ouverte le 19/10 à 21:50) s'était interrompue au milieu de la vague **W3**
  (le commit W2 était posé, la migration 0048 était écrite mais jamais
  appliquée). W3 a été reprise depuis zéro : migrations, code main, UI,
  tests, portes, ADR.

### Vague W1 — logique financière (`0e900f1`)

- 7 High + 3 Low corrigés **sans migration** : E-20 (conversion devis remisé
  → vente : la remise globale est répartie sur les lignes, somme EXACTE au
  centime, `discount_type` reste `none` — ADR-121) · E-22 (clôture Z : espèces
  seules, dépenses `paid` seules, retours non annulés seuls) · E-23 (avoir >
  solde : plus d'ABORT technique, excédent reporté) · E-24 (source de vérité
  unique de la dette) · E-25 (annuler une vente encaissée supprime
  l'encaissement et remet le solde) · E-26 (correction de quantité journalisée
  en mouvement de stock) · E-27 (frais de livraison capitalisés dans le coût
  FIFO) · E-33 (historique : pas d'encaissements de ventes annulées) ·
  E-34 (arrondi monétaire « half away from zero » exact) · E-36 (zakat : la
  VRAIE fonction du domaine est appelée).
- Preuves : `docs/reports/maintenance/audit-raw/w1-gates.txt`.

### Vague W2 — sécurité, RBAC, contrats (`cd43aa2`)

- K-01 (`customers.accessQrSvg` exige `debts` : fuite du PIN client fermée) ·
  K-04 (`staffScope()` fail-closed : sans session, les lectures sensibles
  sont refusées) · K-05 (`database.optimize` protégé comme `database.reset`) ·
  A-09 (verrou « code à changer » appliqué aux 32 canaux bruts) ·
  A-04/A-05 (plus aucune erreur moteur brute vers l'opérateur) ·
  A-10/A-11/A-13 (`operationId` exigé sur `expenses.delete`,
  `backup.restore`, `database.relocate`) · A-17 **réfuté** (le confinement de
  `logo_path` existait déjà) · K-02/K-03 (License Manager packagé : pas de
  VITE_MANAGER_URL, `will-redirect`/`will-attach-webview` bloqués) ·
  G-15 (date calendaire impossible refusée par le Manager) · G-13 (la garde
  ESLint « pas d'arabe dans src/ » était **inerte** ⇒ remplacée par une porte
  réelle `verify:fr`, fail-closed) · G-21 (`typecheck:mobile`, `verify:fr`,
  `test:coverage` branchés dans le CI).

### Vague W3 — base de données et migrations (`833cea1`)

- **E-21 — verrou de période close** : migration `0048` (15 triggers
  `RAISE(ABORT)`) : une journée close devient **immuable** (ventes,
  encaissements, dépenses, retours, paiements fournisseurs). La seule issue
  est explicite : `closings.reopen` (nouveau canal, **gérant** uniquement,
  tracé en `audit_log` avec les montants d'origine, idempotent par
  `operationId`) + bouton « Rouvrir la journée » dans l'écran Rapports
  (gérants uniquement, confirmation explicite). Les messages des triggers
  sont mappés en FR dans `ipc-errors.ts` (sans quoi l'opérateur aurait vu
  « Une erreur inattendue est survenue »).
- **E-28 — unicité du téléphone client** : migration `0049` (2 triggers,
  comparaison sur les chiffres, miroir de `PHONE_DIGITS_EXPR`) + contrôle
  applicatif `assertPhoneAvailable` (création ET modification). Trigger et
  non index UNIQUE : un index UNIQUE échouerait sur l'historique (migration
  non applicable sur une base réelle) et interdirait la réutilisation d'un
  numéro porté par un client archivé.
- **E-31** : `paginationSchema.page` borné à 10 000 (`OFFSET` illimité
  interdit).
- **E-36** : les gardes deviennent **échecables** — `verify:migrations`
  assume 0045/0046/0047 (elles ne l'étaient pas) et ajoute les blocs
  0048/0049 + la **pureté de l'argent** (toute colonne `*_minor` est
  `INTEGER`) ; `verify:domain` vérifie que toute mutation IPC appelée
  depuis un registre est **dans une transaction** et **accepte un
  `operationId`** (59 mutations analysées, seuil de non-vacuitité = 40).
- **F-08** : la sonde de vérification d'une copie de base a des pragmas
  (`busy_timeout`, `foreign_keys`, `query_only`, `trusted_schema`).
- **Contrats modifiés** (ADR-122) : canaux IPC servis 176 → **177**
  (snapshot mis à jour) · `FROZEN_SCHEMA_COUNT` 113 → **114** (total réel
  120 → **121**) · migrations 47 → **49** (`0001..0047` IMMUABLES, 0048/0049
  **nouveaux**) · arête inter-features `reports>staff` ajoutée à la liste
  blanche du test A3 (`staff` est une feuille ⇒ zéro cycle).

### Portes (mesurées sur l'arbre sale, chantier impression non commité)

`format:check` 0 · `tsc -b` 0 · `typecheck:electron` 0 · `typecheck:manager`
0 · `eslint --max-warnings 0` exit 0 · **vitest 130 fichiers / 857 tests 0** ·
**test:db 36 fichiers / 162 tests 0** (isolé, sinon `Hook timed out`) ·
`verify:migrations` VERIFIED · `verify:domain` VERIFIED · `verify:perf`
VERIFIED · `license:scan` 0 · `build` ✓ (30.3 s) · `build:electron` ✓
(manifeste signé 217 fichiers). **`test:coverage` reste ROUGE (EXIT 1, 18
dépassements) — c'est l'objet de la vague W4.**

### Nouveaux tests (17 cas)

`tests/database/closing-period-lock.test.ts` (6) ·
`tests/database/customers-phone-unique.test.ts` (6) ·
`tests/integration/closing-reopen.test.ts` (5).

### En attente / à faire

1. **W4** (prochaine vague) : `test:coverage` EXIT 0 + gardes auto-dérivées
   (`validators.staff.ts` ⇒ `FROZEN_SCHEMA_COUNT` 114 → 121) + test
   d'énumération de `RAW_GUARDED_CHANNELS`.
2. **Q5 non tranché** : le chantier impression (20 M + 3 nouveaux) reste
   **intact et non commité** — commit ou stash ? (décision propriétaire).
3. **20 décisions owner** du plan (§4) encore ouvertes (Q1→Q20), dont Q6
   (avoir en cours), Q7 (source de vérité de la dette), Q17 (jour métier
   `Africa/Algiers`), Q19 (APK/EAS).
4. **ADR-120** (gardes de contrat auto-dérivées) toujours **proposé**, non
   approuvé.
5. **E2E à rejouer** avant tout tag : `staff-session` et `full-loop-client`
   (touchés par K-04 en W2) + le nouveau canal `closings.reopen`.
6. `verify:licensing`, packaging `release/` et `npm audit` (réseau) non
   relancés.

### Pièges de cette session

- `better-sqlite3` est compilé pour l'**ABI Electron** (136) : tout script
  Node qui l'importe échoue (`NODE_MODULE_VERSION 127`). Contournement :
  `ELECTRON_RUN_AS_NODE=1 npx electron script.cjs` — c'est aussi le moyen de
  lire la base `opencode.db` pour retrouver l'historique d'une session.
- Le console PowerShell affiche le UTF-8 en mojibake : ne jamais écrire un
  `.md` via `Set-Content` (le fichier serait corrompu). Écrire via l'outil
  d'édition ou un script Node en UTF-8, puis passer Prettier.
- Une arête inter-features nouvelle ⇒ **le test A3 échoue** : penser à mettre à
  jour `tests/unit/a3-organisation.test.ts` dans le même commit.
- `eslint` casse sur tout `.cjs`/`.mjs` déposé à la racine du dépôt (hors
  `allowDefaultProject`) : les scripts d'analyse temporaires doivent être
  supprimés avant de commiter.

### Git

`0e900f1` (W1) · `cd43aa2` (W2) · `833cea1` (W3) — 3 commits, staffage par
chemins explicites (le chantier impression n'a jamais été balayé). Le commit
`docs(handoff)` de cette section est séparé, conformément à AGENTS.md §10.

## 20) Session 2026-10-20 (bis) — remédiation : vague W4 (couverture + gardes)

- **Demande propriétaire** : « اكمل » (continuer) — exécution de la vague
  suivante du plan d'audit : **W4 — couverture et tests**.
- **État hérité** : W1/W2/W3 commitées (`0e900f1`, `cd43aa2`, `833cea1`),
  `handoff.md` à jour (§19). `test:coverage` était **ROUGE** (EXIT 1,
  18 dépassements de seuil sur 5 fichiers domain) alors qu'il est **dans le
  CI depuis W2/G-21** ⇒ le CI était cassé par la vague W2.

### Ce qui a été fait

- **Aucun seuil abaissé** : les seuils par fichier restent
  `statements 80 / branches 75 / functions 88 / lines 80` (`perFile: true`).
  La couverture est passée de **89,3 % → 95,63 %** des lignes et
  **82,04 % → 86,96 %** des branches, **100 %** des fonctions.
- **33 nouveaux tests** (`tests/unit/domain-rules-coverage.test.ts`) sur les
  règles domaine non testées : produit (fiche, codes-barres EAN), retours
  (`computeReturnLineTotal` / `validateReturnLines` — **jamais appelées**
  avant), fournisseurs (tous les plafonds de champs, soldes, paiement >
  dette), bons de commande (200 lignes, transitions, libellés FR), import CSV
  (prix/quantité invalides, doublon, en-tête, plafond 5 000, clients).
- **6 nouveaux tests OCR** + **bug de production corrigé** :
  `src/domain/ocr/parser.ts:86` — le quantificateur `{12,13,14}` est
  INVALIDE en JavaScript (3 valeurs ⇒ motif littéral) ⇒ **les codes-barres
  EAN-13/UPC-A n'étaient JAMAIS extraits** de l'analyseur de factures
  (seuls les codes à 8 chiffres passaient). Corrigé en `{12,14}`.
- **Gardes rendues auto-dérivées** (capables d'échouer) :
  `RAW_GUARDED_CHANNELS` (constante décorative ⇒ **appliquée** : scan
  complet de `electron/`, 34 canaux gardés, 5 exceptions documentées avec
  raison) · `FROZEN_SCHEMA_COUNT` 114 → **121** (`validators.staff.ts`
  inclus) · `bridge-shape` : **tous** les exports (127) au lieu des seuls
  `*Schema`, seuil gelé (127), 0 export mort, 8 schémas NESTED documentés ·
  `operation-id-coverage` : classification **complète** (43 REQUIRED +
  20 exceptions LWW + assertion « tout schéma non listé n'exige pas
  operationId ») · `ipc-channel-inventory` : `ocr.progress` push-only
  vérifié explicitement · `a1-p0-boundary` : le test creux (C-05) réécrit
  (date impossible **réellement** refusée) · `pin-kdf-parity` : parité
  **comportementale** (main + relais E2E + fonction Edge **exécutés**,
  condensats comparés ; constantes comparées numériquement) + parité KDF
  **équipe** ajoutée (elle n'existait pas).
- **4 tests « miroir » convertis à la production** (I-03) :
  `payment-receipt` (→ `getCustomerPaymentReceipt`), `operation-id`
  (→ `saveZakatCalculation`), `carts-drafts` (→ `save/load/clear`),
  `atomic-slices` (→ `receiveStockAtomic`). Un « miroir » réécrivait la
  logique de production dans le test : il restait vert même si la
  production était supprimée ou inversée.
- **Timeouts** : `hookTimeout` 10 s → **60 s** (chaque `beforeEach` rejoue
  49 migrations ⇒ 12 « Hook timed out » en exécution parallèle) ;
  `testTimeout` 15 s → **60 s** (la couverture instrumente tout le code :
  `client-loop` et `repair-hardening` dépassaient 15 s ⇒ faux négatifs).
- **CI** : `npm run test:coverage` était déjà présent (W2) mais ROUGE ⇒ il
  devient vert. `npm run verify:licensing` **non** ajouté (il vérifie l'état
  local du Manager — clé privée + `.vlic` importé — absent d'un runner :
  il resterait rouge ; c'est une porte post-release vendor, comme `package*`).

### Portes (arbre sale, chantier impression non commité)

`test:coverage` **EXIT 0** (95,63 % lignes · 86,96 % branches · 100 %
fonctions) · `vitest` **132 fichiers / 907 tests** 0 · `test:db` **36
fichiers / 164 tests** 0 · `tsc -b` 0 · `typecheck:electron` 0 ·
`typecheck:manager` 0 · `eslint --max-warnings 0` exit 0 · `format:check` 0 ·
`verify:migrations` VERIFIED · `verify:domain` VERIFIED · `verify:perf`
VERIFIED · `verify:fr` 0 · `license:scan` 0 · `build` ✓ (28,6 s) ·
`build:electron` ✓ (manifeste signé 217 fichiers).

### Contrat gelé modifié (ADR-123)

`FROZEN_SCHEMA_COUNT` 114 → **121** · nouvel invariant
`FROZEN_EXPORT_COUNT = 127` · liste `REQUIRED` de `operation-id-coverage`
complétée (23 → **43**). La cible de W4 prévue au plan (120) devient **121**
à cause du schéma `closingReopenSchema` ajouté en W3.

### En attente / à faire

1. **W5** (prochaine vague) : rendu et ergonomie caissier — `formatDzd()`
   qui throw pendant le rendu (268 sites), double-submit, `useBusyFlag`,
   écrans qui meurent.
2. **Q11** (seuil de couverture de `src/features`) : périmètre inchangé
   (`src/domain` + `src/application`, 80/75/88/80 par fichier). L'extension à
   l'UI (119 fichiers) reste à arbitrer.
3. Les **11 autres fichiers « miroir »** de l'audit (I-03) : à auditer vague
   par vague (le patron de conversion est donné par les 4 converts).
4. **Q5** toujours ouvert (workshop impression), **20 décisions owner**
   (§4 du plan), **ADR-120** toujours proposé non approuvé.
5. **E2E à rejouer** avant tout tag : `staff-session`, `full-loop-client`.

## 23) Session 2026-10-21 (bis) - diagnostic des 3 bugs caisse (propriétaire)

**Demande** : « عند إضافة منتج حر إلى السلة… الاسم يكتب عادي لكن السعر يرجع
لخانة الاسم » · « منتج بالوزن 700 دج/كغ، بيع 50 دج ⇒ السلة تكتب 49,7 دج »
· « السلة مختلطة (حر + وزن + قائمة + خصة) ⇒ البيع لا يمر ويظهر خطأ ».

**Méthode** : lecture du code + **preuve par les données réelles** —
journal main `%APPDATA%\Veloria PoS\logs\veloria-2026-10-21.log` + base
`%PROGRAMDATA%\Veloria PoS\Data\Veloria POS DB.sqlite` (6 ventes, 10 lignes) +
reproduction sur base migrée temporaire (repos réels `createSaleAtomic`).

### B1 — focus qui revient au champ « Nom » (article libre)

`useDialogFocus` (`src/shared/ui/primitives.tsx:313-355`) : `useEffect` avec
dépendances `[boxRef, onClose, extraKey]`. `onClose` arrive du parent sous
forme de flécheta **inline** (`SellScreen.tsx:297` `onCloseCustom={() =>
s.setCustomOpen(false)}`) ⇒ **identité nouvelle à chaque rendu** ⇒ l'effet
rejoue à chaque frappe : le cleanup rend le focus à l'ouvrant puis l'effet
refocus **le PREMIER `input` du dialogue** = « Nom du produit » (le prix est le
2ᵉ). Symptôme exact : 1 chiffre saisi puis retour au nom.
**Portée : tous les modales/tiroirs** dont `onClose` est inline (visible
seulement là où le champ|Lu n'est pas le premier).
Correctif : `onClose`/`extraKey` dans une ref, dépendances `[boxRef]` seul.

### B2 — montant saisi au poids ≠ montant facturé (49,70 au lieu de 50,00)

`weightDialogPreview` (`src/features/sales/sell/sell-weight.ts:64-84`) : mode
« Montant » → `qty = round(montant/prix, 3 déc.)` puis
`total = prix × qty` (`computeLineTotal`). 50,00 DZD à 700,00 DZD/kg ⇒
`qty = 0,071 kg` ⇒ total = **49,70 DZD** (100,00 DZD ⇒ 0,143 kg ⇒ **100,10**).
Le montant exact est **perdu** : `onConfirm(preview.qty)` ne transmet que la
quantité. **Preuve base réelle** : vente `FAC-2026-00006`, ligne « bil »
⇒ `quantity 0.071`, `line_total_minor 4970`.
Comportement « par design » (ADR-114 : facturer le poids arrondi), mais le
caissier **perd de la argent** ⇒ écart métier à trancher (voir §23 « à
trancher »).

### B3 — vente du panier mixte refusée (cause PROUVE)

Journal main, 7 fois le 2026-10-21 (20:27→20:32 UTC), canal `sales.create` :
`CHECK constraint failed: discount_amount_minor >= 0`.
Mécanique : un prix de ligne **supérieur** au prix d'origine (majoration)
⇒ remise de ligne **négative** (`origin − facturé < 0`) ⇒ le domaine
l'accepte (remise signée, « majoration admise ») mais la base l'interdit
(`sales.discount_amount_minor >= 0` — migration 0001 immuable + trigger
`trg_sale_items_discount_nonneg_ins` — migration 0031) ⇒ rollback total ⇒ le
caissier voit « Une erreur inattendue est survenue. Réessayez. »
**Lien B1 → B3** : le focus B1 tronque la saisie du prix de l'article libre
(ex. « 5 » au lieu de « 500 ») ⇒ le caissier corrige via le P.U. du panier
(prix **supérieur**) ⇒ la vente est refusée.
**Aggravant** : la garde main « Remise de ligne invalide pour « X » » est
exécutée **APRÈS** l'INSERT de la vente (boucle des lignes) ⇒ l'erreur SQL
brute gagne ⇒ message technique au lieu du FR (violation AGENTS §6).
Reproduction (repos réels, base migrée) : `discountAmount = -49500` ⇒
`CHECK constraint failed: discount_amount_minor >= 0`, **0 vente créée**.

### Constat secondaire (à vérifier)

Ventes `FAC-2026-00001/3/4/6` enregistrées avec `amount_paid_minor = 0` ⇒
**ventes à crédit** (reste = total) au lieu d'encaissement comptant ; la
vente 6 a `credit_limit_override = 1` (le caissier a coché le dépassement).
Piste : l'effet de synchro `paidText → cart.amountPaidMinor`
(`useSellState.ts:190-195`) borne à `totalMinor`, qui vaut **0** quand
`computeSaleTotals` lève (« Le montant payé doit être entre 0 et le total »,
soit un panier qui rétrécit après un montant saisi) ⇒ montant payé → 0.

### À trancher par le propriétaire

1. **B2** : (a) facturer le poids arrondi (ADR-114) mais l'annoncer
   explicitement (« 50,00 DZD ⇒ 71 g ⇒ 49,70 DZD facturés ») ; (b) facturer
   le montant saisi **exact** ⇒ la ligne porte un montant facturé propre ⇒
   la remise peut devenir négative ⇒ **reconstruction de la table `sales`**
   (SQLite ne sait pas supprimer un CHECK) + trigger 0031 + domaine + rapports
   ⇒ **nouvelle migration + ADR** ; (c) compromis : facturer le montant
   exact en portant un prix unitaire effectif (perte du prix catalogue sur le
   ticket).
2. **B3** : (a) interdire la majoration (message FR : « le prix ne peut pas
   dépasser le prix catalogue ») — simple, invariant DB respecté ; (b)
   autoriser la majoration de bout en bout (remise signée) ⇒ même migration
   que B2(b) ⇒ **une seule migration** pour les deux.
3. **B1** : correctif obvious (ref dans `useDialogFocus`) + test de non-régression.

**Aucun code modifié dans cette session** (diagnostic seul ; le fichier de
reproduction temporaire a été supprimé).

### Correctifs APPLIQUÉS (2026-10-22) — ADR-131

**Décisions propriétaire** : B2 ⇒ (b) facturer le montant saisi **exact** ;
B3 ⇒ (b) autoriser la majoration ⇒ **une seule migration** pour les deux ;
B1 ⇒ correctif + test.

| Fichier                                                                                                   | Correction                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/ui/primitives.tsx`                                                                            | `useDialogFocus` : `onClose`/`extraKey` dans des refs « dernière valeur » ; l'effet ne dépend plus que de `[boxRef]` ⇒ **plus de refocus du 1ᵉʳ champ** (corrige B1 pour TOUS les dialogues)               |
| `database/migrations/0051_sales_signed_discount.sql`                                                      | **NOUVEAU** : reconstruction de `sales` ⇒ `discount_amount_minor` **signé** (borne −1e11) ; triggers 0031 « remise non négative » remplacés par un plancher borné ; marqueur `-- veloria:foreign-keys-off` |
| `electron/database/sqlite.service.ts`                                                                     | Runner : migration « FK off » (FK désactivées **avant** la transaction — `PRAGMA foreign_keys` est un no-op dedans) + `PRAGMA foreign_key_check` fail-closed après                                         |
| `src/domain/sales/sale-rules.ts`                                                                          | `billedTotalMinor` sur la ligne ; `computeBilledTotal()` (montant saisi validé : entier > 0 + borne d'arrondi 0,0005 × prix + 1) ; `billedAmountToleranceMinor()`                                          |
| `electron/ipc/money-guard.ts`                                                                             | Miroir main : `priceLine({ billedTotalMinor })` + tolérance (parité prouvée par `money-guard-parity.test.ts`)                                                                                              |
| `electron/ipc/handlers/sales.repo.ts`                                                                     | `validateSaleLines()` **AVANT** l'INSERT (messages FR, plus de CHECK SQL brut) ; remise signée bornée ; `raisedLines` (majorations) dans l'audit                                                           |
| `electron/ipc/validators.sales.ts` / `validators.documents.ts` / `validators.print.ts`                    | Champ optionnel `billedTotalMinor` (vente, devis, brouillon) ; le validateur d'impression accepte le montant saisi dans la borne d'arrondi                                                                 |
| `electron/ipc/credit-gates.ts` / `registry.sales.ts` / `registry.documents.ts` / `handlers/carts.repo.ts` | Total facturé = montant saisi (gate crédit, payload vente, devis, brouillons)                                                                                                                              |
| `src/features/sales/sell/sell-weight.ts`                                                                  | Aperçu « Montant » = **montant saisi** (50,00 DZD ⇒ 50,00 DZD)                                                                                                                                             |
| `src/features/sales/sell/QuantityDialog.tsx` / `SellOverlays.tsx` / `SellScreen.tsx` / `sell-search.ts`   | Le montant saisi est transmis jusqu'à la ligne du panier (`billedTotalMinor`)                                                                                                                              |
| `src/features/sales/cart-store.ts`                                                                        | Deux lignes à montants facturés DIFFÉRENTS ne fusionnent plus (le poids s'additionne, le montant non)                                                                                                      |
| `src/features/sales/sell/CartPanel.tsx` / `sell-totals.ts`                                                | Total de ligne = montant facturé ; marque « montant saisi » dans le panier ; le ticket porte le montant exact                                                                                              |
| `src/features/sales/sell/PriceDialog.tsx`                                                                 | La **majoration** est annoncée en clair (« Majoration : ce prix dépasse le prix catalogue… l'écart sera tracé dans l'audit »)                                                                              |
| `src/features/sales/sell/cart-drafts.ts`                                                                  | Le montant facturé survit au redémarrage (brouillon)                                                                                                                                                       |

**Tests ajoutés** : `tests/unit/sales/sale-signed-discount.test.ts` (9),
`tests/integration/sale-signed-discount.test.ts` (3, repos réels),
`tests/unit/ui-dialog-focus.test.ts` (3),
`tests/unit/money-guard-parity.test.ts` (+1 bloc parité montant saisi).

**Portes (arbre propre, 2026-10-22)** : `tsc -b` **0** · `eslint --max-warnings 0` **0** ·
`format:check` **0** · `vitest` **145 fichiers / 992 tests** **0** ·
`test:db` **40 / 186** **0** · `verify:migrations` **VERIFIED** ·
`verify:domain` **VERIFIED** · `verify:fr` **0** (322 fichiers) ·
`verify:encoding` **0** (872 fichiers) · `verify:perf` **VERIFIED** · `knip` **0**.

**À faire** : rejouer l'E2E (non relancés depuis le 2026-10-18) · reconstruire le
packaging (la migration 0051 change le schéma : `release/` à refaire) ·
**constat secondaire** (§23 « Constat secondaire ») : 4 ventes enregistrées avec
`amount_paid_minor = 0` (ventes à crédit au lieu d'encaissement) — piste :
l'effet de synchro `paidText → cart.amountPaidMinor` borné à `totalMinor`
(qui vaut 0 quand `computeSaleTotals` lève). **Non traité dans cette session.**

## 21) Session 2026-10-21 — remédiation : fin du plan d'audit (W6, W7, W10)

- **Demande propriétaire** : « اكمل الجلسة المسماة "تدقيق Veloria PoS وخطة
  الإصلاح الجذري" المفتوحة بتاريخ 20 oct 2026 على الساعة 14:56 » — reprise
  exacte de la session `ses_ea6665c78ffeLz5b52nyesQy1d` (état restauré depuis
  `opencode.db` : 804 messages, work-in-progress W6 interrompu sur une
  question au propriétaire).
- **État hérité** : W1→W5, W8, W9 commitées ; **W6 (code mort) à moitié
  fait** (4 fichiers modifiés, non commités) ; la question laissée en
  suspens portait sur `expo-constants` (dépendance mobile fantôme).

### Vague W6 — code mort trié (`60211cf`, ADR-127)

- **Correction d'un excès de la session précédente** : la suppression
  aveugle des 24 ré-exports du barrel d'impression a **cassé le build**
  (`tsc` : 8 symboles consommés par la suite de tests) ⇒ le rapport `knip`
  **ne voit pas** l'usage par les tests : la preuve, c'est la porte
  `typecheck`, pas l'outil. Règle retenue : _recherche exhaustive + tsc +
  suite complète_, jamais le rapport seul.
- **B-03** : le miroir main du constructeur de QR V1 est supprimé (le POS
  n'émet plus que la V2) ; le **format** V1 reste lu par l'APK et décrit par
  le use-case applicatif (spécification exécutée par son test).
- **B-02** : `clearSecureState()` supprimé (aucun flux ne l'appelait).
- **B-32** (décision propriétaire : « retirer + lockfile régénéré ») :
  `expo-constants` retirée de `mobile/package.json` ; le lockfile n'est
  modifié que sur **une ligne** (npm réécrivait aussi des champs `libc`
  sans rapport — écartés pour ne pas polluer la revue) ; la dépendance reste
  dans l'arbre comme **transitive** de `expo` (correct).
- **B-36** : `tailwindcss` retiré de `ignoreDependencies`.
- **O-05** : les 2 commentaires arabes de l'impression sont corrigés ⇒ la
  liste `PENDING_WORKSHOP` de `verify-fr-only.mjs` est **supprimée** (la
  garde FR est pleine : 321 fichiers, plus de dérogation temporaire).
- Résultat : **`knip` = 0** (0 fichier, 0 export, 0 type, 0 dépendance).

### Vague W7 — règles uniques (ADR-128)

8 duplications supprimées, une par une, avec test de parité :

| #    | Règle unique (source)                                    | Copies supprimées                                               |
| ---- | -------------------------------------------------------- | --------------------------------------------------------------- |
| D-02 | `parseQuantityInput` (`domain/common/quantity.ts`)       | `parseQtyInput`, `parseQty`, `parseQuantityInput` (weight-sale) |
| D-03 | `formatQuantityFr` (idem)                                | `fmtQty`, `formatQtyFr`                                         |
| D-04 | `percentOfMinor` (`domain/money/money.ts`)               | 2 calculs _inline_ (zakat, restockage)                          |
| D-05 | `multiplyMinorByQuantitySafe` (variante qui ne lève pas) | 7 `Math.round(prix × qté)` sans garde                           |
| D-06 | `daysBetween` (`domain/common/dates.ts`)                 | 3 implémentations d'écart en jours                              |
| D-07 | `strictOrNum` (`@shared/money/parse.ts`)                 | copie locale (réception)                                        |
| D-08 | `toMinorSafe` (`domain/money/money.ts`)                  | `asMinor`                                                       |

- **E-29** : le renderer normalise désormais le nom client **exactement**
  comme le main (« Cœur » ⇒ `coeur`, plus « c eur ») + test de parité sur
  16 vecteurs.
- **E-30** : l'état `'overdue'` **existe enfin** (règle unique dans
  `electron/ipc/handlers/debt-status.ts` : une vente ouverte échue) — écrit
  dans les 4 écritures du solde **et** recalculé à la lecture (l'échéance
  dépend du temps : un état matérialisé ne peut pas suivre le temps) ;
  `agingBucket` (code mort) supprimé. Trois flux ont été réordonnés
  (encaissement, avoir sur retour, annulation) pour que le statut soit lu
  dans l'état final de la transaction.
- **J-11** : `knip` couvre `license-manager/**` et `cloud/**` (la Edge
  Function est déclarée `entry`).
- 2 nouveaux tests : `parity-normalisation.test.ts` (E-29) et
  `money-rule-convergence.test.ts` (D-02 → D-08).

### Vague W10 — état d'erreur persistant (ADR-129)

- **A-06** : 12 écrans de données déclarent un état d'erreur **persistant**
  (`loadError`) et l'affichent via la nouvelle primitive `ErrorState`
  (`role="alert"`, message FR, icône) — l'erreur ne disparaît plus en 4,5 s
  et un tableau vide après un échec ne passe plus pour « aucune donnée ».
- Garde : `tests/unit/a06-screen-error-state.test.ts` (14 cas) parcourt les
  écrans et exige état + affichage (exemptions documentées : licence,
  caisse, réglages).
- **A-28** : le téléphone/e-mail codés en dur dans « À propos » sont
  remplacés par la **fiche entreprise** (réglable par le commerçant).
- **A-07 / A-27** : déjà traités en W5 (rappelés dans l'ADR).

### Portes (arbre propre, 2026-10-21)

`test:coverage` **EXIT 0** (95,83 % lignes · 87,19 % branches · 100 %
fonctions — aucun seuil abaissé) · `vitest` **140 fichiers / 964 tests** 0 ·
`test:db` **38 fichiers / 177 tests** 0 · `tsc -b` 0 · `typecheck:electron` 0 ·
`eslint --max-warnings 0` exit 0 · `format:check` 0 · **`knip` 0** ·
`verify:migrations` VERIFIED · `verify:domain` VERIFIED · `verify:perf`
VERIFIED · `verify:fr` 0 (322 fichiers) · `verify:encoding` 0 (864 fichiers) ·
`license:scan` 0 (1367 fichiers) · `build` ✓ (12,1 s) · `build:electron` ✓
(manifeste signé 216 fichiers).

### Packaging (2026-10-21, après les vagues)

`release/` **reconstruit de zéro** (ADR-023 : jamais de réutilisation) :

| Artefact                                        | Taille   | SHA-256 (début)                                                    |
| ----------------------------------------------- | -------- | ------------------------------------------------------------------ |
| `Veloria-PoS-Setup-1.0.0.exe` (NSIS machine FR) | 129,4 Mo | `3fa6b662b3c963f14cbb4a20040cde7693e54650adff9194b8660634f63f868f` |
| `Veloria-PoS-Portable-1.0.0.exe`                | 128,9 Mo | `60742079adbb07637f3d92a1222d46305a6127d34f3c5ebd095ae7ec87a530e5` |
| `Veloria-License-Manager-Setup-1.0.0.exe`       | 111,5 Mo | `021da8b4684bf3da87dc1ca0d1340914533ee9acd1af5325f9c05973a99a3331` |
| `Veloria-License-Manager-Portable-1.0.0.exe`    | 111,1 Mo | `55f7e68535afea531274aed7b69ceec11b419f05fd7c624cd1cb84e1c3ffeec7` |

- 2 `.blockmap` + `SHA256SUMS.txt` + `release/win-unpacked/` (= POS).
  `release:smoke` **EXIT 0** (dist, preload sandbox-safe, stamps CommonJS,
  manifeste manager) · `better-sqlite3` **chargé dans le runtime packagé**
  (Electron 37.2.0, ABI 136, SQLite 3.50.2 — règle AGENTS.md §9).
  **APK mobile non construit** : ni EAS CLI/jeton, ni JDK/Android SDK, ni
  `EXPO_PUBLIC_*` réel (placeholders) ⇒ action propriétaire.

### En attente / à faire

1. **E2E à rejouer** avant tout tag : `staff-session` et `full-loop-client`
   (touchés par K-04 en W2 et par le canal `closings.reopen` en W3).
2. `verify:licensing`, packaging `release/`, `npm audit` (réseau) non
   relancés (hors périmètre / réseau).
3. **ADR-120** toujours _proposé_ (non approuvé) · les autres décisions
   owner du plan (§4) : Q6 (avoir en cours), Q7 (source de vérité de la
   dette), Q17 (jour métier `Africa/Algiers`), Q19 (APK/EAS).
4. Reste à faire hors plan d'audit : Q11 (extension du seuil de couverture
   à `src/features`), les 11 autres fichiers « miroir » (I-03).

### Pièges de cette session

- **`knip` ne voit pas l'usage d'un export par les tests** ⇒ ne jamais
  supprimer sur la foi du rapport : recherche exhaustive + `tsc -b` + suite.
- **Packaging** : `package:win` / `package:manager` exigent le privilège
  symlink (`signAndEditExecutable: true`, ADR-070) ⇒ **Developer Mode**
  (`AllowDevelopmentWithoutDevLicense=1`) pour construire **sans admin**.
  Les deux configs partagent `directories.output: release` ⇒ le second
  build **écrase `release/win-unpacked`** : construire le POS **en dernier**
  pour que `win-unpacked` contienne le POS (c'est lui qu'on teste au
  runtime). Le cache electron-builder est vide ⇒ premier build télécharge
  Electron (123 Mo) + winCodeSign + NSIS (~6 min).
- `npm run test:coverage 2>&1 | Select-Object -First N` : le `-First` ferme
  le pipeline et **tue** le run (sortie tronquée) ⇒ écrire dans un fichier
  (`> file 2>&1`) puis lire le fichier.
- `opencode.db` (historique des sessions) s'ouvre avec
  `node --experimental-sqlite` : `better-sqlite3` du projet est compilé pour
  l'ABI Electron (136) et refuse de charger sous Node 22 (ABI 127).
- Un `while` de recherche qui ne fait pas progresser l'index boucle à
  l'infini : écrire les scripts Node hors du dépôt (dossier TEMP) et les
  supprimer après usage (un `.cjs` à la racine casse `eslint`).
- **Vérifier le module natif packagé** : `require` du chemin **asar**
  (`resources/app.asar/node_modules/better-sqlite3`), pas du chemin
  `app.asar.unpacked` (le `bindings` n'y est pas) —
  `ELECTRON_RUN_AS_NODE=1 "release\win-unpacked\Veloria PoS.exe" script.js`.

## 22) Session 2026-10-21 (bis) — import/export CSV (Clients, Produits) + re-emballage

- **Demande propriétaire** : « اضف خاصية الاستراد و التصدير في صفحتي
  العملاء و المنتجات و تحقق منهما » — l'import clients et l'export produits
  manquaient (les deux écrans étaient asymétriques).
- **État hérité** : W1→W10 commitées, `release/` reconstruit (§21), arbre
  propre. Une **session concurrente** travaille sur un bug « panier mixte »
  (fichier `tests/integration/_repro-mixed-cart.test.ts`, TEMP) : ce fichier
  n'a **pas** été touché ni commité (staffage par chemins explicites).

### Ce qui a été fait (ADR-130, commit `8b55f3c`)

- **Import clients** (slice verticale complète) : le parseur de domaine
  existait déjà (`parseCustomersCsv`) mais **personne ne l'utilisait** ⇒
  chemin d'écriture complet :
  `importCustomersAtomic` (main, UNE transaction, tout-ou-rien) · canal
  `customers.import` + `customersImportSchema` (Zod) · preload ·
  `api.customerImport` · portes staff (`debts`) et licence (`customers`) ·
  bouton « Import CSV » + champ fichier masqué + confirmation FR.
  Garanties : unicité du téléphone **E-28** vérifiée AVANT l'écriture (message
  FR, pas de rollback du trigger 0049) · doublon dans le même fichier refusé ·
  **idempotence de lot** par `operationId` · `search_norm` recalculé (0047) ·
  aucune dette/plafond créés (l'import ne fait que des fiches).
- **Export produits** (renderer) : **toutes** les pages du filtre courant
  (parcours borné en concurrence + progression), montants DZD formatés,
  code-barres et statut inclus.
- **Contrats gelés** (documentés dans l'ADR) : canaux 177 → **178** ·
  `FROZEN_SCHEMA_COUNT` 121 → **122** · `FROZEN_EXPORT_COUNT` 127 → **128** ·
  `FROZEN_SCHEMA_TOTAL` 121 → **122** · `operationId` REQUIRED 43 → **44**.
- **Tests** : `tests/integration/customers-import.test.ts` (6 cas) +
  `tests/unit/import-export-ui.test.ts` (6 cas : garde statique du câblage
  renderer + lignes CSV de l'export + interdiction SQLite/Node dans l'UI) +
  `tests/e2e/csv-import-export.spec.ts` (**3 cas, E2E RÉEL** : le fichier CSV
  est importé par le main et la fiche apparaît dans le tableau avec son
  téléphone ; un fichier invalide est refusé **sans écrire de fiche** ; les
  deux exports parcourent le filtre et rapportent le compte de lignes).
  Note : l'événement `download` de Playwright n'est pas émis par Electron
  (téléchargement géré par la session Chromium) ⇒ l'export est vérifié par
  son **effet** (toast FR) et son contenu par le test unitaire.

### Packaging refait avec la feature (release/)

`release/` reconstruit **après** l'import/export (ADR-023 : jamais de
réutilisation) : `Veloria-PoS-Setup-1.0.0.exe` + `.blockmap` ·
`Veloria-PoS-Portable-1.0.0.exe` · `Veloria-License-Manager-Setup-1.0.0.exe`

- `.blockmap` · `Veloria-License-Manager-Portable-1.0.0.exe` ·
  `SHA256SUMS.txt` · `win-unpacked/` (= POS).

`release:smoke` **EXIT 0** · `better-sqlite3` **chargé dans le runtime
packagé** (Electron 37.2.0, ABI 136, SQLite 3.50.2 — règle AGENTS.md §9).

### Formats (rappel)

- **export = RAPPORT** (lisible dans Excel) ;
- **import = flux de DONNÉES** : clients `prénom;nom[téléphone]`, produits
  `nom;vente;achat;quantité[;code-barres]` (en-tête optionnel) ;
- un export ré-importé n'est pas un aller-retour : il échoue proprement
  (format / téléphone déjà utilisé ⇒ message FR, **rien n'est écrit**) plutôt
  que de créer des doublons.

### Portes

`format:check` 0 · `tsc -b` 0 · `typecheck:electron` 0 · `eslint
--max-warnings 0` 0 · `knip` 0 · `vitest` **142 fichiers / 976 tests** 0 ·
`test:db` **39 fichiers / 183 tests** 0 · `verify:migrations/domain/perf`
VERIFIED · `verify:fr` 0 (322 fichiers) · `verify:encoding` 0 (868 fichiers) ·
`license:scan` 0 (1420 fichiers) · `test:coverage` **EXIT 0** (95,83 % lignes) ·
`build` + `build:electron` ✓ (manifeste signé 216 fichiers).

## 24) Session 2026-10-22 — diagnostic « grand blanc après le code-barres » (facture de vente imprimée)

**Demande propriétaire** : « فاتورة البيع عندما تطبع هناك فراغ كبير بعد الكودبار »
= le ticket de vente imprimé laisse un grand blanc après le code-barres.

**Périmètre** : une vente ne sort **qu'en ticket thermique 58/80** (ADR-117 :
jamais d'A4 pour une vente) ⇒ le document visé est `thermalHtml()`
(`electron/printing/receipt-documents/thermal.ts`), alimenté par
`receiptCodes()` (`printing.enrich.ts:277`) — code-barres = **N° de facture**.

**Preuve** : HTML du ticket reconstruit hors application (esbuild + Chromium
headless, mise en page papier 80 mm = 302 px CSS) puis mesures DOM
(`getBoundingClientRect` / `scrollWidth`).

### Cause 1 — le ticket n'impose PAS le format de page ⇒ le blanc final

`printOptions()` (`printing.printer-settings.ts:55-67`) ne renvoie que
`{ silent, deviceName }` : **aucun `pageSize`** ⇒ Chromium prend le format
**par défaut du pilote** (A4 / 297 mm sur la plupart des pilotes thermiques) et
pose le ticket (colonne de 74 mm) dans le coin d'une page de 210×297 mm.
Le contenu du ticket **se termine par le bloc codes** (code-barres + QR +
payload — `thermal.ts:191-200`, dernier enfant du `<div>` racine) ⇒ **le grand
blanc arrive immédiatement après le code-barres**. Même défaut côté export PDF :
`pageSize: { width: 80000, height: 297000 }` (`printing.pdf-exports.ts:62` et
`:123`) ⇒ page de 297 mm pour ~185 mm de contenu.
Le seul chemin qui impose un format exact est celui des **étiquettes**
(`printHtmlPages` → `pageSizeMicrons`, `printing.templates.ts:246-248`).

### Cause 2 — le Code 39 n'est jamais mis à l'échelle ⇒ code-barres TRONQUÉ

`code39Svg()` (`receipt-documents/barcode39.ts:73-95`) renvoie un SVG à
**largeur intrinsèque** = 16 glyphes (14 car. + `*` début/fin) × 27 px + 15
écarts × 2 px = **462 px** (module étroit 2 px, large 5 px).
Le bloc thermique l'insère dans une colonne de **280 px** (80 mm) / **200 px**
(58 mm) avec `overflow:hidden` (`thermal.ts:193-194`) ⇒ la barre est **coupée à
61 % (80 mm) / 43 % (58 mm)** ⇒ code-barres illisible au scan.
Le `<text>` du SVG est centré sur la largeur **intrinsèque** (x = 231) ⇒ à
80 mm il est calé à droite (x 185→278), à **58 mm il disparaît totalement**
(x 185→278 vs fenêtre 0→200) ⇒ plus aucun numéro lisible sous la barre.
Les deux autres rendus d'objets KNOW, eux, mettent le code-barres à
l'échelle : A4 `.barcode svg{max-width:230px;height:auto}`
(`receipt-documents/proforma.ts:143`) et étiquettes
`.label svg{max-width:100%;height:auto}` (`receipt-documents/labels.ts:114`) —
**seul le thermique a été oublié** (le conteneur a été ajouté en `6ee2862`,
ADR-050/057).
Correctif vérifié en navigateur : `svg{max-width:100%;height:auto}` ⇒ 462→280 px,
hauteur 34 px, `<text>` recentré (x 112), `scrollWidth` 280 (plus de
débordement).

### Constat secondaire

Le payload QR s'affiche **deux fois** sur le ticket : ligne texte `QR : …`
(`receipt-text.ts:225-226`) + bloc 9 px sous le QR (`thermal.ts:196-198`).

### Correctifs proposés (NON appliqués — diagnostic seul)

1. Imposer le format du ticket comme pour les étiquettes :
   `printHtml(html, 300, { pageSizeMicrons: { width: 80000|58000, height:
<hauteur mesurée> } })` — mesurer `document.body.scrollHeight` dans la
   fenêtre cachée (`printing.templates.ts`) pour supprimer la hauteur fixe
   297 mm ; `margins: none` est déjà prévu par `printHtmlPages`.
2. Mettre le Code 39 à l'échelle (`max-width:100%;height:auto`) ou réduire le
   module étroit (1,1 px ⇒ 275 px, tient nativement dans 280 px) — arbitrage
   lisibilité du scan (X-dimension) vs largeur.
3. Ne plus imprimer le payload QR deux fois.

**Aucun code modifié dans cette session** (diagnostic seul ; script de
reproduction temporaire supprimé).

## 25) Session 2026-10-22 (bis) — clôture des constats de la revue UI d'ADR-131 (ADR-132)

**Demande propriétaire** : « اكمل » = reprendre la session « تشخيص أخطاء السلة
والأسعار والبيع » (21 oct 21:50) et terminer les **3 constats bloquants** que sa
propre revue ui-fr avait laissés après ADR-131.

### Constats corrigés

| #   | Constat                                                                                    | Correctif                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Éditer qté/prix d'une ligne « montant saisi » **tuait l'écran Vente** (error boundary)     | La ligne est **VERROUILLÉE** : `isBilledByAmount()` + `cart-store` ignore `setQty`/`setLinePrice`, `addLine` ne fusionne jamais, `+`/`−` ne vise QUE la dernière ligne (message FR si verrouillée, jamais de remontée vers une ligne non visée) ; `safeLineTotal()` affiche « — » + log au lieu de lever ; indice de verrou **visible** + `aria-describedby` (pas seulement une infobulle, inutilisable sur caisse tactile). |
| C2  | Ticket **non imprimable** : remise négative rejetée par `printPayloadSchema.discountMinor` | `moneyMinorSigned` (±1e9, borné côté impression) ; `billedTotalMinor` dans `printLineSchema`/`ReceiptLine` ; ticket « Remise −X » / « Majoration +X », « montant saisi » au lieu de `qté × P.U.` (faux), quantités en virgule FR (`formatQtyFr`) ; devis A4 : marque « montant saisi », quantité FR, **majoration visible même quand les lignes à zéro sont masquées**.                                                      |
| C3  | Aucune couverture E2E du mode Montant                                                      | `tests/e2e/cashier-amount-mode.spec.ts` (2 cas) : focus « article libre » + parcours réel poids → montant 50,00 DZD → ligne verrouillée → encaissement → ticket (« montant saisi » + « Majoration »).                                                                                                                                                                                                                        |

### Revue contradictoire (avant commit)

- **ui-fr** (2 passes) : 3 risques trouvés puis corrigés — (1) le raccourci
  `+`/`−` remontait à une ligne ANTÉRIEURE quand la dernière était verrouillée
  (il pouvait la retirer !) ⇒ cible strictement la dernière + message FR ;
  (2) verrou expliqué uniquement en infobulle + `aria-label` contradictoire ⇒
  texte visible + labels « Quantité/Prix verrouillé » ; (3) faux « 0,00 DZD »
  dans la voie de secours (`formatDzd(total ?? 0)`) ⇒ marque rendue seulement si
  le total est calculable, sinon « Montant illisible — retirez la ligne ».
  Également : « audit » → « journal de la vente » (CartPanel/PayDialog), accord
  « Écart d'arrondi de la longueur / du poids », `console.error` réservé aux
  erreurs **inattendues** (une frappe partielle est normale).
- **db-guardian** : **CLEAN** — aucune migration touchée, `moneyMinorSigned`
  fail-closed (borne d'impression plus stricte que `assertSignedTotal`), pas de
  vecteur de gonflement (`billedTotalMinor` = libellé d'impression, le total
  imprimé reste `lineTotalMinor` + garde de recomposition), idempotence/transaction
  inchangées.

### Fichiers

- Domaine : `src/domain/sales/sale-rules.ts` (`isBilledByAmount`).
- Renderer : `cart-store.ts`, `CartPanel.tsx`, `QuantityDialog.tsx`, `PriceDialog.tsx`,
  `SellTotalsPanel.tsx`, `sell-finalize.ts`, `sell-weight.ts`, `sell-totals.ts`,
  `sell-types.ts`, `SellScreen.tsx`, `PayDialog.tsx` (libellé).
- Main/impression : `validators.common.ts`, `validators.print.ts`,
  `receipt-documents/{common,receipt-text,amounts,proforma}.ts`.
- Docs : `docs/ADR-132-*.md`, `docs/INDEX.md`.
- Tests : `tests/unit/sales/sale-amount-line-lock.test.ts` (8),
  `tests/unit/sales/cart-line-safe-total.test.ts` (3),
  `tests/unit/receipt-signed-discount.test.ts` (7),
  `tests/e2e/cashier-amount-mode.spec.ts` (2) ; miroirs :
  `bridge-shape` (129 exports), `sell-split` (`billedTotalMinor: null`).

### Portes (arbre des fichiers commités, 2026-10-22)

`tsc -b` **0** · `eslint --max-warnings 0` **0** · `format:check` **0** ·
`vitest` **148 fichiers / 1014 tests** **0** · `test:db` **40 / 186** **0** ·
`test:coverage` **EXIT 0** (seuils par fichier 80/75/88/80) ·
`verify:migrations` **VERIFIED** · `verify:domain` **VERIFIED** ·
`verify:fr` **0** (322 fichiers) · `verify:encoding` **0** (878 fichiers) ·
`verify:perf` **VERIFIED** · `knip` **0** · `build` ✓ · `build:electron` ✓
(manifeste signé 217 fichiers) · Playwright spec caisse **2/2**.

### Reste / limites connues

- **Packaging** : `release/` reste à reconstruire (déjà dû à la migration 0051
  d'ADR-131) — non fait ici.
- **Réimpression depuis l'historique** : `billedTotalMinor` n'est pas persisté
  (pas de colonne) ⇒ la réimpression affiche `qté × P.U.` + « Majoration » au
  lieu de « montant saisi ». Montants exacts et recomposables ; corriger
  exigerait une NOUVELLE migration (documenté ADR-132 §4).
- **Constat secondaire §23** (`amount_paid_minor = 0` sur 4 ventes) : non traité.
- Suite E2E complète non rejouée (seule la spec caisse l'a été).

## 26) Session 2026-10-22 (ter) — correctif « grand blanc après le code-barres » (ADR-133)

**Demande propriétaire** : « اكمل » = appliquer le correctif du diagnostic §24
(facture de vente imprimée : grand blanc après le code-barres).

### Correctifs appliqués

| #   | Cause prouvée (§24)                                                                                                                       | Correctif                                                                                                                                                                                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Le ticket n'imposait **aucun `pageSize`** ⇒ format par défaut du pilote (A4/297 mm) alors que le contenu **se termine** par le bloc codes | `thermalPageSize()` (nouveau `printing.page-size.ts`) : largeur papier + **hauteur mesurée du contenu** (+3 mm de coupe, plancher 30 mm) ; `printHtmlPages` mesure après `did-finish-load` et imprime avec `pageSize` + `margins: none` ; `thermalWidth` propagé par `printHtml`/`printCopies` (repli = ancien comportement si la mesure échoue). |
| 2   | Le **Code 39 n'était jamais mis à l'échelle** : 462 px dans une colonne de 280 px (80 mm) / 200 px (58 mm) + `overflow:hidden`            | `code39ModuleFor()` (module étroit calé sur la colonne, borné 1 → 2 px) + `thermalBarcode()` qui ajoute `style="max-width:<colonne>px;height:auto"` : barre **entière**, proportions conservées, numéro lisible recentré.                                                                                                                         |
| 3   | L'export PDF passait des **microns** à `printToPDF`, qui attend des **pouces**                                                            | `micronsToInches()` + marges nulles ; l'export PDF d'un ticket utilise la même hauteur mesurée que l'impression.                                                                                                                                                                                                                                  |

### Mesures (avant → après, Chromium + Electron réels)

- 80 mm : SVG **462 px débordant 280 px** (61 % de la barre visible) → **275,7 px dans 280 px** (barre entière, hauteur de barre conservée) ; page **297 mm → 141,1 mm** (= contenu 522 px + 3 mm).
- 58 mm : 462 px dans 200 px (43 % visible, numéro hors zone) → **200/200 px**, numéro centré ; page 127,9 mm.
- Export PDF (Electron réel, `printToPDF`) : **1 page 80,1 × 141,5 mm** et **58,3 × 128,1 mm** (avant : « taille » de 80 000 po lue par Chromium ⇒ page géante et contenu minuscule dans un coin).

### Fichiers

- Nouveau : `electron/printing/printing.page-size.ts` (`thermalPageSize`, `measureContentPx`, `micronsToInches`).
- Impression : `printing.templates.ts` (`PrintPage.thermalWidth`, mesure, `pageSize` + marges), `printing.receipt.ts`, `printing.payment.ts`, `printing.logistics.ts` (livraison, retour, bon de commande), `printing.studio.ts` (page de test thermique) — tous en `{ thermalWidth: width }`.
- Documents : `receipt-documents/barcode39.ts` (`code39ModuleFor`, 3ᵉ paramètre `narrowPx`, arrondi `svgNum`), `receipt-documents/thermal.ts` (`thermalBarcode`), `receipt-documents.ts` (ré-export).
- PDF : `printing.pdf.ts`, `printing.pdf-exports.ts`.
- Tests : `tests/unit/printing/page-size.test.ts` (**13**). Docs : `docs/ADR-133-*.md`, `docs/INDEX.md`.

### Portes (arbre de ce commit, 2026-10-22)

`tsc -b` **0** · `typecheck:electron` **0** · `eslint . --max-warnings 0` **0** ·
`vitest` **149 fichiers / 1027 tests** **0** · `build` ✓ · `build:electron` ✓
(manifeste signé 218 fichiers) · `verify:fr` **0** (323 fichiers) ·
`verify:encoding` **0** (880) · `verify:migrations` **VERIFIED**.
Vérification hors suite : Chromium/Playwright (géométrie + mesure) et Electron
réel (`dist-electron` + `printToPDF`).

### Reste / limites connues

- **58 mm** : un Code 39 de 14 caractères n'y est pas scannable (module plancher
  1 px ⇒ X-dimension < 0,2 mm). Le code y est complet et lisible à l'œil ;
  **80 mm reste la largeur recommandée** pour un scan fiable.
- **Payload QR toujours imprimé deux fois** (ligne texte `QR : …` + bloc 9 px
  sous le QR) : contrat texte ADR-050, hors périmètre.
- **Dépendance au pilote** : si un pilote refuse la taille de page custom, le
  repli garde l'ancien comportement (aucun `pageSize`) ⇒ le blanc reviendrait
  (mais jamais de ticket tronqué). À confirmer sur l'imprimante de production.
- `release/` toujours à reconstruire (déjà dû à la migration 0051 d'ADR-131).

## 27) Session 2026-10-22 (quater) — vérification import/export Clients & Produits (EMP-1)

**Demande propriétaire** : « تحقق من خاصية التصدير و الاستيراد في صفحة المنتجات و العملاء ».
Vérification réelle du câblage, puis correction du seul chemin destructeur trouvé.

### Ce qui a été vérifié

| Écran    | Import                                                            | Export                                                | Preuve                                 |
| -------- | ----------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------- |
| Produits | bouton + input masqué + `parseProductsCsv` + `api.productsImport` | toutes les pages du filtre + `downloadCsv` + toast FR | E2E réelle + unitaires + intégration   |
| Clients  | idem avec `parseCustomersCsv` + `api.customerImport`              | toutes les pages du filtre + `downloadCsv` + toast FR | E2E réelle (4/4) + intégration (7 cas) |

Câblage conforme aux règles : parseur domaine avant confirmation, `operationId`
de lot, transaction atomique tout-ou-rien côté main, gates staff + licence,
messages FR, aucun accès SQLite/Node dans le renderer. **Aucune régression de
canal, de schéma ni de migration** (aucune migration ajoutée).

### Constats

| #   | Constat (prouvé)                                                                                                                                                                                                                                                                                                         | Sévérité | État                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------- |
| 1   | Réimporter le CSV **exporté par l'écran Clients** créait **2 fiches bidon** (`Client / "Téléphone"` avec téléphone `"Jour règlement"`, puis `"Amine Benali" / "0550123456"` avec téléphone `"5"`). Le parseur ne connaissait ni les guillemets ni l'en-tête de rapport, et le main acceptait un téléphone non numérique. | P1       | CORRIGÉ                                             |
| 2   | Téléphone `pas-un-numero` accepté à l'import (`phoneDigitsParity` ne retirait que les séparateurs, pas les lettres).                                                                                                                                                                                                     | P2       | CORRIGÉ                                             |
| 3   | Champs CSV entre guillemets (Excel, exports de l'app) non décodés (`""` et `;` internes).                                                                                                                                                                                                                                | P2       | CORRIGÉ                                             |
| 4   | Export : une page IPC en échec était ignorée par `runBulk` ⇒ CSV partiel annoncé « N exporté(s) » (troncature silencieuse).                                                                                                                                                                                              | P2       | CORRIGÉ                                             |
| 5   | Export ≠ aller-retour : c'est un **rapport** (catégorie, statut, montants formatés, nom complet), l'import est un **flux de données** — décision 3 d'ADR-130. Un export réimporté doit être **refusé proprement**, pas accepté.                                                                                          | —        | COMPORTEMENT CONFORME (message désormais explicite) |

### Correctifs

- `src/domain/import/csv-import.ts` : `splitCsvLine()` quote-aware (`""`, `;`
  internes), détection des en-têtes de rapport (`Nom;Catégorie…`,
  `Client;Téléphone…`) ⇒ `DomainError` FR explicite « export de rapport, pas un
  fichier d'import » avec le format attendu ; validation du téléphone importé
  (vide accepté, sinon chiffres + séparateurs usuels, ≥ 6 chiffres).
- `electron/ipc/handlers/import.repo.ts` : **miroir main** de la règle
  téléphone (`digitsOnly` + charset) — la base reste l'autorité ; `seenPhones`
  compare les chiffres.
- `src/features/products/ProductsScreen.tsx` + `src/features/customers/ClientsScreen.tsx` :
  si `runBulk` rapporte une page en échec, **aucun téléchargement** ; toast FR
  « Export interrompu : N page(s) sur M illisible(s). Réessayez. » + log
  technique.

### Fichiers

- Code : `src/domain/import/csv-import.ts`,
  `electron/ipc/handlers/import.repo.ts`,
  `src/features/products/ProductsScreen.tsx`,
  `src/features/customers/ClientsScreen.tsx`.
- Tests : `tests/unit/csv-import-safety.test.ts` (**nouveau, 10 cas**),
  `tests/integration/customers-import.test.ts` (+1 cas téléphone bidon),
  `tests/unit/import-export-ui.test.ts` (+ garde « Export interrompu »),
  `tests/unit/domain-rules-coverage.test.ts` + `tests/unit/phase6-9-rules.test.ts`
  (fixtures téléphone réalistes), `tests/e2e/csv-import-export.spec.ts`
  (+1 cas « export de rapport refusé, aucune fiche bidon »).

### Portes (arbre de ce commit, 2026-10-22)

`tsc -b` **0** · `typecheck:electron` **0** · `eslint` (fichiers touchés,
`--max-warnings 0`) **0** · `vitest` **150 fichiers / 1 038 tests** **0** ·
`build` ✓ · `build:electron` ✓ (manifeste signé 218 fichiers) ·
**E2E `csv-import-export` : 4/4 vertes** (import + export réels, fichier
invalide, export de rapport refusé, export catalogue) · `verify:domain`
**VERIFIED** · `verify:fr` **0** (323 fichiers) · `verify:encoding` **0** (882
fichiers) · `verify:migrations` **VERIFIED**.

### Reste / limites connues

- L'export reste un **rapport** (ADR-130) : non réimportable par conception ;
  il est désormais refusé avec un message FR explicite, sans écriture.
- Pas de plafond de volume à l'export Clients/Produits (contrairement à
  l'historique, `EXPORT_MAX = 5 000`) : parcours page par page, concurrence
  bornée ; à arbitrer si un catalogue dépasse quelques dizaines de milliers de
  lignes.
- `skipped` reste à 0 dans le contrat d'import (aucune ligne ignorée : tout ou
  rien) ; le champ est conservé pour compatibilité.
- E2E : seul le refus du rapport **clients** est couvert en réel ; le refus du
  rapport **produits** est couvert par le test unitaire.

## 28) Session 2026-10-22 (quinquies) - export données réimportable (ADR-135)

### Objectif

Le propriétaire a réimporté un CSV **exporté par le même programme** et a reçu
`Ligne 2 : prix de vente invalide`. Le geste naturel « exporter puis
réimporter » doit fonctionner, sans transformer le rapport en format
d'import.

### Cause racine

- La version installée (`release/`, **21/10 22:58**) est antérieure au
  correctif EMP-1 `6bb3a51` (**22/10 21:04**) : `app.asar` ne contient pas la
  détection d'en-tête de rapport.
- Ancien parseur : l'en-tête `Nom;Catégorie;Unité;Prix d'achat;Prix de vente…`
  est consommé, puis `Catégorie` est lu comme `Prix de vente` sur la première
  ligne de données ⇒ message `Ligne 2`.
- Le correctif EMP-1 refuse désormais ce fichier proprement, mais **le besoin
  de transfert restait entier**.

### Livré (commit `2d8028a`, ADR-135)

- **Deux exports** sur Produits et Clients :
  - « Rapport CSV » : inchangé (colonnes enrichies, montants DZD, RX-18) ;
  - « Données CSV » : format exact d'import, réimportable tel quel.
- Produits : `nom;vente;achat;quantité;code-barres` via `minorToInput`
  (jamais `formatDzd`) ; Clients : `prénom;nom;téléphone` (prénom/nom
  séparés).
- `toCsv(..., { protectFormulas: false })` uniquement pour le fichier de
  données : préserve `+213…` et les noms `-…` ; le rapport garde RX-18.
- Export données **refusé** si le filtre courant inclut des archivés
  (produits : `includeArchived` ; clients : `archiveFilter !== "active"`) :
  le format d'import ne transporte pas le statut, aucune réactivation
  silencieuse.
- `finally` : `bulkBusy`/`bulkLabel`/`exportKind` remis à zéro même en cas
  d'exception (l'ancien `catch` laissait le bouton bloqué).
- Aucun canal IPC, schéma Zod ou migration. Réimport dans la même base :
  échec propre sur l'unicité code-barres/téléphone (tout-ou-rien) ; la
  restauration complète reste `Paramètres → Sauvegarde → Restaurer`.

### Fichiers

- Code : `src/shared/export/csv.ts`, `src/features/products/types.ts`,
  `src/features/customers/types.ts`, `src/features/products/ProductsScreen.tsx`,
  `src/features/customers/ClientsScreen.tsx`.
- Tests : `tests/unit/csv-import-safety.test.ts` (13 cas, aller-retour
  produits/clients + RX-18), `tests/unit/root-repair.test.ts` (16 cas,
  `protectFormulas:false`), `tests/unit/import-export-ui.test.ts` (6 cas,
  câblage statique + gardes archivés), `tests/e2e/csv-import-export.spec.ts`
  (clics rapport + données).
- Docs : `docs/ADR-135-export-donnees-reimportable-csv.md`,
  `docs/ADR-130-import-export-csv-clients-produits.md` (note de mise à jour),
  `docs/INDEX.md`.

### Portes (arbre de ce commit)

Format ✓ · `npx tsc -p tsconfig.json --noEmit` **0** · ESLint fichiers
touchés **0** · `vitest` **150 fichiers / 1 042 tests** **0** · `vite build`
✓ · `verify:fr` **0** (325) · `verify:encoding` **0** (885) · `verify:domain`
**VERIFIED** · `verify:migrations` **VERIFIED**.

### Bloqué par le chantier concurrent (hors périmètre)

- `tsc -b` / `typecheck:electron` : 3 erreurs dans `electron/printing/*`
  (`receiptTextOf`, `m` inutilisé) — fichiers non touchés.
- E2E `csv-import-export` : échec **avant lancement** sur
  `integrity.mismatch` de `dist-electron/printing/printing.pdf-exports.js`
  (chantier impression/Documents en cours). Ce n'est pas une régression CSV ;
  le contenu de l'export données est couvert par les tests unitaires.
- Le numéro **ADR-134** est utilisé par ce chantier concurrent ; le présent
  ADR est donc **ADR-135**. Ne pas commiter `electron/printing/*`,
  `src/features/history/HistoryDialogs.tsx`,
  `src/shared/documents/DocumentPreviewModal.tsx` ni
  `src/features/debts/DebtDialogs.tsx` avec ce travail.

### Reste

1. Quand le chantier impression est terminé : relancer `tsc -b`,
   `npm run build:electron`, puis la spec E2E `csv-import-export`.
2. Refaire le packaging (`release/` du 21/10) pour que l'utilisateur voie le
   correctif EMP-1 et le bouton « Données CSV ».
3. Vérifier dans l'app réelle : Produits → « Données CSV » → réimport sur une
   base vierge ; Clients idem. Attendu : mêmes noms/prix/quantités/codes et
   prénom/nom/téléphone, sans erreur `Ligne 2`.

---

## 29) Session 2026-10-22 — lancement réel de la build CSV (essai propriétaire)

### Demande

Le propriétaire a demandé : « شغل النسخة الجديدة و فعلها لأجربها » — lancer la
nouvelle version et l'activer pour tester l'export/import `Données CSV`.

### Réalisé

- **Build propre hors arbre sale** : worktree détaché sur `c30b5c6` dans
  `%TEMP%\opencode\veloria-csv-run` (le chantier impression/Documents
  concurrent n'est pas inclus). `npm run build` : `tsc -b` **0**, `vite build`
  ✓ (1 773 modules) ; `npm run build:electron` : preload + stamp + manifeste
  d'intégrité **218 fichiers** signé.
- **Copie stable** : `release/veloria-csv-test/` (gitignorée, `/release/`)
  contient `dist`, `dist-electron`, `package.json` + jonctions
  `node_modules`, `resources`, `database`, `public`. Le statut licence y est
  **ACTIVE** après vérification d'intégrité.
- **Raccourci Bureau** : `Veloria POS - Test CSV.lnk` → Electron du dépôt avec
  l'argument du dossier stable. Permet de rouvrir la build de test après
  fermeture, sans toucher à l'installateur.
- **Activation** : la licence de production existante est **ACTIVE**
  (`VLIC-757224A4`, édition `pro`, `lifetime`, 17 pages, matériel
  `CBFB-E42A-A0BD-C53F`). Aucun import `.vlic` ni réactivation nécessaire ;
  l'intégrité de la build de test est valide.
- **Lancement** : fenêtre `Veloria PoS - Point de vente` ouverte, renderer
  neuf ; les assets produits/clients contiennent bien le bouton
  **« Données CSV »**. Aucune erreur `license.integrity_failed` /
  `TAMPER_DETECTED` dans les logs.

### Effet sur la base réelle

- Démarrage sur la base de production
  `C:\ProgramData\Veloria PoS\Data\Veloria POS DB.sqlite` ; migration
  **0051** appliquée (schéma **50 → 51**).
- **Conséquence** : l'ancienne build installée (21/10) refuse maintenant cette
  base (« créée avec une version plus récente »). Ne pas relancer l'ancien
  installateur sur cette base ; utiliser la build de test ou refaire le
  packaging.
- Filets : snapshot pré-migration automatique dans
  `%APPDATA%\Veloria PoS\backups` + copie manuelle
  `%TEMP%\opencode\veloria-db-backup-20261022-221055.sqlite` (schéma 50).

### Reste

1. Laisser le propriétaire tester Produits/Clients → « Données CSV » →
   réimport (base vierge ou copie) et remonter le résultat.
2. Après stabilisation du chantier impression : `tsc -b`,
   `build:electron`, E2E `csv-import-export`, puis packaging neuf.
3. Ne pas commiter `release/` (gitignoré) ni les fichiers du chantier
   concurrent.

---

## 30) Session 2026-10-22 (sexies) — design du ticket de vente (ADR-134)

### Demande

Le propriétaire a fourni la photo d'un ticket de superette et demandé que la
facture de vente imprimée reprenne ce dessin : grande enseigne, date, client,
table `Qté / Article / P.U / Montant`, `N Article(s)`, encadré arrondi des
soldes, remerciement, code-barres + numéro et pied légal. Le ticket sortait
jusqu'ici en texte monospace, et l'aperçu ne montrait pas le rendu réel.

### Livré (commit `9fbc90e`, ADR-134)

- **Builder HTML unique** `buildReceiptTicketHtml`
  (`electron/printing/receipt-documents/ticket-html.ts` +
  `ticket-blocks.ts`) utilisé par l'impression, le PDF, l'aperçu, l'échantillon
  Studio, l'impression de test et la page de test.
- **Mise en page** : logo + enseigne (1,9 × la base, bornée 16–28 px), ville
  en italique, contact et `RC / NIF / NIS`, date centrée, ligne
  `Client : Nom | téléphone | adresse` (ou « Comptant »), vendeur, table à
  colonnes fixes (`colgroup`) et lignes pointillées. Montants de table
  **compacts** (sans « DA », milliers ni « ,00 ») pour tenir en 58 mm ;
  l'encadré garde les montants `DA` formatés.
- **Montant saisi** (ADR-131/132) : `P.U` = « — », mention « Montant saisi »,
  jamais de multiplication fausse ; référence produit sur la deuxième ligne.
- **Encadré** : `Ancien solde` (si fiche), `Total vente`, `Timbre fiscal`
  (espèces), `Versement`, `Nouveau solde` en gras ; replis `Reste à payer`,
  `Reste (timbre)`, `Monnaie rendue`. Détail fiscal au-dessus seulement si
  remise/livraison/TVA.
- **Pied** : nombre d'articles, montant en lettres, règlement/échéance,
  remerciement (défaut « Merci de votre visite. »), Code 39 + numéro, QR
  optionnel, mention légale (défaut « Ticket obligatoire pour toutes
  réclamations »), signatures si le modèle les garde.
- **Aperçu** : `printing.preview` renvoie `{ text80, html80 }` ; les modales
  Vente, Historique, Dettes, Retours et l'atelier affichent `html80` dans une
  iframe `sandbox=""`, avec repli `text80`. Aucun canal, schéma Zod ni
  migration ajouté.
- **Correctif pendant la vérification** : l'encadré `flex:0 0 74%` dépassait
  de **14 px** du papier 80 mm ; passé à `flex:1 1 auto; min-width:0`.
  Playwright : **0 élément hors cadre** en 58 et 80 mm (280 × 575 px /
  200 × 654 px pour 6 lignes).
- **QR** : le payload texte n'est plus imprimé quand un SVG QR existe (fin de
  la duplication constatée en ADR-133 §D4) ; le numéro lisible sous les barres
  n'apparaît que sans code-barres.

### Fichiers

- Code main : `electron/printing/receipt-documents/ticket-html.ts` (236 l.),
  `ticket-blocks.ts` (147 l.), `receipt-documents.ts`,
  `printing.receipt.ts`, `printing.pdf-exports.ts`, `printing.samples.ts`,
  `printing.studio.ts`.
- Renderer : `src/shared/documents/DocumentPreviewModal.tsx`,
  `src/shared/documents/invoice-preview.tsx`,
  `src/features/history/HistoryDialogs.tsx`,
  `src/features/debts/DebtDialogs.tsx`,
  `src/features/returns/dialogs/DetailsDrawer.tsx`,
  `src/features/print-templates/PrintTemplatesScreen.tsx`.
- Tests : `tests/unit/printing/ticket-html.test.ts` (9 cas),
  `tests/unit/printing/split-parity.test.ts` (18 cas, échantillon ticket =
  `text80` + `html80`).
- Docs : `docs/ADR-134-design-ticket-vente.md`, `docs/INDEX.md`.

### Portes (arbre de `9fbc90e`)

`npm run typecheck` **0** · `typecheck:electron` **0** · `eslint
--max-warnings 0` **0** · `vitest` **151 fichiers / 1 051 tests** **0** ·
`build` ✓ · `build:electron` ✓ (manifeste **220 fichiers**) · `verify:fr`
**0** (325) · `verify:encoding` **0** (886) · `verify:migrations`
**VERIFIED**.

### Reste

1. **Imprimer sur l'imprimante thermique réelle** (58 et 80 mm) et vérifier
   le rendu papier : lisibilité des montants compacts, alignement de
   l'encadré, scan du Code 39.
2. Rejouer l'E2E `csv-import-export` (blocage d'intégrité levé) et, plus tard,
   la suite E2E complète.
3. Refaire le packaging : `release/` (21/10) ne contient ni ADR-134, ni
   ADR-135, ni EMP-1.
4. Recueillir l'avis du propriétaire sur le dessin (taille de l'enseigne,
   mentions du pied) avant de figer d'éventuels réglages supplémentaires.

---

## 31) Session 2026-10-22/23 — « فراغ » après le code-barres : aperçu et pilote

### Demande

Le propriétaire a signalé un vide dans le ticket : « هناك فراغ في التذكرة »,
puis a précisé **« أسفل التذكرة بعد الباركود »** (en bas, après le code-barres).
Le ticket doit rester fidèle à la photo, en 58/80 mm, N&B, avec un aperçu qui
reflète exactement le papier.

### Diagnostic

1. **Le blanc des captures n'était pas dans le ticket.** Les anciennes captures
   Playwright étaient des captures **pleine page** de **302 × 1400 px** (80 mm)
   et **219 × 1400 px** (58 mm) : le ticket s'arrêtait à 575 / 654 px, puis
   **825 px de blanc** suivaient. Ces pixels venaient du viewport de capture,
   pas du document.
2. **Le PDF est serré.** Rendu Electron réel + `printToPDF` :
   - 80 mm : **80,09 × 155,19 mm**, dernier texte « POS » à **6,23 mm** du bas ;
   - 58 mm : **58,25 × 176,36 mm**, même blanc de **6,23 mm** ;
   - couleurs du PDF : seulement `#ffffff` et `#000000`, aucun gris.
3. **Le vide papier vient du pilote étiquette.** Le poste utilise
   `4BARCODE 3B-365B` (USB003) avec le pilote **`2120TF(Label)`**. Le
   `PrinterDriverData` contient `PageWidth=900`, `PageHeight=600` (90 × 60 mm),
   `SensorType=0` (gap), `GapLen=30`, `ContinuousForm=0`, `PrintMode=4`
   (arrachage) ; le PrintTicket par défaut est un `PageMediaSize` de
   **90 000 × 60 000 microns**. L'application demande une page **80 × 155 mm** ;
   ce pilote d'étiquettes continue de fonctionner au **gap** et avance le
   rouleau après le code-barres. Le HTML et le PDF ne sont pas en cause.

### Livré (commit `e3cf6e7`, ADR-134 §5)

- **Aperçu** : `#veloria-ticket` est détouré sur un fond **gris `#d1d5db`**
  avec une ombre, **uniquement en `@media screen`**. Le média print reste
  blanc ; le PDF ne peint que blanc et noir. Le `body` n'a plus de padding
  écran, donc la hauteur mesurée reste **575 px / 155,135 mm** en 80 mm
  (aucun blanc ajouté par l'aperçu).
- **Captures de contrôle** : captures **d'élément** `#veloria-ticket`
  (`280 × 575 px` et `200 × 654 px`), sans blanc ajouté, plus des aperçus
  `320 × 650` / `240 × 700` montrant la feuille sur fond gris.
- **Test** : `ticket-html.test.ts` passe de 9 à **10 cas** (fond écran, fond
  print blanc, ombre, absence de `@media print`).
- **ADR-134 §5** : preuves PDF, diagnostic du pilote et consignes de passage
  en mode reçu/continu.

### Configuration pilote à appliquer (hors code)

Le shell n'est **pas élevé** (groupe Administrateurs en « refus uniquement ») :
les clés HKLM n'ont pas été modifiées. Deux voies :

1. **Passer le pilote actuel en continu** : Préférences d'impression de
   `4BARCODE 3B-365B` → type de papier **continu/reçu** (pas étiquette),
   capteur **continu** (pas gap), gap **0**, taille **80 mm × hauteur du
   ticket** (ou personnalisée 80 × 155 mm), mode **arrachage**. Objectif
   registre : `SensorType=2`, `ContinuousForm=1`, `GapLen=0`.
2. **Installer le pilote reçu** du XP-365B / 3B-365B (le paquet Windows
   constructeur contient les deux modes), créer la queue « reçu », puis la
   sélectionner dans Veloria en largeur 80 mm.

Le pilote `2120TF(Label)` reste correct pour de vraies étiquettes 90 × 60 mm,
pas pour un ticket de 155 mm. Le type de papier réel (rouleau continu ou
étiquettes) reste **à confirmer** avant l'essai.

### Build de test

`release/veloria-csv-test/` date de `c30b5c6` et **ne contient pas**
`dist-electron/printing/receipt-documents/ticket-html.js` : un essai papier
depuis cette copie ne peut pas valider le nouveau dessin. Rebuilder la copie
stable (copier `dist/` + `dist-electron/` à jour, ou refaire le packaging)
avant l'essai papier.

### Portes

`ticket-html.test.ts` **10 cas** · `split-parity.test.ts` **18 cas** · suite
complète **151 fichiers / 1 052 tests** **0** · `typecheck` /
`typecheck:electron` / ESLint **0** · `build` ✓ · `build:electron` ✓
(manifeste **220**) · `verify:fr` **0** (325) · `verify:encoding` **0** (887) ·
`verify:migrations` **VERIFIED**.

### Reste

1. Confirmer le papier chargé (rouleau continu 80 mm ou étiquettes 90 × 60).
2. Appliquer le mode reçu/continu (ou installer le pilote reçu) et imprimer
   un ticket réel pour vérifier la disparition du blanc.
3. Rebuilder `release/veloria-csv-test/` avec le `dist`/`dist-electron` de
   `e3cf6e7` avant l'essai propriétaire.
4. Éventuellement, ajouter un avertissement dans `PrinterCard` quand le
   pilote sélectionné est un pilote étiquette (détection `driverName`) —
   non fait faute de confirmation du papier et pour éviter une copie UI
   trompeuse.
5. Rejouer l'E2E `csv-import-export` et refaire le packaging complet.
   \

## Session 32 — Audit page Paramètres (nettoyage mineur)

- `backup-frequency.ts` : champ minutes inutilisé retiré de `BACKUP_FREQUENCIES` (code mort/redondant).
- `limits.tsx` : `SaveBar` accepte `disabled` (actions conditionnelles).
- `SettingsSectionsA.tsx` : `AnnouncementSection` désactive `SaveBar` pendant le chargement initial.
- `SettingsSectionsB.tsx` : `DatabaseSection` alimente `foreignKeyViolations` depuis `dbHealth` et affiche le compteur.
- `use-app-settings.ts` : clé `showBalances` inutilisée retirée des valeurs par défaut de `invoice`.

Vérifications : typecheck 0 · eslint 0 · vitest settings-helpers/settings/a3 0 · verify:migrations VERIFIED · verify:fr 0 · verify:encoding 0.

## Session 33 — Fusion de composants Paramètres

- `SecuritySection` intègre désormais les préférences d'affichage (mode clair, compact) ; `DisplaySection` supprimé.
- `PrintingSection` retiré de l'écran ; `PrinterCard` inliné directement dans `SettingsScreen` (documents). Le composant mort restant dans `SettingsSectionsB.tsx` est supprimé en §35.

Vérifications : typecheck 0 · eslint 0 · vitest a3/settings/settings-helpers 0.

## Session 34 — Tickets HTML (livraison, retour, règlement) au design ticket de vente

- Nouveaux builders HTML : `buildDeliveryTicketHtml`, `buildReturnSlipTicketHtml`, `buildPaymentTicketHtml` (design ADR-134).
- IPC livraison/retour/règlement renvoient `html80` et impriment en HTML (plus de texte monospace).
- Exportés via le barrel `receipt-documents.ts`.

Vérifications : typecheck 0 · vitest printing 41/41.

## Session 35 — Audit skills, erreurs projet, E2E intensifiés, packaging (2026-10-23/24)

- **Skills** : `veloria-db` (dernière migration `0051_sales_signed_discount.sql`), commande `migration-new`, `db-guardian` (0051) et `qa` (ADR-135) alignés sur l'état réel. `AGENTS.md` vérifié (règles 1-14 inchangées), `verify:fr` et `verify:encoding` verts.
- **Lint** : 15 erreurs `@typescript-eslint/no-explicit-any` dans `delivery-ticket.ts`, `return-ticket.ts`, `payment-ticket-html.ts` — casts `any` supprimés (types `ReceiptData`/`LogisticsDocData`), chaîne optionnelle inutile retirée.
- **Knip** : 2 exports morts supprimés (`PrintingSection` dans `SettingsSectionsB.tsx`, ré-export `TicketCodes` du barrel) → 0.
- **E2E** : nouvelle matrice `docs/reports/E2E_COVERAGE_MATRIX.md` ; ajout `navigation-smoke.spec.ts` (16 modules) et `component-smoke.spec.ts` (rendu + dialogues) ; correctifs : `aria-label` sur les iframes d'aperçu ticket (ADR-134), noms de dialogues réels (`Réception — facture directe`, `Confirmer l'action`), attente iframe 80 mm dans l'historique, stabilisation `restart` (double nettoyage des instances `app.relaunch()`). `full-loop-client` rejoué avec le relais `scripts/e2e-mirror-relay.mjs` (:8100).
- **Portes** : `format:check` 0 · `typecheck` 0 · `typecheck:electron` 0 · `eslint` 0 · `vitest` 151 fichiers / 1052 tests 0 · `test:db` 40 fichiers / 187 tests 0 · `test:e2e` 45 tests (**42 réussis, 3 ignorés** : installateur UAC + drag/redimensionnement OS, **0 échec**) avec relais · `verify:migrations` VERIFIED · `verify:domain` VERIFIED · `verify:fr` 0 · `verify:encoding` 0 · `license:scan` 0 · `knip` 0 · `build` ✓ · `build:electron` ✓.
- **Packaging** : rebuild ADR-023 depuis zéro (`release/` supprimé), POS + License Manager (NSIS machine FR + portables) — `Veloria-PoS-Setup-1.0.0.exe` (`199357…5d9d`), `Veloria-PoS-Portable-1.0.0.exe` (`39f4ea…ab94e`), `Veloria-License-Manager-Setup-1.0.0.exe` (`a61f27…ce3f`), `Veloria-License-Manager-Portable-1.0.0.exe` (`850321…5b0db`), 2 `.blockmap`, `SHA256SUMS.txt`. `release:smoke` **0**, `release:checksums` **0**, `better-sqlite3` **chargé dans les deux runtimes packagés** (Electron 37.2.0, ABI 136, SQLite 3.50.2). `release/win-unpacked/` contient le Manager (dernier empaqueté) ; le POS a été vérifié avant remplacement.

## 36) Session 2026-10-24 — Phase 1 + Phase 2 début (redesign APK client)

- Tokens V4 : échelle gris + dark-mode prep + ombre card renforcée. Kit : focus ring Field.
- Écrans : Home (titre boutique 24, montant dette +4), Invoices (titre 22), Payments (titre 22), Account (avatar 72).
- Portes : typecheck:mobile 0, mobile tests 27/27 verts.

## 37) Session 2026-10-25 — Dashboard NET + catégories + gardes radicaux (migration 0052)

- **Commit** : `f30bf1a` (22 fichiers, +1545/−347) ; ce handoff est le commit `docs(handoff)` associé.
- **Migration 0052** `database/migrations/0052_dashboard_category_snapshots.sql` : `sale_items.category_id` et `return_items.category_id` (catégorie figée à l'opération), `return_items.cogs_minor` (coût FIFO des unités restockées), `supplier_returns.staff_user_id` (attribution manquante), backfills, index de plage/auteur. Vérifiée par `verify:migrations` (52) et `tests/database/migrations.test.ts`.
- **Flux vente/retour** : `createSaleAtomic` précharge la catégorie produit et l'écrit dans chaque ligne ; `createReturnAtomic` copie la catégorie et stocke le coût FIFO restauré (`cogs_minor`), 0 si non restocké ; `createSupplierReturnAtomic` porte `staff_user_id`.
- **Dashboard backend** scindé dans `electron/ipc/handlers/dashboard.repo.ts` (ré-export `finance.repo`) : CA/marge/COGS **nets des retours non annulés**, cash net des remboursements, `byMethod` basé sur `sale_payments` réels − remboursements, `overdueCount`/`upcomingCount` séparés du Top 5, `recentReturns`/`recentPurchases` filtrés (annulés exclus), `overdue`/`upcoming` filtrés par auteur, `daily` complété à zéro, `byCategory` (ventes nettes, retours, marge), `integrityAt` mis en cache (plus de `PRAGMA integrity_check` à chaque affichage), requêtes `created_at >=/<` indexables, index 0052.
- **UI Dashboard** : carte « Ventes et marge par catégorie » avec sélecteur (Toutes / catégorie / Sans catégorie), tableau ventes/retours/marge + total, exports CSV/Excel/PDF enrichis ; tous les agrégats passent par `formatDzdTotal`/`formatDzdTotalSigned` (plus de « — » à 10M DZD ni sur une marge négative), libellés « Encaissements nets », « Instantané global », « top 5 ».
- **Gardes** : annulation refusée si un retour non annulé existe ; retour refusé sur vente annulée **dans le main** ; `enqueueSaleRefresh` après annulation/retour ; miroir paginé par `customer_id` (>500 clients) ; Supabase RLS + revokes + `security_invoker` ; changement d'URL miroir avec clé conservée exige la ressaisie de la clé service ; `database.reset/relocate`, `backup.restore/export`, `sync.saveConfig` réservés au **gérant**.
- **Tests** : `tests/integration/dashboard-net-category.test.ts` (net retours, cash, catégories, auteur, compteurs, annulés) · `tests/unit/format-total.test.ts` · gardes dans `w1-money-atomicity.test.ts` · `requiresServiceKeyReentry` (`sync-protocol`) · `staff-gates-matrix` · migrations 52.
- **Portes** : `typecheck` 0 · `typecheck:electron` 0 · `eslint . --max-warnings 0` 0 · `vitest` **153 fichiers / 1063 tests 0** · `build` ✓ · `build:electron` ✓ (manifeste signé 225 fichiers) · `verify:migrations` VERIFIED · `verify:domain` VERIFIED · `verify:fr` 0 · `verify:encoding` 0.
- **Reste ouvert (phases suivantes)** : verrou PIN client côté Edge (RPC atomique + rate limit), jour métier `Africa/Algiers` (E-35), chiffrement des sauvegardes et refonte QR (PIN/expiration), `maxDevices`, TTL `sync_outbox`/payloads cloud, `format:check` global non rejoué (Prettier ciblé sur les fichiers modifiés).

## 38) Session 2026-10-25 — Caisse : totaux, limites, stock et idempotence (migration 0053)

- **Commit** : `8130ba8` (40 fichiers, +835/−169) ; ce handoff est le commit `docs(handoff)` associé.
- **Frontière monétaire** : `parseDzdInputTotal` / `minorToInputTotal` (MAX_MINOR_TOTAL), validateurs `moneyTotal` / `moneyTotalPositive` pour `saleCreateSchema.amountPaidMinor`, `cartsSaveSchema.amountPaidMinor` et `recordPaymentSchema.amountMinor` ; tous les **totaux** de la caisse utilisent `formatDzdTotal`/`formatDzdTotalSigned` (les prix unitaires gardent `formatDzd`). Les boutons « Encaisser », « Appoint » et « Régler » acceptent désormais un total > 10M DZD sans `MoneyError`.
- **Saisie paiement** : un montant invalide n'est plus converti en 0 ; `paidError`/`deliveryError` sont affichés, la validation est bloquée, et `finalizeSale` revalide le texte avant commit. Un survirement reste une monnaie rendue (plafonné à l'enregistrement).
- **Limites** : `MAX_CART_LINES = 500` et `MAX_CART_TABS = 20` partagés par `saleCreateSchema`, `cartsSaveSchema`, le store et les ajouts (produit/article libre/onglet). `hydrate` tronque défensivement. `carts.load` exige désormais une session.
- **Stock** : ajout/quantité bloqués au-delà du stock affiché ; `createSaleAtomic` refuse **inconditionnellement** le stock négatif (trigger 0037) et ignore l'ancien paramètre ; le toggle « stock négatif » trompeur est retiré des réglages (écriture figée `false`).
- **Archivage** : `createSaleAtomic` refuse un produit `is_active=0` et un client `deleted_at != NULL` pour **toute** vente ; `carts.save` retire un client archivé du brouillon.
- **État caisse** : `clearSaleForm` vide aussi `deliveryText` ; l'hydratation restaure le frais de livraison ; la baisse clavier `-` ne supprime plus une ligne silencieusement (message + croix), la hausse respecte le stock.
- **Complément `2834b26`** : `+`/`−` sont réservés à la quantité de la **dernière ligne** même quand le focus est dans la recherche/scan (aucune saisie dans le champ code-barres) ; les autres champs (client, quantité, livraison, formulaires) conservent la saisie `+`/`−`. Helper pur `shouldIgnoreBump` + tests `bumpLastQty`.
- **Impression / crédit** : `dueDate` est porté par `LastSale`, imprimé sur le ticket et validé par `isRealCalendarDate` ; une vente à crédit avec versement 0 n'imprime plus « ESPÈCES » (méthode null).
- **Permissions UI** : `SellScreen` lit `useStaff` ; le dialogue de prix est désactivé sans `discount`, l'annulation masquée sans `cancel`, « Régler »/« Nouveau client » masqués sans `debts` (le main reste la décision).
- **Idempotence durable** : migration **0053** `cart_drafts.sale_operation_id` ; `openPay` réutilise l'operationId du panier, `finalizeSale` persiste le brouillon avec cet ID **avant** `sales.create`, et le panier est vidé **avant** l'aperçu/l'impression. Un crash après commit rejoue le même ID au redémarrage.
- **Tests** : `sale-guards` (stock/archivés), `sale-money-cap` (1,5 Md centimes, 500/501 lignes), `cart-limits`, `cart-drafts` (operationId persisté), `sell-cashier` (openPay stable), `sell-split` (échéance réelle, dueDate, méthode null), `format-total` (parse/format totaux).
- **Portes** : `typecheck` 0 · `typecheck:electron` 0 · `eslint` 0 · `vitest` **156 fichiers / 1075 tests 0** · `build` ✓ · `build:electron` ✓ (manifeste **227**) · `verify:migrations` VERIFIED (53) · `verify:domain` VERIFIED · `verify:fr` 0 · `verify:encoding` 0.
- **Reste ouvert** : navigation clavier des résultats clients et des onglets ; `dueDate`/onglet actif non persistés dans le brouillon ; aperçu d'un replay si le brouillon a été édité après un commit ambigu ; verrou PIN Edge ; jour métier Algiers ; chiffrement sauvegardes/QR ; `maxDevices` ; TTL cloud.

## 39) Session 2026-10-25 — Conditionnement carton (migration 0054)

- **Commit** : `75f9cba` (slice complète) ; ce handoff est le commit `docs(handoff)` associé. ADR-136.
- **Migration 0054** (0052/0053 déjà prises, règle 12) : table `product_packagings` (facteur > 1, prix vente/achat carton, auto, actif) + index partiel **un seul actif par produit** ; colonnes `packaging_id`/`unit_factor` sur `sale_items`, `stock_intake_items`, `return_items`, `product_barcodes` ; `stock_intake_items.line_total_minor` ; backfills facteur 1 + total payé historique. Aucune vente historique recalculée.
- **Domaine** `src/domain/packaging` : `splitQuantityByCarton`, `priceSaleLine` (1 ligne pièce sous le seuil, sinon 1 carton × n + reste), `allocateUnitCosts`/`allocateUnitCostLayers` (plus grand reste compact, 1–2 paliers, somme exacte), `toBaseQuantity`. Tarif carton appliqué seulement si `(facteur−1) × prix pièce ≤ prix carton < facteur × prix pièce` ⇒ **monotonicité** garantie.
- **Vente** : `buildSalePayload`/`totalsOf` projettent les lignes caisse via `expandSaleLines` ; `createSaleAtomic` agrège le stock **par produit en unités de base AVANT écriture**, consomme le FIFO sur `baseQty`, écrit `sale_items.packaging_id/unit_factor` et des mouvements `-baseQty`. Le main relit le conditionnement en DB : facteur, prix carton et prix d'origine doivent correspondre, sinon refus FR. Double-submit operationId = une seule vente.
- **Achat** : `unitFactor`/`packagingId` acceptés ; quantité reçue en cartons, abîmés en pièces ; `line_total_minor = prix × reçus + fret` ; `netBase = reçus × facteur − abîmés` ; `allocateUnitCostLayers` crée 1–2 couches FIFO dont la somme vaut le total payé ; `purchase_price_minor` dérivé par pièce (prix de vente jamais écrasé). Retours fournisseur éligibles en unités de base.
- **Retours client** : `unit_factor` porté par la ligne de retour ; sélection de la ligne vendue dans la **même unité** ; éligibilité cumulée en unités de base ; carton complet uniquement (retour partiel refusé) ; restock/FIFO/mouvement en `baseQty` ; annulation miroir en unités de base.
- **UI FR** : section « Conditionnement » du formulaire produit (libellé, taille, prix carton vente/achat, tarif auto) ; caisse « N unités — X carton(s) de F + R unité(s) », badges **Tarif carton**, **Économie : …**, **Prix manuel** (règle désactivée) ; achat « Unité d'achat Carton/Pièce » + résumé `N pièces — coût/pièce` ; ticket avec lignes « carton » et « pièce » (libellé figé dans `unit_code`).
- **Rapports** : Top produits, rotations Dashboard et `stock_qty` des retours multiplient par `unit_factor` (unités de base) ; les montants restent les totaux de ligne figés.
- **Tests** : `packaging-rules` (découpage, arrondis, monotonicité, totaux exacts), `packaging-allocation-parity` (domaine ↔ main), `packaging-slice` (vente mixte, double-submit, facteur/prix forgés, rollback stock, retours carton/pièces, achat 3 cartons + 2 abîmés avec couches exactes), contrats gelés et migrations à jour.
- **Portes** : `format:check` 0 (un fichier de la session 38 réaligné) · `typecheck` 0 · `typecheck:electron` 0 · `eslint . --max-warnings 0` 0 · `vitest` **159 fichiers / 1103 tests 0** · `build` ✓ · `build:electron` ✓ (manifeste **230**) · `verify:migrations` VERIFIED (54) · `verify:domain` VERIFIED · `verify:fr` 0 · `verify:encoding` 0 · `knip` **0**.
- **Hors périmètre Phase 1** : code-barres carton, retour partiel de carton (allocation cumulative), plusieurs niveaux de carton, prix de gros client. À noter : un changement de prix/conditionnement entre l'ajout au panier et l'encaissement est refusé (message FR « rafraîchissez le panier »), jamais appliqué silencieusement.

## 40) Session 2026-10-25 — Coût FIFO en caisse (ADR-137)

- **Commit** : `86876ca` (10 fichiers, +384/−16) ; ce handoff est le commit `docs(handoff)` associé. ADR-137.
- **Symptôme** : après réception d'un stock à un nouveau prix, la caisse comparait le prix facturé au dernier prix d'achat (`products.purchase_price_minor`) : vendre l'ancien stock à son ancien prix déclenchait une fausse alerte « sous coût » et l'audit `sale.created` mémorisait un coût erroné, alors que le COGS FIFO des rapports était déjà correct.
- **Correctif** : `products.search`/`products.getByBarcode` exposent `fifo_next_unit_cost_minor` (plus ancienne couche restante) ; `sell-search.addProduct` l'utilise comme coût de référence ; le dialogue prix affiche « Coût FIFO » et l'alerte sous-coût s'appuie dessus. `createSaleAtomic` calcule le sous-coût **après** `consumeLayers` en comparant le total facturé au COGS FIFO réel, et fige `sale_items.purchase_price_minor` au coût FIFO moyen de la ligne. `products.purchase_price_minor` reste le dernier coût (ADR-021) ; rapports/valorisation inchangés.
- **Tests** : `tests/integration/fifo-sale-cost.test.ts` (prochaine couche exposée, vente couverte par l'ancien stock non signalée, audit réel quand la ligne traverse les couches).
- **Portes** : `typecheck` 0 · `typecheck:electron` 0 · `eslint . --max-warnings 0` 0 · `vitest` **160 fichiers / 1106 tests 0** · `build` ✓ · `build:electron` ✓ (manifeste **230**) · `verify:migrations` VERIFIED (54) · `verify:domain` VERIFIED · `verify:fr` 0 (334) · `verify:encoding` 0 (913).
- **Reste ouvert** : l'avertissement préalable est basé sur la prochaine unité (estimation) ; pour une ligne qui traverse plusieurs couches, seul l'audit serveur est exact. Le prix d'achat affiché dans Stock/Produits reste le dernier prix d'achat (référence d'achat) ; la valeur du stock reste FIFO.

## 41) Session 2026-10-25 — Retours : imputation automatique sur la dette (ADR-138, migration 0055)

- **Demande** : fiche d'audit du module retours — le stock revenait mais le solde client ne bougeait pas ; vérifier aussi les rapports. Après preuve des défauts, décision propriétaire : **خصم تلقائي من الدين أولًا**.
- **Constats prouvés** : remboursement espèces sur une vente à crédit ⇒ dette et document intacts ; avoir > solde perdu (Q6) ; crédit imputé compté comme **espèces** dans le Z ; avoir impossible après clôture du jour de vente (trigger 0048) ; valeur de retour au **prix catalogue** (avant remise) et **première ligne** du produit ; `Rapports` (hors Dashboard) brut.
- **Migration 0055** (`0055_return_credit_allocations.sql`) : `sales.credit_applied_minor` + triggers `0 <= crédit <= payé` ; table `customer_credit_allocations` (`return_id`, `customer_id`, `sale_id` nullable = crédit non affecté, montant, date) + index + triggers d'appartenance/plafond ; `return_items.sale_item_id` + index ; recréation de `v_customer_balance_check` (soustrait les crédits non affectés) et `v_daily_sales` (`paid_minor` hors crédit). Aucune migration 0001-0054 modifiée.
- **Main** : `return-settlement.ts` (règle pure, miroir testé de `computeReturnSettlement`) ; `createReturnAtomic` calcule `creditApplied = min(valeur nette, solde)`, alloue la vente d'origine puis les ventes ouvertes les plus anciennes, laisse la vente d'un jour clos intacte (crédit non affecté), met à jour `customers.outstanding` dans la même transaction, refuse les espèces au-delà de l'excédent, stocke le crédit **réellement imputé**, calcule statut/reste dessus ; `finance.repo.ts` exclut `credit_applied_minor` du Z et de la zakat ; `credit-gates.ts` exige `debt-management` dès qu'un client a une dette ; `getReturnableSaleItems` expose le solde et l'éligibilité par ligne.
- **Valeur nette** : le retour utilise `sale_items.line_total_minor` au prorata (`× qté retournée / qté vendue`, plafonné au reste de la ligne) et `sale_item_id` ; `return_items.sale_item_id` trace la ligne. Plus de sur-remboursement sur une ligne remisée ni de mélange entre deux lignes du même produit.
- **UI** : `NewCustomerReturnDialog` affiche dette actuelle / dette après retour, avoir automatique en lecture seule, espèces préremplies avec l'excédent (champ désactivé si 0), envoie `saleItemId`, total par ligne net ; `DetailsDrawer`/liste affichent le crédit réellement imputé ; `ReturnsScreen` renomme le KPI « Retours (total) » (le compteur n'était pas journalier).
- **Tests** : `tests/integration/returns-auto-settlement.test.ts` (7 : cash sur dette, multi-factures, jour clos, Z, remise, deux lignes du même produit, idempotence) ; `w1-money-atomicity` adapté (5 cas de règlement) ; `domain-rules` + `main-domain-parity` ; vérification 0055 dans `verify-migrations` ; E2E `credit-return` **3/3**, dont le scénario propriétaire vente à crédit → retour → dette réduite automatiquement.
- **Portes** : `typecheck` 0 · `typecheck:electron` 0 · `eslint` (fichiers touchés) 0 · **vitest 161 fichiers / 1121 tests 0** · `build` ✓ · `build:electron` ✓ (manifeste **232**) · `verify:migrations` VERIFIED (55) · `verify:domain` VERIFIED · `verify:fr` 0 (335) · `verify:encoding` 0 (917) · `knip` 0 · `format:check` 0 · E2E ciblé 3/3.
- **Base réelle (copie)** : 0055 appliquée sur une copie de `%PROGRAMDATA%\Veloria PoS\Data\Veloria POS DB.sqlite` (844 Ko) ⇒ `integrity_check=ok`, **0 violation FK**, colonne/table/`sale_item_id` présents. Aucune écriture sur l'original.
- **Piège E2E** : la session shell avait `ELECTRON_RUN_AS_NODE=1` ⇒ `electron.launch` échoue « Process failed to launch ! ». Faire `unset ELECTRON_RUN_AS_NODE` avant `npm run test:e2e` (les 3 specs `credit-return` passent ensuite).
- **Reste ouvert** : `Rapports` (hors Dashboard) affiche toujours ventes/marges **brutes** (décision de netting à prendre) ; les remboursements complémentaires n'ont pas de date de paiement propre (le Z les impute au jour de création) ; le crédit non affecté n'a pas de ligne UI dédiée dans le tiroir client ; la double source `customers.outstanding` vs `sales.remaining` reste (Q7), désormais allouée/alignée et contrôlée par `v_customer_balance_check`.

## 42) Session 2026-10-25 — Caisse : codes-barres à lettres + ajout direct sur correspondance

- **Demande propriétaire** : « le code-barre doit supporter les lettres, et quand il correspond à la recherche il s'ajoute directement au panier de vente ».
- **Constat** : le chemin « code-barres exact » existait mais exigeait `[0-9A-Za-z-_.]{4,}`, comparait la casse en SQL (`barcode = ?`) et n'était pas prioritaire sur le préfixe quantité. Un code court (`A1`), à symboles (`AB/CD-12`) ou saisi/scanné dans une casse différente de la fiche n'était donc jamais ajouté directement ; un scan machine inconnu à lettres restait silencieux et le scan suivant se concaténait au champ.
- **`src/features/sales/sell/sell-search.ts`** : `isBarcodeLike` = jeton unique (aucun espace) ≥ 2 caractères, lettres/symboles/chiffres. `runSearch` tente **toujours** le code-barres exact en premier — d'abord le **jeton complet** (un vrai code `2X500G` gagne sur « 2 × 500G »), puis le code du préfixe quantité explicite (`2x AB-12`, `1,5*619…`), puis seulement la recherche texte. En **rafale machine**, le préfixe quantité est désactivé : un code scanné peut contenir `x`/`*`, jamais interprété comme « 2 × 500G » (la quantité rapide reste une saisie humaine). Un échec issu d'une **rafale machine** (`scanBurstRef`) affiche « Code-barres inconnu… » et vide le champ, y compris pour un code alphanumérique (avant : silence + concaténation `CODE1CODE2`).
- **`electron/ipc/handlers/products.repo.ts`** : `getProductByBarcode` et `searchProducts` comparent le code avec `COLLATE NOCASE` (ASCII) ; à casse identique la correspondance exacte garde la priorité (`ORDER BY (barcode = ?) DESC`, puis principal/ancienneté). Aucun changement d'écriture, d'unicité ni de migration : la casse stockée reste intacte (les codes réellement sensibles à la casse ne sont pas réécrits).
- **Tests** : `tests/unit/sales/sell-split.test.ts` — prédicat élargi, ajout direct lettres+symboles, code court, `2X500G` prioritaire, rafale `2X500G` inconnu sans interprétation quantité, préfixe `2*AB-12`, scan inconnu alphanumérique (message + vidage), saisie humaine inconnue (ni message ni vidage) ; nouveau `tests/integration/barcode-lookup.test.ts` (4 : scan majuscules → fiche minuscule, liste caisse, priorité casse exacte, symboles stricts).
- **Portes** : `tsc -b` 0 · `typecheck:electron` 0 · eslint (fichiers touchés) 0 · **vitest 162 fichiers / 1132 tests 0** · `build` ✓ · `verify:migrations` VERIFIED (55). E2E non rejoués (pas de changement de flux UI ; logique couverte unit + intégration).
- **Décision assumée** : l'ajout automatique reste réservé à une **correspondance code-barres exacte** ; une recherche par nom (même à résultat unique) conserve ↑↓ + Entrée — sinon une pause de frappe ajouterait un produit non voulu.
- **Reste ouvert** : deux codes-barres ne différant que par la casse peuvent coexister (contrainte `UNIQUE` BINARY) ; la recherche ignore la casse et privilégie la casse exacte, mais l'import CSV ne détecte pas encore ce doublon de casse. Une normalisation/unicité NOCASE demanderait une migration dédiée.

## 43) Session 2026-10-26 — Annulation / correction des factures de vente et d'achat (ADR-139)

- **Demande propriétaire** : « ajouter la possibilité de modifier ou annuler une facture de vente ou d'achat ». Choix validés : vente = **annuler puis rééditer** (pas de modification en place) ; achat = **facture fournisseur / réception de stock** ; permissions existantes (`cancel` pour la vente, `stock` pour l'achat).
- **Vente — canal `sales.reopen`** (`electron/ipc/handlers/sales.repo.ts` `reopenSaleAtomic`, idempotent, permission `cancel`) : construit d'abord le panier de réédition (refus si produit archivé), puis annule dans la **même transaction** via `cancelSaleAtomic` (stock, couches FIFO, paiements, solde client), écrit `sale.reopened` dans l'audit et renvoie les lignes. Rejouer le même `operationId` renvoie le même panier. **Aucune ligne historique n'est modifiée** ; la nouvelle facture reçoit un nouveau numéro.
- **Reconstruction du panier** : lignes pièces (prix, remise, **montant saisi verrouillé** conservé), lignes **carton** converties en unités de base + métadonnées packaging (tarif carton, facteur, libellé, `auto=true`) avec un prix pièce qui rend le tarif carton applicable et **conserve le total** ; coût de référence = prochaine couche FIFO. Client et frais de livraison repris ; montant encaissé remis à zéro (nouvel encaissement).
- **UI vente** : bouton « Modifier la vente (annuler et rééditer) » dans le détail de l'Historique, à côté de l'annulation ; le brouillon passe par `src/shared/sales/pending-sale-edit.ts` puis est appliqué par `useSellState` **après l'hydratation des paniers persistés** (sinon écrasé), via `cart-store.openTabWith` (réutilise un panier vide, sinon nouvel onglet, limite 20) et navigue vers la Caisse (`onNavigate` passé par le shell). Le stock affiché est celui **après annulation** (sinon une vente ayant vidé le stock resterait « en rupture ») et le contexte crédit du client est rechargé (autorisation/solde/plafond).
- **Achat — `stock.intakeDetail` + `stock.intakeCancel`** (`inventory.repo.ts`) : annulation d'une réception **intacte** — refus FR si statut ≠ committed, retour fournisseur vivant, couches FIFO consommées/incohérentes, réception historique sans couches, solde fournisseur insuffisant (facture déjà réglée) ou réception liée à un **bon de commande** réceptionné. Sinon : stock − quantité nette, couches neutralisées (`remaining = 0`, jamais supprimées), mouvement `adjust_out` (`related_entity_type = intake_cancel`, référence facture), dette fournisseur − total, statut `cancelled`, audit `stock.intake_cancelled`, idempotence.
- **UI achat** : `StockIntakesDrawer` — lignes cliquables, statut Validée/Annulée, détail (fournisseur, totaux, quantités reçues/abîmées/net, ligne), boutons « Annuler la facture » et « Corriger (annuler et recréer) ». La correction ouvre `StockIntakeDialog` prérempli (fournisseur, n° facture, date, livraison, notes, produits, quantités, prix d'achat hors fret reconstruit). Le prix de vente saisi n'est pas conservé (le prix catalogue actuel reste référence). Les stats fournisseur (`last_intake_at`, `intake_count`) et le compteur d'entrées de la fiche fournisseur excluent désormais les réceptions annulées.
- **Correctif découvert** : `cancelSaleAtomic` remettait `amount_paid = 0 / remaining = total` ; pour une vente **sans client** (ou client sans crédit autorisé), le trigger 0051 « crédit » refusait cette écriture. Les ventes annulées sans créance possible sont désormais **soldées** (`paid = total`, `remaining = 0`, paiements supprimés, vente annulée) ; les ventes à crédit autorisées gardent le miroir E-25. Aucun impact rapports (tous filtrent `is_cancelled = 0` / `sale_payments` supprimés).
- **Aucune migration** : `stock_intakes.status` acceptait déjà `cancelled` ; mouvement en `adjust_out` existant. ADR-139 créé ; `docs/INDEX.md` mis à jour (non commité, voir ci-dessous).
- **Tests** : `tests/integration/sale-reopen.test.ts` (6 : annulation/panier, idempotence, retours, produit archivé, ligne carton, montant saisi) ; `tests/integration/intake-cancel.test.ts` (7 : annulation complète, idempotence, stock consommé, retour fournisseur, facture réglée, bon de commande, sans fournisseur) ; `tests/unit/sales/cart-store-open-draft.test.ts` (4) ; garde ADR-021 de `fifo-layers` mise à jour (annulation seule, pas d'update/delete) ; snapshot `ipc-channels.json` +3 canaux.
- **Portes** : `tsc -b` 0 · `typecheck:electron` 0 · eslint (fichiers touchés) 0 · **vitest 165 fichiers / 1149 tests 0** · `build` ✓ · `verify:migrations` VERIFIED (55). **E2E non rejoués** (flux UI non couvert par Playwright cette session).
- **Limites assumées** : pas de modification en place ; réception liée à un bon de commande → retour fournisseur ; stock consommé → retour fournisseur/ajustement ; l'annulation d'une réception crée un mouvement « ajustement » (filtre Stock), pas un type dédié ; jour clos non bloquant (même comportement que l'annulation de vente).
- **Git** : code/tests/ADR commités séparément ; `handoff.md` et `docs/INDEX.md` laissés dans l'arbre car ils contiennent aussi les modifications non commitées de la session 41.

## 44) Session 2026-10-26 — Catalogue : étiquettes de la sélection multi-pages

- **Demande propriétaire** : après avoir coché des produits sur plusieurs pages du Catalogue, « Étiquettes » n'imprimait que les produits de la page affichée.
- **Cause prouvée** : la sélection (`Set<number>`) survivait bien aux changements de page, mais `openLabelsSelection` construisait les étiquettes en filtrant `rows` (page courante) par la sélection. Les fiches des pages précédentes n'étaient plus disponibles au moment de l'impression.
- **Correctif UI** : `ProductsScreen` stocke la sélection dans `Map<number, Product>` — cocher une ligne mémorise la fiche, la page suivante ne l'écrase pas. `toggleSelectPage`, archivage (`[...selection.keys()]`) et les remises à zéro utilisent la Map. Helper pur `labelTargets(products)` (`src/features/products/types.ts`) : ignore les produits sans code-barres et projette `{ name, priceMinor, barcode }` ; `LabelTarget` y est déplacé (LabelsDialog et ré-export `ProductDialogs` mis à jour). Aucun canal IPC, aucune migration, aucun ADR.
- **Tests** : `tests/unit/catalogue.test.ts` — régression « selection across ALL pages » (2 produits de 2 pages, sans code-barres ignoré) ; nouveau `tests/e2e/catalogue-labels.spec.ts` — import CSV de 21 produits (2 pages), 1 coché sur chaque page, l'aperçu iframe contient **2** `.label` (1 seul avant le correctif). La licence du harnais E2E accorde `excel-export` (import CSV) et `barcode-scanner` (aperçu des étiquettes), nécessaires aux flux réels.
- **Limite assumée** : la fiche mémorisée est celle du moment de la coche (nom, prix, code-barres) ; modifier un produit passe par `refresh()` qui vide la sélection.
- **Portes** : `tsc -b` 0 · `typecheck:electron` 0 · eslint (fichiers touchés) 0 · prettier 0 · **vitest 165 fichiers / 1150 tests 0** · `build` ✓ · `build:electron` ✓ (manifeste **232**) · `verify:fr` 0 (336 fichiers) · **E2E `catalogue-labels` 1/1** · `graphify update` rejoué.
- **Git** : correctif + tests + E2E commités ; `handoff.md` laissé dans l'arbre pour la même raison qu'en §43 (modifications non commitées de la session 41).

## 45) Session 2026-10-26 — Carton : devis convertibles + retours fournisseur en unités justes (ADR-140, migration 0056)

- **Demande propriétaire** : « فحص و التحقق من نظام تعبئة الكرتون و اصلح الأخطاء جذريا » (auditer et corriger à la racine le conditionnement carton).
- **Défaut 1 — devis carton incohérent** : `createProforma` envoyait les lignes de panier **avant** découpage (`15 × prix pièce`) alors que l'aperçu utilisait le total carton. Le devis stocké valait 30000, l'aperçu 28000, et la conversion facturait 30000. Correctif : `expandSaleLines` pour les lignes ET l'impression (`buildProformaLines`), snapshot `packaging_id`/`unit_factor`/`unit_code` sur `proforma_items` (migration 0056), validation main du conditionnement, `unit_factor` entier obligatoire pour une ligne carton.
- **Défaut 2 — conversion perdait le conditionnement** : `convertProformaToSaleAtomic` créait une ligne `PIECE` quantité 1 (au lieu de 12 unités de base) et ne pouvait pas honorer un devis dont le tarif carton avait changé. Correctif : `createSaleAtomic` accepte `trustedPackagingSnapshot` (**interne main, absent du schéma IPC**) pour les conversions de devis : facteur/prix du devis font foi, le stock/FIFO utilisent `quantité × unit_factor`, le conditionnement courant n'est pas revalidé. `sales.create` continue de revalider strictement.
- **Défaut 3 — retours fournisseur en unités mélangées** : l'écran affichait « reçu 3 » (cartons) et « restant 36 » (pièces), saisissait des pièces sans le dire, et proposait 36 alors que seules 34 étaient en stock (les 2 abîmées n'ont jamais été stockées) ⇒ refus « Stock insuffisant ». Correctif : `supplier_return_items.quantity_stock` + `quantity_damaged` (migration 0056, backfill stock=quantity/abîmées=0), éligibilité = **couches FIFO restantes + abîmées non retournées**, mutation : la part stock sort du stock, la part abîmée non ; annulation : seule `quantity_stock` revient. `intakeItemId` optionnel : chaque ligne d'achat est valorisée à **son** prix (carton vs pièce), plus au prix de la première ligne du produit. Journal de couches **agrégé par produit** pour ne pas rejouer la restauration sur deux lignes du même produit.
- **Défaut 4 — correctif latent** : l'INSERT du mouvement d'annulation de retour avait **un placeholder de trop** (10 colonnes / 11 valeurs) ⇒ toute annulation de retour client ou fournisseur échouait en SQL. Corrigé dans les deux branches et couvert par 2 régressions.
- **UI FR** : détail/édition de devis affiche l'unité carton (`Carton de 12 × 12`) et permet d'ajouter une ligne carton au tarif courant ; retour fournisseur affiche « reçu X cartons = Y pcs », « stock N + abîmées M = restant », saisie explicitement en pièces ; le devis depuis la caisse imprime les lignes carton + reste.
- **Tests** : `packaging-slice` (7 → 9 : retour 36 = 34 stock + 2 abîmées, annulation idempotente, deux lignes même produit) ; `proforma-convert-discount` (+1 : devis carton 28000, conversion après désactivation/changement de tarif, stock 85) ; `packaging-rules` (clé d'idempotence conditionnement) ; `sell-split` (impression devis éclatée) ; `migrations` (56) et `verify:migrations` (0056).
- **Portes** : `tsc -b` 0 · `typecheck:electron` 0 · eslint (fichiers touchés) 0 · prettier 0 · **vitest 165 fichiers / 1156 tests 0** · `build` ✓ · `verify:migrations` **56** ✓. E2E non rejoués (flux caisse/devise couverts par unit + intégration ; aucun changement de canal).
- **Git** : nos fichiers sont dans l'arbre avec la session 41 non commitée ; ne pas committer en bloc sans validation propriétaire (voir §1).
- **Hors périmètre inchangé** : code-barres carton (Phase 3), retour partiel de carton, plusieurs niveaux, prix de gros. La réédition d'une vente carton (`sales.reopen`) reconstruit le panier avec le tarif historique ; si le tarif courant a changé, la revalidation de `sales.create` refuse avec « rafraîchissez le panier » — comportement antérieur, non modifié ici.

## 46) Session 2026-10-26 — Test réel du tarif de gros carton (œufs) + ADR-141

- **Demande propriétaire** : ouvrir le programme et vendre **1 carton + 4 pièces** d'œufs (1 carton = 30, achat 540 DZD, vente carton 650 DZD, vente pièce 25 DZD), vérifier le comportement et corriger tout écart.
- **Test réel** : nouvel E2E `tests/e2e/carton-sale.spec.ts` (vraie fenêtre Electron, base temporaire isolée + licence E2E) — création du produit avec conditionnement, panier 34 pièces, encaissement, ticket, puis lecture SQLite. Sur cette machine, Playwright doit lancer Electron sans `ELECTRON_RUN_AS_NODE` : `env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/carton-sale.spec.ts`.
- **Écart trouvé** : le panier affichait bien « 34 unité(s) — 1 carton de 30 + 4 unité(s) », mais **aucun badge « Tarif carton »**, aucune économie, et le total restait **850 DZD** (34 × 25). Cause : le plancher ADR-136 `(facteur−1) × prix pièce` exigeait `29 × 25 = 725 ≤ 650`, donc le tarif carton 650 était ignoré. Avec ce prix, la baisse au seuil (29 = 725, 30 = 650) est pourtant le tarif de gros voulu.
- **Correctif racine** : `priceSaleLine` ne conserve que `prix carton < facteur × prix pièce` (le carton doit être une remise sur le plein au prix pièce) ; le plancher `(facteur−1)` est supprimé. `buildReopenDraft` aligné (plus de plancher, ajustement du prix pièce seulement si le tarif historique dépasse le plein actuel). ADR-141 révise ADR-136 décision 4. Aucune migration, aucun canal, aucun schéma.
- **Résultat E2E après correctif** : badge **Tarif carton**, économie **100,00 DZD**, total **750,00 DZD** (650 + 4 × 25), ticket avec `Carton de 30` et total 750, lignes `sale_items` = `1 × 30 @65000` (packaging_id non nul) + `4 × 1 @2500`, sous-total 85000, remise 10000, payé 75000, stock produit **0** et couches FIFO **0**.
- **Tests** : `packaging-rules` — cas propriétaire 29/30/34 (725 / 650 / 750), carton ≥ plein prix pièce ignoré ; E2E carton 1/1. Suite complète : **165 fichiers / 1156 tests 0**, typecheck/electron 0, eslint 0, build ✓. `verify:migrations` 56 inchangé.
- **Git** : même situation qu'en §45 (session 41 non commitée) — aucun commit global effectué.

## 47) Session 2026-10-26 — Formulaire produit simplifié

- **Demande propriétaire** : « قم بتبسيط و تطوير واجهة ادخال منتج » (simplifier et améliorer l'interface de saisie produit).
- **Refonte UI** (`src/features/products/dialogs/FormDialog.tsx`) : le formulaire est passé d'une colonne interminable à **deux colonnes** groupées — **Identification** (nom, codes-barres, catégorie, unité), **Prix** (achat/vente + marge), **Stock & seuils** (stock, seuil, péremption), **Conditionnement** — puis **Options avancées** repliées (fournisseurs liés avec filtre si > 6, stock maximum, produit actif en édition). Les codes-barres deviennent des puces compactes avec bouton d'ajout explicite ; la catégorie peut être créée à la demande (`+`) au lieu d'un champ toujours visible.
- **Gains ergonomiques** : aperçu de **marge en direct** (montant + %, vert ; rouge + « vente à perte » si sous coût), barre d'enregistrement **fixe** en bas (Annuler / Créer ou Enregistrer), raccourci **`Ctrl+Entrée`**, champs montants en police tabulaire, `scroll-margin` sous les champs pour que le focus clavier ne soit pas masqué par la barre fixe. Tous les libellés et `aria-label` utilisés par les tests existants sont conservés.
- **Correctif UX** : un code-barres saisi/scanné **sans Entrée** est désormais inclus dans la liste au moment d'enregistrer (avant, il était silencieusement perdu).
- **Contraintes** : interface 100 % FR, aucun import Electron/Node/SQLite, aucun canal IPC, aucun schéma, aucune migration, aucun ADR (polish UI). Le formulaire reste branché sur `productCreate`/`productUpdate` + `productSetSuppliers` + `productPackagingSave` existants.
- **Vérification réelle** : spec E2E temporaire (supprimée) — création d'un produit avec code-barres, prix 180/250 (marge 70,00 DZD · 38,89 %), conditionnement carton, enregistrement, puis réouverture en édition : valeurs rechargées (nom, prix, carton) confirmées. Captures : `test-results/product-form*.png` (artefacts non versionnés).
- **Portes** : `tsc -p tsconfig.json --noEmit` 0 · eslint (fichier) 0 · prettier 0 · **vitest 165 fichiers / 1156 tests 0** · `build` ✓ · `build:electron` ✓ (manifeste **233**) · `verify:fr` 0 (336 fichiers) · **E2E `carton-sale` 1/1 + `scan-flow` 6/6** · `graphify update .` rejoué.
- **Git** : commit **`4a993c2`** (formulaire seul) ; `handoff.md` laissé dans l'arbre car il contient aussi les modifications non commitées des sessions 41/45 (même pratique qu'en §43/§44).
- **Hors périmètre** : pas de modification des règles métier (validation, marge, stock, conditionnement), pas de nouvel écran ni de nouveau canal IPC.

## 48) Session 2026-10-26 — Réception fournisseur simplifiée

- **Demande propriétaire** : « قم بتبسيط و تطوير واجهة ادخال مخزون جديد » (simplifier et améliorer l'interface d'entrée de stock).
- **Refonte UI** (`src/features/stock/dialogs/IntakeDialog.tsx`, `Modal extraWide` dans `primitives.tsx`) : modale élargie à **960 px**, regroupée en **Facture fournisseur** (fournisseur replié derrière « Choisir », recherche + création inline, N° facture/date/livraison sur une ligne), **Articles reçus** (cartes de ligne compactes) et **Notes de réception** (repliables). Le **total et le bouton « Valider la réception » sont fixes** en bas ; le détail sous-total/livraison et l'alerte « ligne(s) à compléter » y restent visibles.
- **Lignes** : un seul champ de recherche produit (nom/code-barres, résultats avec stock), ou **« Nouveau produit par nom »** avec mention explicite de la création au catalogue (unité Pièce — comportement backend existant). Unité d'achat **pièce/carton** conservée (`aria-pressed`), libellés d'unité dynamiques et courts (pièce, kg, l…), quantités/prix en police tabulaire, résumé par ligne (net, total ligne, quote-part livraison si > 0, coût rendu, nouveau prix de vente). « Changer » remet à zéro unité, conditionnement, quantités et prix pour éviter de réutiliser les données du produit précédent.
- **Sécurité de saisie** : une ligne **commencée** mais invalide (produit/nom, quantité > 0, prix) bloque la validation avec un message FR listant les lignes et **défilement automatique** vers la première ligne fautive ; une ligne neuve laissée intacte reste ignorée. Le total affiche « — » tant qu'une ligne commencée est incomplète, qu'aucune ligne valide n'existe ou que la livraison est invalide. Le prix de vente vide indique « 0 DZD » en mode nouveau produit, « conserver » sinon. Les anciennes validations domaine/main (prix, facteur, unités, stock) sont inchangées.
- **Garde Entrée (bug latent corrigé)** : le panneau est désormais un `<form>` ; le raccourci global de `Modal` ne peut plus cliquer le bouton principal depuis un champ (avant, Entrée dans le N° facture ou la recherche produit déclenchait « Valider la réception »). Entrée dans un champ ne valide plus rien ; **`Ctrl+Entrée`** valide explicitement et reste un retour à la ligne dans les notes.
- **Tests** : nouveau test E2E dans `tests/e2e/stock-backup.spec.ts` — « Entrée ne valide pas » (N° facture + Entrée ⇒ aucune alerte) puis ligne commencée « zzz » + « Valider la réception » ⇒ alerte « Ligne(s) 1 incomplète(s) », dialogue toujours ouvert (aucune réception créée) ; le test existant « le stock augmente » passe. Vérification visuelle réelle (produit carton, réception 2 cartons + ligne libre 3 pièces, erreur ligne incomplète, puis succès 720 DZD) via spec temporaire supprimée ; artefacts `test-results/intake-*.png` non versionnés.
- **Portes** : `tsc -p tsconfig.json --noEmit` 0 · eslint (fichiers touchés) 0 · prettier 0 · **vitest 165 fichiers / 1156 tests 0** · gardes UI statiques (`a2`, `a3`, `import-export-ui`, `sql-guard`, `ui-dialog-focus`) **18/18** après les derniers ajustements · `build` ✓ · `build:electron` ✓ (manifeste **233**) · `verify:fr` 0 (336 fichiers) · **E2E `stock-backup` 4/4**. `graphify update` à rejouer après cette session.
- **Git** : commits **`c4a4208`** (refonte IntakeDialog + Modal `extraWide` + test E2E) et **`ebbd5c3`** (garde Entrée + test) ; `handoff.md` laissé dans l'arbre car il contient aussi les modifications non commitées des sessions 41/45 (même pratique qu'en §43/§44/§47).
- **Hors périmètre** : aucun changement backend/canal/schéma/migration ; la réception libre continue de créer un produit PIECE au catalogue (contrat existant), et la réédition d'une facture annulée conserve les limites antérieures (prix de vente non conservé).

## 49) Session 2026-10-26 — Coût rendu, prix carton auto, paramètres et formulaires

- **Demande propriétaire** : (1) champ coût produit automatique + répartition de la livraison sur les produits de la facture de réception ; (2) simplifier/reconstruire les Paramètres ; (3) calcul automatique pièce ↔ carton ; (4) simplifier le formulaire client ; (5) organiser les champs produit/client ; (6) code-barres en majuscules même sans Verr. Maj. Contrainte : respecter la session parallèle (retours/proforma non commitée).
- **Coût rendu (ADR-142)** : `receiveStockAtomic` répartit déjà la livraison au prorata exact (`allocateAmountByWeights`) ; `products.purchase_price_minor` reçoit désormais `landingUnit` (fret inclus) pour un produit existant **et** pour un produit créé par nom. La réception affiche la part livraison + coût rendu par ligne et un bloc « Répartition de la livraison » ; le catalogue et la fiche parlent de **Coût**. Test `intake-landed-cost.test.ts` (3 produits, parts 200/300/100, coûts 1 100/3 300/550) ; attente `packaging-slice` 1 941 → 1 971.
- **Prix carton auto (ADR-144)** : helper pur `carton-price-sync.ts` (× facteur, ÷ facteur arrondi centime). Le côté non saisi se calcule ; un prix **manuel** n'est jamais écrasé (le scénario œufs 25/650/30 reste à 750 DZD, E2E carton rejoué). Le bouton « Recalculer » force la conversion depuis les prix pièce. Formulaire réorganisé : Identification + Stock à gauche, Prix & coût + Conditionnement à droite.
- **Paramètres (ADR-143)** : `SettingsScreen` reconstruit — 7 rubriques en 3 groupes avec icônes/descriptions, recherche indexée (`searchSettings`, Ctrl+K), résultats vers la carte, sous-navigation par puces et ancres, en-tête collant ; informations fiscales repliées et ouvertes si déjà remplies. Libellés historiques conservés en `aria-label` (E2E). `Section` modernisée et `SettingsGroup` ajouté ; aucune fonctionnalité retirée.
- **Client (ADR-144)** : formulaire en sections Identité & contact / Adresse / Crédit & règlement / Notes repliées ; aperçu prénom/nom ; barre fixe + `Ctrl+Entrée` ; champs et `aria-label` existants conservés (`Nom complet`, `Créer le client`).
- **Code-barres (ADR-144)** : helper UI ASCII (`uppercaseBarcodeInput`), appliqué au champ produit et aux recherches caisse/catalogue/stock/réception ; normalisation au stockage main (`normalizeBarcodeText`) pour création, mise à jour et import CSV ; recherches existantes NOCASE/LIKE conservées. Tests unitaires + intégration + E2E `barcode-uppercase`.
- **Tests/portes** : `tsc -b` 0 · `typecheck:electron` 0 · `eslint . --max-warnings 0` 0 · **vitest 169 fichiers / 1 170 tests 0** · `build` ✓ · `build:electron` ✓ · `verify:migrations` 56 ✓ (0055/0056 de la session 41, non modifiées) · `verify:domain`/`verify:fr` 340 fichiers/`verify:encoding` 941 fichiers ✓ · `graphify update .` ✓ (avertissement préexistant `TemplateSettingsPanel.tsx`). E2E ciblés : `navigation-smoke` + `component-smoke` 2/2, `carton-sale` 1/1 (750 DZD), `customer-invoice` 2/2, `settings-navigation` 1/1, `barcode-uppercase` 1/1.
- **Git** : commits **`bfef912`** (30 fichiers : code, tests, ADR 142/143/144) et **`5f33cac`** (nom composé préservé à l'édition client). **`packaging-slice.test.ts` a été indexé partiellement** (seule la ligne 1 941 → 1 971) pour ne pas emporter les modifications non commitées de la session 45 ; `handoff.md`, `docs/INDEX.md`, migrations 0055/0056, retours/proforma restent dans l'arbre (sessions 41/45). Aucun commit global.
- **Reste ouvert** : `docs/INDEX.md` à compléter jusqu'à 144 quand la session 41 sera commitée ; `TemplateSettingsPanel.tsx` signalé par graphify (syntaxe partielle, hors périmètre) ; recherche code-barres des dialogues de retours non appliquée pour ne pas toucher les fichiers modifiés par la session parallèle.

## 50) Session 2026-10-26 — Paramètres : composants unifiés et sections regroupées

- **Demande propriétaire** : « قم بتبسيط و تطوير واجهة صفحة الاعدادات بما فيها الاقسام و مكونات الاقسام » — simplifier la page Paramètres, ses sections et les composants internes (pas seulement la coquille).
- **Composants** (`bits.tsx`, ADR-145) : `Section` unifiée avec **icône**, **badge d'état** (crédit actif, copies, schéma, version…), **repli optionnel**, en-tête à deux niveaux (h3 conservé pour les E2E) et **pied d'enregistrement** `SaveBar` aligné à droite. `SettingsGroup` pour les sous-parties ; `Segmented` pour les choix de paiement ; `SwitchRow` compacté. Le bouton d'action n'est plus confondu avec « Enregistrer ».
- **Regroupements** : Vente + Sons → carte **Vente** (Caisse, Crédit, Sons) ; Produits + Stock → **Produits** (Catalogue, Stock) ; Clients + Fournisseurs → **Clients** (Crédit client, Fournisseurs). Commerce 5 → 3 cartes, Catalogue 2 → 1. Index de recherche mis à jour ; ancres `sound`/`stock`/`suppliers` retirées ; titres E2E « Vente » et « Produits » conservés.
- **Actions séparées** : Sauvegarde (bouton « Sauvegarder maintenant », dossier/export), Base (« Vérifier », « Optimiser », « Déplacer… », « Réinitialiser… »), Miroir (« Pousser maintenant » à côté d'« Enregistrer »), À propos (dossiers) utilisent des `Button` explicites ; `SaveBar` ne persiste que les formulaires.
- **Divulgation progressive** : fiscale entreprise, textes de facturation repliables, cartes Miroir/À propos repliables avec résumé ; badges d'état sur les cartes.
- **Contraintes** : aucun canal IPC, aucun schéma, aucune migration ; libellés/aria conservés. Seul locator E2E modifié : `full-loop-client` cible `[data-settings-card="sync"]` au lieu de `heading xpath=../..` (en-tête enrichi).
- **Vérification** : `tsc -b` 0 · eslint (fichiers touchés) 0 · prettier 0 · `verify:fr` 340 fichiers 0 · `build` ✓ · `build:electron` ✓ · **vitest 169 fichiers / 1 171 tests 0** (suite complète) · **E2E `settings-navigation` 1/1 · `stock-backup` 4/4 · `full-loop-client` 1/1** (Synchro enregistrée + 7 clichés poussés, 1 accès). Build renderer re-signé avant E2E (`build:electron`) — sans cela l'import de licence E2E refuse l'asset modifié.
- **Git** : commit **`71fbc77`** (9 fichiers : sections + composants + ADR-145 + locator E2E) ; `handoff.md`/`docs/INDEX.md` et le travail non commité des sessions 41/45 restent dans l'arbre.

## 51) Session 2026-10-27 — Studio d'impression : espace de travail unifié

- **Demande propriétaire** : « قم بتبسيط و تطوير واجهة صفحة الطباعة » — simplifier et développer la page Impression.
- **Nouvelle structure** (`PrintTemplatesScreen.tsx`, ADR-146) : barre de **tabs document** (ticket 58/80, devis A4, bon de livraison, reçu, retour, étiquettes) avec icônes et résumé du **modèle actif** (nom + version) ; colonne gauche dédiée à la **gestion des modèles** (liste avec badges Actif/usine/version, nom, statut À jour/Modifié, Enregistrer, Activer, Dupliquer, Supprimer, Restaurer l'usine, Import/Export) ; carte imprimante sous le panneau ; à droite, réglages + **aperçu collant** côte à côte sur grand écran.
- **Réglages** (`TemplateSettingsPanel.tsx`) : cinq groupes repliables pilotés par les capacités du domaine (Papier & exemplaires, En-tête & identité, Montants, Codes & étiquettes, Signatures & mentions), résumés d'état (TVA/prix/QR…), cases brutes remplacées par le `Switch` du produit, groupes avancés repliés par défaut. Libellés/aria conservés.
- **Aperçu** : badge **Mise à jour… / À jour** avec séquence anti-réponse périmée, note de format, iframe ou texte 80 mm, bouton **Impression test** séparé de l'enregistrement. Aucun backend/canal/migration modifié.
- **Vérification** : typecheck 0 · eslint 0 · prettier 0 · `verify:fr` 340 fichiers 0 · `build` ✓ · `build:electron` ✓ · **vitest 169 fichiers / 1 171 tests 0** · **E2E `print-studio` 1/1** (tabs, A4, groupe replié, renommage + sauvegarde, aperçu) · capture `test-results/print-studio.png` · `c6-studio` 18/18.
- **Git** : commit **`5b03d9d`** (2 composants + ADR-146 + E2E) ; `handoff.md`/`docs/INDEX.md` et le travail non commité des sessions 41/45 restent dans l'arbre.

## 52) Session 2026-10-27 — Tableau de bord : hiérarchie et détails par onglets

- **Demande propriétaire** : « قم بتبسيط و تطوير واجهة صفحة dashboard » — simplifier et développer la page Tableau de bord.
- **Période** (`PeriodToolbar`) : dates, presets avec **preset actif**, résumé de période, Actualiser et menu **Exporter** (PDF/Excel/CSV) réunis dans une carte ; raccourcis F4/F5/F8 conservés.
- **Hiérarchie** : 4 KPI principaux (ventes nettes, marge brute %, trésorerie, créances) + bande compacte de 4 métriques (achats, dépenses, dettes fournisseurs, stock) ; bande « Aujourd'hui » restructurée.
- **Analytique** : ventes/jour + comparaison, encaissements nets par moyen avec total, ventes/marge par catégorie avec filtre et total.
- **Détails** : une carte à onglets **Finances / Stock & dettes / Activité récente** remplace l'empilement interminable ; badge d'alertes sur Stock, icônes d'activité via `RecentCard`.
- **Vigilance** : alerte seulement si sauvegarde/intégrité manquante ; sinon ligne de statut discrète en pied.
- **Correctif de structure** : suppression du `h-full overflow-auto` interne (double défilement/zones cliquables interceptées) ; la page grandit dans le `main`.
- **Vérification** : typecheck 0 · eslint 0 · prettier 0 · verify:fr 340 fichiers 0 · build ✓ · build:electron ✓ · `dashboard.test` 1/1 · **vitest 169 fichiers / 1 171 tests 0** · **E2E `dashboard-ui` 1/1 + `component-smoke` 1/1** (vente réelle, presets, onglets, menu export) · captures `test-results/dashboard.png` et `dashboard-details.png`.
- **Git** : commit **`08a3ba1`** (dashboard + widgets + ADR-147 + E2E) ; `handoff.md`/`docs/INDEX.md` et le travail non commité des sessions 41/45 restent dans l'arbre. **E-35 (jour métier UTC) reste ouvert**, hors périmètre UI.

## 53) Session 2026-10-27 — Refonte visuelle transversale (ADR-148)

- **Demande propriétaire** : « قم باعادة تصميم كل واجهات صفحات البرنامج بسط و طور الواجهات » — refondre toutes les interfaces, simplifier et améliorer.
- **Socle partagé** (`src/shared/ui/primitives.tsx`) : `PageHeader` plat (sur-titre module, H1, période, actions) sans carte ni badge « Poste Principal » ; nouveau `StatsStrip` (une surface, 2 × 2 mobile / 4 ou 5 colonnes desktop, tons conditionnels) ; nouveau `Toolbar` (une rangée, recherche à gauche, filtres au centre, actions secondaires à droite) ; `Card`/`Button`/`Kpi`/`Modal` allégés (surfaces `#101f31`, rayons et ombres cohérents, moins de glow) ; `Kpi` compact pour le Dashboard et les Rapports.
- **Écrans de liste** : Catalogue, Clients, Stock, Dettes, Dépenses, Retours, Historique, Devis, Fournisseurs, Zakat. Suppression de la recherche dupliquée dans la barre d'outils, du bouton « Filtres » et de son état replié ; exports/imports déplacés dans la barre ; selects sans libellés au-dessus (options contextualisées) ; quatre cartes KPI remplacées par `StatsStrip`. `Zakat` utilise le bandeau 5 cellules. Les titres H1, `aria-label`, raccourcis F3/F8 et libellés E2E sont conservés (seul `barcode-uppercase` passe de « Recherche catalogue » à « Rechercher un produit »).
- **Coquille** (`App.tsx`, `TopBar.tsx`, `Sidebar.tsx`, `ShellOverlays.tsx`) : la bande « Session » est fusionnée dans le bandeau (nom, rôle, bouton « Changer d'utilisateur ») ; le libellé du module quitte le bandeau (déjà dans le H1) ; la sidebar garde un état actif très lisible mais plus calme (surface + barre ambre au lieu de l'aplat ambre) ; le pied de raccourcis est plus discret ; les toasts passent en bas à droite pour ne plus masquer le bandeau. Le chrome de fenêtre, la porte session et les gardes licence sont inchangés.
- **Thème clair** (`globals.css`) : surcharges des nouvelles surfaces (`#101f31`), bordures `white/10`–`white/25`, textes `slate-50`/`white`, étiquettes de la sidebar, séparateurs de `StatsStrip` et en-têtes de tableaux sur bande crème. Le thème sombre reste la référence (ADR-033).
- **Vérification visuelle** : spec E2E temporaire supprimée après usage — captures réelles `test-results/ui/catalogue-v2.png`, `clients-v2.png`, `catalogue-clair-v2.png` (artefacts non versionnés) ; rendu vérifié en sombre et clair.
- **Portes** : `tsc -b` **0** · `typecheck:electron` **0** · `eslint src/features src/app/shell src/shared/ui --max-warnings 0` **0** · prettier **0** · `verify:fr` **0** (340 fichiers) · `verify:encoding` **0** (947 fichiers) · **vitest 169 fichiers / 1 171 tests 0** · `build` ✓ · `build:electron` ✓ · **E2E 6/6** (`navigation-smoke`, `component-smoke`, `barcode-uppercase`, `catalogue-labels`, `settings-navigation`, `dashboard-ui`).
- **Git** : commits **`9b7c564`** (UI + test + ADR-148, 20 fichiers) et **`2707f41`** (Devis). Le commit Devis a été indexé **hunk par hunk** pour laisser hors index l'addition de type de la session 45 (`unit_code`/`packaging_id`/`unit_factor`, inutilisée) ; `handoff.md`, `docs/INDEX.md` et les sessions 41/45 restent dans l'arbre. **ADR-148** ajouté ; `docs/INDEX.md` sera complété jusqu'à 148 avec les sessions 41/45.
- **Hors périmètre** : aucune règle métier, aucun canal IPC, aucun schéma, aucune migration, aucune dépendance UI nouvelle.

## 54) Session 2026-10-27 — Audit transversal (delta + code neuf) et corrections radicales

- **Demande propriétaire** : auditer chaque dossier ligne par ligne et **corriger radicalement** (pas de rustine, pas de TODO). Trois arbitrages obtenus avant toute écriture : (1) **checkpoint du WIP d'abord** — l'arbre portait 29 fichiers modifiés + 7 nouveaux, « attente de validation propriétaire » ; (2) profondeur = **delta depuis le baseline vert + code neuf**, l'intégral littéral (122 000 lignes) dupliquant les vagues W1→W10 déjà exécutées ; (3) **correction au fil de l'eau**, rapport consolidé à la fin.
- **Checkpoint** `7f98e44` — `chore(checkpoint): consigner les sessions 41 et 45 avant l'audit transversal` (37 fichiers, dont migrations 0055/0056 et ADR-138/140/141). Le WIP devient réversible et traçable ; la validation produit reste due.
- **Surface auditée en lecture intégrale** : les 6 migrations neuves `0051`→`0056` (574 lignes) ; `credit-gates.ts`, `money-guard.ts`, `handle.ts`, `raw-guards.ts`, `money.ts` ; `returns.repo.ts` (1 625 l.) ; `proformas.repo.ts` (692 l.) ; `return-settlement.ts`, `return-rules.ts` ; delta de `sales.repo.ts` (+71) ; préparation des réceptions ; dialogues de retour et de devis.
- **P1 corrigés** :
  1. **A1** `credit-gates.ts` — la porte de licence de `proformas.convert` était **fail-open** (`catch → log WARN` puis la mutation continuait) : une base verrouillée laissait créer du crédit sans `debt-management`. Désormais fail-closed, comme `returns.create` le faisait déjà.
  2. **A3** `returns.repo.ts` — à l'annulation d'un retour fournisseur, le `catch {}` autour de la restauration FIFO autorisait un **demi-miroir** : `restoreToLayers` levait-il en cours de boucle que les couches déjà rendues restaient écrites et le repli « legacy » rendait la **même quantité une seconde fois**. Nouveau `readLayerTrace()` : journal **lu et validé avant la première écriture**, illisible ⇒ refus (rollback total), absent (pré-0023) ⇒ repli légitime.
  3. **A10** `proformas.repo.ts` — `proformaLineTotal` était la **3ᵉ copie** de la règle de prix de ligne, sans les gardes : un devis pouvait cumuler un sous-total hors `MAX_MINOR_TOTAL` (200 lignes extrêmes = entier non sûr) que la vente refuse. Délégué à `priceLine` + plafonds sur sous-total et total.
  4. **A17** `returns.repo.ts` — le contrat rend `saleItemId`/`intakeItemId` **optionnels** ; sur ce chemin le dépôt prenait la **première** ligne du produit comme référence de valeur et l'appliquait à des quantités agrégées ⇒ le cumul crédité pouvait dépasser le net vendu (client) / le payé (fournisseur). Corrigé par `productCap` agrégé sur les deux kinds + régression (`returns-auto-settlement.test.ts` : `[10 000, 6 000]` rendus là où l'ancien repli donnait `20 000`).
- **Règles rendues uniques** (cause racine commune, voir A21) : statut de retour (`deriveReturnStatus`, parité ajoutée à `main-domain-parity.test.ts` — P3) ; valeur nette d'une ligne (`netReturnLineValue` domaine + miroir main + `netReturnLineValueSafe` pour le rendu, doctrine A-01) ; politique « la dette d'abord » de l'aperçu caisse (`previewReturnSettlement`) — l'UI recalculait `Math.min(total, dette)` et pouvait promettre un plafond d'espèces refusé par le serveur.
- **A20 était l'erreur la plus dangereuse pour le caissier** : `netLineReturnMinor` (dialogue) retombait sur « prix catalogue × quantité » quand la donnée lui semblait illisible — une valeur que le main **refuse**. L'aperçu affichait donc un remboursement impossible. Illisible vaut désormais 0 (échec sûr).
- **Autres corrections** : 5 `catch {}` muets journalisés ou supprimés (A4, A8, A13, A15) ; 2 N+1 agrégés (A7 réception, plus `getReturnableSaleItems` codes-barres et `convertProformaToSaleAtomic` coûts produit) ; `party_name LIKE` sans `ESCAPE` (A5 — faux résultats sur `%`, `_`, `\`) ; cast non gardé de `allocateNumber` qui laissait fuiter un `TypeError` brut (A12, R5) ; 4 littéraux monétaires remplacés par `money-guard` ; `creditMinor` retiré du schéma et de l'UI (A16, avec test « une charge héritée est décapée ») ; `assertRefundSplit` supprimé (A18, règle domaine contredisant ADR-138, vivante par son seul test) ; `LabelTarget` retiré (A9, knip).
- **Défaut de porte trouvé en passant** : `docs/ADR-145` avait été committé **hors prettier** en `71fbc77`, donc `npm run format:check` était rouge dans l'arbre commité alors que la session 50 inscrivait « prettier 0 ». Corrigé.
- **Preuves de non-faute** : R6 = `git diff --diff-filter=M f9da60c..HEAD -- database/migrations/` **vide** ; R3 = 143 enregistrements `handle()` tous sur un `*Schema` (scan scripté), 40 `ipcMain.handle` bruts tous Zod-parsés et couverts par `RAW_GUARDED_CHANNELS` (35) + `RAW_UNGUARDED_CHANNELS` (5), garde appliquée par `raw-guarded-channels.test.ts` ; 0 `alert/confirm/prompt` ; 0 `TODO/FIXME/XXX/HACK` dans `src/` et `electron/`.
- **Hypothèses réfutées** (les retrouver écrites noir sur blanc dans `docs/reports/AUDIT_2026-10-27.md`, § « Hypothèses réfutées » et « Note de méthode ») : survalorisation carton des retours fournisseur (`purchase_price_minor` d'une réception est bien un coût **par unité de base**, `inventory.repo.ts:296`) ; arrondi de la porte crédit (c'est bien `Math.round(prix × qté)`, règle canonique) ; et **ma propre première lecture d'A17** — supprimé le 9/10 des tests committés avant d'être corrigée par le plafond : un mode `optional()` du contrat n'est pas mort parce qu'un seul appelant actuel ne l'utilise pas.
- **A21 — à arbitrer par le propriétaire** : 109 exports de `src/domain/**` sans **aucun** appelant hors tests (la liste complète est dans le rapport ; l'audit du 2026-10-18 en listait 10 modules sous **DT-05**). Angle mort outillé : `knip` compte un fichier de test comme consommateur, donc « testé » masque « non branché ». Six des findings de cette session (A6, A10, A14, A15, A17, A20) sont des instances de cette cause. Cure possible par symbole : **câbler** (comme fait ici) ou **supprimer** règle + test. `return-policy.ts` (fenêtre de retour, frais de restockage, aucun réglage correspondant dans l'UI) **n'a pas été supprimé** : c'est la décision DT-05 du propriétaire, pas celle de l'agent.
- **Reste à auditer** (couverture par outils seulement) : `src/features` hors retours/devis (caisse, stock, clients, dettes, dépenses, historique, rapports, paramètres, fournisseurs, zakat, modèles), `src/app`/`shared`/`styles`, `electron/printing` (21 fichiers delta), `sync`, `preload`, `license-manager`, `mobile`, `cloud`, `scripts`, configs racine, et les suites E2E en relecture.
- **Portes** : `typecheck` 0 · `typecheck:electron` 0 · `eslint . --max-warnings 0` 0 · `format:check` 0 · `verify:migrations` VERIFIED (56) · `verify:domain` VERIFIED · `verify:fr` 0 (340) · `verify:encoding` 0 (947) · `verify:perf` VERIFIED · `knip` 0 · **vitest 169 fichiers / 1 173 tests 0** · `build` ✓ · `build:electron` ✓ (manifeste signé). E2E non rejoués cette session.
- **Git** : commits du lot (corrections) + `docs(handoff)` séparé, conformément à la règle 10.

## 55) Session 2026-10-27 — Ré-emballage complet de `release/` (POS + License Manager)

- **Demande propriétaire** : « قم ببناء نسخ التثبيت اللازمة » — construire les versions d'installation nécessaires. Périmètre retenu (contrat ADR-023 + §35) : les **quatre** binaires de distribution — `Veloria-PoS-Setup-1.0.0.exe`, `Veloria-PoS-Portable-1.0.0.exe`, `Veloria-License-Manager-Setup-1.0.0.exe`, `Veloria-License-Manager-Portable-1.0.0.exe` — plus les blockmaps et `SHA256SUMS.txt`.
- **Portes AVANT empaquetage** (arbre propre, tête `701b348`) : `typecheck` **0** · `typecheck:electron` **0** · `format:check` **0** · **vitest 169 fichiers / 1 173 tests 0** (388 s) · `verify:migrations` **VERIFIED** (56) · `license:scan` **0** (1 476 fichiers) · manifeste d'intégrité signé **234 fichiers**.
- **Environnement de build** : Developer Mode présent (`AllowDevelopmentWithoutDevLicense=1`) ⇒ `signAndEditExecutable: true` conservé sans contournement (ADR-070 respecté) ; cache `nsis-3.0.4.1` + `winCodeSign-2.6.0` disponible ; `ELECTRON_RUN_AS_NODE` **non défini** pour chaque commande (piège connu du shell Qoder) ; clé privée d'intégrité `private/vendor-keys/private.key` présente, clé publique embarquée via `extraResources`.
- **Artefacts livrés** (`release/`) : Setup POS 129 427 937 o · Portable POS 129 011 219 o · Setup Manager 111 484 136 o · Portable Manager 111 120 739 o. Hashes SHA-256 (`release/SHA256SUMS.txt`) : POS Setup `c2af3196547b477798e66432873f8d3fda9a1bb7fb690b9868b7d53b2521a804` · POS Portable `ff7f3d50985ffa65b519618c9279aec5819f2364bfe7323bfa2c3d4191401a50` · Manager Setup `383d631c4fc8f86aab7c6adb71a20e411402627411757d9b30bb22ea6f8f685b` · Manager Portable `08b7cc1004b32d91aef8e6d3935fdc18058d2b80ad56e53729ad088104bbac34`.
- **Rétro-compatibilité** : l'ancienne release (23/10, schéma 0051) est **déplacée** dans `release/_prev-2026-10-23/` et non supprimée ; elle n'est pas distribuable (ADR-023 : binaires périmés par construction). Les installs per-user (HKCU) précédentes coexistent dans le registre → désinstaller d'abord (données conservées), puis installer celle-ci (`perMachine: true`).
- **Règle 9 (runtime natif) — VÉRIFIÉE** : `ELECTRON_RUN_AS_NODE=1 "<exe> du win-unpacked" script.cjs` charge `better-sqlite3` depuis `resources/app.asar.unpacked` ⇒ `sqlite=3.50.2 electron=37.2.0 abi=136 node=22.17.0`. **Piège** : `bindings` vit dans l'`app.asar` et l'interception asar n'existe pas en mode run-as-node → `MODULE_NOT_FOUND` **artificiel** ; solution : `NODE_PATH=<racine>/node_modules` pour résoudre `bindings` tout en chargeant le `.node` réellement emballé.
- **Contenu du paquet contrôlé** (`npx asar list`) : POS → `\dist\index.html`, `\dist-electron\main\main.js`, `\dist-electron\preload\preload.js`, `\dist-electron\integrity-manifest.json` (le manifeste est sous `dist-electron/`, **pas** à la racine de l'asar), `better_sqlite3.node` présent, **zéro** `.exe`/`.asar` embarqué (garde ADR-051 tenu). Manager → `main.js`, `preload.js`, `integrity-manifest.json`, `dist-license-manager-renderer` (4 531 entrées).
- **Blocage rencontré et contournement** : `package:manager` vide `release\win-unpacked` avant d'emballer ; l'`app.asar` du POS fraîchement écrit y était **verrouillé par le scanneur** (`MsMpEng`/`SearchIndexer`) ⇒ `EnsureEmptyDir … The process cannot access the file` puis `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`. Aucun processus Veloria/Electron n'était pourtant vivant. Contournement retenu : `npx electron-builder --win -c electron-builder.license-manager.yml -c.directories.output=<dossier temporaire>` (les étapes précédentes — `build:manager-client`, `build:manager`, `license:integrity-manager` — avaient déjà réussi), puis `mv` des `.exe`/`.blockmap` dans `release/`. **Valide** car `checksums.js` n'inspecte que `release/*.exe`. Noter que `directories.appOutDir` **n'existe pas** en electron-builder 26 (schéma : `app`, `buildResources`, `output` uniquement) — la tentative échoue en `ValidationError`.
- **Erreur de méthode à ne pas répéter** : pour débloquer, j'ai lancé `rm -rf release/win-unpacked` **avant** de comprendre le verrou ; la suppression a détruit les ressources sœurs (`elevate.exe`, `app.asar.unpacked`, `database/migrations`, `license`, `icons`, `ocr`) avant de buter sur l'`app.asar` verrouillé. Les EXE livrés sont **intacts** (payload lu par makensis avant cela) mais les arbres `win-unpacked` intermédiaires ne sont plus complets. **Règle retenue** : ne jamais `rm` un artefact potentiellement verrouillé — construire dans un **nouveau** `directories.output` et laisser le scanneur relâcher l'ancien.
- **Restes à nettoyer** (verrou scanneur, repartent au redémarrage) : `release/win-unpacked/` (POS, partiel) et `release-manager-tmp/` (Manager, partiel, **non versionné** et visible dans `git status`). Le scratch `release-pos-runtime/` a pu être supprimé. Rien n'a été commité avec `git add -A`.
- **Non rejoué** : suite E2E (dont `test:e2e:installer`, de toute façon ignorée ici — NSIS/UAC), `verify:licensing` (exige l'état Manager d'une machine propre), `npm audit` (hors ligne). Le runtime Manager n'a pas été relancé (même `.node`, même Electron, même ABI : vérification structurelle par asar jugée suffisante, et pour ne pas créer un `.asar` verrouillé de plus).
- **Point d'arbitrage propriétaire** : version toujours **1.0.0** ⇒ ces binaires portent les **mêmes noms** que ceux du 23/10 ; la distinction ne se fait que par hash/tampon. Envisager un bump (`1.0.1`) ou un nom horodaté à la prochaine distribution.
- **Git** : aucun changement de code — seul `handoff.md` est modifié (§1 + cette section), commit `docs(handoff)` séparé (règle 10).

## 56) Session 2026-10-27 — Code-barres carton (ADR-149, Phase 3 d'ADR-136)

- **Demande propriétaire** : un prompt détaillé (« Option A ») demandait d'ajouter `pack_size`, `pack_price_minor` et `label` sur `product_barcodes` pour qu'un code « carton » ajoute N pièces à un prix carton exact (Jben : 16 pièces, 150 DZD au lieu de 16 × 10 = 160), avec déstockage en pièces.
- **Arbitrage pris AVANT toute écriture** (une question au propriétaire, trois options présentées) : le projet **possède déjà** cette vérité. `0054_product_packagings.sql` porte `factor`, `selling_price_minor`, `label_fr`, `auto_carton_pricing`, `sale_items`/`return_items`/`stock_intake_items`/`proforma_items` portent `packaging_id`/`unit_factor`, le main revalide facteur et prix en base (ADR-136 D5) et les rapports multiplient déjà par `unit_factor`. Surtout : **0054 avait réservé le hook** — `ALTER TABLE product_barcodes ADD COLUMN packaging_id …` avec le commentaire « Phase 3 (code-barres carton) : la colonne existe, aucun flux ne l'alimente encore ». Option A = **deux sources du même fait monétaire**, donc refusée ; le propriétaire confirme la sémantique voulue (« le carton a son code-barres, la pièce a son code-barres ») → **liaison par `packaging_id`**, carton scanné = `factor` unités de base, retour = carton entier.
- **Aucune migration.** Zéro édition de `.sql` (règle 12) : `verify:migrations` VERIFIED à **56** fichiers, checksums intacts.
- **Aucun canal, aucun schéma nouveau** : contrats gelés inchangés (181 canaux, `FROZEN_SCHEMA_COUNT` 125, 134 exports) — `packagingSaveSchema` accepte seulement `cartonBarcodes` (tableau, `.default([])`), donc les appelants existants ne bougent pas. `getProductByBarcode` expose en plus `barcode_packaging_id`.
- **Domaine** (`src/domain/packaging/carton-barcodes.ts`, neuf, pur) : `normalizeCartonBarcodes` (trim + majuscules, dédupliqué, accents préservés), `validateCartonBarcodes` (≤ 20 + `validateBarcode` EAN-8/13), `cartonScanUnits` (unités ajoutées par un scan). La **quantité du panier reste en unités de base** : `scanPrefix` (sell-search) multiplie par `factor`, et `priceSaleLine`/`expandSaleLine` découpent 1 carton facturé au tarif DB. Ni `stockMultiplier`, ni colonne `pack_size` sur `sale_items`, ni modification de `sales.repo` (décrément, FIFO, agrégation par produit, COGS) — le chemin existant d'ADR-136 suffit.
- **Main** : `products.packagings.save` **réconcilie** les liaisons dans sa transaction (délie tout ce qui pointait le conditionnement, puis lie chaque code demandé) ; un code absent de la fiche ou appartenant à un autre produit est **refusé** en FR — pas de création silencieuse. `updateProduct`, qui **remplace** ses lignes `product_barcodes`, rejoue les liaisons des codes survivants (autrement chaque édition de fiche casserait le scan). `products.packagings.delete` coupe les liaisons (la ligne packaging est **réutilisée** par un save ultérieur : une liaison orpheline ressusciterait).
- **Règle nouvelle (ADR-149 D3)** : un code de carton **exige** `auto_carton_pricing`. Sans lui, le scan sortirait le prix pièce (160 DZD au lieu de 150) — écart d'encaissement silencieux. Refus main + interrupteur verrouillé côté formulaire.
- **UI produit** : section « Conditionnement » → champ « Codes-barres du carton » (douchette, Entrée, puces vertes) ; les puces de la section « Codes-barres » portent l'étiquette `carton` ; le tiroir détail affiche `… (carton)`. Le code doit d'abord être sur la fiche (garde locale + message FR).
- **Retours** : le scan d'un code dans le filtre de lignes **pré-remplit la quantité** de la ligne visée (code carton → 1 unité de la ligne carton, à défaut `factor` pièces sur une ligne d'unité de base ; code pièce → 1 pièce) ; Entrée répète le scan. Les gardes serveur ne changent pas (carton entier, éligibilité en unités de base). Le retour **partiel** de carton reste hors périmètre.
- **Ce que l'E2E a corrigé dans ma propre hypothèse** : j'attendais **deux** `sale_items` après deux scans ; le panier **fusionne** la même ligne (produit + prix identiques) ⇒ **une** ligne `quantity 2 × unit_factor 16`, `line_total_minor 30 000`. L'assertion a été alignée sur le comportement réel (qui est le bon : 300 DZD, −32 pièces), pas l'inverse.
- **Tests** : `tests/unit/carton-barcodes.test.ts` (9 cas : normalisation, accents, EAN faux, plafond 20, code vide, scan lié/non lié/facteur invalide) · `tests/integration/carton-barcode.test.ts` (6 cas sur vrais dépôts + projection application : liaison et lecture au scan y compris insensible à la casse, trois refus FR, rejouement `operationId` sans doublon, réécriture de fiche, suppression, **150 DZD exacts / −16 pièces / retour +16**, 2 cartons = 300 DZD / −32) · `tests/e2e/carton-barcode.spec.ts` (1 cas **réel** : création fiche + carton + codes, deux scans caisse, encaissement 300, ticket `Carton ×16`, preuve SQLite `sale_items` + `product_barcodes.packaging_id` posé sur le seul code carton + stock 100 → 68).
- **Portes** : `typecheck` **0** · `typecheck:electron` **0** · `eslint . --max-warnings 0` **0** · `format:check` **0** · **vitest 171 fichiers / 1 188 tests 0** (baseline 169/1 173) · `build` ✓ · `build:electron` ✓ (manifeste signé **234**) · `verify:migrations` **VERIFIED (56)** · `verify:domain` **VERIFIED** · `verify:fr` **0** (341 fichiers) · `verify:encoding` **0** (953) · `verify:perf` **VERIFIED** · `knip` **0** · **E2E `carton-barcode` 1/1** (2,0 min, à lancer avec `env -u ELECTRON_RUN_AS_NODE`).
- **Docs** : **ADR-149** (5 décisions, limites consenties, contrats inchangés) + renvoi depuis **ADR-136** (« Révision ultérieure ») + `docs/INDEX.md` complété **142 → 149**.
- **Hors périmètre (documenté, pas oublié)** : plusieurs **formats** de carton par produit (index partiel `ux_packaging_active` — une refonte, pas des colonnes dupliquées) ; retour **partiel** d'un carton ; scan d'un code carton dans la **réception fournisseur** (l'achat carton existe déjà par le sélecteur d'unité, ADR-136 D6).
- **Artefacts de test laissés** : la base réelle `%PROGRAMDATA%\Veloria PoS\Data` porte désormais les produits/ventes E2E (`E2EJben*`, `E2EOeufs*`) — comportement habituel des specs du projet. `release-manager-tmp/` (session 55) reste non versionné et **non commité**.
- **Git** : commit **`9d5ad62`** `feat(products): barcode packs (carton ×N) — scan d'un code de carton` (16 fichiers : domaine + main + IPC + UI + 3 suites de tests + ADR-149/136/INDEX), puis ce `docs(handoff)` séparé (règle 10). Graphe `graphify update .` rejoué (7 387 nœuds, `graphify-out/` non versionné).

## 57) Session 2026-10-27 — Lancement réel, pied d'arbre purgé, docs alignées

- **Demandes successives** : « شغل البرنامج » (lancer l'app) → « فعل البرنامج » (l'activer) → « افحص جذع المشروع واحذف كل الملفات غير اللازمة والزائدة » → « commit + تحديث وثائق المشروع ».
- **Lancement** : `env -u ELECTRON_RUN_AS_NODE npx electron .` sur les artefacts de `build` + `build:electron` (4 processus Electron, fenêtre réelle, aucun log d'erreur). **Piège confirmé** (déjà consigné) : sans le `env -u`, le shell Qoder lance le main en mode Node et l'app meurt au démarrage.
- **Licence — EN ATTENTE, rien d'écrit** : 5 enveloppes `.vlic` décodées sur le Bureau (lecture seule), toutes 17 pages, `maxDevices=1` : `VLIC-ED9D8361` (CLI-zenagui, **enterprise**, émis 2026-10-27 20:44, `mig.vlic`) · `VLIC-1E4375A4` (001, pro, 23/10, `zeen.vlic`) · `VLIC-757224A4` (110 « bilal », pro, 21/10, §29) · `VLIC-D490C323` (zena, pro, 18/10, et `gggg.vlic` = **rejouement du même licenseId**). La voie vendor est `npx electron ./scripts/licensing/import-local-license.cjs <fichier.vlic>` (même code que l'app : `license-service` + `secure-state`, état **DPAPI** dans `userData/secure/license-state.dat`, **ancre SQLite** `app_settings.license_anchor` : supprimer le `.dat` ne ramène PAS à UNACTIVATED ⇒ `TAMPER_DETECTED`, et `maxStanding` refuse une licence « plus douce » qu'un standing déjà vu ⇒ import quasi irréversible, et consommateur du slot `maxDevices=1`). **Aucun import exécuté** : le choix du client est une décision du propriétaire (et l'app doit être fermée pendant l'import).
- **Audit du pied d'arbre (règle 14 : auditer avant de supprimer)** : les 21 fichiers **suivis** de la racine sont tous légitimes (configs, docs, entrées de build) — **aucun fichier suivi n'a été touché ni supprimé**. Le « surplus » est exactement ce que `.gitignore` déclare déjà tel (« Scratch local (audits/sessions) »).
- **Purgé** : `check_like.py` (827 o, sonde `LIKE` SQLite jetable) · `full-inventory.txt` (12,6 Ko, inventaire régénérable) · `electron-run.log` (1,3 Ko) · `tsconfig.tsbuildinfo` + `tsconfig.electron.tsbuildinfo` (caches incrémentaux) · `.ruff_cache/` · `coverage/` (1,1 Mo) · `release-manager-tmp/` (36 Mo → **il ne reste qu'un fichier** : `win-unpacked/resources/app.asar`, « Device or resource busy » sous le scanneur — jamais forcé, doctrine §55, part au redémarrage). `git status` après purge : uniquement `?? release-manager-tmp/`.
- **Proposé ET NON exécuté (≈992 Mo, irréversible, arbitrage propriétaire en attente)** : `release/_prev-2026-10-23/` **867 Mo** (les 4 EXE du 23/10, schéma 0051, non distribuables par ADR-023, hors `release/SHA256SUMS.txt` actuel) · `release/win-unpacked/` 39 Mo + `builder-debug.yml` (intermédiaires de `electron-builder`) · `graphify-out/2026-10-06→26` 86 Mo (backups datés de `graphify update`, le backup 2026-10-27 et le graphe actif resteraient) · `dist*` 5,3 Mo (régénérables, mais l'app en dépendait) · `docs/reports/*.md` (26) + `docs/archive/` (4,1 Mo) + `docs/specs-archive/` — **suivis par git et cités dans `handoff.md`/les ADRs ⇒ recommandation : garder**.
- **Docs alignées sur l'état réel** (le travail commité de cette session) : `README.md` — comptes de tests corrigés (**171 fichiers / ~1 188 tests**, étaient « ~550 / ~90 »), **E2E 24 specs / 50 tests** (étaient « 10 scénarios »), piège `ELECTRON_RUN_AS_NODE`, spec ciblée `carton-barcode`, coverage E2E carton + code-barres carton, pont docs (README ↔ `handoff.md`/`docs/INDEX.md`/ADR 001→149). `docs/STRUCTURE.md` — migrations **0001..0056** aux trois endroits qui disaient 0049, ADR **001→149** + lignes `docs/INDEX.md`/`handoff.md`, §1 complété (`vitest*`, `playwright.config.ts`, `knip.json`, `opencode.jsonc`, `skills-lock.json`, `CLAUDE.md`, `handoff.md`), `src/domain` liste `packaging`/`barcode`/`units` + `application/sales/packaging-lines`, et **règle d'hygiène §7** : scratch jamais réécrit à la racine + liste d'intouchables (`private/`, keystore, `release/*.exe`/`_prev-*`, `.opencode/`, `graphify-out/`, docs suivis) + ne jamais forcer un `rm` sur artefact verrouillé.
- **Portes** : aucun fichier de code touché (purge d'ignorés + docs) ⇒ `format:check` **0** (Prettier sur les `.md` — piège connu : un `.md` écrit à la main rougit la porte), `verify:encoding` **0** (953 fichiers), `git diff` limité à `README.md`, `docs/STRUCTURE.md`, `handoff.md`. Suite vitest/build non relancés : rien dans `src/`, `electron/`, `tests/`, `database/` n'a changé depuis `9d5ad62` (déjà 171/1 188 verts + build ✓).
- **Ouvert au prochain tour** : (1) importer la `.vlic` choisie (fermer l'app d'abord) ; (2) trancher les 992 Mo ; (3) `release-manager-tmp/win-unpacked/resources/app.asar` repart au redémarrage ; (4) la release courante est toujours **1.0.0** (point d'arbitrage §55 : bump ou nom horodaté).

## 59) Session 2026-10-28 — Client mobile V4 « Daylight plat » (refonte complète de l'APK clients)

- **Demande** : « قم باعادة تصميم واجهات تطبيق العملاء » — refondre les interfaces de l'app clients (`mobile/`, Expo/RN 0.76, lecture seule, arabe par défaut RTL). Portée retenue après arbitrage : **toute l'app** (8 écrans + kit + tokens), pas seulement le parcours clé.
- **Direction choisie par le propriétaire** (3 options présentées avec maquettes texte) : **A « Daylight plat » alignée sur ADR-148** (la refonte visuelle du POS) — écartées : thème sombre natif (les tokens `darkBg`/`darkCard` étaient déjà préparés mais éloignaient le client de la caisse) et « retail dense » pur. Décisions formalisées dans **ADR-150**.
- **Ce qui a changé (rendu uniquement)** : `GRADIENTS` supprimé et `expo-linear-gradient` **retranché** de `mobile/package.json` + lockfile (une dizaine de fichiers le consommaient) ; séparation par **`HAIRLINE`/`Divider`** au lieu d'ombres ; élévations restantes en **`boxShadow`** (les props `shadow*` sont dépréciées RN 0.76 — avertissement au rendu à chaque écran) ; primitives neuves `Group`/`Row`/`Divider` + variantes `Button` (`gold|ink|quiet|outline|ghost|danger|success`) ; **dock ancré** pleine largeur (tiret or actif) au lieu du pilon flottant + réserve unique `SIZES.dockInset = 88` ; rayons 24/16/12 → 18/14/10 ; un seul accent (l'or), statuts en **point + texte** ; solde de dette devenu le chiffre du bandeau, jauge de crédit descendue en bloc tonal, fidélité dégradée de slab or vers une ligne tonale.
- **Gains mesurés sur les captures 390×844** : liste des factures **4 lignes visibles contre 2** (ligne de 60 dp au lieu d'une carte de ~200 dp imbriquée) ; bloc de totaux de la page détail passé de l'encre sombre (où les montants masqués « ••• » n'étaient plus lisibles) vers un bandeau clair teinté ; la dernière ligne des listes ne passe plus sous le dock ; le bouton « masquer » a quitté le coin du bandeau pour bord le libellé du solde ; titre de détail **tronqué en RTL** corrigé (le numéro passait en sous-titre).
- **Comment j'ai réellement vu le rendu** (pas d'émulateur ici) : `scripts/demo-client-sync-server.mjs` (fausses données, `0550123456` / `123456`) + `npx expo start --web --port 8083` + capture **via le Chromium d'Electron** (`BrowserWindow` hors écran 390×844, `capturePage`) — car `npx playwright install chromium` **échoue** sur ce poste (réseau restreint : « Download failure, code=1 »).
- **Trois obstacles trouvés, dont deux corrigés au dépôt** :
  1. `scripts/e2e-mobile-shots.mjs` ciblait `getByLabel("phone")`/`("pin")` — le login rend des `aria-label` du glossaire arabe : **la voie de capture du client était cassée depuis longtemps**, personne ne le savait. Corrigé en expressions insensibles à la langue (le script exige toujours Chromium : non exécutable hors ligne, d'où le contournement Electron).
  2. **Metro ne surveille pas les fichiers sur ce poste** : après modification des sources, le bundle servi était **octet pour octet identique** (3 191 745 o, zéro trace du V4) et les premières captures « après » étaient en fait les images V3 (mêmes tailles de fichier = signal). Il faut **tuer le port 8083 et relancer** à chaque itération ; `--clear` seul ne suffit pas si un serveur orphelin tient le port (le PID 7880 a dû être tué).
  3. CORS du serveur de démo incomplet : `Access-Control-Allow-Headers` omettait `authorization` (que `api.ts` envoie, comme le relais et la fonction Edge) ⇒ le client répondait « لا اتصال بالإنترنت » alors que le serveur renvoyait 200 au curl. Corrigé dans `scripts/demo-client-sync-server.mjs`.
- **Régression que j'ai introduite puis corrigée** : j'avais mis le même `aria-label` du PIN sur le conteneur cliquable ET sur le champ caché — deux nœuds homonymes (ambigu au lecteur d'écran ; mon script remplissait le `BUTTON` → `TypeError: Illegal invocation`). Le libellé est resté sur le champ seul, vérifié : `querySelectorAll('[aria-label=…PIN…]').length === 1`.
- **Relecture parallèle** (agent sur `Payments`/`Account`/`QrScanner`/`ReceiptSheet`/`error-boundary`) : a rendu les 5 fichiers en V4 et **trouvé un vrai bug dans mon kit** — `Row` utilisait `alignItems: "left"|"right"`, invalide en RN (TS2322) ; corrigé en `flex-start|flex-end`. Anomalie signalée et **non corrigée** : `App.tsx` passe `cache.syncedAt` à `AccountScreen` sous le libellé « dernière connexion » (sens du label faux — à trancher, c'est du contrat de données, pas du style).
- **Portes** : `mobile` typecheck **0** · `mobile` lint **0** · vitest **171 fichiers / 1 188 tests 0** (dont `mobile-foundation` 17 + `mobile-views` 10 — **les 4 verrous d'identité `#051424`/`#fbbf24`/48/20 sont intacts, aucun test n'a été assoupli**) · `typecheck` racine **0** · `eslint .` **0** · `format:check` **0** · `verify:encoding` **0** (949) · `verify:fr` **0** (341 — l'app cliente est l'exception bilingue documentée ADR-051, hors périmètre de la garde) · **`knip` 0** (après retrait de la dépendance morte) · captures avant/après dans `%TEMP%\veloria-mobile-shots\{before,after,after2,final}` (artefacts hors dépôt).
- **Non vérifié (à assumer)** : **rendu natif Android** — aucun APK rebâti dans cette session (pas d'émulateur ; `expo run:android` demanderait JDK/SDK et ~25 min) : le bundle web ne prouve pas le layout Yoga sur device, ni le safe-area du dock ancré, ni le cadrage RTL sur Android réel. Prochain jalon honnête : `npm run build:apk` (ou `expo run:android`) + installation, avant de déclarer la V4 « livrée sur le terrain ».
- **Processus laissés en arrière-plan** (à arrêter) : Metro `:8083` et le serveur de démo `:8099` tournent encore (tâches de fond de cette session).
- **Hors périmètre** : aucun écran ajouté, aucun flux modifié (PIN, QR, WhatsApp, pagination, cache, masquage), aucune migration, aucun canal IPC, aucune nouvelle dépendance (une retirée).

## 58) Session 2026-10-27 — Purge exécutée (A + B) : ≈1,4 Go libérés, un livrable Android sauvé

- **Demande** : « ما هي الملفات التي يمكن الاستغناء عنها » puis, sur la liste classée présentée : « **a و b** » (exécuter les deux lots).
- **Découverte qui a évité une perte** : `mobile/android/app/build/` (414 Mo, **git-ignoré**, donc Looks like junk) contenait **`outputs/apk/release/app-release.apk` — 88 477 157 o, buildé le 2026-10-05, `applicationId dz.veloria.client`, versionName 1.0.0, variante release** : le seul livrable Android présent sur le poste. **Sauvé avant toute suppression** dans `release/apk-android/` (+ `output-metadata.json` + `SHA256SUMS.txt` propre), **hash de contrôle identique** à l'origine : `7ed5b64cf7f4ce7e3bfe2b84901acee4092afd0dc0c0a2aec7e6604c1858df51`. `mobile/veloria-release.keystore` (2 730 o, 02/10) intact — sans lui, re-signature impossible.
- **Contrôle avant destruction du lot B** : les 4 hashes de `release/_prev-2026-10-23/SHA256SUMS.txt` (`19935703…`, `39f4ea38…`, `a61f274e…`, `850321cc…`) sont **exactement** ceux de la release du 23/10 consignés au §1, et **différents** des 4 hashes actuels de `release/SHA256SUMS.txt` (`c2af3196…`, `ff7f3d50…`, `383d631c…`, `08b7cc10…` de §55) ⇒ le dossier supprimé était bien la paire périmée (schéma 0051, non distribuable ADR-023), jamais la paire livrée.
- **Supprimé (lot A)** : `mobile/android/app/build/` (intermediates 315 Mo + generated 9,6 Mo + tmp + outputs, l'APK étant sorti), `mobile/android/.gradle/` (28 Mo), `mobile/android/hs_err_pid7796.log` + `replay_pid7796.log` (dump d'un **JVM crash** de l'époque Expo), 10 snapshots `graphify-out/2026-10-06 → 2026-10-26` (~100 Mo, **`2026-10-27` conservé** avec le graphe actif), `release/win-unpacked/` + `release/builder-debug.yml`, `release-manager-tmp/`, `test-results/`.
- **Supprimé (lot B)** : `release/_prev-2026-10-23/` (867 Mo).
- **Non supprimé volontairement** : `dist*` (5,3 Mo seulement — c'est ce que `npx electron .` charge ; `npm run clean` quand on veut repartir) · `node_modules/` (968 Mo, régénérable mais nécessaire) · `private/`, keystore, `release/*.exe` + `SHA256SUMS.txt` + `release/apk-android/`, `.opencode/`, `docs/reports|archive|specs-archive` (suivis + cités).
- **Mesure** : espace libre sur le volume de travail **2,5 Go → 3,9 Go** (+1,4 Go). **Reste verrouillé** (antivirus/indexeur, jamais forcé — doctrine §55) : un seul fichier dans chacun des deux dossiers, `release/win-unpacked/resources/app.asar` et `release-manager-tmp/win-unpacked/resources/app.asar` (~35 Mo chacun) ; ils partent au redémarrage, et `git status` ne montrera alors plus que rien.
- **Correction des chiffres du §57** : j'y avais écrit « ≈992 Mo » avec backups graphify à 86 Mo. Realité mesurée : snapshots ≈**100 Mo**, et le total dispensable était **≈1,4 Go** — l'oubli portait sur `mobile/android/` (442 Mo), jamais inventorié. §57 conserve son texte (historique), cette section fait foi.
- **Git** : **aucun fichier suivi touché** par la purge (tout ce qui a été supprimé est git-ignoré) — `git status` = uniquement `?? release-manager-tmp/` (le `.asar` verrouillé). Commits de cette session : `docs(structure)` (règle d'hygiène + emplacement du livrable Android) + ce `docs(handoff)`.
- **Ouvert** : (1) import `.vlic` (choix propriétaire, app fermée) ; (2) les deux `app.asar` verrouillés ; (3) bump de version ou nom horodaté pour la prochaine distribution (§55).

## 60) Session 2026-10-28 — Login client V5 « Connexion directe » (ADR-151)

- **Demande** : « قم بتطوير واجهة صفحة login الخاصة بتطبيق العملاء » en deux temps imposés par le propriétaire : **chercher sur internet d'abord**, puis développer l'interface de l'écran de connexion de l'APK clients (`mobile/src/screens/Login.tsx`, écran 01 de la V4 ADR-150).
- **Recherche internet (ce qui en est sorti et a été retenu)** : login 2026 = **reconnaître l'utilisateur qui revient** (pré-remplissage, raccourci d'entrée) plutôt que lui faire ressaisir son identité ; **valider la forme localement avant tout appel réseau** (un envoi qui échoue sur une forme invalide coûte un aller-retour et, ici, un pas du compteur d'échecs côté POS) ; **envoi automatique quand le code est complet** (pattern OTP/PIN) ; **confirmer la frappe et le refus par le toucher** ; **garder l'action principale au-dessus de la ligne de flottaison**, clavier ouvert ; un seul accent visuel, pas trois boutons qui se ressemblent. Sources : gummble (tendances login 2026 : biométrie d'abord, identité en un champ, validation temps réel, anti-CAPTCHA), eleken (50+ écrans : colonne unique, bloc de marque, anti-surcharge cognitive), corbado/authgear (« Welcome back » + retour fluide), anoda (banque : signal de confiance puis bandeau de reprise), reui + trendyol (auto-submit, gestion du collage, haptique de micro-erreur).
- **Périmètre arbitré** : question posée en arabe avec deux options chiffrées (UI pure 0 dépendance vs UI + biométrie). Réponse du propriétaire : **« واجهة فقط بدون أي مكتبة جديدة »**. La biométrie (`expo-local-authentication`, ~0,3 Mo) reste donc **non faite** : elle exigerait un ADR propre, un rebuild APK et un verrou biométrique posé sur le PIN déjà stocké en SecureStore.
- **Ce qui a changé (écran 01 seulement)** :
  1. **Budget = un écran sans clavier.** Marque en lockup horizontal (logo 60 + « Veloria » + « فضاء الزبون » sur la même ligne, −100 dp), aide 3 étapes **repliée** derrière un `Tap` à chevron (−160 dp), réassurance « سريع ومحمي » descendue en pied de page, et « طلب رمز عبر واتساب » rétrogradé de troisième bouton en **lien souligné** : le CTA doré redevient la seule chose dorée de la feuille.
  2. **Verrou local = règle du serveur.** `canSubmit` = téléphone d'au moins un chiffre **et** PIN de 6 chiffres — exactement `assertCredentials` (`mobile/src/api.ts`) et la garde de `client-sync`. Aucune règle « numéro algérien = 10 chiffres » n'a été inventée : elle aurait bloqué un numéro validé au comptoir. Le texte d'aide « أكمل الرمز (6 أرقام) » occupe une **ligne réservée de 16 dp** pour que le CTA ne saute pas à la complétion.
  3. **Envoi automatique au 6ᵉ chiffre**, différé de 140 ms (la dernière case a le temps de se peindre), timer annulé au démontage, et **garde anti double-envoi `busyRef` du V4 conservée** — partagée entre envoi manuel, envoi automatique et envoi par QR.
  4. **Haptique** : `haptic("light")` exporté du kit (à chaque chiffre **ajouté**, pas à l'effacement) et `haptic("warning")` quand `props.error` passe non nul. `buzz()` de `Tap` conserve exactement son comportement (un simple `light`).
  5. **Téléphone mémorisé** : `veloria.last-phone.v1` en SecureStore, **conservé à la déconnexion** comme `veloria.endpoint.v1` (s'il vivait dans `kv`, `clearCache()` le purgeait à chaque logout et la fonctionnalité ne servait à rien). `saveLastPhone()` n'accepte **que** le téléphone, refuse le vide et le > 30 caractères sans écraser la valeur stockée. À l'arrivée : numéro en place, `autoFocus` sur le code, « × » (`changeNumber`) pour le changer.
  6. **PIN** : le champ qui capte le clavier est posé **par-dessus** les cases (absolu, `opacity: 0`) au lieu d'être un `Tap` englobant — un tap n'importe où sur la rangée le met sous focus, et l'arbre n'a plus qu'un seul nœud labellisé (les cases passent `accessibilityElementsHidden` + `importantForAccessibility="no"`). La case active vide porte un **caret doré 2×22** ; les chiffres sont en `FONTS.mono`.
  7. **Alignement arabe corrigé** : `farEdge()` (bord extérieur) était utilisé pour le texte d'aide et le libellé replié — en RTL ils partaient à l'opposé de l'icône qui les introduit. Constante locale `startEdge` (droite en arabe). Vu en capture : le libellé « Première connexion ? » recollé à son icône en LTR comme en RTL.
- **Contrats préservés** : flux QR (ADR-054/068) intact, `submitScanned` inchangé, `onLogin(phone, pin, endpoint)` inchangé, erreurs toujours mappées côté `App`, **aucun** texte/`aria-label`/`testID` existant supprimé ou renommé, 2 clés i18n ajoutées avec ar **et** fr (glossaire fermé ADR-051), aucune dépendance, aucune migration, aucun canal IPC, aucun autre écran touché. Les **4 verrous** des tests (`#051424`, `#fbbf24`, 48, 20) n'ont pas bougé.
- **Vérification visuelle réellement faite** : `npx expo start --web --port 8095` (aucune dépendance ajoutée : `react-dom` et `react-native-web` étaient déjà au lockfile) + Chromium de Qoder. **360×553, le pire cas** : contenu **713 px**, bouton « دخول » mesuré à **y ≈ 400-460** → formulaire + code + action visibles sans scroller. Captures et arbre d'accessibilité vérifiés dans les deux langues : état vide (CTA grisé), 4 chiffres (aide affichée, caret sur la 5ᵉ case), 6 chiffres (auto-envoi parti, bannière « hors connexion » apparue, CTA passé en or plein), code révélé (1 2 3 4 5 6 en Mono), aide dépliée. Arbre a11y propre : un seul `textbox` par champ, **zéro** nœud dupliqué pour le PIN, `button "دخول" disabled` bien exposé. **Un seul message console** sur toute la page : `ERR_CONNECTION_REFUSED` vers `127.0.0.1:8099/functions/v1/client-sync` — c'est la **preuve** que l'envoi automatique a bien déclenché un appel réel.
- **Choix écartés, et pourquoi** : secousse animée sur refus (le pont RN de ce poste a déjà fait tomber l'APK le 2026-10-04 — `Animated.Value` dans `transform` reçu natif comme `ReadableNativeMap` ; haptique + bannière à la place) ; compte à rebours de verrouillage à l'écran (`client-sync` ne renvoie pas `locked_until`, les compteurs sont poussés par le POS : l'afficher serait le mentir) ; `autoComplete="tel"` sur le champ téléphone (apport nul une fois le numéro mémorisé, et modification du `Field` partagé pour un seul écran).
- **Question laissée au propriétaire (non tranchée, comportement V4 conservé)** : les cases PIN se remplissent **de la droite vers la gauche en arabe**, donc un code révélé « 123456 » se lit « 654321 » de gauche à droite — alors que le numéro de téléphone, lui, est bien en bidi LTR dans son champ. J'ai gardé le comportement livré et approuvé en V4 plutôt que de le changer en silence ; basculer les cases en LTR forcé est une décision à deux lignes.
- **Portes** : `mobile` typecheck **0** · `mobile` eslint (`src` + le test touché) **0** · vitest `mobile-foundation` **18** (dont le nouveau test) + `mobile-views` 10 + `client-loop` 1 = **29/29** · `prettier --check` **0** sur les six fichiers.
- **Non vérifié (à assumer)** : **rendu natif Android** — aucun APK rebâti (comme en §59), et en particulier **`autoFocus` du champ PIN** : le clavier ne s'ouvre pas sur web, donc le confort « l'écran s'ouvre sur le code » n'est prouvé que par le code, pas par l'usage. Prochain jalon honnête : `npm run build:apk` + installation réelle.
- **Hors périmètre** : aucun autre écran de l'APK, aucune règle métier, aucune migration, aucun canal, aucune dépendance.

## 61) Session 2026-10-28 — Login client V6 « Connexion développée » (ADR-152)

- **Demande** : « غير تصميم واجهة login كليا » (changer complètement la conception de l'écran de connexion). Puis le propriétaire a demandé de chercher « une design nommé **lempe login** », et enfin a tranché : « **طور التصميم الحالي** » — développer le design actuel.
- **Recherche « lempe login » : négative, documentée pour ne pas la refaire.** Web (FR/EN), Dribbble, Behance, Figma Community et recherche d'images : aucun écran de connexion ne porte ce nom. « Lempe » est un nom de famille germanique/danois (un ingénieur-designer freelance, Georg Lempe, sans travail « login » publié) ; les proches trouvés sont des **personnes/comptes** (« Lemmy ux », « Lempo » sur Dribbble) ou des mots danois (« lempe låneregler » = relâcher les règles de prêt). Si l'idée revient, il faut un **lien ou une image**, pas un nom.
- **Arbitrage de direction** : trois maquettes HTML côte à côte (rendues dans le panneau de visualisation de Qoder) — **A** feuille ancrée en bas de l'écran, **B** plein clair (inversion de palette, PIN en lignes soulignées, CTA encre), **C** bandeau or éditorial. Le propriétaire n'a retenu **aucune** des trois et a demandé de développer l'existant : la V6 garde donc l'identité encre + or (et **B** reste formellement en contradiction avec la règle ADR-150 « l'or = action principale », noté dans l'ADR).
- **Ce qui a changé (écran 01 seulement)** :
  1. **En-tête éditorial sur l'encre** : salut selon l'heure (`greeting`/`greetingEvening`) en 12/700 `navyMuted`, titre « فضاء الزبون » en 26/900 blanc, **règle dorée 44×4** sous le titre. Le salut suit **exactement la règle D12 de l'accueil** (`hour >= 18 || hour < 5`) — même phrase à la même heure sur les deux écrans. Le lockup V5 (logo + nom empilés) est remplacé par un rang de marque discret (logo 34 + « Veloria ») à bord de lecture, langue à bord extérieur.
  2. **Deux textures de saisie** : le champ téléphone passe `skin="outlined"` (blanc + `HAIRLINE`, focus filet or) alors que les cases PIN restent `sunkenBg`. Prop **optionnelle, défaut `sunken`** ⇒ recherche/inventaire des autres appelants de `Field` non impacté (aucun autre écran ne change).
  3. **Zone QR = mode d'emploi** : rectangle `borderStyle:"dashed"` de 58 dp, `IconBubble` qr, titre 14 gras (baissé depuis 16 : il rivalisait avec le CTA) et **caption = clé `help1` déjà publiée** (« خذ رمزك من المحل »). Zéro nouvelle chaîne pour porter l'instruction.
  4. **Retour arrière** dans la rangée du PIN dès le premier chiffre (`setPin(p => p.slice(0,-1))`), **césurée** du bouton « إظهار الرمز » par un filet vertical 1 px `COLORS.divider` — sans césure, capture 390 px montrait les deux glyphes lus comme un seul contrôle.
  5. **Trois cercles de filet dans l'encre** (`navyLine`, interne en or `tint(primary,"2E")`), rognés hors écran derrière le rang de marque : `View` pures, `pointerEvents="none"`, `accessibilityElementsHidden` + `importantForAccessibility="no"`. **Aucun nœud `Animated`** (crash du pont RN 2026-10-04) et **aucun dégradé** (`GRADIENTS` supprimé en V4, ADR-150).
- **Ce qui n'a PAS bougé** : toute la logique V5 (verrou local = règle du serveur, envoi automatique au 6ᵉ avec timer annulé au démontage, garde `busyRef`, haptique frappe/refus, téléphone mémorisé + `autoFocus`, cases hors arbre avec un seul nœud labellisé, aide repliée, réassurance en pied, QR ADR-054/068, WhatsApp). Palette, textes, `aria-label` et `testID` existants intacts. **Une seule** clé i18n ajoutée (`deleteDigit`, ar + fr).
- **Budget vérifié, pas supposé** : `evaluate_script` dans la page → contenu **731 px** pour un viewport de **553** (V5 : 713 px), bouton « دخول » à **y ≈ 408‑462**, zone QR à **488‑510**, titre à 100‑134. Les +18 dp nets absorbent l'en-tête ajouté : le champ à filet et la zone QR ont rendu ce que le hero prenait.
- **Comment le rendu a été vu (obstacles réels, à réutiliser)** : le panneau navigateur de Qoder était **masqué** ⇒ `take_screenshot` refuse (`NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`), alors que `evaluate_script` et `take_snapshot` fonctionnent (mesures + arbre a11y obtenus quand même). Pour l'image, capture **Electron offscreen** (`BrowserWindow` 390×844, `show:false`, `webPreferences.offscreen:true`, `capturePage`) — script de scratch **hors dépôt**, non versionné. Trois pièges tombés, tous reproductibles :
  1. `ELECTRON_RUN_AS_NODE=1` (hérité du shell Qoder) ⇒ **`env -u`** obligatoire, sinon Electron se conduit en node.
  2. **Chemin avec espaces** (`C:\Users\zenagui bilal\…`) ⇒ Electron ne charge pas le script et **sort 127 sans un octet de sortie**. Il faut un chemin sans espace (`C:\vshots\`).
  3. **Arguments de position en plus** (`electron script.js url out.png`) ⇒ même échec muet 127 ; la valeur est passée par **variables d'environnement** (`SHOT_URL`/`SHOT_OUT`/`SHOT_PIN`). Et `import` **ESM** ne se résout pas hors d'un dossier tenant `node_modules/electron` ⇒ **`require` CJS** (injecté par le process main).
- **Portes** : `mobile` typecheck **0** · `mobile` eslint (`src`, `--max-warnings 0`) **0** · vitest `mobile-foundation` **18/18** · `prettier --write` **0** (fichiers déjà conformes) · une erreur de lint corrigée en route : `explicit-function-return-type` sur la fabrique locale de cercles.
- **Non vérifié (à assumer)** : **rendu natif Android** — aucun APK rebâti (comme §59/§60) ; en particulier `autoFocus` du champ PIN (le clavier ne s'ouvre pas sur web) et le `borderStyle:"dashed"` sur device (Android le dessine via `BorderDrawable` : fidèle dans le bundle web, à confirmer à l'œil sur téléphone).
- **Ouvert** : (1) la question laissée en §60 — les cases PIN se remplissent de droite à gauche en arabe, donc un code **révélé** se lit à l'envers de gauche à droite (comportement V4 conservé, deux lignes pour changer) ; (2) biométrie non faite par arbitrage §60 ; (3) aucun build APK de la V5 ni de la V6.

## 62) Session 2026-10-28 — Purge dead-code en trois lots (ADR-153)

- **Demande** : « قم بفحص المشروع من كل الاكواد الميتة و اصلاح جذريا » (examen de
  tout le code mort, correction radicale). Doctrine suivie (AGENTS §14,
  ADR-075) : **audit d'abord, jamais de suppression automatique** → lots chiffrés
  présentés, accord en un mot « اوافق », puis exécution lot par lot.
- **Méthode — ce que les outils ne voient pas.** `npx knip` (6.43, `knip.json`
  du lot 3 de 2026-10-19) est **vert** : 0 fichier, 0 export, 0 type, 0
  dépendance. Trois mesures propres ont été écrites pour aller au-delà :
  1. **Fermeture transitive** depuis les entrées de production réelles
     (`src/main.tsx`, `electron/main/main.ts`, `electron/preload/preload.ts`,
     `license-manager/main/main.ts`, `license-manager/renderer/main.tsx`,
     `mobile/src/App.tsx`, fonctions cloud, **cibles des scripts npm**), alias
     `@`/`@domain`/`@shared`/`@features` résolus, 603 fichiers — un fichier
     importé seulement par `tests/**` devient visible.
  2. **IPC à trois niveaux** : 186 canaux déclarés, 187 `handle()`, 184 exposés
     par le preload, 177 wrappers dans `ipc-client.ts` — mais l'UI passe aussi
     par `callChecked((a) => …)` **sans wrapper** : la façade peut être morte
     avec le canal vivant, et l'inverse (2 canaux) existe.
  3. **Index de tokens** sur 1 881 exports en distinguant sites production /
     `tests/` / usage interne au fichier (knip compte un test comme consommateur).
- **Réfutés (gardés, avec preuve)** : `recovery.retry` / `recovery.exit` (appelés
  depuis le **HTML généré côté main** — `recovery-view.ts:95`,
  `license-view.ts:95`), `window.maximizedChanged` / `ocr.progress` (écoutes
  `ipcRenderer.on`, jamais `invoke`), les **270** « export de trop » consommés
  par leur propre fichier (motif sanctioned par AGENTS §5 — retirer `export`
  serait du churn), les 8 scripts npm hors-appelant **documentés** comme outils
  manuels (`docs/licensing/ACTIVATION.md`, `KEY_MANAGEMENT.md`, ADR-034/060/077),
  les 106 clés i18n du client (toutes vivantes, `greeting`/`greetingEvening`
  étant sélectionnées dynamiquement), et `mobile/assets` + `resources/ocr/lang`
  (chargés par chemin construit).
- **Lot A (commit `dacb61f`)** — le « lot 2 bis » de 2026-10-18, différé parce
  que le chantier impression n'était pas commité : `printer.get` +
  `templates.get` retirés **de bout en bout** (channels, preload, `vite-env.d.ts`,
  `ipc-client.ts`, handler `ipcMain.handle` de `printing.receipt.ts`, handler
  `registry.system.ts`, `templateGetSchema`, entrée `staff-gates.ts`, entrée
  `RAW_UNGUARDED_CHANNELS`), compteurs gelés resynchronisés (snapshot
  **185→183**, `FROZEN_SCHEMA_COUNT` **125→124**, `FROZEN_SCHEMA_TOTAL`
  **125→124**, `FROZEN_EXPORT_COUNT` **134→133**, parité impression **27→26** et
  ses bornes de découpage recalées) ; 5 autres wrappers morts (`customerAccess
Activate/Status/QrSvg`, `syncEnqueue`, `syncPushNow`) supprimés **sans toucher
  aux canaux** ; trois branches inatteignables des formatteurs (`sign`/`Math.abs`
  après garde `minor < 0`, dans `formatDzd` et `formatDzdStrict` ; `try/catch`
  mort de `formatDzdSigned` — corrige au passage l'affichage `« -— »` d'un
  négatif hors bornes) ; `scripts/database/probe-sqlite-version.cjs` (aucune
  référence) + son entrée `allowDefaultProject` ; `/release-manager-tmp/` ajouté
  au `.gitignore`.
- **Lot B (commit `f1cf5c6`)** — DT-05 tranché : `audit-rules`, `cash-count`,
  `credit-policy`, `payment-receipt`, `fifo-rules`, `stock-alerts`,
  `return-policy`, `staff/staff` — **595 lignes** que **rien** en production
  n'importe, + **343 lignes** de tests qui ne testaient qu'elles. Preuve que la
  règle est bien exécutée ailleurs : `fifo.ts` (couches SQL),
  `computeReceiptBalancesInline` (`customers.repo.ts:533` — le commentaire
  lui-même disait « miroir local »), `staff.repo.ts` (code 6 chiffres, verrou
  5/5 min, `STAFF_PERMISSIONS`), `return-settlement.ts`, `inventory.repo.ts`,
  formule Z inline (`finance.repo.ts:276`), `debt-status.ts`. Danger documenté :
  `main-domain-parity` ne comparait **que 2 symboles**, donc un écart entre la
  copie décorative et la règle exécutée était invisible. `p3b-commerce.test.ts`
  et `staff-domain.test.ts` **conservés mais élagués** (ils mélangeaient vivant
  et mort) ; `tests/integration/payment-receipt.test.ts` intact (exerce le
  miroir main sur vraie base). Commentaires corrigés (fifo, customers.repo,
  staff.repo, `common/dates.ts`).
- **Lot C** — 23 symboles test-only supprimés **un par un avec preuve du chemin
  exécuté** (voir la table de `docs/ADR-153-purge-dead-code.md`) :
  `clearCartDraftsAtomic` (aucun canal `carts.clear`), les 4 use-cases
  d'`application/customers/client-access.ts` (V1 du QR retirée du POS, `…V2` en
  service ; `clientAccessActivateSchema` à la frontière ; `buildSnapshotPayload`
  du main ; `assertValidAnnouncement` appelé en direct), `validateBusinessDate`
  (Zod `businessDate`), `resolveIntakeSellingPrice`/`validateAdjustment`,
  `applyStockDelta`/`assertReturnQuantity`, `addSafeMinor`,
  `extractBarcodeCandidates` (l'extracteur vivant est celui de `ocr/parser.ts`),
  `toBaseQuantity`, `nextTemplateVersion` (SQL `version + 1`),
  `assertProformaTransition` + **le doublon de type** `ProformaStatus` (la
  source vivante est `features/proformas/types.ts:4`), `assertAdditionalRefund`,
  `assertPoTransition`/`computePoTotals` + type `PurchaseOrderStatus` (carte
  `PO_TRANSITIONS` du repo + bornes déjà imposées par `purchaseCreateSchema`
  `.min(1).max(200)`), `applySupplierIntakeBalance` (SQL), `sortCustomers` (le
  tri autoritaire est serveur), `staleLabel` (le libellé de fraîcheur est rendu
  par `Home.tsx:99`).
- **Refusé en lot C — trois politiques de sécurité sans application** :
  `isQrExpired` (7 jours), `isSessionExpired` (90 jours) et `nextFailedState`
  (5 échecs → verrou 5 min) de `src/domain/customer/client-access.ts`. **Aucun
  chemin exécuté ne les applique** : pas d'horodatage dans le payload QR, pas de
  colonne `issued/expires/last_login`, `customer_access.failed_attempts` n'est
  jamais écrit autrement que `0` à l'INSERT (`client-access.repo.ts:284`), et la
  fonction Edge lit `locked_until` sans jamais l'incrémenter. Ce sont les trous
  déjà notés dans l'audit 2026-10-25 — la copie domaine est la **seule**
  expression de la politique, donc à **brancher** (tranche verticale propre),
  pas à supprimer. Idem `units.convertQuantity` + sa table `TO_BASE` (aucune
  conversion d'unité n'est exécutée aujourd'hui).
- **Conservés comme gardes / coutures** : `RAW_GUARDED_CHANNELS` (la garde
  exécutable de `raw-guarded-channels.test.ts` — DT-01 de 2026-10-18 est clos),
  `memorySecretBackend` (injection à la place de DPAPI), le bloc `PIN_KDF_*`
  (contrat `pin-kdf-parity.test.ts`), `signDetached`/`verifyPayloadSignature`/
  `planPreset`/`hasFeatureAccess` (primitives **vendeur** de la licence, face de
  `keygen.mjs` — l'opérateur détient la clé), `allocateGlobalDiscount`
  (cross-check de parité), `allKeys` (test de fondation du client).
- **Lot D refusé par l'opérateur** : `app_meta`, 5 colonnes legacy de
  `company_profile`, `customers.bread_profile_json`,
  `daily_closings.z_report_path`, `v_daily_sales`, `v_customer_balance_check`,
  8 index `bread_orders` **restent**. Un `DROP` exige une migration 0057
  destructive, non annulable sur les postes livrés (AGENTS §12), pour zéro octet
  utile ; `bread_orders` est DELIBERATE-KEEP (ADR-109) ;
  `v_customer_balance_check` est lue par un test d'intégration.
- **Deux découvertes hors périmètre, consignées** : (1) le test de boucle client
  `client-loop.test.ts` construisait le cliché avec la copie **morte** puis la
  poussait à l'APK — il exerce désormais `buildSnapshotPayload` (les trois
  kinds), et le contenu réel du miroir n'était donc testé par personne avant
  ceci ; (2) une garde `P5` de `main-domain-parity.test.ts` fige maintenant les
  deux cartes de transitions (devis, commande) lues dans les repos main.
- **Planchers de couverture : la purge a révélé qu'ils mesuraient du code mort.**
  Aucun seuil abaissé. `test:coverage:features` est passé de 65,06 % à 62,33 %
  fonctions en supprimant `sortCustomers` et ses 5 fermetures de comparaison
  (couvertes) → 4 actions **réelles** du panier couvertes (`removeLine`,
  `clear`, `setSaleOperationId`, `hydrate`, avec le piège retrouvé au passage :
  deux lignes du **même** produit fusionnent, assertion alignée sur le
  comportement réel). `closing-rules.ts` : les 3 gardes `isSafeInteger`/`< 0`
  sur agrégats sont **prouvées** inatteignables (chaque champ déjà borné
  0..1e9 ⇒ credits ≤ 3e9, debits ≤ 2e9) → retirées avec la preuve écrite dans le
  fichier, comme le bras salé du lot A. `proforma-rules.ts` : le rejet « remise
  non entière » n'était testé que côté main → 2 assertions de parité ajoutées.
  Rouge **pré-existante** trouvée en relançant la porte : `previewReturnSettlement`
  n'avait **jamais** été couverte depuis `50a56cc` (session 54) — fermée par
  commit `d5cc130`.
- **Git** : trois commits de code (`dacb61f` lot A, `d5cc130` test coverage,
  `f1cf5c6` lot B) + le lot C + ce `docs(handoff)`. **Aucun remote** configuré
  sur `chore/root-layout`. Le piège revécu : `git rm` **indexe** la suppression
  immédiatement, donc un `git add <fichier> && git commit` postérieur embarque
  les 11 suppressions du lot B dans un commit de test — repéré en relisant
  `git show --stat`, corrigé par `git reset --soft` local (sans remote, sans
  travail d'autrui dans l'index), puis re-commit réparti. Règle à retenir :
  après **chaque** commit, relire `git show --stat`.
- **Le session 61 (client V6) a été commitée par l'opérateur en parallèle**
  (`64c1997`, `d648241`) pendant cette purge — aucun chevauchement de fichiers,
  `handoff.md`/`docs/INDEX.md` ont été repris par-dessus proprement.
- **Ouvert** : (1) brancher les trois politiques client (QR 7 j, session 90 j,
  verrou 5 échecs) — c'est un trou de sécurité, plus vieux que cette purge ;
  (2) dette de duplication reportée et chiffrée dans ADR-153 §« Hors périmètre »
  (`useOperationId` adopté par 5 dialogues sur 16, deux familles de formatteurs
  DZD avec plafonds différents, `isRealCalendarDate` en trois exemplaires,
  `fmtMinorDa`, `normalizeBarcodeValue`, `formatBytes`) ; (3) `release/` et
  `release-manager-tmp/` gardent chacun un `app.asar` **verrouillé par le
  scanneur** (~35 Mo), jamais forcé — part au redémarrage (doctrine §55).

## 63) Session 2026-10-28 — Tableau de bord : 13 surfaces → 8 (ADR-154)

- **Demande** : « قم بتبسيط و تطوير تصميم واجهة لوحة التحكم » — même page que §52,
  côté design cette fois.
- **Diagnostic sur capture réelle d'abord** (spec `dashboard-ui` rejouée avant
  toute écriture) : le Tableau de bord était **le seul écran resté hors** de la
  refonte ADR-148 — 13 surfaces, ≈250 px d'encadrement avant le premier graphique,
  et le même `100,00 DZD` écrit deux fois à 70 px d'écart (bande « Aujourd'hui »,
  puis carte « Ventes nettes »). Constats de code : `MiniMetric` était un
  `StatsStrip` réécrit à la main, avec sa surface `bg-[#0f1e30]` **absente** des
  surcharges du thème clair (quatre pavés navy sur fond blanc, ADR-072) ; 6 chiffres
  dits deux fois (ventes nettes, dépenses, dettes fournisseurs, créances, échéances,
  ruptures) ; 2 à 5 `Card` **dans** la `Card` « Détails » ; la période annoncée
  **quatre fois** ; `max-h-80 overflow-auto` réapparu sur le tableau des catégories ;
  une période vide = neuf `0,00 DZD` et cinq sections « Aucune activité ».
- **Structure rendue** : bandeau `StatsStrip` principal 4 cellules (ventes nettes ·
  marge brute · **bénéfice net** · trésorerie) + bandeau secondaire 5 cellules
  (créances · dettes fournisseurs · valeur stock · achats · dépenses) ; « Ventes du
  jour » (compteur `useCountUp` conservé) **remonte dans le sous-titre de page** et
  disparaît si aujourd'hui n'est pas dans la période ; l'onglet **Finances** est
  supprimé — son seul chiffre inédit était le **coût de revient** (`ventes − marge`),
  désormais sous-ligne de la marge, et « 5 meilleures rotations » rejoint le
  graphique des catégories ; `DetailSection` (titre + lignes) remplace les cartes
  imbriquées ; sections d'activité **non rendues si vides** ; barres de part sur
  moyens de paiement et catégories ; `EmptyState` unique « Aucune activité sur la
  période » ; la période n'est plus dite qu'une fois. **13 surfaces → 8, dont zero
  carte dans une carte.**
- **Bandeau « À traiter »** (1 surface conditionnelle) remplace la carte Vigilance
  et les deux cellules d'alerte de « Aujourd'hui » : échéances dépassées, ruptures,
  articles sous le seuil, sauvegarde absente, intégrité — **absent s'il n'y a rien**.
  **Décision d'intégrité prise en route** : la première version proposait un saut
  direct vers Dettes/Stock/Paramètres branché sur `onNavigate` élargi à `ModuleId`.
  Abandonné tel quel, parce que `RouteBlocked` jure « non inclus dans **votre
  licence** » alors que `moduleAllowed` teste **aussi le rôle staff** — un caissier
  sans droit « Dettes » aurait lu un mensonge (ADR-038). Retenue : prop
  **`canNavigate`** câblée sur `moduleAllowed` dans `App.tsx` (source unique de la
  permission, rien de dupliqué dans la feature) ⇒ une puce n'est un **bouton** que
  si le module est réellement accessible, sinon elle reste du **texte**.
- **Fichiers** : `src/features/dashboard/DashboardScreen.tsx`, `widgets.tsx`
  (`MiniMetric`/`RecentCard`/`EmptyMini` supprimés, `DetailSection`/`ShareBar`/
  `AlertChip`/`AlertBand` ajoutés), `src/app/shell/module-screens.ts`,
  `src/app/shell/App.tsx`, `src/features/history/HistoryScreen.tsx` (type élargi,
  appel inchangé), `tests/e2e/dashboard-ui.spec.ts`, `docs/ADR-154-…`, `docs/INDEX.md`.
  **Zéro** migration, canal, schéma, dépendance ; exports PDF/Excel/CSV, aperçu A4,
  F4/F5/F8, filtre catégorie et garde anti-course intacts.
- **E2E enrichi, pas assoupli** : le produit de test reçoit un **Seuil minimum 10**
  pour stock 5 (alerte déterministe ; la sauvegarde était déjà faite au boot sur une
  base isolée, donc aucune puce « Aucune sauvegarde » à ce moment-là) et la spec
  **clique la puce** « … article(s) sous le seuil » puis vérifie l'arrivée sur
  « Gestion des stocks et réceptions ».
- **Trois échecs de harnais rencontrés, tous hors UI — à retenir** : (1)
  `integrity.mismatch` sur `dist/assets/*.js` : le manifeste signé couvre **le
  renderer**, donc `npm run build` **sans** `npm run build:electron` (qui re-signe)
  rend tout E2E impossible ; (2) `license.import_hardware_mismatch` et (3) un
  `beforeEach` à 300 s : `collectHardwareSources()` dépend de fils `reg`/`wmic`/
  `powershell` et **ampute** l'empreinte quand l'un échoue (memo P0-3, TTL 30 s) —
  sous contention CPU (vitest/build lancés en parallèle), deux processus ne
  calculent plus le même hash. **Reproduction : ne jamais lancer un build ou vitest
  pendant un E2E** ; relancé seul, machine au repos, la spec passe en **3,0 min**.
- **Portes** : `tsc -b` **0** · `typecheck:electron` **0** · eslint (dashboard,
  shell, history) **0** · prettier **0** · `verify:fr` **0** · `verify:encoding`
  **0** · **vitest 168 fichiers / 1 141 tests 0** (arbre commun, lot C déjà en
  place) · build ✓ · build:electron ✓ (manifeste re-signé) · **E2E `dashboard-ui`
  1/1** · captures `test-results/ui/dash-1-sombre.png`, `dash-2-activite.png`,
  `dash-3-clair.png` (spec temporaire de capture supprimée après usage, doctrine
  §53).
- **Git** : commit de code + `docs(handoff)` séparés, add **par chemin explicite** —
  la session 62 tournait **en parallèle dans le même arbre** (40 fichiers modifiés
  au début de cette session, commités en `288b082`/`1f405df` pendant celle-ci) ;
  `git show --stat` relu après chaque commit (règle laissée par §62).
- **Ouvert, hors périmètre** : `Rapports` reste sur 6 cartes `Kpi` (même motif
  qu'ici avant cette session) ; le graphique `BarChart` garde son `viewBox` 640×170
  qui étire une série de 1 à 3 points (carte haute, barre fine) — le corriger
  toucherait `Rapports`, donc hors de cette demande ; jour métier UTC (E-35) inchangé.

## 64) Session 2026-10-29 — Montée de gamme de l'outillage (ADR-155)

**Demande** : « ابحث في الانترنت بعمق … *تنظيم جذع المشروع باحدث التقنيات

- تطوير مكتبات المشروع بأحدث التقنيات و حسب توافقها ». Recherche web + npm
  registry + guides de migration officiels avant toute installation ; aucune
  suppression de code, aucune migration SQLite.

**Arbitrages de compatibilité**

- **TypeScript 7 refusé** : `typescript-eslint@8.72.1` déclare
  `typescript >=4.8.4 <6.1.0`. Monter en 7 aurait obligé à désactiver le lint
  typé. TS **6.0.3** retenu ; `baseUrl` supprimé, `paths` en `./`, et
  `moduleResolution: node10` + `ignoreDeprecations: "6.0"` pour l'émission
  CommonJS de `electron/` et `license-manager/`.
- **Electron 45 + better-sqlite3 13** : le driver passe en **N-API**, avec
  `prebuilds/win32-x64.node` dans le paquet (SQLite 3.53.4). Conséquence :
  `@electron/rebuild`, `bindings`, `postinstall` et `rebuild` **supprimés** ;
  `npmRebuild: false` dans les deux configs electron-builder ; `asarUnpack`
  inchangé. La CI ouvre une base `:memory:` pour prouver le chargement.
- **safeStorage sync déprécié** : `isEncryptionAvailable/encryptString/
decryptString` sont dépréciés en 45 et **retirés en 46**. Les 6 appels
  (licensing + sync) restent avec dérogation eslint documentée ; migration
  async à faire **avant Electron 46** (chemins de lecture/écriture synchrones
  du licensing et de la sync, chantier séparé).
- **Vite 8/Rolldown** : `rollupOptions` → `rolldownOptions` ;
  `manualChunks` objet remplacé par `codeSplitting.groups` (react prioritaire,
  vendor ensuite) ; `esbuild@0.28.2` explicite pour les préloads ;
  `import.meta.dirname` dans les configs.
- **Zod 4** : `z.uuid()` (51), `.loose()` (12), `strictObject`, codes
  `"custom"` ; schéma d'impression scindé en `printPayloadBase` +
  `printPayloadSchema` (plus de `.innerType()`) ; `ZodEffects` disparu.
  **Correctif de production** : `z.uuid()` est un `ZodUUID` distinct de
  `ZodString` ; le garde `schemaRequiresOperationId` renvoyait `false` et
  aurait désactivé l'exigence d'`operationId` dans `handle.ts:88`. Garde
  corrigé (`ZodString | ZodUUID`), `operation-id-coverage` 8/8.
- **Porte features recalibrée (décision propriétaire)** : Vitest 5/V8 compte
  les branches autrement et incluait les hooks `use*.ts` à 0 % (React/DOM).
  Hooks exclus du périmètre « modules purs sans DOM ». Mesure réelle
  53,77 statements · 66,11 branches · 74,62 fonctions · 52,92 lignes ; les
  planchers passent à **50/65/70/50** (trois montent, la branche passe de 80 à
  65 à cause du changement d'instrument, pas du code). 5 tests de bornes
  `proforma-rules` ajoutés (devis vide, >500 lignes, ligne sans nom, remise >
  sous-total, répartition exacte).

**Incidents / état du poste**

- `node_modules/electron/dist/resources/default_app.asar` était verrouillé
  par le scanner (EBUSY sur tout rename) : Electron 45 a été remplacé **dans
  la même arborescence** depuis le paquet officiel, puis le lock a été
  régénéré par `npm install --package-lock-only`. **Ne pas forcer `rm`** sur
  l'artefact verrouillé (STRUCTURE §7) ; un `npm ci` sur machine propre
  installe la version du lock. `node_modules` local contient encore des
  paquets extraneous de l'ancienne chaîne (`npm ls` les signale) — sans effet
  runtime, à nettoyer après redémarrage si souhaité.
- Les serveurs Expo des sessions précédentes tournent encore (ports 8095,
  8096, 8097) ; non arrêtés pendant cette session, aucun impact sur les
  portes (E2E lancée seule).
- `release/win-unpacked/` régénéré avec Electron 45 pour la vérification
  (component-smoke **1/1**) ; les installateurs `.exe` livrés n'ont pas été
  reconstruits.

**Portes mesurées sur l'arbre final**

`format:check` 0 · `typecheck` ×3 0 · `lint` 0 · `verify:migrations`
**VERIFIED (56)** · `verify:domain` 0 · `verify:fr` 0 (333 fichiers) ·
`verify:encoding` 0 (944) · `verify:perf` 0 · `license:scan` 0 (1 399
fichiers) · **vitest 169 fichiers / 1 146 tests 0** · **test:coverage 0**
(proforma 90 % branches après tests) · **test:coverage:features 0**
(160 fichiers / 1 085 tests, 50/65/70/50) · `build` 0 · `build:electron` 0 ·
`build:manager-client` 0 · `build:manager` 0 · **E2E Electron 45 11/11**
(activation/DPAPI, PDF, impression, vente SQLite) **+ component-smoke 1/1 sur
l'app empaquetée**.

**Git** : `a8c4e92` (palier 1) · `97c6b02` (palier 2) · `45fc03a` (palier 3) ·
`9bd9925` (palier 4) · ce `docs(handoff)`.

**Reste ouvert** : TypeScript 7 quand typescript-eslint le supportera ;
migration async `safeStorage` **avant Electron 46** ; montée Expo mobile
(APK séparé, hors périmètre) ; suite E2E complète (50 tests) non relancée ;
installateurs non reconstruits. ADR-155 documente les décisions et les
mesures.

## 65) Session 2026-10-29 — Organisation du tronc racine (ADR-156)

**Demande** : répétition de « ابحث في الانترنت بعمق … تنظيم جذع المشروع باحدث
التقنيات » — cette fois centrée sur le **tronc racine** (pas les bibliothèques,
traitées en session 64).

**Recherche** : conventions 2026 pour une racine Node/TypeScript/Electron
(configs attendues à la racine vs `config/`, `tsconfig.base` + project
references, `tsBuildInfoFile`, `--config` de Playwright/electron-builder/Knip,
Renovate vs Dependabot, `engine-strict`/`save-exact`). Décision : garder les
entrées attendues par les outils à la racine et sortir uniquement les configs
non standard.

**Livré**

- **`tsconfig.base.json`** : options strictes communes (target ES2022,
  skipLibCheck, strict, noUncheckedIndexedAccess, noUnusedLocals,
  noFallthrough, forceConsistent, isolatedModules, resolveJsonModule). Les
  trois tsconfigs font `extends` et ne gardent que leurs différences.
- **Cache `tsbuildinfo`** : `node_modules/.cache/tsbuildinfo/{root,electron,
manager}.tsbuildinfo` ; les deux fichiers racine générés ont été supprimés et
  `npm run clean` cible le cache.
- **`config/`** : `electron-builder/{pos,manager}.yml`, `playwright.config.ts`
  (`testDir: ../tests/e2e`), `knip.json`. `tsconfig.json` inclut
  `config/**/*.ts` ; les scripts appellent `--config`.
- **Governance** : scripts `check` (format + lint + typecheck ×3 + mobile),
  `verify` (migrations/domaine/fr/encoding/perf/licence), `ci` (check + tests +
  2 couvertures + verify + builds + knip), `knip` (npx épinglé 6.43.0).
  `.npmrc` : `engine-strict=true`, `save-exact=true`. `.github/renovate.json`
  (regroupements outillage/runtime, majeures sur dashboard) et CI durcie
  (`concurrency`, `permissions: contents: read`, timeout 60 min, appels aux
  scripts uniques).
- **Mobile** : `mobile/tsconfig.json` reçoit `ignoreDeprecations: "6.0"` —
  `expo/tsconfig.base` utilise encore `node10` et TS 6 le refuse.
- **Docs** : ADR-156, INDEX (ADR-001→156), STRUCTURE (racine + config/ +
  buildinfo), README (`check`/`verify`/`knip`, 54 tests E2E).

**Incidents / limites**

- **Packaging non re-vérifié** : tout nouveau dossier de sortie est bloqué par
  le scanner sur `resources/default_app.asar` (EBUSY), y compris avec
  `--config.electronDist`. Le fichier `config/electron-builder/pos.yml` est
  bien chargé et ses chemins sont résolus depuis `projectDir` (vérifié dans
  `app-builder-lib/out/packager.js`) ; `npm run package:win` reste à rejouer
  après redémarrage ou sur machine propre. **Ne jamais forcer `rm`.**
- `knip` n'était pas une dépendance : il est invoqué via
  `npx --yes knip@6.43.0` (outil d'analyse, 12 dépendances directes) pour ne
  pas alourdir le lock ; config `config/knip.json` vérifiée (0 finding).
- Les anciens `tsconfig*.tsbuildinfo` racine étaient des artefacts non suivis,
  supprimés ; aucun fichier suivi touché.
- Aucun changement runtime, aucune migration, aucun canal IPC.

**Portes** : `npm run ci` complet **exit 0** (check, 169 fichiers / 1 146
tests, coverage + coverage:features, verify, builds, knip) · Playwright
`--list` **54 tests / 24 fichiers** · E2E `component-smoke` avec config
déplacée **1/1** · packaging **bloqué scanner** (voir ci-dessus) · suite E2E
complète non relancée.

**Git** : `4f3722d` (tronc) · ce `docs(handoff)`.

**Reste ouvert** : rejouer `npm run package:win` après redémarrage ; Renovate
inerte tant qu'aucun remote n'existe ; dettes session 64 (TS 7, `safeStorage`
async avant Electron 46, Expo mobile).

## 66) Session 2026-10-29 — Développement des interfaces, 19 surfaces (ADR-157)

**Demande** : « قم بتطوير تصميم واجهات الصفحات التالية : شريط التنقل، لوحة
التحكم، البيع، المنتجات، إضافة منتج، العملاء، إضافة عميل، المخزون، إضافة
مخزون جديد، الموردين، إضافة مورد، السجل، التقارير، الزكاة، الديون،
المرتجعات، مرتجع جديد، الإعدادات، التفعيل. التطوير يكون بالترتيب لا تنتقل
إلى صفحة حتى تنهي الصفحة التي قبلها. »

**Direction** : question unique au propriétaire (choix « تطوير الهوية الحالية
(موصى به) »). Aucune nouvelle identité, aucune dépendance UI ajoutée : le
travail approfondit Stitch Industrial Dark (ADR-033/035/036) et le thème clair
(ADR-072).

**Socle partagé (une fois, avant les pages)**

- `Card` : profondeur discrète (inset + ombre basse), fond inchangé.
- `PageHeader` : point ambre + H1 24 px + période 12 px.
- `StatsStrip` : filet de teinte par cellule, chiffres mono 19 px.
- `Kpi` : rail latéral coloré, valeur 22 px.
- `FormSection` : icône cerclée, `hint` à droite, **action optionnelle**.
- `BarChart` : grille pointillée, barres arrondies, `currentColor` (lisible en
  clair).
- Survol global des lignes de registres (sombre + clair) ; entrée de module
  `veloria-page-in` 180 ms (neutralisée par `prefers-reduced-motion`).
- Surcharges claires ajoutées : `bg-[#122131]/95` (pieds de dialogue) et
  `bg-[#0b1a2b]/95` (en-tête Paramètres).

**Les 19 pages, dans l'ordre demandé**

1. **Navigation** : bloc de marque latéral (logo + « Caisse · DZ »), groupes
   avec filet, tuiles d'icônes, rail ambre actif, dégradé de fin de liste ;
   bandeau licence/santé/horloge/avatar/déconnexion compacte ; raccourcis en
   touches.
2. **Tableau de bord** : bandeaux de chiffres avec filets, encaissements par
   moyen, onglets de détail segmentés (ambre plein), actions concrètes sur
   période vide (caisse, produit, client).
3. **Caisse** : recherche et client à 52 px, scanner vivant, résultat actif à
   rail, fiche client condensée (avatar, solde, plafond, règlement), onglets
   paniers hiérarchisés, panier vide avec raccourcis, total héros + F10.
4. **Catalogue** : filtres groupés, exports séparés, sélection unifiée,
   monogrammes, marge sous le prix de vente, stock + unité, état vide avec
   création directe.
5. **Fiche produit** : modale 960 px, en-tête icône, rappel des champs requis,
   marge estimée en chiffre héros avec badge Rentable/Vente à perte.
6. **Clients** : avatars, dette en rouge + jauge de recouvrement, filtres et
   exports, sélection, état vide avec création.
7. **Fiche client** : 960 px, sections partagées, crédit/notes au même niveau.
8. **Stock** : menu d'actions avec chevron, filtres groupés, monogrammes,
   quantité/unité sur deux lignes, valeur en ambre.
9. **Réception** : sections partagées, rappel transactionnel, pied collant.
10. **Fournisseurs** : registre cohérent, monogrammes + réceptions, jauge
    d'encours, inactifs estompés ; **libellé corrigé** « Fournisseurs actifs »
    (la requête compte `is_active`, pas les comptes endettés).
11. **Fiche fournisseur** : deux colonnes (identité/contact, fiscalité/notes),
    code auto-généré rappelé, `Ctrl+Entrée`.
12. **Historique** : dates étiquetées, exports groupés, date+heure fusionnées,
    recherche élargie.
13. **Rapports** : périodes et rubriques en segments avec état actif, résultat
    net en chiffre héros avec badge Bénéfice/Perte, sections à filet ambre.
14. **Zakat** : Nisab/Taux/Hawl en trois repères, base de calcul en lignes,
    historique titré/compté, dialogue en sections + total héros, sélecteur
    d'année compact.
15. **Dettes** : filtres groupés, jetons de tiers, jauge de reste, sélection
    unifiée.
16. **Retours** : monogrammes + facture d'origine, jauge de remboursement,
    annulés estompés ; sous-ligne « Client #id » erronée **retirée**
    (`entity_id` = identifiant du retour, pas du tiers).
17. **Nouveau retour** : modale 960 px, deux tuiles client/fournisseur, résumé
    facture en quatre repères, articles et règlement en sections, total
    collant. Flux E2E client comptant **et** crédit revérifiés.
18. **Paramètres** : navigation locale à rail, en-tête collant compatible clair,
    panneaux unifiés (`bg-black/25`), test de navigation E2E vert.
19. **Licence** : page en deux volets (poste + certificat), empreinte matérielle
    copiable, guide d'activation en trois étapes si non activé.

**Incidents / décisions**

- Aucun changement de domaine, IPC, migration ou règle métier. Tous les
  libellés, rôles ARIA et noms accessibles utilisés par les tests ont été
  conservés ; le nom accessible du bouton « Encaisser » reste exact (le chip
  F10 est `aria-hidden`).
- Deux libellés de **données** corrigés (fournisseurs, retours) — voir ADR-157.
- Les captures Electron ont été prises sur base vierge avec données de
  démonstration créées par l'interface (`test-results/visual-*.png`), pas sur
  des données de production.
- Les tiroirs de détail non listés héritent des primitives mais n'ont pas été
  restructurés en profondeur.

**Portes** : `npm run format:check` OK · `npm run lint` OK · `npm run check`
(renderer, electron, manager, mobile) OK · `npm test` **169 fichiers / 1 146
tests OK** · `npm run verify` OK (migrations, domaine, FR, encodage, perf,
secret-scan) · E2E : vente comptant, retour client comptant, retour client
crédit, navigation paramètres — tous verts · captures Electron pour chaque
surface clé.

**Git** : 19 checkpoints (un par surface) — `43f3ac1` navigation, `9dc14c8`
tableau de bord + socle, `06d9141` caisse, `f11023e` catalogue, `2b51517` fiche
produit, `7253db1` clients, `3236f51` fiche client, `b342ecf` stock, `da17615`
réception, `bf0404f` fournisseurs, `13bb27e` fiche fournisseur, `223876a`
historique, `c87fa98` rapports, `b164fb9` zakat, `5f51960` dettes, `ef051a6`
retours, `b2d5560` nouveau retour, `6f6c626` paramètres, `4d0ebbb` licence ·
ce `docs(handoff)` (ADR-157 + INDEX + état courant).

**Reste ouvert** : dettes sessions 64/65 (TS 7, `safeStorage` async avant
Electron 46, Expo mobile, `npm run package:win` à rejouer après redémarrage) ;
tiroirs de détail non restructurés (voir ADR-157 §Limites).

## 67) Session 2026-10-29 — Miroir Supabase `veloria-pos` raccordé (ADR-158)

**Demande** : « لدي قاعدة باسم veloria-pos تحقق منها » — vérifier le projet
Supabase existant, puis le raccorder au POS.

**État vérifié du projet** (`ynktschorbwukxovjzcz`, région `eu-west-2` Londres,
plan Free, statut Healthy, URL `https://ynktschorbwukxovjzcz.supabase.co`) :

- Tables `client_access`, `client_payloads`, vue `latest_client_payloads`.
- RLS active sur les deux tables (`API DISABLED`), zéro policy — conforme à
  `rls.sql` (`REVOKE ALL`).
- Fonction `client-sync` déployée ; **Verify JWT désormais OFF** (le
  téléphone n'est pas un utilisateur Supabase Auth) ; aucun secret custom :
  les secrets par défaut `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
  suffisent (prouvé par un appel qui atteint le code de la fonction).
- **Écart de schéma détecté** : le projet portait une version antérieure de
  `cloud/supabase/schema.sql` — `client_access` sans `pin_salt` ni
  `pin_algo`. Corrigé par `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (additif,
  aucune donnée touchée). Sans cela, toute activation client aurait échoué en
  `PGRST204` à la poussée.
- Clés utilisées : legacy `anon` (QR V2) et `service_role` (main uniquement).
  Aucune clé n'est versionnée ; le service_role est chiffré DPAPI dans
  `app_settings.client_sync` (`dpapi1:`), l'anon reste publique (RLS).

**Raccordement POS**

- Sauvegarde préalable : `private/backups/veloria-before-supabase-2026-10-29.sqlite`
  (git-ignoré, `VACUUM INTO`, 3 162 112 octets).
- Écriture de `client_sync` via le code main compilé (`saveSyncConfigAtomic`)
  avec l'URL + les deux clés, intervalle 15 min, activation ON.
- Première poussée : **succès** `lastPushAt = 2026-10-29T21:54:55.614Z`,
  `lastError = null`, file vide.

**Bug réel corrigé (produit par la première poussée)**

- 409 : `client_payloads_customer_id_fkey` — 9 clichés appartenaient à 3
  clients jamais activés (ventes/paiements automatiques). Un seul client non
  activé bloquait **toute** la poussée.
- Correctif : `hasActiveClientAccess` (ligne `customer_access` non révoquée)
  garde `enqueueSnapshotAtomic` + `enqueueCustomerRefresh`/`enqueueSaleRefresh` ;
  test de régression (accès absent **et** révoqué → 0 ligne `sync_outbox`).
- File orpheline purgée sur le poste (données dérivées, régénérables) ; la
  file vide a permis la poussée réussie ci-dessus.

**Test cloud complet** (données temporaires, nettoyées) :

1. INSERT `client_access` + `client_payloads` avec `service_role` → 201.
2. `POST /functions/v1/client-sync` avec téléphone + PIN → **200** avec le
   cliché attendu.
3. DELETE des deux lignes → 0 restante.

**Portes** : `npm run format:check` OK · `npm run lint` OK · `npm run check`
(renderer/electron/manager/mobile) OK · `npm test` **169 fichiers / 1 147
tests** · test de régression ciblé 7/7 · `npm run build:electron` OK.

**Git** : `7ae7f7d` (garde sync + test) · ce `docs(handoff)` (ADR-158 +
INDEX + état courant).

**Reste ouvert** :

- Activer au moins un client réel (Clients → fiche → Application mobile →
  PIN 6 chiffres → QR) pour que le premier cliché réel parte ; ensuite le
  téléphone se connecte avec `client-sync`.
- Plan Free : pause après 7 jours sans activité (la poussée 15 min sert de
  keep-alive).
- Clés legacy : une rotation future devra mettre à jour POS + QR V2.
- Dette sessions 64/65 inchangée (TS 7, `safeStorage` async, Expo mobile,
  `npm run package:win`).

## 68) Session 2026-10-30 — APK client signé (build local, sans EAS)

**Demande** : « ابني تطبيق العملاء » — produire l'APK client installable,
raccordé au miroir Supabase.

**Configuration**

- `mobile/eas.json` : profils `preview` (APK) et `production` (AAB) pointent
  désormais `https://ynktschorbwukxovjzcz.supabase.co` + la clé **anon
  publique** (aucune clé `service_role` dans l'APK ni le dépôt).
- L'APK reste **universel** : le QR V2 (ADR-068) embarque l'endpoint du
  magasin et prime sur la valeur gravée ; les valeurs de build ne servent
  qu'au repli (saisie téléphone + PIN sans scan).
- `npm run validate-env` (mobile) : OK (ni placeholder ni HTTP clair).

**Build**

- EAS non connecté sur ce poste → build **local Gradle** :
  `cd mobile/android && EXPO_PUBLIC_SYNC_URL=… EXPO_PUBLIC_ANON_KEY=… ./gradlew assembleRelease`.
- Java 17 (Temurin), Android SDK + NDK présents ; Gradle 8.10.2 ;
  Build-Tools 34 installés automatiquement pendant le build.
- Sortie : `mobile/android/app/build/outputs/apk/release/app-release.apk`
  (**88 462 721 octets**) ; copie versionnée
  `release/Veloria-Client-1.0.0.apk` (git-ignoré) + `.sha256`
  `6bdf6017323a87827bc040813b370f66020622b6585b5763eb8e103979cc39dc`.

**Vérifications**

- `aapt dump badging` : `dz.veloria.client`, versionName 1.0.0, versionCode 1,
  minSdk 24, targetSdk 34, permissions CAMERA + INTERNET (AUDIO bloquée).
- Signature : `apksigner verify` → CN=Veloria, OU=Mobile, O=Veloria, C=DZ ;
  SHA-256 certificat `c190b12a6c5c98979510b6f694208b1f20288bab31a5c1884b73e9412c16a29f`
  (même keystore que `%USERPROFILE%\.veloria-keys\veloria-release.keystore`,
  copie `mobile/veloria-release.keystore` identique — SHA-256 du fichier
  `16afef6a…`).
- Bundle Hermes (`assets/index.android.bundle`, 1 407 436 octets) : contient
  bien `https://ynktschorbwukxovjzcz.supabase.co` et la clé anon (repli).
- `npm run license:scan` OK.

**Limites**

- Aucun émulateur AVD ni téléphone connecté sur ce poste : l'APK n'a pas été
  lancé au runtime. Première installation à faire sur un téléphone réel
  (activer un client dans POS → scanner son QR V2).
- Avertissement Gradle `NODE_ENV` non défini (sélection `.env` d'expo-constants) :
  sans impact sur la valeur gravée (variables passées au processus) ni sur le
  flag release ; définir `NODE_ENV=production` pour un prochain build propre.
- Incrémenter `versionCode`/`versionName` avant toute nouvelle diffusion.

**Git** : `mobile/eas.json` (config projet) · ce `docs(handoff)`.

## 69) Session 2026-10-30 — Installateurs Windows POS + License Manager

**Demande** : « ابن ملفات التثبيت pos و license manager » — reconstruire les
installateurs Windows à partir de l'état courant (UI ADR-157 + correctif sync
ADR-158).

**Blocage rencontré et contournement**

- `npm run package:pos` échoue à la préparation Electron :
  `EBUSY default_app.asar` dans `release/win-unpacked.tmp` (verrou persistant
  d'un ancien processus/scanner ; renommage testé → EBUSY même sans build en
  cours). **Aucun fichier supprimé de force.**
- Contournement : electron-builder relancé vers une sortie neuve
  `E:\veloria-build` (`--config.directories.output=...`) → extraction et
  packaging OK. Les artefacts finaux ont été copiés dans `release/`.
- Restes à nettoyer après redémarrage : `release/win-unpacked` (357 Mo,
  partiel) et `release/win-unpacked.tmp` (116 Ko, verrouillé). `E:\veloria-build`
  (1,0 Go, sortie temporaire de cette session) peut être supprimé.

**Construits**

- POS : `npm run package:pos` (renderer + electron rebuild + manifeste
  d'intégrité signé), puis NSIS + portable x64.
- Manager : `build:manager-client` + `build:manager` (manifeste manager signé,
  21 fichiers) puis NSIS + portable x64.

| Fichier                                      | Taille | SHA-256                                                            |
| -------------------------------------------- | -----: | ------------------------------------------------------------------ |
| `Veloria-PoS-Setup-1.0.0.exe`                | 156 Mo | `d3cb52b5645373571a906f5d5f9e2c6a797e89a5c9a364d1fcdbe0f185a5eff0` |
| `Veloria-PoS-Portable-1.0.0.exe`             | 136 Mo | `585ea8b0c7819155bc5c8bb67615a482478e46461b6393399adc84bb796840bb` |
| `Veloria-License-Manager-Setup-1.0.0.exe`    | 139 Mo | `5765636fa7229676786e05899acabc875d2120088f4027c9205fd5a5dfc380b4` |
| `Veloria-License-Manager-Portable-1.0.0.exe` | 126 Mo | `79a2c6d5cee8c9f9dcc5caca69fdae505aef2bde2163c04a7538376b84336173` |

`release/SHA256SUMS.txt` regénéré (inclut l'APK client,
`6bdf6017…`). Les anciens installateurs du 27/10 ont été remplacés.

**Caractéristiques**

- NSIS `fr_FR`, `perMachine` (UAC admin), dossier modifiable, raccourcis
  bureau/menu Démarrer, désinstallation sans suppression des données.
- `signAndEditExecutable: true` (règle ADR-070 conservée) ; **aucun certificat
  Authenticode configuré** → `Get-AuthenticodeSignature` = `NotSigned` pour
  les quatre exécutables. SmartScreen affichera un avertissement à
  l'installation ; aucun certificat auto-signé n'a été ajouté.
- Versions produit : Veloria PoS 1.0.0, Veloria License Manager 1.0.0.

**Portes / vérifications**

- `license:scan` OK ; manifeste POS 243 fichiers ; manifeste manager 21
  fichiers ; `aapt`/`apksigner` déjà vérifiés pour l'APK (session 68).
- Versions produit et statut de signature vérifiés via PowerShell.
- **Non testé au runtime** : installateurs non exécutés sur ce poste.

**Git** : ce `docs(handoff)` uniquement (aucun changement source ; `release/`
est git-ignoré).

## 70) Session 2026-10-30 — Connexion APK : fonction `client-sync` obsolète

**Symptôme** : « الهاتف أو الرمز غير صحيح » sur l'APK avec un client
fraîchement activé (téléphone `0668640999`).

**Diagnostic** (lecture seule du miroir `veloria-pos` + sonde temporaire)

- La ligne `client_access` du client 94 est bien dans le miroir : condensat
  téléphone exact, `pin_hash` PBKDF2-SHA256 100k + `pin_salt`, accès actif.
- La fonction **déployée** répondait 401 sur une ligne PBKDF2 salée et 200 sur
  une ligne SHA-256 nue, tout en écrivant `failed_attempts` : c'était la
  version antérieure au durcissement #39 (comportement de la version du
  02/10, commit `6ee2862`). Tout PIN correct était donc refusé ; 3 échecs
  déjà enregistrés (verrou à 5).
- Cause secondaire du parcours : l'activation ne poussait pas le miroir ; le
  client devait attendre le cycle suivant (5–15 min) → même message trompeur.

**Correctifs**

- Redéploiement de `cloud/supabase/functions/client-sync/index.ts` (version
  courante : PBKDF2 + sel, lecture seule) via la console Supabase ; « Verify
  JWT » reste désactivé.
- Vérification après déploiement : sonde temporaire sur le miroir (une ligne
  PBKDF2 salée, une ligne SHA-256 legacy) → **200 / 200**, compteurs
  inchangés ; les deux lignes de test ont été supprimées (`204`, relecture
  vide). Aucune donnée réelle touchée.
- `electron/ipc/registry.customers.ts` : après `activateClientAccessAtomic`,
  poussée `pushNowAtomic` best-effort (échec ignoré, jamais bloquant) pour que
  le miroir connaisse le client immédiatement. Le prochain build POS embarque
  ce comportement ; l'installation actuelle reste sur la poussée périodique.

**Risque ouvert (à traiter)**

- La fonction courante est en LECTURE SEULE : plus personne n'incrémente
  `customer_access.failed_attempts` côté miroir (le POS ne voit pas les
  tentatives APK ; seuls les compteurs staff existent). Le verrou « 5 échecs
  → 5 min » du domaine n'est donc plus appliqué pour l'APK. À arbitrer :
  écriture ciblée des compteurs par la fonction (déroge au « aucune écriture
  Deno ») ou rate-limit plateforme en V2.

**Portes** : `prettier --check` OK ; `eslint` 0 avertissement ;
`typecheck:electron` OK ; suite complète **1 147/1 147**.

**Git** : `fix(sync): pousser le miroir dès l'activation d'un accès client`

- ce `docs(handoff)`.

## 71) Session 2026-10-30 — Icônes de l'APK client (police native)

**Demande** : « قم بتصحيح واجهات تطبيق العملاء هناك بعض المكونات غير ظاهرة مثل الأيقونات ».

**Constat sur le téléphone réel** (APK 1.0.0 = `release/Veloria-Client-1.0.0.apk`,
SHA identique, `adb install` du 30/10 13:20) : **toutes** les Ionicons sont
invisibles — cloche, icônes des cartes « Mes factures / Mes paiements », étoile
fidélité, chevrons, icônes de la barre d'onglets — alors que les textes, le
logo et les surfaces se dessinent normalement. La hiérarchie UI ne contient
aucun nœud d'icône.

**Diagnostic**

- Le web (react-native-web) rend les icônes : le glyphe et le jeu d'icônes sont
  corrects ; le problème est propre à l'Android natif.
- Les 19 polices `@expo/vector-icons` sont bien dans l'APK (`res/raw`, dont
  `node_modules_expo_vectoricons_…_ionics`). `@expo/vector-icons` 14 charge la
  police **à l'exécution** (`Font.loadAsync` → `expo-asset` →
  `downloadAsync` de la ressource brute) ; ce chemin échoue silencieusement sur
  cet appareil (aucune erreur JS dans logcat, `componentDidMount` reste sans
  `fontIsLoaded`, donc `<Text />` vide). Un premier correctif (police copiée
  dans `android/app/src/main/assets/fonts/`) n'a pas suffi : l'échec vient du
  chargement runtime, pas de l'absence du fichier.

**Correctif**

- Police source versionnée : `mobile/assets/fonts/Ionicons.ttf` (copie de
  `node_modules/@expo/vector-icons/.../Fonts/Ionicons.ttf`), déclarée dans
  `mobile/app.json` via le plugin `expo-font` (un `expo prebuild` la recopie
  dans les assets natifs).
- Nouveau `mobile/src/ui/Icon.tsx` : sur Android, dessine directement le glyphe
  (`Ionicons.getRawGlyphMap()`) avec `fontFamily: "Ionicons"` — résolu par
  `ReactFontManager` depuis `assets/fonts/Ionicons.ttf`, sans
  `Font.loadAsync` ; sur web, rend le composant d'origine. Les 34 usages dans
  11 fichiers passent par `Icon` ; `kit.tsx` réexporte `IconName`.
- Version : `1.0.1` / `versionCode 2` (`app.json`, `android/app/build.gradle`).
- `mobile/README.md` documente la contrainte (ne pas supprimer la police).

**Build / artefacts**

- `assembleRelease` (Gradle, même keystore CN=Veloria, cert SHA-256
  `c190b12a…`), APK `release/Veloria-Client-1.0.1.apk`
  (88 719 556 octets, SHA-256
  `6241aa7ba831a4a822be9c65ac06f67af2666076506460ed4699920e6f7708b5`),
  `release/SHA256SUMS.txt` mis à jour. `assets/fonts/Ionicons.ttf` (442 604
  octets) présent dans l'APK, bundle Hermes contient le nouveau composant.
- `typecheck:mobile` OK ; `eslint src` 0 avertissement ; tests mobile 28/28 ;
  4 écrans web + login capturés sans erreur console (`test-results/mobile-audit/`).

**Vérification runtime (2026-10-30 15:21)**

- `adb install -r release/Veloria-Client-1.0.1.apk` sur **CPH2235** (Android
  réel) : succès. Écran de connexion capturé
  (`test-results/phone-app-05.png`) : **toutes les icônes sont rendues** —
  téléphone, œil, flèche « دخول », QR, WhatsApp, étincelles, bouclier,
  chevron. Les écrans connectés (accueil, onglets, listes) utilisent le même
  composant `Icon` et ont été validés sur le web ; l'ancien appareil CPH2687
  (session client ouverte) n'a pas été reconnecté.

**Git** : `fix(mobile): icônes visibles — police native embarquée` + ce
`docs(handoff)`.

## 72) Session 2026-10-30 — Accueil client V5 (tableau de bord)

**Demande** : « قم بتطوير واجهة الرئيسية في تطبيق العملاء ».

**Nouvelle composition**

- Bandeau d'encre : salutation + boutique, pastille œil, dette (héros) +
  statut, **utilisation du crédit déplacée DANS le bandeau** (barre
  segmentée 10 crans, rouge à ≥ 90 %), fraîcheur horodatée
  (« Dernière synchro · JJ/MM HH:MM », « Réessayer » si périmé).
- **Carte « Dernière facture »** qui chevauche le bandeau (icône de statut,
  numéro, date, reste, chevron → détail) : seule élévation de l'écran.
- Annonce boutique, puis **« Ce mois-ci »** en deux colonnes tactiles
  (Achats du mois / Payés ce mois → onglets Factures / Paiements).
- Fidélité inchangée (ligne informative) ; sections Factures (caption
  « Factures au total · n »), Paiements et Articles phares.
- Client sans activité : carte de bienvenue dédiée (plus de pile de vides).
- Le compteur « factures à régler » (calculé sur les 3 dernières factures
  seulement) est supprimé : la dette et la dernière facture portent
  l'information, sans chiffre trompeur.

**Données / contrats**

- `toHome` expose `invoiceCount` (repli borné sur la prévisualisation) et
  `monthKey` ; `formatDateTimeFr` ajouté ; clés i18n `lastInvoice`, `thisMonth`,
  `invoicesTotal`, `creditUsage`, `purchasesThisMonth`, `paidThisMonth`,
  `welcomeTitle`/`welcomeHint` ; `dueInvoices`, `ofLimit` et `totalPurchases`
  retirés (plus utilisés).
- Fixture démo : `monthKey`, `invoiceCount`, `totalPurchasesMinor` ajoutés
  (même contrat que le cliché POS).

**Vérifications**

- `typecheck:mobile` OK ; `eslint src` 0 avertissement ; 29/29 tests mobile.
- Captures 390×844 ar/fr, montants visibles et masqués
  (`test-results/home-v5/`), aucune erreur console.
- APK **1.0.2** (versionCode 3) construit et signé (même keystore,
  cert `c190b12a…`) : `release/Veloria-Client-1.0.2.apk` (88 721 140 octets,
  SHA-256 `8c2e365dce0ab6ce2c437efdc481b94dc31f6a0f4af0c3cebc3afc7eb4680bb7`),
  `release/SHA256SUMS.txt` mis à jour.
- **Non installé sur téléphone** : l'appareil s'est déconnecté d'ADB avant
  l'installation ; à faire au retour (`adb install -r`, même signature).

**Git** : `feat(mobile): accueil V5 — dernière facture, crédit intégré,
mois en deux colonnes` + ce `docs(handoff)`.

## 73) Session 2026-10-30 — Écrans secondaires V5 (factures, détail, paiements, compte)

**Demande** : « قم بتطوير واجهة التالية في تطبيق العملاء : فواتير، تفاصيل
الفاتورة، مدفوعات، حسابي ».

**Factures**

- En-tête encre : titre + compteur filtré + « Dette restante » (somme des
  restes des factures vivantes) + recherche.
- Puces de filtre inchangées ; **un seul panneau blanc à filets** (plus une
  carte par ligne). Chaque ligne est tactile de bout en bout sur deux rangées :
  numéro + reste / date + statut + « Voir détails ». L'accordéon est supprimé :
  le détail complet vit dans l'écran dédié (totaux, reçu, signalement).
- État vide distingué : « Aucune facture » vs « Aucun résultat » (recherche ou
  filtre sans correspondance).

**Détail facture**

- PageBar encre (retour + partage or) inchangée ; **fiche financière** :
  boutique/client/statut, **reste en héros (30 pt)**, deux mini-cartes
  Total/Payé (côte à côte, « DZD » tronquait le héros en français), date.
- **Carte Articles** séparée (nom aligné au bord de lecture de l'UI pour ne
  plus toucher le montant), carte QR/note, actions (réessayer si erreur,
  signaler). Vocabulaire ticket conservé (Dashed + Mono).

**Paiements**

- En-tête encre + compteur ; puces de mois ; **un panneau** : en-tête tonal
  (total du mois + répartition espèces/chèque/virement via `paymentsByMethod`)
  - une ligne tactile par paiement (date + méthode, type, référence, montant,
    reçu en bottom-sheet). La seconde ligne « voir le reçu » disparaît.
- Bottom-sheet : voile sans role « button » (corrige un bouton imbriqué sur le
  web — validateDOMNesting — et l'arbre d'accessibilité).

**Compte**

- Bandeau profil **pleine largeur** (avatar, nom, téléphone, dernière synchro
  horodatée), carte Situation teintée qui chevauche, actions, magasin,
  annonce, réglages, partage du relevé.
- « Dernière connexion » remplacé par « Dernière synchro » (le champ affiché
  est `syncedAt`, pas une date de connexion) ; version affichée 1.0.3.

**Données / contrats**

- `paymentsByMethod(rows)` pur : total + nombre par méthode, tri décroissant,
  méthode vide → `other` (+ tests).
- i18n : `noResults` / `noResultsHint` ajoutés ; `lastLogin` retiré ;
  `appVersion` passé à 1.0.3 dans l'App.
- `scripts/e2e-mobile-shots.mjs` : la ligne facture remplace l'accordéon
  (locator /FAC-/), l'étape « الوصل » disparaît.

**Vérifications**

- `typecheck:mobile` OK ; `eslint src` 0 avertissement ; **30/30** tests mobile.
- Captures 390×844 ar/fr des quatre écrans + détail + reçu
  (`test-results/screens-v5/`), **0 erreur console**.
- E2E script non exécuté ici (navigateur Playwright bundlé absent sur ce
  poste) : le parcours a été validé par le même flux avec Chrome (captures).
- APK **1.0.3** (versionCode 4) signé (cert `c190b12a…`) :
  `release/Veloria-Client-1.0.3.apk` (88 722 072 octets, SHA-256
  `923cee037f490bb2f183c73fbdc98513e29b2a471b4b8197f27e51fd786a86ad`),
  `release/SHA256SUMS.txt` mis à jour.
- **Non installé sur téléphone** : ADB déconnecté après le build
  (`adb install -r` à faire au retour, même signature).

**Git** : `feat(mobile): écrans secondaires V5` + ce `docs(handoff)`.

## 74) Session 2026-10-30 — Recherche UX 2026 + passe sur les six écrans

**Demande** : « ابحث في الانترنت و قم بتطوير واجهة التالية : فواتير، تسجيل
الدخول، الرئيسية، تفاصيل الفاتورة، مدفوعات، حسابي ».

**Sources retenues (principes appliqués)**

- UXDA (20 bonnes pratiques fintech) : scénario principal focalisé, solde
  d'abord, entrées/sorties distinguées, recherche, statuts et **prochaines
  étapes**, récupération d'erreur guidée.
- Authgear (login/signup UX) : minimum d'informations, erreurs **avec
  solution**, repères de confiance (cadenas/SSL), chemins alternatifs,
  autofill, libellés accessibles.
- Cloudtopia (RTL Arabic 2026) : miroir des chevrons, formats locaux,
  **contraste élevé**.
- Pixelbrainy (2026) : hiérarchie, accessibilité, confiance.

**Connexion (V7)**

- Préfixe décoratif « +213 » retiré (il laissait croire qu'il fallait omettre
  le 0) ; `autoComplete="tel"` sur le champ téléphone.
- Erreur d'identifiants : message + **conseil de récupération**
  (« vérifiez le numéro et le code, ou demandez un nouveau code au magasin »),
  affiché seulement pour l'erreur générique.
- Séparateur **« ou »** avant l'option QR (deux chemins distincts) ; pied de
  page **« Connexion chiffrée »** avec cadenas (au lieu de « Rapide et
  protégé »).
- Conservés : auto-submit au 6ᵉ chiffre, haptique, téléphone mémorisé, aide
  3 étapes, QR, WhatsApp.

**Accueil**

- **Échéance** (`settlement_day` du cliché) à côté du statut lorsqu'une dette
  existe — prochaine étape concrète. `toHome` expose `settlementDay` + test.

**Détail facture**

- **Historique des paiements de CETTE facture** (filtre `sale_id` côté App) :
  date, moyen, référence, montant, dans une carte dédiée.
- `paymentMethodLabel` partagé dans `views.ts` (utilisé par Paiements et
  Détail) + test.

**Compte**

- **Tirer pour rafraîchir** (RefreshControl) : magasin, annonce et dette se
  mettent à jour.
- **Confirmation avant déconnexion** (modale : annuler / se déconnecter) —
  une action destructrice n'est plus immédiate.

**Accessibilité (WCAG)**

- Onglets inactifs, légendes de `SectionHead` et chevrons passent de
  `inkFaint` (2,8:1) à `cardMuted` (~5,5:1) ; token `inkFaint` retiré.
- Cibles tactiles et libellés explicites conservés.

**Vérifications**

- `typecheck:mobile` OK ; `eslint src` 0 avertissement ; **31/31** tests.
- Captures 390×844 ar/fr : login, erreur de connexion, accueil (échéance),
  détail (paiements), confirmation de déconnexion
  (`test-results/ux-v6/`), 0 erreur console hors 401 volontaire.
- APK **1.0.4** (versionCode 5) signé (cert `c190b12a…`) :
  `release/Veloria-Client-1.0.4.apk` (88 724 364 octets, SHA-256
  `b420ee84fb3a9dd9a12e4d834d97b5832a0d71065690a9672b9bdda6c4d3afac`),
  `release/SHA256SUMS.txt` mis à jour.
- **Non installé sur téléphone** : ADB déconnecté après le build
  (`adb install -r` au retour, même signature).

**Git** : `feat(mobile): passe UX 2026 sur les six écrans` + ce `docs(handoff)`.

## 75) Session 2026-10-30 — Encaissement standalone ventilé FIFO (ADR-159)

**Demande** : « اريد مناقشة شيء معك حول تاريخ الاستحقاق » → vérification
seule demandée (« تحقق فقط لا تغير شيئا ») → « اقترح علي » → « نفذ توزيع
تلقائي «الأقدم أولًا » ».

**Diagnostic vérifié (lecture seule, avant tout changement)**

- La dette est tenue PAR FACTURE : `debts.list` est bâti sur
  `sales.remaining_balance_minor > 0` (une ligne par facture ouverte), tandis
  que le client porte UN solde agrégé (`customers.outstanding_balance_minor`).
- Paiement lié (`saleId` fourni, écran Dettes) : met à jour la vente ET le
  solde client — cohérent.
- Paiement standalone (`saleId: null` — fiche client « Règlement client » et
  caisse « Régler la dette ») : SEUL le solde client bougeait ; aucune
  écriture sur les ventes, aucune ventilation (pas de FIFO).
- Conséquence : après un encaissement standalone, la liste des dettes montrait
  toujours les mêmes factures (mêmes restes, mêmes échéances dépassées),
  « En retard » restait collé et Σ restes par facture ≠ solde client.

**Décision (ADR-159)**

- Ventilation FIFO **dans la transaction du paiement** : factures ouvertes du
  client, annulées exclues, `ORDER BY created_at ASC, id ASC` (la plus
  ancienne d'abord, `id` en départage).
- Une ligne `sale_payments` par facture (`sale_id` renseigné,
  `operation_id = ${operationId}:${saleId}`), même instruction de mise à jour
  de la vente que le chemin lié (`remaining`, `payment_status`).
- Reliquat éventuel (solde sans facture ouverte, ex. solde initial) : ligne
  standalone à l'`operationId` exact — comportement historique préservé.
- Solde client décrémenté UNE fois ; `debt_status` recalculé après les mises
  à jour de ventes (règle E-30).
- Idempotence : `findExisting` cherche l'`operationId` exact puis le préfixe
  échappé `${operationId}:` (première ligne allouée = ancre stable) ; le
  catch UNIQUE existant couvre les courses.
- Audit `customer.payment` : `allocations` ajoutées pour les standalone.
- Aide UI FR : « Le montant est réparti automatiquement sur les factures les
  plus anciennes. » (fiche client) et « Montant borné par la dette et réparti
  sur les factures les plus anciennes. » (caisse).
- **Pas de backfill** de l'historique : les encaissements standalone anciens
  laissent leurs factures ouvertes, le passé n'est pas réécrit.

**Fichiers**

- `electron/ipc/handlers/customers.repo.ts` — fonction seule, aucun autre
  chemin de paiement touché.
- `src/features/customers/dialogs/PaymentDialog.tsx`,
  `src/features/sales/sell/SettleDialog.tsx` — aide FR uniquement.
- `tests/integration/customer-payment-fifo.test.ts` — neuf, 5 tests (base
  migrée réelle : ventilation FIFO + alignement liste des dettes, reliquat,
  rejeu `operationId`, refus > solde avec rollback, ventes annulées exclues).
- `docs/ADR-159-ventilation-paiements-fifo.md`, `docs/INDEX.md`, ce handoff.

**Vérifications**

- Test neuf 5/5 ; suites adjacentes (reçu, idempotence LWW, atomic slices,
  dashboard paiements annulés, boucle client, unités op-id/bornes/plafond)
  44/44.
- `tsc -b` 0 · `tsc -p tsconfig.electron.json --noEmit` 0 · ESLint 0 ·
  Prettier OK · `verify:fr` 0 (333) · `verify:encoding` 0 (953) ·
  `verify:migrations` VERIFIED (56).
- **Suite complète : 170 fichiers / 1 155 tests, 0 échec** (490 s) · `build` ✓
  · `build:electron` ✓ (manifeste signé **243**).

**Git** : `fix(payments): ventiler les encaissements standalone FIFO (ADR-159)`

- ce `docs(handoff)`.

## 76) Session 2026-10-30 — Détails de facture APK rétablis (ADR-160)

**Demande** : « تفاصيل الفواتير لا تظهر في تطبيق العملاء ما السبب » puis
« نفذ الاصلاحات الجذرية ».

**Diagnostic vérifié (lecture seule d'abord)**

- `sales.create` (`electron/ipc/registry.sales.ts`) appelait seulement
  `enqueueCustomerRefresh` : les trois clichés de listes partaient, jamais
  `invoice_detail`.
- `enqueueSaleRefresh` (listes + détail) n'était branché que sur
  annulation/réouverture, paiement **lié à `saleId`** et impression.
- `recordPayment` préférait `customerId` : un encaissement standalone (même
  ventilé FIFO depuis ADR-159) ne poussait aucun détail de facture.
- L'Edge `client-sync` ne cherchait le détail que dans les 50 derniers clichés
  `invoice_detail` du client (`DETAIL_SCAN_LIMIT`) → 404 au-delà.
- Preuve sur la base réelle (`E:\data\Veloria POS DB.sqlite`) : client 94,
  factures 1067 et 1164, **un seul** cliché `invoice_detail` (1067, poussé à
  12:21) ; la 1164 créée et payée à 19:51 n'avait reçu que
  `customer_snapshot`/`invoice_list`/`payment_list`.

**Correctifs**

- `electron/sync/sync.service.ts` : `enqueueInvoiceDetailRefresh(saleId)`
  (détail seul) + `enqueueSaleRefresh` refactoré (listes + détail, résolution
  client unique).
- `electron/ipc/registry.sales.ts` : après `sales.create`,
  `enqueueSaleRefresh(result.saleId)` (remplace `enqueueCustomerRefresh`).
- `electron/ipc/handlers/customers.repo.ts` : `recordCustomerPaymentAtomic`
  retourne `allocatedSaleIds` (ventilation FIFO) ; `registry.customers.ts`
  pousse `enqueueSaleRefresh` pour un paiement lié, sinon les listes une fois +
  `enqueueInvoiceDetailRefresh` pour **chaque** facture allouée.
- `cloud/supabase/functions/client-sync/index.ts` : lecture directe
  `payload->sale->>id = saleId` (PostgREST JSON path, `ORDER BY id DESC
LIMIT 1`), suppression de `DETAIL_SCAN_LIMIT`.
- `cloud/supabase/schema.sql` : index d'expression partiel
  `idx_client_payloads_customer_sale` sur `(customer_id, (payload->'sale'->>'id'))`
  `WHERE kind = 'invoice_detail'`.
- `scripts/e2e-mirror-relay.mjs` : parité stricte, plus de fenêtre 50.
- `src/features/customers/dialogs/ClientMobileAccess.tsx` : « Synchroniser »
  pousse les détails de **tout** le relevé (≤100 ventes), plus seulement 10.

**Tests / portes**

- `tests/integration/client-sync-queue.test.ts` (neuf, base migrée réelle +
  shim `transaction` node:sqlite) : vente → 3 listes + détail ; détail seul
  sans duplication des listes ; accès révoqué → aucun cliché.
- `tests/integration/customer-payment-fifo.test.ts` : `allocatedSaleIds`
  exposé (2 factures) et vide au rejeu idempotent.
- Portes : Prettier OK · ESLint 0 (fichiers touchés) · `tsc -b` 0 ·
  `typecheck:electron` 0 · `typecheck:mobile` 0 · **suite complète 171
  fichiers / 1 158 tests, 0 échec** (417 s) · `build` ✓ · `build:electron` ✓
  (manifeste signé **243**).
- **Non exécuté (session 76)** : E2E Playwright (nécessite la build packagée).
  **Déploiement Supabase : FAIT en session 78** — fonction redéployée, index
  appliqué, sonde 200/404/401, « Verify JWT » OFF.

**Reste à faire (utilisateur)**

1. ~~Redéployer `client-sync`~~ — fait le 2026-10-31 (session 78).
2. ~~Appliquer l'index `idx_client_payloads_customer_sale`~~ — fait le
   2026-10-31 (vérifié dans `pg_indexes`).
3. Depuis le POS : fiche client → « Synchroniser » pour backfiller les
   factures existantes, puis laisser la poussée automatique (5 min) envoyer.

**Git** : `fix(sync): pousser le détail de facture et supprimer la fenêtre 50 (ADR-160)`

- ce `docs(handoff)`.

## 77) Session 2026-10-31 — Version unique 1.0.4 et contrat de mise à jour (ADR-161)

**Demande** : « غير اصدار pos و license الى 1.0.4 و يجب ان تدعم البرامج pos
و license و التطبيقات الهواتف veloria client الترقية من اصدار الى اصدار
جديد ».

**Diagnostic**

- POS + License Manager : **1.0.0** (`package.json` racine ; electron-builder
  l'embarque dans les deux installateurs, `app.getVersion()` l'affiche).
- Client : **1.0.4** (`mobile/app.json`, `build.gradle`), mais `App.tsx`
  affichait `appVersion="1.0.4"` en dur et le Manager n'affichait aucune
  version.
- Les installateurs NSIS pouvaient déjà se remplacer (appId stable,
  `perMachine`, données hors installation) mais rien ne garantissait
  l'alignement des numéros ni la croissance du `versionCode` Android.
- Registre Manager : migrations de colonnes rejouées sans copie de sécurité.

**Décisions (ADR-161)**

- `package.json` racine = **source unique** ; version portée à **1.0.4** pour
  POS + License Manager (installateurs + About POS + en-tête Manager).
- `scripts/release/version.mjs` : `check` (gate `verify`) et `set x.y.z`
  (package + locks + `mobile/package.json` + `app.json` + `build.gradle`
  `versionName`/`versionCode` + `App.tsx`). `versionCode` strictement
  croissant, `--code N` explicite possible ; refus d'une régression.
- License Manager : canal `manager.appInfo` (version dans l'en-tête) ;
  **snapshot `VACUUM INTO` avant migration** (`backups/manager-avant-migration-*`,
  5 conservés, échec = mise à jour annulée) ; seules les colonnes absentes
  sont ajoutées.
- POS : contrat existant conservé (appId stable, `perMachine`,
  `deleteAppDataOnUninstall:false`, base `%PROGRAMDATA%`, snapshots
  pré-migration + checksums).
- Client : même `applicationId` `dz.veloria.client`, même keystore release,
  `versionCode` croissant ; SecureStore/SQLite conservés par Android.
- **Pas d'auto-update en ligne** : aucun serveur d'artefacts et installateurs
  non signés (`verifyUpdateCodeSignature:false`) — un téléchargement/exécution
  automatique serait dangereux (voir ADR-161, alternatives).

**Fichiers**

- `package.json`, `package-lock.json`, `mobile/package.json`,
  `mobile/package-lock.json` (version 1.0.4).
- `scripts/release/version.mjs` (neuf), `eslint.config.mjs` (allowlist),
  `package.json` scripts `version:check`/`version:set`, `verify` enrichi.
- `license-manager/db/manager-db.ts` (backup + helper pur),
  `license-manager/ipc/{channels,registry}.ts`, `preload/preload.ts`,
  `renderer/{ipc-client.ts,manager-env.d.ts,App.tsx}`.
- `tests/unit/version-alignment.test.ts` (neuf, 7 tests),
  `tests/unit/license-manager.test.ts` (+1 test migration).
- `scripts/release/smoke.js` : chemin `config/electron-builder/pos.yml`
  (l'ancien `electron-builder.yml` déplacé en session 65 faisait échouer la
  porte release).
- `README.md`, `docs/INDEX.md`, `docs/ADR-161-version-unique-et-mises-a-jour.md`,
  ce handoff.

**Artefacts 1.0.4 (`release/`)**

| Fichier                                      |      Taille | SHA-256                                                            |
| -------------------------------------------- | ----------: | ------------------------------------------------------------------ |
| `Veloria-PoS-Setup-1.0.4.exe`                | 163 550 651 | `e6f96ec647ec8b27f4ef5382c1d27fb9d7e1e2872010b3258922a9c1733d473b` |
| `Veloria-PoS-Portable-1.0.4.exe`             | 141 652 080 | `50a733cc54318a09ed6de3b386378b2e422e49151e7740616efa8abd85f6e1b9` |
| `Veloria-License-Manager-Setup-1.0.4.exe`    | 145 523 587 | `842866bf847f0af4a2eb33dac0d0b05e298b5c462cb9a7294fd0d62154bcaf63` |
| `Veloria-License-Manager-Portable-1.0.4.exe` | 131 754 141 | `0d67cbdc1de8e7dd87f28874a50b20d659d0e92130c8cf5ba3c95a121f697021` |
| `Veloria-Client-1.0.4.apk` (inchangé)        |  88 724 364 | `b420ee84fb3a9dd9a12e4d834d97b5832a0d71065690a9672b9bdda6c4d3afac` |

Installateurs **non signés Authenticode** (aucun certificat configuré) ;
POS reconstruit en session 87 (correctif annonce) dans
`E:\veloria-build-1.0.4-ann`, Manager dans `E:\veloria-build-1.0.4` (évite le
verrou scanner de `release/`) puis copiés. L'APK n'est pas reconstruit : le client
reste 1.0.4 code 5, aucune source mobile modifiée.

**Portes**

- `npm run version:check` OK (1.0.4, code Android 5) ; `format:check` OK ;
  ESLint 0 ; `tsc -b` 0 ; `typecheck:electron` 0 ; `typecheck:manager` 0 ;
  `typecheck:mobile` 0 ; **vitest 172 fichiers / 1 166 tests, 0 échec**
  (423 s) ; `knip` 0 ; `verify` ✓ (migrations/domain/fr/encoding/perf/
  version:check/secret-scan) ; `build` ✓ ; `build:electron` ✓ (manifeste
  signé **243**, v1.0.4) ; `build:manager-client` + `build:manager` ✓ ;
  `release:checksums` ✓ ; `release:smoke` ✓ (après correctif du chemin).
- **Non exécuté** : installation réelle 1.0.0 → 1.0.4 (UAC/perMachine,
  E2E installateur toujours ignoré sur cette machine), reconstruction APK
  (client déjà 1.0.4 code 5), mise à jour en ligne (hors périmètre).

**Reste à faire (utilisateur)**

1. Installer `Veloria-PoS-Setup-1.0.4.exe` puis
   `Veloria-License-Manager-Setup-1.0.4.exe` sur les postes existants
   (l'installateur remplace l'ancienne version ; base, sauvegardes, réglages
   et licence conservés). Vérifier « À propos » POS = 1.0.4 et l'en-tête du
   Manager = v1.0.4.
2. Pour une version suivante : `npm run version:set x.y.z` (incrémente le
   `versionCode`), puis rebuild installateurs + APK. Ne jamais réutiliser un
   `versionCode` déjà publié.
3. L'APK client reste `Veloria-Client-1.0.4.apk` ; la prochaine version
   (ex. 1.0.5 code 6) s'installera par-dessus sans perte de session si elle
   est signée avec le même keystore.

**Git** : `feat(release): version unique 1.0.4 et contrat de mise à jour (ADR-161)`

- ce `docs(handoff)`.

## 78) Session 2026-10-31 — Déploiement Supabase ADR-160 (console navigateur)

**Demande** : « نفّذ التغييرات على Supabase الآن ».

**Contexte** : la session 76 avait corrigé `client-sync` dans le dépôt (filtre
direct `payload->sale->>id`, suppression de `DETAIL_SCAN_LIMIT`) et ajouté
l'index miroir, mais le déploiement était resté manuel. La session navigateur
Qoder était déjà authentifiée sur l'organisation Veloria ; aucun jeton
personnel, aucune clé affichée ou créée.

**Exécution**

- `client-sync` : code du dépôt injecté dans l'éditeur Monaco
  (`monaco.editor.getModels()[0].setValue`) puis **Deploy updates** confirmé.
  Vérifié : éditeur déployé = 10 237 caractères, `DETAIL_SCAN_LIMIT` absent,
  `payload->sale->>id` présent ; Overview « Last deployed » à jour ; onglet
  Settings : **Verify JWT with legacy secret = OFF** (inchangé).
- Index : `CREATE INDEX IF NOT EXISTS idx_client_payloads_customer_sale ON
client_payloads (customer_id, ((payload->'sale'->>'id'))) WHERE kind =
'invoice_detail'` exécuté dans le SQL Editor → `Success. No rows returned` ;
  vérifié dans `pg_indexes` (définition exacte).
- Preuve de bout en bout : ligne sonde temporaire
  `client_access(customer_id=999999, sha256('0550000000'), sha256('123456'), pin_salt NULL)`
  - cliché `invoice_detail` (vente 424242, article PROBE), puis appels réels
    de la fonction avec la clé anon publique :
  * `saleId=424242` → **200** avec `sale.id=424242` et l'article ;
  * `saleId=999999999` → **404 NOT_FOUND** ;
  * mauvais PIN → **401 AUTH_ERROR**.
- Nettoyage : `DELETE` des deux lignes de sonde, vérifié
  `access_left=0 / payload_left=0`. Aucune autre donnée modifiée.

**Effet attendu** : après installation de POS 1.0.4 et appui sur
« Synchroniser » (fiche client), les anciennes factures reçoivent leur cliché
`invoice_detail` ; toute nouvelle vente/paiement le pousse automatiquement.
Les factures déjà présentes dans le miroir (ex. 1067 du client 94) sont
maintenant retrouvées sans fenêtre de 50.

**Non exécuté** : test avec les identifiants réels d'un client (PIN inconnu,
jamais demandé) ; installation POS/APK sur poste/téléphone.

**Git** : ce `docs(handoff)`.

---

## 79) Session 2026-10-31 — Application propriétaire (ADR-162)

**Demande** : « تصميمات واجهات تطبيق المالك موجودة في
`docs/archive/stitch_veloria_supervision_mobile` — ادرسها ثم ابدأ في انشاء
التطبيق. » Arbitrages de la discussion préalable : application séparée,
lecture seule (« يشوف فقط »), français uniquement, téléphone du client débiteur,
écran Stock avec mouvements, cadence pilotée par les réglages POS, 5 onglets
validés.

**Livré**

- `owner/` : projet Expo autonome (SDK 52, RN 0.76), `dz.veloria.owner`,
  profil EAS `preview`, assets marque + police Ionicons native.
- `owner/src/tokens.ts` : jetons Stitch/POS (encre `#051424`, or `#fbbf24`,
  surfaces `#F7F8FA`/`#FFFFFF`/`#EDF1F6`, filet `#E1E7EF`, rayons 18/14/10,
  cible 48).
- `owner/src/format.ts` : montants `1 234,56 DZD` (centimes entiers), dates
  longues/courtes françaises, fraîcheur « il y a 12 min », pourcentages.
- `owner/src/store.ts` : contrat `OwnerSnapshot` v1 (jour, argent + debtors,
  stock + mouvements, périodes, alertes) + sélecteurs purs (`filterProducts`,
  `productStatus`, `findProduct`, `findDebtor`).
- `owner/src/demo.ts` : liasse de démonstration reprenant les valeurs des
  captures (CA 482 650,00 DZD, session +600, SARL Oran Parfums, Sérum VL-412…).
- `owner/src/ui/` : kit LTR français (Tap, Card, Group, Row, Button, Chip,
  Badge, Amount, Field, Segmented, BarChart, ReadOnlyNote) + `AppHeader`,
  `TabBar` 5 onglets, `PageBar`.
- 9 écrans : Connexion, Aujourd'hui, Argent (ancres Caisse/Dépenses/Dettes),
  Stock, Périodes, Alertes, Fiche client, Fiche produit, Audit des caisses.
- `owner/src/cache.ts` : session SecureStore + liasse SQLite, repli mémoire.
- `owner/src/api.ts` : `signInWithPassword` + `fetchOwnerSnapshot` purs
  (`fetch` injecté, timeout, erreurs FR mappées, `isSnapshotShape`).
- `owner/src/config.ts` : `EXPO_PUBLIC_OWNER_SYNC_URL/ANON_KEY` gravés au build ;
  sans URL → mode démonstration (puce « DÉMONSTRATION »).
- `tests/unit/owner-foundation.test.ts` : 15 tests (jetons, formateurs,
  sélecteurs, contrat API, cache).
- Racine : `typecheck:owner` (branché dans `check`), eslint `owner/**`
  non type-aware, `owner/index.js` en allowlist, `owner/` ajouté à knip,
  Prettier ignore `owner/{android,ios,.expo}` + les maquettes Stitch.

**Vérifications**

- `owner` typecheck **0** · eslint owner **0** · `vitest` owner-foundation
  **15/15** · `typecheck` racine **0** (manifeste signé 243).
- Bundle web réel (`expo start --web`, port 8092) puis captures navigateur des
  9 écrans (connexion, aujourd'hui, argent, fiche client, stock, fiche produit,
  périodes, alertes, audit) : rendu conforme aux maquettes, aucune écriture
  possible.
- Corrections faites après revue visuelle : signe des écarts (+600), « reçu le »,
  libellé des barres, compteur « Tout » du filtre stock.

**Non exécuté**

- Edge Function `owner-sync` + RLS rôle propriétaire ; use case POS
  `publishOwnerSnapshot` + réglage de cadence + compte propriétaire ;
  biométrie (`expo-local-authentication` différé, bouton « BIENTÔT ») ;
  build APK propriétaire ; police Plus Jakarta Sans (police système en v1).

**Git** : commit de la session (`feat(owner): application de supervision du
propriétaire — ADR-162`) + ce `docs(handoff)`.

---

## 80) Session 2026-10-31 — Écrans courts par onglets internes (suite §79)

**Demande** : « قم بتبسيط الواجهات و اختسار الواجهات الطويلة بتبويبات ».

**Décision** : réutiliser le sélecteur `Segmented` du kit comme onglets internes,
un seul onglet affiché à la fois (plus de défilement d'anatres), et supprimer
les en-têtes redondants dont la fraîcheur est déjà dans le bandeau global.

**Écrans découpés**

| Écran             | Onglets                                                         |
| ----------------- | --------------------------------------------------------------- |
| Aujourd'hui       | Synthèse · Opérations (n)                                       |
| Argent            | Caisse · Dépenses · Dettes (filtre réel)                        |
| Périodes          | Ventes · Marges · Top (plage 7/30 j en puces)                   |
| Alertes           | Stock (n) · Créances (n) · Système                              |
| Fiche produit     | Synthèse · Mouvements (n)                                       |
| Fiche client      | Encours · Factures (n)                                          |
| Audit des caisses | Synthèse · Sessions (n)                                         |
| Stock             | pas d'onglets ; en-tête condensé (une carte valeur + compteurs) |

**Autres simplifications**

- Bandeau de rafraîchissement réduit à « Données du jour / Actualiser ».
- Suppression des puces de fraîcheur et « Consultation seule » locales
  (redondantes avec le bandeau et la note de bas d'écran).
- Alertes : bandeau d'anomalies fusionné dans la carte héro.
- Audit : suppression des filtres décoratifs « 7 derniers jours / Caisses (01, 02) ».
- Libellés de contrôles raccourcis (Attendu/Compté/Écart, Déclaré/Attendu/Écart).
- Correctifs de données/affichage trouvés en revue : valeurs de session de démo
  alignées sur les notes (167 000 / 158 350 / 174 520 / 245 800 DZD), signes
  « + » réservés aux écarts, « reçu le », libellé « Mouvements » typographié.

**Vérifications** : eslint owner **0** · `typecheck:owner` **0** ·
`vitest` owner-foundation **15/15** · parcours Expo web réel (captures) des
onglets Synthèse/Opérations, Caisse/Dépenses/Dettes, Ventes/Marges/Top,
Stock/Créances/Système, Synthèse/Sessions.

**Git** : commit (`refactor(owner): écrans courts par onglets internes`) + ce
`docs(handoff)`.

---

## 81) Session 2026-10-31 — Passe design v2 de l'app propriétaire

**Demande** : « قم بتبسيط و تطوير واجهات تطبيق المالك ».

**Changements**

- **Typographie** : `Amount` n'utilise plus la police monospace ; chiffres
  tabulaires (`fontVariant: ["tabular-nums"]`), graisse 800 conservée, aucun
  crénage ajouté. `FONTS` retiré des jetons (plus aucun usage).
- **En-tête unique** : bouton d'actualisation (or) dans `AppHeader` ; le bandeau
  « Tirer pour actualiser / Actualiser » de Aujourd'hui est supprimé, l'écran
  gagne ~70 px et son état hors-ligne reste porté par la puce d'en-tête.
- **Titres dupliqués supprimés** : Argent, Stock, Périodes et Alertes ne
  répètent plus leur libellé (déjà dans le bandeau) ; la date reste en une ligne
  discrète, Alertes garde son titre d'anomalie dans la carte héro.
- **Stock** : liste en `Group` compact — pastille d'état, nom + référence,
  quantité colorée, valeur, chevron ; plus une carte par produit.
- **Fiche produit** : disponibilité dans la carte tonale (plus de carte
  imbriquée), valeurs fusionnées en une carte « ÉCONOMIE » à filets.
- Aucune action d'écriture ajoutée ; contrat et données inchangés.

**Vérifications** : eslint owner **0** · `typecheck:owner` **0** ·
`vitest` owner-foundation **15/15** · knip owner **0** · parcours Expo web réel
avec captures (Aujourd'hui, Stock compact, fiche produit).

**Git** : commit (`style(owner): passe design v2`) + ce `docs(handoff)`.

---

## 82) Session 2026-10-31 — Aujourd'hui enrichi + détails de transaction

**Demande** : « قم بتطوير صفحة Aujourd'hui — طوّر تبويب Synthèse و Opérations —
أضف تفاصيل المعاملة مثل تفاصيل الفاتورة، تفاصيل المرتجع، تفاصيل التسديد ».

**Contrat** (`owner/src/store.ts`)

- `TransactionDetail` discriminé : `sale` (lignes, sous-total, remise, total,
  encaissement mode/reçu/monnaie/crédit, caissier, session), `return`
  (facture d'origine, motif, lignes, remboursement, imputation dette,
  opérateur), `payment` (type, moyen, référence, opérateur, note), `expense`
  (catégorie, bénéficiaire, règlement, référence, opérateur, note).
- Chaque `JournalRow` porte son `tx` ; `findJournalEntry(snapshot, id)` retrouve
  l'entrée pour la fiche.

**Écrans**

- Synthèse : barre de progression de l'objectif dans le héro, bandeau « retours
  du jour » (nombre + montant).
- Opérations : puces de filtre par type avec compteurs, lignes tactiles avec
  chevron, état vide localisé.
- Nouvelle fiche `TransactionDetailScreen` : en-tête (référence, heure, montant
  signé), pièces, totaux, encaissement ou remboursement, métadonnées — aucune
  action.
- État `view`/`kindFilter` d'Aujourd'hui hissé dans `App` : revenir d'une fiche
  restaure l'onglet Opérations.

**Données de démo** : 8 transactions détaillées (ventes 142/141/140/139/138,
retour avoir RC-89, dépôt caisse, dépense coursier) cohérentes avec les montants
du journal.

**Vérifications** : eslint owner **0** · `typecheck:owner` **0** ·
`vitest` owner-foundation **16/16** (dont cohérence lignes/totaux/encaissement) ·
knip owner **0** · parcours Expo web réel : Synthèse, Opérations filtrées,
fiche vente, fiche retour, fiche versement.

**Git** : commit (`feat(owner): détails de transaction et Aujourd'hui enrichi`)

- ce `docs(handoff)`.

---

## 83) Session 2026-10-31 — Argent, Stock, Périodes et Alertes enrichis

**Demande** : « قم بتطوير الصفحات المتبقية — Argent بجميع تبويباتها، Stock
بجميع تبويباتها، Périodes بجميع تبويباتها، Alertes بجميع تبويباتها ».

**Argent**

- Caisse : bandeau de synthèse (sessions, conformité, écart net) avant la
  session active ; liste des sessions inchangée.
- Dépenses : moyenne par pièce et poste principal calculés depuis les lignes.
- Dettes : part du portefeuille en retard critique (barre + pourcentage).

**Stock**

- Trois onglets : **Aperçu** (valeur, références/sous seuil/ruptures,
  inventaire), **Produits** (recherche + filtres + liste groupée),
  **Mouvements** (flux global via `recentMovements`, tri décroissant, chaque
  ligne ouvre la fiche produit).
- Données : mouvements ajoutés à Nuit, Coffret, Huile, Crème et Brume
  (16 lignes au flux, sérum inclus).

**Périodes**

- Ventes : moyenne par jour et meilleur jour sous les tuiles tickets/panier.
- Marges : marge en valeur par catégorie (CA en sous-ligne), taux inchangé.
- Top : part du CA de chaque article (quantité + pourcentage).

**Alertes**

- Stock : synthèse « ruptures / sous seuil » + perte estimée cumulée par jour.
- Créances : nombre de dossiers au-delà de 60 jours.
- Système : ligne « Dernier inventaire physique ».

**Vérifications** : eslint owner **0** · `typecheck:owner` **0** ·
`vitest` owner-foundation **17/17** (dont tri/limite du flux mouvements) ·
knip owner **0** · inspection Expo web (snapshots) des quatre écrans et de
leurs onglets ; captures PNG indisponibles pendant cette passe (surface du
navigateur masquée côté outil), rendu vérifié par l'arbre d'accessibilité.

**Git** : commit (`feat(owner): Argent, Stock, Périodes et Alertes enrichis`)

- ce `docs(handoff)`.

---

## 84) Session 2026-10-31 — Suppression des données fictives (owner)

**Demande** : « احذف كل البيانات الوهمية من التطبيق ».

**Suppressions**

- `owner/src/demo.ts` supprimé (liasse, produits, dettes, sessions, etc.).
- Mode démonstration supprimé : `DEMO_MODE`, `DEMO_SNAPSHOT`, puce
  « DÉMONSTRATION » de l'en-tête, avis de démonstration sur la connexion,
  branche `Session.demo` (store + cache), repli démo au démarrage et à
  l'actualisation.
- Connexion : placeholder e-mail neutre (`vous@exemple.dz`), aucune session
  sans Supabase Auth.

**Nouveau comportement sans endpoint**

`config.isConfigured` = URL + clé publiques présentes. Sinon l'app affiche un
écran « Supervision non configurée » (aucun accès, aucune donnée locale) et
rappelle les variables `EXPO_PUBLIC_OWNER_*` à graver au build.

**Chiffres codés en dur retirés / dérivés**

- Aujourd'hui : `+2,1 %` (panier) et « 100 % audité » supprimés.
- Périodes : badge `+12,4 %` supprimé.
- Audit des caisses : badge de conformité calculé (`audit.conformityPercent`),
  initiales de la session dérivées de l'opérateur.
- Alertes : badge de version `v4.2 · RO` remplacé par `RO`.

**États vides ajoutés**

Journal, encaissements par mode, sessions clôturées, dépenses, clients
débiteurs, alertes stock/créances, catégories/top/ jours des périodes. Les
mouvements et produits avaient déjà leur état vide.

**Tests**

`tests/unit/owner-foundation.test.ts` réécrit avec une **fixture locale**
(2 produits, 1 débiteur, 2 transactions) : les invariants du journal sont
testés sans embarquer de données dans l'app.

**Vérifications** : eslint owner **0** · `typecheck:owner` **0** ·
`vitest` owner-foundation **17/17** · knip owner **0** · aucun `demo`/`DEMO`
restant dans `owner/src` (hors écran de configuration qui explique l'absence).

**Git** : commit (`chore(owner): suppression totale des données fictives`) +
ce `docs(handoff)`.

---

## 85) Session 2026-10-31 — Connexion de l'app propriétaire à Supabase (ADR-163)

**Demande** : « اربط التطبيق بقاعدة البيانات supabase ».

**Livré (code)**

- `cloud/supabase/owner.sql` : `owner_snapshots` (une liasse JSONB par
  publication, index `(shop_key, generated_at DESC)`), RLS activée, `anon`
  révoqué, `authenticated` lecture, `service_role` écriture, aucune policy
  d'écriture.
- `owner/src/api.ts` : `fetchOwnerSnapshot` = **GET PostgREST**
  (`shop_key=eq.veloria`, tri `generated_at DESC`, limite 1) avec `apikey` +
  jeton Supabase Auth ; réponse vide → « Aucune liasse de supervision publiée. ».
- `owner/eas.json` : profils `preview`/`production` avec
  `EXPO_PUBLIC_OWNER_SYNC_URL` + `EXPO_PUBLIC_OWNER_ANON_KEY` du projet
  `veloria-pos` (clé **anon** publique uniquement).
- `cloud/supabase/README.md` : procédure de lecture et rôle du publieur POS.
- Tests : mock PostgREST (tableau), vérification URL/méthode GET, cas vide.

**Non exécuté (action cloud, en attente d'accord propriétaire)**

1. Appliquer `owner.sql` dans Supabase (dashboard).
2. Créer le compte Auth propriétaire (e-mail + mot de passe choisis par lui) ;
   inscriptions désactivées.
3. Publier une première liasse : nécessite le **publieur POS** (calcul de
   l'`OwnerSnapshot` depuis SQLite + insertion `service_role`) — non codé dans
   cette session. Sans lui, l'app répond « Aucune liasse de supervision
   publiée. ».

**Vérifications** : eslint owner **0** · `typecheck:owner` **0** ·
`vitest` owner-foundation **17/17** · knip owner **0**.

**Git** : commit (`feat(owner): connexion Supabase via PostgREST (ADR-163)`) +
ce `docs(handoff)`.

---

## 86) Session 2026-10-31 — Compte propriétaire géré depuis le POS

**Demande** : « اعداد الحساب يكون من برنامج pos مع امكانية تغييره ».

**Livré**

- Canal `sync.saveOwnerAccount` + `ownerAccountSaveSchema` (operationId, e-mail,
  mot de passe) : licence `customers`, staff `settings`, idempotent.
- `saveOwnerAccountAtomic` (main) : Admin API Supabase avec la clé service
  stockée chiffrée — création (`POST /auth/v1/admin/users`), mise à jour
  (`PUT .../{id}`), récupération si l'e-mail existe déjà, recréation si l'id
  stocké est introuvable (404). Erreurs FR, détail HTTP loggé.
- Persistance locale : `app_settings.owner_account` = `{ email, userId,
updatedAt }` — **aucun mot de passe**.
- Vue renderer `sync.getConfig` enrichie (`ownerEmail`, `ownerUpdatedAt`) ;
  schéma IPC mis à jour.
- UI Paramètres → Miroir Android → « Compte propriétaire (application mobile) » :
  compte actuel, dernière mise à jour, e-mail, mot de passe, bouton
  « Créer le compte » / « Mettre à jour le compte ».
- Contrats : canal ajouté (snapshot 164), schéma 124 → 125, exports 133 → 134,
  classement operationId (REQUIRED). Tests protocole : validation e-mail/mot de
  passe, URL Admin, masque de vue.

**Vérifications** : eslint **0** (périmètre touché) · `typecheck` **0** ·
`typecheck:electron` **0** · tests contrats IPC/sync/validators/bridge/staff
**39/39**.

**Non exécuté** : application de `owner.sql` dans Supabase, création réelle du
compte (exige la clé service du poste + URL appliquée), publieur POS.

**Git** : commit (`feat(pos): compte propriétaire créé et modifiable depuis le
miroir`) + ce `docs(handoff)`.

## 87) Session 2026-10-31 — Annonce magasin poussée aux clients (ADR-160)

**Demande** : « Annonce magasin لا تظهر في تطبيق العميل … و اريد ان تكون
المزامنة مع تطبيق العميل بشكل تلقائي حسب الوقت المختار في البرنامج pos ».

**Diagnostic (base réelle)**

- `announcements.save` écrivait uniquement la table `announcements` (deux
  lignes à 12:15:29 et 12:17:38) ; **aucun** `sync_outbox` n'était créé.
- Le timer auto poussait normalement (`lastPushAt = 12:22:03Z`, `lastError =
null`, cadence 5 min), mais la file était vide : rien ne partait.
- L'annonce voyage dans `customer_snapshot` (`buildSnapshotPayload` lit la
  dernière annonce active). Sans nouveau snapshot, le miroir gardait l'ancien
  cliché (`announcement: null`) et l'APK n'affichait rien.

**Correctif**

- `electron/sync/sync.service.ts` : `enqueueAnnouncementRefresh()` — un
  `customer_snapshot` par accès mobile **ACTIF** (`revoked_at IS NULL`),
  révoqués exclus, best-effort par client (un échec n'arrête pas les autres).
- `electron/ipc/registry.customers.ts` : appel après
  `ClientAccess.saveAnnouncementAtomic` (la transaction est committée avant la
  lecture du cliché).
- `src/features/settings/SettingsSectionsA.tsx` : message
  « Annonce enregistrée : elle partira à la prochaine synchronisation. »
  (attente réelle, plus de promesse de visibilité immédiate).
- Cadence auto : **inchangée** — `startSyncTimer` vérifie toutes les 60 s
  `isPushDue(intervalMinutes)` et pousse la file `pending` ; le réglage POS
  est actuellement **5 min**. L'APK, lui, récupère à l'ouverture ou au
  tirer-pour-rafraîchir (pas de push serveur vers le téléphone).

**Tests / portes**

- `tests/integration/client-sync-queue.test.ts` (+1) : un snapshot par accès
  actif avec `announcement` = texte saisi ; accès révoqué exclu ; 4/4.
- Prettier OK · ESLint 0 · `tsc -b` 0 · `typecheck:electron` 0 ·
  **vitest 173 fichiers / 1 187 tests, 0 échec** (439 s) · `verify` ✓
  (migrations/domain/fr/encoding/perf/version:check/secret-scan).
- **POS 1.0.4 reconstruit** dans `E:\veloria-build-1.0.4-ann` (Setup +
  Portable), copié dans `release/` ; `release:checksums` et `release:smoke` ✓.
  Hashes : Setup `e6f96ec647ec8b27f4ef5382c1d27fb9d7e1e2872010b3258922a9c1733d473b`,
  Portable `50a733cc54318a09ed6de3b386378b2e422e49151e7740616efa8abd85f6e1b9`.

**À faire côté poste**

1. Installer le **nouveau** `Veloria-PoS-Setup-1.0.4.exe` par-dessus l'ancien
   (même version, installeur reconstruit).
2. Ouvrir Paramètres → Annonce magasin et **réenregistrer l'annonce
   existante** une fois : elle a été saisie avant le correctif, donc elle
   n'est pas dans la file. Les prochaines saisies partent automatiquement.
3. Attendre la prochaine échéance (≤ 5 min) ou « Pousser maintenant » dans
   Miroir Android ; rouvrir l'APK ou tirer pour rafraîchir.
4. Vérifier `Dernière poussée` mise à jour et `lastError = null`.

**Non exécuté** : livraison sur téléphone/ADB, rafraîchissement automatique
de l'APK ouvert (le client ne fait pas de polling en arrière-plan ; à ajouter
côté mobile si demandé).

**Git** : `fix(sync): pousser l'annonce magasin aux clients actifs` +
ce `docs(handoff)`.

## 88) Session 2026-10-31 — Annonces multi-médias + bandeau hero APK (ADR-166)

**Demande** : « إضافة شريط hero أعلى الصفحة الرئيسية تظهر فيه الإعلانات » pour
l'**application client** : annonces optionnelles, **texte ou image**, images
hébergées sur un site gratuit, et « عداد » = **compte à rebours d'expiration**
(4 annonces maximum).

**Décisions (ADR-166)**

- **Migration 0057** `0057_announcements_media_expiry.sql` : reconstruction de
  `announcements` (SQLite n'enlève pas un NOT NULL) — `text` NULLable (1..120
  quand présent), `image_url` NULLable **https ≤ 500** (CHECK), `ends_at`,
  `sort` (0..99), `updated_at`, `CHECK (text IS NOT NULL OR image_url IS NOT
NULL)`. Les lignes 0032 sont copiées telles quelles (échéance NULL = sans
  compte à rebours, toujours valable).
- **Domaine** (`src/domain/customer/client-access.ts`) : texte OU image,
  `ends_at` future obligatoire, **4 actives non expirées maximum** ;
  `assertValidAnnouncementInput`, `assertValidAnnouncementImageUrl`,
  `isAnnouncementExpired`, constantes `CLIENT_ANNOUNCEMENT_ACTIVE_MAX` /
  `CLIENT_ANNOUNCEMENT_IMAGE_MAX`.
- **Repo** (`electron/ipc/handlers/client-access.repo.ts`) : `listAnnouncements`,
  `saveAnnouncementAtomic` = **upsert idempotent** (`id` optionnel,
  `operationId`), `removeAnnouncementAtomic` idempotent par valeur ; plafond
  compté **dans la transaction** (expirées/inactives ne comptent pas) ;
  `getCurrentAnnouncement` supprimé. Mirroir main des bornes du domaine
  (rootDir), messages FR.
- **Cliché** : `buildSnapshotPayload` ajoute `announcements: [{ id, text,
imageUrl, endsAt }]` — actives non expirées, tri `sort ASC, id DESC`,
  `LIMIT 4` — **et conserve** `announcement` (premier texte) pour les APK
  ≤ 1.0.4 déjà installées.
- **IPC** : `announcements.save` (schéma étendu : `id?`, `text?`, `imageUrl?`,
  `endsAt`, `sort`, `isActive`), `announcements.list`, `announcements.remove`
  (`idempotentIdSchema`) ; `announcements.get` retiré. Gardes staff `settings`,
  licence `customers` ; rétention critique `announcements.` (save + remove).
- **POS** : Paramètres → **Annonces du magasin** (`SettingsSectionsA.tsx`) —
  liste (statut Publiée/Expirée/Inactive, échéance, ordre), formulaire
  texte/image avec **aperçu** et repli si l'image casse, `datetime-local`,
  ordre, SwitchRow actif, suppression confirmée, badge « x/4 actives » ;
  rafraîchissement de la file après chaque mutation.
- **APK** : composant **`mobile/src/ui/announcement-hero.tsx`** sous la carte
  « dernière facture » (le bandeau dette reste le héros, ADR-055) — image
  `aspectRatio` 2:1 + texte, **compte à rebours local** recalculé chaque minute
  (aucune écriture retour), pastilles tactiles si plusieurs annonces, repli
  texte si l'image ne charge pas, annonce expirée masquée ; `toHome` parse
  `announcements[]` (entrées corrompues écartées, échéance illisible =
  annonce écartée) avec **repli sur l'ancien champ** `announcement` ; clés
  i18n ar/fr (`announcement`, `expireIn`, `daysShort`, `hoursShort`,
  `minutesShort`).
- **Démo** : `scripts/demo-client-sync-server.mjs` envoie 3 annonces (image
  https, texte, **expirée**) pour la vérification visuelle — la 3e est bien
  masquée.

**Tests / portes**

- `tests/integration/announcement.test.ts` réécrit (9 cas) : aller-retour,
  rejeu d'`operationId`, image seule / texte seul / vide refusé, texte 121 et
  échéance passée refusés, mise à jour, **plafond 4** avec libération par
  expiration, suppression idempotente, contenu/ordre du cliché + champ legacy.
- `tests/unit/mobile-views.test.ts` (+2), `tests/unit/mobile-payload.test.ts`
  (+1), `tests/unit/client-access.test.ts` (frontière Zod), rétention
  (préfixe `announcements.`), snapshot des canaux, `tests/database/*`
  (0057 → 57 fichiers).
- **173 fichiers / 1 194 tests, 0 échec** · ESLint 0 (racine + mobile) ·
  typecheck / typecheck:electron / typecheck:mobile 0 · `verify` ✓
  (migrations 57, domain, fr, encoding, perf, version, secret-scan) ·
  `build` ✓ · `build:electron` ✓ (manifeste signé **244**, v1.0.4).
- **Vérification visuelle** (Expo web `:8083` + serveur de démo `:8099` via le
  navigateur Qoder, capture d'écran indisponible — surface masquée) : image
  `placehold.co` **chargée** (`naturalWidth 800 × 400`), texte arabe +
  « ينتهي بعد 3 يوم 3 ساعة », **2 pastilles** (l'annonce expirée absente),
  bascule vers la 2e annonce (texte seul, « ينتهي بعد 1 يوم 1 ساعة »).
  Serveurs arrêtés après contrôle.

**Non exécuté**

- Reconstruction et installation de l'**APK** : le hero ne sera visible sur un
  téléphone qu'après un nouvel APK (versionCode inchangé pour l'instant).
- Aucun changement Supabase (le payload JSONB est opaque) ; les APK déjà
  installées continuent d'afficher l'ancien champ texte.

**Concurrence** : une autre fenêtre Qoder a livré puis commité le
rafraîchissement périodique (ADR-165, `dd3b2fc`/`9a03cf6`/`dce523f`) pendant
cette session ; l'ADR des annonces a donc été renumérotée **166**.

**Git** : `feat(client): annonces multi-médias avec expiration (ADR-166)`
`1dc3e46` + ce `docs(handoff)`.

## 87 bis) Session 2026-10-31 — Rafraîchissement périodique du client (ADR-165)

**Demande** : « اريد ان تكون المزامنة مع تطبيق العميل بشكل تلقائي حسب الوقت
المختار في البرنامج pos ».

**Décision (ADR-165, commits `dd3b2fc` / `9a03cf6` / `dce523f`)**

- `buildSnapshotPayload` ajoute `syncIntervalMinutes` (5–1440, défaut 15), lu
  dans `app_settings.client_sync` — la cadence choisie dans POS voyage donc
  dans chaque `customer_snapshot` (aucun changement Supabase : JSONB opaque).
- `toHome` expose la valeur (même borne, défaut 15 pour les anciens clichés).
- `App.tsx` démarre un `setInterval` à cette cadence quand une session existe,
  avec **un seul `syncNow` à la fois** (`refreshingRef`) ; le timer est recréé
  quand la cadence change. Retour au premier plan (`AppState = active`) :
  rafraîchissement immédiat. Aucun service d'arrière-plan ni push.
- Version APK : `versionName 1.0.4`, **`versionCode 6`** (l'APK précédent était
  code 5) — même package, même keystore, données SecureStore/SQLite conservées.
- Développement isolé (worktree) pendant la session concurrente ADR-166, puis
  intégré dans la même branche ; l'arbre final contient les deux fonctions.

**Preuves / artefacts finaux (release/)**

- Tests : **173 fichiers / 1 194 tests 0** ; format/lint/typecheck/electron/
  mobile 0 ; `verify` ✓ ; `build` ✓ ; `build:electron` ✓ (manifeste 244) ;
  `release:checksums` + `release:smoke` ✓.
- POS Setup **1.0.4** : 163 554 201 o, SHA-256
  `6bd2ed05235d58366753c14d8be273ca23d8969936f26539a23f01c4b35b9a9c`.
- POS Portable **1.0.4** : 141 685 304 o, SHA-256
  `4a8292fc559441607634f378c5b10e81881926b1c9026ea93dea4a5e3e3e5b7f`.
- APK client **1.0.4 code 6** : 88 726 616 o, SHA-256
  `8dc6078aacc65d9214d3eaa7d5887bef4b42fea665004f04ea3c3d38c52bcc3b`,
  signé CN=Veloria (certificat identique à l'APK code 5, mise à jour acceptée).
- Vérification du bundle APK : `syncIntervalMinutes`, `AppState` et
  `announcement` présents ; `aapt` → package `dz.veloria.client`,
  versionCode **6**, versionName **1.0.4**.

**Reste à faire côté poste**

1. Installer le **POS 1.0.4 final** (Setup `6bd2ed05…`) puis l'**APK code 6**
   par-dessus l'ancien (même signature, données conservées).
2. Le premier cliché doit porter la cadence 5 min : enregistrer une annonce,
   faire une vente/paiement, ou « Synchroniser » la fiche client. Avant ce
   cliché, l'APK utilise 15 min par défaut.
3. Ensuite l'APK se rafraîchit toutes les 5 min **tant qu'il est ouvert** (et
   immédiatement au retour au premier plan) ; aucun push en arrière-plan.
4. L'annonce magasin existante doit être réenregistrée une fois (elle précède
   le correctif session 87) ; les suivantes partent automatiquement.

**Non exécuté** : installation réelle sur téléphone/ADB (le build APK est
signé et vérifié, mais pas installé ici).

## 89) Session 2026-11-01 — Purge des artefacts obsolètes

**Demande** : « قم بحذف كل الملفات القديمة و المحجورة التي لا حاجة لها في
المشروع ». Audit préalable (git propre, `git status` vide) puis suppression
**des seuls fichiers générés/obsolètes** :

- Ancien worktree temporaire `C:\...\Temp\opencode\veloria-csv-run`
  (25 Mo, commit `c30b5c6`, aucune modification en attente) + métadonnées
  `git worktree prune`.
- `E:\veloria-build-final` (817 Mo) — sorties electron-builder déjà copiées
  dans `release/` ; restes `E:\veloria-periodic-build` (worktree isolé),
  `veloria-periodic-stage`, `veloria-periodic-sync-backup-2026-10-31`.
- `mobile/android/app/build` + `mobile/android/build` (420 Mo) — APK final déjà
  copié dans `release/` ; cache `.gradle` (24 Mo) conservé.
- 5 sauvegardes `graphify-out/2026-10-27..31` (60 Mo) ; graphe actif, cache et
  wiki conservés.
- `release/win-unpacked/` et `release/win-unpacked.tmp/` (vides/obsolètes).

**Conservés** : les 4 installateurs 1.0.4, l'APK 1.0.4 code 6, `dist` /
`dist-electron` courants, `node_modules`, `mobile/android/.gradle`, `private/`
(clés et licences), `mobile/veloria-release.keystore`, archives `docs/`,
graphe actif `graphify-out/`.

**Résultat** : aucun fichier suivi supprimé ; `git status` propre ; aucune
source, migration, test ou configuration modifiée. Espace libre sur `E:` :
**62 Mo → 8,0 Go**. Aucun test/build relancé (inutile sans changement de code).

**Git** : ce `docs(handoff)`.

## 90) Session 2026-11-01 — Purge ciblée post-audit (ADR-167)

**Demande** : « قم بفحص المشروع من الأكواد الميتة », puis approbation de la
défense A + déplacement des icônes (les 11 classes CSS restent hors périmètre).

**Audit (lecture seule)** : 392 fichiers de production, ≈1 890 exports, 186
canaux IPC + 192 wrappers, 124 clés i18n, 22 classes CSS, assets, scripts,
dépendances. Méthode : fermeture transitive depuis 11 points d'entrée
d'exécution + index d'imports (barrels `export *` et collisions de noms
résolus, pas une simple correspondance de noms) + carte IPC à trois niveaux.
Résultat : `knip` 0 ; **0 fichier sans importateur** ; **0 export sans aucun
référent** ; **0 canal IPC mort** ; **0 dépendance npm inutilisée** ; **0
script sans référence**. 39 exports test-only : 4 nouveaux (V2 applicatif,
2× `allocateUnitCosts`, `formatDelta`), 35 conservés (ADR-153/W6/parité/
`verify:domain`).

**Corrigé** :

- `src/application/customers/client-access.ts` : copie V2 morte +
  `ACTIVATION_QR_PREFIX_V2` supprimées ; le main exécute
  `client-access.repo.ts:143`, appelé par `registry.customers.ts:175` ;
  `tests/unit/client-access.test.ts` cible désormais la version main.
- `allocateUnitCosts` (domaine + main) supprimés : seuls des tests les
  utilisaient ; la parité porte sur `allocateUnitCostLayers` (exécutée).
- `owner/src/format.ts` : `formatDelta` supprimé (aucun appelant).
- `mobile/src/i18n.ts` : `invoiceNo`, `status`, `invoiceLabel` supprimées
  (124 → 121 clés, ar/fr symétriques).
- `public/icons/icon-1024x1024.png` + `icon-512x512.png` déplacées vers
  `resources/icons-src/` (non empaqueté) : ≈2,2 Mo d'installeur économisés.
- **Réfutation** : les 3 ignores `knip` (`expo-updates` ×2, `net`) ne sont
  pas morts — `expo-updates` est requis par `app.json`, `net` par
  `tests/e2e/helpers.ts`. `config/knip.json` reste inchangé.

**Conservés** (décisions antérieures) : 3 modules de domaine non exécutés au
runtime (215 lignes, références de `verify:domain`, ADR-153), 35 exports
test-only/parité, `pain`/`breadOrders` (ADR-109), `multi-printer` legacy,
objets SQLite morts (ADR-153 lot D), 11 classes CSS mortes (hors périmètre).

**Portes** : format/lint/typechecks (root, electron, manager, mobile, owner) ✓ ;
**173 fichiers / 1 194 tests 0** ; `test:coverage` **93,81 / 89,11 / 98,48 /
96,30** ; `test:coverage:features` **164 fichiers / 1 132 tests**, fonctions
**74,62 %** ; `build` ✓ ; `build:electron` ✓ (manifeste **235**) ; `knip` ✓ ;
`verify` ✓ (migrations, domaine, FR, encodage, perf, version, secret-scan).

**Git** : commit code + ADR, puis ce `docs(handoff)`.
**Non exécuté** : reconstruction des installateurs/APK — les artefacts de
`release/` restent inchangés ; le gain de ≈2,2 Mo s'appliquera au prochain
build. Le manifeste d'intégrité a été re-signé localement (235 fichiers).

## 91) Session 2026-11-01 — APK Native-max (ADR-168)

**Demande** : « اجعل تطبيقات apk native الى اقصى درجة ممكنة ». Choix
explicite : **Native-max sur React Native** (pas de réécriture Kotlin).

**Constat avant** : APK client 1.0.4 = **88 726 616 octets (84,6 MiB)**,
4 ABIs, Dex 25,4 Mo, R8/shrink désactivés, libs non compressées, ML Kit
~18 Mo, permissions audio/stockage/overlay. Owner : aucun projet Android ni
APK.

**Livré — client** :

- `release/Veloria-Client-1.0.4.apk` : **22 677 056 octets (21,6 MiB)**,
  **−74,4 %**.
- ABIs `arm64-v8a` + `armeabi-v7a` uniquement (x86/x86_64 retirés via
  `ndk.abiFilters` ; `reactNativeArchitectures` seul ne filtrait pas le
  packaging des AAR Expo), Dex **9,3 Mo** (R8), libs ARM compressées
  (`expo.useLegacyPackaging=true`).
- Permissions dangereuses retirées : `RECORD_AUDIO` (réintroduite par l'AAR
  `expo-camera`, retirée via `tools:node="remove"`), stockage externe,
  `SYSTEM_ALERT_WINDOW`.
- Signature vendor `CN=Veloria` vérifiée ; SHA-256 APK `8ee498b5…`.
- Ancien APK 4 ABIs conservé : `release/Veloria-Client-1.0.4-4abi-legacy.apk`
  (84,6 MiB).

**Livré — owner** :

- Premier APK : `release/Veloria-Owner-0.1.0.apk` — **18 101 035 octets
  (17,3 MiB)**, 2 ABIs, Dex 7,3 Mo, permissions INTERNET/VIBRATE
  (+ biométrie héritée de SecureStore), signature vendor, SHA-256
  `e720ba19…`.
- Projet natif généré `owner/android` (ignoré par git comme
  `mobile/android`) : R8/shrink/compression/ABIs/signature + correctif
  **Kotlin 1.9.25** (le template résolvait 1.9.24 alors que Compose Compiler
  1.5.15 exige 1.9.25 → `expo-modules-core:compileReleaseKotlin` échouait).
- Env Supabase public gravé via `.env` + variables
  (`ynktschorbwukxovjzcz`) ; `.env` supprimé après build.

**Builds** : `./gradlew assembleRelease` client **27 min 57 s** (après
`clean`), owner **25 min 30 s** (après correction Kotlin) ; `-x lintVital…`
pour éviter ~10 min de lint module par module. `apksigner verify` vert pour
les deux.

**Différé** :

- Scanner QR **ZXing natif** pour retirer ML Kit (~7 Mo ARM) : la caméra/le
  login QR doivent être validés sur appareil réel.
- **New Architecture** : compatibilité Expo SDK 52 à mesurer sur appareil ;
  le build actuel reste Hermes + ancienne architecture.
- **Aucun appareil ADB connecté** : installation, démarrage, scan caméra et
  runtime R8 non testés. Si crash R8 : ajouter le keep correspondant et
  reconstruire.

**Portes** : Gradle client/owner ✓ ; `apksigner` ✓ ; `npm run check` ✓ ;
**`npm test` 173 fichiers / 1 194 tests 0** ; `npm run verify` ✓ (migrations,
domaine, FR, encodage, perf, version, secret-scan) ; `npm run knip` ✓. Aucun
fichier TS modifié → couverture non relancée.

**Installation** : même version client 1.0.4 / code 6 et même signature que
l'ancienne ; installer par-dessus ou désinstaller/réinstaller (le cache local
et le login QR seront à refaire). Owner : package distinct
`dz.veloria.owner`, installable à côté du client.

**Git** : commit natif + ADR, puis ce `docs(handoff)`. Les APK et les projets
natifs générés ne sont pas suivis ; la configuration native locale est
documentée dans ADR-168 (à réappliquer après `expo prebuild --clean`).

## 92) Session 2026-11-01 — Test appareil réel (CPH2235, Android 13)

**Demande** : « جرب التطبيقات على جهاز حقيقي ».

**Appareil** : CPH2235, Android 13 (SDK 33), arm64-v8a, 1080×2400, ADB ;
aucune version Veloria préinstallée (installation propre).

**Installation** : client 1.0.4 (code 6) et owner 0.1.0 (code 1) via
`adb install -r` — succès ; `primaryCpuAbi=arm64-v8a` ; aucun `RECORD_AUDIO`
demandé ; signature vendor (APK vérifiés).

**Client** :

- Démarrage d'activité **332 ms** (après force-stop), écran rendu.
- UI arabe (défaut) et bascule **FR** OK ; RTL/LTR corrects.
- QR : dialog de permission caméra puis **CameraX/ML Kit ouverts**
  (`Camera2CameraImpl ... dz.veloria.client`), cadre de scan affiché ; aperçu
  noir (caméra couverte/obscurité), **aucun crash**.
- Login faux `0550000000` / `123456` : requête réelle au miroir Supabase,
  erreur AR « الهاتف أو الرمز غير صحيح » (et équivalent FR) ; **aucun
  crash**.
- **Non testé** : scan d'un QR réel, login réussi (nécessite un QR/PIN client
  valide), stabilité longue.

**Owner** :

- Démarrage d'activité **328 ms** (après force-stop), écran login FR.
- Login faux `test@example.com` / `wrongpass` : Supabase Auth réel,
  « Adresse e-mail ou mot de passe incorrect. » ; **aucun crash**.
- **Non testé** : tableau de bord (compte propriétaire + liasse publiée).

**Logs** : aucune `FATAL EXCEPTION` pour les deux apps. La seule FATAL du log
est `com.android.commands.svc` (commande ADB `svc power stayon`, refus
`WRITE_SETTINGS` par ColorOS), sans rapport avec les applications.

**Écran** : ColorOS endort l'écran rapidement (ADB USB non chargeant), ce qui
rend certains taps automatisés instables ; tests refaits avec wake/dismiss. Ce
n'est pas un défaut des applications.

**Captures** : `release/screenshots/` — `client-login-ar.png`,
`client-login-fr.png`, `client-qr-permission.png`, `client-qr-scanner.png`,
`client-login-error.png`, `owner-login.png`, `owner-login-error.png`.

**Aucun changement de code** ; APK inchangés. **Git** : mise à jour ADR-168
puis ce `docs(handoff)`.

## 93) Session 2026-11-01 — Diagnostic bandeau hero (client)

**Demande** : « شريط hero غير ظاهر في تطبيق العملاء ».

**Constats** :

- `AnnouncementHero` est présent dans les deux APK (nouveau 22 Mo et ancien
  85 Mo) ; le bundle contient le composant. Ce n'est pas une omission de
  build.
- Le CPH2235 est sur l'écran de **login** (essai téléphone/PIN factice) : le
  hero n'est rendu que dans **Home, après login**, jamais sur l'écran de
  connexion.
- Base POS `E:\data\Veloria POS DB.sqlite` : `schema_migrations` s'arrête à
  **56** (migration 0057 non appliquée). Table `announcements` =
  `id/text/is_active/created_at` seulement, **3 lignes actives identiques**.
  Dernier `customer_snapshot` (outbox id 17, envoyé 2026-10-31 20:30) :
  champ `announcement` texte, **aucune clé `announcements[]`**.
- Le fallback `parseAnnouncements` (champ `announcement`) est testé et doit
  afficher un hero texte après login/refresh ; les images et le compte à
  rebours exigent POS à jour (0057) + ré-enregistrement de l'annonce.
- Le hero est placé après la carte « dernière facture » dans Home (peut être
  sous la ligne de flottaison sur petit écran) ; non déplacé dans cette
  session.

**À suivre** :

1. Se connecter avec un QR client réel sur le téléphone.
2. Pull-to-refresh Home (ou attendre 5 min) : le snapshot du 20:30 contient
   le texte legacy.
3. Mettre POS à jour (migration 0057) et ré-enregistrer l'annonce pour
   obtenir `announcements[]` (image/échéance) et supprimer les doublons.
4. Si le hero reste absent après login/refresh : capture Home ou QR pour
   vérifier le cache/placement ; déplacer le hero en tête si nécessaire.

**Aucun code modifié ; aucun APK reconstruit.** **Git** : ce `docs(handoff)`.

## 94) Session 2026-11-02 — Bootstrap de l'environnement de développement

**Demande** : « قم بدراسة و فهم المشروع بعد ذلك ثبت البرامج و الأدوات اللازمة لتطوير
المشروع » — étudier le projet, puis installer les programmes et outils nécessaires.

**État trouvé** (poste neuf, aucun outillage) :

- **Node.js absent** de tout `C:` et `E:` (seul git était présent, fourni par
  Qoder). `node_modules/` existait pourtant : l'arbre a été **copié** depuis une
  autre machine, et `dist*/` + `release/` contenaient déjà les livrables.
- **Git bloqué** : « detected dubious ownership » (le dépôt appartient au SID du
  compte « zenagui bilal », la session tourne sous `Admin`) et `~/.gitconfig`
  **n'existe pas** → ni `safe.directory`, ni identité, donc règle 10 impossible.
- `mobile/android/local.properties` : `sdk.dir` pointait
  `C:\\Users\\zenagui bilal\\AppData\\Local\\Android\\Sdk` (inexistant ici) ;
  aucun JDK, aucun Android SDK, `graphify` absent du PATH alors qu'`AGENTS.md` et
  les hooks `.claude/settings.json` l'invoquent.

**Installé** (tout en périmètre **utilisateur**, aucun MSI système, admin non
élevé sur le poste) :

| Outil        | Version                                                                                                       | Emplacement                                               | Preuve                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js      | **22.23.4** (engines `>=22.12`, `.nvmrc` = 22)                                                                | `C:\\Users\\Admin\\tools\\node`                           | ZIP officiel, SHA-256 `cbc74b5e…5f20` **contrôlé** contre `SHASUMS256.txt`                                                               |
| npm          | **10.9.9** = `packageManager` exact                                                                           | livré avec Node                                           | `npm ls --depth=0` sans paquet manquant/extrané                                                                                          |
| JDK          | Temurin **17.0.20.1+1**                                                                                       | `C:\\Users\\Admin\\tools\\jdk17`                          | `java -version` + `gradlew --version` (Gradle 8.10.2, Launcher JVM 17)                                                                   |
| Android SDK  | cmdline-tools `13114758`, `platform-tools`, `platforms;android-35`, `build-tools;35.0.0`, `ndk;26.1.10909125` | `C:\\Users\\Admin\\AppData\\Local\\Android\\Sdk` (2,4 Go) | versions lues dans `mobile/android/build.gradle` (`compileSdk 35`, `buildTools 35.0.0`, `ndkVersion 26.1.10909125`) ; licences acceptées |
| Runtime VC++ | **14.44.35211**                                                                                               | `C:\\Windows\\System32`                                   | requis par le binding natif `oxc-resolver` (knip) ; sans lui : `ERR_DLOPEN_FAILED`                                                       |
| graphify     | **0.9.100** (`graphify` + `graphify-mcp`)                                                                     | via `uv tool install graphifyy`, Python **3.12**          | `graphify query "…"` interroge le graphe existant (7 995 nœuds, produit par 0.9.78)                                                      |
| uv           | dernier                                                                                                       | `C:\\Users\\Admin\\tools\\uv`                             | sert à installer les outils Python sans admin                                                                                            |

Environnement persisté côté utilisateur : `PATH` += `tools\\node`,
`tools\\jdk17\\bin`, `.local\\bin` ; `JAVA_HOME`, `ANDROID_HOME`. **Un
redémarrage du terminal (ou de Qoder) est nécessaire** pour que le PATH
utilisateur soit repris — dans cette session chaque commande exportait le PATH.

**Décision sur graphify** : le paquet **npm** `graphify@1.0.0` est une
bibliothèque de graphes mathématiques de **2015** (aucun `bin`) — sans rapport, et
l'installer aurait masqué le vrai outil derrière les hooks
`graphify hook-guard`. Le CLI réel du projet est le paquet **PyPI `graphifyy`**
(0.9.78 ayant généré `graphify-out/`). Son installation par défaut échoue : avec
le Python 3.14 choisi automatiquement, `tree-sitter` veut « Microsoft Visual C++
14.0 or greater » → résolu par `uv tool install --python 3.12 graphifyy`
(wheels précompilés, **aucun compilateur installé**).

**Piège npm reproduit et défait** : `npm --prefix mobile install` (depuis la
racine) **ajoute** `"veloria-pos": "file:.."` aux dépendances de `mobile/` et
`owner/` et réécrit leurs deux lockfiles → 4 fichiers **suivis par git** modifiés
par erreur. Restaurés depuis HEAD (`git restore`), liens symboliques
`*/node_modules/veloria-pos` supprimés, vérifié `git status` propre. Les
`node_modules` de `mobile/` et `owner/` étaient déjà complets (Expo 52.0.49,
RN 0.76.0) : **aucune installation était nécessaire** — la commande correcte, si
besoin, est `cd mobile && npm install`, jamais `--prefix`.

**Portes exécutées sur ce poste** :

- `better-sqlite3` 13.0.3 N-API chargée, SQLite **3.53.4** (aucun compilateur requis).
- `npx electron --version` → **v45.1.0** (Chromium 156 fonctionne sous Windows 10 1809).
- `npm run typecheck` · `typecheck:electron` · `typecheck:manager` ·
  `typecheck:mobile` · `typecheck:owner` → **0**.
- `npm run verify` → migrations **VERIFIED (57)**, domaine ✓, `verify:fr` ✓,
  encodage **0** (980 fichiers), `verify:perf` ✓ (commit vente 9 ms),
  `version:check` ✓ (1.0.4 aligné, Android code 6), `license:scan` ✓ (1 495 fichiers).
- `npm run format:check` → **0** · `npm run lint` (`--max-warnings 0`) → **0**.
- `npm test` → **173 fichiers / 1 194 tests** (1 165 passés au premier passage,
  **5 fichiers en échec transitoire** : `npm install` ré-écrit `node_modules/electron`
  et `path.txt` était absent pendant la lecture ; relancés seuls → **29/29 verts**).
- `npm run build` ✓ · `build:electron` ✓ (manifeste d'intégrité signé **235**
  fichiers, v1.0.4) · `build:manager-client` ✓ · `build:manager` ✓.
- `npx playwright test --list` → **54 tests / 24 fichiers** (aucun navigateur à
  télécharger : l'E2E pilote `_electron`).
- **E2E réel** `navigation-smoke` → **1/1** (25,7 s) : l'application Electron se
  lance, les 16 modules s'ouvrent sans crash, base de test vierge.
- `npm run knip` → **0** (après installation du runtime VC++ ci-dessus).

**Non exécuté ici** : suite E2E complète (~30 min, 1 worker),
`test:coverage` / `test:coverage:features` (mêmes fichiers que `npm test`),
`npm run package:win` / `package:manager`, build APK (`assembleRelease`),
`graphify update .` (aucune source modifiée).

**Fichiers touchés** : `handoff.md` (cette section + §1) et
`mobile/android/local.properties` (`sdk.dir` réaligné sur `Admin` — **git-ignoré**,
régénérable par `expo prebuild`). **Zéro source, zéro migration, zéro canal,
zéro dépendance ajoutée** aux `package.json`.

**Git** : `git config --global --add safe.directory` + identité
`veloria-pos <veloria-pos@localhost>` (convention des commits existants),
`core.autocrlf=false` ; puis ce `docs(handoff)` en commit propre (règle 10).

## 95) Session 2026-11-02 — Jour métier Africa/Algiers (E-35, G-18 — ADR-169)

**Demande.** « اصلح التالي جذريا و اكمل هاته المزايا » sur six constats de
niveau zéro (liasse propriétaire sans publieur, SQL/compte propriétaire non
déployés, migration 0057 non appliquée chez le client donc bandeau hero muet,
`maxDevices` validé mais jamais appliqué, aucune mise à jour, journée calculée en
UTC). Cette session traite le **dernier** — le plus transversal, parce que tous
les agrégats de la liasse propriétaire et toutes les clôtures Z en dépendent.

**Diagnostic mesuré (avant code).**

- Stockage sain : `sales.created_at` & co. sont des instants ISO UTC avec `Z`
  (`new Date().toISOString()`, 92 émissions dans `electron/ipc/registry.*.ts`).
- Découpage faux : **37** `substr(<colonne>, 1, 10)` dans
  `electron/ipc/handlers/` (dont 27 dans `finance.repo.ts`), **13** `date('now')`,
  et les bornes `${from}T00:00:00.000Z` de `history-query.ts`. La journée
  commençait à 01:00 heure d'Alger.
- Verrou de clôture : les 15 triggers de `0048` (recréés pour `sales` par `0051`)
  testaient `substr(NEW.created_at,1,10) = daily_closings.business_date` ⇒ une
  vente de 00:30 (Algiers) sur une journée close passait.
- Affichage (G-18, High/P1) : quatre conventions divergentes coexistaient —
  `Intl.DateTimeFormat("fr-FR")` sans `timeZone` (POS, horloge de l'ordinateur),
  `iso.slice(0,10)` (UTC) dans `mobile/src/format.ts`, getters **locaux** dans
  `owner/src/format.ts`, troncature UTC brute dans `splitDateTime`
  (`src/features/history/types.ts`). Deux dates différentes pour une même vente.
- Aucune abstraction temps n'existait : `todayUtcDate` + 3 copies de
  `isRealCalendarDate` + `nextDay` + `addDays` + `monthStartUtc`, et zéro
  occurrence de `Africa/Algiers` dans tout le code.

**Ce qui a été fait.**

1. **Modules jumeaux** (frontière `rootDir`, parité prouvée) :
   `src/domain/common/business-day.ts` et `electron/shared/business-day.ts`.
   API : `BUSINESS_TIME_ZONE` / `BUSINESS_DAY_OFFSET_MS`, `instantToEpochMs`,
   `businessDayOf`, `todayBusinessDate`, `businessMonthOf`, `businessTimeOf`,
   `businessWallClock`, `addCalendarDays`, `businessMonthStart`,
   `previousBusinessDay`, `nextBusinessDay`, `businessDayRangeUtc`. Côté main en
   plus : `businessDaySql`, `businessWeekSql`, `businessMonthSql`,
   `calendarDaySql`, `calendarWeekSql`, `calendarMonthSql`, `sqlBusinessToday`,
   `sqlBusinessMonthNow`, `businessDaysAgoSql`, `SQL_BUSINESS_DATE_PREFIX`,
   `formatBusinessDateTimeFr`. Une entrée illisible rend `""` (jamais d'exception
   brute, règle 6) et une date irréelle (`2026-13-45`) est refusée par
   `addCalendarDays` au lieu d'être normalisée en `2027-02-15`.
2. **Deux catégories de colonnes, nommées explicitement** : instants →
   `businessDaySql(col)` / `businessDayRangeUtc(jour)` ; date-seule
   (`business_date`, `payment_date`, `expense_date`, `due_date`, `invoice_date`)
   → `calendarDaySql(col)`, **jamais décalée**. Une erreur de catégorie est le
   seul vrai risque du chantier ; les helpers la rendent lisible à la relecture.
3. **Sweep main** : `finance.repo.ts` (Z, dettes, bandes de règlement mensuel,
   rapports, séries jour/semaine, `byBucket(…, instant)`), `dashboard.repo.ts`
   (`Range` étendu à `fromInstant` / `toInstantExclusive`), `debt-status.ts`,
   `history.repo.ts`, `history-query.ts` (`nextDay` supprimé), `expenses.repo.ts`
   (mois métier), `customers.repo.ts` (7 jours), `inventory.repo.ts`,
   `proformas.repo.ts`, `returns.repo.ts`, `client-access.repo.ts` (clé de mois
   des clichés), `fifo.ts`, `purchases.repo.ts`, `sales.repo.ts` (année des
   numéros d'impression), `registry.customers.ts` (`paymentDate` par défaut),
   `sync.service.ts` (`monthKey`), `services/logger.ts` (nom du fichier de log).
4. **Sweep renderer** : `todayUtcDate` et `monthStartUtc` **supprimés** (23
   fichiers migrent vers `todayBusinessDate` / `businessMonthStart` /
   `addCalendarDays`), `presetRange` des Rapports et du Tableau de bord en jours
   métier, `splitDateTime`, `TopBar` (horloge et date épinglées
   `Africa/Algiers`), `formatDateTimeFr` / `formatDateFr`, `sale-ticket.ts`, les
   4 `toLocaleString`, `suggestIntakeInvoiceNumber`, la fenêtre hégirienne de la
   zakat (calcul en jours métier), et l'éditeur d'annonce (`toDateTimeLocal` /
   `fromDateTimeLocal` en heure murale d'Alger, plus celle du poste).
5. **APK** : `mobile/src/format.ts` et `owner/src/format.ts` reçoivent un
   `businessDay(iso)` arithmétique (Hermes-safe) ; `owner` conserve
   `parseInstant` pour les durées (la version décalée aurait faussé « mis à jour
   il y a N min »).
6. **Migration 0058**
   `database/migrations/0058_business_day_closing_lock.sql` : `DROP`+`CREATE`
   des 6 triggers d'instant avec `date(…,'+1 hour')`, les 9 autres inchangés.
   0048/0051 non touchées (règle 12). `verify-migrations.mjs` reçoit sa porte
   (15 triggers, répartition instant / date-seule, vente de 00:30 refusée, vente
   du lendemain acceptée) ; `tests/database/migrations.test.ts` passe de 57 à
   **58** (deux assertions).
7. **Gardes** (`tests/unit/business-day.test.ts`, 18 tests) : jumeaux identiques,
   SQL == JS (`date(col,'+1 hour')`, `%Y-%m`, `%Y-S%W`, `date('now',…)`, bornes
   `[from, toExclusive)`), parité POS / client / owner sur les mêmes instants, et
   **interdiction textuelle** dans `electron/` et `src/` de
   `substr(<instant>,1,10)`, `date('now'` nu, `toISOString().slice(0,10|7)`,
   `todayUtcDate`, `monthStartUtc`. Sans cette garde, la convention se fait
   grignoter au premier `repo` nouveau.
8. **Preuve d'intégration** (`tests/integration/business-day-reports.test.ts`,
   6 tests, base migrée réelle + `node:sqlite`) : la vente de
   `2026-09-01T23:30Z` (00:30 d'Alger) tombe dans le dashboard, les rapports
   (`buckets`), la clôture Z et l'historique du **2** septembre, pas du 1er ; et
   le trigger 0058 refuse une écriture de 00:30 sur une journée du 2 close.

**Pièges rencontrés (utiles pour la suite).**

- `businessDayRangeUtc` a d'abord été écrit `day T23:00Z → day+1 T23:00Z` : la
  journée était décalée **d'un jour entier**. Le bucket croisé SQL vs bornes l'a
  attrapé — c'est le test qui a fait le travail, pas la relecture.
- `SQL_BUSINESS_DATE_PREFIX` est volontairement **ouvrant** (`date('now',
'+1 hour'` sans fermante) pour composer les modificateurs calculés
  (`settlement_day`). Oublier une fermante ne se voit qu'à l'exécution SQL :
  `customer-payment-fifo` l'a signalé (`near "AS": syntax error`).
- Les imports `electron/**` restent **sans extension** (tsc `node10`, sortie CJS)
  alors que `src/**` et les tests emploient `.ts` : un `business-day.ts` importé
  dans un repo main casserait le runtime empaqueté.
- `VALUES (…),(…)` en sous-requête `FROM` n'est pas accepté par `node:sqlite`
  dans ce contexte ; les tests SQL passent par une table de sondage réelle.
- Un poste réglé sur **Europe/Paris** (cet atelier) diffère d'Alger en été : les
  tests qui fabriquaient `new Date(2026, 8, 18)` (minuit local) dépendaient de
  l'horloge machine. Remplacés par des instants ISO explicites.

**Décisions propriétaires prises dans la même demande (à appliquer en session 96+).**

- `maxDevices` reste **informatif** : pas de registre d'appareils (réponse
  « توثيق فقط »). L'ADR que le plan d'audit exigeait en Q15 est à écrire — du
  documentation, pas du code.
- La liasse propriétaire exige de **vraies sessions de caisse** (réponse
  « مزايا صندوق فعلية ») : migration + use cases + IPC + UI avant le publieur.
- Supabase : exécution réelle autorisée (« نفّذ عبر المتصفح/API ») pour
  `cloud/supabase/owner.sql` et la création du compte propriétaire.

**Portes.** `npm run check` **vert** (format, lint `--max-warnings 0`, typecheck
root / electron / manager / mobile / owner) · **vitest 175 fichiers / 1 223
tests 0** · `verify:migrations` **58** avec `OK 0058 verrou de clôture sur le
jour métier Africa/Algiers` · `verify` complet **vert** (domaine, FR, encodage,
perf, version, secret-scan) · `knip` **0**. Quatre tests d'ancienne convention
mis à jour : `history` (bornes), `stock` (numéro de BL), `reports`
(`monthStartUtc` → `currentBusinessMonthStart`), `migrations` (compte 58) ;
`customer-payment-fifo` n'a pas eu à changer une fois la parenthèse SQL réparée.

**Non fait.** `npm run test:e2e` (suite complète, ~30 min),
`npm run test:coverage`, `build` / `package:*` (les cinq autres constats de la
demande restent à traiter), et le rendu sur un téléphone réellement réglé hors
UTC+1 (aucun appareil connecté).

## 96) Session 2026-11-02 — Sessions de caisse (migration 0059 — ADR-170)

**Pourquoi cette session d'abord.** Le constat n°1 de la demande (« لياسّة
المالك غير موجود … تطبيق المالك طبقة عرض فوقパイپلاين فارغ ») ne pouvait pas être
traité directement : `owner/src/store.ts:269-289` exige `money.audit`,
`money.activeSession`, `money.sessions` — donc des **sessions de caisse** (poste,
comptage physique, écart, conformité). Le POS, lui, ne connaissait qu'une
**clôture de journée** (`daily_closings`, migration 0001, une ligne par
`business_date`, solde calculé et jamais confronté à un tiroir). Sans cet
objet, publier une liasse « audit de caisse » aurait voulu dire publier des
chiffres inventés. Choix opérateur explicite : **مزايا صندوق فعلية** — de vraies
sessions, pas une projection de `daily_closings`.

**Tranche verticale livrée (règle 7 : UI → use case → domaine → repo →
migration → test).**

- **Migration 0059** `database/migrations/0059_cash_sessions.sql`, purement
  additive : une ligne par session d'un poste. Gardes en base — `*_minor`
  INTEGER (règle 4), float et comptage ≥ 0, `status ∈ {open, closed}`, et un
  `CHECK` de forme (ouverte ⇒ `closed_at`/`expected_minor` NULL ; fermée ⇒
  `closed_at` + `expected_minor` + `counted_minor` non nuls). **Index partiel
  UNIQUE** `(post) WHERE status='open'` : l'unicité du poste ouvert est décidée
  par la base, pas par l'UI.
- **Domaine pur** `src/domain/cash/session-rules.ts` : `computeSessionExpectedMinor`
  (fond + ventes espèces + encaissements autonomes − dépenses payées −
  remboursements — **la formule du Z**, deux grains), `computeSessionVarianceMinor`
  (signé, jamais borné à 0), `assertCountedMinor`, `sessionConformityPercent`,
  `totalVarianceMinor`. Nouveau code d'erreur `CASH_SESSION_ERROR`
  (`src/domain/common/errors.ts`). Copie main dans le repo (frontière `rootDir`)
  avec parité prouvée.
- **Repo** `electron/ipc/handlers/cash-session.repo.ts` : une transaction par
  mutation + `operationId` idempotent (`claimIdempotency`/`peekIdempotency`/
  `storeIdempotencyResult`), refus FR explicites (« Une session est déjà ouverte
  pour ce poste. », « Cette session de caisse est déjà fermée. », « Comptage
  invalide. »). **Décision comptable** : l'attente est calculée en direct pour
  une session ouverte, puis **figée** à la fermeture (`UPDATE … WHERE status =
'open'`) — une écriture postérieure ne peut pas réécrire l'histoire ; l'écart
  n'est **jamais** stocké. La fenêtre compare des **instants** (`created_at >=
ouvert AND < clôture`) : le tiroir suit l'argent quand il bouge ; le jour
  métier (ADR-169) ne s'applique qu'aux listes (`businessDaySql(opened_at)`).
- **IPC** : 5 canaux explicites `cash.open|count|close|current|list`, validateurs
  dans `validators.finance.ts` (barrel inchangé), handlers dans
  `registry.finance.ts` (l'auteur = `getCurrentStaffUser()`, pas le périmètre
  d'audit), bridge preload, façade `api.cashSession*`, schémas de réponse
  `cashSession{Result,CurrentResult,ListResult}Schema` (+ type exported
  `CashSessionRowView` pour le renderer).
- **Gates** : mutations ajoutées à `LICENSE_PROTECTED_CHANNELS`, page licence
  `reports` pour les 5 canaux, permission staff `closings` — **volontairement**
  aucune nouvelle page de licence ni nouvelle permission : pas de 18ᵉ page dans
  le manifeste, pas de refonte des rôles, pas de compteur de modules E2E à
  revoir.
- **UI française** `src/features/reports/CashSessionsSection.tsx`, rendue dans
  Rapports juste après « Clôtures journalières (Z) » : ouverture (poste, libellé,
  fond), comptage physique, fermeture avec confirmation (l'attente est figée),
  table Poste / Libellé / Ouverture / Fond / Attente / Comptage / Écart / État,
  pied de carte qui rappelle la formule et l'écart net de la période.
  `cash.current` est justifié par la pratique : une caisse ouverte **hier** doit
  être fermable **aujourd'hui** même si la période filtrée ne couvre pas
  l'ouverture.

**Inventaires gelés (la procedure documentaire de l'ADR-130/153).**

- `tests/unit/__snapshots__/ipc-channels.json` : 185 → **190** canaux.
- `validators-inventory` : 125 → **129** schémas.
- `bridge-shape` G-05 : 134 → **138** exports de validation consommés.
- `operation-id-coverage` : total 125 → **129**, et `cashSession{Open,Count,Close}Schema`
  ajoutés à `REQUIRED_NAMES` (`cashSessionListSchema` est une lecture sans
  jeton).
- `tests/database/migrations.test.ts` : 58 → **59**, dernière version `^0059_`.

**Pièges d'atelier (à ne pas refaire).**

- **Collision d'`operationId` dans les tests.** Un helper `OP(seed)` qui
  fabriquait un UUID en prenant les 8 premiers caractères de la graine, puis sa
  version hex, a fait rejouer l'opération d'une **autre** session : trois tests
  « rouges » qui accusaient à tort le repo. Leçon : tout `operationId` de test
  doit être haché **en entier** (`sha256(graine)`), sinon l'idempotence —
  littérale sur `operation_id` — masque ou duplique une écriture.
- **`parseDzdInputStrict` LÈVE, il ne rend pas `null`** (contrairement à
  l'usage que j'en avais fait d'abord) : `try/catch` + message FR côté
  formulaire, sinon `@typescript-eslint/no-unnecessary-condition` tombe sur la
  comparaison à `null` et, surtout, l'erreur brute remonterait à l'écran.
- **`(tx as unknown as () => void)()`** : le motif historiquement copié depuis
  `finance.repo.ts` est jugé « assertion inutile » par le lint moderne — un
  `tx()` suffit dans ce repo. La copie d'un motif daté se paie en lint rouge.
- Un composant neuf doit être **branché** (import + rendu) : `cashSessionCurrent
ResultSchema` seul, non consommé, a fait rougir `knip` — la réponse correcte
  était de l'utiliser (session active hors période), pas de le garder mort.

**Portes.** `npm run check` **vert** (format, lint 0, typecheck ×5) · **vitest
177 fichiers / 1 242 tests 0** · `verify:migrations` **59** avec
`OK 0059 sessions de caisse (poste unique ouvert, forme, bornes)` · `verify`
(domaine/FR/encodage/perf/version/secret-scan) **vert** · `knip` **0**.

**Non fait / à reprendre.**

- La carte n'a pas été **vue** dans l'application réelle : `npm run test:e2e`
  (suite ~30 min) et `test:coverage` toujours reportés depuis §94.
- **Le publieur de liasse (session 97)** : `publishOwnerSnapshot` reste à écrire
  — il a maintenant ses sources (`getCashAuditSummary` + les repos de lecture
  existants), sachant que `sync_outbox.kind` (CHECK de 0032, autoritaire) ne
  peut PAS accueillir une liasse ⇒ `POST /rest/v1/owner_snapshots` direct.
- Champs de la liasse toujours sans source SQL : `objectiveMinor`, aging
  `d0to30/d31to60/d60plus`, `lateDays`, `sold30/perDay/autonomyDays/
suggestedRestock/deadCount/lossPerDayMinor`.
- `maxDevices` : décision opérateur « توثيق فقط » — ADR à écrire, pas de code.

**Git** : commit `feat(cash)` (migration + domaine + main + IPC + UI + tests +
ADR-170 + index) puis commit `docs(handoff)` séparé (règle 10), arbre sinon
propre (`release/`, `graphify-out/`, `test-results/` non suivis).

## 97) Session 2026-11-02 — `maxDevices` : mention contractuelle, non appliquée (ADR-172)

**Cadre.** La liste « niveau zéro » de la demande décrivait `maxDevices` comme une
**théorie de revenus** (« ترخيص واحد يُستخدم على أي عدد من الأجهزة »). Question
posée en début de session (modèle d'application : registre au moment de l'émission
/ contrôle cloud / documenter seulement) → réponse opérateur : **« توثيق فقط »**.
Cette session écrit donc ce que l'audit de 2026-10-19 devait déjà produire et n'a
jamais produit : l'**ADR** exigé par la décision **Q15 (ب)** du plan
(`docs/reports/FULL_AUDIT_2026-10-19_PLAN.md:529`), qui clos le finding **G-17**
(`docs/reports/FULL_AUDIT_2026-10-19.md:1187` — Medium, PROUVÉ, « décision »).

**Preuves techniques consignées dans l'ADR (tout relue dans le code).**

- Validation sans application : le contrôle d'entier 1-99 est dans
  `assertPayloadShape` (`electron/licensing/protocol.ts:205-210`), or l'ordre de
  `verifyLicenseChain()` (`:291-327`) est forme → signature → statut → produit →
  empreinte → dates, et **ne lit jamais `maxDevices`**.
- Chaîne morte côté POS : `license-service.ts:291` recopie le champ dans
  `LicenseStatus`, quatre canaux `license.*` le renvoient,
  `src/features/license/use-license.ts:23,89,98,112` le type — **aucun
  affichage, aucune comparaison** (`LicenseScreen.tsx:126-149`,
  `LicenseBadge.tsx` : zéro occurrence).
- Côté vendor : `licenses.hardware_fingerprint` est **unique** par ligne
  (`license-manager/db/manager-db.ts:21-46`), `rebindFingerprint()`
  (`license-manager/ipc/licenses.ts:159-164`) fait un `UPDATE` qui **écrase** ;
  `license_events` est un journal, pas un registre. `signing.ts:227` **omet**
  `maxDevices` s'il n'est pas un nombre (la licence locale du dépôt n'a donc pas
  le champ).
- Le format `.vlic` ne peut pas porter un parc : une seule empreinte signée
  par fichier (`protocol.ts:30`).
- Aucun concept d'appareil dans `cloud/supabase/**`, l'APK client ni l'APK owner.

**Décision écrite (ADR-172), en six points** : mention contractuelle sans garde
technique à aucun étage ; la protection réelle est la **liaison matérielle**
(`deviceBinding=true` ⇒ `INVALID_HARDWARE`, changement de machine par réémission
`transfer`) ; un client de N postes reçoit **N licences liées**, pas une
flottante à `maxDevices = N` ; `deviceBinding=false` = exception sous suivi
contractuel, résidu accepté ; **pas de registre, pas de compteur, pas de
rapport d'activation** — les raisons (offline doctrine ADR-025/023, format
signé à redéfinir `schemaVersion` 2, verrou local contournable qui punit les
clients légitimes) sont écrites ; le dépassement relève de la régularisation
commerciale, pas du code.

**Textes corrigés (la promesse fausse disparaît).** « appliqué à l'émission »
→ « **non appliqué** (ni à l'émission ni au POS) — mention contractuelle,
ADR-172 » dans `docs/licensing/CAPABILITIES.md` (tableau des champs **et** §9
Device binding, enrichi de la règle d'émission N postes = N licences),
`docs/licensing/LICENSE_FORMAT.md`, `docs/licensing/HARDWARE_FINGERPRINT.md`.
Dans le Manager (`license-manager/renderer/App.tsx`, **textes uniquement**) :
placeholder « Ex. : 1 (mention contractuelle, non appliqué) », message de
validation allégé de l'implicite « vide = 1 poste », et ligne de détail devenue
« Licence liée à ce poste — parc convenu : N (mention contractuelle, non
appliqué) » / « Licence flottante (non liée à une machine) ».

**Aucun** fichier de `electron/licensing/**`, `src/features/license/**` ni
`database/migrations/**` n'a été touché : la chaîne de vérification est
strictement identique, seule sa documentation change.

**Portes (ciblées, ce poste).** `npx tsc -p tsconfig.manager.json --noEmit` **0**
· `npx eslint license-manager --max-warnings 0` **0** · prettier **vert** sur les
4 documents · `npx vitest run tests/unit/license-manager.test.ts` **12/12** ·
`npm run build:manager` **vert** ·
`env -u ELECTRON_RUN_AS_NODE npx electron ./scripts/licensing/verify-licensing.cjs`
→ **VÉRIFICATION LICENSING OK**, 2 avertissements attendus (aucune clé privée
stockée par le Manager sur ce poste ; `private/Veloria-POS-LOCAL.vlic` liée à un
autre matériel ⇒ `INVALID_HARDWARE`, exactement la garde décrite au §2 de l'ADR).

**Reste ouvert (documenté, pas oublié).** Le risque résiduel est écrit : une
licence flottante partagée n'est pas bloquée. Si un jour la protection doit être
réelle, il faudra un canal d'activation en ligne **ou** un format signé `v2` avec
liste d'empreintes — donc un ADR qui **abroge** celui-ci (noté dans « Statut »).
`docs/INDEX.md` doit recevoir la ligne ADR-172 (ajoutée au commit suivant, avec
la ligne ADR-171 du publieur de liasse).

## 98) Session 2026-11-02 — Liasse de supervision publiée par le POS (ADR-171) + audit Supabase

**Pourquoi maintenant.** Constat n°1 de la demande : le publieur n'existe pas,
l'application Owner est une vitrine au-dessus d'un pipeline vide. Mesure
confirmée : `publishOwnerSnapshot` absent de `electron/` et `src/` (seulement
cité dans ADR-162 et ici), alors que le contrat est intégralement écrit et consommé
(`owner/src/store.ts:269-289`, `owner/src/api.ts:137-192`, portique
`isSnapshotShape`, 9 écrans). ADR-170 (sessions de caisse) avait été placé devant
pour la même raison : le bloc `money.audit`/`money.sessions` n'avait aucune
source.

**Ce qui a été livré.**

1. **Constructeur** `electron/sync/owner-snapshot.ts` : `buildOwnerSnapshot(now)`
   produit le contrat v1 en **réutilisant** les repos de lecture du POS
   (`getDashboardSummary`, `listClosings`, `getCashAuditSummary`,
   `getActiveCashSession`, dépenses, stock) et en n'écrivant que les lectures
   strictes qui n'existaient nulle part : dettes par débiteur avec seaux
   `d0to30/d31to60/d60plus` + `lateDays` + dernier versement + factures, rotation
   30 jours (`sold30`, `perDay`, `autonomyDays`, `suggestedRestock`), `deadCount`,
   mouvements par produit. Le contrat est **jumelé** (le workspace `owner/`
   n'est pas importable depuis `electron/` — frontière `rootDir`), et sa forme est
   prouvée par le test d'intégration.
2. **Publication** `publishOwnerSnapshotAtomic` dans `sync.service.ts` :
   `POST` append-only vers `ownerSnapshotsUrl(...)`, corps
   `[{ shop_key:"veloria", payload, generated_at }]`, en-têtes `service_role` du
   miroir. Idempotence par `operationId` (`claimIdempotency` + résultat mémorisé) :
   un rejouement n'insère **pas** une seconde liasse. Portées sur le **doc
   persisté** (miroir actif + URL + clé, et `ownerEnabled`) — la validation du
   registre refuse déjà « liasse activée sans miroir » à l'enregistrement, mais un
   doc altéré (miroir coupé après coup) doit rester refusé **ici**, en français,
   sans émettre de requête. Le détail serveur (JSON/anglais) va au log ; seule la
   phrase FR est persistée dans `lastOwnerError`.
3. **Cadence** : `ownerEnabled` (défaut **OFF**) + `ownerIntervalMinutes` (60,
   bornes 15-1440) dans le doc `client_sync` (DPAPI), `isOwnerPushDue` évalué par
   le timer 60 s existant en best-effort. Aucun blocage possible d'une vente ou de
   la fermeture. Bouton « Publier maintenant » + groupe dédié dans
   Paramètres → Miroir Android.
4. **IPC** : un seul canal nouveau `sync.pushOwnerSnapshot` (mutation ⇒
   `operationId` requis), mêmes gardes licence/staff que `sync.pushNow`, réponse
   `{ published, chars, generatedAt, lastOwnerPushAt }` — **jamais** la liasse ni
   un secret vers le renderer.
5. **Bornes et honnêteté des données** : `MAX_STOCK_PRODUCTS 120`,
   `MAX_MOVEMENTS_PER_PRODUCT 8`, `MAX_JOURNAL_ROWS 60`, `MAX_TX_LINES 20`,
   `MAX_DEBTORS 60`, `MAX_INVOICES_PER_DEBTOR 10`, `MAX_CLOSED_SESSIONS 60`,
   `MAX_EXPENSE_ROWS 60`, `MAX_STOCK_ALERTS 40`, `MAX_DEBT_ALERTS 20`, garde
   `MAX_LIASSE_CHARS 900_000` (refus FR plutôt que publication obèse). Champs sans
   source = `null` (`objectiveMinor`, `Debtor.manager`), dérivations documentées
   (`segment`, libellés d'unité, `movementKindFr`, sentinelle d'autonomie à la
   place de `Infinity`).

**Audit Supabase (le point n°2 de la demande), et ses corrections.**

| Contrôle                                                             | Verdict                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `owner.sql` appliqué (table + index + RLS + politique + révocations) | **fait dans la session** — « Success. No rows returned », puis `relrowsecurity=true`, politique `owner_snapshots_read:SELECT:authenticated`                                                                                                                                                                                                                                                                |
| `anon` sur `owner_snapshots`                                         | **refusé**, prouvé par HTTP réel (`42501 permission denied`)                                                                                                                                                                                                                                                                                                                                               |
| `client_payloads.kind` vs liste 0032                                 | **conforme** (`announcement` et `access_revocation` présents) ⇒ rien ne bloquera les annonces après rebuild                                                                                                                                                                                                                                                                                                |
| Miroir client                                                        | `client_access` 6 lignes (6 actives), `client_payloads` 36, dernière 2026-11-01T20:35Z                                                                                                                                                                                                                                                                                                                     |
| Vue `latest_client_payloads`                                         | **dérive corrigée** : `security_invoker` absent → `ALTER VIEW … SET (security_invoker = true)`, recontrôlé dans `pg_class.reloptions`                                                                                                                                                                                                                                                                      |
| Edge Function `client-sync`                                          | déployée (2 jours), répond `401 AUTH_ERROR "Téléphone ou code incorrect."` ⇒ `verify_jwt=false` effectif, contrôle PIN à l'intérieur                                                                                                                                                                                                                                                                       |
| **Inscriptions Auth**                                                | **faille réelle fermée** : `Allow new users to sign up` était à `true` avec une politique qui donne `SELECT` à tout `authenticated` ⇒ n'importe qui pouvait créer un compte et lire toute la liasse (caisse, stock, dettes). Fermé + sauvegardé + vérifié fonctionnellement (`POST /auth/v1/signup → 422 signup_disabled`). Anonymes `false`, confirmation d'e-mail `true`, provider téléphone `DISABLED`. |
| Compte propriétaire                                                  | **existait déjà** : `zenaguibilal2@gmail.com`, confirmé le 2026-10-31. La mention « compte jamais créé » du handoff (§85/§86) était **périmée** — corrigée ici.                                                                                                                                                                                                                                            |
| `owner_snapshots`                                                    | 0 ligne — normal, aucun POS reconstruit n'a encore publié                                                                                                                                                                                                                                                                                                                                                  |

**Base réelle du client migée** (accord explicite de l'opérateur) : sauvegarde
`VACUUM INTO` → `E:\data\backups\avant-migrations-atelier-2026-11-02T04-36-37-375Z.vposdb`
(3 341 056 octets) puis 0057 + 0058 + 0059 appliquées sur
`E:\data\Veloria POS DB.sqlite` : `schema_migrations` max **59**,
`announcements = id,text,image_url,is_active,ends_at,sort,created_at,updated_at`,
`cash_sessions` présente, 6 triggers avec `+1 hour`, `integrity_check=ok`,
0 violation FK, **59/59 empreintes identiques aux fichiers** (la garde
anti-dérive de l'app acceptera la base), 1 165 ventes / 95 clients / 5 annonces
conservées. C'est le prérequis du bandeau hero (§93) : sans 0057, le POS
n'émettait pas `announcements[]`.

**Reprise après deux échecs de délégation.** Les deux agents lancés sur cette
tranche ont été coupés (limite de tours, 173 et 174 appels) en laissant la
moitié du câblage. Choix : **reprendre en main** plutôt que relancer une
troisième fois. Ce qui a dû être corrigé : 2 erreurs de typage dans le test
d'intégration (`SQLInputValue` sur un `unknown`, `run(...)` avec `undefined`),
19 erreurs de lint (`require-await` sur les transports factices → helpers
`okReply`/`errReply` non-async, `??` superflus, `void` inutile sur un paramètre
mort — supprimé, `toThrowError` déprécié, chaîne optionnelle sur une valeur non
nul), et un `repoDb.current` possiblement `null` après le retrait du `?.`.
Le code du constructeur et du service n'a **pas** été réécrit : il était bon,
ses tests passent.

**Portes.** `npm run check` **vert** · `npx vitest run` **180 fichiers /
1 274 tests 0** (32 tests de la tranche : protocole 12, publication 7, liasse sur
base migrée 13) · `npm run verify` **vert** (migrations 59, domaine, FR-only,
encodage, perf, version, `secret-scan` 1 521 fichiers) · `npm run knip` **0**.
Inventaires gelés : canaux **191**, schémas 125→**130**, exports de validation 134→**139**,
`operationId` requis +1 (`sync.pushOwnerSnapshot`).

**Non fait / à reprendre.** (1) Les quatre constructions d'artefacts demandées
(POS, License Manager, client, owner) + suppression des anciennes — session 99.
(2) `npm run test:e2e` et `test:coverage` toujours reportés depuis §94.
(3) Boucle réelle POS → cloud → APK : le relais E2E émule la publication, mais
aucun poste marchand n'est couplé à ce projet depuis cet atelier.
(4) Rétention de `owner_snapshots` à trancher avant toute cadence plus courte.
(5) Durcissement de la politique par `auth.uid()` — proposé, non décidé.

**Git** : un commit `feat(sync)` (constructeur + service + IPC + UI + relais +
tests + ADR-171 + INDEX) puis le `docs(handoff)` de cette session ; la base de
données réelle n'est pas versionnée, sa sauvegarde vit dans `E:\data\backups`.

## 99) Session 2026-11-02 — Quatre constructions d'artefacts + retrait des anciennes

**Demande.** « قم بالبناءات الاربعة » (POS, License Manager, client, owner) après
les corrections de fond, « et supprimer les anciennes versions ».

**Livrables dans `release/` (tous régénérés depuis la tête `chore/root-layout`).**

| Artefact                                               | Taille      | Vérification                                                    |
| ------------------------------------------------------ | ----------- | --------------------------------------------------------------- |
| `Veloria-PoS-Setup-1.0.4.exe` (+ blockmap)             | 161 357 232 | NSIS, `SHA256SUMS.txt`                                          |
| `Veloria-PoS-Portable-1.0.4.exe`                       | 139 450 353 | `SHA256SUMS.txt`                                                |
| `Veloria-License-Manager-Setup-1.0.4.exe` (+ blockmap) | 144 414 971 | `SHA256SUMS.txt`                                                |
| `Veloria-License-Manager-Portable-1.0.4.exe`           | 130 658 302 | `SHA256SUMS.txt`                                                |
| `Veloria-Client-1.0.4.apk` (+ `.sha256`)               | 22 677 268  | signateur vendor `c190b12a…`, versionCode 6, sha256 `706f1371…` |
| `Veloria-Owner-0.1.0.apk` (+ `.sha256`)                | 18 101 439  | même certificat vendor, sha256 `b8b2d315…`                      |

**Preuve du point n°3 (bandeau hero) dans le paquet, pas seulement dans le code** :
`release/win-unpacked/resources/database/migrations` (staging du build POS) alignait
`0057_announcements_media_expiry.sql`,
`0058_business_day_closing_lock.sql`, `0059_cash_sessions.sql` ⇒ un poste installé
avec cet installateur migre sa base au démarrage (la sienne était restée à 56) et
peut donc pousser `announcements[]` avec `imageUrl`/`endsAt`. Le portable et
l'installateur étaient absents d'artefact 0057 (build du 31/10, antérieur à la
migration) — c'était la cause réelle du hero muet signalé en §93.

**Deux pannes de build, et leur vraie cause (à retenir).**

1. `npm run package:manager` a échoué **deux fois** sur
   `EBUSY: resource busy or locked, unlink '…\release\win-unpacked.tmp\resources\default_app.asar'`
   (après cinq `EPERM: operation not permitted, rename win-unpacked.tmp →
win-unpacked`). Première hypothèse — la concurrence avec le build Gradle lancé
   en parallèle — **fausse** : la reproduction à vide l'a invalidée, et un
   répertoire de sortie neuf (`release-mgr`) a échoué à l'identique. Cause retenue :
   **l'indexation du workspace sur `E:`** (le dépôt est la racine de travail de
   l'atelier) ouvre et retient `default_app.asar` dès qu'electron-builder l'écrit,
   ce qui bloque à la fois le renommage du staging et sa suppression.
   **Contournement appliqué** : `--config.directories.output=C:/veloria-build/manager`
   (hors espace de travail) puis copie des `.exe`/`.blockmap` dans `release/` —
   `REAL_EXIT=0`. À réappliquer pour tout futur `package:*` sur ce poste, ou
   exclure `release/` de l'indexeur.
2. **Le code de sortie était masqué** : mes commandes de build se terminaient par
   `tail`, donc `$?` reflétait `tail` et la notification annonçait « exit 0 » sur
   un build mort. Corrige en capturant `code=$?` et en écrivant `REAL_EXIT=$code`
   dans le journal — c'est ce qui a révélé l'échec du premier Manager.

**Temps mesurés.** POS (scan secrets → builds → intégrité → electron-builder) ≈
7 min · Manager ≈ 6 min (après contournement) · `assembleRelease` client **29 min
09 s** · owner **10 min 47 s** (incrémentiel, `build/` conservé, `-x
:app:lintVitalRelease` per ADR-168).

**Portes avant mise en ligne.** `npm run release:smoke` **vert** (main/preload des
deux paquets, preloads sandbox-sûrs, `dist-*/package.json` `{type: commonjs}`,
`dist-license-manager/integrity-manifest.json` présent) · `npm run
release:checksums` **régénéré** (4 exes) · `apksigner verify` **vert** sur les deux
APK, certificat `CN=Veloria` (`c190b12a…`, celui documenté en ADR-168) ·
`npm run check`/`vitest`/`verify`/`knip` déjà passés au commit `1e278ca`
(180 fichiers / 1 274 tests).

**Nettoyage.** `release/_avant-rebuild-2026-11-02/` (595 Mo, ancienne série)
**supprimé** sur demande explicite, après pose et vérification des nouveaux
artefacts. Conservation volontaire : `Veloria-Client-1.0.4-4abi-legacy.apk`
(88 Mo), le filet de retour arrière institué par ADR-168 — à supprimer sur mot
dit. `release/win-unpacked`/`win-unpacked.tmp` (staging, non livrés) restent
**verrouillés** par l'indexeur : supprimables dès que le handle est libéré
(redémarrage de l'atelier ou exclusion du dossier), sans consequence sur les
livrables. `C:\veloria-build` nettoyé. Espace libre `E:` : 15 Go.

**Anomalie de contrat découverte en route (à trancher).** `owner/` est **hors du
contrat de version** : `scripts/release/version.mjs` ne cible que
`package.json`/lock, `mobile/package.json`+lock, `mobile/app.json`,
`mobile/android/app/build.gradle` et la littérale `appVersion` de
`mobile/src/App.tsx`. L'app Owner reste donc à `0.1.0`/**versionCode 1** — le même
code que l'APK déjà diffusé, alors qu'ADR-161 exige un `versionCode` **strictement
croissant** pour une mise à jour par-dessus. L'installation locale (`adb install
-r`) passe, mais l'absence de progression casse la règle et endort
`version:check`, qui valide pourtant la suite au vert. Correction proposta à
valider : ajouter `owner/{package.json,app.json,android/app/build.gradle}` aux
cibles de `version:set`/`version:check` (et décider 0.1.0 → 1.0.4 ou un
`versionCode` 2). Non fait ici : ce sont des fichiers suivis, et changer
silencieusement un numéro de version publié mérite un accord.

**Reste ouvert (hérité des sessions 95-98).** `npm run test:e2e` complet et
`npm run test:coverage` (reportés depuis §94) ; `test:e2e:installer` (viendra
vérifier l'installateur NSIS maintenant reconstruit) ; rétention
`owner_snapshots` ; durcissement de la politique par `auth.uid()` ;
`objectiveMinor`/`Debtor.manager` (produit + colonne) ; boucle réelle
POS → cloud → APK (jamais exercisée depuis cet atelier, relais E2E seulement).

**Git** : ces artefacts ne sont pas versionnés (`release/` ignoré) ; ce
`docs(handoff)` porte la session 99, arbre par ailleurs propre.
